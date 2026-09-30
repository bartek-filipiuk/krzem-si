/** Record our WebGL calls for reproducible offline EGL poster renders. No runtime dependency. */
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLegacyScenes} from '../../src/scripts/scenes/legacy.js';
const out=resolve(process.argv[2]||'/tmp/krzem-scenes');await mkdir(out,{recursive:true});
globalThis.window={devicePixelRatio:1};
// Chapter 0 is the Three.js hero now; its poster comes from the Blender pipeline (tools/blender).
for(let index=1;index<7;index++){
 let next=1,current=null;const buffers={},shaders={},uniforms={},calls=[];
 const gl={VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,ARRAY_BUFFER:34962,STATIC_DRAW:35044,DEPTH_TEST:2929,BLEND:3042,SRC_ALPHA:770,ONE_MINUS_SRC_ALPHA:771,COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,FLOAT:5126,TRIANGLES:4,
 createShader:()=>next++,shaderSource:(id,code)=>shaders[id]=code,compileShader:()=>{},getShaderParameter:()=>true,deleteShader:()=>{},
 createProgram:()=>next++,attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,useProgram:()=>{},detachShader:()=>{},deleteProgram:()=>{},
 getAttribLocation:(_,name)=>['aPosition','aNormal','aColor'].indexOf(name),getUniformLocation:(_,name)=>name,
 enable:()=>{},disable:()=>{},depthFunc:()=>{},drawingBufferWidth:1440,drawingBufferHeight:1000,blendFunc:()=>{},createBuffer:()=>next++,bindBuffer:(_,b)=>current=b,bufferData:(_,data)=>buffers[current]=Array.from(data),
 enableVertexAttribArray:()=>{},vertexAttribPointer:()=>{},uniformMatrix4fv:(name,_,v)=>uniforms[name]=Array.from(v),uniform3fv:(name,v)=>uniforms[name]=Array.from(v),uniform1f:(name,v)=>uniforms[name]=v,
 depthMask:()=>{},drawArrays:(_,start,count)=>calls.push({buffer:current,start,count,uniforms:structuredClone(uniforms)}),viewport:()=>{},clearColor:()=>{},clear:()=>{},deleteBuffer:()=>{}};
 const renderer=createLegacyScenes(gl);renderer.resize(1440,1000,'high');renderer.render({index,progress:[0,.82,.6,.9,.2,.7,.85][index],time:2,pointer:[0,0],power:true});
 await writeFile(resolve(out,`scene-${index}.json`),JSON.stringify({width:1440,height:1000,shaders:Object.values(shaders),buffers,calls}));
 renderer.dispose();
}
console.log(`Recorded legacy scenes 1-6 into ${out}`);
