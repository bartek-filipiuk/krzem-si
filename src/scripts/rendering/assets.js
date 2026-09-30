/**
 * Asset manager: one fetch per URL, reference counted, cancellable, and disposing GPU resources
 * when the last user releases them. Parsing is the caller's (GLTFLoader, HDRLoader, ...), so this
 * module stays loader-agnostic and does not pull extra decoders into the bundle.
 */
export function disposeObject(value) {
  if (!value) return;
  if (value.isTexture || value.isWebGLRenderTarget) { value.dispose(); return; }
  const root = value.scene ?? value;
  if (root.traverse) {
    root.traverse(node => {
      node.geometry?.dispose();
      for (const material of [node.material].flat().filter(Boolean)) {
        for (const key of Object.keys(material)) if (material[key]?.isTexture) material[key].dispose();
        material.dispose();
      }
    });
  } else value.dispose?.();
}

export function createAssetManager() {
  const entries = new Map();
  return {
    /** Load (or share) url; parse(arrayBuffer) builds the value. Rejects with AbortError on abort. */
    async acquire(url, parse, signal) {
      let entry = entries.get(url);
      if (!entry) {
        const controller = new AbortController();
        entry = { refs: 0, controller, value: null };
        entry.promise = fetch(url, { signal: controller.signal })
          .then(response => { if (!response.ok) throw new Error(`${response.status} ${url}`); return response.arrayBuffer(); })
          .then(parse)
          .then(value => {
            // Released while parsing: nobody will ever read this value, free it now.
            if (entries.get(url) !== entry) { disposeObject(value); throw new DOMException('Released', 'AbortError'); }
            return (entry.value = value);
          });
        entry.promise.catch(() => entries.get(url) === entry && entries.delete(url));
        entries.set(url, entry);
      }
      entry.refs++;
      const onAbort = () => this.release(url);
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const value = await entry.promise;
        signal?.throwIfAborted();
        return value;
      } finally { signal?.removeEventListener('abort', onAbort); }
    },
    release(url) {
      const entry = entries.get(url);
      if (!entry || --entry.refs > 0) return;
      entries.delete(url);
      if (entry.value) disposeObject(entry.value); else entry.controller.abort();
    },
    dispose() { for (const url of [...entries.keys()]) { const e = entries.get(url); e.refs = 1; this.release(url); } },
    get size() { return entries.size; },
  };
}
