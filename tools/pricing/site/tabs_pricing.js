(function(){
"use strict";
/* B&Q dashboard – Pricing tab. Daily steps: upload today's Access file (and optionally the buy box file),
   download the 7a/7b pricing workbook, edit postage, then import the checked workbook.
   All maths = window.BQP (bq_price.js) and window.BQBook / window.BQLive. Everything is read and built
   in this browser. Nothing is sent anywhere; files are saved to this device only. */
if(!window.BQTabs||!window.BQP)return;
var K=BQTabs.kit,$=K.$,esc=K.esc,money=K.money,P=window.BQP,Q=window.BQC;
var LSY="bqPriceYour1",LSO="bqPriceOpt1",LSV="bqPriceView1",LSB="bqBBOpt1",LSC="bqChecked1";
var TPL={Data:[["Offer SKU","Offer price","Discount price","Discount start date","Discount end date"],["offer-sku","price","discount-price","discount-start-date","discount-end-date"]]};
function ls(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function lss(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function n0(v){return v==null||v===""?"–":Number(v).toLocaleString("en-GB")}
function today(){var d=new Date(),p=function(n){return(n<10?"0":"")+n};return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())}
function dmy(d){var m=/^(\d{4})-(\d\d)-(\d\d)/.exec(d||"");return m?(+m[3])+" "+"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[m[2]-1]+" "+m[1]:d}
function fileDate(file){var m=/(\d{4}-\d{2}-\d{2})/.exec(file&&file.name||"");return m?m[1]:new Date((file&&file.lastModified)||Date.now()).toISOString().slice(0,10)}
var CSS='.pz-b7g{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 10px}.pz-b7t{display:inline-flex;flex-direction:column;padding:6px 10px;border-radius:10px;background:#F1F5F9;font-size:12px;color:#475569;min-width:92px}.pz-b7t b{font-size:16px;color:#0F172A}#pzb7inl{cursor:pointer}'+
 '.pz-big{font-size:18px;padding:16px 22px}.pz-tg{display:flex;align-items:center;gap:8px;font-size:15px;margin:6px 0}.pz-tg input{width:20px;height:20px;accent-color:#FF6600}'+
 '.pz-how{background:#fff;border:2px solid #FF6600;border-radius:14px;padding:16px 18px;margin-bottom:16px}.pz-how h2{margin:0 0 8px;font-size:22px;color:#0F172A}'+
 '.pz-how .lead{margin:0 0 10px;font-size:16px;color:#334155}.pz-how ol{margin:0;padding-left:28px}.pz-how li{margin:0 0 10px;font-size:16px;line-height:1.45;color:#0F172A}'+
 '.pz-how .tip{display:block;color:#475569;font-size:14px;font-weight:400;margin-top:3px}'+
 '.pz-oops{background:#FFF7ED;border:1px solid #FDBA74;border-radius:10px;padding:10px 12px;margin-top:12px}.pz-oops b{display:block;margin-bottom:6px;color:#9A3412}'+
 '.pz-oops ul{margin:0;padding-left:20px}.pz-oops li{margin:0 0 6px;font-size:14px;line-height:1.4;color:#334155}'+
 '.pz-acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0 10px}.pz-t td,.pz-t th{padding:7px 8px}';
var st=null;
var HOW='<div class="pz-how" id="pzhow"><h2>How to make today\'s prices</h2>'+
 '<p class="lead">Do these steps every day, in this order. If today\'s Access file is already shown under the buttons, you can go straight to step 4.</p>'+
 '<ol>'+
 '<li>Get today\'s Access file from your email and save it on your computer.'+
 '<span class="tip">It is an Excel file. The name usually looks like Access_2026-11-10.xlsx.</span></li>'+
 '<li>Click the big orange button <b>1. Upload Access file</b> and pick that file.'+
 '<span class="tip">The file is read only on this computer. It is not sent anywhere. If it worked, you will see a green tick and the file name under the button.</span></li>'+
 '<li>If you also have today\'s buy box file, click <b>Upload buy box file (optional)</b> and pick it. If you do not have this file, skip this step.'+
 '<span class="tip">The page will then use the buy box check already on this site.</span></li>'+
 '<li>Click the big orange button <b>2. Download pricing workbook</b> and open the saved file in Excel.</li>'+
 '<li>Open the sheet called <b>6 Combined upload</b>. Click the filter on the Check column and tick only <b>CHECK POSTAGE</b>. Type the postage in the yellow cell for each of those rows.</li>'+
 '<li>Open the sheet called <b>7a Final upload UK</b>. Copy those prices into your B&amp;Q CSV template, then upload that file to B&amp;Q. If the sheet <b>7b Final upload China</b> has a price, copy that one too.</li>'+
 '<li>Come back to this page. Click <b>3. Import checked workbook</b> and pick the same Excel file you just edited. This remembers the postage you typed, so you do not have to type it again tomorrow.'+
 '<span class="tip">You can also click <b>Make B&amp;Q upload from my edited workbook</b> to get a ready B&amp;Q upload file from that same workbook.</span></li>'+
 '</ol>'+
 '<div class="pz-oops"><b>If something goes wrong</b><ul>'+
 '<li>Wrong Access file: a red message appears under the Upload Access file button, starting with “This is not the Access…”. Click the button again and pick the Access file. It must have a sheet called B&amp;QBB3, or a sheet with a column called Estimated cost.</li>'+
 '<li>Wrong buy box file: a red message appears under the buy box button, starting with “This is not the buy box file…”. The buy box file must have columns called code, seller and price.</li>'+
 '<li>The download button is grey: wait a few seconds for the Access file to finish, or upload it again.</li>'+
 '<li>You picked the wrong file by mistake: click the same button again and pick the right one.</li>'+
 '</ul></div></div>';
function render(body){
 if(!document.getElementById("pz-css")){var s=document.createElement("style");s.id="pz-css";s.textContent=CSS;document.head.appendChild(s)}
 st={doc:null,bbDoc:null,src:"pub",file:"",aoa:null,accessDate:"",your:ls(LSY,{}),opt:ls(LSO,{raise100:false,checkPost:false,pennyTrims:false,chinaRaise:false}),checks:window.BQBook?BQBook.normStore(ls(LSC,{v:1,items:{}})):{v:1,items:{}},checkYour:false,bbo:Object.assign({},P.BB_DEFAULT,{checkPost:false},ls(LSB,{})),userScrape:null};
 body.innerHTML=HOW+
  '<div class="src" id="pzsrc">Reading the prices…</div>'+
  '<div class="box" id="pzup"><div class="pz-acts">'+
  '<button class="btn o pz-big" type="button" id="pzfilebtn">1. Upload Access file</button>'+
  '<input type="file" id="pzfile" class="hide" accept=".xlsx,.xls,.xlsm">'+
  '<button class="btn l pz-big" type="button" id="pzbbbtn">Upload buy box file (optional)</button>'+
  '<input type="file" id="pzbbfile" class="hide" accept=".xlsx,.xls,.xlsm">'+
  '<button class="btn l hide" type="button" id="pzpub">Use the published file instead</button></div>'+
  '<div class="note" id="pzfmsg"></div><div class="note" id="pzbbmsg"></div></div>'+
  '<div class="box pz-b7" id="pzb7"><b>Pricing workbook – 7a/7b + review</b> <span class="mut" id="pzb7src"></span>'+
  '<div class="pz-b7g" id="pzb7c"></div>'+
  '<button class="btn o pz-big" type="button" id="pzb7dl" disabled>2. Download pricing workbook</button>'+
  '<p class="note">This is the Excel workbook with all the price tabs (including 7a UK and 7b China). It is made on this computer – nothing is sent to B&amp;Q.</p></div>'+
  CHKHTML;
 $("pzfilebtn").onclick=function(){$("pzfile").click()};
 $("pzbbbtn").onclick=function(){$("pzbbfile").click()};
 $("pzfile").onchange=function(){if(this.files[0])pick(this.files[0]);this.value=""};
 $("pzbbfile").onchange=function(){if(this.files[0])pickBB(this.files[0]);this.value=""};
 $("pzpub").onclick=function(){if(!st.doc)return;st.src="pub";st.aoa=st.doc.aoa;st.accessDate=st.doc.meta.access_date;st.file=st.doc.meta.access;st.userScrape=null;this.classList.add("hide");$("pzfmsg").textContent="";$("pzbbmsg").textContent="";compute();draw()};
 $("pzb7dl").onclick=book7;$("pzb7in").onchange=function(){var f=this.files&&this.files[0];this.value="";if(f)fromEdited(f)};
 chkWire();
 var bb=K.getJSON("buybox.enc").then(function(d){return d},function(){return null});
 return K.getJSON("pricing.enc").then(function(d){return d},function(e){if(e&&e.message==="notyet")return null;throw e}).then(function(doc){
  return bb.then(function(b){st.bbDoc=b;st.doc=doc;
   if(!doc){$("pzsrc").innerHTML='<b>The published Pricing file is not on this site yet.</b> Use step 2 to choose an Access file.';return}
   st.aoa=doc.aoa;st.accessDate=doc.meta.access_date;st.file=doc.meta.access;compute();draw()})})}
function showPub(){$("pzpub").classList.toggle("hide",!(st&&(st.src==="file"||st.userScrape)))}
function compute(){
 var useImp=!!st.doc&&(st.src==="pub"||st.accessDate<=st.doc.meta.access_date),ov={imported:useImp?st.doc.imported||{}:{},importedLabel:useImp?st.doc.meta.imported_label:""};
 var useS=!!(st.doc&&st.doc.sales30&&st.doc.meta.sales_last&&st.accessDate<=st.doc.meta.sales_last);if(useS){ov.sales30=st.doc.sales30;ov.salesLabel="B&Q orders to "+st.doc.meta.sales_last}
 var sc=st.userScrape||(st.doc&&st.doc.bbScrape);
 var M=P.bbMap(st.bbDoc&&st.bbDoc.rows,st.accessDate),SC=P.bbFromScrape(sc,st.accessDate),fresh={};
 if(st.userScrape&&SC.stale){if($("pzbbmsg"))$("pzbbmsg").innerHTML='<span class="bad">This buy box file is older than the Access file, so it was not used.</span>'}
 if(SC.n&&(st.userScrape&&!SC.stale||!st.userScrape&&(!M.n||String(sc.date)>String(M.to||"").slice(0,10)))){
  M={map:SC.map,n:SC.n,label:SC.label+(st.userScrape?" (your file)":""),scrape:true,failed:SC.failed};fresh=SC.fresh;
 }else Object.keys(M.map).forEach(function(e){fresh[e]=1});
 st.fresh=fresh;ov.bb=M.map;ov.bbLabel=M.label;
 if(st.doc&&st.doc.offers){ov.offers=st.doc.offers;ov.offersLabel=(st.doc.meta&&st.doc.meta.offers_label)||"Active offers";ov.today=(st.doc.meta&&(st.doc.meta.offers_date||st.doc.meta.access_date))||st.accessDate}
 var A=P.fromAccess(st.aoa,ov);A.rows.forEach(function(r){var c=st.checks&&st.checks.items&&st.checks.items[r.sku];r.priceEngine=r.price;if(c&&c.post!=null)r.postYour=c.post;if(c&&c.priceNow!=null)r.price=c.priceNow;if(c&&c.your!=null)r.your=c.your;if(st.your[r.sku]!=null)r.your=st.your[r.sku]});
 st.prep=A;st.M=M;st.res=P.decideAll(A.rows,st.opt);
 if(Q){var ok={};checkRes().rows.forEach(function(r){if(r.blocked)ok[r.sku]=1});st.res.rows.forEach(function(o){if(o.upload&&ok[o.sku]){o.upload=false;o.status=o.china?"Under 100% China – blocked":"Check failed – blocked";o.why=o.status}})}
 bbCompute();
 var run=!M.scrape&&st.bbDoc&&st.bbDoc.run||{},c=A.counts;
 $("pzsrc").innerHTML='<div><b>'+(st.src==="pub"?"Published Access file: ":"Your Access file: ")+esc(st.file)+'</b>'+(st.src==="pub"&&st.doc?' <span class="mut">(published '+K.uk(st.doc.meta.created)+')</span>':"")+'</div>'+
  '<div>Buy box: '+(M.n?'<b>'+esc(M.label)+'</b> for '+n0(c.bbOverlay)+' products'+(M.scrape?' <span class="mut">('+n0(M.failed)+' checks did not work today)</span>':'')+(run.status&&run.status!=="complete"?' <span class="bad">(run '+esc(run.status)+')</span>':"")+'.':'<span class="bad">no buy box file newer than the Access file</span> – using the Access buy box.')+'</div>'+
  '<div class="mut">Price now: Access price'+(c.importedOverlay?', or the price you imported ('+esc(ov.importedLabel)+', '+n0(c.importedOverlay)+' products)':"")+(c.livePrice?', or our live B&amp;Q price where we win the buy box ('+n0(c.livePrice)+' products)':"")+'.</div>'+
  '<div class="mut">30-day sales: '+(useS?'B&amp;Q orders up to '+esc(dmy(st.doc.meta.sales_last))+' – same as the Sales page ('+n0(c.soldSkus)+' products sold).':'Access “B n Q 30Days” column.')+'</div>'+
  (st.res.dups?'<div class="bad">'+st.res.dups+' duplicate product code row(s) – only the first one is used.</div>':"")+(st.res.nosku?'<div class="mut">'+st.res.nosku+' row(s) with no product code skipped.</div>':"")}
function checkRes(){var items=st.res.rows.filter(function(o){return o.changed}).map(function(o){return{o:o,x:{}}});
 return Q.build(items,{checkPost:!!st.opt.checkPost},{title:"Dashboard Pricing tab",made:K.uk(new Date().toISOString()),input:(st.src==="pub"?"Published Access file: ":"Your Access file: ")+st.file,
  changeRule:"New price (your typed price or the rule price) different from the price now.",
  bb:st.M&&st.M.n?st.M.label+" where the EAN was checked; otherwise the Access buy box.":"Access buy box (no newer buy box file).",sales:st.prep.counts.soldSkus!=null&&st.doc&&st.doc.sales30?"B&Q orders (same as the Sales tab) when not older than the Access file, else Access B n Q 30Days":"Access B n Q 30Days"})}
function draw(){if(!st)return;showPub();if(!st.res)return;b7draw();chkDraw()}
function pick(file){var msg=$("pzfmsg");msg.textContent="Reading "+file.name+"…";
 K.xlsx().then(function(X){return file.arrayBuffer().then(function(buf){var wb;try{wb=X.read(new Uint8Array(buf),{type:"array"})}catch(e){throw new Error("This is not an Excel file. Please pick the Access file you saved (it ends in .xlsx).")}
  var name=wb.SheetNames.indexOf("B&QBB3")>=0?"B&QBB3":wb.SheetNames.filter(function(n){var a=X.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null});return a[0]&&a[0].indexOf("Estimated cost")>=0})[0];
  if(!name)throw new Error("This is not the Access file – no sheet called B&QBB3, and no sheet with a column called Estimated cost.");
  var aoa=X.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});P.fromAccess(aoa.slice(0,2),{});
  st.src="file";st.aoa=aoa;st.file=file.name;st.accessDate=fileDate(file);compute();draw();
  msg.innerHTML='<span class="ok">✓ Using '+esc(file.name)+'</span> – '+n0(st.prep.counts.rows)+' rows (sheet '+esc(name)+').'})})
 .catch(function(e){msg.innerHTML='<span class="bad">'+esc(e&&e.message&&!/^(net|notyet|nokey|otherkey)$/.test(e.message)?e.message:K.why(e))+'</span>'})}
function parseBuybox(X,wb,file){
 function heads(row){return (row||[]).map(function(x){return String(x==null?"":x).trim().toLowerCase()})}
 var name=null,aoa=null,h=null,s,a,hd,i;
 for(i=0;i<wb.SheetNames.length;i++){
  s=wb.SheetNames[i];a=X.utils.sheet_to_json(wb.Sheets[s],{header:1,raw:true,defval:null});hd=heads(a[0]);
  if((hd.indexOf("code")>=0||hd.indexOf("ean")>=0||hd.indexOf("product-id")>=0)&&(hd.indexOf("seller")>=0)&&(hd.indexOf("price")>=0||hd.indexOf("buy box price")>=0||hd.indexOf("b&q_bb.price")>=0)){name=s;aoa=a;h=hd;break}
 }
 if(!name)throw new Error("This is not the buy box file – it needs columns called code, seller and price.");
 function col(){var k,j;for(k=0;k<arguments.length;k++){j=h.indexOf(arguments[k]);if(j>=0)return j}return -1}
 var iE=col("code","ean","product-id"),iS=col("seller"),iP=col("price","buy box price","b&q_bb.price"),iSt=col("status");
 var rows=[],ok=0,fail=0,r,e,seller,price,status,good;
 for(r=1;r<aoa.length;r++){
  e=P.eanOf(aoa[r][iE]);if(!e)continue;
  seller=String(aoa[r][iS]==null?"":aoa[r][iS]).trim();price=P.num(aoa[r][iP]);status=iSt>=0?String(aoa[r][iSt]==null?"":aoa[r][iSt]):"";
  good=(!status||status.indexOf("OK")===0)&&!!seller&&price!=null&&price>0;
  rows.push({ean:e,seller:seller,price:price,ok:good,status:status.split(";")[0].slice(0,60)});
  if(good)ok++;else fail++;
 }
 if(!rows.length)throw new Error("This is not the buy box file – no product codes were found in it.");
 if(!ok)throw new Error("This buy box file has no successful checks (no seller and price). Pick the full daily buy box file.");
 return {file:file.name,date:fileDate(file),rows:rows,ok:ok,failed:fail,saved:new Date().toISOString().slice(0,16)};
}
function pickBB(file){var msg=$("pzbbmsg");msg.textContent="Reading "+file.name+"…";
 K.xlsx().then(function(X){return file.arrayBuffer().then(function(buf){var wb;try{wb=X.read(new Uint8Array(buf),{type:"array"})}catch(e){throw new Error("This is not an Excel file. Please pick the buy box file you saved (it ends in .xlsx).")}
  st.userScrape=parseBuybox(X,wb,file);compute();draw();
  msg.innerHTML='<span class="ok">✓ Using '+esc(file.name)+'</span> – '+n0(st.userScrape.ok)+' products checked'+(st.userScrape.failed?' ('+n0(st.userScrape.failed)+' did not work)':'')+'.'})})
 .catch(function(e){st.userScrape=null;msg.innerHTML='<span class="bad">'+esc(e&&e.message&&!/^(net|notyet|nokey|otherkey)$/.test(e.message)?e.message:K.why(e))+'</span>'})}
function bbCompute(){if(!st.res)return;st.bbr=P.buyBoxAll(st.res.rows,st.fresh,(st.doc&&st.doc.rivals)||{},st.bbo);
 st.bbr.forEach(function(r){r.xmas=P.isSeasonal(r.o.title,r.o.sku);r.held=r.act==="Raise"&&!!r.o.china&&!st.opt.chinaRaise;r.up=r.sugg!=null&&!r.o.dup&&(!r.o.check||!!st.bbo.checkPost||!!r.o.postChecked)&&!r.held})}
function bbSafe(){var up=(st.bbr||[]).filter(function(r){return r.up}),seen={},bad=[];
 up.forEach(function(r){var o=r.o,c=P.calc(o.a,r.sugg);
  if(!o.sku||seen[o.sku]||!(r.sugg>0)||!(c.profit>0)||r.sugg<o.floor-1e-9||(o.ceil!=null&&r.sugg>o.ceil+1e-9)||c.pc<P.SAFE_MIN-1e-9||(o.china&&c.pc<P.CHINA_FLOOR-1e-9)||P.rnd(r.sugg,2)===P.rnd(o.price,2))bad.push(o.sku);seen[o.sku]=1});
 return{up:up,bad:bad}}
function bbRow(r){var o=r.o,r2=function(v){return v==null?"":P.rnd(v,2)},p4=function(v){return v==null?"":Math.round(v*10000)/10000};
 return[o.sku,o.ean,o.title,o.china?"China":"UK",o.price,r2(o.profit),p4(o.pc),o.bb==null?"":o.bb,o.seller,o.win?"Yes":"No",r.act,r2(r.sugg),r2(r.profit),p4(r.pc),r2(r.gain),r2(o.floor),p4(o.floorPct),o.ceil==null?"":o.ceil,o.sales,o.stock==null?"":o.stock,o.post==null?"":o.post,o.postSrc,r.why,r.up?"Yes":""]}
var BBHD=["SKU","EAN","Product","UK / China","Price now","Profit now £","Profit now %","Buy box price","Buy box seller","We win","Action","Suggested price","Profit at suggested £","Profit at suggested %","Profit change £","Floor price","Floor %","Cap price (80%)","B&Q 30-day sales","Free stock","Postage","Postage from","Reason","In upload"];
BQTabs.add("pricing",{title:"Pricing",render:function(body){return render(body)}});
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
var CHKHTML='<div class="box" id="pzchk"><b>After you edit the workbook</b> <span class="mut">Saved in this browser only</span>'+
 '<p class="note">Use this after you have typed postage in the yellow cells. Pick the same workbook you just edited. Checks stay in this browser after you refresh the page. They are not copied to your other devices. Export a backup if you need a copy. Blank cells do not remove a check you already saved.</p>'+
 '<div class="pz-acts">'+
 '<button class="btn o pz-big" type="button" id="pzchkimp">3. Import checked workbook</button> '+
 '<label class="btn l pz-big" for="pzb7in" id="pzb7inl">Make B&amp;Q upload from my edited workbook</label><input type="file" id="pzb7in" accept=".xlsx" class="hide">'+
 '</div>'+
 '<label class="pz-tg"><input type="checkbox" id="pzchkyour"> Also remember Your price (checked again against today’s cost)</label>'+
 '<input type="file" id="pzchkfile" class="hide" accept=".xlsx,.xlsm">'+
 '<div id="pzchkprev"></div><div id="pzchkrev"></div>'+
 '<p><button class="btn l" type="button" id="pzchkexp">Export checks backup</button> '+
 '<label class="btn l" for="pzchkbin">Import checks backup</label><input type="file" id="pzchkbin" class="hide" accept=".json,application/json"> '+
 '<button class="btn l" type="button" id="pzchkclr">Remove all saved checks</button></p>'+
 '<div class="note" id="pzchkmsg"></div><div class="note" id="pzb7n"></div></div>';
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
