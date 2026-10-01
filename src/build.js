// Construye el paquete de datos embebido a partir de los Excel del proyecto.
const XLSX = require('xlsx');
const fs = require('fs');
const zlib = require('zlib');
const STE = require('./extract.js');

const DIR = '/tmp/w/';
const liqFiles = ['CICLO1_1B.xlsx', 'CICLO2.xlsx', 'CICLO3.xlsx'];
const visFile = '26._20260927ConsolidadoVisitasDomiciliarias.xlsx';
const visName = '26. 20260927ConsolidadoVisitasDomiciliarias.xlsx';

function readRows(path) {
  const wb = XLSX.readFile(path, { cellDates: false, dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

function sourceFromLiq(name, res) {
  const estMap = new Map();
  res.rows.forEach(r => { const e = Object.assign({ doc: r.doc, lote: r.lote }, r.est); estMap.set(r.doc, e); });
  return {
    type: 'liq', name, lotes: res.lotes, n: res.rows.length, cargado: new Date().toISOString(),
    rows: STE.pack(res.rows, STE.LIQ_FIELDS), est: STE.pack([...estMap.values()], STE.EST_FIELDS)
  };
}

const data = { version: 1, generado: new Date().toISOString(), sources: [], visitas: null };
for (const f of liqFiles) {
  const t = Date.now();
  const rows = readRows(DIR + f);
  const res = STE.extractLiquidacion(rows, f);
  data.sources.push(sourceFromLiq(f, res));
  console.log(f, res.rows.length, res.lotes, (Date.now() - t) + 'ms');
}
{
  const rows = readRows(DIR + visFile);
  const v = STE.extractVisitas(rows);
  data.visitas = { name: visName, n: v.length, cargado: new Date().toISOString(), rows: STE.pack(v, STE.VIS_FIELDS) };
  console.log('visitas', v.length);
}
{
  const rows = readRows('/tmp/w/pagos.xlsx');
  const pg = STE.extractPagos(rows);
  data.pagos = { name: 'Consolidado_Pagos_20260924.xlsx', n: pg.length, cargado: new Date().toISOString(), rows: STE.pack(pg, STE.PAG_FIELDS) };
  console.log('pagos', pg.length, pg.slice(0,2));
}
const json = JSON.stringify(data);
const gz = zlib.gzipSync(Buffer.from(json), { level: 9 });
fs.writeFileSync('data.b64', gz.toString('base64'));
console.log('json MB', (json.length / 1e6).toFixed(1), 'gz MB', (gz.length / 1e6).toFixed(2));
