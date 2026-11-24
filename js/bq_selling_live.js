/* B&Q Products selling \u2013 built in THIS browser from the Home Data upload (live GitHub Pages build).
   A line-for-line port of the nightly's build_products_selling.py: same 30-day window, same counts, same page.
   Inputs: the Orders export (required) and the Access file (optional: UK / China split and the no-sales count),
   both from Data upload and used only while no more than 1 day old. The daily history chart continues the
   history in the published page (the nightly keeps that history; the browser does not save it).
   No server calls; nothing is sent anywhere. */
(function(){
"use strict";
var DAY=86400000;
/* ---------- orders CSV -> events, exactly as build.py's raw L feeds the nightly ---------- */
function parseCSV(text,delim){var rows=[],row=[],f="",q=false,i=0,n=text.length,c;
  for(;i<n;i++){c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c;continue}
    if(c==='"'){q=true}else if(c===delim){row.push(f);f=""}else if(c==="\n"){row.push(f);rows.push(row);row=[];f=""}else if(c==="\r"){if(text[i+1]!=="\n"){row.push(f);rows.push(row);row=[];f=""}}else f+=c}
  if(f!==""||row.length){row.push(f);rows.push(row)}return rows}
function pdt(v){var m=/^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2}):(\d{2})/.exec(String(v==null?"":v).trim());
  return m?Date.UTC(+m[3],+m[2]-1,+m[1],+m[4],+m[5],+m[6])/1000:null}
function num(v){if(v==null)return null;var t=String(v).replace(/[\u00a3,\s]/g,"");if(!t)return null;var x=Number(t);return isFinite(x)?x:null}
function eventsFromCSV(text){if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);var rows=parseCSV(text,";");if(!rows.length)throw new Error("The orders file is empty.");
  var h=rows[0],ix={};h.forEach(function(k,i){ix[k]=i});
  ["Date created","Offer SKU","Quantity","Status"].forEach(function(k){if(!(k in ix))throw new Error("The orders file has no \u201c"+k+"\u201d column.")});
  var out=[],r,t,sku,i;
  for(i=1;i<rows.length;i++){r=rows[i];if(r.length===1&&r[0]==="")continue;t=pdt(r[ix["Date created"]]);if(t==null)continue;
    sku=String(r[ix["Offer SKU"]]||"").trim();if(!sku)continue;
    out.push([Math.floor(t/60)*60000,sku,num(r[ix["Quantity"]])||0,String(r[ix["Status"]]||"").trim()==="Cancelled"])}
  return out}
/* ---------- Access -> {sku: UK|China}, as load_catalogue() ---------- */
function s0(c){return (c==null||c===0||c===""||c===false)?"":String(c)}
function catalogue(X,wb){var names=wb.SheetNames,name=null,i,ws,rows;
  function aoa(n){return X.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null,blankrows:true})}
  if(names.indexOf("B&QBB3")>=0)name="B&QBB3";
  else for(i=0;i<names.length&&!name;i++){var a=aoa(names[i]),hd=a[0];if(hd&&hd.some(function(c){return s0(c).trim()==="Estimated cost"}))name=names[i]}
  if(!name)name=names.indexOf("1 All")>=0?"1 All":names[0];
  rows=aoa(name);var hi=-1,header=null;
  for(i=0;i<rows.length;i++){var cells=(rows[i]||[]).map(function(c){return s0(c).trim()});
    if(cells.map(function(c){return c.toLowerCase()}).indexOf("sku")>=0||cells.indexOf("Estimated cost")>=0){header=cells;hi=i;break}}
  var out={};if(!header)return out;var low=header.map(function(c){return c.toLowerCase()});
  function find(){for(var k=0;k<arguments.length;k++){var j=low.indexOf(arguments[k].toLowerCase());if(j>=0)return j}return null}
  var iS=find("sku","b&q sku"),iP=find("main supplier name","supplier"),iU=find("uk/china","uk china");if(iS==null)return out;
  for(i=hi+1;i<rows.length;i++){var row=rows[i]||[],sku=iS<row.length?s0(row[iS]).trim():"";if(!sku||Object.prototype.hasOwnProperty.call(out,sku))continue;
    var kind;if(iU!=null&&iU<row.length&&s0(row[iU]).trim())kind=s0(row[iU]).trim().toLowerCase().indexOf("china")===0?"China":"UK";
    else{var sup=(iP!=null&&iP<row.length)?s0(row[iP]):"";kind=(sup.toLowerCase().indexOf("ashian")>=0||sup.toLowerCase().indexOf("china")>=0)?"China":"UK"}
    out[sku]=kind}
  return out}
/* ---------- summarise(), as the nightly ---------- */
function iso(ms){return new Date(ms).toISOString().slice(0,10)}
function summarise(events,cat){var live=events.filter(function(e){return !e[3]&&e[2]}),hasCat=Object.keys(cat).length>0;
  if(!live.length)throw new Error("No orders left after cancelled rows are removed.");
  var last=-Infinity;live.forEach(function(e){if(e[0]>last)last=e[0]});
  var today=Math.floor(last/DAY)*DAY,yday=today-DAY,win=today-29*DAY,pf=yday-30*DAY,pt=yday-DAY;
  var sold30={},yd={},prior={},byDay={};
  live.forEach(function(e){var d=Math.floor(e[0]/DAY)*DAY,s=e[1];(byDay[d]=byDay[d]||{})[s]=1;if(d>=win)sold30[s]=1;if(d===yday)yd[s]=1;if(d>=pf&&d<=pt)prior[s]=1});
  var newly=Object.keys(yd).filter(function(s){return !prior[s]}).sort(function(a,b){return a<b?-1:a>b?1:0});
  function split(set){var skus=Array.isArray(set)?set:Object.keys(set);if(!hasCat)return null;var uk=0,cn=0;
    skus.forEach(function(s){if(cat[s]==="UK")uk++;else if(cat[s]==="China")cn++});return {uk:uk,china:cn,total:skus.length,unclassified:skus.length-uk-cn}}
  var zero=hasCat?split(Object.keys(cat).filter(function(s){return !sold30[s]})):null,days=[];
  for(var i=29;i>=0;i--){var d=today-i*DAY;days.push({date:iso(d),sold:byDay[d]?Object.keys(byDay[d]).length:0})}
  return {asOf:iso(today),yesterday:iso(yday),sold30:split(sold30)||{total:Object.keys(sold30).length},zero30:zero,
    yesterdaySold:split(yd)||{total:Object.keys(yd).length},newly:{total:newly.length,skus:newly.slice(0,50),more:Math.max(0,newly.length-50)},days:days,catalogue:hasCat}}
/* ---------- history: the published page's chart (= the nightly's history file) + today's count, as save_history() ---------- */
function historyFrom(publishedHtml){var out=[],re=/<title>(\d{4}-\d{2}-\d{2}): (\d+)<\/title>/g,m;while((m=re.exec(publishedHtml||"")))out.push({date:m[1],sold:+m[2]});return out}
function mergeHistory(prev,s){var by={};prev.forEach(function(d){by[d.date]=d});by[s.asOf]={date:s.asOf,sold:s.sold30.total,"new":s.newly.total};
  return Object.keys(by).sort().map(function(k){return by[k]}).slice(-120)}
/* ---------- page(), byte-for-byte as the nightly ---------- */
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;")}
function n(v){if(v==null)return "\u2013";var x=String(Math.trunc(v)),neg=x[0]==="-";if(neg)x=x.slice(1);return (neg?"-":"")+x.replace(/\B(?=(\d{3})+(?!\d))/g,",")}
function pyRound(x){var r=Math.round(x);if(Math.abs(x-Math.trunc(x))===0.5)r=2*Math.round(x/2);return r}
function page(s,hist){function cells(b){if(!b)return "<td>\u2013</td><td>\u2013</td><td>\u2013</td>";return "<td>"+n(b.uk)+"</td><td>"+n(b.china)+"</td><td>"+n(b.total)+"</td>"}
  var bars=(hist&&hist.length)?hist:s.days.map(function(d){return {date:d.date,sold:d.sold}});
  var peak=Math.max.apply(null,[1].concat(bars.map(function(d){return Math.trunc(d.sold||0)}))),w=18,h=120,gap=4;
  var svg=['<svg viewBox="0 0 '+(bars.length*(w+gap))+' '+(h+28)+'" role="img" aria-label="Distinct products sold per day">'];
  bars.forEach(function(d,i){var sold=Math.trunc(d.sold||0),bh=Math.trunc(pyRound(sold/peak*h)),x=i*(w+gap);
    svg.push('<rect x="'+x+'" y="'+(h-bh)+'" width="'+w+'" height="'+bh+'" fill="#FF6600"><title>'+esc(d.date)+': '+sold+'</title></rect>')});
  svg.push("</svg>");
  var note=s.catalogue?"":'<p class="note">UK / China and the zero-sales count need the Access file. This build did not have one.</p>';
  var rows=s.newly.skus.map(function(k){return "<li>"+esc(k)+"</li>"}).join(""),more=s.newly.more?'<p class="note">And '+s.newly.more+" more.</p>":"";
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>B&amp;Q Products selling</title>\n<style>\n'+
'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F8FAFC;color:#0F172A}\n'+
'main{max-width:880px;margin:0 auto;padding:24px 16px 48px}\n'+
'h1{font-size:28px;margin:0 0 4px} .asof{color:#475569;margin:0 0 18px}\n'+
'.cards{display:flex;flex-wrap:wrap;gap:12px} .card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 16px;min-width:180px;flex:1}\n'+
'.card b{display:block;font-size:28px} .card span{color:#475569;font-size:14px}\n'+
'table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;margin:18px 0}\n'+
'th,td{padding:10px 12px;text-align:right;border-bottom:1px solid #E2E8F0} th:first-child,td:first-child{text-align:left}\n'+
'.chart{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:12px;overflow-x:auto}\n'+
'svg{width:100%;height:160px} .note{color:#475569;font-size:14px}\n'+
'/* How to use (added 18 Nov 2026) */ .bq-howto-hint{margin:8px 0 12px;font-size:14px;font-weight:600;line-height:1.4;max-width:100%;overflow-wrap:anywhere;word-break:break-word} .bq-howto-hint a{color:#C2410C;text-decoration:underline;font-weight:600} .bq-howto{margin:16px 0 8px;background:var(--card,#fff);border:1px solid var(--line,#E2E8F0);border-radius:12px;max-width:100%;box-sizing:border-box;overflow:hidden;color:var(--ink,#0F172A)} .bq-howto>summary{cursor:pointer;padding:12px 14px;font-weight:700;font-size:15px;color:var(--ink,#0F172A);list-style:none} .bq-howto>summary::-webkit-details-marker{display:none} .bq-howto>summary::after{content:" ▾";color:#FF6600;font-weight:700} .bq-howto[open]>summary::after{content:" ▴"} .bq-howto ol{margin:0;padding:0 16px 14px 36px;max-width:100%;box-sizing:border-box} .bq-howto li{margin:0 0 8px;font-size:14px;line-height:1.45;color:var(--ink,#0F172A);overflow-wrap:anywhere;word-break:break-word} html.dark .bq-howto-hint,html.dark .bq-howto-hint a{color:#FDBA74}\n'+
'</style></head><body><main>\n<h1>Products selling</h1>\n'+
'<p class="bq-howto-hint"><a href="#bq-howto-selling">Scroll down to see how to use ↓</a></p>\n'+
'<p class="asof">Orders up to '+esc(s.asOf)+'. Counts are distinct SKUs. Cancelled orders are not included.</p>\n'+note+'\n'+
'<div class="cards">\n'+
'<div class="card"><b>'+n(s.sold30.total)+'</b><span>Sold on B&amp;Q in the last 30 days</span></div>\n'+
'<div class="card"><b>'+n(s.zero30?s.zero30.total:null)+'</b><span>No B&amp;Q sales in the last 30 days</span></div>\n'+
'<div class="card"><b>'+n(s.yesterdaySold.total)+'</b><span>Sold yesterday ('+esc(s.yesterday)+')</span></div>\n'+
'<div class="card"><b>'+n(s.newly.total)+'</b><span>Newly selling (yesterday, none in the 30 days before)</span></div>\n'+
'</div>\n<table><thead><tr><th></th><th>UK</th><th>China</th><th>Total</th></tr></thead><tbody>\n'+
'<tr><td>Sold in the last 30 days</td>'+cells(s.sold30)+'</tr>\n'+
'<tr><td>No sales in the last 30 days</td>'+cells(s.zero30)+'</tr>\n'+
'<tr><td>Sold yesterday</td>'+cells(s.yesterdaySold)+'</tr>\n'+
'</tbody></table>\n<h2>Each day</h2>\n<div class="chart">'+svg.join("")+'</div>\n<h2>Newly selling</h2>\n<ul>'+(rows||"<li>None</li>")+'</ul>\n'+more+'\n'+'<details class="bq-howto" id="bq-howto-selling"><summary>How to use</summary><ol><li>To refresh these counts, upload today’s B&amp;Q orders export on Home (Data upload). It is a CSV with columns called Date created, Order number, Offer SKU and Status. The Access Excel is optional and splits the table into UK and China (sheet B&amp;QBB3, or a sheet with Estimated cost). Files stay in this browser, must be 1 day old or less (green badge), and this page is rebuilt in the browser straight away — there is no overnight wait.</li><li>The four cards count distinct SKUs: sold in the last 30 days, no sales in 30 days, sold yesterday, and newly selling (sold yesterday, none in the 30 days before). Cancelled orders are not included.</li><li>Each day is a chart of the daily trend. Newly selling lists those SKUs underneath.</li><li>If you have not uploaded a fresh orders file, you are seeing the last published snapshot. Nothing is sent to B&amp;Q from this page. There is no file picker on this page itself — the upload is on Home.</li></ol></details></main></body></html>'}
function xlsx(){if(window.XLSX)return Promise.resolve(window.XLSX);if(window.BQTabs&&BQTabs.kit&&BQTabs.kit.xlsx)return BQTabs.kit.xlsx();
  return new Promise(function(res,rej){var s=document.createElement("script");s.src="lib/xlsx.full.min.js";s.onload=function(){window.XLSX?res(window.XLSX):rej(new Error("xlsx"))};s.onerror=rej;document.head.appendChild(s)})}
/* build(ordersFile, accessFile|null, publishedHtml) -> {html, summary} */
function build(ordersFile,accessFile,publishedHtml){
  var cat=accessFile?Promise.all([xlsx(),accessFile.arrayBuffer()]).then(function(a){return catalogue(a[0],a[0].read(new Uint8Array(a[1]),{type:"array"}))}):Promise.resolve({});
  return Promise.all([ordersFile.text(),cat]).then(function(a){var s=summarise(eventsFromCSV(a[0]),a[1]);var hist=mergeHistory(historyFrom(publishedHtml),s);return {html:page(s,hist),summary:s}})}
window.BQSelling={build:build,historyFrom:historyFrom};

/* ---------- feed the Products selling viewer from Data upload ---------- */
var D=window.BQData;
function fresh(r){if(!r||!D)return false;var k=D.ageDays(r.date);return k!=null&&k<=1}
function feed(){if(!D)return;var fr=document.getElementById("frame"),doc;try{doc=fr&&fr.contentDocument}catch(e){return}
  if(!doc||!doc.documentElement||doc.documentElement.getAttribute("data-bqsel"))return;
  var h1=doc.querySelector("main > h1");if(!h1||h1.textContent!=="Products selling"||!/Products selling/.test(doc.title))return;
  doc.documentElement.setAttribute("data-bqsel","checking");var pub=doc.documentElement.outerHTML,pm=/Orders up to (\d{4}-\d{2}-\d{2})/.exec(pub),pubAsOf=pm?pm[1]:"";
  Promise.all([D.get("orders").catch(function(){return null}),D.get("access").catch(function(){return null})]).then(function(r){var o=r[0],a=r[1];
    function mark(html,cls){var m=doc.querySelector("main");if(!m)return;var d=doc.createElement("div");d.setAttribute("style",cls==="old"?
      "background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:8px 10px;margin:0 0 12px;font-size:14px;color:#78350F;font-weight:600;overflow-wrap:anywhere":
      "background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:8px 10px;margin:0 0 12px;font-size:14px;color:#1E3A8A;overflow-wrap:anywhere");
      d.className="bq-feed";d.innerHTML=html;m.insertBefore(d,m.firstChild)}
    function e(s){return String(s).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])})}
    if(!o){doc.documentElement.setAttribute("data-bqsel","none");return}
    if(!fresh(o)){doc.documentElement.setAttribute("data-bqsel","old");mark(e(o.name)+" in Data upload is "+D.ageDays(o.date)+" days old, so it is not used here. Showing the published data.","old");return}
    var af=fresh(a)?D.fileFromRec(a):null;
    return build(D.fileFromRec(o),af,pub).then(function(res){
      if(pubAsOf&&res.summary.asOf<pubAsOf){doc.documentElement.setAttribute("data-bqsel","older");mark("The orders file in Data upload ends "+e(res.summary.asOf)+", before this page ("+e(pubAsOf)+"), so the published data is shown.","old");return}
      doc.open();doc.write(res.html);doc.close();doc.documentElement.setAttribute("data-bqsel","fed");
      mark("Using from Data upload \u2014 orders: "+e(o.name)+(af?" \u00b7 Access: "+e(a.name):"")+". Earlier days in the chart come from the published data."+
        (af?"":"<br>Upload today\u2019s Access file on Home to update the UK / China split and the no-sales count."),af?"":"old")})
  }).catch(function(err){try{doc.documentElement.setAttribute("data-bqsel","error")}catch(x){}if(window.console)console.warn("Products selling from Data upload:",err&&err.message)})}
if(D)setInterval(feed,1000);
})();
