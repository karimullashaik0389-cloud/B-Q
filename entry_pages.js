(function(){
"use strict";
/* Separate Sales / Orders entry pages: after unlock, open that dashboard only. */
var OPEN=(document.body.getAttribute("data-open")||"").trim();
if(OPEN!=="sales"&&OPEN!=="orders"&&OPEN!=="selling") OPEN="";
if(OPEN){document.title=OPEN==="sales"?"B&Q Sales":OPEN==="orders"?"B&Q Orders":"B&Q Products selling";}
function tryOpen(){
  if(!OPEN)return false;
  if(window.BQ&&typeof BQ.openDash==="function"){BQ.openDash(OPEN);return true;}
  var b=document.querySelector('#menu [data-d="'+OPEN+'"]');
  if(b){b.click();return true;}
  return false;
}
var menu=document.getElementById("menu");
if(OPEN&&menu){
  var mo=new MutationObserver(function(){
    if(!menu.classList.contains("hide"))tryOpen();
  });
  mo.observe(menu,{attributes:true,attributeFilter:["class"]});
  if(!menu.classList.contains("hide"))tryOpen();
}
})();
