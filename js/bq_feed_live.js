/* B&Q Data upload – live (GitHub Pages) build: feeds the Home Data upload files to the tabs in THIS browser,
   through each tab's OWN existing file input, so the tab's own parsing and pricing code runs unchanged:
     Pricing        – Access file → #pzfile, buy box results → #pzbbfile (the same as tapping those buttons)
     Sales / Orders – orders export + Access file → the app's own "Load new data" input (#dataIn)
     Individual sales / Calculator – lookup built in this browser from Access + orders (else the published lookup.enc)
   A file is used only while it is no more than 1 day old (green badge). No server calls; nothing is sent anywhere. */
(function(){
"use strict";
if(!window.BQData)return;
var D=window.BQData,MAXAGE=1;
function fresh(rec){if(!rec)return false;var n=D.ageDays(rec.date);return n!=null&&n<=MAXAGE}
function recs(ids){return Promise.all(ids.map(function(i){return D.get(i).catch(function(){return null})}))}
function keyOf(r){return r?[r.id,r.name,r.size,r.sha256||r.stored||""].join("|"):""}
function note(host,html,cls){if(!host)return;var el=host.querySelector(".bq-feed");if(!el){el=document.createElement("div");el.className="bq-feed "+(cls||"bq-src");host.insertBefore(el,host.firstChild)}
  el.className="bq-feed "+(cls||"bq-src");el.innerHTML=html}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])})}
function oldMsg(r){return esc(r.name)+" in Data upload is "+D.ageDays(r.date)+" days old, so it is not used here. Upload today’s file on Home."}
function feedInput(inp,files,win){win=win||window;var dt=new win.DataTransfer();
  files.forEach(function(f){dt.items.add(f)});inp.files=dt.files;inp.dispatchEvent(new win.Event("change",{bubbles:true}))}
function waitFor(test,ms){return new Promise(function(res){var t0=Date.now();(function loop(){var v;try{v=test()}catch(e){v=null}
  if(v)return res(v);if(Date.now()-t0>ms)return res(null);setTimeout(loop,250)})()})}

/* ---- Pricing ---- */
function feedPricing(){var inp=document.getElementById("pzfile");if(!inp||inp.dataset.bqfed)return;inp.dataset.bqfed="1";
  waitFor(function(){var s=document.getElementById("pzsrc");return s&&!/^Reading/.test(s.textContent)},60000).then(function(){
   if(!document.body.contains(inp))return;
   return recs(["access","buybox"]).then(function(r){var a=r[0],b=r[1],host=document.getElementById("pzup"),bits=[],old=[];
    if(a&&!fresh(a))old.push(oldMsg(a));if(b&&!fresh(b))old.push(oldMsg(b));
    var p=Promise.resolve();
    if(fresh(a))p=p.then(function(){feedInput(inp,[D.fileFromRec(a)]);bits.push("Access: "+esc(a.name));
      return waitFor(function(){var m=document.getElementById("pzfmsg"),pub=document.getElementById("pzpub");return (m&&m.textContent.trim())||(pub&&!pub.classList.contains("hide"))},60000)});
    if(fresh(b))p=p.then(function(){var bi=document.getElementById("pzbbfile");if(!bi)return;feedInput(bi,[D.fileFromRec(b)]);bits.push("buy box: "+esc(b.name))});
    return p.then(function(){if(!host)return;
     if(bits.length)note(host,"Using from Data upload — "+bits.join(" · ")+". The buttons below still work the same way.");
     else if(old.length)note(host,old.join("<br>"),"bq-old")})})})}

/* ---- Sales / Orders (the app inside #frame) ---- */
var LSK="bqFeedSales.v1";
function feedApp(){var fr=document.getElementById("frame"),w=fr&&fr.contentWindow,doc;try{doc=w&&w.document}catch(e){return}
  if(!doc||!w.__v5||!w.__v5.S)return;var inp=doc.getElementById("dataIn");if(!inp||inp.dataset.bqfed)return;inp.dataset.bqfed="1";
  var app=w.__v5.S.app||"sales";
  recs(["orders","access"]).then(function(r){var o=fresh(r[0])?r[0]:null,a=fresh(r[1])?r[1]:null;if(!o&&!a)return;
   var key=keyOf(o)+"#"+keyOf(a),seen={};try{seen=JSON.parse(localStorage.getItem(LSK)||"{}")}catch(e){}
   if(seen[app]===key)return;   /* already loaded into this app once: its own store keeps it (and its own "newer built-in data" rule applies) */
   seen[app]=key;try{localStorage.setItem(LSK,JSON.stringify(seen))}catch(e){}
   var files=[o,a].filter(Boolean).map(function(x){var f=D.fileFromRec(x);return new w.File([f],f.name,{type:f.type,lastModified:f.lastModified})});
   feedInput(inp,files,w)})}

/* ---- Individual sales / Calculator ---- */
function wrapKit(){var K=window.BQTabs&&BQTabs.kit;if(!K||K.__bqFeed)return;K.__bqFeed=1;var orig=K.getJSON;
  K.getJSON=function(name){if(name!=="lookup.enc")return orig.apply(this,arguments);var self=this,args=arguments;
   return recs(["access","orders"]).then(function(r){if(!fresh(r[0])||!fresh(r[1]))return orig.apply(self,args);
    return D.buildLookup(D.fileFromRec(r[0]),D.fileFromRec(r[1])).then(function(doc){if(!doc)return orig.apply(self,args);
     setTimeout(function(){note(document.getElementById("tbody"),"Using from Data upload — Access: "+esc(r[0].name)+" · orders: "+esc(r[1].name))},50);return doc},
     function(){return orig.apply(self,args)})})}}

var CSS=".bq-src{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:8px 10px;margin:0 0 12px;font-size:14px;color:#1E3A8A;overflow-wrap:anywhere}"+
 ".bq-old{background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:8px 10px;margin:0 0 12px;font-size:14px;color:#78350F;font-weight:600;overflow-wrap:anywhere}";
function start(){if(!document.getElementById("bqfeed-css")){var s=document.createElement("style");s.id="bqfeed-css";s.textContent=CSS;document.head.appendChild(s)}
  wrapKit();new MutationObserver(function(){feedPricing()}).observe(document.body,{childList:true,subtree:true});
  setInterval(feedApp,1000)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
window.BQFeed={fresh:fresh};
})();
