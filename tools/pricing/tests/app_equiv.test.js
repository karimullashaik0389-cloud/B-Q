// Old Sales/Orders maths (app.js before the patch) vs the patched app.js (delegating to bq_price.js): fuzz equality.
const fs=require('fs'),vm=require('vm');
const OLD=process.argv[2],NEW=process.argv[3],BQP=require(process.env.BQP_PATH||'/workspace/bq/pricing_tab/bq_price.js');
function block(file){const s=fs.readFileSync(file,'utf8');const i=s.indexOf('var PRICE=')>=0?s.lastIndexOf('/*',s.indexOf('var PRICE=')):0;
 const j=s.indexOf('\n',s.indexOf('function postage(pc,w){'));const f=s.match(/function isChina\(k\)\{.*?\}\n/)[0]+s.match(/function floorOf\(k\)\{[\s\S]*?\n(?=L\.forEach)/)[0];
 const ctx={window:{BQP},U30:{}};vm.createContext(ctx);vm.runInContext(s.slice(i,j)+'\n'+f,ctx);return ctx}
const A=block(OLD),B=block(NEW);let n=0,bad=0,max=0;
function bs(b){return b?b.p+'|'+b.lab:'null'}
function R(){return Math.random()}
for(let t=0;t<200000;t++){const sup=R()<.3?'Ashian Homeware':'Other Ltd',w=R()<.1?null:Math.round(R()*40000),pc=R()<.5?Math.round(R()*600)/100:null;
 const a={cost:Math.round(R()*5000)/100+0.01,mult:A.multOf(sup),post:A.postage(pc,w),sup};if(a.post==null)continue;
 if(R()<.3)a.collab=Math.round(R()*200)/100;const amt=Math.round(R()*10000)/100,q=1+Math.floor(R()*4);
 const k={i:0,a},sales=R()<.5?0:5;A.U30[0]=sales;B.U30[0]=sales;
 const x=A.profitAt(a,amt,q),y=B.profitAt(a,amt,q);const d=Math.max(Math.abs(x.pr-y.pr),Math.abs(x.fee-y.fee),Math.abs(x.over-y.over),Math.abs((x.pc||0)-(y.pc||0)),Math.abs(x.total-y.total));
 max=Math.max(max,d);const f=[0,.5,.6,.7,.8,1][t%6];
 if(d>1e-6||A.priceFor(a,f)!==B.priceFor(a,f)||A.postage(pc,w)!==B.postage(pc,w)||bs(A.band(w))!==bs(B.band(w))||JSON.stringify(A.floorOf(k))!==JSON.stringify(B.floorOf(k))||A.multOf(sup)!==B.multOf(sup)){if(bad<5)console.log('DIFF',JSON.stringify({a,amt,q,f,x,y,pf:[A.priceFor(a,f),B.priceFor(a,f)],fl:[A.floorOf(k),B.floorOf(k)]}));bad++}n++}
console.log('app old vs new: cases',n,'differences',bad,'max abs diff',max);process.exit(bad?1:0);
