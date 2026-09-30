/** Optional offline preview. Inlines our own assets; no bundler/package installation required. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
const root=resolve(import.meta.dirname,'../src');
const output=process.argv[2]||resolve(import.meta.dirname,'../preview.html');
const cache=new Map();
async function moduleURL(path){
 if(cache.has(path))return cache.get(path);
 let code=await readFile(path,'utf8');
 const specs=[...new Set([...code.matchAll(/['"](\.\/[^'"]+\.js)['"]/g)].map(m=>m[1]))];
 for(const spec of specs){const url=await moduleURL(resolve(dirname(path),spec));code=code.replaceAll(`'${spec}'`,`'${url}'`).replaceAll(`"${spec}"`,`"${url}"`);}
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(path,url);return url;
}
let html=await readFile(resolve(root,'index.html'),'utf8');
const css=await readFile(resolve(root,'styles.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="./styles.css">',`<style>${css}</style>`);
const entry=await moduleURL(resolve(root,'scripts/app.js'));
html=html.replace('src="./scripts/app.js"',`src="${entry}"`);
for(const [,path] of [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)]){
 const mime=extname(path)==='.svg'?'image/svg+xml':extname(path)==='.webp'?'image/webp':'image/png';
 const data=await readFile(resolve(root,path));html=html.replaceAll(path,`data:${mime};base64,${data.toString('base64')}`);
}
await writeFile(output,html);console.log(`Standalone preview: ${output} (${Math.round(Buffer.byteLength(html)/1024)} KiB)`);
