// Pestaña «Visitas IED»: programación y resultado de las visitas de verificación a los colegios.
// Usa solo información institucional (colegio, fecha, equipo, aspectos validados); no hay registros de beneficiarios.
const IEDS = {data: null, token: 0, loading: false, f: {loc: '', mes: '', est: '', int: '', q: ''}, open: new Set(), shown: 150};
let IED_MAP = null;
let iedFetch = null; // secure.js lo conecta con la API privada
const IED_MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const IED_EST = [
  ['EFECTIVA', 'Efectiva', 'ef'], ['PROGRAMADA', 'Programada (pendiente)', 'pr'],
  ['REPROGRAMADA', 'Reprogramada', 're'], ['NO EFECTIVA', 'No efectiva', 'ne']
];
const iedEstInfo = e => IED_EST.find(x => x[0] === e) || [e || 'SIN DATO', e ? titleCase(e) : 'Sin dato', 'ot'];
const IED_ANS = [['SI', 'Sí'], ['NO', 'No'], ['PARCIALMENTE', 'Parcial'], ['NO APLICA', 'No aplica'], ['', 'Sin dato'], ['OTRO', 'Otro']];

function iedReset() {
  IEDS.token++; IEDS.data = null; IEDS.loading = false; IEDS.open.clear(); IEDS.shown = 150;
  Object.assign(IEDS.f, {loc: '', mes: '', est: '', int: '', q: ''});
  if (IED_MAP) { IED_MAP.remove(); IED_MAP = null; }
  const out = document.getElementById('iedOut'); if (out) out.textContent = '';
  ['#iLoc', '#iMes', '#iEst', '#iInt', '#iQ'].forEach(s => { const el = $(s); if (el) el.value = ''; });
}

// Une la programación con la matriz de resultados por número de visita (sticker).
function iedPrepare(raw) {
  const det = new Map(raw.matriz.map(m => [m.sticker, m]));
  const prog = new Set(raw.rows.map(r => r.sticker));
  const rows = raw.rows.map(r => {
    const m = det.get(r.sticker) || null;
    const d = parseDMY(r.fecha);
    return {...r, m, t: d ? d.getTime() : null, nv: Number(r.numVisita) || null,
      equipoTxt: [r.int1, r.int2].filter(Boolean).join(' y ') || r.equipo || '—'};
  });
  const quality = {
    sinProg: raw.matriz.filter(m => !prog.has(m.sticker)).length,
    daneDistinto: rows.filter(r => r.m && r.m.dane && r.m.dane !== r.dane).length,
    sinCoord: new Set(rows.filter(r => !iedXY(r)).map(r => r.dane)).size,
    efSinMatriz: rows.filter(r => r.estado === 'EFECTIVA' && !r.m).length
  };
  return {name: raw.name, cargado: raw.cargado, labels: raw.labels || [], rows, quality};
}
const iedXY = r => r.lat != null && r.lon != null && r.lat > 3.5 && r.lat < 5.5 && r.lon > -75 && r.lon < -73;

function iedFiltered(except) {
  const f = IEDS.f, key = v => STE.norm(v).replace(/[^A-Z0-9]/g, ''), q = key(f.q);
  return IEDS.data.rows.filter(r =>
    (except === 'loc' || !f.loc || r.loc === f.loc) &&
    (except === 'mes' || !f.mes || r.mes === f.mes) &&
    (except === 'est' || !f.est || r.estado === f.est) &&
    (except === 'int' || !f.int || r.int1 === f.int || r.int2 === f.int) &&
    (!q || key(r.ied + ' ' + r.sede).includes(q) || r.dane.includes(q) || r.sticker === q));
}

function iedFillSelect(sel, values, label, current) {
  const el = $(sel); if (!el) return;
  el.innerHTML = `<option value="">${esc(label)}</option>` + values.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  el.value = values.some(([v]) => v === current) ? current : '';
}
function iedFilters() {
  const rows = IEDS.data.rows, count = (key) => { const m = new Map(); rows.forEach(r => { const k = key(r); if (k) m.set(k, (m.get(k) || 0) + 1); }); return m; };
  const locs = [...count(r => r.loc)].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  iedFillSelect('#iLoc', locs.map(([k, n]) => [k, `${titleCase(k)} (${fmtN(n)})`]), 'Todas las localidades', IEDS.f.loc);
  const meses = [...count(r => r.mes)].sort((a, b) => iedMonth(a[0]) - iedMonth(b[0]));
  iedFillSelect('#iMes', meses.map(([k, n]) => [k, `${titleCase(k)} (${fmtN(n)})`]), 'Todos los meses', IEDS.f.mes);
  const ests = [...count(r => r.estado)].sort((a, b) => iedEstOrder(a[0]) - iedEstOrder(b[0]));
  iedFillSelect('#iEst', ests.map(([k, n]) => [k, `${iedEstInfo(k)[1]} (${fmtN(n)})`]), 'Todos los estados', IEDS.f.est);
  const people = new Map(); rows.forEach(r => [r.int1, r.int2].filter(Boolean).forEach(p => people.set(p, (people.get(p) || 0) + 1)));
  iedFillSelect('#iInt', [...people].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([k, n]) => [k, `${k} (${fmtN(n)})`]), 'Todo el equipo', IEDS.f.int);
}
const iedMonth = m => { const i = IED_MESES.indexOf(m); return i < 0 ? 99 : i; };
const iedEstOrder = e => { const i = IED_EST.findIndex(x => x[0] === e); return i < 0 ? 99 : i; };

// Barras horizontales apiladas por estado de la visita.
function iedGroups(list, keyFn) {
  const m = new Map();
  for (const r of list) for (const k of [].concat(keyFn(r)).filter(Boolean)) {
    let g = m.get(k); if (!g) m.set(k, g = {k, n: 0, by: {}}); g.n++; g.by[r.estado] = (g.by[r.estado] || 0) + 1;
  }
  return [...m.values()];
}
function iedBars(groups, opts = {}) {
  if (!groups.length) return '<div class="empty">Sin visitas para los filtros elegidos.</div>';
  const max = Math.max(1, ...groups.map(g => g.n));
  const rows = groups.map(g => {
    const lab = opts.label ? opts.label(g.k) : g.k;
    const parts = Object.entries(g.by).sort((a, b) => iedEstOrder(a[0]) - iedEstOrder(b[0]));
    const segs = parts.map(([e, n]) => `<div class="seg-b st-${iedEstInfo(e)[2]}" style="width:calc(${100 * n / max}% - 1px)"></div>`).join('');
    const ef = g.by.EFECTIVA || 0, tip = `<b>${esc(lab)}</b><br>${fmtN(g.n)} visitas` + parts.map(([e, n]) => `<br>${esc(iedEstInfo(e)[1])}: ${fmtN(n)} (${pct(n, g.n)})`).join('');
    const cls = opts.sel ? (opts.sel === g.k ? ' sel' : ' dim') : '';
    return `<div class="row${cls}" data-tip="${esc(tip)}"${opts.filter ? ` data-ifilter="${esc(opts.filter)}" data-ival="${esc(g.k)}"` : ''}>
      <div class="lab" title="${esc(lab)}">${esc(lab)}</div><div class="track">${segs}</div><div class="val">${fmtN(g.n)} <small>· ${g.n - (g.by.PROGRAMADA || 0) ? pct(ef, g.n - (g.by.PROGRAMADA || 0)) + ' efectivas' : 'pendientes'}</small></div></div>`;
  }).join('');
  return `<div class="hb${opts.filter ? ' click' : ''}">${rows}</div>`;
}
const IED_LEGEND = `<div class="legend">${IED_EST.map(([, t, c]) => `<span><i class="st-${c}"></i>${esc(t)}</span>`).join('')}</div>`;

function iedKpis(list) {
  const by = e => list.filter(r => r.estado === e).length;
  const ef = by('EFECTIVA'), pr = by('PROGRAMADA'), re = by('REPROGRAMADA'), ne = by('NO EFECTIVA');
  const cerradas = ef + re + ne;
  const ieds = new Map(); list.forEach(r => ieds.set(r.dane, Math.max(ieds.get(r.dane) || 0, r.benef || 0)));
  const benef = [...ieds.values()].reduce((t, n) => t + n, 0);
  const seg = list.filter(r => r.nv >= 2).length;
  const cards = [
    ['Visitas programadas', fmtN(list.length), `${fmtN(ieds.size)} colegios (DANE) distintos`, ''],
    ['Efectivas', fmtN(ef), `${pct(ef, cerradas)} de las visitas con fecha cumplida`, 'k-ok'],
    ['Pendientes', fmtN(pr), 'estado PROGRAMADA', ''],
    ['Reprogramadas', fmtN(re), pct(re, list.length) + ' del total', ''],
    ['No efectivas', fmtN(ne), pct(ne, list.length) + ' del total', ne ? 'k-bad' : ''],
    ['Beneficiarios base', fmtN(benef), 'suma por colegio en la programación', ''],
    ['Segundas visitas', fmtN(seg), '# VISITA igual o mayor a 2', '']
  ];
  return `<div class="kpis dk">${cards.map(([k, v, s, c]) => `<div class="kpi ${c}"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s">${esc(s)}</div></div>`).join('')}</div>`;
}

// Aspectos validados en la matriz, solo para visitas efectivas con resultado registrado.
function iedAspects(list) {
  const labels = IEDS.data.labels;
  const det = list.filter(r => r.m && r.estado === 'EFECTIVA');
  if (!labels.length) return `<section class="card wide"><h2>Aspectos validados en la visita</h2><div class="empty">El archivo cargado no incluye la hoja MATRIZ.</div></section>`;
  if (!det.length) return `<section class="card wide"><h2>Aspectos validados en la visita</h2><div class="empty">No hay visitas efectivas con resultado registrado para los filtros elegidos.</div></section>`;
  const rows = labels.map((label, i) => {
    const c = {}; let hall = 0, hasHall = false;
    for (const r of det) {
      const a = (r.m.asp || '').split('|')[i] || ''; c[a] = (c[a] || 0) + 1;
      const h = Number((r.m.hall || '').split('|')[i]); if ((r.m.hall || '').split('|')[i] !== '' && Number.isFinite(h)) { hall += h; hasHall = true; }
    }
    const base = (c.SI || 0) + (c.NO || 0) + (c.PARCIALMENTE || 0);
    return {label, c, hall: hasHall ? hall : null, base, si: base ? (c.SI || 0) / base : null};
  });
  const bar = x => x == null ? '—' : `<div class="pbar" title="${esc(pct(x, 1))}"><i style="width:${(100 * x).toFixed(1)}%"></i></div><small>${pct(x, 1)}</small>`;
  const body = rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td class="asp" title="${esc(r.label)}">${esc(r.label)}</td>
    ${IED_ANS.slice(0, 5).map(([k]) => `<td class="n">${fmtN(r.c[k] || 0)}</td>`).join('')}<td class="pcell">${bar(r.si)}</td><td class="n">${r.hall == null ? '—' : fmtN(r.hall)}</td></tr>`).join('');
  const foto = det.reduce((t, r) => t + (r.m.benFoto || 0), 0), sed = det.reduce((t, r) => t + (r.m.benSed || 0), 0);
  return `<section class="card wide"><h2>Aspectos validados en la visita <span class="count">${fmtN(det.length)} visitas efectivas con resultado</span></h2>
    <p class="sub2">Lea cada aspecto según su redacción: en los tres primeros, «Sí» significa que <b>se encontró</b> inconsistencia. El porcentaje de «Sí» se calcula sobre Sí + No + Parcial (excluye No aplica y Sin dato). Beneficiarios en los listados de los colegios: <b>${fmtN(foto)}</b> · en la base de la SED: <b>${fmtN(sed)}</b>.</p>
    <div class="tablewrap"><table class="asp-t"><thead><tr><th class="n">#</th><th>Aspecto</th>${IED_ANS.slice(0, 5).map(([, t]) => `<th class="n">${t}</th>`).join('')}<th>% Sí</th><th class="n">Hallazgos</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function iedTable(list) {
  const sorted = list.slice().sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || Number(a.sticker) - Number(b.sticker));
  const shown = sorted.slice(0, IEDS.shown);
  const body = shown.map(r => {
    const [, estTxt, estCls] = iedEstInfo(r.estado);
    const open = IEDS.open.has(r.sticker);
    return `<tr class="main" data-sticker="${esc(r.sticker)}" title="Clic para ver el detalle"><td class="n">${esc(r.sticker)}</td><td>${esc(r.fecha || '—')}</td><td class="n">${esc(r.semana || '—')}</td>
      <td><b>${esc(r.ied)}</b>${r.sede && STE.norm(r.sede) !== STE.norm(r.ied) ? `<div class="more">${esc(r.sede)}</div>` : ''}<div class="more">DANE ${esc(r.dane)}</div></td>
      <td>${esc(titleCase(r.loc || 'SIN DATO'))}</td><td class="n">${esc(r.numVisita || '—')}</td><td>${esc(r.equipoTxt)}</td>
      <td><span class="chip st-chip-${estCls}">${esc(estTxt)}</span></td><td class="n">${r.benef == null ? '—' : fmtN(r.benef)}</td></tr>
      <tr class="det"${open ? '' : ' hidden'}><td colspan="9">${open ? iedDetail(r) : ''}</td></tr>`;
  }).join('');
  const more = sorted.length > shown.length ? `<div class="row-actions"><button type="button" id="iMore">Mostrar ${fmtN(Math.min(150, sorted.length - shown.length))} más (${fmtN(sorted.length - shown.length)} restantes)</button></div>` : '';
  return `<section class="card wide"><h2>Visitas programadas <span class="count">${fmtN(list.length)} visitas · orden por fecha programada</span>
      <button type="button" class="mini" id="iCsv" style="margin-left:auto">Descargar CSV</button></h2>
    <div class="tablewrap"><table class="ied-t"><thead><tr><th class="n">Sticker</th><th>Fecha</th><th class="n">Sem.</th><th>Colegio</th><th>Localidad</th><th class="n">Visita</th><th>Equipo</th><th>Estado</th><th class="n">Benef. base</th></tr></thead>
    <tbody>${body || '<tr><td colspan="9" class="empty">Sin visitas para los filtros elegidos.</td></tr>'}</tbody></table></div>${more}</section>`;
}
function iedDetail(r) {
  const facts = [['Dirección', r.dir], ['Jornada', r.jornada], ['Rector(a)', r.rector], ['Correo', r.correo],
    ['Última visita de interventoría', r.ultInterv], ['Mes programado', r.mes ? titleCase(r.mes) : ''], ['Acta enviada', r.acta]]
    .filter(([, v]) => v).map(([k, v]) => `<div><span>${esc(k)}:</span> ${esc(v)}</div>`).join('');
  if (!r.m) return `<div class="dl">${facts}</div><div class="hint" style="margin:8px 0 0">${r.estado === 'EFECTIVA' ? 'La visita figura como efectiva, pero no tiene resultado en la hoja MATRIZ.' : 'Sin resultado registrado en la hoja MATRIZ.'}</div>`;
  const asp = (r.m.asp || '').split('|'), hall = (r.m.hall || '').split('|');
  const items = IEDS.data.labels.map((l, i) => [l, asp[i] || '', hall[i] || '']).filter(([, a]) => a)
    .map(([l, a, h]) => `<li><span class="chip info">${esc((IED_ANS.find(x => x[0] === a) || [a, a])[1])}</span> ${esc(l)}${h && h !== '0' ? ` <b>· ${esc(h)} hallazgo(s)</b>` : ''}</li>`).join('');
  return `<div class="dl">${facts}<div><span>Visita efectiva (matriz):</span> ${esc(r.m.efectiva || '—')}</div>
    <div><span>Beneficiarios listado IED / base SED:</span> ${r.m.benFoto == null ? '—' : fmtN(r.m.benFoto)} / ${r.m.benSed == null ? '—' : fmtN(r.m.benSed)}</div></div>
    ${items ? `<ul class="asp-l">${items}</ul>` : ''}
    <div class="text"><div class="k">Observaciones</div><div>${esc(r.m.obs || '—')}</div></div>`;
}

function iedMapCard(list) {
  const pts = new Map();
  for (const r of list) if (iedXY(r)) { let p = pts.get(r.dane); if (!p) pts.set(r.dane, p = {r, visits: []}); p.visits.push(r); }
  if (!pts.size) return `<section class="card wide"><h2>Mapa de colegios</h2><div class="empty">Las visitas filtradas no tienen coordenadas.</div></section>`;
  return `<section class="card wide"><h2>Mapa de colegios <span class="count">${fmtN(pts.size)} colegios · color según la visita más reciente</span></h2>
    <div class="maptools"><div class="maplegend">${IED_EST.map(([, t, c]) => `<span><i class="st-${c}" style="border-radius:50%"></i>${esc(t)}</span>`).join('')}</div></div>
    <div class="mapwrap"><div id="iedMap" role="img" aria-label="Mapa de colegios con visitas programadas"></div></div></section>`;
}
function iedInitMap(list) {
  if (IED_MAP) { IED_MAP.remove(); IED_MAP = null; }
  const el = document.getElementById('iedMap'); if (!el || typeof L === 'undefined') return;
  const pts = new Map();
  for (const r of list) if (iedXY(r)) { let p = pts.get(r.dane); if (!p) pts.set(r.dane, p = []); p.push(r); }
  IED_MAP = L.map(el, {zoomControl: true, attributionControl: true, scrollWheelZoom: false});
  IED_MAP.attributionControl.setPrefix(false);
  L.tileLayer(TILE_BASE + 'mapa_base_3857/MapServer/tile/{z}/{y}/{x}', {maxZoom: 20, maxNativeZoom: 19, attribution: 'Mapas Bogotá · IDECA', referrerPolicy: 'no-referrer'}).addTo(IED_MAP);
  const bounds = [];
  for (const visits of pts.values()) {
    visits.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    const last = visits[visits.length - 1];
    L.circleMarker([last.lat, last.lon], {radius: 7, weight: 2, color: '#fff', fillOpacity: .95, className: 'iedpt st-' + iedEstInfo(last.estado)[2]})
      .addTo(IED_MAP).bindPopup(`<b>${esc(last.ied)}</b><br>${esc(last.sede || '')}<br>${esc(last.dir || '')} · ${esc(titleCase(last.loc || ''))}<br>DANE ${esc(last.dane)}` +
        visits.map(v => `<br>Visita ${esc(v.sticker)} · ${esc(v.fecha || '—')} · ${esc(iedEstInfo(v.estado)[1])}`).join(''));
    bounds.push([last.lat, last.lon]);
  }
  if (bounds.length > 1) IED_MAP.fitBounds(bounds, {padding: [30, 30], maxZoom: 16}); else IED_MAP.setView(bounds[0], 16);
}

function iedQualityNote() {
  const q = IEDS.data.quality, parts = [];
  if (q.sinProg) parts.push(`${fmtN(q.sinProg)} resultado(s) de la MATRIZ con sticker que no está en la programación`);
  if (q.daneDistinto) parts.push(`${fmtN(q.daneDistinto)} visita(s) con código DANE distinto entre PROGRAMACION y MATRIZ (se usa el de la programación)`);
  if (q.efSinMatriz) parts.push(`${fmtN(q.efSinMatriz)} visita(s) efectivas sin resultado en la MATRIZ`);
  if (q.sinCoord) parts.push(`${fmtN(q.sinCoord)} colegio(s) sin coordenada válida`);
  return parts.length ? `<p class="hint">Revisar en origen: ${parts.join('; ')}. Los registros no se han alterado.</p>` : '';
}

function iedRender() {
  const out = $('#iedOut'); if (!out || !IEDS.data) return;
  iedFilters();
  const list = iedFiltered();
  const f = IEDS.f, active = [f.loc && titleCase(f.loc), f.mes && titleCase(f.mes), f.est && iedEstInfo(f.est)[1], f.int, f.q && `«${f.q}»`].filter(Boolean);
  $('#iNote').textContent = `${fmtN(list.length)} de ${fmtN(IEDS.data.rows.length)} visitas · ${active.length ? active.join(' · ') : 'sin filtros'} · archivo ${IEDS.data.name}${IEDS.data.cargado ? ' (cargado ' + String(IEDS.data.cargado).slice(0, 10) + ')' : ''}`;
  const byLoc = iedGroups(iedFiltered('loc'), r => r.loc || 'SIN DATO').sort((a, b) => b.n - a.n);
  const byMes = iedGroups(iedFiltered('mes'), r => r.mes || 'SIN DATO').sort((a, b) => iedMonth(a.k) - iedMonth(b.k));
  const byInt = iedGroups(iedFiltered('int'), r => [r.int1, r.int2]).sort((a, b) => b.n - a.n);
  const bySem = iedGroups(list, r => r.semana ? 'Semana ' + r.semana : 'Sin dato').sort((a, b) => (parseInt(a.k.replace(/\D/g, '')) || 999) - (parseInt(b.k.replace(/\D/g, '')) || 999));
  const card = (title, body, sub) => `<section class="card"><h2>${esc(title)}</h2>${sub ? `<p class="sub2">${esc(sub)}</p>` : ''}${IED_LEGEND}${body}</section>`;
  out.innerHTML = iedKpis(list) + '<div class="dash-grid">' +
    card('Por localidad', iedBars(byLoc, {label: titleCase, filter: 'loc', sel: f.loc}), 'Clic en una localidad para filtrar.') +
    card('Por mes programado', iedBars(byMes, {label: titleCase, filter: 'mes', sel: f.mes}), 'Clic en un mes para filtrar.') +
    card('Por integrante del equipo', iedBars(byInt, {filter: 'int', sel: f.int}), 'Una visita en pareja cuenta para ambos integrantes.') +
    card('Por semana del cronograma', iedBars(bySem)) +
    iedMapCard(list) + iedAspects(list) + iedTable(list) + '</div>' + iedQualityNote();
  iedInitMap(list);
}

async function renderIED(force) {
  const out = $('#iedOut'); if (!out) return;
  if (IEDS.data && !force) { iedRender(); return; }
  if (!iedFetch) { out.innerHTML = '<div class="msg">Inicie sesión para ver las visitas a IED.</div>'; return; }
  if (IEDS.loading && !force) return;
  const token = ++IEDS.token; IEDS.loading = true;
  out.textContent = 'Consultando visitas a IED…';
  try {
    const raw = await iedFetch();
    if (token !== IEDS.token) return;
    if (!raw || !raw.rows || !raw.rows.length) {
      IEDS.data = null;
      out.innerHTML = '<div class="msg">Aún no se han cargado visitas a IED. Use <b>Datos cargados / actualizar</b> y cargue el archivo Visitas_IED (casilla 4).</div>';
      $('#iNote').textContent = ''; return;
    }
    IEDS.data = iedPrepare(raw); IEDS.open.clear(); IEDS.shown = 150;
    iedRender();
  } catch (err) { if (token === IEDS.token) out.textContent = err.message; }
  finally { if (token === IEDS.token) IEDS.loading = false; }
}

function iedCsv() {
  if (!IEDS.data) return;
  const labels = IEDS.data.labels;
  const head = ['Sticker', 'Fecha programada', 'Semana', 'Mes', 'Colegio', 'Sede', 'DANE', 'Localidad', 'Dirección', 'Jornada', 'Visita #', 'Equipo', 'Integrante 1', 'Integrante 2', 'Estado', 'Beneficiarios base',
    'Visita efectiva (matriz)', 'Beneficiarios listado IED', 'Beneficiarios base SED', ...labels.map((l, i) => `A${i + 1}. ${l}`), 'Observaciones'];
  const rows = iedFiltered().sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity)).map(r => {
    const asp = r.m ? (r.m.asp || '').split('|') : [];
    return [r.sticker, r.fecha, r.semana, r.mes, r.ied, r.sede, r.dane, r.loc, r.dir, r.jornada, r.numVisita, r.equipo, r.int1, r.int2, r.estado, r.benef,
      r.m ? r.m.efectiva : '', r.m ? r.m.benFoto : '', r.m ? r.m.benSed : '', ...labels.map((l, i) => asp[i] || ''), r.m ? r.m.obs : ''];
  });
  const csv = '\uFEFF' + [head, ...rows].map(r => r.map(STECore.csvCell).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  a.download = 'visitas_ied_filtradas.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initIED() {
  const set = (key, val) => { IEDS.f[key] = val; IEDS.open.clear(); IEDS.shown = 150; iedRender(); };
  [['#iLoc', 'loc'], ['#iMes', 'mes'], ['#iEst', 'est'], ['#iInt', 'int']].forEach(([s, k]) => $(s).addEventListener('change', e => set(k, e.target.value)));
  let timer = null;
  $('#iQ').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => set('q', e.target.value.trim()), 250); });
  $('#iClear').addEventListener('click', () => { Object.assign(IEDS.f, {loc: '', mes: '', est: '', int: '', q: ''}); $('#iQ').value = ''; IEDS.open.clear(); IEDS.shown = 150; iedRender(); });
  $('#iedOut').addEventListener('click', e => {
    const bar = e.target.closest('[data-ifilter]');
    if (bar) { const k = bar.dataset.ifilter; set(k, IEDS.f[k] === bar.dataset.ival ? '' : bar.dataset.ival); return; }
    if (e.target.closest('#iCsv')) { iedCsv(); return; }
    if (e.target.closest('#iMore')) { IEDS.shown += 150; iedRender(); return; }
    const tr = e.target.closest('tr.main[data-sticker]'); if (!tr || !IEDS.data) return;
    const s = tr.dataset.sticker, det = tr.nextElementSibling;
    if (IEDS.open.has(s)) { IEDS.open.delete(s); det.hidden = true; return; }
    const r = IEDS.data.rows.find(x => x.sticker === s); if (!r) return;
    IEDS.open.add(s); det.firstElementChild.innerHTML = iedDetail(r); det.hidden = false;
  });
}
