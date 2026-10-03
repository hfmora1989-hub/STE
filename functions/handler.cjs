'use strict';
const S=require('./security.cjs'),D=require('./data.cjs');
// Dependencias inyectables para verificar autorización sin tocar producción.
function createHandler({auth,store,keys,auditKey,audit=()=>{}}) {
  return async(req,res)=>{
    res.set('Cache-Control','private, no-store, max-age=0');res.set('Pragma','no-cache');res.set('X-Content-Type-Options','nosniff');
    const action=String(req.path||'').replace(/^\/api\//,'');
    let user;
    try {
      if(req.method!=='POST')throw S.fail(405,'Método no permitido.');
      if(!['session','password','metadata','dashboard','consult','upload','ied'].includes(action))throw S.fail(404,'Ruta inexistente.');
      const origin=req.get('origin');
      if(origin&&!['https://ste2026-app.web.app','https://ste2026-app.firebaseapp.com'].includes(origin))throw S.fail(403,'Origen no permitido.');
      if(!/^application\/json(?:;|$)/i.test(req.get('content-type')||''))throw S.fail(415,'Se requiere JSON.');
      const limit=action==='upload'?17*1024*1024:4096;
      if((req.rawBody?.length||Buffer.byteLength(JSON.stringify(req.body||{})))>limit)throw S.fail(413,'Solicitud demasiado grande.');
      const bearer=req.get('authorization')||'';
      if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(bearer))throw S.fail(401,'Inicie sesión.');
      let token;
      try {token=await auth.verifyIdToken(bearer.slice(7),true);} catch {throw S.fail(401,'Sesión vencida o revocada. Inicie sesión de nuevo.');}
      user=S.identity(token);
      await store.quota(S.digest(auditKey,user.uid),action);
      if(action==='session')return res.json({email:user.email,upload:user.upload,verified:user.verified,mustChange:user.mustChange});
      if(action==='password'){
        if(!user.verified)throw S.fail(403,'Verifique su correo primero.');
        if(!Number.isFinite(token.auth_time)||Date.now()/1000-token.auth_time>300)throw S.fail(401,'Inicie sesión de nuevo para cambiar su contraseña.');
        S.passwordPolicy(req.body?.password);
        await auth.updateUser(user.uid,{password:req.body.password});
        const record=await auth.getUser(user.uid);
        await auth.setCustomUserClaims(user.uid,{...record.customClaims,stePasswordChangeRequired:false});
        await auth.revokeRefreshTokens(user.uid);
        audit({event:'password_changed',actor:S.digest(auditKey,user.uid)});
        return res.json({ok:true});
      }
      S.authorized(user);
      if(action==='upload'&&!user.upload)throw S.fail(403,'Sin permiso de carga.');
      const loaded=await store.read();
      const data=loaded?S.decrypt(loaded.bytes,keys):D.empty();
      let result;
      if(action==='metadata')result=D.metadata(data);
      if(action==='dashboard')result=D.dashboard(data,req.body);
      if(action==='consult')result=D.consult(data,req.body?.doc);
      if(action==='ied')result=D.ied(data);
      if(action==='upload'){
        const next=D.upload(data,req.body||{});
        await store.write(S.encrypt(next,keys),loaded?.generation||0);
        result=D.metadata(next);
      }
      audit({event:action,actor:S.digest(auditKey,user.uid),...(action==='consult'?{subject:S.digest(auditKey,String(req.body.doc))}:{})});
      return res.json(result);
    }catch(e){
      const status=e.status||([409,412].includes(Number(e.code))?409:503);
      audit({event:'denied_or_failed',action,actor:user?S.digest(auditKey,user.uid):'anonymous',status});
      if(status===429)res.set('Retry-After','60');
      return res.status(status).json({error:e.status?e.message:status===409?'La base cambió durante la carga. Vuelva a intentarlo.':'Servicio no disponible. Contacte al administrador.'});
    }
  };
}
module.exports={createHandler};
