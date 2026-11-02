// Playwright check of the Pricing tab. URL from argv (default local staging). Password read from file, never printed.
const {chromium}=require('/workspace/bq/dashboard/html/node_modules/playwright-core');
const fs=require('fs');const PW=fs.readFileSync('/workspace/bq/KEEP/secrets/dashboard_password.txt','utf8').trim();
const URL=process.argv[2]||'http://127.0.0.1:18431/',DL='/workspace/bq/pricing_tab/out/pw_dl/';fs.mkdirSync(DL,{recursive:true});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const [w,dark] of [[390,false],[1280,false],[1280,true]]){
 const ctx=await b.newContext({viewport:{width:w,height:900},acceptDownloads:true,colorScheme:dark?'dark':'light'});const p=await ctx.newPage();const errs=[];
 p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/404/.test(m.text()))errs.push(m.text())});
 const tag=w+(dark?' dark':'');
 await p.goto(URL);await p.fill('#pw',PW);await p.click('#go');await p.waitForSelector('#menu:not(.hide)',{timeout:60000});
 ok(await p.isVisible('[data-v="pricing"]'),tag+' Pricing card visible');
 await p.click('[data-v="pricing"]');await p.waitForSelector('#pzsum .sc',{timeout:60000});
 const st=await p.evaluate(()=>{const s=BQPricing.state();return{rows:s.res.rows.length,up:s.res.rows.filter(o=>o.upload).length,src:document.getElementById('pzsrc').innerText,dups:s.res.dups,
  bad:s.res.rows.filter(o=>o.upload&&(!(o.fprofit>0)||o.fpc<0.5-1e-9)).length}});
 ok(st.rows>4000,tag+' rows '+st.rows);ok(st.bad===0,tag+' no unsafe upload rows');console.log(' source:',st.src.replace(/\n/g,' | '));console.log(' upload rows',st.up,'dups',st.dups);
 const sw=await p.evaluate(()=>document.documentElement.scrollWidth);ok(sw<=w+1,tag+' no page sideways scroll ('+sw+')');
 // download upload
 if(st.up){const [d]=await Promise.all([p.waitForEvent('download'),p.click('#pzdl')]);const f=DL+tag.replace(' ','_')+'_'+d.suggestedFilename();await d.saveAs(f);ok(/^B&Q Price Upload \d{4}-\d\d-\d\d\.xlsx$/.test(d.suggestedFilename()),tag+' upload name '+d.suggestedFilename());}
 // filter / search / sort
 await p.selectOption('#pzf','');await p.waitForTimeout(200);const all=await p.innerText('#pzcnt');ok(/of \d{4}/.test(all),tag+' all rows count: '+all);
 await p.fill('#pzq','zzzz-no-such');await p.waitForTimeout(200);ok(/Nothing here/.test(await p.innerText('#pztab')),tag+' empty search message');
 await p.fill('#pzq','');await p.click('th[data-k="cost"]');await p.click('th[data-k="cost"]');await p.waitForTimeout(200);
 const c1=await p.evaluate(()=>{const v=BQPricing.state().view;return [v[0].cost,v[1].cost]});ok(c1[0]>=c1[1],tag+' sort cost desc '+c1);
 await p.click('[data-f="mtl"]');await p.waitForTimeout(200);const m=await p.evaluate(()=>BQPricing.state().view.every(o=>o.status==='Margin too low'));ok(m,tag+' Margin too low filter');
 // your price: type a loss price and a good price
 await p.selectOption('#pzf','');await p.fill('#pzq','');
 const sku=await p.evaluate(()=>{const o=BQPricing.state().res.rows.find(o=>o.cost>2&&o.post!=null&&!o.dup&&!o.check&&!o.upload);return o.sku});
 await p.fill('#pzq',sku);await p.waitForTimeout(200);
 await p.fill('input[data-s="'+sku+'"]','£0.50');await p.press('input[data-s="'+sku+'"]','Enter');await p.waitForTimeout(300);
 let o=await p.evaluate(s=>BQPricing.state().res.rows.find(o=>o.sku===s),sku);ok(!o.upload&&/blocked/.test(o.why),tag+' loss your-price blocked: '+o.why);
 const good=await p.evaluate(s=>{const o=BQPricing.state().res.rows.find(o=>o.sku===s);return (BQP.priceFor(o.a||{cost:o.cost,mult:o.mult,post:o.post,collab:o.collab},0.6)+0.13).toFixed(2)},sku);
 await p.fill('input[data-s="'+sku+'"]',good);await p.press('input[data-s="'+sku+'"]','Enter');await p.waitForTimeout(300);
 o=await p.evaluate(s=>BQPricing.state().res.rows.find(o=>o.sku===s),sku);ok(o.upload&&o.finalp==+good,tag+' good your-price in upload '+good+' '+o.why);
 await p.reload();await p.fill('#pw',PW);await p.click('#go');await p.waitForSelector('#menu:not(.hide)');await p.click('[data-v="pricing"]');await p.waitForSelector('#pzsum .sc',{timeout:60000});
 o=await p.evaluate(s=>BQPricing.state().res.rows.find(o=>o.sku===s),sku);ok(o.your==+good,tag+' your price kept after refresh');
 await p.fill('#pzq',sku);await p.waitForTimeout(200);await p.fill('input[data-s="'+sku+'"]','');await p.press('input[data-s="'+sku+'"]','Enter');await p.waitForTimeout(300);
 o=await p.evaluate(s=>BQPricing.state().res.rows.find(o=>o.sku===s),sku);ok(o.your==null&&!o.upload,tag+' your price cleared');
 // toggles
 await p.fill('#pzq','');const u0=await p.evaluate(()=>BQPricing.state().res.rows.filter(o=>o.upload).length);
 await p.check('#pzpost');await p.waitForTimeout(300);const u1=await p.evaluate(()=>BQPricing.state().res.rows.filter(o=>o.upload).length);ok(u1>=u0,tag+' check-postage toggle '+u0+'->'+u1);
 await p.uncheck('#pzpost');await p.check('#pzr100');await p.waitForTimeout(300);const u2=await p.evaluate(()=>BQPricing.state().res.rows.filter(o=>o.upload).length);ok(u2>=u0,tag+' 100+ toggle '+u0+'->'+u2);await p.uncheck('#pzr100');
 {const off=await p.evaluate(()=>!document.getElementById('pztrim').checked);await p.check('#pztrim');await p.waitForTimeout(300);const T=await p.evaluate(()=>{const R=BQPricing.state().res.rows,up=R.filter(o=>o.upload);return{u:up.length,trims:R.filter(o=>o.trim&&o.upload).length,over:up.filter(o=>!o.china&&o.your==null&&o.fpc>0.8+1e-9).length}});await p.uncheck('#pztrim');await p.waitForTimeout(300);const u4=await p.evaluate(()=>BQPricing.state().res.rows.filter(o=>o.upload).length);ok(off&&T.trims>0&&T.u===u0+T.trims&&T.over===0&&u4===u0,tag+' penny-trim switch off by default, adds '+T.trims+' rows ('+u0+'->'+T.u+'), none over 80%, back to '+u4);}
 // Back button and phone back
 await p.click('#tback');await p.waitForTimeout(300);ok(await p.isHidden('#tabv'),tag+' Back returns to menu');
 await p.click('[data-v="pricing"]');await p.waitForSelector('#pzsum .sc');await p.goBack();await p.waitForTimeout(500);ok(await p.isHidden('#tabv'),tag+' phone back returns to menu');
 // new Access file (wrong file, then right file)
 await p.click('[data-v="pricing"]');await p.waitForSelector('#pzsum .sc');
 await p.setInputFiles('#pzfile','/workspace/bq/KEEP/pricing/BQ_price_template_MASTER.xlsx');await p.waitForTimeout(2000);ok(/not the Access/.test(await p.innerText('#pzfmsg')),tag+' wrong file rejected');
 await p.setInputFiles('#pzfile','/workspace/bq/KEEP/pricing/Access_2026-10-29.xlsx');await p.waitForSelector('#pzfmsg .ok',{timeout:90000});ok(true,tag+' Access file read: '+await p.innerText('#pzfmsg'));
 await p.screenshot({path:DL+'shot_'+tag.replace(' ','_')+'.png',fullPage:false});
 ok(errs.length===0,tag+' no page errors '+JSON.stringify(errs));await ctx.close();}
await b.close();console.log('RESULT pass',pass,'fail',fail);process.exit(fail?1:0)})().catch(e=>{console.log('CRASH',e.message);process.exit(2)});
