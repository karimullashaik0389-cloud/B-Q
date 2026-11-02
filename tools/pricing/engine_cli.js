// node engine_cli.js in.json out.json  – runs the shared engine (bq_price.js) for the Python tools.
// in: {"op":"calc","items":[{cost,mult,post,collab,price}]}  or  {"op":"decideAll","rows":[...],"opt":{...}}  or {"op":"postage","items":[{pc,w}]}
const fs=require('fs'),B=require(__dirname+'/bq_price.js');
const I=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));let O;
if(I.op==='calc')O=I.items.map(x=>B.calc({cost:x.cost,mult:x.mult!=null?x.mult:B.multOf(x.sup),post:x.post,collab:x.collab},x.price,x.q));
else if(I.op==='postage')O=I.items.map(x=>B.postage(x.pc,x.w));
else if(I.op==='fromAccess'){const ov=I.ov||{};if(ov.raw){const S=B.sales30(ov.raw);ov.sales30=S.map;ov.salesLabel=ov.salesLabel||('B&Q orders to '+S.last);delete ov.raw;}if(ov.bbRows){const M=B.bbMap(ov.bbRows,ov.accessDate);ov.bb=M.map;ov.bbLabel=M.label;delete ov.bbRows;}const P=B.fromAccess(I.aoa,ov);P.bbLabel=ov.bbLabel||'';P.salesLabel=ov.salesLabel||'';P.sales30=ov.sales30||null;const R=B.decideAll(P.rows,I.opt||{});R.rows.forEach(r=>{delete r.a;});O={prep:P,res:R};}
else if(I.op==='sales30')O=B.sales30(I.raw);
else if(I.op==='decideAll'){const R=B.decideAll(I.rows,I.opt||{});R.rows.forEach(r=>{delete r.a;});O=R;}
else throw new Error('op');
fs.writeFileSync(process.argv[3],JSON.stringify({version:B.VERSION,out:O}));
