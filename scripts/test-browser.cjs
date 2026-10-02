'use strict';
// Prueba de interfaz aislada: proveedor simulado, registros ficticios, cero red externa.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.STE_PLAYWRIGHT_PATH||'playwright');
const {createHandler}=require('../functions/handler.cjs');const S=require('../functions/security.cjs'),D=require('../functions/data.cjs');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'sitio_firebase/public'),config=require('../sitio_firebase/firebase.json');
const keys={active:'v1',keys:{v1:crypto.randomBytes(32).toString('base64')}};let bytes=S.encrypt(D.empty(),keys),generation=1,verified=false,mustChange=true;
const api=createHandler({keys,auditKey:'fixture',auth:{
  async verifyIdToken(t,revoked){assert.equal(revoked,true);if(t!=='.'.repeat(30))throw Error('bad');return {uid:'fake-user',email:'hmora@scain.co',email_verified:verified,steAccess:true,stePasswordChangeRequired:mustChange,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'password'}};},
  async updateUser(){},async getUser(){return {customClaims:{steAccess:true}};},async setCustomUserClaims(uid,c){mustChange=c.stePasswordChangeRequired;},async revokeRefreshTokens(){}
},store:{async quota(){},async read(){return {bytes,generation};},async write(b,g){assert.equal(g,generation);bytes=b;generation++;}}});
const authFixture=`window.STEAuth={login:async()=>({}),token:async()=>'.'.repeat(30),logout:async()=>{},verify:async()=>{},reset:async()=>{},refresh:async()=>{await fetch('/test/verify',{method:'POST'});}};`;
const server=http.createServer(async(req,res)=>{
  if(req.url==='/test/verify'){verified=true;res.end('{}');return;}
  if(req.url.startsWith('/api/')){
    const chunks=[];for await(const c of req)chunks.push(c);const rawBody=Buffer.concat(chunks);
    const r={path:req.url,method:req.method,rawBody,body:JSON.parse(rawBody||'{}'),get:k=>k==='origin'?'https://ste2026-app.web.app':req.headers[k]};
    const response={set(k,v){res.setHeader(k,v);return this;},status(c){res.statusCode=c;return this;},json(value){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}};
    await api(r,response);return;
  }
  for(const h of config.hosting.headers[0].headers)res.setHeader(h.key,h.value);
  if(/^\/assets\/auth\.[a-f0-9]+\.js$/.test(req.url)){res.setHeader('Content-Type','text/javascript');res.end(authFixture);return;}
  const target=path.resolve(pub,'.'+(req.url==='/'?'/index.html':req.url));
  if(!target.startsWith(pub+path.sep)||!fs.existsSync(target)){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(target));
});
async function main(){
  await new Promise(r=>server.listen(5179,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:process.env.STE_BROWSER_CHANNEL||'chrome'});let context;
  try{
    context=await browser.newContext({viewport:{width:1365,height:980}});const external=[],errors=[];
    await context.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:5179/')){external.push(route.request().url());return route.abort();}return route.continue();});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5179/');await page.locator('#loginButton').waitFor();
    assert.equal(await page.locator('#workspace').isVisible(),false);
    await page.screenshot({path:path.join(root,'test-output/acceso-seguro.png'),fullPage:true});
    const login=async()=>{await page.locator('#email').fill('hmora@scain.co');await page.locator('#password').fill('Inicial-ficticia123!');await page.locator('#loginButton').click();};
    await login();await page.locator('#verifyEmail').waitFor();assert.equal(await page.locator('#workspace').isVisible(),false);
    await page.locator('#refreshEmail').click();await page.locator('#newPassword').waitFor();assert.equal(await page.locator('#workspace').isVisible(),false);
    await page.locator('#newPassword').fill('Nueva-Ficticia123!');await page.locator('#confirmPassword').fill('Nueva-Ficticia123!');await page.locator('#passwordForm button').click();await page.locator('#loginButton').waitFor();
    await login();await page.locator('#workspace').waitFor();
    await page.locator('#btnDatos').click();await page.locator('input[data-kind=vis]').setInputFiles(path.join(root,'test-output/VISITAS_FICTICIAS.xlsx'));
    await page.locator('#log').filter({hasText:'guardado cifrado'}).waitFor();assert.ok(!bytes.includes('FICTICIO'));assert.equal(D.metadata(S.decrypt(bytes,keys)).visitas.n,4);
    await page.locator('#dlgClose').click();await page.locator('button[data-view=tablero]').click();await page.locator('#fNote').filter({hasText:'4 visitas'}).waitFor();
    assert.ok((await page.locator('#dash').innerText()).includes('4 km'));
    await page.screenshot({path:path.join(root,'test-output/tablero-seguro.png'),fullPage:true});
    const doc=require('../src/extract.js').unpack(S.decrypt(bytes,keys).visitas.rows)[0].doc;
    await page.locator('button[data-view=consulta]').click();await page.locator('#q').fill(doc);await page.locator('#form button').click();await page.locator('#out .who').waitFor();
    assert.ok((await page.locator('#out').innerText()).includes(doc));
    await page.locator('#logout').click();assert.equal(await page.locator('#out').textContent(),'');assert.equal(await page.locator('#workspace').isVisible(),false);
    // Otro navegador recibe la misma base tras autenticarse; no depende de IndexedDB.
    const second=await context.newPage();await second.goto('http://127.0.0.1:5179/');await second.locator('#email').fill('hmora@scain.co');await second.locator('#password').fill('Nueva-Ficticia123!');await second.locator('#loginButton').click();await second.locator('#dataStatus').filter({hasText:'4 visitas'}).waitFor();
    await second.reload();assert.equal(await second.locator('#workspace').isVisible(),false);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('Interfaz OK: acceso, verificación, cambio inicial, carga cifrada, tablero, consulta, sesión en memoria, base compartida y logout. Solo datos ficticios; proveedor simulado.');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;server.close();});
