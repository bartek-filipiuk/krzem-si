import { defineConfig } from 'vite';

// Port 4173 is used by another project on the reference machine; 4174 everywhere.
const server = { host: '127.0.0.1', port: 4174, strictPort: true };

export default defineConfig({
  root: 'src',
  base: './', // relative URLs: dist/ works from any subfolder
  publicDir: false,
  server,
  preview: server,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0, // keep every asset a real, cacheable file
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 700, // the lazy GPU chunk (Three.js) is expected to be ~630 kB
  },
});
