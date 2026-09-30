import { cp, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, extname, relative } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
const root=resolve(import.meta.dirname,'..');const out=resolve(root,'dist');
await rm(out,{recursive:true,force:true});await cp(resolve(root,'src'),out,{recursive:true});
const url=new URL(process.env.SITE_URL||'https://krzem.si/');
if(!['http:','https:'].includes(url.protocol))throw new Error('SITE_URL must be HTTP(S)');
const site=url.href.replace(/\/?$/,'/');
let html=await readFile(resolve(out,'index.html'),'utf8');html=html.replaceAll('https://krzem.si/',site);await writeFile(resolve(out,'index.html'),html);
await writeFile(resolve(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`);
await writeFile(resolve(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.replaceAll('&','&amp;').replaceAll('<','&lt;')}</loc></url></urlset>\n`);
const files=[];
async function walk(dir){for(const name of await readdir(dir)){const p=resolve(dir,name);if((await stat(p)).isDirectory())await walk(p);else files.push(p);}}
await walk(out);let total=0,codeGzip=0;
for(const file of files){const data=await readFile(file);total+=data.length;if(['.html','.css','.js','.svg','.xml','.txt'].includes(extname(file))){const gz=gzipSync(data,{level:9});const br=brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:9}});await writeFile(file+'.gz',gz);await writeFile(file+'.br',br);if(['.html','.css','.js'].includes(extname(file)))codeGzip+=gz.length;}}
if(codeGzip>85*1024)throw new Error(`Code budget exceeded: ${codeGzip} bytes gzip (limit: 85 KiB)`);
if(total>3*1024*1024)throw new Error(`Asset budget exceeded: ${total} bytes (limit: 3 MiB)`);
console.log(`Built dist/: ${files.length} source files; ${(total/1024).toFixed(1)} KiB raw; ${(codeGzip/1024).toFixed(1)} KiB gzipped HTML/CSS/JS.`);
console.log('Precompressed .br / .gz included. Deploy dist/ to any static host.');
