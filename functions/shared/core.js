// Funciones compartidas por la interfaz, el importador y las pruebas.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./extract.js'));
  else root.STECore = factory(root.STE);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (STE) {
  'use strict';
  const MAX_BYTES = 50 * 1024 * 1024, MAX_ROWS = 200000;
  function parseDMY(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match.map(Number);
    if (year < 1900 || year > 9999) return null;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  function parseISO(value) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? parseDMY(`${m[3]}/${m[2]}/${m[1]}`) : null;
  }
  function dateRangeError(from, to) {
    if (from && !parseISO(from) || to && !parseISO(to)) return 'Ingrese fechas válidas.';
    if (from && to && parseISO(from) > parseISO(to)) return 'La fecha Desde debe ser anterior o igual a Hasta.';
    return '';
  }
  function median(values) {
    const sorted = values.filter(Number.isFinite).slice().sort((a,b) => a-b);
    if (!sorted.length) return null;
    const half = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[half] : (sorted[half-1] + sorted[half]) / 2;
  }
  function compareVisits(a, b) {
    const dates = (parseDMY(a.fecha)?.getTime() || 0) - (parseDMY(b.fecha)?.getTime() || 0);
    return dates || (+a.num || 0) - (+b.num || 0);
  }
  function validateFile(file) {
    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name || '')) throw new Error('Seleccione un archivo Excel (.xlsx, .xls o .xlsm).');
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_BYTES) throw new Error('El archivo debe tener contenido y no superar 50 MB.');
  }
  function readImport(rows, name, expected) {
    if (rows.length > MAX_ROWS + 15) throw new Error('El archivo supera el límite de 200.000 filas.');
    const kind = STE.detectKind(rows);
    if (!kind) throw new Error('No se reconoce el formato. Revise la primera hoja y los encabezados originales.');
    if (expected && kind !== expected) throw new Error('El archivo no corresponde al tipo seleccionado. No se reemplazó ningún dato.');
    const signatures = {liq:['CICLOABONADO','TOTAL_DIAS_A_LIQUIDAR'],vis:['IDENTIFICACIÓN DEL BENEFICIARIO','GEOREFERENCIACIÓN'],pag:['CICLO EN LIQUIDACION','ESTADO DE PAGO']};
    const headerAt = rows.slice(0,15).findIndex(r=>signatures[kind].every(h=>(r||[]).some(c=>STE.norm(c)===STE.norm(h))));
    const header = rows[headerAt].map(STE.norm);
    const required = {liq:['CICLO','NUMERO_DOCUMENTO','PAGAR - NO PAGAR'],vis:['IDENTIFICACIÓN DEL BENEFICIARIO','FECHA VISITA'],pag:['NUMERO_DOCUMENTO','KEY','CICLOABONADO','FECHA FINAL VIGENCIA BASE']};
    const missing = required[kind].filter(h=>!header.includes(STE.norm(h)));
    if (kind === 'vis' && !header.some(h=>h.startsWith(STE.norm('RECOMENDACIÓN FINAL')))) missing.push('RECOMENDACIÓN FINAL');
    if (missing.length) throw new Error('Faltan columnas obligatorias: ' + missing.join(', ') + '. Se conservaron los datos anteriores.');
    const idName = kind==='vis'?'IDENTIFICACIÓN DEL BENEFICIARIO':'NUMERO_DOCUMENTO';
    const idCols = header.flatMap((h,i)=>h===STE.norm(idName)?[i]:[]);
    const body = rows.slice(headerAt+1).filter(r=>r&&r.some(c=>c!=null&&String(c).trim()!==''));
    if (body.some(r=>!idCols.some(i=>STE.normDoc(r[i])))) throw new Error('Hay filas con contenido sin número de documento. Corrija el archivo antes de cargarlo.');
    const extracted = kind==='liq'?STE.extractLiquidacion(rows,name):kind==='vis'?STE.extractVisitas(rows):STE.extractPagos(rows);
    const records = kind==='liq'?extracted.rows:extracted;
    if (!records.length) throw new Error('No hay registros válidos. Se conservaron los datos anteriores.');
    if (records.length > MAX_ROWS) throw new Error('El archivo supera el límite de 200.000 registros.');
    if (records.some(r=>!r.doc)) throw new Error('Hay registros sin documento. Se conservaron los datos anteriores.');
    const fields = kind==='vis'?['fecha']:kind==='pag'?['fa','fi','ff','fmr','fc']:['fechaExc'];
    if (records.some(r=>fields.some(f=>r[f]&&!/^(N\/A|N\/D|#N\/A)$/i.test(r[f])&&!parseDMY(r[f])))) throw new Error('Hay fechas inválidas. Use fechas Excel o DD/MM/AAAA y revise el calendario.');
    return {kind,records,lotes:kind==='liq'?extracted.lotes:null};
  }
  function replaceLiquidation(sources, incoming) {
    const replaced = new Set(Object.keys(incoming.lotes));
    const retained = sources.flatMap(source=>{
      // Se conservan los registros de lotes no reemplazados, incluso si comparten nombre de archivo.
      const rows = STE.unpack(source.rows).filter(row=>!replaced.has(row.lote));
      if (!rows.length) return [];
      const lotes = Object.create(null);
      for (const row of rows) lotes[row.lote] = (lotes[row.lote] || 0) + 1;
      const docs = new Set(rows.map(r=>r.doc));
      // Las versiones antiguas guardaban una sola ficha por documento para varios lotes.
      // Conservar esa ficha evita perder la identidad de un registro retenido.
      const est = STE.unpack(source.est).filter(e=>docs.has(e.doc));
      return [{...source,n:rows.length,lotes,rows:STE.pack(rows,STE.LIQ_FIELDS),est:STE.pack(est,STE.EST_FIELDS)}];
    });
    return [...retained,incoming];
  }
  function csvCell(value) {
    let s=String(value==null?'':value);
    if (/^[\s]*[=+@-]/.test(s) && typeof value !== 'number') s="'"+s;
    return /[;"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }
  function qualitySummary(visits) {
    return {
      attendedNotEffective:visits.filter(v=>/^Atendida$/i.test(v.tipoVisita||'')&&!/^EFECTIVA$/i.test((v.estado||'').trim())).length,
      invalidCoordinates:visits.filter(v=>v.lat!=null&&v.lon!=null&&!(v.lat>3.5&&v.lat<5.5&&v.lon>-75&&v.lon<-73)).length,
      missingCoordinates:visits.filter(v=>v.lat==null||v.lon==null).length
    };
  }
  return {MAX_BYTES,MAX_ROWS,parseDMY,median,dateRangeError,compareVisits,validateFile,readImport,replaceLiquidation,csvCell,qualitySummary};
});
