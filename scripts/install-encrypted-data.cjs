'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const requireAdmin=require('node:module').createRequire(path.resolve(__dirname,'../functions/package.json'));
const {initializeApp,applicationDefault}=requireAdmin('firebase-admin/app');const {getStorage}=requireAdmin('firebase-admin/storage');
const {decrypt}=require('../functions/security.cjs');const {storageAdapter}=require('../functions/store.cjs');
async function main(){
  if(process.argv[2]!=='--apply'||process.argv[3]!=='ste2026-app'||!process.env.STE_PRIVATE_BUCKET||!process.env.STE_DATA_KEYS)throw Error('Use Instalar-Migracion.ps1 -Apply.');
  const dir=path.resolve(__dirname,'../.private/migration'),bytes=fs.readFileSync(path.join(dir,'dataset.enc')),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  if(hash(bytes)!==manifest.cipherSha256)throw Error('La copia cifrada no coincide con el manifiesto.');
  decrypt(bytes,process.env.STE_DATA_KEYS);delete process.env.STE_DATA_KEYS;
  initializeApp({credential:applicationDefault(),projectId:'ste2026-app'});const store=storageAdapter(getStorage().bucket(process.env.STE_PRIVATE_BUCKET));
  const existing=await store.read();if(existing){if(hash(existing.bytes)!==hash(bytes))throw Error('Ya hay otra base en el servidor. No se sobrescribió.');console.log('La misma base cifrada ya está instalada.');return;}
  await store.write(bytes,0);console.log('Base cifrada instalada. Nunca se subió texto plano.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
