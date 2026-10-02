'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {encrypt,decrypt}=require('../functions/security.cjs');
const STE=require('../src/extract.js');
const file=process.argv[2],dest=path.resolve(__dirname,'../.private/migration');
if(!file||!process.env.STE_DATA_KEYS)throw Error('Use Cifrar-Base-Existente.ps1 con la ruta del HTML original.');
const target=path.join(dest,'dataset.enc');if(fs.existsSync(target))throw Error('Ya existe una base cifrada; no se reemplazó.');
const html=fs.readFileSync(file,'utf8'),sourceHash=crypto.createHash('sha256').update(html).digest('hex');
const encoded=html.match(/const EMBEDDED_B64 = "([A-Za-z0-9+/=]*)"/);
if(!encoded)throw Error('No se encontró el paquete de datos original.');
const data=JSON.parse(zlib.gunzipSync(Buffer.from(encoded[1],'base64'),{maxOutputLength:96*1024*1024}));
if(!Array.isArray(data.sources)||data.sources.length>100)throw Error('Esquema inesperado.');
const counts={liquidaciones:0,visitas:0,pagos:0};
for(const source of data.sources){if(!source.rows||!source.est||source.n!==STE.unpack(source.rows).length)throw Error('Liquidación inconsistente');counts.liquidaciones+=source.n;}
for(const field of ['visitas','pagos'])if(data[field]){counts[field]=STE.unpack(data[field].rows).length;if(counts[field]!==data[field].n)throw Error('Consolidado inconsistente');}
const ciphertext=encrypt(data,process.env.STE_DATA_KEYS);
if(JSON.stringify(decrypt(ciphertext,process.env.STE_DATA_KEYS))!==JSON.stringify(data))throw Error('Falló la comprobación de integridad.');
fs.writeFileSync(target,ciphertext,{flag:'wx'});
fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({created:new Date().toISOString(),sourceSha256:sourceHash,cipherSha256:crypto.createHash('sha256').update(ciphertext).digest('hex'),bytes:ciphertext.length,counts,roundTripVerified:true},null,2));
console.log('Base cifrada AES-256-GCM y verificada: '+JSON.stringify(counts)+'. No se imprimieron registros ni claves.');
