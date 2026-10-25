import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json"}});
async function sha256Hex(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function esc(v:any){return String(v??"").replace(/[&<>"']/g,(m)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"} as any)[m]);}
function localParts(){const parts=new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",weekday:"short",hour12:false}).formatToParts(new Date());const g=(t:string)=>parts.find(p=>p.type===t)?.value||"";return{date:`${g("year")}-${g("month")}-${g("day")}`,hour:Number(g("hour")||0),weekday:g("weekday")};}

Deno.serve(async(req)=>{try{
  if(req.method!=="POST")return json({ok:false},405);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:settings}=await db.from("bot_settings").select("*").eq("id",true).maybeSingle();
  const tokenHeader=req.headers.get("x-cron-token")||"";
  if(!tokenHeader||await sha256Hex(tokenHeader)!==String(settings?.cart_recovery_token_hash||""))return json({ok:false},401);
  const {data:cred}=await db.from("bot_credentials").select("bot_token,bot_username").eq("id",true).maybeSingle();
  const token=String(cred?.bot_token||"");if(!token)return json({ok:false,error:"bot not configured"},503);
  async function tg(method:string,body:Record<string,unknown>){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const x=await r.json();if(!r.ok||!x?.ok)throw new Error(x?.description||method);return x.result;}
  async function sent(userId:string|null,key:string,subject="",stage=""){let q=db.from("automation_deliveries").select("id").eq("automation_key",key).eq("subject_key",subject).eq("stage",stage).limit(1);q=userId?q.eq("tg_user_id",userId):q.is("tg_user_id",null);return Boolean((await q.maybeSingle()).data);}
  async function mark(userId:string|null,key:string,subject="",stage="",payload:any={}){await db.from("automation_deliveries").insert({tg_user_id:userId,automation_key:key,subject_key:subject,stage,payload});}
  async function canPromo(userId:string){if(!contactable(userId)||!promoWindowOpen())return false;const cap=Math.max(1,Number(settings?.promo_frequency_cap_7d||3));const minHours=Math.max(6,Number(settings?.promo_min_hours_between||12));const keys=["vip_upgrade","winback","new_drop","cross_sell"];const since7=new Date(Date.now()-7*86400000).toISOString();const {count}=await db.from("automation_deliveries").select("id",{count:"exact",head:true}).eq("tg_user_id",userId).in("automation_key",keys).gte("delivered_at",since7);if(Number(count||0)>=cap)return false;const {data:last}=await db.from("automation_deliveries").select("delivered_at").eq("tg_user_id",userId).in("automation_key",keys).order("delivered_at",{ascending:false}).limit(1).maybeSingle();if(last?.delivered_at&&Date.now()-new Date(last.delivered_at).getTime()<minHours*3600000)return false;return true;}
  async function event(userId:string|null,type:string,opts:any={}){await db.from("growth_events").insert({tg_user_id:userId,event_type:type,product_id:opts.productId||null,content_set_id:opts.setId||null,source:String(opts.source||"automation"),meta:opts.meta||{}});}
  // Cache active entitlements once per run to avoid one REST request per scored user.
  const ownedSetsByUser=new Map<string,Set<string>>();
  async function ownedSetIds(userId:string){return ownedSetsByUser.get(userId)||new Set<string>();}
  const {data:sets}=await db.from("content_sets").select("id,title,product_id,created_at,products(id,title,price_stars,price_ton,active,kind,delivery_payload)").eq("status","active").order("created_at",{ascending:false});
  const activeSets=(sets||[]).filter((s:any)=>s.products?.active);
  async function recommend(userId:string){const owned=await ownedSetIds(userId);return activeSets.find((s:any)=>!owned.has(s.id))||null;}
  async function bonusSet(userId:string){const owned=await ownedSetIds(userId);return [...activeSets].sort((a:any,b:any)=>Number(a.products?.price_stars||0)-Number(b.products?.price_stars||0)).find((s:any)=>!owned.has(s.id))||null;}
  async function grantBonus(userId:string,set:any,source:string){const {data:exists}=await db.from("content_access").select("id").eq("tg_user_id",userId).eq("content_set_id",set.id).eq("status","active").maybeSingle();if(!exists)await db.from("content_access").insert({tg_user_id:userId,content_set_id:set.id,status:"active",source,expires_at:null});}
  const {data:scores}=await db.from("customer_growth_scores").select("*").limit(2000);
  const {data:users}=await db.from("tg_users").select("id,telegram_id,first_name,referral_code").limit(2000);
  const userMap=new Map((users||[]).map((u:any)=>[u.id,u]));
  const scoredUserIds=[...new Set((scores||[]).map((s:any)=>String(s.tg_user_id||"")).filter(Boolean))];
  // Fetch current active entitlements in bounded batches; do not change or grant access here.
  for(let i=0;i<scoredUserIds.length;i+=200){
    const batch=scoredUserIds.slice(i,i+200);
    const {data:accessRows,error:accessError}=await db.from("content_access").select("tg_user_id,content_set_id").eq("status","active").in("tg_user_id",batch);
    if(accessError)throw accessError;
    for(const row of accessRows||[]){
      const id=String(row.tg_user_id);
      if(!ownedSetsByUser.has(id))ownedSetsByUser.set(id,new Set<string>());
      ownedSetsByUser.get(id)!.add(String(row.content_set_id));
    }
  }
  // Nur Fans mit bestätigter 18+/Einwilligung dürfen proaktiv kontaktiert werden.
  // Der Webhook speichert den jeweils aktuellen Zustand als letzte action_log-Zeile.
  const {data:onboardingLogs}=await db.from("action_log")
    .select("tg_user_id,meta,created_at")
    .eq("action","telegram_onboarding")
    .order("created_at",{ascending:false})
    .limit(10000);
  const onboardingMap=new Map<string,any>();
  for(const row of onboardingLogs||[]){
    if(onboardingMap.has(row.tg_user_id))continue;
    try{onboardingMap.set(row.tg_user_id,JSON.parse(String(row.meta||"{}")));}catch{onboardingMap.set(row.tg_user_id,{});}
  }
  function contactable(userId:string){
    const state=onboardingMap.get(userId);
    return Boolean(state?.ageVerified&&state?.consent&&!state?.optedOut);
  }
  function promoWindowOpen(){
    const hour=new Date().toLocaleString("en-US",{timeZone:"Europe/Berlin",hour:"2-digit",hour12:false});
    const h=Number(hour);
    return h>=8&&h<22;
  }
  const stats:any={vipUpgrade:0,winback:0,newDrop:0,crossSell:0,referralTier:0,vipRetention:0,reports:0,alerts:0};

  const now=Date.now(),monthKey=new Date().toISOString().slice(0,7);
  const winDays=String(settings?.winback_days||"14,30,60").split(",").map((x:string)=>Number(x.trim())).filter((x:number)=>x>0).sort((a:number,b:number)=>a-b);
  for(const s of scores||[]){
    const u:any=userMap.get(s.tg_user_id);if(!u?.telegram_id||!contactable(s.tg_user_id))continue;
    const chat=Number(u.telegram_id);
    const rec=await recommend(s.tg_user_id);
    const saturation=Number(s.saturation_percent||0);

    if(!s.is_vip&&Number(s.paid_orders||0)>=Number(settings?.vip_upgrade_after_purchases||2)&&await canPromo(s.tg_user_id)){
      if(!await sent(s.tg_user_id,"vip_upgrade",monthKey,"monthly")){
        await tg("sendMessage",{chat_id:chat,text:`👑 <b>Du gehörst inzwischen zu meinen Stammkunden.</b>\n\nMit Paid bekommst du den direkten Zugang zu exklusiven Drops und neuen Inhalten.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"👑 Paid ansehen",callback_data:"vip_info"}]]}});
        await mark(s.tg_user_id,"vip_upgrade",monthKey,"monthly",{paid_orders:s.paid_orders,saturation});await event(s.tg_user_id,"vip_upgrade_sent");stats.vipUpgrade++;
      }
    }

    const loyaltyEvery=Math.max(2,Number(settings?.loyalty_bonus_every||3));
    if(Number(s.paid_orders||0)>=loyaltyEvery&&Number(s.paid_orders||0)%loyaltyEvery===0){
      const tier=String(Number(s.paid_orders||0));
      if(!await sent(s.tg_user_id,"loyalty_bonus","",tier)){
        const b=await bonusSet(s.tg_user_id);
        if(b){
          await grantBonus(s.tg_user_id,b,`loyalty_${tier}`);
          await tg("sendMessage",{chat_id:chat,text:`💎 <b>Treuebonus</b>\n\n${Number(s.paid_orders||0)} Käufe – danke für deine Treue. „${esc(b.title)}“ wurde kostenlos freigeschaltet.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"🔓 Meine Inhalte",callback_data:"my_content"}]]}});
          await mark(s.tg_user_id,"loyalty_bonus","",tier,{set_id:b.id});await event(s.tg_user_id,"loyalty_bonus",{setId:b.id,meta:{paid_orders:s.paid_orders}});stats.loyaltyBonus=(stats.loyaltyBonus||0)+1;
        }
      }
    }

    if(Number(s.paid_orders||0)>0&&s.last_purchase_at){
      const days=Math.floor((now-new Date(s.last_purchase_at).getTime())/86400000);
      const stage=[...winDays].reverse().find((d:number)=>days>=d);
      if(stage&&rec&&!await sent(s.tg_user_id,"winback","",String(stage))&&await canPromo(s.tg_user_id)){
        const p:any=rec.products;
        await tg("sendMessage",{chat_id:chat,text:`✨ <b>Neu für dich</b>\n\nSeit deinem letzten Kauf ist etwas dazugekommen: „${esc(rec.title)}“ · ⭐ ${Number(p?.price_stars||0)}${Number(p?.price_ton||0)>0?` · 💎 ${Number(p.price_ton)} TON`:""}`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"Ansehen",callback_data:`offer_${rec.id}`}],[{text:"🛍 Shop",callback_data:"shop"}]]}});
        await mark(s.tg_user_id,"winback","",String(stage),{set_id:rec.id,days});await event(s.tg_user_id,"winback_sent",{setId:rec.id,meta:{stage}});stats.winback++;
      }
    }

    if(settings?.new_drop_notify!==false&&Number(s.paid_orders||0)>0){
      const fresh=activeSets.find((x:any)=>now-new Date(x.created_at).getTime()<36*3600000);
      if(fresh){
        const owned=await ownedSetIds(s.tg_user_id);
        if(!owned.has(fresh.id)&&!await sent(s.tg_user_id,"new_drop",fresh.id,"")&&await canPromo(s.tg_user_id)){
          await tg("sendMessage",{chat_id:chat,text:`🆕 <b>Neuer Drop</b>\n\n„${esc(fresh.title)}“ ist neu im Shop und noch nicht in deinen Inhalten.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"Neu für mich",callback_data:`offer_${fresh.id}`}]]}});
          await mark(s.tg_user_id,"new_drop",fresh.id,"");await event(s.tg_user_id,"new_drop_sent",{setId:fresh.id});stats.newDrop++;
        }
      }
    }

    const hours=Math.max(6,Number(settings?.cross_sell_after_open_hours||24));
    const {data:opened}=await db.from("content_access").select("content_set_id,last_opened_at").eq("tg_user_id",s.tg_user_id).eq("status","active").not("last_opened_at","is",null).gte("last_opened_at",new Date(now-hours*3600000).toISOString()).order("last_opened_at",{ascending:false}).limit(1).maybeSingle();
    if(opened&&rec&&!await sent(s.tg_user_id,"cross_sell",String(opened.content_set_id),"")&&await canPromo(s.tg_user_id)){
      if(saturation>=Number(settings?.saturation_percent||80)&&!s.is_vip){
        // VIP message already handled above; do not recycle old sets.
      }else{
        await tg("sendMessage",{chat_id:chat,text:`💫 Weil du zuletzt einen deiner Inhalte geöffnet hast: „${esc(rec.title)}“ könnte gut dazu passen.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"Für mich ansehen",callback_data:`offer_${rec.id}`}]]}});
        await mark(s.tg_user_id,"cross_sell",String(opened.content_set_id),"",{recommended_set:rec.id});await event(s.tg_user_id,"cross_sell_sent",{setId:rec.id});stats.crossSell++;
      }
    }
  }

  const {data:subs}=await db.from("subscriptions").select("id,tg_user_id,expires_at,last_reminder_at").eq("plan","vip").eq("status","active").not("expires_at","is",null).gte("expires_at",new Date().toISOString()).lte("expires_at",new Date(now+Math.max(1,Number(settings?.vip_reminder_days||3))*86400000).toISOString()).limit(100);
  for(const sub of subs||[]){const u:any=userMap.get(sub.tg_user_id);if(!u?.telegram_id||!contactable(sub.tg_user_id)||!promoWindowOpen())continue;if(sub.last_reminder_at&&now-new Date(sub.last_reminder_at).getTime()<24*3600000)continue;await tg("sendMessage",{chat_id:Number(u.telegram_id),text:"👑 Dein Paid-Zugang läuft bald aus. Du kannst ihn direkt verlängern.",reply_markup:{inline_keyboard:[[{text:"👑 Verlängern",callback_data:"vip_info"}]]}});await db.from("subscriptions").update({last_reminder_at:new Date().toISOString()}).eq("id",sub.id);await event(sub.tg_user_id,"vip_retention_sent");stats.vipRetention++;}

  const threshold=Math.max(2,Number(settings?.referral_tier_threshold||3));
  const tiers=[threshold,threshold*2];
  const {data:refs}=await db.from("referral_rewards").select("referrer_id,status").in("status",["granted","delivered"]);
  const counts=new Map<string,number>();for(const r of refs||[])counts.set(r.referrer_id,(counts.get(r.referrer_id)||0)+1);
  for(const [uid,count] of counts){const u:any=userMap.get(uid);if(!u?.telegram_id||!contactable(uid)||!promoWindowOpen())continue;for(const tier of tiers){if(count>=tier&&!await sent(uid,"referral_tier","",String(tier))){const b=await bonusSet(uid);if(!b)continue;await grantBonus(uid,b,`referral_tier_${tier}`);await tg("sendMessage",{chat_id:Number(u.telegram_id),text:`🏆 <b>Referral-Level erreicht: ${tier}</b>\n\nAls Treuebonus wurde „${esc(b.title)}“ kostenlos freigeschaltet.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"🔓 Meine Inhalte",callback_data:"my_content"}]]}});await mark(uid,"referral_tier","",String(tier),{set_id:b.id});await event(uid,"referral_tier_reward",{setId:b.id,meta:{tier}});stats.referralTier++;}}}

  const control=String(settings?.control_chat_id||"").trim();
  const lp=localParts();
  if(control){
    const dayStart=new Date();dayStart.setUTCHours(0,0,0,0);
    const {data:todayPaid}=await db.from("purchases").select("amount_stars,amount_ton,currency").eq("status","paid").gte("created_at",dayStart.toISOString());
    const stars=(todayPaid||[]).reduce((a:number,p:any)=>a+(p.currency==="stars"?Number(p.amount_stars||0):0),0);
    const ton=(todayPaid||[]).reduce((a:number,p:any)=>a+(p.currency==="ton"?Number(p.amount_ton||0):0),0);
    if(settings?.revenue_alert_enabled!==false&&(stars>=Number(settings?.revenue_alert_stars||500)||((todayPaid||[]).length>0&&!await sent(null,"first_sale",lp.date,"")))){
      if(!await sent(null,"revenue_alert",lp.date,String(Math.floor(stars/Math.max(1,Number(settings?.revenue_alert_stars||500)))))){
        await tg("sendMessage",{chat_id:control,text:`💰 <b>Revenue Alert</b>\nHeute: ⭐ ${stars} · 💎 ${ton} TON · ${(todayPaid||[]).length} Käufe`,parse_mode:"HTML"});await mark(null,"revenue_alert",lp.date,String(Math.floor(stars/Math.max(1,Number(settings?.revenue_alert_stars||500)))));await mark(null,"first_sale",lp.date,"");stats.alerts++;
      }
    }
    const {count:abandoned}=await db.from("growth_events").select("id",{count:"exact",head:true}).eq("event_type","checkout_abandoned").gte("created_at",new Date(now-3600000).toISOString());
    const hourAgo=new Date(now-3600000).toISOString();
    const {count:interest}=await db.from("growth_events").select("id",{count:"exact",head:true}).in("event_type",["teaser_click","offer_view","for_you_impression"]).gte("created_at",hourAgo);
    const {count:hourSales}=await db.from("growth_events").select("id",{count:"exact",head:true}).eq("event_type","purchase_paid").gte("created_at",hourAgo);
    if(Number(interest||0)>=Number(settings?.no_sale_alert_clicks||5)&&Number(hourSales||0)===0&&!await sent(null,"interest_no_sale",lp.date,String(lp.hour))){
      await tg("sendMessage",{chat_id:control,text:`👀 <b>Interesse ohne Kauf</b>\n\nLetzte Stunde: ${Number(interest||0)} Interessenssignale, aber kein Kauf.\nPrüfe Preis, CTA oder Zahlungsweg.`,parse_mode:"HTML"});
      await mark(null,"interest_no_sale",lp.date,String(lp.hour),{interest:Number(interest||0)});stats.alerts++;
    }
    if(Number(abandoned||0)>=Number(settings?.abandonment_alert_count||3)&&!await sent(null,"abandonment_alert",lp.date,String(lp.hour))){
      await tg("sendMessage",{chat_id:control,text:`⚠️ <b>Checkout-Abbrüche</b>\nIn der letzten Stunde wurden ${Number(abandoned||0)} Abbrüche erkannt. Prüfe Stars-/TON-Funnel und Angebot.`,parse_mode:"HTML"});await mark(null,"abandonment_alert",lp.date,String(lp.hour));stats.alerts++;
    }
    if(settings?.daily_report_enabled!==false&&lp.hour===8&&!await sent(null,"daily_report",lp.date,"")){
      const {count:buyers}=await db.from("purchases").select("tg_user_id",{count:"exact",head:true}).eq("status","paid").gte("created_at",dayStart.toISOString());
      const {count:clicks}=await db.from("growth_events").select("id",{count:"exact",head:true}).eq("event_type","teaser_click").gte("created_at",dayStart.toISOString());
      const {data:perf}=await db.from("product_performance_30d").select("title,offer_views,checkout_starts,paid_purchases,revenue_stars").order("revenue_stars",{ascending:false}).limit(20);const best=(perf||[])[0];const weak=(perf||[]).filter((p:any)=>Number(p.offer_views||0)>=2).sort((a:any,b:any)=>((Number(a.paid_purchases||0)/Math.max(1,Number(a.offer_views||0)))-(Number(b.paid_purchases||0)/Math.max(1,Number(b.offer_views||0)))))[0];const next=Number(abandoned||0)>=Number(settings?.abandonment_alert_count||3)?"Zahlungsabbruch prüfen":weak?"Schwächstes Angebot/CTA testen":"Neuen Drop oder Bundle bewerben";await tg("sendMessage",{chat_id:control,text:`📊 <b>Tagesreport</b>\n⭐ ${stars} · 💎 ${ton} TON\nKäufe: ${Number(buyers||0)} · Teaser-Klicks: ${Number(clicks||0)}\n${best?`Top: ${esc(best.title)} · ⭐ ${Number(best.revenue_stars||0)}\n`:""}${weak?`Schwächster Funnel: ${esc(weak.title)}\n`:""}Nächste Aktion: ${next}`,parse_mode:"HTML"});await mark(null,"daily_report",lp.date,"");stats.reports++;
    }
    if(settings?.weekly_report_enabled!==false&&lp.weekday.toLowerCase().startsWith("mo")&&lp.hour===8&&!await sent(null,"weekly_report",lp.date,"")){
      const since=new Date(now-7*86400000).toISOString();const {data:w}=await db.from("purchases").select("amount_stars,amount_ton,currency").eq("status","paid").gte("created_at",since);const ws=(w||[]).reduce((a:number,p:any)=>a+(p.currency==="stars"?Number(p.amount_stars||0):0),0);const wt=(w||[]).reduce((a:number,p:any)=>a+(p.currency==="ton"?Number(p.amount_ton||0):0),0);const {data:perf}=await db.from("product_performance_30d").select("title,revenue_stars,paid_purchases,offer_views").order("revenue_stars",{ascending:false}).limit(5);const top=(perf||[])[0];await tg("sendMessage",{chat_id:control,text:`📈 <b>Wochenreport</b>\n⭐ ${ws} · 💎 ${wt} TON · ${(w||[]).length} Käufe\n${top?`Top-Produkt: ${esc(top.title)} · ⭐ ${Number(top.revenue_stars||0)}\n`:""}Dashboard: Umsatz & Growth`,parse_mode:"HTML"});await mark(null,"weekly_report",lp.date,"");stats.reports++;
    }
  }
  return json({ok:true,stats});
}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);}});
