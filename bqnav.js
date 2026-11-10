/* Same tab bar on every dashboard section and on the Listings pages.
   Eight sections, plus Home (returns to the menu without a new login while this tab is already unlocked).
   No keys and no catalogue data in this file. */
(function(){
"use strict";
var T=[["home","Home"],["sales","Sales"],["orders","Orders"],["selling","Products selling"],["listings","Listings"],["dups","Duplicates"],["access","Access"],["pricing","Pricing"],["lookup","Individual sales"],["calc","Calculator"]];
if(document.getElementById("bqnav"))return;
var CSS='#bqnav{position:fixed;top:0;left:0;right:0;width:100%;max-width:100%;box-sizing:border-box;z-index:80;background:#0F172A;border-bottom:1px solid #1E293B;padding:env(safe-area-inset-top) 0 0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden}'+
 '#bqnav .bqn-s{display:flex;flex-wrap:wrap;align-items:center;gap:6px;width:100%;max-width:1400px;box-sizing:border-box;margin:0 auto;padding:7px 10px}'+
 '#bqnav a{flex:0 1 auto;display:inline-flex;align-items:center;min-height:36px;padding:7px 13px;border-radius:999px;background:#1E293B;color:#E2E8F0!important;font-size:14px;font-weight:600;text-decoration:none!important;white-space:nowrap;line-height:1.1;box-sizing:border-box}'+
 '#bqnav a:hover{background:#334155}#bqnav a.on{background:#FF6600;color:#fff!important}#bqnav a:focus-visible{outline:3px solid #FDBA74;outline-offset:1px}'+
 '@media (max-width:620px){#bqnav a{font-size:12px;padding:6px 8px;min-height:32px}}';
var MAIN=!!document.getElementById("menu"),cur="",nav;
function add(){
 var st=document.createElement("style");st.id="bqnav-css";st.textContent=CSS+(MAIN?
  'body.bqn #viewer,body.bqn #tabv{top:var(--bqnh,50px)}body.bqn #menu{padding-top:calc(var(--bqnh,50px) + 8px)}body.bqn .tbar{padding-top:8px}':
  'body{padding-top:var(--bqnh,50px)!important}');
 document.head.appendChild(st);
 nav=document.createElement("nav");nav.id="bqnav";nav.setAttribute("aria-label","All dashboards");
 nav.innerHTML='<div class="bqn-s">'+T.map(function(t){return '<a href="'+href(t[0])+'" data-bqn="'+t[0]+'"'+(MAIN?'':' data-dash')+'>'+t[1]+'</a>'}).join("")+'</div>';
 document.body.insertBefore(nav,document.body.firstChild);size();window.addEventListener("resize",size)}
function size(){if(!nav)return;var h=nav.getBoundingClientRect().height;document.documentElement.style.setProperty("--bqnh",Math.round(h)+"px")}
function base(){if(MAIN)return "";
 if(typeof dashUrl==="function")try{return dashUrl()}catch(e){}
 var p=location.pathname,i=p.indexOf("/listings/");
 if(i>=0)return p.slice(0,i+1);
 return p.replace(/\/listings(\/index\.html)?\/?$/,"/")||"/"}
function href(v){if(MAIN){if(v==="listings")return"listings/";if(v==="sales")return"sales.html";if(v==="orders")return"orders.html";if(v==="selling")return"productselling.html";if(v==="home")return"index.html";return"#go="+v;}return v==="listings"?"./":base()+(v==="home"?"":v==="sales"?"sales.html":v==="orders"?"orders.html":v==="selling"?"productselling.html":"#go="+v)}
function mark(v){if(v===cur)return;cur=v;Array.prototype.forEach.call(nav.querySelectorAll("a"),function(a){var on=a.getAttribute("data-bqn")===v;a.classList.toggle("on",on);if(on)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")})}
function toListings(){var p=window.BQ&&BQ.stashSession?BQ.stashSession():Promise.resolve();p.then(function(){location.href="listings/"})}
var ALLOW={home:1,sales:1,orders:1,selling:1,listings:1,dups:1,access:1,pricing:1,lookup:1,calc:1};
function readGo(){var h=/[#&]go=([a-z]+)/.exec(location.hash||""),s=null;try{s=sessionStorage.getItem("bqDashGo")}catch(e){}
 var hv=h&&ALLOW[h[1]]?h[1]:"",sv=s&&ALLOW[s]?s:"";return hv||sv||""}
function clearGo(){try{sessionStorage.removeItem("bqDashGo")}catch(e){}
 if(/[#&]go=/.test(location.hash||"")){try{history.replaceState(history.state,"",location.pathname+location.search)}catch(e){}}}
if(!MAIN){add();mark("listings");
 nav.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[data-bqn]");if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.button)return;var v=a.getAttribute("data-bqn");if(v==="listings")return;try{sessionStorage.setItem("bqDashReturn","1");if(v&&v!=="home"&&ALLOW[v])sessionStorage.setItem("bqDashGo",v);else sessionStorage.removeItem("bqDashGo")}catch(err){}});
 window.BQNav={tabs:T,current:function(){return cur},go:function(){},readGo:readGo,clearGo:clearGo};return}
var $=function(i){return document.getElementById(i)},TITLE={};
function hidden(id){var e=$(id);return !e||e.classList.contains("hide")}
function state(){if(window.BQ&&BQ.forced)return BQ.forced;
 if(!hidden("tabv")){var tt=($("ttitle")||{}).textContent||"";for(var k in TITLE)if(TITLE[k]===tt)return k;return ""}
 if(!hidden("viewer")){var ttl=document.title;if(/Products selling/.test(ttl))return "selling";return /Orders/.test(ttl)?"orders":"sales";}return "home"}
var sent=false;
function sync(){var unl=!hidden("menu")||!hidden("viewer")||!hidden("tabv");document.body.classList.toggle("bqn",unl);nav.style.display=unl?"":"none";if(unl){size();mark(state())}
 if(unl&&!hidden("menu")&&!sent){var v=readGo();if(v){sent=true;clearGo();if(v!=="home")setTimeout(function(){go(v)},0)}}}
function card(v){return document.querySelector('#menu [data-d="'+v+'"],#menu [data-v="'+v+'"]')}
function go(v){if(v==="listings"){toListings();return}
 if(v==="sales"||v==="orders"||v==="selling"){var p=window.BQ&&BQ.stashSession?BQ.stashSession():Promise.resolve();p.then(function(){location.href=v==="selling"?"productselling.html":v+".html"});return}
 if(v==="home"){var p2=window.BQ&&BQ.stashSession?BQ.stashSession():Promise.resolve();p2.then(function(){location.href="index.html"});return}
 if(window.BQTabs&&BQTabs.close&&!hidden("tabv"))BQTabs.close();
 if(!hidden("viewer")&&window.BQ&&BQ.back)BQ.back();
 var c=card(v);if(c)c.click();sync()}
add();
setTimeout(function(){if(window.BQTabs)Object.keys(BQTabs.tabs).forEach(function(k){TITLE[k]=BQTabs.tabs[k].title})},0);
nav.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[data-bqn]");if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.button)return;var v=a.getAttribute("data-bqn");if(v==="listings"){e.preventDefault();toListings();return}e.preventDefault();go(v)});
var listingCard=$("listings");
if(listingCard)listingCard.addEventListener("click",function(e){if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button)return;e.preventDefault();toListings()});
var mo=new MutationObserver(sync);["menu","viewer","tabv","login","ttitle"].forEach(function(id){var e=$(id);if(e)mo.observe(e,{attributes:true,attributeFilter:["class"],childList:id==="ttitle",characterData:id==="ttitle",subtree:id==="ttitle"})});
var ot=document.querySelector("title");if(ot)mo.observe(ot,{childList:true,characterData:true,subtree:true});
sync();
window.BQNav={tabs:T,current:function(){return cur},go:go};
})();
