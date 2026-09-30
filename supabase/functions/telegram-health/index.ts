import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
async function sha256Hex(value:string){const data=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");}
async function tg(token:string,method:string,body:Record<string,unknown>={}){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();if(!r.ok||!j?.ok)throw new Error(j?.description||`${method} failed`);return j.result;}

Deno.serve(async(req)=>{try{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:settings,error:settingsError}=await db.from("bot_settings").select("community_chat_id,shop_chat_id,control_chat_id,cart_recovery_token_hash,app_base_url").eq("id",true).maybeSingle();
  if(settingsError)throw settingsError;
  const provided=req.headers.get("x-cron-token")||"";
  if(!provided||await sha256Hex(provided)!==String(settings?.cart_recovery_token_hash||""))return json({ok:false,error:"unauthorized"},401);

  const {data:cred,error:credError}=await db.from("bot_credentials").select("bot_token,bot_username").eq("id",true).maybeSingle();
  if(credError)throw credError;
  const token=String(cred?.bot_token||"");
  if(!token)return json({ok:false,error:"bot_not_configured"},503);

  const me=await tg(token,"getMe");
  const body=await req.json().catch(()=>({}));
  const base=String(settings?.app_base_url||"https://fan-hub-vercel2.vercel.app").replace(/\\\/$/,"");
  const expected=`${base}/api/public/telegram/webhook`;
  let webhook=await tg(token,"getWebhookInfo");
  if(body?.repair===true&&String(webhook?.url||"")!==expected){
    const bytes=new TextEncoder().encode(`telegram-webhook:${token}`);
    const digest=await crypto.subtle.digest("SHA-256",bytes);
    const secret=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    await tg(token,"setWebhook",{url:expected,secret_token:secret,allowed_updates:["message","edited_message","callback_query","pre_checkout_query","my_chat_member","channel_post"],drop_pending_updates:false});
    webhook=await tg(token,"getWebhookInfo");
  }
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
  let promoProbe:any=null;
  if(body?.promoProbe===true){
    const key=String(Deno.env.get("OPENAI_API_KEY")||"").trim();
    if(!key){promoProbe={configured:false,ok:false,error:"OPENAI_API_KEY missing"};}
    else{
      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
        body:JSON.stringify({model:"gpt-5.6-luna",input:"Antworte nur mit dem Wort OK.",max_output_tokens:64})
      });
      const j=await r.json().catch(()=>null);
      const output=(j?.output||[]).flatMap((x:any)=>x?.content||[]).find((x:any)=>x?.type==="output_text")?.text||"";
      promoProbe={configured:true,ok:r.ok&&String(output).trim().toUpperCase()==="OK",status:r.status,error:r.ok?null:String(j?.error?.message||j?.error?.code||"OpenAI request failed").slice(0,240)};
    }
  }
  let purchaseTest:any=null;
  if(body?.purchaseTest===true&&String(settings?.control_chat_id||"").trim()){
    const {data:testProduct,error:testProductError}=await db.from("products").select("id,title,description,price_stars,active").eq("title","System-Test Â· 1 Star").maybeSingle();
    if(testProductError)throw testProductError;
    if(!testProduct?.active)throw new Error("1-Star-Testprodukt ist nicht aktiv.");
    const sent=await tg(token,"sendInvoice",{
      chat_id:String(settings.control_chat_id).trim(),
      title:String(testProduct.title).slice(0,32),
      description:String(testProduct.description||"Zahlungs- und Auslieferungstest").slice(0,255),
      payload:`p:${testProduct.id}`,
      currency:"XTR",
      prices:[{label:"System-Test",amount:1}]
    });
    purchaseTest={sent:Boolean(sent?.message_id),messageId:sent?.message_id??null};
  }
  let webhookProbe:any=null;
  if(body?.webhookProbe===true){
    const bytes=new TextEncoder().encode(`telegram-webhook:${token}`);
    const digest=await crypto.subtle.digest("SHA-256",bytes);
    const secret=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    const r=await fetch(expected,{method:"POST",headers:{"Content-Type":"application/json","x-telegram-bot-api-secret-token":secret},body:"{}"});
    const payload=await r.json().catch(()=>null);
    webhookProbe={status:r.status,ok:r.ok&&payload?.ok===true};
  }
  let outboundTest:any=null;
  if(body?.deliveryTest===true&&String(settings?.control_chat_id||"").trim()){
    const chatId=String(settings.control_chat_id).trim();
    const sent=await tg(token,"sendMessage",{chat_id:chatId,text:"âœ… Telegram Live-Test: Senden funktioniert.",disable_notification:true});
    outboundTest={sent:Boolean(sent?.message_id),deleted:false};
    if(sent?.message_id){
      try{await tg(token,"deleteMessage",{chat_id:chatId,message_id:sent.message_id});outboundTest.deleted=true;}catch{}
    }
  }
  const lastError=String(webhook?.last_error_message||"");
  const url=String(webhook?.url||"");
  return json({
    ok:url===expected&&!lastError&&chats.filter(x=>x.configured).every(x=>x.ok)&&(outboundTest?outboundTest.sent:true)&&(webhookProbe?webhookProbe.ok:true)&&(purchaseTest?purchaseTest.sent:true)&&(promoProbe?promoProbe.ok:true),
    bot:{username:String(me?.username||cred?.bot_username||""),id:me?.id??null},
    webhook:{url,expected,match:url===expected,pending:Number(webhook?.pending_update_count||0),lastError,lastErrorAt:webhook?.last_error_date?new Date(webhook.last_error_date*1000).toISOString():null},
    chats,
    outboundTest,
    webhookProbe,
    purchaseTest,
    promoProbe
  });
}catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500);}});