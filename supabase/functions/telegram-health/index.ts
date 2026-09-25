import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
async function sha256Hex(value:string){const data=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");}
async function tg(token:string,method:string,body:Record<string,unknown>={}){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();if(!r.ok||!j?.ok)throw new Error(j?.description||`${method} failed`);return j.result;}

Deno.serve(async(req)=>{try{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:settings,error:settingsError}=await db.from("bot_settings").select("community_chat_id,shop_chat_id,control_chat_id,cart_recovery_token_hash").eq("id",true).maybeSingle();
  if(settingsError)throw settingsError;
  const provided=req.headers.get("x-cron-token")||"";
  if(!provided||await sha256Hex(provided)!==String(settings?.cart_recovery_token_hash||""))return json({ok:false,error:"unauthorized"},401);

  const {data:cred,error:credError}=await db.from("bot_credentials").select("bot_token,bot_username").eq("id",true).maybeSingle();
  if(credError)throw credError;
  const token=String(cred?.bot_token||"");
  if(!token)return json({ok:false,error:"bot_not_configured"},503);

  const me=await tg(token,"getMe");
  const webhook=await tg(token,"getWebhookInfo");
  const expected=`${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;
  const chats:any[]=[];
  for(const [key,chatId] of Object.entries({community:settings?.community_chat_id,shop:settings?.shop_chat_id,control:settings?.control_chat_id})){
    const id=String(chatId||"").trim();
    if(!id){chats.push({key,configured:false,ok:false,detail:"not_configured"});continue;}
    try{
      if(key==="control"){
        const chat=await tg(token,"getChat",{chat_id:id});
        chats.push({key,configured:true,ok:Boolean(chat?.id),detail:chat?.type||"private"});
      }else{
        const member=await tg(token,"getChatMember",{chat_id:id,user_id:me.id});
        const status=String(member?.status||"");
        chats.push({key,configured:true,ok:["administrator","creator","member"].includes(status),detail:status||"unknown"});
      }
    }catch(e){chats.push({key,configured:true,ok:false,detail:e instanceof Error?e.message:String(e)});}
  }
  const lastError=String(webhook?.last_error_message||"");
  const url=String(webhook?.url||"");
  return json({
    ok:url===expected&&!lastError&&chats.filter(x=>x.configured).every(x=>x.ok),
    bot:{username:String(me?.username||cred?.bot_username||""),id:me?.id??null},
    webhook:{url,expected,match:url===expected,pending:Number(webhook?.pending_update_count||0),lastError,lastErrorAt:webhook?.last_error_date?new Date(webhook.last_error_date*1000).toISOString():null},
    chats
  });
}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);}});