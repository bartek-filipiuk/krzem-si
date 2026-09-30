/**
 * Profiles and the frame-time quality controller. No Three.js, no DOM: the text layer imports
 * this to decide whether the GPU layer is loaded at all, and node:test covers it.
 */
export const PROFILES = {
  cinematic: { dpr: 1.5, pixels: 3.4e6, textures: '2k', antialias: true, anisotropy: 8, lod: 'high' },
  balanced: { dpr: 1, pixels: 1.5e6, textures: '1k', antialias: false, anisotropy: 1, lod: 'low' },
  calm: null, // posters and DOM only: the GPU module is never imported
};
export const ORDER = ['cinematic', 'balanced', 'calm'];

/**
 * Selection order: QA override > explicit user choice (persisted) > reduced motion / Save-Data >
 * measurement. Measurement cannot pick a profile up front; the controller only demotes from the
 * starting profile. Viewport size, core count and deviceMemory are deliberately not inputs.
 */
export function selectProfile({ qa = null, choice = null, reduced = false, saveData = false } = {}) {
  if (ORDER.includes(qa)) return { profile: qa, reason: 'qa' };
  if (choice === 'calm') return { profile: 'calm', reason: 'user' };
  if (choice === 'motion') return { profile: 'cinematic', reason: 'user' };
  if (reduced) return { profile: 'calm', reason: 'reduced-motion' };
  if (saveData) return { profile: 'calm', reason: 'save-data' };
  return { profile: 'cinematic', reason: 'default' };
}

export function pixelRatio(profile, dpr, width, height) {
  const p = PROFILES[profile] ?? PROFILES.balanced;
  return Math.max(.5, Math.min(dpr || 1, p.dpr, Math.sqrt(p.pixels / Math.max(1, width * height))));
}

/** Texture set: the profile's, but never 2K on a phone-sized framing (1K is enough texels there). */
export function textureSet(profile, framing) {
  return framing === 'desktop' ? PROFILES[profile].textures : '1k';
}

export function percentile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** A window is slow when its median or p95 frame interval exceeds the profile's limits (ms). */
export const LIMITS = { cinematic: { median: 22, p95: 40 }, balanced: { median: 40, p95: 70 } };

/**
 * Measures intervals between frames that were actually rendered. Windows close after 60 samples
 * or 2 s. Two consecutive slow windows demote one step (cinematic -> balanced -> calm); a good
 * window resets the count. It never promotes. Samples are ignored during a hold (first shader
 * compile, first second after returning to the tab) and intervals over 250 ms (loop was paused).
 */
export class QualityController {
  constructor({ size = 60, span = 2000, holdMs = 1000 } = {}) {
    Object.assign(this, { size, span, holdMs });
    this.window = []; this.slow = 0; this.until = -Infinity; this.last = null;
  }
  hold(now, ms = this.holdMs) { this.until = Math.max(this.until, now + ms); this.window = []; }
  sample(interval, now, profile) {
    const limits = LIMITS[profile];
    if (!limits || now < this.until || interval <= 0 || interval > 250) return profile;
    this.window.push(interval);
    const total = this.window.reduce((a, b) => a + b, 0);
    if (this.window.length < this.size && total < this.span) return profile;
    if (this.window.length < 10) return profile;
    const sorted = [...this.window].sort((a, b) => a - b);
    this.last = { median: percentile(sorted, .5), p95: percentile(sorted, .95), frames: sorted.length };
    this.window = [];
    this.slow = this.last.median > limits.median || this.last.p95 > limits.p95 ? this.slow + 1 : 0;
    if (this.slow < 2) return profile;
    this.slow = 0;
    return ORDER[ORDER.indexOf(profile) + 1];
  }
}
