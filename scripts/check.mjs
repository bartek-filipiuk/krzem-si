import { readdir, readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
for(const folder of ['src/scripts','scripts','tests'])for(const name of await readdir(resolve(root,folder)))if(/\.m?js$/.test(name))execFileSync(process.execPath,['--check',resolve(root,folder,name)],{stdio:'inherit'});
const html=await readFile(resolve(root,'src/index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML ids');
for(const [,ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  if(ref.startsWith('#')&&!ids.includes(ref.slice(1)))throw new Error(`Broken anchor: ${ref}`);
  if(ref.startsWith('./'))await access(resolve(root,'src',ref));
}
await access(resolve(root,'src/assets/social.webp'));
if(/https?:\/\//.test(await readFile(resolve(root,'src/scripts/app.js'),'utf8')))throw new Error('Unexpected external request in app.js');
console.log('Syntax, local references, anchor ids and no-external-request guard: OK.');
