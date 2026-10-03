'use strict';
// Visitas a IED: datos sintéticos de colegios ficticios; no se usan archivos reales.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const STE=require('../src/extract.js'),Core=require('../src/core.js'),D=require('../functions/data.cjs'),S=require('../functions/security.cjs');
const {createHandler}=require('../functions/handler.cjs');
const progHeader=['NOMBRE IED','# VISITA','ULTIMA VISITA INTERVENTORIA','CODIGO DANE','BENEFICIARIOS BASE','CODIGO LOCALIDAD','LOCALIDAD','NOMBRE SEDE','DIRECCIÓN','COORDENADA X','COORDENADA Y','RECTOR','#VISITA / #STICKER','SEMANA','FECHA_PROGRAMADA','JORNADA','EQUIPO','INTEGRANTE 1','INTEGRANTE 2','ESTADO','ACTA ENVIADA','CORREO','MES'];
const serial=d=>Math.round(Date.UTC(...d)/86400000)+25569;
const prog=[progHeader,
  ['COLEGIO FICTICIO UNO (IED)',1,serial([2025,5,5]),900000000001,40,8,'KENNEDY','UNO','KR 1 # 1 - 1',-74.14,4.61,'RECTOR FICTICIO',1,2,serial([2026,3,6]),'ÚNICA','Pareja','Integrante A','Integrante B','EFECTIVA',null,'uno@example.test','ABRIL'],
  ['COLEGIO FICTICIO DOS (IED)',2,serial([2025,6,1]),900000000002,25,7,'BOSA','DOS','CL 2 # 2 - 2',-74.19,4.62,'RECTORA FICTICIA',2,3,serial([2026,4,12]),'MAÑANA','Individual','Integrante A',null,'reprogramada',null,'dos@example.test','mayo'],
  ['COLEGIO FICTICIO UNO (IED)',2,serial([2025,5,5]),900000000001,40,8,'KENNEDY','UNO','KR 1 # 1 - 1',-74.14,4.61,'RECTOR FICTICIO',3,20,serial([2026,8,20]),'ÚNICA','Individual','Integrante B',null,'PROGRAMADA',null,'uno@example.test','SEPTIEMBRE']];
const matriz=[['Sticker','Dane','Institución educativa','Visita\nefectiva','Cantidad beneficiarios STE - Colegio FOTO','Cantidad beneficiarios STE \n(Según base de datos de la SED)','ASPECTO A VALIDAR:\nSe Identifica inconsistencia de información de datos personales',null,'ASPECTO A VALIDAR:\nRemitió el reporte en los plazos establecidos.','Se realizo entrega de documentos normativos','Observaciones','Semana'],
  [0.1,null,null,null,null,null,'SI/NO','Cuantifique Hallazgos','SI/NO','SI/NO',null,null],
  [1,900000000001,'COLEGIO FICTICIO UNO','Si',45,40,'Si',3,'S','PARCIAL','Visita sintética sin datos reales.',2],
  [2,900000000002,'COLEGIO FICTICIO DOS','NO','-','-','-','-','-','-','Reprogramada.',3]];
test('Visitas IED: se reconoce la hoja PROGRAMACION y no se confunde con otros tipos',()=>{
  assert.equal(STE.detectKind(prog),'ied');assert.equal(STE.detectKind(matriz),null);assert.ok(STE.isIEDMatriz(matriz));
  for(const kind of ['liq','vis','pag'])assert.throws(()=>Core.readImport(prog,'ied.xlsx',kind),/no corresponde/);
});
test('Visitas IED: extracción normaliza estado, mes, fechas y respuestas de la matriz',()=>{
  const p=Core.readImport(prog,'ied.xlsx','ied',matriz);
  assert.equal(p.kind,'ied');assert.equal(p.records.length,3);
  const dos=p.records.find(r=>r.sticker==='2');assert.equal(dos.estado,'REPROGRAMADA');assert.equal(dos.mes,'MAYO');assert.equal(dos.fecha,'12/05/2026');assert.equal(dos.dane,'900000000002');assert.equal(dos.lat,4.62);
  assert.equal(p.matriz.rows.length,2);assert.equal(p.matriz.labels.length,3);assert.match(p.matriz.labels[0],/^Se Identifica inconsistencia/);
  const uno=p.matriz.rows.find(r=>r.sticker==='1');assert.equal(uno.efectiva,'SI');assert.equal(uno.asp,'SI|SI|PARCIALMENTE');assert.equal(uno.hall,'3||');
  assert.equal(p.matriz.rows.find(r=>r.sticker==='2').asp,'||');
  assert.equal(Core.readImport(prog,'ied.xlsx','ied').matriz.rows.length,0);
});
test('Visitas IED: stickers repetidos, filas sin sticker, columnas faltantes y fechas imposibles se rechazan',()=>{
  assert.throws(()=>Core.readImport([...prog,prog[1]],'x.xlsx','ied'),/repetido/);
  const sinSticker=prog[2].slice();sinSticker[12]=null;sinSticker[3]=900000000009;assert.throws(()=>Core.readImport([prog[0],sinSticker],'x.xlsx','ied'),/sin número de visita/);
  assert.throws(()=>Core.readImport([progHeader.map(h=>h==='LOCALIDAD'?'OTRA':h),...prog.slice(1)],'x.xlsx','ied'),/LOCALIDAD/);
  const malaFecha=prog[1].slice();malaFecha[14]='31/02/2026';assert.throws(()=>Core.readImport([prog[0],malaFecha],'x.xlsx','ied'),/fechas inválidas/);
  assert.throws(()=>Core.readImport(prog,'x.xlsx','ied',[['otra','hoja']]),/MATRIZ/);
});
test('Visitas IED: carga cifrada reemplaza la anterior, conserva los demás datos y la API la entrega solo con sesión',async()=>{
  const keys={active:'v1',keys:{v1:crypto.randomBytes(32).toString('base64')}};
  const base={...D.empty(),pagos:{name:'pagos.xlsx',n:1,rows:STE.pack([{doc:'TEST-P'}],STE.PAG_FIELDS)}};
  let bytes=S.encrypt(base,keys),generation=1,writes=0;
  const token={uid:'TEST-UID',email:'hmora@scain.co',email_verified:true,steAccess:true,stePasswordChangeRequired:false,firebase:{sign_in_provider:'password'},auth_time:Math.floor(Date.now()/1000)};
  const handler=createHandler({keys,auditKey:'k',auth:{async verifyIdToken(t){if(t!=='.'.repeat(30))throw Error('bad');return token;}},store:{async quota(){},async read(){return {bytes,generation};},async write(b,g){assert.equal(g,generation);bytes=b;generation++;writes++;}}});
  const call=async(action,body={},auth='Bearer '+'.'.repeat(30))=>{let code=200,result;const h={authorization:auth,'content-type':'application/json'};
    await handler({path:'/api/'+action,method:'POST',body,get:k=>h[k]},{set(){return this;},status(c){code=c;return this;},json(v){result=v;return this;}});return {code,result};};
  assert.equal((await call('ied',{},'Bearer x')).code,401);
  const empty=await call('ied');assert.equal(empty.code,200);assert.equal(empty.result.n,0);assert.deepEqual(empty.result.rows,[]);
  const gzip=zlib.gzipSync(JSON.stringify({name:'Visitas_IED.xlsx',expected:'ied',rows:prog,matriz})).toString('base64');
  const up=await call('upload',{gzip});assert.equal(up.code,200);assert.equal(up.result.ied.n,3);assert.equal(up.result.ied.nm,2);assert.equal(up.result.pagos.n,1);assert.equal(writes,1);
  assert.ok(!bytes.toString().includes('FICTICIO'));
  const r=await call('ied');assert.equal(r.code,200);assert.equal(r.result.rows.length,3);assert.equal(r.result.matriz.length,2);assert.equal(r.result.labels.length,3);
  const otra=zlib.gzipSync(JSON.stringify({name:'Visitas_IED_v2.xlsx',expected:'ied',rows:prog.slice(0,2)})).toString('base64');
  await call('upload',{gzip:otra});const r2=await call('ied');assert.equal(r2.result.n,1);assert.equal(r2.result.matriz.length,0);assert.equal(r2.result.name,'Visitas_IED_v2.xlsx');
  const meta=await call('metadata');assert.equal(meta.result.ied.n,1);assert.equal(meta.result.pagos.n,1);
  const bad=zlib.gzipSync(JSON.stringify({name:'x.xlsx',expected:'ied',rows:prog,matriz:'texto'})).toString('base64');assert.equal((await call('upload',{gzip:bad})).code,400);
  const nested=zlib.gzipSync(JSON.stringify({name:'x.xlsx',expected:'ied',rows:prog,matriz:[[{a:1}]]})).toString('base64');assert.equal((await call('upload',{gzip:nested})).code,400);
  assert.equal(writes,2);
});
test('Visitas IED: una base anterior sin la categoría sigue funcionando',()=>{
  const old={version:2,sources:[],visitas:null,pagos:null};
  assert.equal(D.metadata(old).ied,null);assert.equal(D.ied(old).n,0);
});
