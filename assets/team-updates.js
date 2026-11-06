/* Public approved Facebook post mirror. JSON contains only moderated, published links.
   For automatic challenge-only updates, an authenticated publishing process must commit JSON. */
(() => {
  const root=document.getElementById("campaignUpdates");
  if(!root)return;
  async function show(){
    try{
      const res=await fetch("data/back-your-team-updates.json",{cache:"no-store"});
      if(!res.ok)throw Error("Unavailable");
      const data=await res.json();
      if(!Array.isArray(data.items)||!data.items.length)return;
      const cards=document.createElement("div");
      cards.style.cssText="display:grid;gap:11px;margin-top:12px";
      const safeHosts=new Set(["www.facebook.com","facebook.com","m.facebook.com","fb.watch"]);
      const entries=data.items.slice(0,15);
      for(const item of entries){
        if(!item || typeof item.title!=="string" || typeof item.url!=="string")continue;
        const url=new URL(item.url);
        if(url.protocol!=="https:" || !safeHosts.has(url.hostname))continue;
        const el=document.createElement("article");
        el.style.cssText="padding:16px;border:1px solid #dbe3e8;background:#f9fafb;border-radius:10px";
        const heading=document.createElement("strong");
        heading.textContent=item.title.slice(0,120);
        el.append(heading);
        if(typeof item.publishedAt==="string" && !Number.isNaN(Date.parse(item.publishedAt))){
          const date=document.createElement("small");
          date.style.cssText="display:block;color:#687587;margin:5px 0";
          date.textContent=new Date(item.publishedAt).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium"});
          el.append(date);
        }
        if(typeof item.summary==="string"){
          const p=document.createElement("p");
          p.textContent=item.summary.slice(0,300);
          el.append(p);
        }
        const link=document.createElement("a");
        link.href=url.href;
        link.target="_blank";link.rel="noopener noreferrer";
        link.textContent="View original EBiZ Facebook post ↗";
        el.append(link);
        cards.append(el);
      }
      if(cards.children.length)root.replaceChildren(cards);
    }catch(_err){
      // A failed public JSON read never exposes private uploads or blocks application.
    }
  }
  show();
})();
