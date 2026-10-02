'use strict';
const {randomBytes}=require('node:crypto');
const mode=process.argv[2];
// Conectar stdout directamente a Firebase CLI; nunca publicar ni guardar en public/.
if(mode==='data')process.stdout.write(JSON.stringify({active:'v1',keys:{v1:randomBytes(32).toString('base64')}}));
else if(mode==='audit')process.stdout.write(randomBytes(32).toString('base64'));
else{console.error('Uso: generate-secret.cjs data|audit (canalice a Secret Manager)');process.exitCode=1;}
