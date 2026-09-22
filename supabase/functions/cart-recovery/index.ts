import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
async function sha256Hex(value:string){const data=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");}
async function tg(token:string,method:string,body:Record<string,unknown>){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await r.json();if(!r.ok||!result?.ok)throw new Error(result?.description||`${method} failed`);return result.result;}

Deno.serve(async(req)=>{try{
  if(req.method!=="POST")return json({ok:false},405);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:settings}=await db.from("bot_settings").select("cart_recovery_minutes,cart_recovery_token_hash").eq("id",true).maybeSingle();
  const provided=req.headers.get("x-cron-token")||"";
  if(!provided||await sha256Hex(provided)!==String(settings?.cart_recovery_token_hash||""))return json({ok:false},401);
  const {data:cred}=await db.from("bot_credentials").select("bot_token,bot_username").eq("id",true).maybeSingle();
  const token=String(cred?.bot_token||"");const username=String(cred?.bot_username||"").replace(/^@/,"");
  if(!token||!username)return json({ok:false,error:"bot not configured"},503);
  const minutes=Math.max(5,Number(settings?.cart_recovery_minutes||30));
  const dueBefore=new Date(Date.now()-minutes*60000).toISOString();const recentAfter=new Date(Date.now()-86400000).toISOString();let sent=0;

  const {data:stars}=await db.from("invoice_intents").select("id,tg_user_id,chat_id,payload,title").eq("paid",false).is("reminded_at",null).lte("created_at",dueBefore).gte("created_at",recentAfter).limit(50);
  for(const row of stars||[]){const productId=String(row.payload||"").startsWith("p:")?String(row.payload).slice(2):"";if(!productId)continue;const {data:paid}=await db.from("purchases").select("id").eq("tg_user_id",row.tg_user_id).eq("product_id",productId).eq("status","paid").limit(1).maybeSingle();if(paid){await db.from("invoice_intents").update({paid:true}).eq("id",row.id);continue;}await tg(token,"sendMessage",{chat_id:row.chat_id,text:`✨ Dein Set „${row.title}“ wartet noch auf dich. Du kannst weiterhin sicher mit Stars oder TON bezahlen.`,reply_markup:{inline_keyboard:[[{text:"Set erneut öffnen",url:`https://t.me/${username}?start=p_${productId}`}]]}});await db.from("invoice_intents").update({reminded_at:new Date().toISOString()}).eq("id",row.id);sent++;}

  const {data:ton}=await db.from("purchases").select("id,tg_user_id,product_id,title_snapshot,tg_users(telegram_id)").eq("currency","ton").eq("status","pending").is("reminded_at",null).lte("created_at",dueBefore).gte("created_at",recentAfter).limit(50);
  for(const row of ton||[]){const chatId=Number((row.tg_users as any)?.telegram_id||0);if(!chatId)continue;const {data:set}=await db.from("content_sets").select("id").eq("product_id",row.product_id).eq("status","active").maybeSingle();if(!set)continue;await tg(token,"sendMessage",{chat_id:chatId,text:`💎 Deine TON-Freischaltung für „${row.title_snapshot}“ ist noch offen. Wenn du bereits bezahlt hast, prüfe den Eingang.`,reply_markup:{inline_keyboard:[[{text:"✅ Zahlung prüfen",callback_data:`checkton_${row.id}`}],[{text:"Zahlung neu öffnen",callback_data:`offer_${set.id}`}]]}});await db.from("purchases").update({reminded_at:new Date().toISOString()}).eq("id",row.id);sent++;}
  return json({ok:true,sent});
}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);}});
