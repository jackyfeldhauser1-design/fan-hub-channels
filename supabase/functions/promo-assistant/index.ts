import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});

function fallback(input:any){
  const title=String(input?.title||"Exklusives Set").trim().slice(0,80);
  const stars=Math.max(0,Number(input?.priceStars||0));
  const ton=Math.max(0,Number(input?.priceTon||0));
  const sales=Math.max(0,Number(input?.sales||0));
  const price=[stars>0?`⭐ ${stars} Stars`:"",ton>0?`💎 ${ton} TON`:""].filter(Boolean).join(" oder ");
  const angle=sales>2?"Beliebtheit + unkomplizierte Freischaltung":"Neugier + geschützter Sofortzugriff";
  return {
    hook:`✨ Neu im Shop: ${title}`,
    caption:`${title} ist jetzt geschützt im Bot verfügbar${price?` – ${price}`:""}. Vorschau ansehen, Zahlungsart wählen und nach bestätigter Zahlung direkt freischalten.`,
    cta:"🔓 Jetzt im Bot öffnen",
    angle,
    ai:false
  };
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    if(req.method!=="POST")return json({error:"method_not_allowed"},405);
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth=req.headers.get("Authorization")||"";
    const jwt=auth.replace(/^Bearer\s+/i,"");
    if(!jwt)return json({error:"unauthorized"},401);
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:userData,error:userErr}=await admin.auth.getUser(jwt);
    const userId=userData.user?.id;
    if(userErr||!userId)return json({error:"unauthorized"},401);
    const {data:roles,error:roleErr}=await admin.from("user_roles").select("role").eq("user_id",userId);
    if(roleErr)throw roleErr;
    if(!(roles||[]).some((r:any)=>["admin","operator"].includes(String(r.role))))return json({error:"forbidden"},403);

    const input=await req.json().catch(()=>({}));
    const base=fallback(input);
    const key=String(Deno.env.get("OPENAI_API_KEY")||"").trim();
    if(!key)return json(base);

    const prompt=[
      "Du bist ein deutscher Telegram-Commerce-Promo-Assistent.",
      "Erstelle verkaufsstarke, kurze, mobile Texte für einen Erwachsenen-Content-Shop.",
      "Bleibe nicht explizit: keine grafischen sexuellen Beschreibungen, keine Druck- oder Täuschungstaktiken.",
      "Gib ausschließlich valides JSON mit hook, caption, cta, angle zurück.",
      `Titel: ${String(input?.title||"").slice(0,120)}`,
      `Beschreibung: ${String(input?.description||"").slice(0,600)}`,
      `Preis Stars: ${Number(input?.priceStars||0)}`,
      `Preis TON: ${Number(input?.priceTon||0)}`,
      `Bisherige Verkäufe: ${Number(input?.sales||0)}`
    ].join("\n");

    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:"gpt-5.6-luna",input:prompt,max_output_tokens:350})
    });
    if(!r.ok){console.error("OpenAI",r.status,await r.text());return json(base);}
    const out=await r.json();
    const text=(out?.output||[]).flatMap((x:any)=>x?.content||[]).find((x:any)=>x?.type==="output_text")?.text||"";
    const clean=String(text).replace(/^\s*```json\s*/i,"").replace(/```\s*$/,"").trim();
    try{
      const parsed=JSON.parse(clean);
      return json({
        hook:String(parsed.hook||base.hook).slice(0,180),
        caption:String(parsed.caption||base.caption).slice(0,700),
        cta:String(parsed.cta||base.cta).slice(0,100),
        angle:String(parsed.angle||base.angle).slice(0,180),
        ai:true
      });
    }catch{return json(base);}
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},500);}
});