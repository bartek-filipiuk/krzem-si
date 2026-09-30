import { chapterAt, clamp } from './math.js';
import { initialQuality, FrameBudget } from './quality.js';

const root=document.documentElement;
const canvas=document.querySelector('#scene-canvas');
const sections=[...document.querySelectorAll('[data-scene]')];
const links=[...document.querySelectorAll('.chapter-nav a')];
const status=document.querySelector('#render-status');
const motionButton=document.querySelector('#motion-toggle');
const motionLabel=document.querySelector('#motion-label');
const powerButton=document.querySelector('#transistor-toggle');
const aiButton=document.querySelector('#ai-toggle');
const aiPanel=document.querySelector('#ai-demo');
const progressBar=document.querySelector('#reading-progress-bar');
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
const connection=navigator.connection;
const budget=new FrameBudget();
let renderer=null,raf=0,dirty=true,bounds=[],footerTop=0,pageHeight=1;
let index=0,progress=0,transition=0,pointer=[0,0],lastFrame=0,clock=0,lastRender=0,warmup=12;
let manualPower=null,lastPower=null,manualAI=null,previousIndex=-1,generation=0;
let choice='auto',tier='static',destroyed=false;
try {if(localStorage.getItem('krzem-motion')==='static')choice='static';} catch { /* Private/storage-blocked mode remains usable. */ }
const debug=new URLSearchParams(location.search).has('debug');
function compactViewport(){return (window.innerWidth<760&&window.innerHeight<740)||window.innerHeight<560;}
function preference(){return choice==='static'||compactViewport()?'static':initialQuality({reduced:reduce.matches,saveData:connection?.saveData,cores:navigator.hardwareConcurrency||8,memory:navigator.deviceMemory||8});}
function measure(){
  bounds=sections.map(s=>({top:s.getBoundingClientRect().top+window.scrollY,height:s.getBoundingClientRect().height}));
  footerTop=document.querySelector('#zrodla').getBoundingClientRect().top+window.scrollY;
  pageHeight=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
  renderer?.resize(tier);dirty=true;schedule();
}
function setPower(power){
  if(lastPower===power)return;lastPower=power;
  powerButton.setAttribute('aria-pressed',String(power));root.dataset.power=power?'on':'off';
  document.querySelector('#switch-label').textContent=power?'Wyłącz przewodzenie':'Włącz przewodzenie';
  powerButton.querySelector('.switch-state').textContent=power?'1':'0';
  document.querySelector('#switch-description').textContent=power?'Kanał przewodzi. Napięcie bramki zmieniło jego stan.':'Kanał nie przewodzi w tym uproszczonym modelu.';
}
function update(){
  if(!bounds.length)return;
  const state=chapterAt(window.scrollY,bounds,window.innerHeight);index=state.index;progress=state.progress;
  const active=bounds[index];transition=root.dataset.motion==='full'?clamp((window.scrollY-active.top-active.height+window.innerHeight)/window.innerHeight):0;
  if(index!==previousIndex){
    links.forEach((a,i)=>{if(i===index)a.setAttribute('aria-current','step');else a.removeAttribute('aria-current');});
    root.dataset.chapter=String(index);previousIndex=index;budget.reset();warmup=12;
  }
  progressBar.style.transform=`scaleX(${clamp(window.scrollY/pageHeight)})`;
  if(index===1){const step=Math.min(3,Math.floor(progress*4));document.querySelectorAll('[data-process]').forEach((li,i)=>li.dataset.active=String(i<=step));}
  if(index===2)setPower(manualPower??(progress>.35));
  if(index===5){const open=manualAI??(progress>.23&&progress<.66);aiPanel.classList.toggle('is-open',open);aiButton.setAttribute('aria-expanded',String(open));}
  dirty=false;
}
function schedule(){if(!raf&&!destroyed&&!document.hidden)raf=requestAnimationFrame(tick);}
function tick(now){
  raf=0;if(destroyed||document.hidden)return;
  if(dirty)update();
  if(renderer&&window.scrollY<footerTop){
    const dt=lastFrame?now-lastFrame:16.7;lastFrame=now;
    clock+=Math.min(dt,64)/1000;
    if(warmup>0)warmup--;else{
      const next=budget.sample(dt,tier);
      if(next!==tier){
        tier=next;
        if(tier==='static'){stop('Tryb lekki · dla płynności');return;}
        renderer.resize(tier);root.dataset.quality=tier;status.textContent='TRYB OSZCZĘDNY · ANIMACJE 3D';
      }
    }
    const interval=tier==='low'?1000/30:1000/60;
    if(now-lastRender>=interval-1){
      try {renderer.render({index,progress,transition,time:clock,pointer,power:lastPower??false});root.dataset.renderer='webgl';}
      catch(error){console.warn('[krzem.si] Renderer fallback:',error);stop('Tryb lekki · 3D niedostępne');return;}
      lastRender=now;
    }
    schedule();
  }else{lastFrame=0;}
}
function stop(message='TRYB SPOKOJNY · PEŁNA OPOWIEŚĆ'){
  const restoreIndex=index,wasFull=root.dataset.motion==='full';
  generation++;if(raf){cancelAnimationFrame(raf);raf=0;}
  renderer?.dispose();renderer=null;tier='static';root.dataset.motion='static';root.dataset.renderer='static';root.dataset.quality='static';
  status.textContent=message;motionLabel.textContent='Włącz animacje';motionButton.setAttribute('aria-pressed','true');
  budget.reset();requestAnimationFrame(()=>{measure();if(wasFull&&restoreIndex>0)window.scrollTo(0,bounds[restoreIndex].top);});
}
async function start(forced=false){
  const requested=forced?'high':preference();
  if(requested==='static'){stop();return;}
  const token=++generation;
  const restoreIndex=index;root.dataset.motion='full';root.dataset.renderer='static';root.dataset.quality=requested;
  motionLabel.textContent='Ogranicz animacje';motionButton.setAttribute('aria-pressed','false');
  // The static story has already painted. GPU code is a separate, optional module.
  try{
    const {createRenderer}=await import('./renderer.js');
    if(token!==generation||destroyed)return;
    renderer?.dispose();renderer=createRenderer(canvas);tier=requested;
    lastFrame=0;lastRender=0;warmup=12;budget.reset();
    status.textContent=tier==='high'?'INTERAKTYWNA OPOWIEŚĆ · 3D':'TRYB OSZCZĘDNY · ANIMACJE 3D';
    measure();if(restoreIndex>0)window.scrollTo(0,bounds[restoreIndex].top);
  }catch(error){if(token===generation){console.warn('[krzem.si] Static fallback:',error);stop('TRYB LEKKI · 3D NIEDOSTĘPNE');}}
}
powerButton.disabled=false;aiButton.disabled=false;motionButton.hidden=compactViewport();
powerButton.addEventListener('click',()=>{manualPower=!(lastPower??false);setPower(manualPower);dirty=true;schedule();});
aiButton.addEventListener('click',()=>{manualAI=!aiPanel.classList.contains('is-open');aiPanel.classList.toggle('is-open',manualAI);aiButton.setAttribute('aria-expanded',String(manualAI));});
motionButton.addEventListener('click',()=>{
  if(root.dataset.motion==='static'){choice='auto';try{localStorage.removeItem('krzem-motion');}catch{}start(true);}
  else {choice='static';try{localStorage.setItem('krzem-motion','static');}catch{}stop();}
});
window.addEventListener('scroll',()=>{dirty=true;schedule();},{passive:true});
window.addEventListener('resize',()=>{motionButton.hidden=compactViewport();if(compactViewport()&&renderer)stop('TRYB LEKKI · MAŁY EKRAN');measure();},{passive:true});
window.addEventListener('pointermove',event=>{if(event.pointerType==='mouse')pointer=[event.clientX/window.innerWidth-.5,event.clientY/window.innerHeight-.5];},{passive:true});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;}
  else{budget.reset();lastFrame=0;dirty=true;schedule();}
});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stop('TRYB LEKKI · KONTEKST GRAFIKI UTRACONY');});
canvas.addEventListener('webglcontextrestored',()=>{if(choice!=='static'&&!reduce.matches)start();});
reduce.addEventListener('change',()=>{if(reduce.matches)stop();else if(choice!=='static')start();});
if('ResizeObserver'in window){const observer=new ResizeObserver(measure);observer.observe(document.querySelector('main'));observer.observe(document.querySelector('#zrodla'));}
window.addEventListener('pagehide',event=>{if(raf)cancelAnimationFrame(raf);raf=0;if(!event.persisted){destroyed=true;generation++;renderer?.dispose();renderer=null;}});
window.addEventListener('pageshow',()=>{if(!destroyed){lastFrame=0;measure();}});
if(debug)Object.defineProperty(window,'krzemDebug',{get:()=>({index,progress,tier,mode:root.dataset.motion,rafActive:!!raf,renderer:renderer?.diagnostics??null})});
measure();
// Respect accessibility/data-saving preferences before importing any GPU code.
if(preference()==='static')stop();
else if('requestIdleCallback'in window)window.requestIdleCallback(()=>start(),{timeout:600});
else setTimeout(()=>start(),100);
