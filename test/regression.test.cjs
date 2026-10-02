const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto');
const XLSX=require('xlsx'),STE=require('../src/extract.js'),Core=require('../src/core.js');
const {verify}=require('../scripts/verify.cjs');
const root=path.resolve(__dirname,'..');
const liqHeader=['CICLO','CICLOABONADO','TOTAL_DIAS_A_LIQUIDAR','NUMERO_DOCUMENTO','PAGAR - NO PAGAR','NOMBRE_ESTUDIANTE'];
const payHeader=['CICLO EN LIQUIDACION','ESTADO DE PAGO','NUMERO_DOCUMENTO','KEY','CICLOABONADO','FECHA FINAL VIGENCIA BASE'];
const visHeader=['IDENTIFICACIÓN DEL BENEFICIARIO','GEOREFERENCIACIÓN','FECHA VISITA','RECOMENDACIÓN FINAL','NOMBRE DEL BENEFICIARIO','LOCALIDAD RESIDENCIA','RANGO DISTANCIA RESIDENCIA - SEDE COLEGIO (Kilometros)','# VISITA'];
function file(rows,name='test.xlsx'){
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Hoja1');
  const buf=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
  return {name,size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)};
}
function source(rows,name='combined.xlsx'){
  const parsed=STE.extractLiquidacion(rows,name);
  return {name,lotes:parsed.lotes,n:parsed.rows.length,rows:STE.pack(parsed.rows,STE.LIQ_FIELDS),est:STE.pack(parsed.rows.map(r=>({...r.est,doc:r.doc,lote:r.lote})),STE.EST_FIELDS)};
}
function harness(){
  const elements=new Map();
  const document={querySelector(key){if(!elements.has(key))elements.set(key,{textContent:'',innerHTML:'',value:'',setAttribute(){},scrollHeight:0});return elements.get(key);}};
  const context=vm.createContext({STE,STECore:Core,XLSX,document,crypto,setTimeout:f=>f(),console});
  const code=fs.readFileSync(path.join(root,'src/app.js'),'utf8').split('(async function init()')[0];
  vm.runInContext(code,context);
  const run=s=>vm.runInContext(s,context,{timeout:3000});
  run("buildIndex=()=>{}; idbSet=async()=>true; DATA={sources:[],visitas:null,pagos:null}; EMB_GEN='web-v1';");
  return {context,run,elements,async load(f,kind){context.fixture=f;context.kind=kind;await run('loadFiles([fixture],kind)');}};
}
test('Mediana: vacío, unitario, impar, par y orden independiente',()=>{
  assert.equal(Core.median([]),null);assert.equal(Core.median([4]),4);assert.equal(Core.median([9,1,5]),5);assert.equal(Core.median([1,9]),5);assert.equal(Core.median([5.574,6.587]),6.0805);
});
test('Calendario estricto, bisiesto y formato completo',()=>{
  for(const bad of ['31/02/2026','29/02/2025','00/01/2026','texto 01/01/2026','2026-01-01'])assert.equal(Core.parseDMY(bad),null);
  assert.equal(Core.parseDMY('29/02/2024').getDate(),29);assert.equal(Core.parseDMY('1/10/2026').getMonth(),9);
});
test('Rango de fechas válido, abierto e invertido',()=>{
  assert.equal(Core.dateRangeError('2026-09-26','2026-09-26'),'');assert.equal(Core.dateRangeError('','2026-09-26'),'');assert.ok(Core.dateRangeError('2026-09-26','2026-04-01'));assert.ok(Core.dateRangeError('2026-02-31',''));
});
test('Última visita por fecha antes de numeración',()=>assert.ok(Core.compareVisits({fecha:'01/09/2026',num:9},{fecha:'02/09/2026',num:1})<0));
test('Reemplazo parcial conserva lote y estudiante ajenos, aun con mismo nombre',()=>{
  const old=source([liqHeader,['CICLO 1','CICLO1_2026',10,'TEST-A','PAGAR','Persona ficticia A'],['CICLO 1B','CICLO1_2026',5,'TEST-B','PAGAR','Persona ficticia B']]);
  const incoming=source([liqHeader,['CICLO 1','CICLO1_2026',12,'TEST-C','PAGAR','Persona ficticia C']]);
  const result=Core.replaceLiquidation([old],incoming);
  assert.deepEqual(result.map(s=>s.n),[1,1]);assert.equal(STE.unpack(result[0].rows)[0].doc,'TEST-B');assert.equal(STE.unpack(result[0].est)[0].nombre,'Persona ficticia B');assert.equal(old.n,2);
});
test('Importación real XLSX reemplaza parcialmente sin perder CICLO 1B',async()=>{
  const h=harness();await h.load(file([liqHeader,['CICLO 1','CICLO1_2026',10,'TEST-A','PAGAR','A'],['CICLO 1B','CICLO1_2026',5,'TEST-B','PAGAR','B']]),'liq');
  await h.load(file([liqHeader,['CICLO 1','CICLO1_2026',20,'TEST-C','PAGAR','C']]),'liq');
  assert.equal(h.run('DATA.sources.reduce((n,s)=>n+s.n,0)'),2);assert.equal(h.run("DATA.sources.some(s=>'CICLO 1B' in s.lotes)"),true);
});
test('Pagos incompletos, vacíos, erróneos o de otro tipo conservan estado anterior',async()=>{
  const h=harness();await h.load(file([payHeader,['CICLO 1','COBRADO','TEST','TEST_1','CICLO1_2026','20/10/2026']],'good.xlsx'),'pag');
  for(const rows of [[['CICLO EN LIQUIDACION','ESTADO DE PAGO'],['CICLO 1','COBRADO']],[payHeader],[['unknown']],[liqHeader,['CICLO 1','CICLO1_2026',1,'TEST','PAGAR','A']],[payHeader,['CICLO 1','COBRADO','TEST','TEST_1','CICLO1_2026','31/02/2026']]]){
    await h.load(file(rows,'bad.xlsx'),'pag');assert.equal(h.run('DATA.pagos.name'),'good.xlsx');assert.equal(h.run('DATA.pagos.n'),1);
  }
});
test('Archivos sin documento no se aceptan parcialmente',()=>assert.throws(()=>Core.readImport([liqHeader,['CICLO 1','CICLO1_2026',1,'','PAGAR','A']],'bad.xlsx','liq'),/sin número de documento/));
test('Límites y extensión se validan antes de leer',async()=>{
  const h=harness();let read=false;await h.load({name:'large.xlsx',size:Core.MAX_BYTES+1,arrayBuffer:async()=>{read=true;}},'vis');assert.equal(read,false);assert.equal(h.run('DATA.visitas'),null);
  assert.throws(()=>Core.validateFile({name:'data.csv',size:1}),/Excel/);assert.throws(()=>Core.validateFile({name:'data.xlsx',size:0}),/contenido/);
});
test('Dos cargas concurrentes se procesan en orden',async()=>{
  const h=harness();await Promise.all([h.load(file([liqHeader,['CICLO 1','CICLO1_2026',1,'TEST-A','PAGAR','A']],'a.xlsx'),'liq'),h.load(file([liqHeader,['CICLO 2','CICLO2_2026',1,'TEST-B','PAGAR','B']],'b.xlsx'),'liq')]);assert.equal(h.run('DATA.sources.length'),2);
});
test('Normalización, empaquetado y escape de contenido',()=>{
  assert.equal(STE.normDoc('1.234.567'),'1234567');const values=[{doc:'TEST',n:0,empty:null}];assert.deepEqual(STE.unpack(STE.pack(values,['doc','n','empty'])),values);assert.equal(harness().run("esc('<b>test</b>')"),'&lt;b&gt;test&lt;/b&gt;');
});
test('Exportación CSV escapa separadores y neutraliza fórmulas de texto',()=>{
  assert.equal(Core.csvCell('A;B'),'"A;B"');assert.equal(Core.csvCell('=1+1'),"'=1+1");assert.equal(Core.csvCell(-2),'-2');assert.equal(Core.csvCell('A"B'),'"A""B"');
});
test('Calidad muestra anomalías sin alterar filas',()=>{
  const rows=[{tipoVisita:'Atendida',estado:'NO EFECTIVA',lat:0,lon:0}];assert.deepEqual(Core.qualitySummary(rows),{attendedNotEffective:1,invalidCoordinates:1,missingCoordinates:0});assert.equal(rows[0].lat,0);
});
test('Arranque público es vacío y no incorpora datos privados',async()=>{
  const h=harness();const data=await h.run('decodeEmbedded()');assert.equal(data.sources.length,0);assert.equal(data.visitas,null);assert.equal(data.pagos,null);assert.equal(XLSX.version,'0.20.3');assert.equal(verify(),true);
});
test('Guardián rechaza archivos añadidos y HTML modificado',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ste-guard-'));
  try{
    fs.cpSync(path.join(root,'sitio_firebase'),path.join(temp,'sitio_firebase'),{recursive:true});fs.copyFileSync(path.join(root,'build-manifest.json'),path.join(temp,'build-manifest.json'));
    fs.writeFileSync(path.join(temp,'sitio_firebase/public/datos.xlsx'),'ficticio');assert.throws(()=>verify(temp),/no previstos/);
    fs.unlinkSync(path.join(temp,'sitio_firebase/public/datos.xlsx'));fs.appendFileSync(path.join(temp,'sitio_firebase/public/index.html'),'modificado');assert.throws(()=>verify(temp),/modificado/);
  }finally{if(!temp.startsWith(path.join(os.tmpdir(),'ste-guard-')))throw Error('Ruta temporal inesperada');fs.rmSync(temp,{recursive:true,force:true});}
});
module.exports={file,visHeader};
