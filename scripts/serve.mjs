import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createStaticServer(directory) {
  const root=resolve(directory);
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
  return createServer(async (req,res)=>{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.includes('\0'))throw new Error('Invalid path');
      let file=resolve(root,'.'+pathname);
      if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return;}
      if((await stat(file)).isDirectory())file=resolve(file,'index.html');
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});
      res.end(req.method==='HEAD'?undefined:body);
    }catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=process.argv[2]||'src';
  const arg=process.argv.find(x=>x.startsWith('--port='));
  const port=Number(arg?.split('=')[1]||process.env.PORT||4173);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
  const host=process.env.HOST||'127.0.0.1';
  const server=createStaticServer(directory);
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(port,host,()=>console.log(`krzem.si → http://${host}:${port} (${directory})`));
}
