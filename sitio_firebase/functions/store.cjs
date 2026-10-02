'use strict';
const {checkQuota,fail}=require('./security.cjs');
function storageAdapter(bucket){
  async function readFile(name){
    try {
      const [meta]=await bucket.file(name).getMetadata();
      const [bytes]=await bucket.file(name,{generation:meta.generation}).download();
      return {bytes,generation:meta.generation};
    }catch(e){if(Number(e.code)===404)return null;throw e;}
  }
  async function writeFile(name,bytes,generation){
    await bucket.file(name).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:generation},metadata:{contentType:'application/octet-stream',cacheControl:'no-store'}});
  }
  return {
    read:()=>readFile('private/dataset.enc'),
    write:(bytes,generation)=>writeFile('private/dataset.enc',bytes,generation),
    async quota(uid,action){
      // CAS de objeto compartido: límites consistentes entre instancias y despliegues.
      const name='limits/'+uid+'.json';
      for(let i=0;i<5;i++){
        const old=await readFile(name);
        const next=checkQuota(old?JSON.parse(old.bytes):null,action);
        try{await writeFile(name,Buffer.from(JSON.stringify(next)),old?.generation||0);return;}
        catch(e){if(![409,412].includes(Number(e.code)))throw e;}
      }
      throw fail(429,'Hay varias solicitudes simultáneas. Espere unos segundos.');
    }
  };
}
module.exports={storageAdapter};
