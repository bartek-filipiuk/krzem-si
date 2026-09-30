/** Small column-major matrix helpers. No browser APIs: tested with node:test. */
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    out[c * 4 + r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return out;
}
export function perspective(fov, aspect, near = .1, far = 100) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
export function normalize(v) { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }
export function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
export function lookAt(eye, target = [0,0,0]) {
  const z = normalize(eye.map((v,i) => v-target[i]));
  const x = normalize(cross([0,1,0],z)), y = cross(z,x);
  const dot = (a,b) => a.reduce((sum,v,i) => sum+v*b[i],0);
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
export function model(x=0,y=0,z=0,rx=0,ry=0,rz=0,s=1) {
  const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
  const mx=new Float32Array([1,0,0,0, 0,cx,sx,0, 0,-sx,cx,0, 0,0,0,1]);
  const my=new Float32Array([cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1]);
  const mz=new Float32Array([cz,sz,0,0, -sz,cz,0,0, 0,0,1,0, 0,0,0,1]);
  const out=multiply(multiply(mz,my),mx);
  for(let i=0;i<12;i++) out[i]*=s;
  out[12]=x; out[13]=y; out[14]=z; return out;
}
export function seeded(seed = 14028) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}
/** Select the active chapter using cached document offsets, never DOM reads in the GPU loop. */
export function chapterAt(y, bounds, height) {
  let index=0;
  for(let i=0;i<bounds.length;i++) if(y>=bounds[i].top) index=i;
  const b=bounds[index];
  return {index, progress:clamp((y-b.top)/Math.max(1,b.height-height))};
}
