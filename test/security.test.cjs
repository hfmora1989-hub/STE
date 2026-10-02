'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib'),fs=require('node:fs'),path=require('node:path');
const S=require('../functions/security.cjs'),D=require('../functions/data.cjs'),STE=require('../src/extract.js');
const {createHandler}=require('../functions/handler.cjs');
const {storageAdapter}=require('../functions/store.cjs');
const keys={active:'v1',keys:{v1:crypto.randomBytes(32).toString('base64')}};
const token={uid:'TEST-UID',email:'hmora@scain.co',email_verified:true,steAccess:true,stePasswordChangeRequired:false,firebase:{sign_in_provider:'password'},auth_time:Math.floor(Date.now()/1000)};
const visits=[{doc:'TEST-A',nombre:'Persona ficticia A',fecha:'01/09/2026',num:1,distancia:2,loc:'SUBA',recom:'PAGAR',estado:'EFECTIVA',tipoVisita:'Atendida'},{doc:'TEST-B',nombre:'Persona ficticia B',fecha:'02/09/2026',num:1,distancia:6,loc:'SUBA',recom:'NO PAGAR',tipoVisita:'Ausente'}];
const dataset={...D.empty(),visitas:{name:'synthetic.xlsx',n:2,rows:STE.pack(visits,STE.VIS_FIELDS)}};
const filters={by:'res',unit:'vis',from:'',to:'',loc:''};
function setup(overrides={}){
  let encrypted=S.encrypt(dataset,keys),generation=1,reads=0,writes=0,revokedCheck,claimUpdate;const audit=[];
  const store={async quota(){},async read(){reads++;return {bytes:encrypted,generation};},async write(bytes,g){assert.equal(g,generation);encrypted=bytes;generation++;writes++;},...overrides.store};
  const auth={async verifyIdToken(t,check){revokedCheck=check;if(overrides.invalid)throw Error('revoked');return {...token,...overrides.token};},async updateUser(){},async getUser(){return {customClaims:{steAccess:true,stePasswordChangeRequired:true}};},async setCustomUserClaims(uid,c){claimUpdate=c;},async revokeRefreshTokens(){},...overrides.auth};
  const handler=createHandler({auth,store,keys,auditKey:'synthetic-audit-key',audit:v=>audit.push(v)});
  return {audit,get reads(){return reads;},get writes(){return writes;},get revokedCheck(){return revokedCheck;},get claimUpdate(){return claimUpdate;},async request(action,body={},headers={},method='POST'){
    const h={'authorization':'Bearer '+'.'.repeat(30),'content-type':'application/json',...headers};let code=200,result;const responseHeaders={};
    const res={set(k,v){responseHeaders[k]=v;return this;},status(c){code=c;return this;},json(v){result=v;return this;}};
    await handler({path:'/api/'+action,method,body,get:k=>h[k]},res);return {code,result,headers:responseHeaders};
  }};
}
test('AES-256-GCM: cifras no exponen nombres, IV aleatorio y lectura íntegra',()=>{
  const a=S.encrypt(dataset,keys),b=S.encrypt(dataset,keys);assert.notDeepEqual(a,b);assert.ok(!a.includes('Persona ficticia'));assert.deepEqual(S.decrypt(a,keys),dataset);
});
test('Cifrado: alteración, clave equivocada y etiqueta inválida se rechazan',()=>{
  const raw=JSON.parse(S.encrypt(dataset,keys));const bytes=Buffer.from(raw.body,'base64');bytes[0]^=1;raw.body=bytes.toString('base64');assert.throws(()=>S.decrypt(Buffer.from(JSON.stringify(raw)),keys));
  assert.throws(()=>S.decrypt(S.encrypt(dataset,keys),{active:'v1',keys:{v1:crypto.randomBytes(32).toString('base64')}}));
  assert.throws(()=>S.keyring({active:'v1',keys:{v1:'short'}}));
});
test('Rotación admite datos viejos y escribe con nueva clave',()=>{
  const newer={active:'v2',keys:{...keys.keys,v2:crypto.randomBytes(32).toString('base64')}};const old=S.encrypt(dataset,keys);assert.deepEqual(S.decrypt(old,newer),dataset);assert.equal(JSON.parse(S.encrypt(dataset,newer)).key,'v2');
});
test('Todos los endpoints privados rechazan anónimos antes de leer Storage',async()=>{
  const app=setup();for(const a of ['metadata','dashboard','consult','upload','session','password'])assert.equal((await app.request(a,{}, {authorization:''})).code,401);assert.equal(app.reads,0);
});
test('Token inválido, revocado, correo ajeno, registro propio o proveedor incorrecto no acceden',async()=>{
  for(const config of [{invalid:true},{token:{email:'otro@scain.co'}},{token:{steAccess:false}},{token:{firebase:{sign_in_provider:'google.com'}}}]){
    const app=setup(config);assert.ok([401,403].includes((await app.request('metadata')).code));assert.equal(app.reads,0);assert.equal(app.revokedCheck,true);
  }
});
test('Las cuatro cuentas reciben derechos y terceros no pueden declararse administrador',()=>{
  for(const email of Object.keys(require('../functions/access.json')))assert.equal(S.identity({...token,email}).upload,true);
  assert.throws(()=>S.identity({...token,email:'intruso@example.test',admin:true}),/autorizada/);
});
test('Verificación y cambio inicial son obligatorios para datos y cargas',async()=>{
  for(const t of [{email_verified:false},{stePasswordChangeRequired:true},{stePasswordChangeRequired:undefined}]){
    const app=setup({token:t});assert.equal((await app.request('session')).code,200);
    for(const a of ['metadata','dashboard','consult','upload'])assert.equal((await app.request(a,filters)).code,403);
    assert.equal(app.reads,0);
  }
});
test('Cambio de contraseña requiere correo, login reciente y política fuerte',async()=>{
  const password='Ejemplo-Privado123!';
  for(const tokenOverride of [{email_verified:false},{auth_time:1}])assert.notEqual((await setup({token:tokenOverride}).request('password',{password})).code,200);
  assert.equal((await setup().request('password',{password:'debil'})).code,400);
  const app=setup({token:{stePasswordChangeRequired:true}});assert.equal((await app.request('password',{password})).code,200);assert.equal(app.claimUpdate.stePasswordChangeRequired,false);assert.equal(app.claimUpdate.steAccess,true);assert.equal(app.reads,0);assert.ok(!JSON.stringify(app.audit).includes(password));
});
test('Consulta exacta no devuelve registros ajenos ni descarga masiva',async()=>{
  const app=setup(),r=await app.request('consult',{doc:'TEST-A'});assert.equal(r.code,200);assert.equal(r.result.visitas.n,1);assert.ok(!JSON.stringify(r.result).includes('TEST-B'));assert.ok(!JSON.stringify(r.result).includes('Persona ficticia B'));
  for(const doc of ['*',['TEST-A','TEST-B'],{$ne:null},''])assert.equal((await app.request('consult',{doc})).code,400);
  for(const route of ['export','download','../dataset.enc'])assert.equal((await app.request(route)).code,404);
  assert.equal((await app.request('metadata')).headers['Cache-Control'],'private, no-store, max-age=0');
});
test('Dashboard calcula en servidor sin documentos, nombres ni coordenadas',()=>{
  const m=D.dashboard(dataset,filters);assert.equal(m.median,4);assert.equal(m.n,2);assert.equal(m.docs,2);assert.equal(m.pay,1);assert.equal(m.nopay,1);
  const serialized=JSON.stringify(m);for(const fragment of ['TEST-A','TEST-B','Persona ficticia','"lat"','"lon"','"doc"'])assert.ok(!serialized.includes(fragment));
  assert.equal(D.dashboard(dataset,{...filters,from:'2026-09-02'}).n,1);assert.throws(()=>D.dashboard(dataset,{...filters,from:'2026-09-02',to:'2026-01-01'}));
});
test('Límites por minuto, día y carga se aplican sin depender de RAM local',()=>{
  let q;const now=100000000;for(let i=0;i<30;i++)q=S.checkQuota(q,'consult',now);assert.throws(()=>S.checkQuota(q,'consult',now),e=>e.status===429);
  q=S.checkQuota(q,'consult',now+60000);assert.equal(q.requests,1);
  assert.throws(()=>S.checkQuota({...q,consults:300},'consult',now+60000),e=>e.status===429);
  assert.throws(()=>S.checkQuota({...q,uploads:30},'upload',now+60000),e=>e.status===429);
});
test('Storage CAS impide actualizaciones perdidas y conserva cuotas entre instancias',async()=>{
  const objects=new Map();
  const bucket={file(name,options){return {
    async getMetadata(){const v=objects.get(name);if(!v)throw {code:404};return [{generation:String(v.g)}];},
    async download(){const v=objects.get(name);assert.equal(options.generation,String(v.g));return [v.bytes];},
    async save(bytes,opts){const old=objects.get(name);if(String(opts.preconditionOpts.ifGenerationMatch)!==String(old?.g||0))throw {code:412};objects.set(name,{g:(old?.g||0)+1,bytes});}
  };}};
  const a=storageAdapter(bucket),b=storageAdapter(bucket);await a.write(Buffer.from('cipher'),0);await assert.rejects(()=>b.write(Buffer.from('lost'),0),e=>e.code===412);
  for(let i=0;i<30;i++)await (i%2?a:b).quota('uid','consult');await assert.rejects(()=>b.quota('uid','consult'),e=>e.status===429);
});
test('Falla de cuotas y fallo de almacenamiento cierran acceso',async()=>{
  const app=setup({store:{async quota(){throw Error('backend unavailable');}}});assert.equal((await app.request('consult',{doc:'TEST-A'})).code,503);assert.equal(app.reads,0);
  assert.equal((await setup({store:{async read(){throw Error('private detail');}}}).request('metadata')).result.error,'Servicio no disponible. Contacte al administrador.');
});
test('Origen ajeno, método, tamaño y content-type incorrectos se rechazan',async()=>{
  const app=setup();assert.equal((await app.request('metadata',{}, {origin:'https://evil.example'})).code,403);assert.equal((await app.request('metadata',{}, {},'GET')).code,405);assert.equal((await app.request('metadata',{}, {'content-type':'text/plain'})).code,415);assert.equal((await app.request('consult',{doc:'x'.repeat(5000)})).code,413);assert.equal(app.reads,0);
});
test('Auditoría no registra correos, documentos, tokens, contraseñas ni cuerpos',async()=>{
  const app=setup();await app.request('consult',{doc:'TEST-A'});const audit=JSON.stringify(app.audit);for(const secret of ['TEST-A','hmora@scain.co','TEST-UID','Persona ficticia'])assert.ok(!audit.includes(secret));assert.match(app.audit[0].subject,/^[a-f0-9]{64}$/);
});
test('Servidor rechaza objetos/celdas anidados y bombas gzip sin modificar datos',()=>{
  const pack=v=>({gzip:zlib.gzipSync(JSON.stringify(v)).toString('base64')});
  assert.throws(()=>D.upload(dataset,pack({name:'test.xlsx',rows:[[{admin:true}]]})),e=>e.status===400);
  assert.throws(()=>D.upload(dataset,{gzip:'invalid'}),e=>[400,413].includes(e.status));
  const bomb=zlib.gzipSync(Buffer.alloc(64*1024*1024+1,32)).toString('base64');
  assert.throws(()=>D.upload(dataset,{gzip:bomb}),e=>e.status===400);
  assert.equal(dataset.visitas.n,2);
});
test('Carga válida se cifra y no devuelve filas; falla de validación no escribe',async()=>{
  const rows=[['IDENTIFICACIÓN DEL BENEFICIARIO','GEOREFERENCIACIÓN','FECHA VISITA','RECOMENDACIÓN FINAL'],['TEST-C','CUMPLE','03/09/2026','PAGAR']];
  const gzip=zlib.gzipSync(JSON.stringify({name:'fixture.xlsx',expected:'vis',rows})).toString('base64');
  const app=setup();const result=await app.request('upload',{gzip});assert.equal(result.code,200);assert.equal(app.writes,1);assert.equal(result.result.visitas.n,1);assert.ok(!JSON.stringify(result.result).includes('TEST-C'));assert.ok(!JSON.stringify(result.result).includes('"rows"'));
  assert.equal((await app.request('upload',{gzip:'broken'})).code,400);assert.equal(app.writes,1);
  assert.equal((await setup({store:{async write(){throw {code:412};}}}).request('upload',{gzip})).code,409);
});
test('Reglas y código cliente no incluyen credenciales privadas ni caché de datos',()=>{
  const root=path.resolve(__dirname,'..');const rules=fs.readFileSync(path.join(root,'sitio_firebase/storage.rules'),'utf8');assert.match(rules,/allow read, write: if false/);
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8'),secure=fs.readFileSync(path.join(root,'src/secure.js'),'utf8');assert.ok(!app.includes('indexedDB.open'));assert.ok(!secure.includes('localStorage.setItem'));assert.ok(!secure.includes('STE_DATA_KEYS'));assert.ok(secure.includes("indexedDB.deleteDatabase('consulta-ste')"));
});
