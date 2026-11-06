/* EBiZ Back Your Team: applicant-side checks, direct-to-private signed upload, no credentials.
   Security-critical deadlines, terms, consent and file limits are also checked on the server. */
(() => {
  "use strict";
  const cfg = window.EBIZ_CHALLENGE;
  const form = document.getElementById("teamForm");
  const fields = document.getElementById("applicationFields");
  const notice = document.getElementById("launchNotice");
  const status = document.getElementById("status");
  const button = document.getElementById("submitButton");
  const progress = document.getElementById("uploadProgress");
  if (!cfg || !form || !fields) return;
  const MB = 1024 * 1024;
  const MAX_VIDEO = cfg.videoLimitMb * MB;
  const messages = {
    prelaunch: "PRE-LAUNCH: Application portal is disabled while the DTI application, consent procedure and secure storage are being finalized.",
    closed: "Entries are currently CLOSED. Submitted materials are not accepted outside the approved window."
  };
  const phpTime = (str) => new Intl.DateTimeFormat("en-PH", {timeZone:"Asia/Manila",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(str));
  const formatSpan = (start,end) => phpTime(start) + " – " + phpTime(end) + " PHT";
  document.getElementById("entryDates").textContent = formatSpan(cfg.entryOpens,cfg.entryCloses);
  document.getElementById("voteDates").textContent = formatSpan(cfg.votingOpens,cfg.votingCloses);
  document.getElementById("awardDate").textContent = phpTime(cfg.winnerAnnouncement) + " PHT";
  const serverConfigured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && cfg.turnstileSiteKey && cfg.permitNumber);
  const now = Date.now();
  const inWindow = now >= Date.parse(cfg.entryOpens) && now <= Date.parse(cfg.entryCloses);
  const isOpen = cfg.status === "open" && serverConfigured && inWindow;
  if (!isOpen) {
    notice.textContent = cfg.status === "prelaunch" ? messages.prelaunch : (cfg.status === "closed" || now > Date.parse(cfg.entryCloses) ? messages.closed : "Applications will open during the announced DTI-approved entry period. No uploads are accepted yet.");
    fields.disabled = true;
    return;
  }
  fields.disabled = false;
  notice.textContent = "APPLICATIONS OPEN · DTI permit " + cfg.permitNumber + " · Deadline: " + phpTime(cfg.entryCloses) + " PHT. Prepare all files first.";
  notice.classList.add("ok");
  let turnstileWidget = null;
  function display(message,cls) { status.textContent = message; status.className = cls || ""; }
  function getCaptcha() {
    if (!window.turnstile || turnstileWidget === null) return "";
    return window.turnstile.getResponse(turnstileWidget);
  }
  function loadCaptcha() {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => { turnstileWidget = window.turnstile.render("#turnstile", {sitekey:cfg.turnstileSiteKey,theme:"light"}); };
    s.onerror = () => display("Verification could not load. Disable script blockers for this form and retry.","error");
    document.head.appendChild(s);
  }
  loadCaptcha();

  async function verifyVideo(file) {
    if (!file || !file.name.toLowerCase().endsWith(".mp4") || file.type !== "video/mp4") throw Error("The video must be an MP4 file.");
    if (file.size < 100000 || file.size > MAX_VIDEO) throw Error("Video size must be under " + cfg.videoLimitMb + " MB.");
    const url = URL.createObjectURL(file);
    try {
      const metadata = await new Promise((resolve,reject) => {
        const vid = document.createElement("video");
        vid.preload = "metadata";
        const timer = setTimeout(() => reject(Error("Could not inspect video metadata; export to MP4 H.264/AAC and retry.")),15000);
        vid.onloadedmetadata = () => { clearTimeout(timer);resolve({duration:vid.duration,width:vid.videoWidth,height:vid.videoHeight}); };
        vid.onerror = () => { clearTimeout(timer);reject(Error("Invalid video format. Re-export as MP4 (H.264/AAC).")); };
        vid.src = url;
      });
      if (!Number.isFinite(metadata.duration) || metadata.duration < 30 || metadata.duration > 60) throw Error("The video must be 30–60 seconds long (actual detected: " + Math.round(metadata.duration) + "s).");
      if (metadata.width < 720 || metadata.height < 1280 || metadata.height <= metadata.width) throw Error("The video must be portrait and at least 720 × 1280 pixels.");
    } finally { URL.revokeObjectURL(url); }
  }
  function verifyPdf(file,limit,label) {
    if (!file || !file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) throw Error(label + " must be a PDF.");
    if (!file.size || file.size > limit*MB) throw Error(label + " must not exceed " + limit + " MB.");
  }
  function val(fd,key) { return String(fd.get(key)||"").trim(); }
  async function request(action,payload) {
    const endpoint = cfg.supabaseUrl.replace(/\/$/,"") + "/functions/v1/" + cfg.edgeFunction;
    const response = await fetch(endpoint,{
      method:"POST",mode:"cors",
      headers:{"Content-Type":"application/json","apikey":cfg.supabaseAnonKey},
      body:JSON.stringify({action,...payload})
    });
    let result={};
    try { result=await response.json(); }catch(_e){}
    if (!response.ok || !result.ok) throw Error(result.error || "Server request failed (" + response.status + ").");
    return result;
  }
  form.addEventListener("submit",async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); display("Complete all required fields and checkboxes.","error");return; }
    const fd=new FormData(form);
    if (val(fd,"signature").toLocaleLowerCase() !== val(fd,"repName").toLocaleLowerCase()) { display("Electronic signature must exactly match representative's legal name.","error");return; }
    if (!getCaptcha()) { display("Complete the human-verification challenge first.","error");return; }
    const video=fd.get("video"), consents=fd.get("consents"), endorsement=fd.get("endorsement");
    button.disabled=true; progress.style.display="none";
    try {
      display("Validating the video and attached consent documents…");
      verifyPdf(consents,cfg.maxConsentMb,"Participant consents");
      verifyPdf(endorsement,cfg.maxEndorsementMb,"Team authorization");
      await verifyVideo(video);
      const payload = {
        turnstileToken:getCaptcha(),
        teamName:val(fd,"teamName"), sport:val(fd,"sport"), orgType:val(fd,"orgType"),
        organization:val(fd,"organization"), province:val(fd,"province"),
        municipality:val(fd,"municipality"), kitCount:Number(val(fd,"kitCount")),
        hasMinors:val(fd,"hasMinors"), story:val(fd,"story"),
        repName:val(fd,"repName"), repRole:val(fd,"repRole"),
        repEmail:val(fd,"repEmail"), repPhone:val(fd,"repPhone"),
        signature:val(fd,"signature"), terms:fd.has("terms"), privacyConsent:fd.has("privacyConsent"),
        mediaAuthority:fd.has("mediaAuthority"),schoolAuthority:fd.has("schoolAuthority"),
        truth:fd.has("truth"),marketingOptin:fd.has("marketingOptin")
      };
      display("Securing a private submission space…");
      const started=await request("start",payload);
      const storage=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const documents=[["video",video],["consents",consents],["endorsement",endorsement]];
      progress.value=0;progress.style.display="block";
      for (const [key,file] of documents) {
        const ticket=started.tickets[key];
        display("Uploading " + key + " securely… (" + (progress.value+1) + "/3). Do not close the browser.");
        const {error}=await storage.storage.from("team-entry-private").uploadToSignedUrl(ticket.path,ticket.token,file,{contentType:file.type || (key==="video"?"video/mp4":"application/pdf")});
        if (error) throw Error("Upload failed for " + key + ": " + error.message + ". Contact EBiZ if retry is needed.");
        progress.value++;
      }
      display("Checking file receipt and recording official entry timestamp…");
      const finished=await request("finish",{submissionId:started.submissionId,claimToken:started.claimToken});
      form.reset();fields.disabled=true;progress.style.display="none";
      display("SUCCESS — Entry received. SAVE THIS RECEIPT: " + finished.receipt + ". Recorded: " + phpTime(finished.submittedAt) + " PHT. This entry is pending manual document verification; it has NOT been published.","success");
      notice.textContent="Application received. EBiZ will verify all consents and eligibility before any public posting.";
      window.scrollTo({top:document.getElementById("apply").offsetTop-20,behavior:"smooth"});
    }catch(err) {
      display((err && err.message) || "An upload error occurred. No final receipt has been issued.","error");
      if(window.turnstile && turnstileWidget!==null)window.turnstile.reset(turnstileWidget);
    } finally {if (!fields.disabled) button.disabled=false;}
  });
})();
