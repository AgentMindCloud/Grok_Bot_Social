import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve('out'), port=Number(process.env.PORT || 43215);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml','.zip':'application/zip'};
createServer(async(req,res)=>{try {
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({message:'No API is attached to this static verification server.'}));return;}
  let file=resolve(root,'.'+path); if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  let info;try{info=await stat(file);}catch{info=null;}
  if(info?.isDirectory())file=resolve(file,'index.html');
  let data;try{data=await readFile(file);}catch{file=resolve(root,'404.html');data=await readFile(file);res.statusCode=404;}
  res.setHeader('content-type',types[extname(file)]||'application/octet-stream');res.setHeader('cache-control','no-store');res.end(req.method==='HEAD'?undefined:data);
}catch{res.writeHead(500);res.end('Static verification server error');}}).listen(port,'127.0.0.1',()=>console.log(`Bottocks static export: http://127.0.0.1:${port}`));
