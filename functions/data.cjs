'use strict';
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const STE = require('./shared/extract.js');
const Core = require('./shared/core.js');
const {fail} = require('./security.cjs');
const empty = () => ({version:2,sources:[],visitas:null,pagos:null});
function upload(data, input) {
  if (typeof input.gzip !== 'string' || input.gzip.length > 16*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.gzip)) throw fail(413,'Carga inválida o demasiado grande.');
  let file;
  try { file = JSON.parse(zlib.gunzipSync(Buffer.from(input.gzip,'base64'),{maxOutputLength:64*1024*1024}).toString()); }
  catch { throw fail(400,'El archivo comprimido es inválido o excede 64 MB.'); }
  if (!file || typeof file.name !== 'string' || file.name.length > 180 || !/\.(xlsx|xls|xlsm)$/i.test(file.name) || /[\x00-\x1f/\\]/.test(file.name) || !['liq','vis','pag',null].includes(file.expected ?? null) || !Array.isArray(file.rows) || file.rows.length > Core.MAX_ROWS+15) throw fail(400,'Formato inválido.');
  let cells = 0;
  for (const row of file.rows) {
    if (!Array.isArray(row) || row.length > 250) throw fail(400,'Columnas inválidas.');
    cells += row.length;
    if (cells > 8000000 || row.some(c => c !== null && !['string','number','boolean'].includes(typeof c) || typeof c === 'string' && c.length > 4000 || typeof c === 'number' && !Number.isFinite(c))) throw fail(400,'Celdas inválidas o excesivas.');
  }
  let p;
  try { p = Core.readImport(file.rows,file.name,file.expected); } catch(e) { throw fail(400,e.message); }
  const s = {id:crypto.randomUUID(),name:file.name,n:p.records.length,cargado:new Date().toISOString()};
  let next;
  if (p.kind === 'liq') {
    const students = new Map();
    p.records.forEach(r=>students.set(r.doc+'|'+r.lote,{...r.est,doc:r.doc,lote:r.lote}));
    Object.assign(s,{type:'liq',lotes:p.lotes,rows:STE.pack(p.records,STE.LIQ_FIELDS),est:STE.pack([...students.values()],STE.EST_FIELDS)});
    next = {...data,sources:Core.replaceLiquidation(data.sources,s)};
  } else {
    s.rows = STE.pack(p.records,p.kind==='vis'?STE.VIS_FIELDS:STE.PAG_FIELDS);
    next = {...data,[p.kind==='vis'?'visitas':'pagos']:s};
  }
  if (next.sources.length > 100 || next.sources.reduce((n,x)=>n+x.n,0)+(next.visitas?.n||0)+(next.pagos?.n||0)>600000) throw fail(413,'La base supera el límite de registros.');
  return next;
}
function metadata(data) {
  const meta=s=>s?{name:s.name,n:s.n,cargado:s.cargado,lotes:s.lotes}:null;
  return {sources:data.sources.map(meta),visitas:meta(data.visitas),pagos:meta(data.pagos)};
}
function consult(data, raw) {
  if (typeof raw !== 'string' || !/^[a-zA-Z0-9.\- ]{3,30}$/.test(raw)) throw fail(400,'Documento inválido.');
  const doc = STE.normDoc(raw), result=empty(); let count=0;
  const subset=(s,fields)=>{
    if(!s)return null;
    const rows=STE.unpack(s.rows).filter(r=>r.doc===doc); count+=rows.length;
    if(!rows.length)return null;
    return {name:s.name,n:rows.length,cargado:s.cargado,rows:STE.pack(rows,fields)};
  };
  result.sources=data.sources.flatMap(s=>{
    const part=subset(s,STE.LIQ_FIELDS);if(!part)return [];
    const rows=STE.unpack(part.rows),lotes=Object.create(null);rows.forEach(r=>lotes[r.lote]=(lotes[r.lote]||0)+1);
    return [{...part,lotes,est:STE.pack(STE.unpack(s.est).filter(r=>r.doc===doc),STE.EST_FIELDS)}];
  });
  result.visitas=subset(data.visitas,STE.VIS_FIELDS);result.pagos=subset(data.pagos,STE.PAG_FIELDS);
  if(count>2000)throw fail(413,'Demasiados registros para consulta individual; solicite revisión al administrador.');
  return result;
}
const norm=s=>{const k=String(s||'SIN DATO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();return k==='SANTAFE'?'SANTA FE':k||'SIN DATO';};
function dashboard(data, f={}) {
  if (!['vis','ben'].includes(f.unit)||!['res','col'].includes(f.by)||typeof f.loc!=='string'||f.loc.length>120||typeof f.from!=='string'||typeof f.to!=='string'||Core.dateRangeError(f.from,f.to)) throw fail(400,'Filtros inválidos.');
  let visits=data.visitas?STE.unpack(data.visitas.rows):[];
  const loc=v=>norm(f.by==='col'?v.locCol:v.loc);
  const locations=[...new Set(visits.map(loc))].sort();
  visits=visits.filter(v=>{const d=Core.parseDMY(v.fecha); const iso=d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';return (!f.from||iso&&iso>=f.from)&&(!f.to||iso&&iso<=f.to);});
  if(f.unit==='ben'){const last=new Map();for(const v of visits){const old=last.get(v.doc);if(!old||Core.compareVisits(old,v)<=0)last.set(v.doc,v);} visits=[...last.values()];}
  const group=(list,key)=>{const m=new Map();for(const v of list){const k=key(v)||'Sin dato';if(!m.has(k))m.set(k,{k,n:0,pay:0,nopay:0});const g=m.get(k);g.n++;if(/^PAGAR/i.test(v.recom||''))g.pay++;if(/^NO PAGAR/i.test(v.recom||''))g.nopay++;}return [...m.values()].sort((a,b)=>b.n-a.n);};
  const locality=group(visits,loc);
  if(f.loc)visits=visits.filter(v=>loc(v)===f.loc);
  const distances=visits.map(v=>v.distancia).filter(v=>Number.isFinite(v)&&v>=0);
  const bins=[[0,1,'< 1 km'],[1,2,'1–2 km'],[2,3,'2–3 km'],[3,4,'3–4 km'],[4,5,'4–5 km'],[5,7,'5–7 km'],[7,10,'7–10 km'],[10,Infinity,'≥ 10 km']];
  const distance=group(visits,v=>Number.isFinite(v.distancia)?bins.find(([a,b])=>v.distancia>=a&&v.distancia<b)?.[2]:'Sin dato');
  const reasons=group(visits.filter(v=>/^NO PAGAR/i.test(v.recom||'')),v=>{
    const g=String(v.georef||'').toUpperCase();return /^NO SE PUDO VERIFICAR/.test(g)?'No se pudo verificar (visita no efectiva)':/NO VIVE ALL/.test(g)?'No vive en la dirección registrada':/NO CUMPLE, DISTANCIA MENOR/.test(g)?'No cumple la distancia':'Otra causa';
  });
  return {locations,locality,distance,reasons,quality:Core.qualitySummary(visits),revisits:visits.filter(v=>Number(v.num)>=2).length,notDistance:visits.filter(v=>/NO CUMPLE, DISTANCIA MENOR/i.test(v.georef||'')).length,n:visits.length,docs:new Set(visits.map(v=>v.doc)).size,pay:visits.filter(v=>/^PAGAR/i.test(v.recom||'')).length,nopay:visits.filter(v=>/^NO PAGAR/i.test(v.recom||'')).length,effective:visits.filter(v=>/^EFECTIVA$/i.test(v.estado||'')).length,median:Core.median(distances),average:distances.length?distances.reduce((n,x)=>n+x,0)/distances.length:null,result:group(visits,v=>v.tipoVisita),origin:group(visits,v=>v.origen),week:group(visits,v=>String(v.semana||'Sin dato'))};
}
module.exports={empty,upload,metadata,consult,dashboard};
