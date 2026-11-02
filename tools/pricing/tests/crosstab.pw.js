// Task 3: Sales + Orders (app.js) vs Pricing tab (BQP) on every overlapping SKU, inside the real built pages.
const {chromium}=require('/workspace/bq/dashboard/html/node_modules/playwright-core');
const fs=require('fs');const PW=fs.readFileSync('/workspace/bq/KEEP/secrets/dashboard_password.txt','utf8').trim();const URL=process.argv[2]||'http://127.0.0.1:18431/';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(URL);await p.fill('#pw',PW);await p.click('#go');await p.waitForSelector('#menu:not(.hide)',{timeout:60000});
await p.click('[data-v="pricing"]');await p.waitForSelector('#pzsum .sc',{timeout:60000});
const PR=await p.evaluate(()=>BQPricing.state().res.rows.filter(o=>!o.dup&&o.cost>0&&o.post!=null).map(o=>({sku:o.sku,price:o.price,finalp:o.finalp,cost:o.cost,post:o.post,mult:o.mult,collab:o.collab,pr:o.pr,pc:o.pc,profit:o.profit,fpr:o.fpr,fpc:o.fpc,sales:o.sales,floorPct:o.floorPct,floor:o.floor})));
await p.click('#tback');const out={};
for(const app of ['sales','orders']){await p.click('[data-d="'+app+'"]');await p.waitForTimeout(3500);const f=p.frame({url:/^blob:/});
 const r=await f.evaluate(PR=>{const {K,calcAt,U30}=window.__v5;const by={};K.forEach(k=>{if(k.ok)by[k.sku]=k});let n=0,miss=0,inp=0,mm={price:0,profit:0,pc:0,newprofit:0,newpc:0,floorPrice:0},fl=0,flU=0,ex=[],max=0;
  PR.forEach(o=>{const k=by[o.sku];if(!k){miss++;return}n++;const a=k.a;
   if(Math.abs(a.cost-o.cost)>1e-9||Math.abs(a.post-o.post)>1e-9||a.mult!==o.mult||Math.abs((a.collab||0)-(o.collab||0))>1e-9){inp++;if(ex.length<5)ex.push(['input',o.sku,a.cost,o.cost,a.post,o.post,a.mult,o.mult])}
   const N=calcAt(k,o.price),M=calcAt(k,o.finalp);max=Math.max(max,Math.abs(N.pr-o.pr),Math.abs(M.pr-o.fpr));
   const sm=Math.round((N.pr||0)*100+(N.pr<0?-1e-7:1e-7))/100;/* = Sales m2() display rounding */if(Math.abs(sm-o.profit)>1e-9){mm.profit++;if(ex.length<5)ex.push(['profit',o.sku,o.price,N.pr,sm,o.profit])}if(Math.abs(N.pc-o.pc)>1e-9)mm.pc++;
   if(Math.abs(M.pr-o.fpr)>1e-6)mm.newprofit++;if(Math.abs(M.pc-o.fpc)>1e-9)mm.newpc++;
   if(typeof o.floor==='number'&&Math.abs(N.mp-o.floor)>1e-9){mm.floorPrice++;if(ex.length<5)ex.push(['floorPrice',o.sku,N.mp,o.floor])}
   if(N.Fl.f!==o.floorPct){fl++;if((U30[k.i]||0)>0!==(o.sales>0))flU++}});
  return{overlap:n,notInSales:miss,inputDiff:inp,mismatch:mm,maxAbsProfitDiff:max,floorPctDiff:fl,floorDiffBecauseSalesSource:flU,ex}},PR);
 out[app]=r;console.log(app,JSON.stringify(r));await p.goto(URL);await p.fill('#pw',PW);await p.click('#go');await p.waitForSelector('#menu:not(.hide)',{timeout:60000})}
console.log(JSON.stringify({pricingRows:PR.length,...out,errors:errs},null,1));await b.close()})();
