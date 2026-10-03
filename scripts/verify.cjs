'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function verify(project=root){
  const publicPath=path.join(project,'sitio_firebase/public');
  const manifest=JSON.parse(fs.readFileSync(path.join(project,'build-manifest.json'),'utf8'));
  if(manifest.kind!=='public-tool-without-beneficiary-data'||manifest.versions.xlsx!=='0.20.3')throw Error('Manifiesto o versión inesperados.');
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const file=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('No se permiten enlaces en public.');return e.isDirectory()?walk(file):[path.relative(publicPath,file).replaceAll('\\','/')];
  });
  const actual=walk(publicPath).sort(),expected=manifest.files.map(e=>e.file).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Public contiene archivos no previstos o faltantes. No publique Excel, copias HTML ni datos personales.');
  for(const e of manifest.files){
    if(!/^(assets\/[a-z]+\.[a-f0-9]{16}\.(js|css|png)|index\.html|robots\.txt)$/.test(e.file))throw Error('Archivo no permitido: '+e.file);
    const bytes=fs.readFileSync(path.join(publicPath,e.file));
    if(bytes.length!==e.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==e.sha256)throw Error('Artefacto modificado: '+e.file);
    if(e.file.endsWith('.png')){if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Imagen no válida: '+e.file);continue;}
    const text=bytes.toString('utf8');
    if(/EMBEDDED_B64|__DATA__|H4sIA[A-Za-z0-9+/]{100}/.test(text))throw Error('Se detectó un marcador de paquete de datos.');
    if(/"(?:doc|nombre|dirBen|dirVisita)"\s*:\s*"[^"\n]+"/.test(text))throw Error('Posible registro individual en el artefacto.');
  }
  const html=fs.readFileSync(path.join(publicPath,'index.html'),'utf8');
  if(/<script(?![^>]*\bsrc=)|\son\w+\s*=/i.test(html))throw Error('No se permiten scripts inline ni manejadores inline.');
  const config=JSON.parse(fs.readFileSync(path.join(project,'sitio_firebase/firebase.json'),'utf8'));
  const csp=config.hosting.headers.flatMap(h=>h.headers).find(h=>h.key==='Content-Security-Policy')?.value||'';
  if(!/script-src 'self'(?:;|$)/.test(csp))throw Error('CSP de scripts no es estricta.');
  if(!config.hosting.predeploy?.some(c=>c.includes('verify.cjs')))throw Error('Falta comprobación previa a publicar.');
  if(!html.includes('id="workspace" hidden')||!html.includes('id="loginForm"'))throw Error('Falta la pantalla de acceso.');
  if(!config.hosting.rewrites.some(r=>r.source==='/api/**'&&r.function?.functionId==='steApi'))throw Error('Falta la API privada.');
  const rules=fs.readFileSync(path.join(project,'sitio_firebase/storage.rules'),'utf8');
  if(!/allow read, write: if false/.test(rules)||/if true/.test(rules))throw Error('Storage debe denegar todo acceso cliente.');
  console.log('Verificación correcta: archivos previstos, hashes íntegros, sin paquete de beneficiarios y scripts externos.');
  return true;
}
if(require.main===module)verify();
module.exports={verify};
