'use strict';
// Reencripta usando STE_DATA_KEYS (keyring nuevo, con claves anteriores incluidas).
const requireAdmin=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,applicationDefault}=requireAdmin('firebase-admin/app');
const {getStorage}=requireAdmin('firebase-admin/storage');
const {encrypt,decrypt,keyring}=require('../functions/security.cjs');
const {storageAdapter}=require('../functions/store.cjs');
async function main(){
  if(process.argv[2]!=='--apply'||process.argv[3]!=='ste2026-app'||!process.env.STE_PRIVATE_BUCKET)throw Error('Requiere --apply ste2026-app, STE_PRIVATE_BUCKET y STE_DATA_KEYS.');
  const keys=keyring(process.env.STE_DATA_KEYS);delete process.env.STE_DATA_KEYS;
  initializeApp({credential:applicationDefault(),projectId:'ste2026-app'});
  const store=storageAdapter(getStorage().bucket(process.env.STE_PRIVATE_BUCKET));
  const current=await store.read();if(!current)throw Error('No existe base para rotar.');
  await store.write(encrypt(decrypt(current.bytes,keys),keys),current.generation);
  console.log('Base reencriptada con la clave activa; no se imprimieron datos.');
}
main().catch(()=>{console.error('No se pudo rotar. Verifique credenciales, keyring, bucket y ausencia de cargas concurrentes.');process.exitCode=1;});
