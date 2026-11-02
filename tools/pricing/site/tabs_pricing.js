(function(){
"use strict";
/* B&Q dashboard – Pricing tab (6th card). All maths = window.BQP (bq_price.js, the one shared engine).
   Data: pricing.enc (Access B&QBB3 columns + prices imported after it + the B&Q template headers) and buybox.enc (newest buy box run).
   Everything is decrypted and calculated in this browser. Nothing is sent anywhere; the upload file is saved to this device only. */
if(!window.BQTabs||!window.BQP)return;
var K=BQTabs.kit,$=K.$,esc=K.esc,money=K.money,P=window.BQP;
var LSY="bqPriceYour1",LSO="bqPriceOpt1",PAGE=100;
var TPL={Data:[["Offer SKU","Offer price","Discount price","Discount start date","Discount end date"],["offer-sku","price","discount-price","discount-start-date","discount-end-date"]]};
function ls(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function lss(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function pct(v){return v==null||isNaN(v)?"–":Math.round(v*100)+"%"}
function n0(v){return v==null||v===""?"–":Number(v).toLocaleString("en-GB")}
function today(){var d=new Date(),p=function(n){return(n<10?"0":"")+n};return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())}
var CSS='.pz-t td,.pz-t th{padding:7px 8px}.pz-t th{cursor:pointer;user-select:none}.pz-t th.s:after{content:" ▲"}.pz-t th.s.d:after{content:" ▼"}'+
 '.pz-t td.nm{white-space:normal;min-width:180px;max-width:300px}.pz-t tr.up td{background:#F0FDF4}.pz-t tr.bl td{background:#FEF2F2}'+
 '.pz-t input{width:78px;font-size:15px;padding:6px;border:1px solid #CBD5E1;border-radius:8px;text-align:right}.pz-t input.set{border-color:#FF6600;background:#FFF7ED}'+
 '.pz-sum .sc{cursor:pointer}.pz-sum .sc.on{outline:3px solid #0F172A}.pz-tg{display:flex;align-items:center;gap:8px;font-size:15px;margin:6px 0}.pz-tg input{width:20px;height:20px;accent-color:#FF6600}'+
 '.pz-big{font-size:17px;padding:14px 18px}.chip.pst{background:#FECACA;color:#7F1D1D}.pz-c1{position:sticky;left:0;background:#fff;z-index:1}';
var st=null;
var FILTERS=[["","All rows"],["up","Will change (in upload)"],["mtl","Margin too low"],["raise","Raise – held for review"],["trim","Optional penny trims"],["chk","Check postage"],["rev","Need your review"],["blk","Blocked (loss / under 50%)"],["win","Winning – kept"],["dup","Duplicate SKU"],["your","Your prices"]];
function inF(o,f){switch(f){case"up":return o.upload;case"mtl":return o.status==="Margin too low";case"raise":return /^Raise/.test(o.status);case"trim":return !!o.trim;case"chk":return !!o.check;
 case"rev":return o.status==="NEED YOUR REVIEW";case"blk":return /blocked/.test(o.why);case"win":return o.win;case"dup":return !!o.dup;case"your":return o.your!=null;default:return true}}
function chip(o){var s=o.status,c="",t=typeof s==="number"?"New price":s;
 if(o.upload){c="keep";t=o.your!=null?"Your price – in upload":"Will change"}
 else if(/blocked/.test(o.why)){c="del";t=o.why}else if(s==="NEED YOUR REVIEW"){c="del";t="Need your review"}else if(o.why==="Check postage first"){c="pst";t="Check postage first"}
 else if(o.dup){c="chk";t="Duplicate SKU"}else if(s==="Margin too low"){c="chk"}else if(/^Raise/.test(s)){c="fix"}else if(s==="Already winning"){c="keep"}
 return '<span class="chip '+c+'">'+esc(t)+'</span>'}
var COLS=[["sku","SKU"],["title","Product"],["cost","Cost"],["price","Price now"],["profit","Profit now"],["pc","% now"],["bb","Buy box"],["finalp","New price"],["fprofit","New profit"],["fpc","New %"],["floor","Floor"],["sales","30-day sales"],["st","What happens"],["rule","Rule"],["your","Your price"]];
function sv(o,k){if(k==="st")return chip(o).replace(/<[^>]+>/g,"");if(k==="title"||k==="sku"||k==="rule")return String(o[k]||"").toLowerCase();var v=o[k];return v==null||v===""?-Infinity:+v}
function render(body){
 if(!document.getElementById("pz-css")){var s=document.createElement("style");s.id="pz-css";s.textContent=CSS;document.head.appendChild(s)}
 st={doc:null,bbDoc:null,src:"pub",file:"",aoa:null,accessDate:"",your:ls(LSY,{}),opt:ls(LSO,{raise100:false,checkPost:false,pennyTrims:false}),q:"",f:"up",sort:{k:"",d:1},n:PAGE};
 body.innerHTML='<div class="src" id="pzsrc">Loading the prices…</div><div class="sumg pz-sum" id="pzsum"></div>'+
  '<div class="box"><button class="btn o pz-big" type="button" id="pzdl" disabled>⬇ Download B&amp;Q upload</button> <span class="note" id="pzdln"></span>'+
  '<p class="note">The file has only the SKUs whose price changes, in the B&amp;Q template (sheet “Data”). Every row is checked again: profit above £0 and at least 50% on cost. Nothing is sent to B&amp;Q – you import it yourself.</p>'+
  '<label class="pz-tg"><input type="checkbox" id="pzr100"> Include 100+ sales raises (+10%, max 80%)</label>'+
  '<label class="pz-tg"><input type="checkbox" id="pzpost"> Include “Check postage” rows (multi-packs, over 30 kg)</label>'+
  '<label class="pz-tg"><input type="checkbox" id="pztrim"> Include optional penny trims (≤5p down to the 80% cap)</label></div>'+
  '<div class="ctl"><input type="search" id="pzq" placeholder="Search SKU, EAN, product or seller" autocomplete="off" autocapitalize="off" spellcheck="false">'+
  '<select id="pzf" aria-label="Filter">'+FILTERS.map(function(f){return '<option value="'+f[0]+'">'+esc(f[1])+'</option>'}).join("")+'</select>'+
  '<button class="btn l" type="button" id="pzxl" disabled>⬇ This table (Excel)</button></div><div class="cnt" id="pzcnt"></div><div id="pztab"></div>'+
  '<h2>Use a newer Access file (optional)</h2><div class="box"><p class="note">Pick the Access export (sheet B&amp;QBB3). It is read only on this device – it is not uploaded anywhere. The newest buy box run is still used.</p>'+
  '<label class="btn l" for="pzfile">Choose Access .xlsx</label><input type="file" id="pzfile" class="hide" accept=".xlsx,.xls,.xlsm"> <button class="btn l hide" type="button" id="pzpub">Back to the published data</button><div class="note" id="pzfmsg"></div></div>';
 $("pzr100").checked=!!st.opt.raise100;$("pzpost").checked=!!st.opt.checkPost;$("pztrim").checked=!!st.opt.pennyTrims;
 $("pzr100").onchange=function(){st.opt.raise100=this.checked;lss(LSO,st.opt);compute();draw()};
 $("pzpost").onchange=function(){st.opt.checkPost=this.checked;lss(LSO,st.opt);compute();draw()};
 $("pztrim").onchange=function(){st.opt.pennyTrims=this.checked;lss(LSO,st.opt);compute();draw()};
 $("pzq").oninput=function(){st.q=this.value;st.n=PAGE;draw()};
 $("pzf").value=st.f;$("pzf").onchange=function(){st.f=this.value;st.n=PAGE;draw()};
 $("pzfile").onchange=function(){if(this.files[0])pick(this.files[0]);this.value=""};
 $("pzpub").onclick=function(){if(!st.doc)return;st.src="pub";st.aoa=st.doc.aoa;st.accessDate=st.doc.meta.access_date;st.file=st.doc.meta.access;this.classList.add("hide");$("pzfmsg").textContent="";compute();draw()};
 $("pzdl").onclick=download;$("pzxl").onclick=table;
 var bb=K.getJSON("buybox.enc").then(function(d){return d},function(){return null});
 return K.getJSON("pricing.enc").then(function(d){return d},function(e){if(e&&e.message==="notyet")return null;throw e}).then(function(doc){
  return bb.then(function(b){st.bbDoc=b;st.doc=doc;
   if(!doc){$("pzsrc").innerHTML='<b>The Pricing file is not published yet.</b> You can still choose an Access file below.';return}
   st.aoa=doc.aoa;st.accessDate=doc.meta.access_date;st.file=doc.meta.access;compute();draw()})})}
function dmy(d){var m=/^(\d{4})-(\d\d)-(\d\d)/.exec(d||"");return m?(+m[3])+" "+"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[m[2]-1]+" "+m[1]:d}
function compute(){
 var useImp=!!st.doc&&(st.src==="pub"||st.accessDate<=st.doc.meta.access_date),/* prices imported after the published Access file still apply to that file or an older one */ov={imported:useImp?st.doc.imported||{}:{},importedLabel:useImp?st.doc.meta.imported_label:""};
 /* 30-day sales = the Sales tab's numbers (newest B&Q orders) when that data is not older than the Access file */
 var useS=!!(st.doc&&st.doc.sales30&&st.doc.meta.sales_last&&st.accessDate<=st.doc.meta.sales_last);if(useS){ov.sales30=st.doc.sales30;ov.salesLabel="B&Q orders to "+st.doc.meta.sales_last}
 var M=P.bbMap(st.bbDoc&&st.bbDoc.rows,st.accessDate);ov.bb=M.map;ov.bbLabel=M.label;
 var A=P.fromAccess(st.aoa,ov);A.rows.forEach(function(r){if(st.your[r.sku]!=null)r.your=st.your[r.sku]});
 st.prep=A;st.M=M;st.res=P.decideAll(A.rows,st.opt);
 var run=st.bbDoc&&st.bbDoc.run||{},c=A.counts;
 $("pzsrc").innerHTML='<div><b>'+(st.src==="pub"?"Access file: ":"Your Access file: ")+esc(st.file)+'</b>'+(st.src==="pub"&&st.doc?' <span class="mut">(published '+K.uk(st.doc.meta.created)+')</span>':"")+'</div>'+
  '<div>Buy box: '+(M.n?'<b>'+esc(M.label)+'</b> for '+n0(c.bbOverlay)+' SKUs'+(run.status&&run.status!=="complete"?' <span class="bad">(run '+esc(run.status)+')</span>':"")+'; other SKUs use the Access buy box.':'<span class="bad">no buy box run newer than the Access file</span> – using the Access buy box.')+'</div>'+
  '<div class="mut">Price now: Access price'+(c.importedOverlay?', or the price you imported ('+esc(ov.importedLabel)+', '+n0(c.importedOverlay)+' SKUs)':"")+(c.livePrice?', or our live B&amp;Q price where we win the buy box ('+n0(c.livePrice)+' SKUs)':"")+'.</div>'+
  '<div class="mut">30-day sales: '+(useS?'B&amp;Q orders up to '+esc(dmy(st.doc.meta.sales_last))+' – same as the Sales tab ('+n0(c.soldSkus)+' SKUs sold).':'Access “B n Q 30Days” column.')+'</div>'+
  (st.res.dups?'<div class="bad">'+st.res.dups+' duplicate SKU row(s) – only the first one is used.</div>':"")+(st.res.nosku?'<div class="mut">'+st.res.nosku+' row(s) with no SKU skipped.</div>':"")}
function counts(){var R=st.res.rows,o={};FILTERS.forEach(function(f){o[f[0]]=0});R.forEach(function(r){FILTERS.forEach(function(f){if(inF(r,f[0]))o[f[0]]++})});return o}
function draw(){if(!st||!st.res)return;var R=st.res.rows,C=counts(),q=st.q.trim().toLowerCase();
 var cards=[["up","Will change","in the upload"],["mtl","Margin too low","price kept"],["raise","Raises held","for your review"],["chk","Check postage","multi-pack / over 30 kg"],["rev","Need review","no cost or postage"],["blk","Blocked","loss or under 50%"],["win","Winning","kept"],["","All rows","SKUs"]];
 $("pzsum").innerHTML=cards.map(function(c){return '<div class="sc'+(st.f===c[0]?" on":"")+'" data-f="'+c[0]+'" role="button" tabindex="0"><b>'+n0(C[c[0]])+'</b><span>'+esc(c[1])+' · '+esc(c[2])+'</span></div>'}).join("");
 Array.prototype.forEach.call($("pzsum").querySelectorAll("[data-f]"),function(e){e.onclick=function(){st.f=e.getAttribute("data-f");$("pzf").value=st.f;st.n=PAGE;draw()}});
 var up=C.up;$("pzdl").disabled=!up;$("pzdl").innerHTML="⬇ Download B&amp;Q upload ("+up+" price"+(up===1?"":"s")+")";$("pzdln").textContent=up?"":"No price changes right now.";$("pzxl").disabled=false;
 var out=R.filter(function(o){return inF(o,st.f)&&(!q||String(o.sku).toLowerCase().indexOf(q)>=0||String(o.ean).indexOf(q)>=0||String(o.title).toLowerCase().indexOf(q)>=0||String(o.seller).toLowerCase().indexOf(q)>=0)});
 if(st.sort.k){var k=st.sort.k,d=st.sort.d;out=out.slice().sort(function(a,b){var x=sv(a,k),y=sv(b,k);return x<y?-d:x>y?d:0})}
 st.view=out;
 var h='<div class="tw"><table class="bt pz-t"><thead><tr>'+COLS.map(function(c){return '<th data-k="'+c[0]+'"'+(st.sort.k===c[0]?' class="s'+(st.sort.d<0?" d":"")+'"':"")+'>'+esc(c[1])+'</th>'}).join("")+'</tr></thead><tbody>'+
  out.slice(0,st.n).map(function(o,i){var bl=/blocked/.test(o.why)||(o.profit!=null&&o.profit<=0);
   return '<tr class="'+(o.upload?"up":bl?"bl":"")+'"><td class="pz-c1"><span class="mono">'+esc(o.sku)+'</span><br><span class="mut mono">'+esc(o.ean)+'</span></td>'+
   '<td class="nm">'+(o.url?'<a href="'+esc(o.url)+'" target="_blank" rel="noopener">'+esc(o.title||o.sku)+'</a>':esc(o.title))+(o.check?'<br><span class="chip pst">Check postage: '+esc(o.check)+'</span>':"")+(o.china?' <span class="chip fix">China</span>':"")+'</td>'+
   '<td class="n">'+money(o.cost)+'</td><td class="n">'+(o.priceBlank?'<span class="bad">blank</span>':money(o.price))+'</td><td class="n'+(o.profit!=null&&o.profit<=0?' bad':'')+'">'+money(o.profit)+'</td><td class="n">'+pct(o.pc)+'</td>'+
   '<td>'+(o.bb!=null?money(o.bb):'<span class="mut">–</span>')+'<br><span class="mut">'+esc(o.seller)+'</span></td>'+
   '<td class="n"><b>'+money(o.finalp)+'</b></td><td class="n'+(o.fprofit!=null&&o.fprofit<=0?' bad':'')+'">'+money(o.fprofit)+'</td><td class="n">'+pct(o.fpc)+'</td>'+
   '<td class="n">'+money(o.floor)+'<br><span class="mut">'+pct(o.floorPct)+'</span></td><td class="n">'+n0(o.sales)+'</td><td>'+chip(o)+'</td><td class="mut" style="white-space:normal;min-width:160px">'+esc(o.rule)+'<br>'+esc(o.postSrc||"")+'</td>'+
   '<td><input type="text" inputmode="decimal" data-s="'+esc(o.sku)+'" value="'+(o.your!=null?o.your.toFixed(2):"")+'" class="'+(o.your!=null?"set":"")+'" aria-label="Your price for '+esc(o.sku)+'" placeholder="£"'+(o.dup?" disabled":"")+'></td></tr>'}).join("")+'</tbody></table></div>';
 if(!out.length)h='<div class="box note">Nothing here. Try “All rows” or clear the search.</div>';
 if(out.length>st.n)h+='<button class="more" type="button" id="pzmore">Show more ('+(out.length-st.n)+' left)</button>';
 $("pzcnt").textContent=out.length?"Showing "+Math.min(st.n,out.length)+" of "+out.length+(st.sort.k?" · sorted":"")+" · tap a column name to sort":"";
 $("pztab").innerHTML=h;var m=$("pzmore");if(m)m.onclick=function(){st.n+=300;draw()};
 Array.prototype.forEach.call($("pztab").querySelectorAll("th[data-k]"),function(th){th.onclick=function(){var k=th.getAttribute("data-k");if(k==="your")return;st.sort.d=st.sort.k===k?-st.sort.d:1;st.sort.k=k;draw()}});
 Array.prototype.forEach.call($("pztab").querySelectorAll("input[data-s]"),function(inp){inp.onchange=function(){var s=inp.getAttribute("data-s"),v=inp.value.trim();
  if(v===""){delete st.your[s]}else{var x=P.num(v);if(x==null||x<=0){inp.value="";alert("Please type a price like 8.70");return}st.your[s]=Math.round(x*100)/100}
  lss(LSY,st.your);compute();draw()}})}
function safe(){var up=st.res.rows.filter(function(o){return o.upload}),seen={},bad=[];
 up.forEach(function(o){var c=P.calc({cost:o.cost,mult:o.mult,post:o.post,collab:o.collab},o.finalp);
  if(!(o.finalp>0)||!(c.profit>0)||!(c.pc>=P.SAFE_MIN-1e-9)||seen[o.sku]||!o.sku)bad.push(o.sku);seen[o.sku]=1});
 return{up:up,bad:bad}}
function download(){var S=safe(),b=$("pzdl");if(S.bad.length){alert("Stopped: "+S.bad.length+" row(s) failed the safety check ("+S.bad.slice(0,5).join(", ")+"). Nothing saved.");return}
 if(!S.up.length)return;b.disabled=true;var old=b.innerHTML;b.textContent="Preparing…";
 K.xlsx().then(function(X){var T=(st.doc&&st.doc.template)||TPL,wb=X.utils.book_new();
  var data=T.Data.slice(0,2).concat(S.up.map(function(o){return[String(o.sku),P.rnd(o.finalp,2)]}));
  var ws=X.utils.aoa_to_sheet(data);ws["!cols"]=[{wch:22},{wch:12},{wch:14},{wch:20},{wch:20}];X.utils.book_append_sheet(wb,ws,"Data");
  if(T.Columns)X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(T.Columns),"Columns");
  X.writeFile(wb,"B&Q Price Upload "+today()+".xlsx")}).catch(function(e){alert(K.why(e))}).then(function(){b.disabled=false;b.innerHTML=old})}
function table(){var b=$("pzxl");b.disabled=true;K.xlsx().then(function(X){
 var hd=["SKU","EAN","Product","Supplier","Cost","Price now","Price source","Profit now £","Profit now %","Buy box price","Buy box seller","Buy box source","Postage","Postage from","New price","New profit £","New profit %","Floor price","Floor %","Highest (80%)","B&Q 30-day sales","What happens","Rule","Your price","Check postage","In upload"];
 var rows=(st.view||st.res.rows).map(function(o){var r2=function(v){return v==null?"":P.rnd(v,2)},p4=function(v){return v==null?"":Math.round(v*10000)/10000};
  return[o.sku,o.ean,o.title,o.sup,o.cost==null?"":o.cost,o.price,o.srcPrice,r2(o.profit),p4(o.pc),o.bb==null?"":o.bb,o.seller,o.srcBB,o.post==null?"":o.post,o.postSrc,r2(o.finalp),r2(o.fprofit),p4(o.fpc),o.floor==null?"":o.floor,o.floorPct==null?"":o.floorPct,o.ceil==null?"":o.ceil,o.sales,chip(o).replace(/<[^>]+>/g,""),o.rule,o.your==null?"":o.your,o.check,o.upload?"Yes":""]});
 var wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet([hd].concat(rows));ws["!autofilter"]={ref:"A1:Z"+(rows.length+1)};X.utils.book_append_sheet(wb,ws,"Pricing");X.writeFile(wb,"B&Q Pricing table "+today()+".xlsx")})
 .catch(function(e){alert(K.why(e))}).then(function(){b.disabled=false})}
function pick(file){var msg=$("pzfmsg");msg.textContent="Reading "+file.name+"…";
 K.xlsx().then(function(X){return file.arrayBuffer().then(function(buf){var wb;try{wb=X.read(new Uint8Array(buf),{type:"array"})}catch(e){throw new Error("This is not an Excel file.")}
  var name=wb.SheetNames.indexOf("B&QBB3")>=0?"B&QBB3":wb.SheetNames.filter(function(n){var a=X.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null});return a[0]&&a[0].indexOf("Estimated cost")>=0})[0];
  if(!name)throw new Error("This is not the Access B&QBB3 file – no sheet with an “Estimated cost” column.");
  var aoa=X.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});P.fromAccess(aoa.slice(0,2),{});
  var m=/(\d{4}-\d{2}-\d{2})/.exec(file.name),d=m?m[1]:new Date(file.lastModified||Date.now()).toISOString().slice(0,10);
  st.src="file";st.aoa=aoa;st.file=file.name;st.accessDate=d;compute();draw();$("pzpub").classList.toggle("hide",!st.doc);
  msg.innerHTML='<span class="ok">✓ Using '+esc(file.name)+'</span> – '+n0(st.prep.counts.rows)+' rows (sheet '+esc(name)+'). Buy box run results newer than '+esc(d)+' are used.'})})
 .catch(function(e){msg.innerHTML='<span class="bad">'+esc(e&&e.message&&!/^(net|notyet|nokey|otherkey)$/.test(e.message)?e.message:K.why(e))+'</span>'})}
BQTabs.add("pricing",{title:"Pricing",render:function(body){return render(body)}});
window.BQPricing={state:function(){return st}};
})();
