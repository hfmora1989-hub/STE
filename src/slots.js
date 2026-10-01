function renderSources() {
  const fd = iso => { try { return iso ? new Date(iso).toLocaleString('es-CO', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—'; } catch (e) { return '—'; } };
  const st = (ok, txtOk, txtNo) => ok ? `<span class="chip ok">✓ ${txtOk}</span>` : `<span class="chip warn">! ${txtNo}</span>`;
  const srcs = [...DATA.sources].sort((a, b) => Math.min(...Object.keys(a.lotes).map(loteOrder)) - Math.min(...Object.keys(b.lotes).map(loteOrder)));
  $('#st-liq').innerHTML = st(srcs.length, srcs.length + (srcs.length === 1 ? ' archivo' : ' archivos'), 'Sin cargar');
  $('#list-liq').innerHTML = srcs.length ? `<div class="tablewrap"><table><thead><tr><th>Archivo</th><th>Lotes</th><th class="n">Registros</th><th>Cargado</th><th></th></tr></thead><tbody>${
    srcs.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${Object.entries(x.lotes).map(([k, n]) => esc(k) + ' (' + n.toLocaleString('es-CO') + ')').join('<br>')}</td>
      <td class="n">${x.n.toLocaleString('es-CO')}</td><td>${fd(x.cargado)}</td><td><button type="button" class="mini" data-rm="liq" data-name="${esc(x.name)}">Quitar</button></td></tr>`).join('')}</tbody></table></div>` :
    '<p class="none">Aún no hay liquidaciones cargadas.</p>';
  // visitas
  const v = DATA.visitas;
  let vw = '';
  if (v) {
    const f = v.rows.fields || [];
    if (!f.includes('loc')) vw += '<div class="warnline">! Cargado con una versión anterior: no tiene localidad. Vuelva a cargarlo para usar el filtro del tablero.</div>';
    else if (!f.includes('lat')) vw += '<div class="warnline">! Cargado con una versión anterior: no tiene coordenadas. Vuelva a cargarlo para ver el mapa de la vivienda.</div>';
  }
  $('#st-vis').innerHTML = st(v, v ? v.n.toLocaleString('es-CO') + ' visitas' : '', 'Sin cargar');
  $('#list-vis').innerHTML = v ? `<div class="tablewrap"><table><thead><tr><th>Archivo</th><th class="n">Visitas</th><th class="n">Beneficiarios</th><th>Cargado</th><th></th></tr></thead><tbody>
      <tr><td><b>${esc(v.name)}</b></td><td class="n">${v.n.toLocaleString('es-CO')}</td><td class="n">${VIS.size.toLocaleString('es-CO')}</td><td>${fd(v.cargado)}</td><td><button type="button" class="mini" data-rm="vis">Quitar</button></td></tr></tbody></table></div>${vw}` :
    '<p class="none">Aún no hay consolidado de visitas.</p>';
  const p = DATA.pagos;
  $('#st-pag').innerHTML = st(p, p ? p.n.toLocaleString('es-CO') + ' registros' : '', 'Sin cargar');
  $('#list-pag').innerHTML = p ? `<div class="tablewrap"><table><thead><tr><th>Archivo</th><th class="n">Registros</th><th>Cargado</th><th></th></tr></thead><tbody>
      <tr><td><b>${esc(p.name)}</b></td><td class="n">${p.n.toLocaleString('es-CO')}</td><td>${fd(p.cargado)}</td><td><button type="button" class="mini" data-rm="pag">Quitar</button></td></tr></tbody></table></div>` :
    '<p class="none">Aún no hay consolidado de pagos.</p>';
}
const log = m => { const l = $('#log'); l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; };
const tick = () => new Promise(r => setTimeout(r, 30));
const KIND_NAME = {liq: 'una liquidación', vis: 'un consolidado de visitas', pag: 'un consolidado de pagos'};

async function saveAndRefresh(msg) {
  buildIndex();
  const ok = await idbSet('data', {base: EMB_GEN, data: DATA});
  log(ok ? msg + ' Los cambios quedan guardados en este navegador.' : msg + ' (No se pudieron guardar en el navegador; se perderán al cerrar.)');
  if (currentView === 'consulta' && $('#q').value) search($('#q').value);
}

async function loadFiles(files, expected) {
  let changed = 0;
  for (const f of files) {
    try {
      log(`Leyendo ${f.name}…`); await tick();
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, {type: 'array', dense: true});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: null});
      await tick();
      const kind = STE.detectKind(rows);
      if (!kind) { log(`  ✗ ${f.name} no se reconoce: no es una liquidación, ni un consolidado de visitas, ni un consolidado de pagos. Revise que sea la primera hoja y que tenga los encabezados originales.`); continue; }
      if (expected && kind !== expected) { log(`  ✗ ${f.name} es ${KIND_NAME[kind]}, no ${KIND_NAME[expected]}. No se cargó; use la casilla correspondiente.`); continue; }
      if (kind === 'pag') {
        const pg = STE.extractPagos(rows);
        DATA.pagos = {name: f.name, n: pg.length, cargado: new Date().toISOString(), rows: STE.pack(pg, STE.PAG_FIELDS)};
        log(`  ✓ Consolidado de pagos: ${pg.length.toLocaleString('es-CO')} registros (reemplaza al anterior).`);
      } else if (kind === 'liq') {
        const res = STE.extractLiquidacion(rows, f.name);
        const estMap = new Map();
        res.rows.forEach(r => estMap.set(r.doc, Object.assign({doc: r.doc, lote: r.lote}, r.est)));
        const newLotes = Object.keys(res.lotes);
        const before = DATA.sources.length;
        DATA.sources = DATA.sources.filter(s => !Object.keys(s.lotes).some(l => newLotes.includes(l)) && s.name !== f.name);
        if (DATA.sources.length < before) log(`  Se reemplazó la versión anterior de ${newLotes.join(', ')}.`);
        DATA.sources.push({type: 'liq', name: f.name, lotes: res.lotes, n: res.rows.length, cargado: new Date().toISOString(),
          rows: STE.pack(res.rows, STE.LIQ_FIELDS), est: STE.pack([...estMap.values()], STE.EST_FIELDS)});
        log(`  ✓ Liquidación: ${res.rows.length.toLocaleString('es-CO')} registros (${newLotes.join(', ')}).`);
      } else {
        const v = STE.extractVisitas(rows);
        DATA.visitas = {name: f.name, n: v.length, cargado: new Date().toISOString(), rows: STE.pack(v, STE.VIS_FIELDS)};
        const sinXY = v.filter(x => x.lat == null || x.lon == null).length;
        log(`  ✓ Consolidado de visitas: ${v.length.toLocaleString('es-CO')} visitas (reemplaza al anterior)${sinXY ? ` · ${sinXY.toLocaleString('es-CO')} sin coordenada` : ''}.`);
      }
      changed++;
    } catch (e) { log(`  ✗ Error con ${f.name}: ${e.message}`); }
  }
  if (changed) await saveAndRefresh('Listo.');
}

async function removeData(kind, name) {
  if (kind === 'liq') DATA.sources = DATA.sources.filter(s => s.name !== name);
  if (kind === 'vis') DATA.visitas = null;
  if (kind === 'pag') DATA.pagos = null;
  await saveAndRefresh(`Se quitó ${kind === 'liq' ? name : kind === 'vis' ? 'el consolidado de visitas' : 'el consolidado de pagos'}.`);
}

