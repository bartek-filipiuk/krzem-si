/**
 * Post-build step after `vite build`: site URL, robots/sitemap, social card, precompressed
 * .br/.gz variants and the size budgets. Prints the initial (text layer) vs lazy (GPU) split.
 */
import { copyFile, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, extname, relative } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
const url = new URL(process.env.SITE_URL || 'https://krzem.si/');
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('SITE_URL must be HTTP(S)');
const site = url.href.replace(/\/?$/, '/');

let html = await readFile(resolve(out, 'index.html'), 'utf8');
html = html.replaceAll('https://krzem.si/', site);
await writeFile(resolve(out, 'index.html'), html);
await writeFile(resolve(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`);
await writeFile(resolve(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</loc></url></urlset>\n`);
// og:image is an absolute URL, so Vite does not see it: copy it to its fixed path.
await mkdir(resolve(out, 'assets'), { recursive: true });
await copyFile(resolve(root, 'src/assets/social.webp'), resolve(out, 'assets/social.webp'));

const files = [];
async function walk(dir) { for (const name of await readdir(dir)) { const p = resolve(dir, name); if ((await stat(p)).isDirectory()) await walk(p); else files.push(p); } }
await walk(out);
const sizes = {};
let total = 0;
for (const file of files) {
  const data = await readFile(file);
  total += data.length;
  const entry = sizes[relative(out, file)] = { raw: data.length, br: data.length };
  if (['.html', '.css', '.js', '.svg', '.xml', '.txt', '.json', '.hdr', '.glb'].includes(extname(file))) {
    const gz = gzipSync(data, { level: 9 });
    const br = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    // Only keep a variant that actually saves bytes (binary assets often do not).
    if (br.length < data.length * .95) { await writeFile(file + '.gz', gz); await writeFile(file + '.br', br); entry.br = br.length; }
  }
}

// Initial text layer: the HTML, what it links, and the static imports of those scripts.
// Dynamic import() targets (the GPU layer) are lazy by construction.
const initialNames = new Set(['index.html']);
const queue = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map(m => m[1]);
while (queue.length) {
  const name = queue.shift();
  if (initialNames.has(name)) continue;
  initialNames.add(name);
  if (!name.endsWith('.js')) continue;
  const code = await readFile(resolve(out, name), 'utf8');
  for (const m of code.matchAll(/(?:^|[;}\s])import\s*(?:[\w${},*\s]+from\s*)?["']\.\/([^"']+\.js)["']/g)) queue.push('assets/' + m[1]);
}
const initial = Object.entries(sizes).filter(([name]) => initialNames.has(name));
const initialBr = initial.reduce((sum, [, s]) => sum + s.br, 0);
const lazy = Object.entries(sizes).filter(([name]) => /\.js$/.test(name) && !initial.some(([n]) => n === name));
const kib = n => (n / 1024).toFixed(1);
console.log(`Initial HTML/CSS/JS (brotli): ${kib(initialBr)} KiB  [${initial.map(([n, s]) => `${n} ${kib(s.br)}`).join(', ')}]`);
console.log(`Lazy GPU chunks (brotli): ${lazy.map(([n, s]) => `${n} ${kib(s.br)} KiB`).join(', ')}`);
console.log(`dist/: ${files.length} files, ${kib(total)} KiB raw (before .br/.gz variants).`);
if (initialBr > 30 * 1024) throw new Error(`Initial text-layer budget exceeded: ${initialBr} B brotli (limit 30 KiB)`);
if (total > 12 * 1024 * 1024) throw new Error(`dist/ budget exceeded: ${total} B (limit 12 MiB)`);
