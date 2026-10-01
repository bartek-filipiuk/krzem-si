/**
 * v0.1 procedural scenes for chapters 3-6, kept until stages B/C replace them. Chapters 1 and 2
 * are the lattice and the FinFET; index 1-2 here draw nothing, only the cross-fade into chapter 3. They draw into the
 * same WebGL 2 context as Three.js (GLSL ES 1.00 shaders are valid there); the caller resets
 * Three's state cache around render(). Chapter 0 is the Three.js hero now.
 */
import { model, lookAt, multiply, perspective, lerp, smoothstep } from './legacy-math.js';
import * as geometry from './legacy-geometry.js';

const vertex=`
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uModel;
uniform mat4 uViewProjection;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vColor;
void main(){
 vec4 world=uModel*vec4(aPosition,1.0);
 vWorld=world.xyz; vNormal=normalize(mat3(uModel)*aNormal);
 vLocal=aPosition; vColor=aColor;
 gl_Position=uViewProjection*world;
}`;
const fragment=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vColor;
uniform vec3 uEye;
uniform float uTime;
uniform float uKind;
uniform float uOpacity;
uniform float uPower;
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
 vec3 n=normalize(vNormal),v=normalize(uEye-vWorld);
 if(!gl_FrontFacing) n=-n;
 float grain=noise(vLocal*52.0);
 // Subtle fracture relief, not a moving noise overlay.
 if(uKind>4.5) n=normalize(n+vec3(noise(vLocal*21.0)-.5,grain-.5,noise(vLocal*35.0)-.5)*.17);
 vec3 l=normalize(vec3(-3.0+sin(uTime*.17),5.0,4.0));
 vec3 warm=normalize(vec3(4.0,-1.5,2.0));
 float ndl=max(dot(n,l),0.0);
 float spec=pow(max(dot(n,normalize(l+v)),0.0),48.0);
 float gold=pow(max(dot(n,normalize(warm+v)),0.0),32.0);
 float fres=pow(1.0-max(dot(n,v),0.0),3.0);
 vec3 base=vColor;
 // Analytical studio reflections: no remote HDR textures, no postprocessing.
 vec3 reflection=reflect(-v,n);
 float strip=pow(max(0.0,1.0-abs(reflection.x*.55+reflection.y-.43)*2.0),12.0);
 float strip2=pow(max(0.0,1.0-abs(reflection.x-reflection.y*.4+.68)*3.8),5.0);
 float overhead=pow(max(0.0,reflection.y),12.0);
 vec3 env=vec3(.025,.036,.053)+vec3(.78,.85,1.0)*(strip*1.8+strip2*.6+overhead*1.4);
 vec3 color=base*(.08+ndl*.16)+env*(.48+fres*.38)+vec3(.7,.82,1.0)*spec*.8;
 color+=vec3(.85,.56,.25)*(gold*.44+pow(max(0.0,reflection.x*.35-reflection.y-.45),8.0)*.22);
 if(uKind>4.5){
   float micro=mix(.72,1.08,grain);
   float striation=smoothstep(.91,.985,abs(sin((vLocal.x*.43+vLocal.y)*210.0)));
   color=color*micro+striation*.018;
 }
 if(uKind>.5 && uKind<1.5){
  float facing=abs(dot(n,v));
  vec3 iridescence=.42+.28*cos(vec3(0.1,1.9,3.5)+facing*5.0+vLocal.x*.35);
  vec2 cell=abs(fract(vLocal.xy*8.0)-.5);
  float grid=step(.472,max(cell.x,cell.y));
  color=mix(color,iridescence*.62+vec3(spec*.8+fres*.23),.58);
  if(abs(vLocal.z)>.019) color*=1.0-grid*.72;
 }
 if(uKind>1.5 && uKind<2.5){ color=base*(.23+ndl*.48)+env*.16+vec3(spec*.65)+vec3(.24,.13,.05)*fres; }
 if(uKind>2.5 && uKind<3.5){
  float wave=.65+.35*sin(vLocal.x*8.0+vLocal.z*7.0-uTime*2.0);
  color=mix(base*.22,base*(1.0+wave*.55),uPower);
 }
 if(uKind>3.5 && uKind<4.5){color=mix(color,vec3(.7,.66,.56)*(.55+ndl*.5),.6);}
 color=pow(color/(vec3(1.0)+color*.5),vec3(.9));
 gl_FragColor=vec4(color,uOpacity);
}`;

/** One program, lazily uploaded merged meshes, drawing into a context owned by the caller. */
export function createLegacyScenes(gl) {
  const shaders=[];
  function compile(type,source){
    const s=gl.createShader(type); if(!s) throw new Error('Could not create shader');
    gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message || 'Shader compilation failed');}
    shaders.push(s);return s;
  }
  const program=gl.createProgram(); if(!program) throw new Error('Could not create program');
  try {gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||'Program link failed');
  } catch(error) {shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);throw error;}
  shaders.forEach(s=>{gl.detachShader(program,s);gl.deleteShader(s);});
  const attributes=['aPosition','aNormal','aColor'].map(n=>gl.getAttribLocation(program,n));
  const uniforms=Object.fromEntries(['uModel','uViewProjection','uEye','uTime','uKind','uOpacity','uPower'].map(n=>[n,gl.getUniformLocation(program,n)]));
  const meshes=new Map(); let width=1,height=1,disposed=false,quality='high',sceneAlpha=1,viewProjection=null;
  const eye=[0,0,7.8];
  function upload(name,data){
    const buffer=gl.createBuffer();if(!buffer)throw new Error('Could not allocate geometry');
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    const mesh={buffer,count:data.length/9};meshes.set(name,mesh);return mesh;
  }
  function mesh(name){
    if(meshes.has(name))return meshes.get(name);
    if(name==='rock')return upload(name,geometry.crystal());
    const makers={circuit:()=>geometry.circuit(quality==='high'?30:20),computer:()=>geometry.computer(false),phone:()=>geometry.computer(true),compute:geometry.compute};
    const group=name.split(':')[0];
    for(const [part,data] of Object.entries(makers[group]()))upload(`${group}:${part}`,data);
    return meshes.get(name);
  }
  function draw(name,transform,kind=0,opacity=1,power=1){
    opacity*=sceneAlpha;if(opacity<.008)return;
    const item=mesh(name);if(!item)return;
    gl.bindBuffer(gl.ARRAY_BUFFER,item.buffer);
    attributes.forEach((a,i)=>{if(a<0)return;gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,36,i*12);});
    gl.uniformMatrix4fv(uniforms.uModel,false,transform);
    gl.uniform1f(uniforms.uKind,kind);gl.uniform1f(uniforms.uOpacity,opacity);gl.uniform1f(uniforms.uPower,power);
    gl.depthMask(opacity>.98);gl.drawArrays(gl.TRIANGLES,0,item.count);gl.depthMask(true);
  }
  /** CSS size of the canvas; the drawing buffer size belongs to Three.js. lod: 'high' | 'low'. */
  function resize(cssWidth,cssHeight,lod=quality){
    if(disposed)return;
    quality=lod;width=Math.max(1,cssWidth);height=Math.max(1,cssHeight);
    viewProjection=multiply(perspective(42*Math.PI/180,width/height),lookAt(eye));
  }
  function render({index,progress:p,transition=0,time:t,pointer=[0,0],power=false,keep=false}){
    if(disposed)return;
    // Three.js leaves its own state behind: set everything this program relies on.
    gl.bindVertexArray?.(null);gl.useProgram(program);
    gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(uniforms.uViewProjection,false,viewProjection);gl.uniform3fv(uniforms.uEye,eye);
    // keep: draw over what is already in the frame (chapter 01's lattice during its exit).
    gl.clearColor(0,0,0,0);gl.clear(keep?gl.DEPTH_BUFFER_BIT:gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uniforms.uTime,t);
    const mobile=width<760, x=mobile?0:1.67, y=mobile?-1.05:-.05;
    const s=mobile?.61:1.30;
    const px=mobile?0:pointer[0]*.07,py=mobile?0:pointer[1]*.06;
    function compose(index,p){
    if(index===3){
      const scale=s*lerp(1.55,.8,smoothstep(0,1,p));
      const mat=model(x,y-.15,0,.74+py,-.30+p*.24+px,-.16,scale);
      draw('circuit:out',mat,2);draw('circuit:routes',mat,3,1,.6);
    }else if(index===4){
      const a=1-smoothstep(.4,.6,p),b=smoothstep(.4,.6,p);
      const mat=model(x,y+.05,0,py,-.20+px+t*.012,0,s);
      for(const [device,opacity] of [['computer',a],['phone',b]]){
        draw(device+':out',mat,0,opacity);draw(device+':screen',mat,2,opacity);draw(device+':marks',mat,3,opacity,.8);
      }
    }else if(index===5){
      const mat=model(x,y-.25,0,.57+py,-.24+px,-.11,s*.98);
      draw('compute:out',mat);draw('compute:traces',mat,3,1,.55+.45*smoothstep(.2,.7,p));
      const rise=lerp(.2,.7,smoothstep(.1,.8,p));
      draw('compute:matrix',model(x,y+rise,0,.57+py,-.24+px,-.11,s*.98),3,.7,1);
    }else{
      const fade=smoothstep(.12,.44,p),mat=model(x,y+.08,0,0,-.13,0,s*.86);
      draw('computer:out',mat,0,1-fade);draw('computer:screen',mat,2,1-fade);draw('computer:marks',mat,3,1-fade);
      draw('rock',model(x,y,0,.12,t*.025,-.14,s*.88),5,fade);
    }
    }
    const blend=smoothstep(0,1,transition);sceneAlpha=1-blend;compose(index,p);
    if(blend>0&&index<6){gl.clear(gl.DEPTH_BUFFER_BIT);sceneAlpha=blend;compose(index+1,0);}
    sceneAlpha=1;
  }
  function dispose(){if(disposed)return;disposed=true;meshes.forEach(m=>gl.deleteBuffer(m.buffer));meshes.clear();gl.deleteProgram(program);}
  return {render,resize,dispose,get diagnostics(){return {meshes:meshes.size,quality};}};
}
