// Supabase Edge Function: public entry via Turnstile + private signed upload URLs.
// Deployment gates are server-side. Static site settings CANNOT open a contest.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
const STATUS = Deno.env.get("PROMO_STATUS") || "prelaunch";
const PERMIT = Deno.env.get("PROMO_PERMIT_NUMBER") || "";
const OPEN = Date.parse(Deno.env.get("PROMO_ENTRY_OPENS") || "");
const CLOSE = Date.parse(Deno.env.get("PROMO_ENTRY_CLOSES") || "");
const SALT = Deno.env.get("ABUSE_HASH_SALT") || "";
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://apxinfinity.github.io";
const BUCKET = "team-entry-private";
const TERMS_VERSION = "2026-11-06-draft-01";
const MAX = {video:45*1024*1024,consents:20*1024*1024,endorsement:10*1024*1024};
const PROVINCES = ["Samar","Northern Samar","Eastern Samar","Leyte","Southern Leyte","Biliran"];
const SPORTS = ["Basketball","Volleyball","Futsal","Other organized team sport"];
type Data = Record<string,unknown>;

function json(body: Data,code=200): Response {
  return new Response(JSON.stringify(body),{
    status:code,
    headers:{"Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store","Access-Control-Allow-Origin":ORIGIN,
      "Access-Control-Allow-Headers":"content-type,apikey",
      "Access-Control-Allow-Methods":"POST,OPTIONS"}
  });
}
function fail(message:string,status=400):Response {return json({ok:false,error:message},status);}
function str(x:unknown,max=160){return typeof x === "string"?x.trim().slice(0,max+1):"";}
function normalized(x:string){return x.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en");}
function truth(x:unknown){return x === true;}
function hex(buf:Uint8Array){return Array.from(buf).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function hash(s:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));}
function rand(n=20){return hex(crypto.getRandomValues(new Uint8Array(n)));}
function active(){
  return STATUS === "open" && !!PERMIT && PERMIT.length>=5 &&
    Number.isFinite(OPEN) && Number.isFinite(CLOSE) &&
    Date.now()>=OPEN && Date.now()<=CLOSE;
}
const isEmail=(s:string)=>s.length<=160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone=(s:string)=>/^(?:\+63|0)9[0-9]{9}$/.test(s);

async function human(token:string,remoteIP:string){
  const params = new URLSearchParams({secret:TURNSTILE_SECRET,response:token});
  if(remoteIP)params.set("remoteip",remoteIP);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
    method:"POST",body:params,signal:AbortSignal.timeout(12000)});
  const result=await response.json();
  return result.success===true && result.hostname === "apxinfinity.github.io";
}
const sb = URL && SECRET ? createClient(URL,SECRET,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{"X-Client-Info":"ebiz-team-intake"}}
}) : null;

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return fail("Method not supported.",405);
  // CORS only defends browsers; Turnstile + limits are the actual spam barriers.
  const origin=req.headers.get("origin");
  if(origin && origin !== ORIGIN)return fail("Site origin not authorized.",403);
  if(!sb || !SECRET || !TURNSTILE_SECRET || !SALT || !active())
    return fail("Submissions are not currently open or configured.",403);
  const len=Number(req.headers.get("content-length")||"0");
  if(len>20000)return fail("Payload too large.",413);
  let body:Data={};
  try{body=await req.json();}catch{return fail("Invalid JSON.");}
  const action=str(body.action,16);
  // Only identify the daily anti-abuse fingerprint; never save raw IP.
  const ip=(req.headers.get("x-forwarded-for")||"").split(",")[0].trim().slice(0,80);
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const finger=await hash(SALT+":"+day+":"+ip);
  try{
    if(action==="start"){
      const captcha=str(body.turnstileToken,4096);
      if(!captcha || !(await human(captcha,ip)))return fail("Human verification failed; please retry.",403);
      const {data:hits,error:herr}=await sb.rpc("team_sponsor_hit_rate_limit",{p_fingerprint:finger});
      if(herr)throw herr;
      if(Number(hits)>5)return fail("Too many attempts today. Contact EBiZ for assistance.",429);
      const teamName=str(body.teamName,90), organization=str(body.organization,110);
      const orgType=str(body.orgType,20), sport=str(body.sport,80);
      const province=str(body.province,40),municipality=str(body.municipality,80);
      const story=str(body.story,600);
      const repName=str(body.repName,100),repRole=str(body.repRole,80);
      const repEmail=str(body.repEmail,160).toLowerCase(),repPhone=str(body.repPhone,20);
      const signature=str(body.signature,100),hasMinors=str(body.hasMinors,10);
      const count=Number(body.kitCount);
      if(!PROVINCES.includes(province)||!SPORTS.includes(sport)||
        !["school","barangay","club"].includes(orgType)||
        !Number.isInteger(count)||count<6||count>18||
        !["yes","no"].includes(hasMinors)||
        teamName.length<3||organization.length<3||municipality.length<2||
        story.length<50||story.length>600||repName.length<3||repRole.length<3||
        !isEmail(repEmail)||!isPhone(repPhone)||normalized(repName)!==normalized(signature)||
        !["terms","privacyConsent","mediaAuthority","schoolAuthority","truth"].every(k=>truth(body[k])))
          return fail("Application is missing required valid information or signed declarations.");
      const {data:duplicates,error:dupErr}=await sb.from("team_sponsor_submissions")
        .select("id").eq("team_key",normalized(teamName))
        .eq("organization_key",normalized(organization))
        .eq("province",province)
        .in("status",["submitted_pending_review","approved","rejected","withdrawn","winner"]).limit(1);
      if(dupErr)throw dupErr;
      const {data:emailDup,error:mailErr}=await sb.from("team_sponsor_submissions")
        .select("id").eq("rep_email",repEmail)
        .in("status",["submitted_pending_review","approved","rejected","withdrawn","winner"]).limit(1);
      if(mailErr)throw mailErr;
      if((duplicates?.length||0)>0 || (emailDup?.length||0)>0)
        return fail("This team or representative already has an official entry. Contact EBiZ if you believe this is incorrect.",409);
      const id=crypto.randomUUID(),claimToken=rand(32);
      const receipt="EBT27-"+rand(5).toUpperCase();
      const uploadPaths={video:id+"/entry.mp4",consents:id+"/signed-consents.pdf",endorsement:id+"/signed-authorization.pdf"};
      const now=new Date().toISOString();
      const {error:insertErr}=await sb.from("team_sponsor_submissions").insert({
        id,receipt,status:"draft",
        team_name:teamName,team_key:normalized(teamName),
        sport,org_type:orgType,organization,organization_key:normalized(organization),
        province,municipality,kit_count:count,has_minors:hasMinors==="yes",story,
        rep_name:repName,rep_role:repRole,rep_email:repEmail,rep_phone:repPhone,
        signed_name:signature,
        consent_claims:{
          terms:true,privacyConsent:true,mediaAuthority:true,schoolAuthority:true,
          truth:true,marketingOptin:truth(body.marketingOptin)
        },
        terms_version:TERMS_VERSION,accepted_at:now,abuse_fingerprint:finger,
        claim_token_hash:await hash(claimToken),
        video_path:uploadPaths.video,consents_path:uploadPaths.consents,
        endorsement_path:uploadPaths.endorsement
      });
      if(insertErr)throw insertErr;
      const tickets:Record<string,{path:string,token:string}>={};
      for(const [name,path] of Object.entries(uploadPaths)){
        const {data,error}=await sb.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});
        if(error||!data)throw error||Error("Could not generate private upload URL.");
        tickets[name]={path,token:data.token};
      }
      return json({ok:true,submissionId:id,claimToken,tickets});
    }
    if(action==="finish"){
      const id=str(body.submissionId,50), token=str(body.claimToken,100);
      if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id) || token.length!==64)return fail("Invalid submission receipt token.");
      const {data:row,error:lookupErr}=await sb.from("team_sponsor_submissions")
        .select("id,status,created_at,claim_token_hash,video_path,consents_path,endorsement_path,receipt")
        .eq("id",id).maybeSingle();
      if(lookupErr)throw lookupErr;
      if(!row||row.status!=="draft" || row.claim_token_hash!==await hash(token))
        return fail("Invalid or already-finalized application.",403);
      if(Date.now()-new Date(row.created_at).getTime()>2*60*60*1000)
        return fail("This upload session expired. Contact EBiZ to resolve your pending entry.",410);
      for(const [key,path] of Object.entries({
        video:row.video_path,consents:row.consents_path,endorsement:row.endorsement_path
      })){
        const {data:info,error:infoErr}=await sb.storage.from(BUCKET).info(String(path));
        if(infoErr||!info)return fail("Missing uploaded "+key+". Please contact EBiZ.",422);
        const size=Number(info.size);
        const mime=String(info.contentType||info.mimetype||"").toLowerCase().split(";")[0];
        if(!Number.isFinite(size)||size<1||size>MAX[key as keyof typeof MAX]||
          (key==="video" && mime!=="video/mp4") ||
          (key!=="video" && mime!=="application/pdf"))
          return fail("Invalid size or file type in uploaded "+key+". Contact EBiZ.",422);
      }
      const submittedAt=new Date().toISOString();
      const {data:done,error:updateErr}=await sb.from("team_sponsor_submissions")
        .update({status:"submitted_pending_review",submitted_at:submittedAt})
        .eq("id",id).eq("status","draft").select("receipt").single();
      if(updateErr) {
        if(updateErr.code==="23505")return fail("One official entry per team or representative is allowed.",409);
        throw updateErr;
      }
      return json({ok:true,receipt:done.receipt,submittedAt});
    }
    return fail("Unknown action.",404);
  }catch(e){
    console.error("team intake server error",e instanceof Error?e.name:"unknown");
    return fail("We couldn't finish the request. Please contact EBiZ if a file upload has already started.",500);
  }
});
