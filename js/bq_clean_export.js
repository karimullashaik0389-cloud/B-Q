/* Clean 7a / 7b (or File 2 UK / China) CSV export, run in the browser.
   Reads cached Excel values only — no recalculation — the same way the
   Access upload reads an xlsx (SheetJS, lib/xlsx.full.min.js).
   Output matches export_upload_csvs.py and the live Pricing-tab download
   (BQBook.uploadCsv): one header line
     offer-sku,price,discount-price,discount-start-date,discount-end-date
   plus rows where Offer SKU is filled, CRLF, no blank or comma-only lines.
   If cached prices are missing, the button refuses and does not download.
   Staging only. Nothing is sent to B&Q or Mirakl. */
(function(){
"use strict";
var XLSX_LIB="lib/xlsx.full.min.js";
var CODE_HEADER=["offer-sku","price","discount-price","discount-start-date","discount-end-date"];
var CODE_HEADER_LINE=CODE_HEADER.join(",");
var NO_CACHE_MSG="This file has no stored prices. Open it in Excel, wait for it to finish calculating, save it, and choose it again.";
var WORK_SHEETS=[["7a UK upload","7a_UK_upload.csv"],["7b China upload","7b_China_upload.csv"]];
var DETAIL_SHEETS=[["UK upload","full_detail_UK_upload.csv"],["China upload","full_detail_China_upload.csv"]];
var BOOK_SHEETS=[["7a Final upload UK","7a_UK_upload.csv"],["7b Final upload China","7b_China_upload.csv"]]; /* the Pricing tab's "2. Download pricing workbook" */

function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])})}

function xlsxLib(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(window.BQTabs&&BQTabs.kit&&BQTabs.kit.xlsx)return BQTabs.kit.xlsx();
  return new Promise(function(res,rej){
    var s=document.createElement("script");
    s.src=XLSX_LIB;
    s.onload=function(){window.XLSX?res(window.XLSX):rej(new Error("Excel library did not load"))};
    s.onerror=function(){rej(new Error("Excel library did not load"))};
    document.head.appendChild(s);
  });
}

function sheetsFor(wb){
  var names=wb.SheetNames||[];
  function has(n){return names.indexOf(n)>=0}
  if(has("7a UK upload")&&has("7b China upload"))return WORK_SHEETS;
  if(has("7a Final upload UK")&&has("7b Final upload China"))return BOOK_SHEETS;
  if(has("UK upload")&&has("China upload"))return DETAIL_SHEETS;
  throw new Error("That is not a work file or full-detail file. It needs 7a / 7b, or UK upload / China upload, sheets.");
}

function ukSheetName(wb){
  var names=wb.SheetNames||[];
  if(names.indexOf("7a UK upload")>=0)return "7a UK upload";
  if(names.indexOf("7a Final upload UK")>=0)return "7a Final upload UK";
  if(names.indexOf("UK upload")>=0)return "UK upload";
  return "";
}

function isFormulaText(v){
  if(typeof v!=="string")return false;
  var s=v.trim();
  return s.charAt(0)==="="||s.indexOf("IF(")===0||s.indexOf("IFERROR(")===0;
}

/* Cached value of one cell. SheetJS stores the formula in `f` and the stored
   result in `v`. A cell with only `f` (or a missing cell) has no cache. */
function cachedCell(ws,addr){
  if(!ws)return {ok:false,empty:true};
  var c=ws[addr];
  if(!c)return {ok:false,empty:true};
  if(typeof c.v==="string"&&isFormulaText(c.v))return {ok:false,formula:true,v:c.v};
  if(c.v===undefined||c.v===null)return {ok:false,empty:true,formula:!!c.f};
  return {ok:true,v:c.v,empty:c.v===""};
}

function hasCachedPrices(wb){
  /* Combined Check (C3) must be a stored non-empty result. 7a / UK A3 must
     not still be a bare formula. A blank A3 is allowed (0 UK). 7b is ignored,
     because a real default China day has 0 rows. */
  if(!wb||!wb.Sheets)return false;
  var comb=wb.Sheets.Combined?[wb.Sheets.Combined,"C3"]:wb.Sheets["6 Combined upload"]?[wb.Sheets["6 Combined upload"],"E3"]:null;
  if(!comb)return false;
  var check=cachedCell(comb[0],comb[1]);
  if(!check.ok||check.empty)return false;
  var uk=ukSheetName(wb);
  if(!uk||!wb.Sheets[uk])return false;
  var a3=cachedCell(wb.Sheets[uk],"A3");
  if(a3.formula&&!a3.ok)return false;
  return true;
}

function formatPrice(price){
  if(price==null||price==="")return "";
  if(typeof price==="string"&&price.charAt(0)==="=")return "";
  var n=Math.round(Number(price)*100)/100;
  if(isFinite(n))return n.toFixed(2);
  return String(price).trim();
}

function escapeSku(sku){
  var s=String(sku==null?"":sku);
  if(/[",\n\r]/.test(s))return '"'+s.replace(/"/g,'""')+'"';
  return s;
}

function uploadRows(aoa,start){
  var rows=[],i,row,sku;
  start=start==null?2:start;
  for(i=start;i<aoa.length;i++){
    row=aoa[i]||[];
    sku=row[0];
    if(sku==null||sku==="")continue;
    if(typeof sku==="string"&&(sku.charAt(0)==="="||/^(offer sku|offer-sku)$/i.test(String(sku).trim())))continue;
    sku=String(sku).trim();
    if(!sku)continue;
    rows.push([sku,formatPrice(row[1])]);
  }
  return rows;
}

function writeCleanCsv(rows){
  var lines=[CODE_HEADER_LINE],i;
  for(i=0;i<rows.length;i++)lines.push(escapeSku(rows[i][0])+","+rows[i][1]+",,,");
  return lines.join("\r\n")+"\r\n";
}

/* Read cached cell values only. SheetJS uses the stored `v`; we never evaluate formulas. */
function extractFromWorkbook(X,wb){
  var targets=sheetsFor(wb);
  if(!hasCachedPrices(wb))throw new Error(NO_CACHE_MSG);
  var out=[],i,name,file,aoa,rows,text;
  for(i=0;i<targets.length;i++){
    name=targets[i][0];file=targets[i][1];
    if(!wb.Sheets[name])throw new Error("Missing sheet: "+name);
    aoa=X.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:""});
    rows=uploadRows(aoa,2);
    text=writeCleanCsv(rows);
    out.push({sheet:name,name:file,text:text,rows:rows.length});
  }
  return {kind:targets===DETAIL_SHEETS||targets[0][0]==="UK upload"?"detail":"work",files:out};
}

function extractFromArrayBuffer(buf){
  return xlsxLib().then(function(X){
    var wb=X.read(new Uint8Array(buf),{type:"array"});
    return extractFromWorkbook(X,wb);
  });
}

function extractFromFile(file){
  return file.arrayBuffer().then(extractFromArrayBuffer);
}

function downloadText(name,text,delay){
  setTimeout(function(){
    var blob=new Blob([text],{type:"text/csv;charset=utf-8"});
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){try{URL.revokeObjectURL(a.href)}catch(e){}if(a.parentNode)a.parentNode.removeChild(a)},1500);
  },delay||0);
}

function styles(){
  if($("hclean-css"))return;
  var s=document.createElement("style");
  s.id="hclean-css";
  s.textContent="#hclean{margin:18px 0 8px}#hclean h2{font-size:20px;margin:0 0 6px}"+
    "#hclean .hclean-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}"+
    "#hclean .hclean-msg{font-size:13px;margin-top:8px}";
  document.head.appendChild(s);
}

function setMsg(html,ok){
  var n=$("hclean-msg");if(!n)return;
  n.innerHTML=html||"";
  n.className="hclean-msg note"+(ok===false?" bad":"");
}

function mount(){
  var host=$("hclean");if(!host)return;
  styles();
  host.innerHTML='<h2>Clean 7a / 7b CSV</h2>'+
    '<p class="note">After you save the work file in Excel, pick it here and download a clean B&amp;Q file. '+
    'The file is read only on this computer — cached prices already in the workbook, with no recalculation. '+
    'The download matches the live Pricing-tab B&amp;Q upload: one header line '+
    '(offer-sku,price,discount-price,discount-start-date,discount-end-date) plus the rows where Offer SKU is filled. '+
    'Nothing is sent to B&amp;Q. This does not use the Data upload slots above.</p>'+
    '<div class="box">'+
    '<div class="hclean-row">'+
    '<label class="btn l" for="hclean-file">Choose work file</label>'+
    '<input type="file" class="hide" id="hclean-file" accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">'+
    '<button type="button" class="btn" id="hclean-dl" disabled>Download clean 7a/7b CSV</button>'+
    '</div>'+
    '<div class="hclean-msg note" id="hclean-name"></div>'+
    '<div class="hclean-msg note" id="hclean-msg"></div>'+
    '</div>';
  var inp=$("hclean-file"),btn=$("hclean-dl"),chosen=null;
  if(!inp||!btn)return;
  inp.addEventListener("change",function(){
    var f=this.files&&this.files[0];
    this.value="";
    chosen=f||null;
    btn.disabled=!chosen;
    var nameEl=$("hclean-name");
    if(nameEl)nameEl.textContent=chosen?("Selected: "+chosen.name):"";
    setMsg("");
  });
  btn.addEventListener("click",function(){
    if(!chosen){setMsg("Please choose the saved work file first.",false);return}
    btn.disabled=true;
    setMsg("Reading "+esc(chosen.name)+"…");
    extractFromFile(chosen).then(function(res){
      var bits=[],i,f;
      for(i=0;i<res.files.length;i++){
        f=res.files[i];
        downloadText(f.name,f.text,i*400);
        bits.push(f.sheet+" (“"+f.name+"”): "+f.rows+" price row"+(f.rows===1?"":"s"));
      }
      setMsg('<span class="ok">✓ Ready.</span> Downloaded '+esc(bits.join("; "))+".",true);
    }).catch(function(e){
      setMsg('<span class="bad">'+esc((e&&e.message)||"Could not read that file")+"</span>",false);
    }).then(function(){btn.disabled=!chosen});
  });
}

var api={
  CODE_HEADER:CODE_HEADER,
  CODE_HEADER_LINE:CODE_HEADER_LINE,
  NO_CACHE_MSG:NO_CACHE_MSG,
  xlsxLib:xlsxLib,
  sheetsFor:sheetsFor,
  hasCachedPrices:hasCachedPrices,
  uploadRows:uploadRows,
  writeCleanCsv:writeCleanCsv,
  extractFromWorkbook:extractFromWorkbook,
  extractFromArrayBuffer:extractFromArrayBuffer,
  extractFromFile:extractFromFile,
  mount:mount
};
window.BQCleanExport=api;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);
else mount();
})();
