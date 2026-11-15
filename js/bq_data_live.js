/* B&Q Data upload – live (GitHub Pages) build: browser only.
   Files are kept in IndexedDB bq_data_upload in THIS browser and read by the tabs here.
   No server calls at all (no /api, no /out). Nothing is sent to B&Q, Mirakl or GitHub.
   Age badge: green if 1 day old or less, red if more than 1 day old. */
(function(){
"use strict";
var DB_NAME="bq_data_upload", STORE="slots", RED_AFTER=1;
var SLOTS=[
  {id:"access", title:"Access file", help:"The Access export. It needs a sheet called B&QBB3, or a sheet with a column called Estimated cost.", accept:".xlsx,.xls,.xlsm", kinds:"excel"},
  {id:"all_variant", title:"All variant file", help:"The All variant export from Access. It needs a “Variant code” column, or the All_Listing columns seller-sku and PAR_VAR.", accept:".xlsx,.xls,.xlsm", kinds:"excel"},
  {id:"orders", title:"Orders export", help:"The B&Q orders export (CSV). It needs columns called Order line no. and Date created.", accept:".csv,text/csv", kinds:"csv"},
  {id:"offers", title:"Offers export", help:"The Mirakl offers export (live prices). For Duplicates, use the export that includes inactive offers.", accept:".csv,.xlsx,.xls,.xlsm,text/csv", kinds:"either"},
  {id:"product_export", title:"Product export", help:"The Mirakl products export (catalogue). The Duplicates tab uses this with offers, Access and orders.", accept:".xlsx,.xls,.xlsm,.csv,text/csv", kinds:"either"},
  {id:"buybox", title:"Buy box results", help:"The buy box results file. It needs columns for a code or EAN, a seller and a price.", accept:".xlsx,.xls,.xlsm", kinds:"excel"},
  {id:"ean_list", title:"EAN list", help:"A list of EAN codes for the buy box. It needs a column called EAN, product-id or Product SKU.", accept:".xlsx,.xls,.xlsm,.csv,text/csv", kinds:"either"},
  {id:"uploaded_prices", title:"Prices already imported", help:"A copy of a price file already imported in Mirakl. Used for the 3-day hold and morning notes.", accept:".csv,.xlsx,.xls,.xlsm,text/csv", kinds:"either"},
  {id:"price_template", title:"Price import template", help:"The official B&Q / Mirakl price import template. Not a daily export.", accept:".xlsx,.xls,.xlsm", kinds:"excel"}
];
/* live build: only the files a tab can read in the browser */
var FEEDS={access:"Sales, Orders, Pricing, Individual sales and Calculator",orders:"Sales, Orders, Individual sales and Calculator",buybox:"Pricing"};
SLOTS=SLOTS.filter(function(s){return FEEDS[s.id]});
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])})}
function apiBase(){return ""}   /* static host: never call a server */
function openDb(){return new Promise(function(res,rej){try{var r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=function(){if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};
  r.onsuccess=function(){res(r.result)}; r.onerror=function(){rej(r.error||new Error("Could not open this browser’s data store"))};
}catch(e){rej(e)}})}
function get(id){return openDb().then(function(db){return new Promise(function(res,rej){var q=db.transaction(STORE).objectStore(STORE).get(id);
  q.onsuccess=function(){res(q.result||null)}; q.onerror=function(){rej(q.error)};})})}
function set(id,val){return openDb().then(function(db){return new Promise(function(res,rej){var t=db.transaction(STORE,"readwrite");
  t.objectStore(STORE).put(val,id); t.oncomplete=function(){res(true)}; t.onerror=function(){rej(t.error||new Error("Could not save it in this browser"))};})})}
function dateOf(file,name){var n=name||(file&&file.name)||"";var m=/(20\d{2}-\d{2}-\d{2})/.exec(n);
  if(m)return m[1];
  if(file&&file.lastModified){var d=new Date(file.lastModified);return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
  var t=new Date();return t.getFullYear()+"-"+("0"+(t.getMonth()+1)).slice(-2)+"-"+("0"+t.getDate()).slice(-2)}
function todayISO(){var t=new Date();return t.getFullYear()+"-"+("0"+(t.getMonth()+1)).slice(-2)+"-"+("0"+t.getDate()).slice(-2)}
function ageDays(fileDate,today){if(!fileDate)return null;var a=fileDate.slice(0,10).split("-").map(Number),b=(today||todayISO()).split("-").map(Number);
  var da=Date.UTC(a[0],a[1]-1,a[2]),db=Date.UTC(b[0],b[1]-1,b[2]);return Math.round((db-da)/86400000)}
function badge(fileDate,today){var n=ageDays(fileDate,today);
  if(n==null)return {age_days:null,colour:"grey",label:"Not uploaded yet"};
  var colour,label;
  if(n<0){colour="red";label="dated in the future"}
  else if(n===0){colour="green";label="today"}
  else if(n===1){colour="green";label="1 day old"}
  else {label=n+" days old";colour="red"}
  if(n>RED_AFTER)colour="red";
  return {age_days:n,colour:colour,label:label}}
function xlsxLib(){if(window.XLSX)return Promise.resolve(window.XLSX);
  if(window.BQTabs&&BQTabs.kit&&BQTabs.kit.xlsx)return BQTabs.kit.xlsx();
  return new Promise(function(res,rej){var s=document.createElement("script");s.src="lib/xlsx.full.min.js";s.onload=function(){window.XLSX?res(window.XLSX):rej(new Error("Excel library did not load"))};
   s.onerror=function(){rej(new Error("Excel library did not load"))};document.head.appendChild(s)})}
function norm(v){return String(v==null?"":v).toLowerCase().replace(/[^a-z0-9]+/g,"")}
function hasCol(row){var have={};(row||[]).forEach(function(c){have[norm(c)]=1});
  for(var i=1;i<arguments.length;i++)if(have[norm(arguments[i])])return true;return false}
function readBook(file){return xlsxLib().then(function(X){return file.arrayBuffer().then(function(buf){var wb;
  try{wb=X.read(new Uint8Array(buf),{type:"array"})}catch(e){throw new Error("That isn’t an Excel file.")}return {X:X,wb:wb}})})}
function firstHeaders(wb,X,maxSheets,maxRows){var out=[],s,i,a;
  for(s=0;s<Math.min(wb.SheetNames.length,maxSheets||8);s++){a=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[s]],{header:1,raw:true,defval:""});out.push({sheet:wb.SheetNames[s],rows:a.slice(0,maxRows||10),all:a})}
  return out}
function parseCSVText(text){var delim=(text.split("\n")[0]||"").split(";").length>=(text.split("\n")[0]||"").split(",").length?";":",";
  var lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(function(l){return l.length});
  if(!lines.length)return {header:[],rows:[]};
  function split(line){return line.split(delim)}
  return {header:split(lines[0]),rows:lines.slice(1).map(split),delim:delim}}
function validate(slot,file){
  var ext=(file.name||"").split(".").pop().toLowerCase();
  if(slot.kinds==="excel" && !/xlsx|xls|xlsm/.test(ext))return Promise.reject(new Error("Please pick an Excel file."));
  if(slot.kinds==="csv" && ext!=="csv")return Promise.reject(new Error("Please pick the CSV export."));
  if(slot.id==="orders"){
    return file.text().then(function(t){var c=parseCSVText(t),h=c.header;
      ["Date created","Order number","Offer SKU","Status"].forEach(function(col){if(h.indexOf(col)<0)throw new Error("This is not the orders export – it is missing a column called "+col+".")});
      if(c.rows.length<1)throw new Error("That orders export has no rows.");
      return {rows:c.rows.length}})}
  if(slot.kinds==="csv" || (slot.kinds==="either" && ext==="csv")){
    return file.text().then(function(t){var c=parseCSVText(t);
      if(slot.id==="offers" && !hasCol(c.header,"Offer SKU","offer-sku","sku","shop-sku"))throw new Error("This is not the offers export – it needs a column called Offer SKU or sku.");
      if(slot.id==="ean_list" && !hasCol(c.header,"product-id","ean","ean13","barcode","product sku","code","codes"))throw new Error("No EAN codes found in that file. It needs a column called EAN, product-id or Product SKU.");
      if(slot.id==="uploaded_prices" && (!hasCol(c.header,"offer-sku","sku","Offer SKU")||!hasCol(c.header,"price","Price")))throw new Error("This does not look like a price import copy – it needs a SKU column and a price column.");
      return {rows:c.rows.length}})}
  return readBook(file).then(function(r){var sheets=firstHeaders(r.wb,r.X,12,10),i,j,sh;
    if(slot.id==="access"){
      sh=sheets.filter(function(s){return s.sheet==="B&QBB3"})[0];
      if(!sh){for(i=0;i<sheets.length && !sh;i++){for(j=0;j<sheets[i].rows.length;j++){if(hasCol(sheets[i].rows[j],"Estimated cost")){sh=sheets[i];break}}}}
      if(!sh)throw new Error("This is not the Access file – no sheet with an “Estimated cost” column.");
      return {sheet:sh.sheet,rows:Math.max(0,(sh.all||sh.rows).length-1)}}
    if(slot.id==="all_variant"){
      for(i=0;i<sheets.length;i++){for(j=0;j<sheets[i].rows.length;j++){
        if(hasCol(sheets[i].rows[j],"Variant code","variantcode"))return {sheet:sheets[i].sheet};
        if(hasCol(sheets[i].rows[j],"seller-sku")&&hasCol(sheets[i].rows[j],"PAR_VAR","par_var"))return {sheet:sheets[i].sheet};
      }}
      throw new Error("That doesn’t look like the All variant file – it needs a “Variant code” column, or the All_Listing columns seller-sku and PAR_VAR.");
    }
    if(slot.id==="buybox"){
      for(i=0;i<sheets.length;i++){for(j=0;j<sheets[i].rows.length;j++){
        if(hasCol(sheets[i].rows[j],"code","ean","product-id","ean13")&&hasCol(sheets[i].rows[j],"seller","shop")&&hasCol(sheets[i].rows[j],"price","buy box price"))return {sheet:sheets[i].sheet};
      }}
      throw new Error("This is not the buy box file – it must have columns called code, seller and price.");
    }
    if(slot.id==="ean_list"){
      for(i=0;i<sheets.length;i++){for(j=0;j<sheets[i].rows.length;j++){
        if(hasCol(sheets[i].rows[j],"product-id","ean","ean13","barcode","product sku","code","codes"))return {sheet:sheets[i].sheet};
      }}
      throw new Error("No EAN codes found in that file. It needs a column called EAN, product-id or Product SKU.");
    }
    if(slot.id==="offers"){
      for(i=0;i<sheets.length;i++){if(sheets[i].rows[0]&&hasCol(sheets[i].rows[0],"Offer SKU","offer-sku","sku","price","Price"))return {sheet:sheets[i].sheet}}
      throw new Error("This is not the offers export – it needs a sku and a price column.");
    }
    if(slot.id==="price_template"){return {sheet:sheets[0]&&sheets[0].sheet}}
    return {sheet:sheets[0]&&sheets[0].sheet}
  })}
function fileFromRec(rec){if(!rec||!rec.buf)return null;return new File([rec.buf],rec.name,{type:rec.type||"application/octet-stream",lastModified:rec.lastModified||Date.now()})}
function sha256(buf){return crypto.subtle.digest("SHA-256",buf).then(function(d){return Array.from(new Uint8Array(d)).map(function(x){return ("0"+x.toString(16)).slice(-2)}).join("")})}
function pushToBox(slotId,file,rec){var base=apiBase();if(!base)return Promise.resolve({synced:false,reason:"no-api"});
  var fd=new FormData();fd.append("file",file,file.name);if(file.lastModified)fd.append("lastModified",String(file.lastModified));
  return fetch(base+"/slot/"+slotId,{method:"POST",body:fd}).then(function(r){return r.json().then(function(j){if(!r.ok||!j.ok)throw new Error((j&&j.error)||"Could not save to the shared store");return {synced:true,remote:j}})})
    .catch(function(e){return {synced:false,reason:e&&e.message}})}
function putFile(slotId,file,opts){var slot=SLOTS.filter(function(s){return s.id===slotId})[0];
  if(!slot)return Promise.reject(new Error("Unknown slot"));
  opts=opts||{};
  return validate(slot,file).then(function(meta){return file.arrayBuffer().then(function(buf){return sha256(buf).then(function(sum){var rec={id:slotId,name:file.name,date:dateOf(file),stored:new Date().toISOString(),size:file.size,type:file.type,lastModified:file.lastModified||Date.now(),rows:meta&&meta.rows,sheet:meta&&meta.sheet,sha256:sum,buf:buf};
    return set(slotId,rec).then(function(){if(opts.localOnly){rec.synced=false;rec.syncReason="local-only";return set(slotId,rec).then(function(){return rec})}
      return pushToBox(slotId,file,rec).then(function(sync){rec.synced=!!sync.synced;rec.syncReason=sync.reason||"";
        if(sync.remote&&sync.remote.sha256)rec.boxSha256=sync.remote.sha256;
        /* persist the sync result, so paint() shows the real state (not always "browser only") */
        return set(slotId,rec).then(function(){return rec})})})})})})}
/* Wait for the staging nightly (refresh_staging.py) that the server runs after an upload. */
function waitRefresh(){var base=apiBase();if(!base)return Promise.resolve({ok:false,reason:"no-api"});
  return fetch(base+"/refresh?wait=1",{cache:"no-store"}).then(function(r){return r.ok?r.json():{ok:false}}).catch(function(){return {ok:false}})}
/* Pricing data built on the box from the shared store (same fields as the published pricing.enc). */
/* What each box-built output was built from (out/build_manifest.json, compared with the store now). */
function buildInfo(){var base=apiBase();if(!base)return Promise.resolve(null);
  return fetch(base+"/build",{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(j){return j&&j.steps||null}).catch(function(){return null})}
function loadPricingDoc(){var base=apiBase();if(!base)return Promise.resolve(null);
  return waitRefresh().then(buildInfo).then(function(steps){var info=steps&&steps.pricing;
    /* refuse a pricing.json with no build record: never show leftover output as fresh */
    if(!info||info.state==="none")return null;
    return fetch("/out/pricing.json",{cache:"no-store"}).then(function(r){return r&&r.ok?r.json():null}).then(function(d){if(d)d.__build=info;return d})}).catch(function(){return null})}
var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function ukStamp(iso){var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso||"");return m?(+m[3])+" "+MON[+m[2]-1]+" "+m[1]+", "+m[4]+":"+m[5]+" UK":(iso||"an unknown time")}
var TITLES={access:"Access file",all_variant:"All variant file",orders:"Orders export",offers:"Offers export",product_export:"Product export",buybox:"Buy box results",ean_list:"EAN list",uploaded_prices:"Prices already imported",price_template:"Price import template"};
function buildLine(info,keys){if(!info)return "";var used=info.inputs||{},bits=[];
  (keys||Object.keys(used)).forEach(function(k){if(used[k]&&used[k].name)bits.push(k.replace(/_/g," ")+": "+used[k].name)});
  return info.built_at?"Built "+ukStamp(info.built_at)+" from Data upload — "+(bits.join(" · ")||"no files"):""}
function stale(host,info,label){if(!host)return null;styles();var el=host.querySelector(".bq-stale");
  if(!info||info.state==="fresh"){if(el)el.remove();return null}
  if(!el){el=document.createElement("div");el.className="bq-stale";var src=host.querySelector(".bq-src");if(src&&src.nextSibling)host.insertBefore(el,src.nextSibling);else if(src)host.appendChild(el);else host.insertBefore(el,host.firstChild)}
  var r=(info.reasons||[]).join("; ");
  el.textContent=info.state==="none"?"⚠ "+(label||info.label)+" has not been built from the Data upload files yet"+(r?" — "+r:"")+". Nothing old is shown as today’s figures."
    :"⚠ Not up to date: "+(label||info.label)+" was built "+ukStamp(info.built_at)+(r?" — "+r:"")+".";
  el.setAttribute("data-state",info.state);return el}
function syncFromBox(){var base=apiBase();if(!base)return Promise.resolve({ok:false,reason:"no-api"});
  return fetch(base+"/status",{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("status");return r.json()}).then(function(st){
    var slots=st.slots||[];
    return Promise.all(slots.map(function(info){if(!info.has_file)return null;
      return get(info.slot||info.id).then(function(local){var id=info.slot||info.id;
        if(local&&local.sha256&&info.sha256&&local.sha256===info.sha256)return {id:id,skipped:true};
        return fetch(base+"/slot/"+id,{cache:"no-store"}).then(function(r){if(!r.ok)return null;return r.arrayBuffer().then(function(buf){var name=r.headers.get("X-BQ-Name")||info.name;
          var rec={id:id,name:name,date:r.headers.get("X-BQ-Date")||info.date,stored:new Date().toISOString(),size:buf.byteLength,sha256:info.sha256,rows:info.rows,sheet:info.sheet,buf:buf,fromBox:true,synced:true,syncReason:""};
          return set(id,rec).then(function(){return {id:id,updated:true}})})})})}))
    .then(function(res){return {ok:true,res:res}})}).catch(function(e){return {ok:false,reason:e&&e.message}})}
function savedMsg(rec){if(rec&&rec.synced)return '<span class="ok">✓ Saved.</span> This file is in the shared store, so every tab and the staging nightly use it.';
  if(rec&&rec.syncReason&&rec.syncReason!=="no-api"&&rec.syncReason!=="local-only")return '<span class="bad">Saved in this browser only. The shared store did not take it: '+esc(rec.syncReason)+'</span> The nightly will not see this file. Try again, or ask Nobita to check the staging server.';
  return '<span class="ok">✓ Saved in this browser.</span> '+(rec&&FEEDS[rec.id]?esc(FEEDS[rec.id])+' on this device use it while it is no more than 1 day old.':'Tabs on this device use it.');}
function paint(){var root=$("hdata");if(!root)return;
  Promise.all(SLOTS.map(function(s){return get(s.id).then(function(rec){return {slot:s,rec:rec}})}))
  .then(function(rows){rows.forEach(function(row){var s=row.slot,rec=row.rec,msg=$("hd-msg-"+s.id),meta=$("hd-meta-"+s.id),badgeEl=$("hd-badge-"+s.id);
    if(!meta)return;
    if(!rec){meta.textContent="Not uploaded yet.";if(badgeEl){badgeEl.className="hd-badge hd-grey";badgeEl.textContent="No file"}if(msg&&!msg.dataset.keep)msg.textContent="";return}
    var b=badge(rec.date);
    meta.innerHTML="<b>"+esc(rec.name)+"</b>"+(rec.rows!=null?" · "+Number(rec.rows).toLocaleString("en-GB")+" rows":"");
    if(badgeEl){badgeEl.className="hd-badge hd-"+b.colour;badgeEl.textContent=b.label}
    if(msg&&!msg.dataset.keep)msg.innerHTML=savedMsg(rec);
  })}).catch(function(e){var n=$("hd-err");if(n)n.textContent=(e&&e.message)||"Could not read saved files."})}
function onPick(slot,file){var msg=$("hd-msg-"+slot.id);if(msg){msg.dataset.keep="";msg.textContent="Reading "+file.name+"…"}
  putFile(slot.id,file).then(function(){paint();try{document.dispatchEvent(new CustomEvent("bq-data-updated",{detail:{slot:slot.id}}))}catch(e){}})
  .catch(function(e){if(msg){msg.dataset.keep="1";msg.innerHTML='<span class="bad">'+esc((e&&e.message)||"Could not use that file")+'</span>'} })}
function styles(){if($("hd-css"))return;var s=document.createElement("style");s.id="hd-css";s.textContent=
  "#hdata{margin:22px 0 8px}#hdata h2{font-size:20px;margin:0 0 6px}#hdata .hd-intro{margin:0 0 12px}"+
  ".hd-slot{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 12px;padding:10px 0;border-top:1px solid #E2E8F0}"+
  ".hd-slot:first-of-type{border-top:0}.hd-main{flex:1;min-width:200px}.hd-main b.hd-title{display:block;font-size:15px}"+
  ".hd-meta{font-size:14px;color:#475569;margin-top:2px}.hd-badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}"+
  ".hd-green{background:#DCFCE7;color:#166534}.hd-red{background:#FEE2E2;color:#991B1B}.hd-grey{background:#F1F5F9;color:#64748B}"+
  ".hd-msg{font-size:13px;margin-top:4px;flex-basis:100%}"+
  ".bq-src{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:8px 10px;margin:0 0 12px;font-size:14px;color:#1E3A8A}"+
  ".bq-stale{background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:8px 10px;margin:0 0 12px;font-size:14px;color:#78350F;font-weight:600}";
  document.head.appendChild(s)}
function render(){var host=$("hdata");if(!host)return;styles();
  var html='<h2>Data upload</h2><p class="note hd-intro">Upload today’s files once here and the tabs on this device use them: Sales, Orders, Pricing, Individual sales and Calculator. A file more than 1 day old (red badge) is not used. Files stay in this browser only; nothing is sent to B&amp;Q, Mirakl or GitHub. Duplicates and Products selling show the published lists.</p><div class="box">';
  SLOTS.forEach(function(s){html+='<div class="hd-slot" data-slot="'+s.id+'">'+
    '<div class="hd-main"><b class="hd-title">'+esc(s.title)+'</b><div class="hd-meta" id="hd-meta-'+s.id+'">Checking…</div><p class="mut" style="margin:4px 0 0;font-size:13px">'+esc(s.help)+'</p><div class="hd-msg" id="hd-msg-'+s.id+'"></div></div>'+
    '<span class="hd-badge hd-grey" id="hd-badge-'+s.id+'">…</span>'+
    '<label class="btn l" for="hd-file-'+s.id+'">Choose file</label>'+
    '<input type="file" class="hide" id="hd-file-'+s.id+'" accept="'+s.accept+'">'+
    '</div>'});
  html+='</div><div class="note" id="hd-err"></div>';
  host.innerHTML=html;
  SLOTS.forEach(function(s){var inp=$("hd-file-"+s.id);if(!inp)return;
    inp.addEventListener("change",function(){var f=this.files&&this.files[0];this.value="";if(f)onPick(s,f)})});
  syncFromBox().then(function(){paint();try{document.dispatchEvent(new CustomEvent("bq-data-updated",{detail:{slot:"*"}}))}catch(e){}})}
function mount(){if(!$("hdata")){var menu=$("menu");if(!menu)return;var box=document.createElement("div");box.id="hdata";
  var lock=$("lock");if(lock&&lock.parentNode===menu)menu.insertBefore(box,lock);else menu.appendChild(box)}
  render()}
/* ---- lookup + sales from store (used by the tabs) ---- */
function fn6(v){var n=Number(String(v==null?"":v).replace(/[£,\s]/g,""));return isFinite(n)?n:null}
function sean(v){if(v==null||v==="")return "";if(typeof v==="number")return String(Math.trunc(v));var s=String(v).trim();return s.slice(-2)===".0"?s.slice(0,-2):s}
function buildLookup(accessFile,ordersFile){
  return readBook(accessFile).then(function(r){
    var name=r.wb.SheetNames.indexOf("B&QBB3")>=0?"B&QBB3":r.wb.SheetNames[0];
    var recs=r.X.utils.sheet_to_json(r.wb.Sheets[name],{defval:null});
    var P={},order=[];
    function prod(k){if(!P[k]){P[k]={sku:k,name:"",ean:"",vc:"",ap:null,as:null,op:null,oq:null,os:"",bn:"",c:[null,0,null,null,null,""]};order.push(k)}return P[k]}
    recs.forEach(function(row){var k=sean(row.sku);if(!k)return;var p=prod(k);
      if(!p.vc)p.vc=sean(row["Variant code"]);
      if(!p.name&&typeof row["Variant description"]==="string")p.name=row["Variant description"];
      if(!p.ean)p.ean=sean(row["product-id"]);
      p.ap=fn6(row["B&Q_INV.price"]);p.as=fn6(row["Free stock quantity"]);
      var china=/ashian/i.test(String(row["Main supplier name"]||""))?1:0;
      p.c=[fn6(row["Estimated cost"]),china,fn6(row["Weight"]),fn6(row["Postage Cost"]),fn6(row["Collab fee"]),typeof row["Variant description"]==="string"?row["Variant description"]:""];
    });
    return ordersFile.text().then(function(t){
      var objs;
      if(window.BQData&&BQData.parseCSV&&BQData.parseCSV!==parseCSVText)objs=BQData.parseCSV(t);
      else {var c=parseCSVText(t);objs=c.rows.map(function(row){var o={},i;for(i=0;i<c.header.length;i++)o[c.header[i]]=row[i]==null?"":row[i];return o})}
      function pdt(v){var m=/^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2}):(\d{2})/.exec(String(v||"").trim());return m?Date.UTC(+m[3],+m[2]-1,+m[1],+m[4],+m[5],+m[6])/1000:null}
      var Lraw=[],stSet={},first=null,last=null,ncan=0;
      objs.forEach(function(r){var t0=pdt(r["Date created"]);if(t0==null)return;
        var status=String(r.Status||r.status||"").trim();
        if(/cancel/i.test(status)){ncan++;return}
        var k=String(r["Offer SKU"]||"").trim();if(!k)return;
        var p=prod(k);if(!p.ean)p.ean=String(r["Product SKU"]||"").trim();
        if(!p.name)p.name=String(r.Details||"").replace(/\s*\(Product SKU[\s\S]*$/,"").trim();
        stSet[status]=1;
        var ts=t0;if(first==null||ts<first)first=ts;if(last==null||ts>last)last=ts;
        Lraw.push({k:k,tmin:Math.floor(ts/60),order:String(r["Order number"]||"").trim(),qty:fn6(r.Quantity)||0,amt:fn6(r.Amount)||0,status:status});
      });
      var st=Object.keys(stSet),si={};st.forEach(function(s,i){si[s]=i});
      var idx={};order.forEach(function(k,i){idx[k]=i});
      var L=Lraw.map(function(x){return [idx[x.k],x.tmin,x.order,x.qty,Math.round(x.amt*100)/100,si[x.status]]});
      var PP=order.map(function(k){var p=P[k];return [p.sku,p.name,p.ean,p.vc,p.ap,p.as,p.op,p.oq,p.os,p.bn].concat(p.c||[null,null,null,null,null,""])});
      function fmt(ts){var d=new Date(ts*1000);function z(n){return ("0"+n).slice(-2)}return d.getUTCFullYear()+"-"+z(d.getUTCMonth()+1)+"-"+z(d.getUTCDate())+" "+z(d.getUTCHours())+":"+z(d.getUTCMinutes())}
      return {meta:{created:new Date().toISOString(),first:first?fmt(first):"",last:last?fmt(last):"",lines:L.length,cancelled_excluded:ncan,access:accessFile.name,offers:"",tz:"UK"},
        cols:{P:["sku","name","ean","variant_code","access_price","access_stock","bq_price","bq_qty","bq_state","bq_name","cost","china","weight_g","access_postage","collab","access_title"],L:["p","t_min","order","qty","amount","status"]},
        st:st,P:PP,L:L};
    })})}
function buildLookupFromStore(){return Promise.all([get("access"),get("orders")]).then(function(r){if(!r[0]||!r[1])return null;return buildLookup(fileFromRec(r[0]),fileFromRec(r[1]))})}
function loadLookupDoc(){return buildLookupFromStore().then(function(D){if(D){D.__fromStore=true;return D}
  /* box-built lookup only with a build record; it carries its freshness so the banner can say if it is stale */
  var viaBox=Promise.resolve(null);   /* live build: no box output */
  return viaBox.then(function(D){if(D)return D;
    if(window.BQTabs&&BQTabs.kit&&BQTabs.kit.getJSON)return BQTabs.kit.getJSON("lookup.enc");
    return null}).catch(function(){if(window.BQTabs&&BQTabs.kit&&BQTabs.kit.getJSON)return BQTabs.kit.getJSON("lookup.enc");return null})})}
function sourceLine(parts){var bits=[];Object.keys(parts||{}).forEach(function(k){if(parts[k])bits.push(k+": "+parts[k])});return bits.length?"Using from Data upload — "+bits.join(" · "):""}
function banner(host,text){if(!host||!text)return;styles();var el=host.querySelector(".bq-src");if(!el){el=document.createElement("div");el.className="bq-src";el.id="bq-src";host.insertBefore(el,host.firstChild)}el.textContent=text;return el}

var api={
  slots:SLOTS,get:get,put:putFile,fileFromRec:fileFromRec,badge:badge,dateOf:dateOf,ageDays:ageDays,
  getFile:function(id){return get(id).then(fileFromRec)},
  show:paint,mount:mount,syncFromBox:syncFromBox,pushToBox:pushToBox,waitRefresh:waitRefresh,loadPricingDoc:loadPricingDoc,
  buildInfo:buildInfo,buildLine:buildLine,stale:stale,ukStamp:ukStamp,
  buildLookup:buildLookup,buildLookupFromStore:buildLookupFromStore,loadLookupDoc:loadLookupDoc,
  sourceLine:sourceLine,banner:banner,apiBase:apiBase
};
window.BQData=Object.assign(window.BQData||{},api);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
})();
