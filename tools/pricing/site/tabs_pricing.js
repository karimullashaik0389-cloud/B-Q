(function(){
"use strict";
/* B&Q dashboard – Pricing tab (6th card). Two views: "Buy box prices" (3 Nov 2026 – P.buyBox per SKU: lower to win / raise / can't win / keep / no data)
   and "All price rules" (the original view, unchanged). All maths = window.BQP (bq_price.js, the one shared engine).
   Data: pricing.enc (Access B&QBB3 columns + prices imported after it + the B&Q template headers) and buybox.enc (newest buy box run).
   Everything is decrypted and calculated in this browser. Nothing is sent anywhere; the upload file is saved to this device only. */
if(!window.BQTabs||!window.BQP)return;
var K=BQTabs.kit,$=K.$,esc=K.esc,money=K.money,P=window.BQP,Q=window.BQC;/* Q = bq_check.js: flags, "Why this price", "How it was worked out", check workbook */
var LSY="bqPriceYour1",LSO="bqPriceOpt1",LSV="bqPriceView1",LSB="bqBBOpt1",LSC="bqChecked1",PAGE=100;
var TPL={Data:[["Offer SKU","Offer price","Discount price","Discount start date","Discount end date"],["offer-sku","price","discount-price","discount-start-date","discount-end-date"]]};
function ls(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function lss(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function pct(v){return v==null||isNaN(v)?"–":Math.round(v*100)+"%"}
function n0(v){return v==null||v===""?"–":Number(v).toLocaleString("en-GB")}
function today(){var d=new Date(),p=function(n){return(n<10?"0":"")+n};return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())}
var CSS='.pz-t td,.pz-t th{padding:7px 8px}.pz-t th{cursor:pointer;user-select:none}.pz-t th.s:after{content:" ▲"}.pz-t th.s.d:after{content:" ▼"}'+
 '.pz-b7g{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 10px}.pz-b7t{display:inline-flex;flex-direction:column;padding:6px 10px;border-radius:10px;background:#F1F5F9;font-size:12px;color:#475569;min-width:92px}.pz-b7t b{font-size:16px;color:#0F172A}#pzb7inl{cursor:pointer}'+
 '.pz-t td.nm{white-space:normal;min-width:180px;max-width:300px}.pz-t tr.up td{background:#F0FDF4}.pz-t tr.bl td{background:#FEF2F2}'+
 '.pz-t input{width:78px;font-size:15px;padding:6px;border:1px solid #CBD5E1;border-radius:8px;text-align:right}.pz-t input.set{border-color:#FF6600;background:#FFF7ED}'+
 '.pz-sum .sc{cursor:pointer}.pz-sum .sc.on{outline:3px solid #0F172A}.pz-tg{display:flex;align-items:center;gap:8px;font-size:15px;margin:6px 0}.pz-tg input{width:20px;height:20px;accent-color:#FF6600}'+
 '.pz-big{font-size:17px;padding:14px 18px}.chip.pst{background:#FECACA;color:#7F1D1D}.pz-c1{position:sticky;left:0;background:#fff;z-index:1}'+
 '.pz-sw{display:flex;gap:8px;margin:0 0 12px}.pz-sw .btn{font-size:16px}.pz-set{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin:6px 0}.pz-set label{font-size:15px}'+
 '.pz-set input[type=text]{width:70px;font-size:15px;padding:6px;border:1px solid #CBD5E1;border-radius:8px;text-align:right}.pz-t td.why{white-space:normal;min-width:240px;max-width:340px}#pzbt td.nm{min-width:150px;max-width:210px}#pzbt td,#pzbt th{padding:7px 6px}'+
 '.chip.low{background:#FFEDD5;color:#9A3412}.chip.nod{background:#F1F5F9;color:#64748B}.pz-t tr.lo td{background:#FFF7ED}';
var st=null;
var FILTERS=[["","All rows"],["up","Will change (in upload)"],["mtl","Margin too low"],["raise","Raise – held for review"],["trim","Optional penny trims"],["chk","Check postage"],["rev","Need your review"],["blk","Blocked (loss / under floor)"],["win","Winning – kept"],["dup","Duplicate SKU"],["your","Your prices"]];
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
 st={doc:null,bbDoc:null,src:"pub",file:"",aoa:null,accessDate:"",your:ls(LSY,{}),opt:ls(LSO,{raise100:false,checkPost:false,pennyTrims:false,chinaRaise:false}),checks:window.BQBook?BQBook.normStore(ls(LSC,{v:1,items:{}})):{v:1,items:{}},checkYour:false,q:"",f:"up",sort:{k:"",d:1},n:PAGE,mode:ls(LSV,"bb"),bbo:Object.assign({},P.BB_DEFAULT,{checkPost:false},ls(LSB,{})),bq:"",bf:"chg",bsort:{k:"",d:1},bn:PAGE};
 body.innerHTML='<div class="src" id="pzsrc">Loading the prices…</div>'+
  '<div class="pz-sw" role="tablist"><button type="button" class="btn" id="pzvbb" role="tab">Buy box prices</button><button type="button" class="btn l" id="pzvold" role="tab">All price rules</button></div>'+CHKHTML+BBHTML+
  '<div id="pzold"><div class="sumg pz-sum" id="pzsum"></div>'+
  '<div class="box"><button class="btn o pz-big" type="button" id="pzdl" disabled>⬇ Download B&amp;Q upload</button>  <button class="btn l" type="button" id="pzck" disabled>⬇ Price changes check (Excel)</button><span class="note" id="pzdln"></span>'+
  '<p class="note">The file has only the SKUs whose price changes, in the B&amp;Q template (sheet “Data”). Every row is checked again: profit above £0 and at least 50% on cost (China 100%). <b>Price changes check</b> = the same changes with, for every SKU, why this price, how it was worked out (cost + company cost + 15% fee + postage = total, profit %), the floor check and any flag – sheets Summary, All changes, Flagged, Upload preview, Blocked (loss). Nothing is sent to B&amp;Q – you import it yourself.</p>'+
  '<label class="pz-tg"><input type="checkbox" id="pzr100"> Include 100+ sales raises (+10%, max 80%)</label>'+'<label class="pz-tg"><input type="checkbox" id="pzchina"> Show China raises in Pricing view (workbook Final upload never includes them)</label>'+
  '<label class="pz-tg"><input type="checkbox" id="pzpost"> Include “Check postage” rows (multi-packs ≥14999g / no weight)</label>'+
  '<label class="pz-tg"><input type="checkbox" id="pztrim"> Include optional penny trims (≤5p down to the 80% cap)</label></div>'+
  '<div class="ctl"><input type="search" id="pzq" placeholder="Search SKU, EAN, product or seller" autocomplete="off" autocapitalize="off" spellcheck="false">'+
  '<select id="pzf" aria-label="Filter">'+FILTERS.map(function(f){return '<option value="'+f[0]+'">'+esc(f[1])+'</option>'}).join("")+'</select>'+
  '<button class="btn l" type="button" id="pzxl" disabled>⬇ This table (Excel)</button></div><div class="cnt" id="pzcnt"></div><div id="pztab"></div>'+
  '<h2>Use a newer Access file (optional)</h2><div class="box"><p class="note">Pick the Access export (sheet B&amp;QBB3). It is read only on this device – it is not uploaded anywhere. The newest buy box run is still used.</p>'+
  '<label class="btn l" for="pzfile">Choose Access .xlsx</label><input type="file" id="pzfile" class="hide" accept=".xlsx,.xls,.xlsm"> <button class="btn l hide" type="button" id="pzpub">Back to the published data</button><div class="note" id="pzfmsg"></div></div></div>';
 $("pzvbb").onclick=function(){st.mode="bb";lss(LSV,"bb");draw()};$("pzvold").onclick=function(){st.mode="old";lss(LSV,"old");draw()};bbWire();chkWire();
 $("pzr100").checked=!!st.opt.raise100;$("pzchina").checked=!!st.opt.chinaRaise;$("pzchina").onchange=function(){st.opt.chinaRaise=this.checked;lss(LSO,st.opt);compute();draw()};$("pzpost").checked=!!st.opt.checkPost;$("pztrim").checked=!!st.opt.pennyTrims;
 $("pzr100").onchange=function(){st.opt.raise100=this.checked;lss(LSO,st.opt);compute();draw()};
 $("pzpost").onchange=function(){st.opt.checkPost=this.checked;lss(LSO,st.opt);compute();draw()};
 $("pztrim").onchange=function(){st.opt.pennyTrims=this.checked;lss(LSO,st.opt);compute();draw()};
 $("pzq").oninput=function(){st.q=this.value;st.n=PAGE;draw()};
 $("pzf").value=st.f;$("pzf").onchange=function(){st.f=this.value;st.n=PAGE;draw()};
 $("pzfile").onchange=function(){if(this.files[0])pick(this.files[0]);this.value=""};
 $("pzpub").onclick=function(){if(!st.doc)return;st.src="pub";st.aoa=st.doc.aoa;st.accessDate=st.doc.meta.access_date;st.file=st.doc.meta.access;this.classList.add("hide");$("pzfmsg").textContent="";compute();draw()};
 $("pzdl").onclick=download;$("pzxl").onclick=table;if(Q)$("pzck").onclick=checkBook;else $("pzck").classList.add("hide");
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
 var M=P.bbMap(st.bbDoc&&st.bbDoc.rows,st.accessDate),SC=P.bbFromScrape(st.doc&&st.doc.bbScrape,st.accessDate),fresh={};
 /* buy box = today's buy box check (pricing.enc bbScrape) when it is newer than the buybox.enc run; failed checks are not "fresh" */
 if(SC.n&&(!M.n||String(st.doc.bbScrape.date)>String(M.to||"").slice(0,10))){M={map:SC.map,n:SC.n,label:SC.label,scrape:true,failed:SC.failed};fresh=SC.fresh}else Object.keys(M.map).forEach(function(e){fresh[e]=1});
 st.fresh=fresh;ov.bb=M.map;ov.bbLabel=M.label;
 if(st.doc&&st.doc.offers){ov.offers=st.doc.offers;ov.offersLabel=(st.doc.meta&&st.doc.meta.offers_label)||"Active offers";ov.today=(st.doc.meta&&(st.doc.meta.offers_date||st.doc.meta.access_date))||st.accessDate}
 var A=P.fromAccess(st.aoa,ov);A.rows.forEach(function(r){var c=st.checks&&st.checks.items&&st.checks.items[r.sku];r.priceEngine=r.price;if(c&&c.post!=null)r.postYour=c.post;if(c&&c.priceNow!=null)r.price=c.priceNow;if(c&&c.your!=null)r.your=c.your;if(st.your[r.sku]!=null)r.your=st.your[r.sku]});
 st.prep=A;st.M=M;st.res=P.decideAll(A.rows,st.opt);
 /* check layer: a typed China price under 100% (or anything else bq_check blocks) never goes in the upload */
 if(Q){var ok={};checkRes().rows.forEach(function(r){if(r.blocked)ok[r.sku]=1});st.res.rows.forEach(function(o){if(o.upload&&ok[o.sku]){o.upload=false;o.status=o.china?"Under 100% China – blocked":"Check failed – blocked";o.why=o.status}})}
 bbCompute();
 var run=!M.scrape&&st.bbDoc&&st.bbDoc.run||{},c=A.counts;
 $("pzsrc").innerHTML='<div><b>'+(st.src==="pub"?"Access file: ":"Your Access file: ")+esc(st.file)+'</b>'+(st.src==="pub"&&st.doc?' <span class="mut">(published '+K.uk(st.doc.meta.created)+')</span>':"")+'</div>'+
  '<div>Buy box: '+(M.n?'<b>'+esc(M.label)+'</b> for '+n0(c.bbOverlay)+' SKUs'+(M.scrape?' <span class="mut">('+n0(M.failed)+' checks failed today)</span>':'')+(run.status&&run.status!=="complete"?' <span class="bad">(run '+esc(run.status)+')</span>':"")+'; other SKUs use the Access buy box.':'<span class="bad">no buy box run newer than the Access file</span> – using the Access buy box.')+'</div>'+
  '<div class="mut">Price now: Access price'+(c.importedOverlay?', or the price you imported ('+esc(ov.importedLabel)+', '+n0(c.importedOverlay)+' SKUs)':"")+(c.livePrice?', or our live B&amp;Q price where we win the buy box ('+n0(c.livePrice)+' SKUs)':"")+'.</div>'+
  '<div class="mut">30-day sales: '+(useS?'B&amp;Q orders up to '+esc(dmy(st.doc.meta.sales_last))+' – same as the Sales tab ('+n0(c.soldSkus)+' SKUs sold).':'Access “B n Q 30Days” column.')+'</div>'+
  (st.res.dups?'<div class="bad">'+st.res.dups+' duplicate SKU row(s) – only the first one is used.</div>':"")+(st.res.nosku?'<div class="mut">'+st.res.nosku+' row(s) with no SKU skipped.</div>':"")}
function counts(){var R=st.res.rows,o={};FILTERS.forEach(function(f){o[f[0]]=0});R.forEach(function(r){FILTERS.forEach(function(f){if(inF(r,f[0]))o[f[0]]++})});return o}
function draw(){if(!st)return;var bbv=st.mode!=="old";$("pzbbv").classList.toggle("hide",!bbv);$("pzold").classList.toggle("hide",bbv);$("pzvbb").className="btn"+(bbv?"":" l");$("pzvold").className="btn"+(bbv?" l":"");chkDraw();if(!st.res)return;if(bbv)drawBB();else drawOld()}
function drawOld(){var R=st.res.rows,C=counts(),q=st.q.trim().toLowerCase();
 var cards=[["up","Will change","in the upload"],["mtl","Margin too low","price kept"],["raise","Raises held","for your review"],["chk","Check postage","multi-pack ≥14999g"],["rev","Need review","no cost or postage"],["blk","Blocked","loss or under 50%"],["win","Winning","kept"],["","All rows","SKUs"]];
 $("pzsum").innerHTML=cards.map(function(c){return '<div class="sc'+(st.f===c[0]?" on":"")+'" data-f="'+c[0]+'" role="button" tabindex="0"><b>'+n0(C[c[0]])+'</b><span>'+esc(c[1])+' · '+esc(c[2])+'</span></div>'}).join("");
 Array.prototype.forEach.call($("pzsum").querySelectorAll("[data-f]"),function(e){e.onclick=function(){st.f=e.getAttribute("data-f");$("pzf").value=st.f;st.n=PAGE;draw()}});
 var up=C.up;$("pzdl").disabled=!up;$("pzdl").innerHTML="⬇ Download B&amp;Q upload ("+up+" price"+(up===1?"":"s")+")";$("pzdln").textContent=up?"":"No price changes right now.";$("pzxl").disabled=false;$("pzck").disabled=!st.res.rows.some(function(o){return o.changed});
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
   '<td class="n">'+money(o.floor)+'<br><span class="mut">'+pct(o.floorPct)+'</span></td><td class="n">'+n0(o.sales)+'</td><td>'+chip(o)+'</td><td class="mut" style="white-space:normal;min-width:160px">'+esc(o.rule)+(o.reason?'<br>'+esc(o.reason):'')+'<br>Postage '+(o.post!=null?money(o.post):'—')+' · '+esc(o.postSrc||"")+'</td>'+
   '<td><input type="text" inputmode="decimal" data-s="'+esc(o.sku)+'" value="'+(o.your!=null?o.your.toFixed(2):"")+'" class="'+(o.your!=null?"set":"")+'" aria-label="Your price for '+esc(o.sku)+'" placeholder="£"'+(o.dup?" disabled":"")+'></td></tr>'}).join("")+'</tbody></table></div>';
 if(!out.length)h='<div class="box note">Nothing here. Try “All rows” or clear the search.</div>';
 if(out.length>st.n)h+='<button class="more" type="button" id="pzmore">Show more ('+(out.length-st.n)+' left)</button>';
 $("pzcnt").textContent=out.length?"Showing "+Math.min(st.n,out.length)+" of "+out.length+(st.sort.k?" · sorted":"")+" · tap a column name to sort":"";
 $("pztab").innerHTML=h;var m=$("pzmore");if(m)m.onclick=function(){st.n+=300;drawOld()};
 Array.prototype.forEach.call($("pztab").querySelectorAll("th[data-k]"),function(th){th.onclick=function(){var k=th.getAttribute("data-k");if(k==="your")return;st.sort.d=st.sort.k===k?-st.sort.d:1;st.sort.k=k;draw()}});
 Array.prototype.forEach.call($("pztab").querySelectorAll("input[data-s]"),function(inp){inp.onchange=function(){var s=inp.getAttribute("data-s"),v=inp.value.trim();
  if(v===""){delete st.your[s]}else{var x=P.num(v);if(x==null||x<=0){inp.value="";alert("Please type a price like 8.70");return}st.your[s]=Math.round(x*100)/100}
  lss(LSY,st.your);compute();draw()}})}
function checkRes(){var items=st.res.rows.filter(function(o){return o.changed}).map(function(o){return{o:o,x:{}}});
 return Q.build(items,{checkPost:!!st.opt.checkPost},{title:"Dashboard Pricing tab",made:K.uk(new Date().toISOString()),input:(st.src==="pub"?"Published Access file: ":"Your Access file: ")+st.file,
  changeRule:"New price (your typed price or the rule price) different from the price now. Switches: 100+ sales raises "+(st.opt.raise100?"ON":"off")+", China raises to 100% floor "+(st.opt.chinaRaise?"ON":"off")+", check-postage rows "+(st.opt.checkPost?"ON":"off")+", penny trims "+(st.opt.pennyTrims?"ON":"off")+".",
  bb:st.M&&st.M.n?st.M.label+" where the EAN was checked; otherwise the Access buy box.":"Access buy box (no newer buy box run).",sales:st.prep.counts.soldSkus!=null&&st.doc&&st.doc.sales30?"B&Q orders (same as the Sales tab) when not older than the Access file, else Access B n Q 30Days":"Access B n Q 30Days"})}
function safe(){var ok=null;if(Q){ok={};checkRes().upload.forEach(function(u){ok[u[0]]=1})}
 var up=st.res.rows.filter(function(o){return o.upload&&(!ok||ok[String(o.sku)])}),seen={},bad=[];
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
function checkBook(){var b=$("pzck");b.disabled=true;var old=b.innerHTML;b.textContent="Preparing…";
 K.xlsx().then(function(X){var R=checkRes(),wb=X.utils.book_new(),Z={m:"£#,##0.00",x:"£#,##0.00",p:"0.0%",n:"0"};
  R.sheets.forEach(function(sh){var aoa=(sh.noHeader?[]:[sh.cols.map(function(c){return c[0]})]).concat(sh.rows),ws=X.utils.aoa_to_sheet(aoa),r0=sh.noHeader?0:1;
   ws["!cols"]=sh.cols.map(function(c){return{wch:c[2]}});
   for(var r=r0;r<aoa.length;r++)sh.cols.forEach(function(c,j){var a=X.utils.encode_cell({r:r,c:j}),cell=ws[a];if(cell&&cell.t==="n"&&Z[c[1]])cell.z=Z[c[1]]});
   if(!sh.noHeader&&aoa.length>1&&aoa[1].length>1)ws["!autofilter"]={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:aoa.length-1,c:sh.cols.length-1}})};
   X.utils.book_append_sheet(wb,ws,sh.name)});
  X.writeFile(wb,"Price changes check "+today()+".xlsx")}).catch(function(e){alert(K.why(e))}).then(function(){b.disabled=false;b.innerHTML=old})}
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

/* ===== Buy box prices view ===== */
var ACTS=[["chg","Lower to win + Raise","will change"],["Lower to win","Lower to win","1p under the winner"],["Raise","Raise","we already win"],["Can't win (floor)","Can't win","floor stops us"],["Keep","Keep","no change"],["No data","No data","check failed / missing"],["","All rows","SKUs"]];
var BF=ACTS.map(function(a){return[a[0],a[1]]}).concat([["win","We win the buy box"],["lose","We lose the buy box"],["up","In the upload"],["xmas","Christmas products"]]);
var BBHTML='<div id="pzbbv" class="hide"><div class="sumg pz-sum" id="pzbsum"></div>'+
 '<div class="box"><button class="btn o pz-big" type="button" id="pzbdl" disabled>⬇ Download B&amp;Q upload</button>  <button class="btn l" type="button" id="pzbxl" disabled>⬇ This table (Excel)</button><span class="note" id="pzbdln"></span>'+
 '<p class="note">For every product: the price that wins the buy box while staying profitable. Lower to win = 1 step under the seller who has the buy box. Raise = we already win, so go up to just under the other seller we last saw (or +% if nobody else was seen), never over the 80% cap. Every price is worked out by the same engine as the rest of the tab and is never under the floor (UK 50% on cost if sold in 30 days, China 100%) and never at a loss. The upload has only the rows whose price changes, in the B&amp;Q template (sheet “Data”). Nothing is sent to B&amp;Q – you import it yourself.</p></div>'+
 '<div class="box pz-b7" id="pzb7"><b>Pricing workbook – 7a/7b + review</b> <span class="mut" id="pzb7src"></span>'+
 '<div class="pz-b7g" id="pzb7c"></div>'+
 '<button class="btn o pz-big" type="button" id="pzb7dl" disabled>⬇ Pricing workbook (7a UK / 7b China)</button> '+
 '<label class="btn l" for="pzb7in" id="pzb7inl">⬆ Make B&amp;Q upload from my edited workbook</label><input type="file" id="pzb7in" accept=".xlsx" class="hide"><span class="note" id="pzb7n"></span>'+
 '<p class="note">The workbook calculates in Excel. Yellow cells (Postage review, Selling price review, Your price, Include override) are the only places to type. Blank keeps the calculated value. A change on any review tab updates profit, the suggestion, Combined and Final for that SKU. 7a and 7b fill themselves. Tab 8 does not. China raises never upload. Made on this device – nothing is sent to B&amp;Q.</p></div>'+
 '<details class="box" id="pzbset"><summary><b>Settings</b> <span class="mut" id="pzbsetn"></span></summary><div class="pz-set">'+
 '<label>Undercut by £ <input type="text" inputmode="decimal" id="pzbstep"></label><label>or % of the buy box price <input type="text" inputmode="decimal" id="pzbpct"></label>'+
 '<label>Smallest raise worth doing (profit £) <input type="text" inputmode="decimal" id="pzbmin"></label><label>Raise when nobody else seen (%) <input type="text" inputmode="decimal" id="pzbup"></label></div>'+
 '<label class="pz-tg"><input type="checkbox" id="pzbxmas"> Christmas mode – on Christmas products we win, hold the price (no blind raise)</label>'+
 '<label class="pz-tg"><input type="checkbox" id="pzbnos"> Raise winners with 0 sales in 30 days too</label>'+
 '<label class="pz-tg"><input type="checkbox" id="pzbstock"> Keep products with no free stock (do not change their price)</label>'+
 '<label class="pz-tg"><input type="checkbox" id="pzbstale"> When today’s buy box check failed, use the older Access buy box</label>'+
 '<label class="pz-tg"><input type="checkbox" id="pzbpost"> Include “Check postage” rows (multi-packs ≥14999g / no weight) in the upload</label>'+
 '<label class="pz-tg"><input type="checkbox" id="pzbchina"> China raises stay review-only in the workbook (never in 7a/7b). This switch only affects the on-screen Pricing list / old suggestions download</label>'+
 '<button class="btn l" type="button" id="pzbreset">Back to the recommended settings</button></details>'+
 '<div class="ctl"><input type="search" id="pzbq" placeholder="Search SKU, EAN, product or seller" autocomplete="off" autocapitalize="off" spellcheck="false">'+
 '<select id="pzbf" aria-label="Filter">'+BF.map(function(f){return '<option value="'+esc(f[0])+'">'+esc(f[1])+'</option>'}).join("")+'</select></div><div class="cnt" id="pzbcnt"></div><div id="pzbtab"></div></div>';
function bbSet(){var o=st.bbo;$("pzbstep").value=(+o.step).toFixed(2);$("pzbpct").value=+o.stepPct||0;$("pzbmin").value=(+o.minGain).toFixed(2);$("pzbup").value=Math.round((+o.raisePct)*1000)/10;
 $("pzbxmas").checked=!!o.xmas;$("pzbnos").checked=!!o.raiseNoSales;$("pzbstock").checked=!!o.noStockKeep;$("pzbstale").checked=!!o.useStale;$("pzbpost").checked=!!o.checkPost;$("pzbchina").checked=!!st.opt.chinaRaise;
 var d=P.BB_DEFAULT,same=["step","stepPct","minGain","raisePct","xmas","raiseNoSales","noStockKeep","useStale"].every(function(k){return o[k]===d[k]})&&!o.checkPost;
 $("pzbsetn").textContent=same?"(recommended)":"(changed – not the recommended settings)"}
function bbWire(){bbSet();
 var nm=function(id,k,f){$(id).onchange=function(){var v=P.num(this.value);if(v==null||v<0){bbSet();return}st.bbo[k]=f?f(v):v;lss(LSB,st.bbo);bbCompute();draw();bbSet()}};
 nm("pzbstep","step",function(v){return Math.max(0.01,Math.round(v*100)/100)});nm("pzbpct","stepPct");nm("pzbmin","minGain");nm("pzbup","raisePct",function(v){return v/100});
 [["pzbxmas","xmas"],["pzbnos","raiseNoSales"],["pzbstock","noStockKeep"],["pzbstale","useStale"],["pzbpost","checkPost"]].forEach(function(x){$(x[0]).onchange=function(){st.bbo[x[1]]=this.checked;lss(LSB,st.bbo);bbCompute();draw();bbSet()}});
 $("pzbreset").onclick=function(){st.bbo=Object.assign({},P.BB_DEFAULT,{checkPost:false});lss(LSB,{});st.opt.chinaRaise=false;lss(LSO,st.opt);compute();draw();bbSet()};
 $("pzbchina").onchange=function(){st.opt.chinaRaise=this.checked;lss(LSO,st.opt);compute();draw();bbSet()};
 $("pzbq").oninput=function(){st.bq=this.value;st.bn=PAGE;drawBB()};$("pzbf").value=st.bf;$("pzbf").onchange=function(){st.bf=this.value;st.bn=PAGE;drawBB()};
 $("pzbdl").onclick=bbDownload;$("pzbxl").onclick=bbTable;$("pzb7dl").onclick=book7;$("pzb7in").onchange=function(){var f=this.files&&this.files[0];this.value="";if(f)fromEdited(f)}}
function bbCompute(){if(!st.res)return;st.bbr=P.buyBoxAll(st.res.rows,st.fresh,(st.doc&&st.doc.rivals)||{},st.bbo);
 st.bbr.forEach(function(r){r.xmas=P.isSeasonal(r.o.title,r.o.sku);r.held=r.act==="Raise"&&!!r.o.china&&!st.opt.chinaRaise;r.up=r.sugg!=null&&!r.o.dup&&(!r.o.check||!!st.bbo.checkPost||!!r.o.postChecked)&&!r.held})}
function bIn(r,f){switch(f){case"":return true;case"chg":return r.act==="Lower to win"||r.act==="Raise";case"win":return r.act!=="No data"&&r.o.win;case"lose":return r.act!=="No data"&&!r.o.win;case"up":return r.up;case"xmas":return r.xmas;default:return r.act===f}}
function bChip(r){var c={"Lower to win":"low","Raise":"fix","Can't win (floor)":"del","Keep":"keep","No data":"nod"}[r.act]||"";return '<span class="chip '+c+'">'+esc(r.act==="Raise"?"Raise (already winning)":r.act)+'</span>'}
var BCOLS=[["sku","SKU"],["title","Product"],["price","Price now"],["bb","Buy box"],["sugg","Suggested"],["profit","Profit at it"],["floor","Floor / cap"],["sales","Sold 30d"],["act","Action and why"]];
function gm(v){return (v<0?"−":"+")+money(Math.abs(v))}
function bsv(r,k){var o=r.o;switch(k){case"sku":case"title":return String(o[k]||"").toLowerCase();case"act":case"why":return String(r[k]);case"sugg":case"profit":case"pc":return r[k]==null?-Infinity:+r[k];default:return o[k]==null?-Infinity:+o[k]}}
function drawBB(){var R=st.bbr||[],q=st.bq.trim().toLowerCase(),C={};BF.forEach(function(f){C[f[0]]=0});R.forEach(function(r){BF.forEach(function(f){if(bIn(r,f[0]))C[f[0]]++})});
 $("pzbsum").innerHTML=ACTS.map(function(c){return '<div class="sc'+(st.bf===c[0]?" on":"")+'" data-f="'+esc(c[0])+'" role="button" tabindex="0"><b>'+n0(C[c[0]])+'</b><span>'+esc(c[1])+' · '+esc(c[2])+'</span></div>'}).join("")+
  '<div class="sc'+(st.bf==="win"?" on":"")+'" data-f="win" role="button" tabindex="0"><b>'+n0(C.win)+' / '+n0(C.lose)+'</b><span>We win / we lose · checked today</span></div>';
 Array.prototype.forEach.call($("pzbsum").querySelectorAll("[data-f]"),function(e){e.onclick=function(){st.bf=e.getAttribute("data-f");$("pzbf").value=st.bf;st.bn=PAGE;drawBB()}});
 var up=C.up;$("pzbdl").disabled=!up;$("pzbdl").innerHTML="⬇ Download B&amp;Q upload ("+up+" price"+(up===1?"":"s")+")";$("pzbxl").disabled=false;
 var nchk=R.filter(function(r){return r.sugg!=null&&!r.up}).length;$("pzbdln").textContent=up?(nchk?" "+nchk+" suggested change(s) left out (check postage / duplicate / China raises held) – see Settings.":""):"No price changes right now.";
 b7draw();
 var out=R.filter(function(r){var o=r.o;return bIn(r,st.bf)&&(!q||String(o.sku).toLowerCase().indexOf(q)>=0||String(o.ean).indexOf(q)>=0||String(o.title).toLowerCase().indexOf(q)>=0||String(o.seller).toLowerCase().indexOf(q)>=0)});
 if(st.bsort.k){var k=st.bsort.k,d=st.bsort.d;out=out.slice().sort(function(a,b){var x=bsv(a,k),y=bsv(b,k);return x<y?-d:x>y?d:0})}
 st.bview=out;
 var h='<div class="tw"><table class="bt pz-t" id="pzbt"><thead><tr>'+BCOLS.map(function(c){return '<th data-k="'+c[0]+'"'+(st.bsort.k===c[0]?' class="s'+(st.bsort.d<0?" d":"")+'"':"")+'>'+esc(c[1])+'</th>'}).join("")+'</tr></thead><tbody>'+
  out.slice(0,st.bn).map(function(r){var o=r.o,ch=r.sugg!=null,pr=ch?r.profit:o.profit,pp=ch?r.pc:o.pc;
   return '<tr class="'+(r.act==="Lower to win"?"lo":r.act==="Raise"?"up":r.act==="Can't win (floor)"?"bl":"")+'" data-sku="'+esc(o.sku)+'"><td class="pz-c1"><span class="mono">'+esc(o.sku)+'</span><br><span class="mut mono">'+esc(o.ean)+'</span></td>'+
   '<td class="nm">'+(o.url?'<a href="'+esc(o.url)+'" target="_blank" rel="noopener">'+esc(o.title||o.sku)+'</a>':esc(o.title))+(o.china?' <span class="chip fix">China</span>':"")+(r.xmas?' <span class="chip chk">Christmas</span>':"")+(o.check?'<br><span class="chip pst">Check postage: '+esc(o.check)+'</span>':"")+'</td>'+
   '<td class="n">'+(o.priceBlank?'<span class="bad">blank</span>':money(o.price))+'</td>'+
   '<td>'+(r.act==="No data"&&!st.bbo.useStale?'<span class="mut">not checked</span>':(o.bb!=null?money(o.bb):'<span class="mut">–</span>')+'<br>'+(o.win?'<span class="chip keep">We win</span>':'<span class="mut">'+esc(o.seller)+'</span>'))+'</td>'+
   '<td class="n">'+(ch?'<b>'+money(r.sugg)+'</b>':'<span class="mut">–</span>')+'</td>'+
   '<td class="n'+(pr!=null&&pr<=0?' bad':'')+'">'+(pr==null?'<span class="mut">–</span>':ch?'<b>'+money(pr)+'</b> '+pct(pp)+(r.gain?'<br><span class="mut">'+gm(r.gain)+' a sale</span>':''):'<span class="mut">'+money(pr)+' '+pct(pp)+' now</span>')+'</td>'+
   '<td class="n">'+(o.floor!=null?money(o.floor)+' <span class="mut">'+pct(o.floorPct)+'</span><br>'+(o.ceil!=null?money(o.ceil)+' <span class="mut">80%</span>':'<span class="mut">no cap</span>'):'–')+'</td>'+
   '<td class="n">'+n0(o.sales)+'</td><td class="why">'+bChip(r)+(r.sugg!=null&&!r.up?' <span class="mut">not in upload</span>':'')+'<br>'+esc(r.why)+'<br><span class="mut">Postage '+(o.post!=null?money(o.post):'—')+' · '+esc(o.postSrc||"")+'</span></td></tr>'}).join("")+'</tbody></table></div>';
 if(!out.length)h='<div class="box note">Nothing here. Try “All rows” or clear the search.</div>';
 if(out.length>st.bn)h+='<button class="more" type="button" id="pzbmore">Show more ('+(out.length-st.bn)+' left)</button>';
 $("pzbcnt").textContent=out.length?"Showing "+Math.min(st.bn,out.length)+" of "+out.length+(st.bsort.k?" · sorted":"")+" · tap a column name to sort":"";
 $("pzbtab").innerHTML=h;var m=$("pzbmore");if(m)m.onclick=function(){st.bn+=300;drawBB()};
 Array.prototype.forEach.call($("pzbtab").querySelectorAll("th[data-k]"),function(th){th.onclick=function(){var k=th.getAttribute("data-k");st.bsort.d=st.bsort.k===k?-st.bsort.d:1;st.bsort.k=k;drawBB()}})}
/* every upload row is checked again with the engine: price > 0, profit > £0, at/above the floor, UK at/below the 80% cap, >= 50% (China 100%), one row per SKU */
function bbSafe(){var up=(st.bbr||[]).filter(function(r){return r.up}),seen={},bad=[];
 up.forEach(function(r){var o=r.o,c=P.calc(o.a,r.sugg);
  if(!o.sku||seen[o.sku]||!(r.sugg>0)||!(c.profit>0)||r.sugg<o.floor-1e-9||(o.ceil!=null&&r.sugg>o.ceil+1e-9)||c.pc<P.SAFE_MIN-1e-9||(o.china&&c.pc<P.CHINA_FLOOR-1e-9)||P.rnd(r.sugg,2)===P.rnd(o.price,2))bad.push(o.sku);seen[o.sku]=1});
 return{up:up,bad:bad}}
function bbDownload(){var S=bbSafe(),b=$("pzbdl");if(S.bad.length){alert("Stopped: "+S.bad.length+" row(s) failed the safety check ("+S.bad.slice(0,5).join(", ")+"). Nothing saved.");return}
 if(!S.up.length)return;b.disabled=true;var old=b.innerHTML;b.textContent="Preparing…";
 K.xlsx().then(function(X){var T=(st.doc&&st.doc.template)||TPL,wb=X.utils.book_new();
  var ws=X.utils.aoa_to_sheet(T.Data.slice(0,2).concat(S.up.map(function(r){return[String(r.o.sku),P.rnd(r.sugg,2)]})));ws["!cols"]=[{wch:22},{wch:12},{wch:14},{wch:20},{wch:20}];X.utils.book_append_sheet(wb,ws,"Data");
  if(T.Columns)X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(T.Columns),"Columns");
  X.writeFile(wb,"B&Q Buy Box Price Upload "+today()+".xlsx")}).catch(function(e){alert(K.why(e))}).then(function(){b.disabled=false;b.innerHTML=old})}
function bbRow(r){var o=r.o,r2=function(v){return v==null?"":P.rnd(v,2)},p4=function(v){return v==null?"":Math.round(v*10000)/10000};
 return[o.sku,o.ean,o.title,o.china?"China":"UK",o.price,r2(o.profit),p4(o.pc),o.bb==null?"":o.bb,o.seller,o.win?"Yes":"No",r.act,r2(r.sugg),r2(r.profit),p4(r.pc),r2(r.gain),r2(o.floor),p4(o.floorPct),o.ceil==null?"":o.ceil,o.sales,o.stock==null?"":o.stock,o.post==null?"":o.post,o.postSrc,r.why,r.up?"Yes":""]}
var BBHD=["SKU","EAN","Product","UK / China","Price now","Profit now £","Profit now %","Buy box price","Buy box seller","We win","Action","Suggested price","Profit at suggested £","Profit at suggested %","Profit change £","Floor price","Floor %","Cap price (80%)","B&Q 30-day sales","Free stock","Postage","Postage from","Reason","In upload"];
function bbTable(){var b=$("pzbxl");b.disabled=true;K.xlsx().then(function(X){var rows=(st.bview||st.bbr||[]).map(bbRow);
 var wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet([BBHD].concat(rows));ws["!autofilter"]={ref:"A1:X"+(rows.length+1)};X.utils.book_append_sheet(wb,ws,"Buy box");X.writeFile(wb,"B&Q Buy Box table "+today()+".xlsx")})
 .catch(function(e){alert(K.why(e))}).then(function(){b.disabled=false})}
BQTabs.add("pricing",{title:"Pricing",render:function(body){return render(body)}});
/* ---- pricing workbook (bq_book.js) – 7a UK / 7b China + China raises review ---- */
function b7opt(){return Object.assign({},st.bbo,{chinaRaise:false,checkPost:!!st.bbo.checkPost,checks:st.checks&&st.checks.items||{}})}
function b7draw(){var B=window.BQBook,R=st.bbr||[];if(!$("pzb7"))return;if(!B||!R.length){$("pzb7dl").disabled=true;$("pzb7c").innerHTML="";return}
 var X=B.classify(P,R,b7opt()),n={2:0,3:0,4:0,5:0},s3=0,s5=0,c6=0,c7uk=0,c7cn=0,nRaise=0;X.forEach(function(x){if(n[x.tab]!=null)n[x.tab]++;if(x.tab===3&&x.sugg!=null)s3++;if(x.tab===5&&x.sugg!=null)s5++;
  if(x.cat==="raise"&&x.o.china){nRaise++;return}if(x.sugg!=null&&(x.tab>2||x.cat==="raise")){c6++;if(x.inc==="Yes"&&!(x.o.check&&!st.bbo.checkPost)){if(x.o.china)c7cn++;else c7uk++}}});
 var t=[["1 All",n0(R.length)],["2 Winning, in range",n0(n[2])],["3 Winning, 0 sales",n0(n[3])+" · "+n0(s3)+" to lower"],["4 Can win",n0(n[4])],["5 Margin too low",n0(n[5])+" · "+n0(s5)+" optional"],["6 Combined",n0(c6)],["China raises review",n0(nRaise)],["7a Final UK",n0(c7uk)+" prices"],["7b Final China",n0(c7cn)+" prices"]];var E8=B.sells?B.sells(P,X,st.aoa||[]):[];st.b8=E8.length;t.push(["8 Sells elsewhere, not B&Q",n0(E8.length)]);
 $("pzb7c").innerHTML=t.map(function(a){return '<span class="pz-b7t"><b>'+esc(a[1])+'</b>'+esc(a[0])+'</span>'}).join("");
 $("pzb7src").textContent=st.src==="file"?"· from your Access file "+(st.file||""):"· from the published Access file "+(st.file||"");$("pzb7dl").disabled=false}
function b7input(){var doc=st.doc||{},meta=doc.meta||{};return{bbr:st.bbr,aoa:st.aoa,settings:b7opt(),template:doc.template||TPL,checks:st.checks&&st.checks.items||{},rivals:doc.rivals||{},fresh:st.fresh||{},priceChanges:doc.priceChanges||meta.priceChanges||null,asOf:doc.asOf||meta.as_of||meta.access_date||st.accessDate||""}}
function saveBytes(bytes,name){var bl=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),u=URL.createObjectURL(bl),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},4000)}
function book7(){var b=$("pzb7dl");if(!window.BQBook||!st.bbr)return;b.disabled=true;var old=b.innerHTML;b.textContent="Preparing…";
 K.xlsx().then(function(X){var out=window.BQBook.build(X,P,b7input());st.b7=out.counts;saveBytes(out.bytes,"B&Q Pricing 7a/7b "+(st.accessDate||"")+" made "+today()+".xlsx");
  $("pzb7n").textContent=" Saved – 7a UK "+(out.counts.t7uk||0)+", 7b China "+(out.counts.t7cn||0)+" (China raises review "+(out.counts.chinaRaiseReview||0)+").";}).catch(function(e){alert(K.why(e))}).then(function(){b.disabled=false;b.innerHTML=old})}
function fromEdited(f){var n=$("pzb7n");n.textContent=" Reading "+f.name+"…";
 Promise.all([K.xlsx(),f.arrayBuffer()]).then(function(a){var X=a[0],wb=X.read(new Uint8Array(a[1]),{type:"array"}),by={};(st.bbr||[]).forEach(function(r){if(!r.o.dup&&!by[r.o.sku])by[r.o.sku]=r.o});
  var E=window.BQBook.fromEdited(X,P,wb,by,b7opt());
  if(!E.rows.length){n.textContent=" No prices to upload in tab 7"+(E.bad.length?" ("+E.bad.length+" row(s) failed the check: "+E.bad.slice(0,5).join(", ")+")":"")+".";return}
  var T=(st.doc&&st.doc.template)||TPL,w2=X.utils.book_new(),ws=X.utils.aoa_to_sheet(T.Data.slice(0,2).concat(E.rows));ws["!cols"]=[{wch:22},{wch:12},{wch:14},{wch:20},{wch:20}];X.utils.book_append_sheet(w2,ws,"Data");
  if(T.Columns)X.utils.book_append_sheet(w2,X.utils.aoa_to_sheet(T.Columns),"Columns");
  X.writeFile(w2,"B&Q Price Upload from my workbook "+today()+".xlsx");
  n.textContent=" Saved B&Q upload with "+E.rows.length+" price"+(E.rows.length===1?"":"s")+"."+(E.bad.length?" Left out "+E.bad.length+" row(s) that failed the check: "+E.bad.slice(0,8).join(", ")+(E.bad.length>8?"…":""):"")}).catch(function(e){n.textContent=" "+K.why(e)})}
var CHKHTML='<div class="box" id="pzchk"><b>Import checked workbook</b> <span class="mut">Saved in this browser only</span>'+
 '<p class="note">Choose the pricing workbook after you have typed postage or Include in the yellow cells. This page does not open an Excel file that is only saved on the computer — use this button. Checks stay in this browser after a refresh and are used the next time you open an Access file or download a workbook. They are not synced to your other devices. Export a backup if you need a copy. Blank cells do not remove a check you already saved.</p>'+
 '<button class="btn o" type="button" id="pzchkimp">Import checked workbook</button> '+
 '<label class="pz-tg" style="display:inline-flex"><input type="checkbox" id="pzchkyour"> Also remember Your price (checked again against today’s cost, floors and blocks)</label>'+
 '<input type="file" id="pzchkfile" class="hide" accept=".xlsx,.xlsm">'+
 '<div id="pzchkprev"></div><div id="pzchkrev"></div>'+
 '<p><button class="btn l" type="button" id="pzchkexp">Export checks backup</button> '+
 '<label class="btn l" for="pzchkbin">Import checks backup</label><input type="file" id="pzchkbin" class="hide" accept=".json,application/json"> '+
 '<button class="btn l" type="button" id="pzchkclr">Remove all saved checks</button></p>'+
 '<div class="note" id="pzchkmsg"></div></div>';
function persistChecks(s){var n=BQBook.normStore(s);try{localStorage.setItem(LSC,JSON.stringify(n));st.checks=n;return {ok:true};}catch(e){return {ok:false,error:"This browser could not store the checks (storage is full or blocked). Export a backup. Nothing new was saved."};}}
function checkCtx(){var by={},pack=BQBook.liveRecords?BQBook.liveRecords(P,b7input()):null;if(pack)pack.recs.forEach(function(r){by[r.sku]={postAuto:r.basePost,priceNow:r.basePrice,incDefault:r.engInc,sugg:r.engSugg};});return {by:by,yourPrice:!!st.checkYour};}
function chkWire(){if(!$("pzchkimp"))return;
 $("pzchkyour").checked=!!st.checkYour;$("pzchkyour").onchange=function(){st.checkYour=this.checked;if(st._chkWb)showPreview(st._chkWb);};
 $("pzchkimp").onclick=function(){$("pzchkfile").click();};
 $("pzchkfile").onchange=function(){var f=this.files&&this.files[0];this.value="";if(f)readChecked(f);};
 $("pzchkexp").onclick=exportChecks;$("pzchkbin").onchange=function(){var f=this.files&&this.files[0];this.value="";if(f)importBackup(f);};
 $("pzchkclr").onclick=function(){if(!window.confirm("Remove every saved check in this browser?"))return;var r=persistChecks({v:1,items:{}});$("pzchkmsg").textContent=r.ok?"Removed the saved checks in this browser.":r.error;if(r.ok){compute();draw();}};}
function readChecked(file){$("pzchkmsg").textContent="Reading "+file.name+"…";
 Promise.all([K.xlsx(),file.arrayBuffer()]).then(function(a){var X=a[0],wb;try{wb=X.read(new Uint8Array(a[1]),{type:"array",cellFormula:true});}catch(e){throw new Error("This is not an Excel file.");}
  st._chkWb=wb;showPreview(wb);}).catch(function(e){$("pzchkmsg").textContent=(e&&e.message)||K.why(e);});}
function showPreview(wb){K.xlsx().then(function(X){var prev=BQBook.parseChecks(X,wb,checkCtx());st._chkPrev=prev;var box=$("pzchkprev");if(!prev.ok){box.innerHTML='<p class="bad">'+esc(prev.error)+'</p>';return;}
 var c=prev.counts;
 box.innerHTML='<p><b>Preview — nothing is saved until you confirm.</b> Stored in this browser only, not on the server.</p>'+
  '<p>Postage corrections: <b>'+c.postage+'</b> · Selling price corrections: <b>'+c.sellingPrice+'</b> · Include decisions: <b>'+c.include+'</b> · Your price: <b>'+(st.checkYour?c.your:"not read — tick the box to remember Your price")+'</b></p>'+
  '<p>Unknown SKUs: '+c.unknown+(prev.unknown.length?" ("+esc(prev.unknown.slice(0,12).join(", "))+(prev.unknown.length>12?"…":"")+")":"")+' · Duplicate SKUs skipped: '+c.duplicate+' · Conflicts (not saved): '+c.conflict+' · Invalid values: '+c.invalid+' · Formulas ignored: '+c.formulas+' · Blank cells left as they are: '+c.blank+'</p>'+
  (c.postage+c.sellingPrice+c.include+(st.checkYour?c.your:0)?'<button class="btn o" type="button" id="pzchksave">Save these checks in this browser</button> ':'<span class="ok">No checked changes to save.</span>')+
  ' <button class="btn l" type="button" id="pzchkcan">Cancel</button>';
 var s=$("pzchksave");if(s)s.onclick=savePreview;var n=$("pzchkcan");if(n)n.onclick=function(){st._chkWb=null;st._chkPrev=null;$("pzchkprev").innerHTML="";};});}
function savePreview(){if(!st._chkPrev||!st._chkPrev.ok)return;var next=BQBook.applyPreview(st.checks,st._chkPrev);var r=persistChecks(next);$("pzchkmsg").textContent=r.ok?"Saved in this browser. Postage and selling-price corrections will be used on the next Access file and the next workbook.":r.error;if(r.ok){st._chkWb=null;$("pzchkprev").innerHTML="";compute();draw();}}
function chkDraw(){var box=$("pzchkrev");if(!box||!st.checks)return;var items=st.checks.items||{},keys=Object.keys(items).sort();
 box.innerHTML='<p><b>'+keys.length+'</b> saved check'+(keys.length===1?"":"s")+' in this browser.'+(keys.length?" ":" None yet.")+'</p>'+(keys.length?'<div class="tw"><table class="bt pz-t"><thead><tr><th>SKU</th><th>Postage</th><th>Selling price</th><th>Include</th><th>Your price</th><th></th></tr></thead><tbody>'+keys.slice(0,40).map(function(sku){var c=items[sku];return '<tr><td class="mono">'+esc(sku)+'</td><td>'+(c.post!=null?money(c.post):"")+'</td><td>'+(c.priceNow!=null?money(c.priceNow):"")+'</td><td>'+esc(c.inc||"")+'</td><td>'+(c.your!=null?money(c.your):"")+'</td><td><button type="button" class="btn l" data-rm="'+esc(sku)+'">Remove</button></td></tr>';}).join("")+'</tbody></table></div>'+(keys.length>40?'<p class="mut">Showing 40 of '+keys.length+'. Export a backup for the full list.</p>':""):"");
 Array.prototype.forEach.call(box.querySelectorAll("[data-rm]"),function(b){b.onclick=function(){var k=b.getAttribute("data-rm"),s=BQBook.normStore(st.checks);delete s.items[k];var r=persistChecks(s);if(r.ok){compute();draw();}}});}
function exportChecks(){var blob=new Blob([JSON.stringify(BQBook.backup(st.checks),null,2)],{type:"application/json"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download="BQ checked backup "+today()+".json";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove();},1000);$("pzchkmsg").textContent="Backup downloaded. It only works as a checks backup, in a browser, and it is not synced for you.";}
function importBackup(file){file.text().then(function(t){var obj;try{obj=JSON.parse(t);}catch(e){$("pzchkmsg").textContent="That file is not a checks backup.";return;}
 var got=BQBook.restoreBackup(obj);if(!got.ok){$("pzchkmsg").textContent=got.error;return;}
 var cur=BQBook.normStore(st.checks);Object.keys(got.store.items).forEach(function(k){cur.items[k]=got.store.items[k];});
 var r=persistChecks(cur);$("pzchkmsg").textContent=r.ok?"Merged the backup into this browser.":r.error;if(r.ok){compute();draw();}});}
window.BQPricing={state:function(){return st},bbRow:bbRow,BBHD:BBHD,bbSafe:function(){return bbSafe()},book7:function(X){return window.BQBook.build(X,P,b7input())},b7opt:b7opt};
})();
