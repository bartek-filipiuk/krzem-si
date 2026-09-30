import { clamp } from './math.js';
/** Hints are optional. Real frame timings, not user-agent guesses, drive degradation. */
export function initialQuality({ reduced=false, saveData=false, cores=8, memory=8 }={}) {
  if(reduced || saveData || cores<=2 || memory<=2) return 'static';
  return cores<=4 || memory<=4 ? 'low' : 'high';
}
export function pixelRatio(quality, dpr, width, height) {
  const cap = quality==='high' ? 1.5 : .85;
  const pixels = quality==='high' ? 2200000 : 850000;
  return Math.max(.3, Math.min(dpr || 1,cap,Math.sqrt(pixels / Math.max(1,width*height))));
}
export class FrameBudget {
  constructor() { this.reset(); }
  reset() { this.samples=0; this.total=0; this.slowWindows=0; this.severeFrames=0; }
  sample(milliseconds, tier) {
    // Discard tab switches, huge pauses and first shader compilation.
    if(milliseconds<5 || milliseconds>1500) return tier;
    this.severeFrames=milliseconds>80?this.severeFrames+1:0;
    if(this.severeFrames>=12){this.reset();return tier==='high'?'low':'static';}
    this.total+=clamp(milliseconds,5,160); this.samples++;
    if(this.samples<90) return tier;
    const average=this.total/this.samples; this.samples=0; this.total=0;
    if(average>(tier==='high'?26:43)) this.slowWindows++; else this.slowWindows=0;
    if(this.slowWindows<2) return tier;
    this.slowWindows=0;
    return tier==='high'?'low':'static';
  }
}
