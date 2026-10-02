'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'sitio_firebase/public');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sources=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
function build() {
  const shared=path.join(root,'functions/shared');fs.mkdirSync(shared,{recursive:true});for(const name of ['extract.js','core.js'])fs.copyFileSync(path.join(root,'src',name),path.join(shared,name));
  const auth=require('esbuild').buildSync({entryPoints:[path.join(root,'src/auth.js')],bundle:true,write:false,format:'iife',minify:true,target:'es2020'}).outputFiles[0].text;
  const files=new Map();
  const asset=(name,content)=>{const ext=path.extname(name),base=path.basename(name,ext);const target=`assets/${base}.${hash(content).slice(0,16)}${ext}`;files.set(target,Buffer.from(content));return target;};
  const xlsxVersion=require('xlsx').version;
  if(xlsxVersion!=='0.20.3')throw Error('Se requiere SheetJS 0.20.3. Ejecute npm ci.');
  const vendorXlsx=fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8').replace(/\/\/# sourceMappingURL=[^\n]*/g,'');
  const vendorLeaflet=fs.readFileSync(require.resolve('leaflet/dist/leaflet.js'),'utf8').replace(/\/\/# sourceMappingURL=[^\n]*/g,'');
  let leafletCss=fs.readFileSync(require.resolve('leaflet/dist/leaflet.css'),'utf8');
  leafletCss=leafletCss.replace(/url\((?:["']?)(images\/[^)'" ]+)(?:["']?)\)/g,(_,file)=>'url(data:image/png;base64,'+fs.readFileSync(path.join(path.dirname(require.resolve('leaflet/dist/leaflet.css')),file)).toString('base64')+')');
  const sedes=JSON.parse(sources('sedes.json'));
  if(!Object.entries(sedes).every(([key,xy])=>/^\d+$/.test(key)&&Array.isArray(xy)&&xy.length===2&&xy.every(Number.isFinite)))throw Error('El catálogo de sedes tiene contenido inesperado.');
  const scripts=[['xlsx.js',vendorXlsx],['leaflet.js',vendorLeaflet],['extract.js',sources('extract.js')],['core.js',sources('core.js')],['sedes.js','const SEDES = '+JSON.stringify(sedes)+';'],['auth.js',auth],['app.js',sources('app.js')],['secure.js',sources('secure.js')]];
  for(const [name,code] of scripts)new vm.Script(code,{filename:name});
  const tags=scripts.map(([name,code])=>`<script defer src="/${asset(name,code)}"></script>`).join('\n');
  const css=asset('styles.css',leafletCss+'\n'+sources('styles.css'));
  const html=sources('template.html').replace('<!--__STYLES__-->',`<link rel="stylesheet" href="/${css}">`).replace('<!--__SCRIPTS__-->',tags);
  if(/__DATA__|EMBEDDED_B64|<script(?![^>]*\bsrc=)/i.test(html)||html.length>150000)throw Error('La página debe ser estática, pequeña y sin datos embebidos.');
  files.set('index.html',Buffer.from(html));files.set('robots.txt',Buffer.from('User-agent: *\nDisallow: /\n'));
  const entries=[...files].map(([file,body])=>({file,bytes:body.length,sha256:hash(body)}));
  const manifestPath=path.join(root,'build-manifest.json');
  // Solo retirar archivos identificados como propios por la construcción anterior.
  if(fs.existsSync(manifestPath)){
    const previous=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    for(const entry of previous.files){
      if(files.has(entry.file))continue;
      const resolved=path.resolve(pub,entry.file);
      if(!resolved.startsWith(pub+path.sep)||!/^(assets\/[a-z]+\.[a-f0-9]{16}\.(js|css)|index\.html|robots\.txt)$/.test(entry.file))throw Error('Ruta inesperada en manifiesto anterior.');
      if(fs.existsSync(resolved)){
        if(hash(fs.readFileSync(resolved))!==entry.sha256)throw Error('Hay un artefacto anterior modificado. Revíselo antes de construir.');
        fs.unlinkSync(resolved);
      }
    }
  }
  for(const [name,body] of files){const target=path.join(pub,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);}
  fs.writeFileSync(manifestPath,JSON.stringify({schema:1,kind:'public-tool-without-beneficiary-data',versions:{xlsx:xlsxVersion,leaflet:require('leaflet/package.json').version},files:entries},null,2)+'\n');
  console.log(`Construcción web sin datos: ${entries.length} archivos, ${entries.reduce((sum,f)=>sum+f.bytes,0).toLocaleString('es-CO')} bytes.`);
  return entries;
}
if(require.main===module){build();require('./verify.cjs').verify();}
module.exports={build};
