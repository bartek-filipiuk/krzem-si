import test from 'node:test';
import assert from 'node:assert/strict';
import {identity,multiply,model,lookAt,perspective,clamp,smoothstep,chapterAt,seeded} from '../src/scripts/math.js';
import {initialQuality,pixelRatio,FrameBudget} from '../src/scripts/quality.js';
import {crystal,cylinder,circuit,transistor,bevelBox} from '../src/scripts/geometry.js';
import {createStaticServer} from '../scripts/serve.mjs';
import {resolve} from 'node:path';

test('matrix identity, composition and translation are column-major',()=>{
 const m=model(2,3,4,.1,.2,.3,2);assert.deepEqual(multiply(identity(),m),m);
 assert.deepEqual([...multiply(model(1,2,3),model(2,3,4))].slice(12,15),[3,5,7]);
 assert.equal(lookAt([0,0,8])[14],-8);assert.ok(perspective(Math.PI/3,1.7).every(Number.isFinite));
});
test('clamping and deterministic easing',()=>{assert.equal(clamp(-1),0);assert.equal(clamp(2),1);assert.equal(smoothstep(0,1,.5),.5);});
test('chapter progress handles boundaries and short static chapters',()=>{
 const b=[{top:0,height:1600},{top:1600,height:1600}];
 assert.deepEqual(chapterAt(400,b,800),{index:0,progress:.5});assert.deepEqual(chapterAt(1600,b,800),{index:1,progress:0});
 assert.equal(chapterAt(0,[{top:0,height:800}],800).progress,0);
});
test('seeded geometry is reproducible',()=>{const a=seeded(14),b=seeded(14);assert.deepEqual(Array.from({length:20},a),Array.from({length:20},b));assert.deepEqual(crystal(),crystal());});
test('all geometry contains finite interleaved triangles and normalized normals',()=>{
 const objects=[crystal(),cylinder(),...Object.values(circuit(12)),...Object.values(transistor())];
 for(const data of objects){assert.equal(data.length%27,0);assert.ok(data.every(Number.isFinite));for(let i=0;i<data.length;i+=9)assert.ok(Math.abs(Math.hypot(data[i+3],data[i+4],data[i+5])-1)<.00001);}
});
test('reduced motion, low resources and Save-Data choose static before GPU import',()=>{
 assert.equal(initialQuality({reduced:true}),'static');assert.equal(initialQuality({saveData:true}),'static');assert.equal(initialQuality({cores:2}),'static');assert.equal(initialQuality({memory:4}),'low');assert.equal(initialQuality(),'high');
});
test('pixel cap respects both retina ceiling and total render budget',()=>{
 assert.equal(pixelRatio('high',3,1000,1000),Math.sqrt(2.2));
 assert.ok(pixelRatio('high',2,3840,2160)**2*3840*2160<=2200000.1);
 assert.ok(pixelRatio('low',3,400,800)<=.85);
});
test('quality drops only after two sustained slow windows',()=>{
 const budget=new FrameBudget();let tier='high';for(let i=0;i<179;i++)tier=budget.sample(35,tier);assert.equal(tier,'high');tier=budget.sample(35,tier);assert.equal(tier,'low');
 for(let i=0;i<180;i++)tier=budget.sample(55,tier);assert.equal(tier,'static');budget.reset();assert.equal(budget.sample(800,'high'),'high');
});
test('static server serves modules, rejects writes and does not expose parent files',async t=>{
 const server=createStaticServer(resolve(import.meta.dirname,'../src'));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/')).status,200);assert.match((await fetch(base+'/scripts/app.js')).headers.get('content-type'),/javascript/);
 assert.equal((await fetch(base+'/package.json')).status,404);assert.equal((await fetch(base+'/..%2fscripts%2fserve.mjs')).status,403);assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
});

test('beveled geometry has finite outward faces and unit normals',()=>{
 const out=[];bevelBox(out,0,0,0,2,1,1);
 assert.equal(out.length%27,0);
 for(let i=0;i<out.length;i+=9){assert.ok(Math.abs(Math.hypot(...out.slice(i+3,i+6))-1)<1e-5);assert.ok(out.slice(i,i+3).reduce((sum,v,j)=>sum+v*out[i+3+j],0)>0);}
});
test('sustained very slow frames downgrade without waiting 180 frames',()=>{
 const b=new FrameBudget();let q='high';for(let i=0;i<12;i++)q=b.sample(210,q);assert.equal(q,'low');for(let i=0;i<12;i++)q=b.sample(180,q);assert.equal(q,'static');
});
