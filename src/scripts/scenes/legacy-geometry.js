import { cross, normalize, seeded } from './legacy-math.js';
/** Interleaved position / flat normal / vertex colour; merged meshes keep draw calls low. */
export function triangle(out,a,b,c,color=[.46,.51,.59]) {
  const n=normalize(cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i])));
  for(const p of [a,b,c]) out.push(...p,...n,...color);
}
export function box(out,x,y,z,w,h,d,color=[.28,.32,.37]) {
  const p=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(v=>[x+v[0]*w/2,y+v[1]*h/2,z+v[2]*d/2]);
  for(const f of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]]) {
    triangle(out,p[f[0]],p[f[1]],p[f[2]],color); triangle(out,p[f[0]],p[f[2]],p[f[3]],color);
  }
}
/** Small bevels catch the studio lights without expensive post-processing. */
export function bevelBox(out,x,y,z,w,h,d,color=[.28,.32,.37],bevel=.03){
 const half=[w/2,h/2,d/2],b=Math.min(bevel,...half.map(v=>v*.4)),inner=half.map(v=>v-b),center=[x,y,z];
 function face(points,normal){
  const a=points[0],c=cross(points[1].map((v,i)=>v-a[i]),points[2].map((v,i)=>v-a[i]));
  if(c.reduce((sum,v,i)=>sum+v*normal[i],0)<0)points.reverse();
  const p=points.map(v=>v.map((a,i)=>a+center[i]));
  for(let i=1;i<p.length-1;i++)triangle(out,p[0],p[i],p[i+1],color);
 }
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
  const u=(axis+1)%3,v=(axis+2)%3,n=[0,0,0];n[axis]=sign;
  face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,c])=>{const p=[0,0,0];p[axis]=half[axis]*sign;p[u]=a*inner[u];p[v]=c*inner[v];return p;}),n);
 }
 for(let a=0;a<3;a++)for(let c=a+1;c<3;c++)for(const sa of [-1,1])for(const sc of [-1,1]){
  const k=3-a-c,n=[0,0,0];n[a]=sa;n[c]=sc;
  face([[0,-1],[1,-1],[1,1],[0,1]].map(([t,sk])=>{const p=[0,0,0];p[a]=sa*(t?inner[a]:half[a]);p[c]=sc*(t?half[c]:inner[c]);p[k]=sk*inner[k];return p;}),n);
 }
 for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
  const signs=[sx,sy,sz];face([0,1,2].map(axis=>inner.map((v,i)=>signs[i]*(i===axis?half[i]:v))),signs);
 }
}
export function crystal() {
  // A fractured, deterministic surface: coarse fracture planes with fine chipped facets.
  const t=(1+Math.sqrt(5))/2;
  let verts=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(normalize);
  let faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const rand=seeded(14);
  // First subdivision sets silhouette; subsequent subdivisions keep large fracture faces.
  for(let pass=0;pass<4;pass++) {
    const cache=new Map(),next=[];
    const mid=(a,b)=>{
      const key=[a,b].sort((a,b)=>a-b).join(':'); if(cache.has(key)) return cache.get(key);
      const p=verts[a].map((v,j)=>(v+verts[b][j])/2),n=normalize(p);
      let v;
      if(pass===0){ const f=.82+rand()*.30;v=n.map(x=>x*f); }
      else{const f=(rand()-.50)*(pass===1?.105:pass===2?.035:.016);v=p.map((x,i)=>x+n[i]*f);}
      const i=verts.length;verts.push(v);cache.set(key,i);return i;
    };
    for(const [a,b,c] of faces){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}
    faces=next;
  }
  verts=verts.map(([x,y,z])=>[x*.91+.13*y,y*1.22,z*.79+.075*Math.sin(y*4)]);
  const out=[];
  for(const f of faces){const k=.19+rand()*.08;triangle(out,...f.map(i=>verts[i]),[k*.85,k*.95,k*1.08]);}
  return new Float32Array(out);
}
export function cylinder(radius=1.5,height=.05,segments=96) {
  const out=[];
  for(let i=0;i<segments;i++) {
    const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
    const p=[Math.cos(a)*radius,Math.sin(a)*radius,-height/2],q=[Math.cos(b)*radius,Math.sin(b)*radius,-height/2];
    const r=[...p],s=[...q];r[2]=height/2;s[2]=height/2;
    triangle(out,[0,0,height/2],r,s); triangle(out,[0,0,-height/2],q,p);
    triangle(out,p,q,r); triangle(out,q,s,r);
  } return new Float32Array(out);
}
export function transistor() {
  const substrate=[],contacts=[],gate=[],channel=[];
  bevelBox(substrate,0,-.45,0,3,.5,1.75,[.12,.17,.22]);
  box(substrate,0,-.17,0,2.94,.035,1.69,[.29,.35,.4]);
  bevelBox(contacts,-1,.1,0,.58,.5,1.25,[.62,.42,.19]);
  bevelBox(contacts,1,.1,0,.58,.5,1.25,[.62,.42,.19]);
  bevelBox(gate,0,.29,0,.62,.58,1.28,[.4,.48,.6]);
  box(channel,0,-.11,0,2.4,.07,.65,[.86,.51,.15]);
  for(let i=0;i<6;i++) box(contacts,-1.4+i*.56,-.43,.89,.025,.2,.035,[.52,.4,.26]);
  return {substrate,contacts,gate,channel};
}
export function circuit(size=30) {
  const out=[],routes=[],rand=seeded(28);
  box(out,0,-.20,0,4.25,.23,4.25,[.06,.075,.09]);
  for(let layer=0;layer<3;layer++) {
    const y=-.17+layer*.047;
    box(out,0,y,0,4.26,.013,4.26,[.23+layer*.06,.25+layer*.06,.28+layer*.06]);
  }
  for(let x=0;x<size;x++) for(let z=0;z<size;z++) {
    const xx=(x-(size-1)/2)*4/size,zz=(z-(size-1)/2)*4/size;
    const bank=(Math.floor(x/5)+Math.floor(z/6))%3;
    const h=.025+rand()*.065+bank*.048,k=.1+rand()*.10;
    box(out,xx,h/2-.058,zz,3.3/size,h,3.05/size,[k*.83,k*.98,k*1.2]);
    // Fine silver top contact, reused in one merged buffer.
    box(out,xx,h-.056,zz,2.5/size,.006,2.3/size,[.25,.28,.32]);
  }
  for(let i=0;i<24;i++) {
    const p=-1.95+i*.168;
    box(routes,p,.178,0,.011,.012,4.05,[.62,.42,.21]);
    box(routes,0,.154,p,4.05,.009,.008,[.26,.38,.47]);
  }
  for(let i=0;i<4;i++) for(let j=0;j<4;j++) {
    const x=-1.5+i, z=-1.5+j;
    box(out,x,.27,z,.46,.2,.5,[.12,.17,.21]);
    for(let k=0;k<5;k++)box(routes,x-.17+k*.08,.374,z,.024,.009,.42,[.55,.47,.33]);
  }
  return {out,routes};
}
export function computer(phone=false) {
  const out=[],screen=[],w=phone?1.04:2.7,h=phone?2.2:1.75;
  box(out,0,0,0,w+.13,h+.13,.15,[.3,.35,.4]);
  box(screen,0,0,.09,w,h,.016,[.025,.06,.075]);
  const marks=[];
  for(let i=0;i<8;i++) box(marks,-w*.15,(h/2-.3)-i*.14,.11,w*(.55-(i%3)*.09),.023,.01,[.42,.63,.59]);
  if(!phone) {box(out,0,-1.16,0,.2,.48,.25);box(out,0,-1.4,.15,1.05,.06,.5);}
  return {out,screen,marks};
}
