/** Cheap source checks before the build: syntax, references, anchors, and layer separation. */
import { readdir, readFile, access, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
async function walk(dir, out = []) {
  for (const name of await readdir(dir)) {
    const p = resolve(dir, name);
    if ((await stat(p)).isDirectory()) await walk(p, out); else if (/\.m?js$/.test(name)) out.push(p);
  }
  return out;
}
const scripts = await walk(resolve(root, 'src/scripts'));
for (const file of [...scripts, ...await walk(resolve(root, 'scripts')), ...await walk(resolve(root, 'tests'))])
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const html = await readFile(resolve(root, 'src/index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML ids');
for (const [, ref] of html.matchAll(/(?:src|href|srcset)="([^"]+)"/g)) {
  if (ref.startsWith('#') && !ids.includes(ref.slice(1))) throw new Error(`Broken anchor: ${ref}`);
  if (ref.startsWith('./')) await access(resolve(root, 'src', ref));
}
await access(resolve(root, 'src/assets/social.webp'));

for (const file of scripts) {
  const code = await readFile(file, 'utf8');
  if (/https?:\/\//.test(code)) throw new Error(`Unexpected external URL in ${file}`);
  // Runtime asset URLs and JSON imports must point at files that exist.
  for (const [, ref] of code.matchAll(/new URL\('([^']+)', import\.meta\.url\)/g)) await access(resolve(dirname(file), ref));
  for (const [, ref] of code.matchAll(/from '(\.[^']+\.json)'/g)) await access(resolve(dirname(file), ref));
}

// The text layer must never statically reach Three.js: calm and no-GPU visits do not load it.
const seen = new Set();
async function reachesThree(file) {
  if (seen.has(file)) return false;
  seen.add(file);
  const code = await readFile(file, 'utf8');
  if (/^\s*import[^()]*from\s*'three/m.test(code)) return true;
  for (const [, spec] of code.matchAll(/^\s*import[^()]*from\s*'(\.[^']+\.js)'/gm)) if (await reachesThree(resolve(dirname(file), spec))) return true;
  return false;
}
if (await reachesThree(resolve(root, 'src/scripts/app.js'))) throw new Error('app.js statically imports Three.js');
console.log('Syntax, local references, asset paths, anchor ids, no external URLs, text layer free of Three.js: OK.');
