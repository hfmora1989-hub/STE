'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
require('./verify.cjs').verify();
const pub=path.resolve(__dirname,'../sitio_firebase/public');
const config=require('../sitio_firebase/firebase.json');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let route;try{route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  if(route==='/')route='/index.html';
  const file=path.resolve(pub,'.'+route);
  if(!file.startsWith(pub+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end('No encontrado');return;}
  for(const h of config.hosting.headers[0].headers)res.setHeader(h.key,h.value);
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  fs.createReadStream(file).pipe(res);
}).listen(5178,'127.0.0.1',()=>console.log('Vista local: http://127.0.0.1:5178 (Ctrl+C para detener).'));
