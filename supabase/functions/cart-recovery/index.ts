import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
async function sha256Hex(value:string){const data=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");}
async function tg(token:string,method:string,body:Record<string,unknown>){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await r.json();if(!r.ok||!result?.ok)throw new Error(result?.description||`${method} failed`);return result.result;}
function due(row:any,firstMinutes:number,secondMinutes:number,maxReminders:number){const count=Math.max(0,Number(row.recovery_count||0));if(count>=maxReminders)return false;const base=new Date(count===0?row.created_at:(row.last_recovery_at||row.reminded_at||row.created_at)).getTime();const delay=(count===0?firstMinutes:secondMinutes)*60000;return Date.now()-base>=delay;}
function recoveryText(title:string,count:number,currency:"stars"|"ton"){if(count===0)return currency==="stars"?`✨ Dein Set „${title}“ wartet noch auf dich. Wenn du es noch möchtest, kannst du die Freischaltung direkt fortsetzen.`:`💎 Deine TON-Freischaltung für „${title}“ ist noch offen. Wenn du bereits bezahlt hast, prüfe jetzt den Eingang.`;return currency==="stars"?`🔓 Letzte Erinnerung zu „${title}“: Der Kauf ist noch nicht abgeschlossen. Wenn du das Set noch möchtest, kannst du es hier erneut öffnen.`:`🔓 Letzte Erinnerung zu „${title}“: Die TON-Zahlung ist noch nicht bestätigt. Du kannst den Eingang prüfen oder die Zahlung erneut öffnen.`;}

Deno.serve(async(req)=>{try{
  if(req.method!=="POST")return json({ok:false},405);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:settings,error:settingsError}=await db.from("bot_settings").select("cart_recovery_minutes,cart_recovery_second_minutes,cart_recovery_max_reminders,cart_recovery_token_hash,reactivate_after_days,sequence_enabled").eq("id",true).maybeSingle();if(settingsError)throw settingsError;
  const provided=req.headers.get("x-cron-token")||"";
  if(!provided||await sha256Hex(provided)!==String(settings?.cart_recovery_token_hash||""))return json({ok:false},401);
  const {data:cred,error:credError}=await db.from("bot_credentials").select("bot_token,bot_username").eq("id",true).maybeSingle();if(credError)throw credError;
  const token=String(cred?.bot_token||"");const username=String(cred?.bot_username||"").replace(/^@/,"");
  if(!token||!username)return json({ok:false,error:"bot not configured"},503);

  const firstMinutes=Math.max(5,Number(settings?.cart_recovery_minutes||30));
  const secondMinutes=Math.max(120,Number(settings?.cart_recovery_second_minutes||360));
  const maxReminders=Math.min(2,Math.max(1,Number(settings?.cart_recovery_max_reminders||2)));
  const recentAfter=new Date(Date.now()-48*3600000).toISOString();
  let sent=0,skippedPaid=0;

  const {data:stars,error:starsError}=await db.from("invoice_intents").select("id,tg_user_id,chat_id,payload,title,created_at,reminded_at,recovery_count,last_recovery_at").eq("paid",false).gte("created_at",recentAfter).lt("recovery_count",maxReminders).order("created_at",{ascending:true}).limit(100);if(starsError)throw starsError;
  for(const row of stars||[]){
    if(!due(row,firstMinutes,secondMinutes,maxReminders))continue;
    const productId=String(row.payload||"").startsWith("p:")?String(row.payload).slice(2):"";if(!productId)continue;
    const {data:paid}=await db.from("purchases").select("id").eq("tg_user_id",row.tg_user_id).eq("product_id",productId).eq("status","paid").limit(1).maybeSingle();
    if(paid){await db.from("invoice_intents").update({paid:true}).eq("id",row.id);skippedPaid++;continue;}
    const count=Math.max(0,Number(row.recovery_count||0));
    await tg(token,"sendMessage",{chat_id:row.chat_id,text:recoveryText(String(row.title||"Set"),count,"stars"),reply_markup:{inline_keyboard:[[{text:count===0?"🔓 Set erneut öffnen":"🛍 Kauf fortsetzen",url:`https://t.me/${username}?start=p_${productId}_recover`}],[{text:"🏠 Zum Menü",url:`https://t.me/${username}?start=menu`}]]}});
    const now=new Date().toISOString();
    await db.from("invoice_intents").update({reminded_at:now,last_recovery_at:now,recovery_count:count+1}).eq("id",row.id);sent++;
  }

  const {data:ton,error:tonError}=await db.from("purchases").select("id,tg_user_id,product_id,title_snapshot,created_at,reminded_at,recovery_count,last_recovery_at,tg_users!purchases_tg_user_id_fkey(telegram_id)").eq("currency","ton").eq("status","pending").gte("created_at",recentAfter).lt("recovery_count",maxReminders).order("created_at",{ascending:true}).limit(100);if(tonError)throw tonError;
  for(const row of ton||[]){
    if(!due(row,firstMinutes,secondMinutes,maxReminders))continue;
    const chatId=Number((row.tg_users as any)?.telegram_id||0);if(!chatId)continue;
    const {data:set}=await db.from("content_sets").select("id").eq("product_id",row.product_id).eq("status","active").maybeSingle();if(!set)continue;
    const count=Math.max(0,Number(row.recovery_count||0));
    await tg(token,"sendMessage",{chat_id:chatId,text:recoveryText(String(row.title_snapshot||"Set"),count,"ton"),reply_markup:{inline_keyboard:[[{text:"✅ Zahlung prüfen",callback_data:`checkton_${row.id}`}],[{text:"💎 Zahlung erneut öffnen",callback_data:`offer_${set.id}`}],[{text:"🏠 Menü",callback_data:"main_menu"}]]}});
    const now=new Date().toISOString();
    await db.from("purchases").update({reminded_at:now,last_recovery_at:now,recovery_count:count+1}).eq("id",row.id);sent++;
  }

  let reactivated=0;
  if(settings?.sequence_enabled!==false){
    const reactivateDays=Math.max(7,Number(settings?.reactivate_after_days||14));
    const inactiveBefore=new Date(Date.now()-reactivateDays*86400000).toISOString();
    const cooldownAfter=new Date(Date.now()-30*86400000).toISOString();
    const {data:segments}=await db.from("customer_growth_segments").select("tg_user_id,telegram_id,first_name,last_purchase_at,segment").in("segment",["buyer","repeat"]).lt("last_purchase_at",inactiveBefore).order("last_purchase_at",{ascending:true}).limit(50);
    for(const row of segments||[]){
      if(reactivated>=10)break;
      const chatId=Number(row.telegram_id||0);if(!chatId)continue;
      const {data:recent}=await db.from("growth_events").select("id").eq("tg_user_id",row.tg_user_id).eq("event_type","reactivation_sent").gte("created_at",cooldownAfter).limit(1).maybeSingle();if(recent)continue;
      const {data:sets}=await db.from("content_sets").select("id,title,created_at,product_id,products(price_stars,price_ton,active)").eq("status","active").order("created_at",{ascending:false}).limit(20);
      let pick:any=null;
      for(const s of sets||[]){if(!(s.products as any)?.active)continue;const {data:owned}=await db.from("content_access").select("id").eq("tg_user_id",row.tg_user_id).eq("content_set_id",s.id).eq("status","active").limit(1).maybeSingle();if(!owned){pick=s;break;}}
      if(!pick)continue;
      const p:any=pick.products;
      await tg(token,"sendMessage",{chat_id:chatId,text:`✨ ${row.first_name?row.first_name+", ":""}es gibt wieder etwas Neues im Shop.\n\n„${pick.title}“ · ⭐ ${Number(p?.price_stars||0)}${Number(p?.price_ton||0)>0?` · 💎 ${Number(p.price_ton)} TON`:""}`,reply_markup:{inline_keyboard:[[{text:"Set ansehen",callback_data:`offer_${pick.id}`}],[{text:"🛍 Shop öffnen",callback_data:"shop"}]]}});
      await db.from("growth_events").insert({tg_user_id:row.tg_user_id,event_type:"reactivation_sent",product_id:pick.product_id,content_set_id:pick.id,source:"lifecycle",meta:{reactivate_after_days:reactivateDays}});
      reactivated++;
    }
  }
  return json({ok:true,sent,skippedPaid,reactivated,firstMinutes,secondMinutes,maxReminders});
}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);}});
