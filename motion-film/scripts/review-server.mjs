import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const target=path.resolve(root,'.'+(pathname==='/'?'/review.html':pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end('Arquivo não encontrado');}
 const size=fs.statSync(target).size;
 const type={'.mp4':'video/mp4','.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.zip':'application/zip'}[path.extname(target)]||'text/plain; charset=utf-8';
 const range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);
 if(range){const start=+range[1],end=range[2]?Math.min(+range[2],size-1):size-1;res.writeHead(206,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(target,{start,end}).pipe(res);}
 else{res.writeHead(200,{'Content-Type':type,'Content-Length':size,'Accept-Ranges':'bytes'});fs.createReadStream(target).pipe(res);}
}).listen(3400,'127.0.0.1',()=>console.log('Revisão local: http://localhost:3400'));
