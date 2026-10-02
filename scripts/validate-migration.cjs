'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {decrypt}=require('../functions/security.cjs'),D=require('../functions/data.cjs'),STE=require('../src/extract.js');
const bytes=fs.readFileSync(path.resolve(__dirname,'../.private/migration/dataset.enc'));
const started=performance.now(),data=decrypt(bytes,process.env.STE_DATA_KEYS);delete process.env.STE_DATA_KEYS;
const dashboard=D.dashboard(data,{unit:'vis',by:'res',loc:'',from:'',to:''});assert.equal(dashboard.n,data.visitas.n);
const first=STE.unpack(data.sources[0].rows)[0].doc,record=D.consult(data,first);
for(const s of record.sources){assert.ok(STE.unpack(s.rows).every(r=>r.doc===first));assert.ok(STE.unpack(s.est).every(r=>r.doc===first));}
assert.ok(!JSON.stringify(dashboard).includes('"doc":'));assert.ok(record.sources.length>0);
const result={encryptedBytes:bytes.length,cipherSha256:crypto.createHash('sha256').update(bytes).digest('hex'),counts:{liquidaciones:data.sources.reduce((n,s)=>n+s.n,0),visitas:data.visitas.n,pagos:data.pagos.n},dashboardAndSingleRecordVerified:true,elapsedMs:Math.round(performance.now()-started)};
fs.writeFileSync(path.resolve(__dirname,'../test-output/migration-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
