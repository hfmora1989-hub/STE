'use strict';
// Solo se ejecuta manualmente. Nunca se importa desde la aplicación.
const requireAdmin=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,applicationDefault}=requireAdmin('firebase-admin/app');
const {getAuth}=requireAdmin('firebase-admin/auth');
const access=require('../functions/access.json');
async function main(){
  if(process.argv[2]!=='--apply'||process.argv[3]!=='ste2026-app')throw Error('Uso: node scripts/provision-users.cjs --apply ste2026-app');
  const password=process.env.STE_INITIAL_PASSWORD;delete process.env.STE_INITIAL_PASSWORD;
  if(!password||password.length<12)throw Error('Falta contraseña inicial de al menos 12 caracteres. Use Crear-Usuarios.ps1.');
  const auth=getAuth(initializeApp({credential:applicationDefault(),projectId:'ste2026-app'}));
  const pending=[];
  // Revisión completa antes de escribir: no reasigna cuentas preexistentes ajenas.
  for(const email of Object.keys(access)){
    try{
      const u=await auth.getUserByEmail(email);
      if(u.customClaims?.steAccess!==true)throw Error('Ya existe una cuenta no provisionada por este proyecto: '+email+'. Revísela manualmente; no se ha modificado.');
      console.log('Ya provisionado (contraseña conservada): '+email);
    }catch(e){if(e.code==='auth/user-not-found')pending.push(email);else throw e;}
  }
  for(const email of pending){
    const u=await auth.createUser({email,password,emailVerified:false,disabled:false});
    await auth.setCustomUserClaims(u.uid,{steAccess:true,stePasswordChangeRequired:true});
    console.log('Creado: '+email+' (requiere verificar correo y cambiar contraseña)');
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
