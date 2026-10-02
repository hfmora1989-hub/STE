'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');require('./verify.cjs').verify();
const dirs=['src','scripts','functions','sitio_firebase','test','test-output','licenses'];
const files=['package.json','package-lock.json','build-manifest.json','README.md','ACTUALIZACION.md','ACTUALIZACION-SEGURA.md','SEGURIDAD.md','VALIDACION.md','VALIDACION-SEGURA.md','.gitignore'];
const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{
  const rel=dir+'/'+e.name;if(e.isSymbolicLink())throw Error('No se empaquetan enlaces.');
  if(['node_modules','.private','.npm-cache'].includes(e.name)||(e.name.startsWith('.env')&&e.name!=='.env.example')||e.name.startsWith('.secret'))return [];
  return e.isDirectory()?walk(rel):[rel];
});
const entries=[...files,...dirs.flatMap(walk)];if(entries.some(p=>/\.dpapi$|\.enc$|\.key\.json$/.test(p)))throw Error('Se detectó un archivo privado.');
const list=path.join(root,'test-output/package-files.txt');fs.writeFileSync(list,entries.filter(x=>x!=='test-output/package-files.txt').join('\n')+'\n');
execFileSync('tar.exe',['-a','-cf',path.resolve(root,'../ste2026-actualizacion-local.zip'),'-T',list],{cwd:root,stdio:'inherit'});
console.log('ZIP actualizado sin base cifrada ni claves. La migración está separada en .private/migration.');
