import {initializeApp} from 'firebase/app';
import {getAuth,inMemoryPersistence,setPersistence,signInWithEmailAndPassword,signOut,sendEmailVerification,sendPasswordResetEmail} from 'firebase/auth';
import config from './firebase-config.json';
let auth;
const ready=async()=>{
  if(!config.apiKey||config.projectId!=='ste2026-app')throw Error('Falta configurar Firebase. Consulte ACTUALIZACION-SEGURA.md.');
  if(!auth){auth=getAuth(initializeApp(config));await setPersistence(auth,inMemoryPersistence);}
  return auth;
};
window.STEAuth={
  async login(email,password){return (await signInWithEmailAndPassword(await ready(),email,password)).user;},
  async token(){if(!auth?.currentUser)throw Error('Inicie sesión.');return auth.currentUser.getIdToken();},
  async logout(){if(auth)await signOut(auth);},
  async verify(){if(auth?.currentUser)await sendEmailVerification(auth.currentUser);},
  async reset(email){await sendPasswordResetEmail(await ready(),email);},
  async refresh(){await auth.currentUser.reload();return auth.currentUser.getIdToken(true);}
};
