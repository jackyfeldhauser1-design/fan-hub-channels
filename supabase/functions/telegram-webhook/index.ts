import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
const esc=(v:unknown)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
async function sha256Base64Url(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function tg(token:string,method:string,body:Record<string,unknown>={}){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();if(!r.ok||!j?.ok)throw new Error(j?.description||`${method} failed`);return j.result;}
function referralCode(id:number){return `${crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}${id%97}`;}
function tonMemo(){return `FELIZE-${crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase()}`;}
function nanoTon(value:unknown){return String(BigInt(Math.round(Number(value)*1e9)));}

Deno.serve(async(req)=>{try{
  const url=Deno.env.get("SUPABASE_URL")!; const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,service,{auth:{persistSession:false}});
  const {data:cred}=await db.from("bot_credentials").select("bot_token,bot_username").eq("id",true).maybeSingle();
  const token=String(cred?.bot_token||""); if(!token)return json({ok:false,error:"bot not configured"},503);
  const expected=await sha256Base64Url(`telegram-webhook:${token}`); const provided=req.headers.get("x-telegram-bot-api-secret-token")||"";
  if(provided!==expected)return json({ok:false},401);
  const update=await req.json().catch(()=>({})); const updateId=Number(update?.update_id);
  if(Number.isFinite(updateId)){const {data:seen}=await db.from("telegram_updates").select("update_id").eq("update_id",updateId).maybeSingle();if(seen)return json({ok:true,duplicate:true});await db.from("telegram_updates").insert({update_id:updateId,raw:update});}
  const msg=update?.message||update?.edited_message||update?.channel_post||null; const chat=msg?.chat||update?.callback_query?.message?.chat||update?.my_chat_member?.chat||null;
  const text=String(msg?.text||"").trim();
  const settings=(await db.from("bot_settings").select("*").eq("id",true).maybeSingle()).data||{};
  async function publishMissingTeasers(){
    const community=String(settings.community_chat_id||"").trim(); const username=String(cred?.bot_username||"").replace(/^@/,"");
    if(!community||!username)return;
    const {data:sets}=await db.from("content_sets").select("id,title,description,product_id,products(title,price_stars,active),content_set_items(sort_order,item_role,media_files(storage_path,mime_type))").eq("status","active");
    const since=new Date(Date.now()-30*86400000).toISOString();
    const {data:abEvents}=await db.from("growth_events").select("event_type,source").in("event_type",["teaser_click","teaser_conversion"]).gte("created_at",since);
    const stat=(variant:string)=>{const source=`free:${variant}`;const clicks=(abEvents||[]).filter((e:any)=>e.event_type==="teaser_click"&&e.source===source).length;const conversions=(abEvents||[]).filter((e:any)=>e.event_type==="teaser_conversion"&&e.source===source).length;return{clicks,rate:clicks>0?conversions/clicks:0};};
    const a=stat("A"),b=stat("B");const winningVariant=a.clicks>=5&&b.clicks>=5?(a.rate>=b.rate?"A":"B"):null;
    for(const set of sets||[]){
      const product:any=set.products; if(!product?.active)continue;
      const {data:existing}=await db.from("content_publications").select("id").eq("content_set_id",set.id).eq("target","community").eq("status","published").maybeSingle(); if(existing)continue;
      const items:any[]=(set.content_set_items||[]).filter((i:any)=>i.item_role==="protected"&&String(i.media_files?.mime_type||"").startsWith("image/")).sort((a:any,b:any)=>Number(a.sort_order)-Number(b.sort_order));
      const file=items[0]?.media_files; if(!file?.storage_path)continue;
      try{
        const {data:signed,error}=await db.storage.from("media-vault").createSignedUrl(file.storage_path,600,{transform:{width:24,height:24,resize:"cover",quality:20}}); if(error||!signed?.signedUrl)throw error||new Error("Teaser URL failed");
        const variant=winningVariant||([...String(set.id)].reduce((a,ch)=>a+ch.charCodeAt(0),0)%2===0?"A":"B");
        const caption=variant==="A"
          ? `🔒 <b>${esc(set.title)}</b>\n\nNeues geschütztes Set – Originale erst nach bestätigter Zahlung.\n\n<b>⭐ ${Math.max(1,Number(product.price_stars||1))}</b>`
          : `✨ <b>Neu im geschützten Bereich: ${esc(set.title)}</b>\n\nIm Free-Feed siehst du nur den Teaser – das vollständige Set wird nach Zahlung freigeschaltet.\n\n<b>⭐ ${Math.max(1,Number(product.price_stars||1))}</b>`;
        const sent=await tg(token,"sendPhoto",{chat_id:community,photo:signed.signedUrl,caption,parse_mode:"HTML",protect_content:true,reply_markup:{inline_keyboard:[[{text:variant==="A"?"🔓 Set im Bot freischalten":"✨ Vollständiges Set ansehen",url:`https://t.me/${username}?start=c_${set.id}_free_${variant}`}]]}});
        await db.from("teaser_experiments").upsert({content_set_id:set.id,variant,message_id:Number(sent?.message_id||0)||null,published_at:new Date().toISOString()},{onConflict:"content_set_id"});
        await db.from("content_publications").insert({content_set_id:set.id,target:"community",telegram_chat_id:community,telegram_message_id:Number(sent?.message_id||0)||null,status:"published",published_at:new Date().toISOString()});
      }catch(e){await db.from("content_publications").insert({content_set_id:set.id,target:"community",telegram_chat_id:community,status:"failed",error:e instanceof Error?e.message:String(e)});}
    }
  }
  EdgeRuntime.waitUntil(publishMissingTeasers());
  async function ensureUser(from:any){if(!from?.id)return null;const {data:old}=await db.from("tg_users").select("*").eq("telegram_id",from.id).maybeSingle();if(old){await db.from("tg_users").update({username:from.username||null,first_name:from.first_name||null,last_seen_at:new Date().toISOString()}).eq("id",old.id);return old;}const {data:fresh,error}=await db.from("tg_users").insert({telegram_id:from.id,username:from.username||null,first_name:from.first_name||null,referral_code:referralCode(Number(from.id))}).select("*").single();if(error)throw error;return fresh;}
  async function trackEvent(userId:string|null,eventType:string,opts:any={}){try{await db.from("growth_events").insert({tg_user_id:userId||null,event_type:eventType,product_id:opts.productId||null,content_set_id:opts.setId||null,source:String(opts.source||""),meta:opts.meta||{}});}catch(e){console.error("growth event",e);}}
  async function trackPurchaseAttribution(userId:string,productId:string|null,purchaseId:string){if(!productId)return;const {data:set}=await db.from("content_sets").select("id").eq("product_id",productId).eq("status","active").maybeSingle();if(!set)return;const since=new Date(Date.now()-7*86400000).toISOString();const {data:click}=await db.from("growth_events").select("source,meta,created_at").eq("tg_user_id",userId).eq("event_type","teaser_click").eq("content_set_id",set.id).gte("created_at",since).order("created_at",{ascending:false}).limit(1).maybeSingle();if(click){await trackEvent(userId,"teaser_conversion",{productId,setId:set.id,source:String(click.source||"free"),meta:{purchase_id:purchaseId,variant:(click.meta as any)?.variant||null,click_at:click.created_at}});}}
  async function applyReferral(user:any,code:string){if(!user||user.referred_by||!code)return user;const {data:referrer}=await db.from("tg_users").select("id,telegram_id").ilike("referral_code",code).maybeSingle();if(!referrer||referrer.id===user.id)return user;const {data:updated}=await db.from("tg_users").update({referred_by:referrer.id}).eq("id",user.id).is("referred_by",null).select("*").maybeSingle();if(updated){await trackEvent(user.id,"referral_join",{source:"telegram",meta:{referrer_id:referrer.id}});return updated;}return user;}
  async function grantReferralReward(user:any,purchaseId:string){if(!user?.referred_by)return;const {data:existing}=await db.from("referral_rewards").select("id").eq("referred_user_id",user.id).maybeSingle();if(existing)return;const {data:sets}=await db.from("content_sets").select("id,title,product_id,products(price_stars,active)").eq("status","active");const candidates=(sets||[]).filter((s:any)=>s.products?.active&&Number(s.products?.price_stars||0)>0).sort((a:any,b:any)=>Number(a.products?.price_stars||0)-Number(b.products?.price_stars||0));let bonus:any=null;for(const s of candidates){const {data:owned}=await db.from("content_access").select("id").eq("tg_user_id",user.referred_by).eq("content_set_id",s.id).eq("status","active").maybeSingle();if(!owned){bonus=s;break;}}if(!bonus)return;await db.from("content_access").insert({tg_user_id:user.referred_by,content_set_id:bonus.id,purchase_id:null,status:"active",source:"referral",expires_at:null});const {error:rewardErr}=await db.from("referral_rewards").insert({referrer_id:user.referred_by,referred_user_id:user.id,trigger_purchase_id:purchaseId,content_set_id:bonus.id,status:"granted"});if(rewardErr&&String((rewardErr as any)?.code||"")!=="23505")throw rewardErr;const {data:referrer}=await db.from("tg_users").select("telegram_id").eq("id",user.referred_by).maybeSingle();if(referrer?.telegram_id){await tg(token,"sendMessage",{chat_id:Number(referrer.telegram_id),text:`🎁 <b>Empfehlungsbonus freigeschaltet</b>\n\nEine deiner Empfehlungen hat erstmals gekauft. Als Dank liegt „${esc(bonus.title)}“ jetzt kostenlos unter „Meine Inhalte“.`,parse_mode:"HTML",protect_content:true,reply_markup:{inline_keyboard:[[{text:"🔓 Meine Inhalte",callback_data:"my_content"}]]}});await db.from("referral_rewards").update({status:"delivered",delivered_at:new Date().toISOString()}).eq("referred_user_id",user.id);}await trackEvent(user.referred_by,"referral_reward",{setId:bonus.id,source:"referral",meta:{referred_user_id:user.id,purchase_id:purchaseId}});}
  async function productForSet(setId:string){const {data:set}=await db.from("content_sets").select("id,title,description,access_mode,access_hours,product_id,status").eq("id",setId).eq("status","active").maybeSingle();if(!set?.product_id)return null;const {data:product}=await db.from("products").select("*").eq("id",set.product_id).eq("active",true).maybeSingle();return product?{set,product}:null;}
  async function sendShop(chatId:number,user:any=null){const {data:sets,error}=await db.from("content_sets").select("id,title,created_at,product_id,products(title,price_stars,price_ton,price_trx,active,upsell_product_id)").eq("status","active");if(error)throw error;const owned=new Set<string>();if(user?.id){const {data:access}=await db.from("content_access").select("content_set_id").eq("tg_user_id",user.id).eq("status","active");for(const a of access||[])owned.add(String(a.content_set_id));}let preferred="";if(user?.id){const {data:last}=await db.from("purchases").select("products(upsell_product_id)").eq("tg_user_id",user.id).eq("status","paid").order("created_at",{ascending:false}).limit(1).maybeSingle();preferred=String((last?.products as any)?.upsell_product_id||"");}const filtered=(sets||[]).filter((s:any)=>!owned.has(String(s.id))&&s.products?.active&&((Number(s.products.price_stars)>0)||(Number(s.products.price_ton)>0&&String(settings.ton_wallet||"").trim())));const byTitle=new Map<string,any>();for(const s of filtered){const key=String(s.title||s.products?.title||"").trim().toLocaleLowerCase("de-DE");if(!byTitle.has(key))byTitle.set(key,s);}const offers=[...byTitle.values()].sort((a:any,b:any)=>{if(preferred&&a.product_id===preferred)return -1;if(preferred&&b.product_id===preferred)return 1;const ad=new Date(a.created_at||0).getTime(),bd=new Date(b.created_at||0).getTime();if(ad!==bd)return bd-ad;return Number(a.products?.price_stars||0)-Number(b.products?.price_stars||0);});const rows:any[]=[];const {data:bundles}=await db.from("products").select("id,title,price_stars,price_ton").eq("active",true).eq("kind","bundle").order("sort_order");for(const b of bundles||[]){let stars=Number(b.price_stars||0),ton=Number(b.price_ton||0),label="🔥";if(user?.id){const state=await bundleState(user.id,b.id);if(state.total>0&&state.missing.length===0)continue;if(state.owned>0){stars=Math.max(1,Math.round(stars*(state.missing.length/state.total)));ton=Math.max(0,Math.round(ton*(state.missing.length/state.total)*10000)/10000);label="⚡ Upgrade";}}const price=[stars>0?`⭐${stars}`:"",ton>0&&String(settings.ton_wallet||"").trim()?`💎${ton}`:""].filter(Boolean).join(" · ");rows.push([{text:`${label} ${String(b.title).slice(0,20)} · ${price}`,callback_data:`bundle_${b.id}`}]);}for(const s of offers.slice(0,14)){const p=s.products;const price=[Number(p.price_stars)>0?`⭐${p.price_stars}`:"",Number(p.price_ton)>0&&String(settings.ton_wallet||"").trim()?`💎${Number(p.price_ton)}`:""].filter(Boolean).join(" · ");const marker=preferred&&s.product_id===preferred?"✨ ":"";rows.push([{text:`${marker}${String(s.title||p.title).slice(0,22)} · ${price}`,callback_data:`offer_${s.id}`}]);}rows.push([{text:"✨ Für dich",callback_data:"for_you"},{text:"🔓 Meine Inhalte",callback_data:"my_content"}],[{text:"⬅️ Menü",callback_data:"main_menu"}]);const ownedText=owned.size?`\n\n✅ ${owned.size} bereits freigeschaltete Sets werden nicht erneut angeboten.`:"";await tg(token,"sendMessage",{chat_id:chatId,text:(rows.length>2?"🛍 <b>Shop</b>\n\nEmpfohlene Upgrades und neue Inhalte stehen oben.":"Der Shop ist momentan leer.")+ownedText,parse_mode:"HTML",reply_markup:{inline_keyboard:rows}});}
  async function sendForYou(chatId:number,user:any){const {data:score}=await db.from("customer_growth_scores").select("saturation_percent,is_vip,loyalty_level,purchase_probability").eq("tg_user_id",user.id).maybeSingle();const saturation=Number(score?.saturation_percent||0);if(saturation>=Number(settings.saturation_percent||80)&&!score?.is_vip){await trackEvent(user.id,"for_you_impression",{source:"vip_saturation",meta:{saturation}});await tg(token,"sendMessage",{chat_id:chatId,text:`👑 <b>Für dich</b>\n\nStatus: <b>${esc(score?.loyalty_level||"Kunde")}</b> · ${saturation}% der Sets freigeschaltet. Paid ist jetzt sinnvoller als weitere Einzelkäufe.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:String(settings.vip_cta_text||"👑 Paid freischalten"),callback_data:"vip_info"}],[{text:"🛍 Shop",callback_data:"shop"}]]}});return;}const recs:any[]=[];const seen=new Set<string>();const {data:bundles}=await db.from("products").select("id,title,price_stars,price_ton").eq("active",true).eq("kind","bundle").order("sort_order");for(const b of bundles||[]){const state=await bundleState(user.id,b.id);if(state.owned>0&&state.missing.length>0){const stars=Math.max(1,Math.round(Number(b.price_stars||0)*(state.missing.length/state.total)));recs.push({type:"bundle",id:b.id,title:`⚡ ${b.title}`,detail:`Upgrade · ⭐ ${stars}`,source:"bundle_upgrade"});seen.add(b.id);break;}}const {data:last}=await db.from("purchases").select("product_id,products(upsell_product_id)").eq("tg_user_id",user.id).eq("status","paid").order("created_at",{ascending:false}).limit(1).maybeSingle();const preferred=String((last?.products as any)?.upsell_product_id||"");if(preferred&&!seen.has(preferred)){const {data:set}=await db.from("content_sets").select("id,title,product_id,products(price_stars)").eq("product_id",preferred).eq("status","active").maybeSingle();if(set){const {data:owned}=await db.from("content_access").select("id").eq("tg_user_id",user.id).eq("content_set_id",set.id).eq("status","active").maybeSingle();if(!owned){recs.push({type:"set",id:set.id,productId:set.product_id,title:`✨ ${set.title}`,detail:`Passend zu deinem letzten Kauf · ⭐ ${Number((set.products as any)?.price_stars||0)}`,source:"purchase_based"});seen.add(preferred);}}}const {data:sets}=await db.from("content_sets").select("id,title,product_id,created_at,products(price_stars,active)").eq("status","active").order("created_at",{ascending:false});for(const set of sets||[]){if(recs.length>=3)break;if(seen.has(String(set.product_id))||!(set.products as any)?.active)continue;const {data:owned}=await db.from("content_access").select("id").eq("tg_user_id",user.id).eq("content_set_id",set.id).eq("status","active").maybeSingle();if(!owned){recs.push({type:"set",id:set.id,productId:set.product_id,title:`🆕 ${set.title}`,detail:`Neu für dich · ⭐ ${Number((set.products as any)?.price_stars||0)}`,source:"newest_unowned"});seen.add(String(set.product_id));}}if(!recs.length){await tg(token,"sendMessage",{chat_id:chatId,text:`✨ Du hast aktuell alle verfügbaren Sets.${score?.is_vip?" Dein VIP-Zugang ist aktiv.":" Neue Drops erscheinen automatisch hier."}`});return;}for(const r of recs)await trackEvent(user.id,"for_you_impression",{productId:r.productId||r.id,setId:r.type==="set"?r.id:null,source:r.source,meta:{loyalty_level:score?.loyalty_level||"Interessent",purchase_probability:Number(score?.purchase_probability||0)}});await tg(token,"sendMessage",{chat_id:chatId,text:`✨ <b>Für dich</b>\n\nStatus: <b>${esc(score?.loyalty_level||"Interessent")}</b> · Kaufinteresse ${Number(score?.purchase_probability||0)}%\n\nIch zeige dir nur Inhalte, die du noch nicht besitzt.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[...recs.map((r:any)=>[{text:`${String(r.title).slice(0,22)} · ${r.detail.replace(/^.* · /,"")}`,callback_data:r.type==="bundle"?`bundle_${r.id}`:`offer_${r.id}`}]),[{text:"🛍 Ganzer Shop",callback_data:"shop"}]]}});}
  async function sendMainMenu(chatId:number){await tg(token,"sendMessage",{chat_id:chatId,text:"👋 <b>ItsFelize</b>\n\nWas möchtest du öffnen?",parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"🎁 Free",url:String(settings.free_group_url||"https://t.me/")},{text:"👑 Paid",callback_data:"vip_info"}],[{text:"✨ Für dich",callback_data:"for_you"},{text:"🛍 Shop",callback_data:"shop"}],[{text:"🔓 Meine Inhalte",callback_data:"my_content"},{text:"🎁 Freunde empfehlen",callback_data:"referral"}]]}});}
  async function sendStarsInvoice(chatId:number,p:any,user:any){await trackEvent(user.id,"checkout_started",{productId:p.id,source:"stars"});await tg(token,"sendInvoice",{chat_id:chatId,title:String(p.title).slice(0,32),description:String(p.description||"Geschütztes Set – Freischaltung nach Zahlung").slice(0,255),payload:`p:${p.id}`,currency:"XTR",prices:[{label:String(p.title).slice(0,32),amount:Math.max(1,Math.round(Number(p.price_stars)))}]});await db.from("invoice_intents").insert({tg_user_id:user.id,chat_id:chatId,payload:`p:${p.id}`,title:p.title,amount_stars:Math.max(1,Math.round(Number(p.price_stars)))});}
  const contentPageSize = 12;

  // Permanent and time-limited entitlements use the same filter for browsing and delivery.
  function activeContentAccess(userId: string) {
    return db.from("content_access")
      .select("id,content_set_id,content_sets(title)")
      .eq("tg_user_id", userId)
      .eq("status", "active")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());
  }

  async function getActiveContentAccess(userId: string, setId: string) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(setId)) return null;
    const { data, error } = await activeContentAccess(userId)
      .eq("content_set_id", setId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function sendOwnedSet(chatId: number, userId: string, setId: string) {
    if (!await getActiveContentAccess(userId, setId)) return false;
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "Dieses Set ist bereits freigeschaltet.",
      reply_markup: { inline_keyboard: [
        [{ text: "🔓 Set öffnen", callback_data: "content_" + setId }],
        [{ text: "Meine Inhalte", callback_data: "my_content" }],
      ] },
    });
    return true;
  }

  async function sendContentPage(chatId: number, userId: string, page = 0) {
    const start = page * contentPageSize;
    const { data, error } = await activeContentAccess(userId)
      .order("granted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + contentPageSize);
    if (error) throw error;
    const rows = data ?? [];
    const buttons = rows.slice(0, contentPageSize).map((row) => [{
      text: String(row.content_sets?.title || "Set").slice(0, 60),
      callback_data: "content_" + row.content_set_id,
    }]);
    const navigation = [];
    if (page > 0) navigation.push({ text: "← Zurück", callback_data: "my_content_" + (page - 1) });
    if (rows.length > contentPageSize) navigation.push({ text: "Weiter →", callback_data: "my_content_" + (page + 1) });
    if (navigation.length) buttons.push(navigation);
    if (page > 1 && !rows.length) buttons.push([{ text: "Erste Seite", callback_data: "my_content" }]);
    buttons.push([{ text: "Shop", callback_data: "shop" }, { text: "Hauptmenü", callback_data: "main_menu" }]);
    let message = "Meine Inhalte · Seite " + (page + 1) + "\n\nWähle ein freigeschaltetes Set.";
    if (!rows.length) {
      message = page === 0
        ? "Du hast noch keine freigeschalteten Inhalte."
        : "Auf dieser Seite sind keine Inhalte mehr verfügbar.";
    }
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: message,
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async function sendOffer(chatId:number,setId:string,user:any){if(await sendOwnedSet(chatId,user.id,setId))return;const offer=await productForSet(setId);if(offer)await trackEvent(user.id,"offer_view",{productId:offer.product.id,setId,source:"bot"});if(!offer){await tg(token,"sendMessage",{chat_id:chatId,text:"Dieses Set ist derzeit nicht verfügbar.",reply_markup:{inline_keyboard:[[{text:"⬅️ Shop",callback_data:"shop"},{text:"🏠 Menü",callback_data:"main_menu"}]]}});return;}const p=offer.product;const buttons:any[]=[];if(Number(p.price_stars)>0)buttons.push([{text:`⭐ ${p.price_stars} Stars`,callback_data:`stars_${setId}`}]);if(Number(p.price_ton)>0&&String(settings.ton_wallet||"").trim())buttons.push([{text:`💎 ${Number(p.price_ton)} TON`,callback_data:`ton_${setId}`}]);if(Number(p.price_trx)>0&&String(settings.trx_wallet||"").trim())buttons.push([{text:`🔺 ${Number(p.price_trx)} TRX`,callback_data:`trx_${setId}`}]);buttons.push([{text:"⬅️ Shop",callback_data:"shop"},{text:"🏠 Menü",callback_data:"main_menu"}]);if(buttons.length===1){await tg(token,"sendMessage",{chat_id:chatId,text:"Für dieses Set ist momentan keine Zahlungsart verfügbar.",reply_markup:{inline_keyboard:buttons}});return;}await tg(token,"sendMessage",{chat_id:chatId,text:`🔒 <b>${esc(p.title)}</b>\n\n${esc(p.description||"Geschütztes Set – Freischaltung nach bestätigter Zahlung")}`,parse_mode:"HTML",reply_markup:{inline_keyboard:buttons}});}
  async function grantBundle(chatId:number,user:any,purchaseId:string,bundleProductId:string,recovery=false){
    const {data:items,error}=await db.from("bundle_items").select("product_id").eq("bundle_id",bundleProductId);
    if(error)throw error;
    if(!items?.length)throw new Error("Bundle enthält keine Produkte.");
    const sets=[];
    for(const row of items){
      const {data:set,error:setError}=await db.from("content_sets").select("id,access_mode,access_hours").eq("product_id",row.product_id).eq("status","active").maybeSingle();
      if(setError)throw setError;
      if(!set)throw new Error("Bundle content is unavailable");
      sets.push(set);
    }
    for(const set of sets){
      const expires=set.access_mode==="hours"?new Date(Date.now()+Math.max(1,Number(set.access_hours||24))*3600000).toISOString():null;
      const {data:existing,error:lookupError}=await db.from("content_access").select("id,status,expires_at,purchase_id").eq("tg_user_id",user.id).eq("content_set_id",set.id).maybeSingle();
      if(lookupError)throw lookupError;
      if(existing?.status==="active"&&(!existing.expires_at||Date.parse(existing.expires_at)>Date.now()))continue;
      if(recovery&&(existing?.status==="revoked"||existing?.purchase_id===purchaseId))throw new Error("Bundle entitlement requires manual review");
      const {error:grantError}=existing
        ?await db.from("content_access").update({purchase_id:purchaseId,status:"active",source:"bundle",expires_at:expires}).eq("id",existing.id).eq("tg_user_id",user.id).select("id").single()
        :await db.from("content_access").insert({tg_user_id:user.id,content_set_id:set.id,purchase_id:purchaseId,status:"active",source:"bundle",expires_at:expires}).select("id").single();
      if(grantError)throw grantError;
    }
    await tg(token,"sendMessage",{chat_id:chatId,text:`✅ Bundle freigeschaltet. ${sets.length} Inhalte liegen jetzt unter „Meine Inhalte“.`,protect_content:true,reply_markup:{inline_keyboard:[[{text:"🔓 Meine Inhalte",callback_data:"my_content"}],[{text:"🏠 Menü",callback_data:"main_menu"}]]}});
    const {error:deliveryError}=await db.from("purchases").update({delivery_status:"delivered",delivered_at:new Date().toISOString(),delivery_note:`bundle access granted: ${sets.length} sets`}).eq("id",purchaseId).eq("tg_user_id",user.id).select("id").single();
    if(deliveryError)throw deliveryError;
  }
  async function bundleState(userId:string,bundleId:string){const {data:items}=await db.from("bundle_items").select("product_id").eq("bundle_id",bundleId);const owned=new Set<string>();const missing:string[]=[];for(const row of items||[]){const {data:set}=await db.from("content_sets").select("id").eq("product_id",row.product_id).eq("status","active").maybeSingle();if(!set)continue;const {data:access}=await db.from("content_access").select("id").eq("tg_user_id",userId).eq("content_set_id",set.id).eq("status","active").limit(1).maybeSingle();if(access)owned.add(row.product_id);else missing.push(row.product_id);}return{total:Number(items?.length||0),owned:owned.size,missing};}
  async function sendStarsInvoiceAmount(chatId:number,p:any,user:any,amount:number,source:string){const finalAmount=Math.max(1,Math.round(amount));await trackEvent(user.id,"checkout_started",{productId:p.id,source,meta:{amount_stars:finalAmount}});await tg(token,"sendInvoice",{chat_id:chatId,title:String(p.title).slice(0,32),description:String(p.description||"Geschützter Inhalt – Freischaltung nach Zahlung").slice(0,255),payload:`p:${p.id}`,currency:"XTR",prices:[{label:String(p.title).slice(0,32),amount:finalAmount}]});await db.from("invoice_intents").insert({tg_user_id:user.id,chat_id:chatId,payload:`p:${p.id}`,title:p.title,amount_stars:finalAmount});}
  async function sendBundleOffer(chatId:number,productId:string,user:any){const {data:p}=await db.from("products").select("*").eq("id",productId).eq("active",true).eq("kind","bundle").maybeSingle();if(!p){await tg(token,"sendMessage",{chat_id:chatId,text:"Dieses Bundle ist derzeit nicht verfügbar."});return;}const state=await bundleState(user.id,p.id);await trackEvent(user.id,"offer_view",{productId:p.id,source:"bundle",meta:state});if(state.total>0&&state.missing.length===0){await tg(token,"sendMessage",{chat_id:chatId,text:"✅ Du besitzt bereits alle Inhalte dieses Bundles.",reply_markup:{inline_keyboard:[[{text:"🔓 Meine Inhalte",callback_data:"my_content"}],[{text:"⬅️ Shop",callback_data:"shop"}]]}});return;}const ratio=state.total>0?state.missing.length/state.total:1;const stars=Math.max(1,Math.round(Number(p.price_stars||0)*ratio));const ton=Math.max(0,Math.round(Number(p.price_ton||0)*ratio*10000)/10000);const upgrade=state.owned>0;const buttons:any[]=[];if(stars>0)buttons.push([{text:`⭐ ${stars} Stars`,callback_data:`bstars_${p.id}`}]);if(ton>0&&String(settings.ton_wallet||"").trim())buttons.push([{text:`💎 ${ton} TON`,callback_data:`bton_${p.id}`}]);buttons.push([{text:"⬅️ Shop",callback_data:"shop"}]);await tg(token,"sendMessage",{chat_id:chatId,text:`🔥 <b>${esc(p.title)}</b>\n\n${esc(p.description||"Mehrere Sets als Bundle.")}\n\n${upgrade?`Bundle-Upgrade: Du besitzt bereits ${state.owned}/${state.total}. Bezahlt werden nur die ${state.missing.length} fehlenden Inhalte.`:`Enthalten: ${state.total} Sets`}`,parse_mode:"HTML",reply_markup:{inline_keyboard:buttons}});}
  async function beginBundleTon(chatId:number,user:any,productId:string){const {data:p}=await db.from("products").select("*").eq("id",productId).eq("active",true).eq("kind","bundle").maybeSingle();const wallet=String(settings.ton_wallet||"").trim();const state=p?await bundleState(user.id,p.id):{total:0,owned:0,missing:[]};const targetAmount=p&&state.total>0?Math.max(0,Math.round(Number(p.price_ton||0)*(state.missing.length/state.total)*10000)/10000):Number(p?.price_ton||0);if(!p||!wallet||targetAmount<=0){await tg(token,"sendMessage",{chat_id:chatId,text:"TON-Zahlung ist für dieses Bundle derzeit nicht verfügbar."});return;}await trackEvent(user.id,"checkout_started",{productId:p.id,source:"ton_bundle",meta:{amount_ton:targetAmount,missing:state.missing.length,total:state.total}});const cutoff=new Date(Date.now()-24*3600000).toISOString();const {data:open}=await db.from("purchases").select("id,ton_memo,amount_ton").eq("tg_user_id",user.id).eq("product_id",p.id).eq("currency","ton").eq("status","pending").gte("created_at",cutoff).order("created_at",{ascending:false}).limit(1).maybeSingle();let purchase:any=open;if(purchase&&Math.abs(Number(purchase.amount_ton||0)-targetAmount)>0.00001){await db.from("purchases").update({status:"failed",delivery_status:"failed",delivery_note:"bundle ownership changed before payment"}).eq("id",purchase.id).eq("status","pending");purchase=null;}if(!purchase){const memo=tonMemo();const {data:created,error}=await db.from("purchases").insert({tg_user_id:user.id,product_id:p.id,referrer_id:user.referred_by||null,title_snapshot:p.title,currency:"ton",amount_ton:targetAmount,status:"pending",ton_memo:memo,delivery_status:"pending"}).select("id,ton_memo,amount_ton").single();if(error){if(String((error as any)?.code||"")==="23505"){const {data:existing}=await db.from("purchases").select("id,ton_memo,amount_ton").eq("tg_user_id",user.id).eq("product_id",p.id).eq("currency","ton").eq("status","pending").limit(1).maybeSingle();if(!existing)throw error;purchase=existing;}else throw error;}else purchase=created;}const payUrl=`https://app.tonkeeper.com/transfer/${wallet}?amount=${nanoTon(purchase.amount_ton)}&text=${encodeURIComponent(String(purchase.ton_memo||""))}`;await tg(token,"sendMessage",{chat_id:chatId,text:`💎 <b>${esc(p.title)}</b>\n\nSende genau <b>${Number(purchase.amount_ton)} TON</b>. Freischaltung erfolgt erst nach bestätigtem Eingang.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"💎 In TON Wallet bezahlen",url:payUrl}],[{text:"✅ Zahlung prüfen",callback_data:`checkton_${purchase.id}`}]]}});}
  async function grantVip(chatId:number,user:any,purchaseId:string,recovery=false){const vipChat=String(settings.vip_chat_id||"").trim();if(!vipChat)throw new Error("VIP-Gruppe ist nicht konfiguriert.");const days=Math.max(0,Number(settings.vip_period_days||0));let expires=days>0?new Date(Date.now()+days*86400000).toISOString():null;const {data:sub,error:subError}=await db.from("subscriptions").select("id,renewals,last_purchase_id,expires_at,status").eq("tg_user_id",user.id).eq("plan","vip").order("created_at",{ascending:false}).limit(1).maybeSingle();if(subError)throw subError;if(recovery&&(!sub||sub.last_purchase_id!==purchaseId||sub.status!=="active"||(sub.expires_at&&Date.parse(sub.expires_at)<=Date.now())))throw new Error("VIP entitlement requires manual review");if(recovery){
    const member=await tg(token,"getChatMember",{chat_id:vipChat,user_id:Number(user.telegram_id||chatId)});
    const joined=["creator","administrator","member"].includes(String(member?.status))||(member?.status==="restricted"&&member?.is_member===true);
    if(!joined){
      await tg(token,"sendMessage",{chat_id:chatId,text:"Dein VIP-Kauf ist bestätigt. Der Zugang benötigt eine manuelle Prüfung; bitte nicht erneut bezahlen.",protect_content:true});
      throw new Error("VIP invite state ambiguous; manual review required");
    }
    await tg(token,"sendMessage",{chat_id:chatId,text:"✅ Dein bezahlter VIP-Zugang ist bereits aktiv.",protect_content:true});
    const {error}=await db.from("purchases").update({delivery_status:"delivered",delivered_at:new Date().toISOString(),delivery_note:"VIP membership verified during recovery"}).eq("id",purchaseId).eq("tg_user_id",user.id).select("id").single();
    if(error)throw error;
    return;
  }if(sub?.last_purchase_id===purchaseId)expires=sub.expires_at;if(sub?.last_purchase_id!==purchaseId){const {error:grantError}=sub?await db.from("subscriptions").update({status:"active",started_at:new Date().toISOString(),expires_at:expires,last_purchase_id:purchaseId,renewals:Number(sub.renewals||0)+1,updated_at:new Date().toISOString()}).eq("id",sub.id).eq("tg_user_id",user.id).select("id").single():await db.from("subscriptions").insert({tg_user_id:user.id,plan:"vip",status:"active",started_at:new Date().toISOString(),expires_at:expires,last_purchase_id:purchaseId}).select("id").single();if(grantError)throw grantError;}const ttlHours=Math.max(1,Number(settings.vip_invite_ttl_hours||24));const invite=await tg(token,"createChatInviteLink",{chat_id:vipChat,expire_date:Math.floor((Date.now()+ttlHours*3600000)/1000),member_limit:1,name:"Paid-Zugang"});if(!invite?.invite_link)throw new Error("VIP invite missing");await tg(token,"sendMessage",{chat_id:chatId,text:`👑 <b>Paid-Zugang aktiviert</b>\n\nDein persönlicher Einladungslink ist ${ttlHours} Stunden gültig und nur einmal nutzbar.${expires?`\nZugang bis: ${new Date(expires).toLocaleDateString("de-DE")}`:"\nDein Zugang ist dauerhaft aktiv."}`,parse_mode:"HTML",protect_content:true,reply_markup:{inline_keyboard:[[{text:"👑 Paid-Gruppe öffnen",url:String(invite?.invite_link||"")}],[{text:"🏠 Menü",callback_data:"main_menu"}]]}});const {error:deliveryError}=await db.from("purchases").update({delivery_status:"delivered",delivered_at:new Date().toISOString(),delivery_note:"VIP invite delivered"}).eq("id",purchaseId).eq("tg_user_id",user.id).select("id").single();if(deliveryError)throw deliveryError;}
  async function sendVipStarsInvoice(chatId:number,user:any){const {data:p}=await db.from("products").select("*").eq("delivery_payload","vip").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle();if(!p)throw new Error("VIP-Produkt ist nicht aktiv.");await tg(token,"sendInvoice",{chat_id:chatId,title:String(p.title||"VIP-Zugang").slice(0,32),description:"Exklusiver Paid-Bereich – Freischaltung nach bestätigter Zahlung",payload:`p:${p.id}`,currency:"XTR",prices:[{label:String(p.title||"VIP-Zugang").slice(0,32),amount:Math.max(1,Math.round(Number(p.price_stars||settings.vip_price_stars||450)))}]});await db.from("invoice_intents").insert({tg_user_id:user.id,chat_id:chatId,payload:`p:${p.id}`,title:p.title,amount_stars:Math.max(1,Math.round(Number(p.price_stars||settings.vip_price_stars||450)))});}
  async function beginVipTon(chatId:number,user:any){const {data:p}=await db.from("products").select("*").eq("delivery_payload","vip").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle();const wallet=String(settings.ton_wallet||"").trim();const amount=Number(p?.price_ton||settings.vip_price_ton||0);if(!p||!wallet||amount<=0){await tg(token,"sendMessage",{chat_id:chatId,text:"TON-Zahlung ist für Paid derzeit nicht verfügbar."});return;}const cutoff=new Date(Date.now()-24*3600000).toISOString();const {data:open}=await db.from("purchases").select("id,ton_memo,amount_ton").eq("tg_user_id",user.id).eq("product_id",p.id).eq("currency","ton").eq("status","pending").gte("created_at",cutoff).order("created_at",{ascending:false}).limit(1).maybeSingle();let purchase:any=open;if(!purchase){const memo=tonMemo();const {data:created,error}=await db.from("purchases").insert({tg_user_id:user.id,product_id:p.id,referrer_id:user.referred_by||null,title_snapshot:p.title,currency:"ton",amount_ton:amount,status:"pending",ton_memo:memo,delivery_status:"pending"}).select("id,ton_memo,amount_ton").single();if(error){if(String((error as any)?.code||"")==="23505"){const {data:existing}=await db.from("purchases").select("id,ton_memo,amount_ton").eq("tg_user_id",user.id).eq("product_id",p.id).eq("currency","ton").eq("status","pending").order("created_at",{ascending:false}).limit(1).maybeSingle();if(!existing)throw error;purchase=existing;}else throw error;}else purchase=created;}const payUrl=`https://app.tonkeeper.com/transfer/${wallet}?amount=${nanoTon(purchase.amount_ton)}&text=${encodeURIComponent(String(purchase.ton_memo||""))}`;await tg(token,"sendMessage",{chat_id:chatId,text:`👑 <b>Paid-Zugang</b>\n\nSende genau <b>${Number(purchase.amount_ton)} TON</b>. Freischaltung erfolgt erst nach bestätigtem Eingang.`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"💎 In TON Wallet bezahlen",url:payUrl}],[{text:"✅ Zahlung prüfen",callback_data:`checkton_${purchase.id}`}]]}});}
  async function beginTon(chatId:number,user:any,setId:string){const offer=await productForSet(setId);const wallet=String(settings.ton_wallet||"").trim();if(!offer||!wallet||Number(offer.product.price_ton)<=0){await tg(token,"sendMessage",{chat_id:chatId,text:"TON-Zahlung ist für dieses Set derzeit nicht verfügbar."});return;}const p=offer.product;const cutoff=new Date(Date.now()-24*3600000).toISOString();const {data:open}=await db.from("purchases").select("id,ton_memo,amount_ton").eq("tg_user_id",user.id).eq("product_id",p.id).eq("currency","ton").eq("status","pending").gte("created_at",cutoff).order("created_at",{ascending:false}).limit(1).maybeSingle();let purchase:any=open;if(!purchase){const memo=tonMemo();const {data:created,error}=await db.from("purchases").insert({tg_user_id:user.id,product_id:p.id,referrer_id:user.referred_by||null,title_snapshot:p.title,currency:"ton",amount_ton:Number(p.price_ton),status:"pending",ton_memo:memo,delivery_status:"pending"}).select("id,ton_memo,amount_ton").single();if(error){if(String((error as any)?.code||"")==="23505"){const {data:existing,error:existingError}=await db.from("purchases").select("id,ton_memo,amount_ton").eq("tg_user_id",user.id).eq("product_id",p.id).eq("currency","ton").eq("status","pending").order("created_at",{ascending:false}).limit(1).maybeSingle();if(existingError||!existing)throw error;purchase=existing;}else throw error;}else purchase=created;}const memo=String(purchase.ton_memo||"");const amount=Number(purchase.amount_ton||p.price_ton);const payUrl=`https://app.tonkeeper.com/transfer/${wallet}?amount=${nanoTon(amount)}&text=${encodeURIComponent(memo)}`;await tg(token,"sendMessage",{chat_id:chatId,text:`💎 <b>${esc(p.title)}</b>\n\nSende genau <b>${amount} TON</b>. Der Verwendungszweck wird automatisch eingesetzt.\n\nDie Freischaltung erfolgt erst nach bestätigtem Eingang.${open?"\n\nℹ️ Dein bereits offener Zahlungsvorgang wird weiterverwendet.":""}`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"💎 In TON Wallet bezahlen",url:payUrl}],[{text:"✅ Zahlung prüfen",callback_data:`checkton_${purchase.id}`}]]}});}
  async function beginTrx(chatId: number, user: { id: string; referred_by?: string }, setId: string) {
    if (await sendOwnedSet(chatId, user.id, setId)) return;
    const offer = await productForSet(setId);
    const wallet = String(settings.trx_wallet ?? "").trim();
    const price = Number(offer?.product.price_trx ?? 0);
    if (!offer || !wallet || !Number.isFinite(price) || price <= 0) {
      await tg(token, "sendMessage", { chat_id: chatId, text: "TRX-Zahlung ist für dieses Set derzeit nicht verfügbar." });
      return;
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { data: open, error: openError } = await db.from("purchases")
      .select("id,amount_trx,trx_memo")
      .eq("tg_user_id", user.id)
      .eq("product_id", offer.product.id)
      .eq("currency", "trx")
      .eq("status", "pending")
      .not("trx_memo", "is", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openError) throw openError;

    let order = open;
    if (!order) {
      const memo = "TRX-" + crypto.randomUUID().replaceAll("-", "").toUpperCase();
      const { data: created, error } = await db.from("purchases").insert({
        tg_user_id: user.id,
        product_id: offer.product.id,
        referrer_id: user.referred_by ?? null,
        title_snapshot: offer.product.title,
        currency: "trx",
        amount_trx: price,
        status: "pending",
        trx_memo: memo,
        delivery_status: "pending",
      }).select("id,amount_trx,trx_memo").single();
      if (error) throw error;
      order = created;
      await trackEvent(user.id, "checkout_started", { productId: offer.product.id, setId, source: "trx" });
    }

    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: [
        "TRX-Zahlung für " + offer.product.title,
        "Betrag: " + order.amount_trx + " TRX",
        "Empfängeradresse: " + wallet,
        "Memo: " + order.trx_memo,
        "",
        "Verwende eine Wallet, die ein Memo an die native TRX-Überweisung im TRON-Netzwerk anhängen kann. Übernimm Betrag und Memo exakt. Nach bestätigtem Eingang liefert der Bot das Set aus.",
      ].join("\n"),
      reply_markup: { inline_keyboard: [[{ text: "Zahlungsstatus prüfen", callback_data: "checktrx_" + order.id }], [{ text: "Meine Inhalte", callback_data: "my_content" }]] },
    });
  }

  async function sendNextOffer(chatId:number,userId:string,purchaseId:string){const {data:purchase}=await db.from("purchases").select("product_id,products(upsell_product_id)").eq("id",purchaseId).maybeSingle();const preferred=(purchase?.products as any)?.upsell_product_id||null;const {data:sets}=await db.from("content_sets").select("id,product_id,products(id,title,price_stars,price_ton,active)").eq("status","active");const candidates=(sets||[]).filter((s:any)=>s.products?.active&&s.product_id!==purchase?.product_id).sort((a:any,b:any)=>{if(preferred&&a.product_id===preferred)return -1;if(preferred&&b.product_id===preferred)return 1;return Number(a.products?.price_stars||0)-Number(b.products?.price_stars||0);});for(const s of candidates){const {data:owned}=await db.from("content_access").select("id").eq("tg_user_id",userId).eq("content_set_id",s.id).eq("status","active").maybeSingle();if(owned)continue;const next:any=s.products;await trackEvent(userId,"upsell_impression",{productId:s.product_id,setId:s.id,source:preferred&&s.product_id===preferred?"configured":"automatic",meta:{purchase_id:purchaseId}});await tg(token,"sendMessage",{chat_id:chatId,text:`✨ <b>${esc(settings.upsell_message||"Das könnte dir auch gefallen:")}</b>\n\n${esc(next.title)} · ⭐ ${next.price_stars}${Number(next.price_ton)>0?` / 💎 ${Number(next.price_ton)} TON`:""}`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"Set ansehen",callback_data:`offer_${s.id}`}],[{text:"🛍 Zurück zum Shop",callback_data:"shop"}]]}});return;}const {data:vip}=await db.from("products").select("id,title,price_stars,price_ton").eq("active",true).eq("delivery_payload","vip").maybeSingle();const {data:sub}=await db.from("subscriptions").select("id").eq("tg_user_id",userId).eq("plan","vip").eq("status","active").maybeSingle();if(vip&&!sub){await trackEvent(userId,"upsell_impression",{productId:vip.id,source:"vip_fallback",meta:{purchase_id:purchaseId}});await tg(token,"sendMessage",{chat_id:chatId,text:`👑 <b>Nächster Schritt: Paid-Bereich</b>\n\n${esc(vip.title)} · ⭐ ${vip.price_stars}${Number(vip.price_ton)>0?` / 💎 ${Number(vip.price_ton)} TON`:""}`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"👑 Paid ansehen",callback_data:"vip_info"}]]}});}}
  async function deliverSet(chatId:number,userId:string,setId:string,purchaseId:string){const access=await getActiveContentAccess(userId,setId);if(!access)return false;const {data:items,error:itemsError}=await db.from("content_set_items").select("sort_order,media_files(storage_path,mime_type,display_name)").eq("content_set_id",setId).eq("item_role","protected").order("sort_order");if(itemsError)throw itemsError;if(!items?.length||items.some((item:any)=>!item.media_files?.storage_path))throw new Error("Protected set is empty or incomplete");for(const item of items){const file:any=item.media_files;const {data:signed,error}=await db.storage.from("media-vault").createSignedUrl(file.storage_path,900);if(error||!signed?.signedUrl)throw error||new Error("signed URL failed");const isVideo=String(file.mime_type||"").startsWith("video/");await tg(token,isVideo?"sendVideo":"sendPhoto",{chat_id:chatId,[isVideo?"video":"photo"]:signed.signedUrl,protect_content:true,caption:esc(file.display_name||"")});}const {error:openedError}=await db.from("content_access").update({last_opened_at:new Date().toISOString()}).eq("id",access.id);if(openedError)throw openedError;if(purchaseId){const {data:delivered,error:deliveryError}=await db.from("purchases").update({delivery_status:"delivered",delivered_at:new Date().toISOString(),delivery_note:"protected Telegram delivery"}).eq("id",purchaseId).eq("tg_user_id",userId).select("id").single();if(deliveryError||!delivered)throw deliveryError||new Error("Delivery record missing");try{await sendNextOffer(chatId,userId,purchaseId);}catch{console.warn("Post-delivery offer failed");}}return true;}

  async function fulfillStars(chatId:number,user:any,purchase:any,product:any,recovery=false){
    if(product?.delivery_payload?.startsWith("content:")){
      const setId=String(product.delivery_payload).slice(8);
      const {data:set,error:setError}=await db.from("content_sets").select("id,access_mode,access_hours").eq("id",setId).eq("product_id",product.id).maybeSingle();
      if(setError||!set)throw setError||new Error("Purchased set unavailable");
      const {data:existing,error:lookupError}=await db.from("content_access").select("id,status,expires_at,purchase_id").eq("tg_user_id",user.id).eq("content_set_id",setId).maybeSingle();
      if(lookupError)throw lookupError;
      if(existing?.status==="revoked")throw new Error("Access revoked; manual review required");
      const active=existing?.status==="active"&&(!existing.expires_at||Date.parse(existing.expires_at)>Date.now());
      if(!active){
        if(existing?.purchase_id===purchase.id)throw new Error("Previous entitlement expired; manual review required");
        const expires=set.access_mode==="hours"?new Date(Date.now()+Math.max(1,Number(set.access_hours||24))*3600000).toISOString():null;
        const row={purchase_id:purchase.id,status:"active",expires_at:expires,source:"purchase"};
        const {error}=existing?await db.from("content_access").update(row).eq("id",existing.id).eq("tg_user_id",user.id).select("id").single():await db.from("content_access").insert({...row,tg_user_id:user.id,content_set_id:setId}).select("id").single();
        if(error)throw error;
      }
      if(recovery){
        if(!await getActiveContentAccess(user.id,setId))throw new Error("Content access not active");
        await tg(token,"sendMessage",{chat_id:chatId,text:"✅ Dein bezahltes Set ist freigeschaltet. Du kannst es unter Meine Inhalte öffnen.",protect_content:true,reply_markup:{inline_keyboard:[[{text:"Meine Inhalte",callback_data:"my_content"}]]}});
        const {error}=await db.from("purchases").update({delivery_status:"delivered",delivered_at:new Date().toISOString(),delivery_note:"Recovered entitlement; access notification sent"}).eq("id",purchase.id).eq("tg_user_id",user.id).select("id").single();
        if(error)throw error;
      }else if(!await deliverSet(chatId,user.id,setId,purchase.id))throw new Error("Content access not active");
    }else if(product?.delivery_payload==="vip"){
      await grantVip(chatId,user,purchase.id,recovery);
    }else if(product?.delivery_payload==="bundle:content"||product?.kind==="bundle"){
      await grantBundle(chatId,user,purchase.id,product.id,recovery);
    }else if(product?.delivery_type==="text"){
      if(recovery)throw new Error("Text recovery requires manual review");
      await tg(token,"sendMessage",{chat_id:chatId,text:String(product.delivery_payload||"✅ Zahlung bestätigt."),protect_content:true});
      const {error}=await db.from("purchases").update({delivery_status:"delivered",delivered_at:new Date().toISOString(),delivery_note:"protected Telegram text delivery"}).eq("id",purchase.id).eq("tg_user_id",user.id).select("id").single();
      if(error)throw error;
    }else throw new Error("Unsupported purchased product");
  }
  async function markStarsFailure(id:string,userId:string){
    const {error}=await db.from("purchases").update({delivery_status:"failed",delivery_note:"Stars delivery requires recovery"}).eq("id",id).eq("tg_user_id",userId).eq("status","paid").neq("delivery_status","delivered").neq("delivery_status","revoked");
    if(error)throw error;
  }

  if(msg?.chat?.type==="private"&&msg.chat.id===msg.from?.id&&/^\/zahlung(?:@\w+)?$/i.test(text)){
    const user=await ensureUser(msg.from);
    const {data:rows,error}=await db.from("purchases").select("id,product_id,title_snapshot,delivery_status").eq("tg_user_id",user.id).eq("currency","stars").eq("status","paid").not("telegram_charge_id","is",null).in("delivery_status",["pending","failed"]).order("created_at",{ascending:false}).limit(10);
    if(error)throw error;
    await tg(token,"sendMessage",{chat_id:msg.chat.id,text:rows?.length?"Bestätigte Käufe mit offener Zustellung. Bitte nicht erneut bezahlen.":"Keine offene Stars-Auslieferung gefunden.",protect_content:true,reply_markup:{inline_keyboard:(rows||[]).map((row:any)=>[{text:String(row.title_snapshot||"Kauf").slice(0,48)+" – prüfen",callback_data:"recoverstars_"+row.id}])}});
    return json({ok:true});
  }

  const contentQuery = update?.callback_query;
  const contentAction = String(contentQuery?.data ?? "");
  if(contentQuery&&contentAction.startsWith("recoverstars_")){
    await tg(token,"answerCallbackQuery",{callback_query_id:contentQuery.id});
    const target=contentQuery.message?.chat;
    if(target?.type!=="private"||target.id!==contentQuery.from?.id)return json({ok:true});
    const id=contentAction.slice(13);
    if(!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))return json({ok:true});
    const user=await ensureUser(contentQuery.from);
    const cutoff=new Date(Date.now()-10*60_000).toISOString();
    const {data:row,error}=await db.from("purchases").select("id,product_id,delivery_status,updated_at").eq("id",id).eq("tg_user_id",user.id).eq("currency","stars").eq("status","paid").not("telegram_charge_id","is",null).maybeSingle();
    if(error)throw error;
    if(!row||!["pending","failed"].includes(row.delivery_status)||row.updated_at>=cutoff){
      await tg(token,"sendMessage",{chat_id:target.id,text:"Keine offene oder bereits erneut bearbeitete Zustellung. Bitte später prüfen.",protect_content:true});return json({ok:true});
    }
    const {data:product,error:productError}=await db.from("products").select("*").eq("id",row.product_id).maybeSingle();
    if(productError)throw productError;
    if(!product||!(product.delivery_payload?.startsWith("content:")||product.delivery_payload==="vip"||product.delivery_payload==="bundle:content"||product.kind==="bundle")){
      await tg(token,"sendMessage",{chat_id:target.id,text:"Dieser Kauf benötigt eine manuelle Prüfung. Bitte nicht erneut bezahlen.",protect_content:true});return json({ok:true});
    }
    const {data:claim,error:claimError}=await db.from("purchases").update({delivery_status:"pending",updated_at:new Date().toISOString()}).eq("id",id).eq("tg_user_id",user.id).eq("currency","stars").eq("status","paid").eq("updated_at",row.updated_at).in("delivery_status",["pending","failed"]).select("id").maybeSingle();
    if(claimError)throw claimError;
    if(!claim)return json({ok:true});
    try{await fulfillStars(target.id,user,row,product,true);}catch(e){await markStarsFailure(id,user.id);throw e;}
    return json({ok:true});
  }
  const contentPage = /^my_content(?:_(\d{1,6}))?$/.exec(contentAction);
  if (contentQuery && (contentPage || contentAction.startsWith("content_"))) {
    await tg(token, "answerCallbackQuery", { callback_query_id: contentQuery.id });
    const target = contentQuery.message?.chat;
    if (target?.type !== "private" || target.id !== contentQuery.from?.id) return json({ ok: true });
    const user = await ensureUser(contentQuery.from);
    if (contentPage) {
      await sendContentPage(target.id, user.id, Number(contentPage[1] ?? 0));
    } else if (!await deliverSet(target.id, user.id, contentAction.slice(8), "")) {
      await tg(token, "sendMessage", {
        chat_id: target.id,
        text: "Dieser Inhalt ist nicht freigeschaltet oder der Zugriff ist abgelaufen.",
        reply_markup: { inline_keyboard: [[{ text: "Meine Inhalte", callback_data: "my_content" }]] },
      });
    }
    return json({ ok: true });
  }
  if (msg?.chat?.type === "private" && /^\/inhalte(?:@\w+)?$/i.test(text)) {
    const user = await ensureUser(msg.from);
    await sendContentPage(Number(msg.chat.id), user.id);
    return json({ ok: true });
  }

  const cryptoCheck = /^(checkton|checktrx)_(.+)$/.exec(contentAction);
  if (contentQuery && cryptoCheck) {
    await tg(token, "answerCallbackQuery", { callback_query_id: contentQuery.id });
    const target = contentQuery.message?.chat;
    if (target?.type !== "private" || target.id !== contentQuery.from?.id) return json({ ok: true });
    const user = await ensureUser(contentQuery.from);
    const currency = cryptoCheck[1] === "checkton" ? "ton" : "trx";
    const purchaseId = cryptoCheck[2];
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(purchaseId)) return json({ ok: true });
    const { data: purchase, error } = await db.from("purchases")
      .select("id,status,delivery_status").eq("id", purchaseId)
      .eq("tg_user_id", user.id).eq("currency", currency).maybeSingle();
    if (error) throw error;
    const message = !purchase ? "Diese Zahlung wurde nicht gefunden."
      : purchase.status === "paid" && purchase.delivery_status === "delivered" ? "✅ Zahlung bestätigt. Deine Freischaltung wurde verarbeitet."
      : purchase.delivery_status === "revoked" ? "Dieser Zugriff wurde widerrufen. Bitte kontaktiere den Support."
      : purchase.status === "paid" ? "✅ Zahlung bestätigt. Die automatische Auslieferung wird erneut versucht. Bitte nicht erneut bezahlen."
      : purchase.status === "pending" ? "⏳ Die Blockchain-Zahlung wird automatisch geprüft. Bitte nach einigen Minuten erneut nachsehen."
      : "Diese Bestellung ist nicht mehr offen. Bitte kontaktiere bei Fragen den Support.";
    await tg(token, "sendMessage", { chat_id: target.id, text: message, protect_content: true,
      reply_markup: { inline_keyboard: [[{ text: "Meine Inhalte", callback_data: "my_content" }]] } });
    return json({ ok: true });
  }

  if (contentQuery && contentAction.startsWith("trx_")) {
    await tg(token, "answerCallbackQuery", { callback_query_id: contentQuery.id });
    const target = contentQuery.message?.chat;
    if (target?.type === "private" && target.id === contentQuery.from?.id) {
      const user = await ensureUser(contentQuery.from);
      await beginTrx(target.id, user, contentAction.slice(4));
    }
    return json({ ok: true });
  }

  const quickShop=update?.callback_query;const quickData=String(quickShop?.data||"");if(quickShop&&(["shop","main_menu","vip_info","vip_stars","vip_ton","referral","for_you"].includes(quickData)||quickData.startsWith("offer_")||quickData.startsWith("bundle_"))){const user=await ensureUser(quickShop.from);const chatId=Number(quickShop.message?.chat?.id);await tg(token,"answerCallbackQuery",{callback_query_id:quickShop.id});if(quickData==="shop")await sendShop(chatId,user);else if(quickData==="for_you")await sendForYou(chatId,user);else if(quickData==="main_menu")await sendMainMenu(chatId);else if(quickData==="referral"){const username=String(cred?.bot_username||"").replace(/^@/,"");const link=`https://t.me/${username}?start=r_${user.referral_code}`;const {count:refCount}=await db.from("referral_rewards").select("id",{count:"exact",head:true}).eq("referrer_id",user.id).in("status",["granted","delivered"]);const threshold=Math.max(2,Number(settings.referral_tier_threshold||3));const count=Number(refCount||0);const next=count<threshold?threshold:count<threshold*2?threshold*2:null;await tg(token,"sendMessage",{chat_id:chatId,text:`🎁 <b>Freunde empfehlen</b>\n\nErfolgreiche Empfehlungen: <b>${count}</b>${next?`\nNächster Bonus-Level bei: <b>${next}</b>`:"\n🏆 Höchstes Referral-Level erreicht"}\n\nSobald eine geworbene Person erstmals bezahlt, bekommst du automatisch ein noch nicht gekauftes Set als Bonus.\n\n${link}`,parse_mode:"HTML"});await trackEvent(user.id,"referral_link_view",{source:"menu",meta:{successful_referrals:count,next_tier:next}});}else if(quickData==="vip_info"){const benefits=String(settings.vip_benefits||"Exklusive Drops|Paid-Bereich mit geschützten Inhalten|Früher Zugang zu neuen Sets").split("|").map((x:string)=>x.trim()).filter(Boolean).slice(0,4);await trackEvent(user.id,"vip_offer_view",{source:"menu"});await tg(token,"sendMessage",{chat_id:chatId,text:`👑 <b>${esc(settings.vip_product_title||"VIP-Zugang")}</b>\n\n${benefits.map((b:string)=>`✓ ${esc(b)}`).join("\n")}\n\nZugang wird erst nach bestätigter Zahlung aktiviert.\n\n⭐ ${Number(settings.vip_price_stars||450)} Stars · 💎 ${Number(settings.vip_price_ton||2)} TON`,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:`⭐ ${Number(settings.vip_price_stars||450)} Stars`,callback_data:"vip_stars"},{text:`💎 ${Number(settings.vip_price_ton||2)} TON`,callback_data:"vip_ton"}],[{text:"🛍 Shop",callback_data:"shop"},{text:"⬅️ Hauptmenü",callback_data:"main_menu"}]]}});}else if(quickData==="vip_stars")await sendVipStarsInvoice(chatId,user);else if(quickData==="vip_ton")await beginVipTon(chatId,user);else if(quickData.startsWith("bundle_"))await sendBundleOffer(chatId,quickData.slice(7),user);else await sendOffer(chatId,quickData.slice(6),user);return json({ok:true,menu:true});}
  if(msg?.chat?.type==="private"&&/^\/shop(?:@\w+)?$/i.test(text)){const user=await ensureUser(msg.from);await sendShop(Number(msg.chat.id),user);return json({ok:true,shop:true});}
  if(msg?.chat?.type==="private"&&/^\/start(?:@\w+)?$/i.test(text)){await ensureUser(msg.from);await sendMainMenu(Number(msg.chat.id));return json({ok:true,menu:true});}

  const pcq=update?.pre_checkout_query;
  if(pcq){const payload=String(pcq.invoice_payload||"");let valid=false;if(payload.startsWith("p:")){const id=payload.slice(2);const {data:p}=await db.from("products").select("price_stars,active,kind").eq("id",id).maybeSingle();const {data:u}=await db.from("tg_users").select("id").eq("telegram_id",pcq.from?.id).maybeSingle();let intended=0;if(u?.id){const {data:intent}=await db.from("invoice_intents").select("amount_stars").eq("tg_user_id",u.id).eq("payload",payload).eq("paid",false).order("created_at",{ascending:false}).limit(1).maybeSingle();intended=Number(intent?.amount_stars||0);}const listed=Math.max(1,Math.round(Number(p?.price_stars||0)));valid=Boolean(p?.active)&&(p?.kind==="bundle"?(intended>0&&Number(pcq.total_amount)===intended):(Number(pcq.total_amount)===listed||(intended>0&&Number(pcq.total_amount)===intended)));}await tg(token,"answerPreCheckoutQuery",{pre_checkout_query_id:pcq.id,ok:valid,...(valid?{}:{error_message:"Dieses Angebot ist nicht mehr verfügbar."})});return json({ok:true,precheckout:valid});}

  if(msg?.successful_payment&&msg?.chat?.id){const sp=msg.successful_payment;const payload=String(sp.invoice_payload||"");const charge=String(sp.telegram_payment_charge_id||"");const user=await ensureUser(msg.from);if(!charge||sp.currency!=="XTR"||!Number.isSafeInteger(sp.total_amount)||sp.total_amount<=0||msg.chat.type!=="private"||msg.chat.id!==msg.from?.id)throw new Error("Invalid Stars payment");const {data:old,error:lookupError}=await db.from("purchases").select("id,product_id,delivery_status,tg_user_id").eq("telegram_charge_id",charge).maybeSingle();if(lookupError)throw lookupError;if(old&&(old.tg_user_id!==user.id||payload!==`p:${old.product_id}`))throw new Error("Payment ownership mismatch");if(old)return json({ok:true,paid:true,duplicate:true,delivery_status:old.delivery_status});let purchase=old;let product:any=null;if(payload.startsWith("p:"))product=(await db.from("products").select("*").eq("id",payload.slice(2)).maybeSingle()).data;if(!product)throw new Error("Unknown paid product");if(!purchase){const {data:created,error}=await db.from("purchases").insert({tg_user_id:user.id,product_id:product?.id||null,referrer_id:user.referred_by||null,title_snapshot:product?.title||"Telegram-Kauf",currency:"stars",amount_stars:Number(sp.total_amount||0),status:"paid",telegram_charge_id:charge,delivery_status:"pending"}).select("id,product_id,delivery_status").single();if(error){if(error.code==="23505"){const {data:race,error:raceError}=await db.from("purchases").select("id,tg_user_id,product_id,delivery_status").eq("telegram_charge_id",charge).maybeSingle();if(raceError)throw raceError;if(race?.tg_user_id===user.id&&race.product_id===product.id)return json({ok:true,paid:true,duplicate:true,delivery_status:race.delivery_status});}throw error;}purchase=created;}try{await fulfillStars(Number(msg.chat.id),user,purchase,product);}catch(e){await markStarsFailure(purchase.id,user.id);throw e;}if(String(product?.title||"").startsWith("System-Test")){await db.from("products").update({active:false}).eq("id",product.id);}await db.from("invoice_intents").update({paid:true}).eq("tg_user_id",user.id).eq("payload",payload).eq("paid",false);await grantReferralReward(user,purchase.id);await trackEvent(user.id,"purchase_paid",{productId:product?.id||null,source:"stars",meta:{purchase_id:purchase.id,amount_stars:Number(sp.total_amount||0)}});await trackPurchaseAttribution(user.id,product?.id||null,purchase.id);return json({ok:true,paid:true});}

  const cq=update?.callback_query;if(cq){const user=await ensureUser(cq.from);const chatId=Number(cq.message?.chat?.id);const data=String(cq.data||"");await tg(token,"answerCallbackQuery",{callback_query_id:cq.id});if(data.startsWith("bstars_")){const {data:p}=await db.from("products").select("*").eq("id",data.slice(7)).eq("active",true).eq("kind","bundle").maybeSingle();if(p){const state=await bundleState(user.id,p.id);const amount=state.total>0?Math.max(1,Math.round(Number(p.price_stars||0)*(state.missing.length/state.total))):Math.max(1,Math.round(Number(p.price_stars||0)));await sendStarsInvoiceAmount(chatId,p,user,amount,state.owned>0?"bundle_upgrade_stars":"bundle_stars");}return json({ok:true});}if(data.startsWith("bton_")){await beginBundleTon(chatId,user,data.slice(5));return json({ok:true});}if(data.startsWith("stars_")){if(await sendOwnedSet(chatId,user.id,data.slice(6)))return json({ok:true});const offer=await productForSet(data.slice(6));if(offer)await sendStarsInvoice(chatId,offer.product,user);return json({ok:true});}if(data.startsWith("ton_")){if(await sendOwnedSet(chatId,user.id,data.slice(4)))return json({ok:true});await beginTon(chatId,user,data.slice(4));return json({ok:true});}}

  const start=text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?/i);if(start&&msg?.chat?.type==="private"){const payload=String(start[1]||"");let user=await ensureUser(msg.from);if(payload.startsWith("r_")){user=await applyReferral(user,payload.slice(2));await tg(token,"sendMessage",{chat_id:msg.chat.id,text:"🎁 Empfehlung gespeichert. Willkommen – du kannst jetzt Free, Shop oder Paid öffnen.",reply_markup:{inline_keyboard:[[{text:"🛍 Shop",callback_data:"shop"},{text:"🎁 Free",url:String(settings.free_group_url||"https://t.me/")}],[{text:"🏠 Menü",callback_data:"main_menu"}]]}});return json({ok:true,referral:true});}if(payload.startsWith("c_")){const raw=payload.slice(2);const m=raw.match(/^([0-9a-f-]{36})(?:_free(?:_([AB]))?)?$/i);const setId=m?.[1]||raw;const variant=String(m?.[2]||"");const source=raw.includes("_free")?`free${variant?":"+variant:""}`:"direct";await trackEvent(user.id,"teaser_click",{setId,source,meta:{variant:variant||null}});await sendOffer(Number(msg.chat.id),setId,user);return json({ok:true,offer:true});}if(payload.startsWith("p_")){const raw=payload.slice(2);const productId=raw.endsWith("_recover")?raw.slice(0,-8):raw;const p:any=(await db.from("products").select("*").eq("id",productId).eq("active",true).maybeSingle()).data;if(p){await trackEvent(user.id,raw.endsWith("_recover")?"recovery_click":"product_deeplink",{productId:p.id,source:raw.endsWith("_recover")?"recovery":"direct"});if(p.kind==="bundle"){await sendBundleOffer(Number(msg.chat.id),p.id,user);}else{const set=(await db.from("content_sets").select("id").eq("product_id",p.id).eq("status","active").maybeSingle()).data;if(set)await sendOffer(Number(msg.chat.id),set.id,user);else await sendStarsInvoice(Number(msg.chat.id),p,user);}return json({ok:true,offer:true});}}if(payload==="menu"){await sendMainMenu(Number(msg.chat.id));return json({ok:true,menu:true});}await sendMainMenu(Number(msg.chat.id));return json({ok:true,start:true});}

  let setupCode="";const setup=text.match(/^\/start(?:@\w+)?\s+(S[A-Z0-9]{6,12})/i);if(setup)setupCode=setup[1].toUpperCase();let row:any=null;if(setupCode)row=(await db.from("chat_setup_codes").select("*").eq("code",setupCode).maybeSingle()).data;if(!row&&chat){const pending=(await db.from("chat_setup_codes").select("*").is("used_at",null).gt("expires_at",new Date().toISOString()).order("created_at")).data||[];const group=["group","supergroup","channel"].includes(String(chat.type||""));row=pending.find((r:any)=>group?r.target!=="control":r.target==="control")||null;}if(row&&chat&&!row.used_at){const target=String(row.target);const col=target==="community"?"community_chat_id":target==="shop"?"shop_chat_id":"control_chat_id";await db.from("bot_settings").update({[col]:String(chat.id)}).eq("id",true);await db.from("chat_setup_codes").update({used_at:new Date().toISOString(),chat_id:String(chat.id),chat_title:String(chat.title||chat.first_name||""),status:"connected",detail:"Zuordnung gespeichert"}).eq("id",row.id);return json({ok:true,setup:"connected",target});}
  return json({ok:true});
}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);}});
