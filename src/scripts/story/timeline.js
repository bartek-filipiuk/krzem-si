/**
 * Scroll reader and story timeline. The story state is a pure function of the scroll position
 * and cached section bounds; only createScrollReader touches the DOM (and only in measure()).
 */
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Active chapter and its pinned progress (0 when the stage pins, 1 when it starts to leave). */
export function chapterAt(y, bounds, height) {
  let index = 0;
  for (let i = 0; i < bounds.length; i++) if (y >= bounds[i].top) index = i;
  const b = bounds[index];
  return { index, progress: clamp((y - b.top) / Math.max(1, b.height - height)) };
}

/** Hero story progress: 0 at the top of the hero, 1 when the material chapter pins. */
export function heroProgress(y, bounds) {
  const start = bounds[0].top, end = bounds[1]?.top ?? start + bounds[0].height;
  return clamp((y - start) / Math.max(1, end - start));
}

/**
 * Hero -> material entry, in hero progress units.
 * start: camera leaves the hero pose; face: the fracture face fills the frame;
 * cut: the canvas has faded to the page background and the material scene takes over;
 * end: the material scene is fully in, just before the material chapter pins.
 */
export const ENTRY = { start: .2, face: .7, dip: .74, cut: .84, end: .97 };

export function entryPhases(t) {
  const hero = t < ENTRY.cut;
  return {
    camera: smoothstep(ENTRY.start, ENTRY.face, t),
    copy: 1 - smoothstep(ENTRY.start, ENTRY.start + .15, t),
    canvas: hero ? 1 - smoothstep(ENTRY.dip, ENTRY.cut, t) : smoothstep(ENTRY.cut, ENTRY.end, t),
    scene: hero ? 'hero' : 'material',
  };
}

export function createScrollReader(sections, footer) {
  let bounds = [], footerTop = Infinity, maxScroll = 1;
  const reader = {
    measure() {
      bounds = sections.map(s => { const r = s.getBoundingClientRect(); return { top: r.top + window.scrollY, height: r.height }; });
      footerTop = footer ? footer.getBoundingClientRect().top + window.scrollY : Infinity;
      maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    },
    get bounds() { return bounds; },
    read(y, height, motion) { return storyAt(y, height, bounds, { footerTop, maxScroll, motion }); },
    positionOf(index, progress) { return positionOf(index, progress, bounds, window.innerHeight); },
  };
  return reader;
}

/** Full story state for one scroll position. Pure. */
export function storyAt(y, height, bounds, { footerTop = Infinity, maxScroll = 1, motion = true } = {}) {
  const { index, progress } = chapterAt(y, bounds, height);
  const b = bounds[index];
  return {
    index, progress,
    hero: heroProgress(y, bounds),
    // Legacy chapters cross-fade into the next one while their stage scrolls away.
    transition: motion && index > 0 ? clamp((y - b.top - b.height + height) / height) : 0,
    reading: clamp(y / maxScroll),
    visible: y < footerTop,
  };
}

/** Inverse mapping for QA mode: the hero uses hero progress, other chapters their pinned progress. */
export function positionOf(index, progress, bounds, height) {
  const b = bounds[index], p = clamp(progress);
  if (index === 0) return b.top + p * ((bounds[1]?.top ?? b.top + b.height) - b.top);
  return b.top + p * Math.max(0, b.height - height);
}
