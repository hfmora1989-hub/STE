// ---------- navegación ----------
let currentView = 'info';
function showView(v) {
  if (!['info', 'tablero', 'consulta'].includes(v)) v = 'info';
  currentView = v;
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v ? 'true' : 'false'));
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'v-' + v; });
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  if (v === 'tablero') renderDash();
  if (v === 'consulta') setTimeout(() => $('#q').focus(), 0);
}
function initNav() {
  document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
  showView(location.hash.slice(1) || (hasData() && DATA.visitas ? 'tablero' : 'info'));
}

function renderInfoData() {
  const el = $('#infoData'); if (!el) return;
  if (!hasData()) {
    el.innerHTML = `<div class="msg" style="margin-top:4px"><b>Aún no hay datos cargados en este navegador.</b> Use el botón <b>Datos cargados / actualizar</b> (arriba a la derecha) y seleccione las liquidaciones de cada ciclo (CICLO1_1B, CICLO2, CICLO3…), el consolidado de visitas domiciliarias y el consolidado de pagos.</div>`;
    return;
  }
  const nLiq = DATA.sources.reduce((t, s) => t + s.n, 0);
  const benLiq = LIQ.size;
  const items = [
    ['Lotes de liquidación', LOTES.length ? LOTES.join(', ') : '—', nLiq ? nLiq.toLocaleString('es-CO') + ' registros' : ''],
    ['Beneficiarios en liquidaciones', benLiq ? benLiq.toLocaleString('es-CO') : '—', ''],
    ['Visitas domiciliarias', DATA.visitas ? DATA.visitas.n.toLocaleString('es-CO') : '—', DATA.visitas ? VIS.size.toLocaleString('es-CO') + ' beneficiarios' : 'sin consolidado'],
    ['Consolidado de pagos', DATA.pagos ? DATA.pagos.n.toLocaleString('es-CO') : '—', DATA.pagos ? DATA.pagos.name : 'sin consolidado'],
  ];
  el.innerHTML = `<div class="kpis">${items.map(([k, v, s]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('')}</div>`;
}

// ---------- tablero de visitas ----------
const DF = {loc: '', by: 'res', unit: 'vis', from: '', to: ''};
let VPREP = [];       // visitas enriquecidas
const LOC_FIX = {'SANTAFE': 'SANTA FE', 'SANTA FE': 'SANTA FE'};
const normLoc = s => { const k = String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); return k ? (LOC_FIX[k] || k) : 'SIN DATO'; };
const fmtN = n => n.toLocaleString('es-CO');
const pct = (a, b) => b ? (100 * a / b).toLocaleString('es-CO', {maximumFractionDigits: 1}) + ' %' : '—';

function motivo(v) {
  const g = (v.georef || '').toUpperCase();
  if (/^NO SE PUDO VERIFICAR/.test(g)) return 'No se pudo verificar (visita no efectiva)';
  if (/NO VIVE ALL/.test(g)) return 'No vive en la dirección registrada';
  if (/NO CUMPLE, DISTANCIA MENOR/.test(g)) return 'No cumple la distancia';
  return 'Otra causa';
}
function prepDash() {
  VPREP = VISALL.map(v => {
    const d = parseDMY(v.fecha);
    const sw = String(v.semana || '').match(/(\d+)/);
    return {
      doc: v.doc, d, t: d ? d.getTime() : 0, num: +v.num || 1, semana: sw ? +sw[1] : null, periodo: v.periodo || '',
      res: normLoc(v.loc), col: normLoc(v.locCol), nopay: isNoPay(v.recom), pay: isPay(v.recom),
      efectiva: /^EFECTIVA$/i.test((v.estado || '').trim()), tipo: v.tipoVisita || 'Sin dato', origen: v.origen || 'Sin dato',
      dist: typeof v.distancia === 'number' ? v.distancia : null, distNo: /NO CUMPLE, DISTANCIA MENOR/i.test(v.georef || ''),
      motivo: isNoPay(v.recom) ? motivo(v) : null
    };
  });
  const sel = $('#fLoc'); if (!sel) return;
  const locs = new Map();
  for (const v of VPREP) { const k = DF.by === 'col' ? v.col : v.res; locs.set(k, (locs.get(k) || 0) + 1); }
  const keep = DF.loc;
  sel.innerHTML = '<option value="">Todas las localidades</option>' +
    [...locs.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([k, n]) => `<option value="${esc(k)}">${esc(titleCase(k))} (${fmtN(n)})</option>`).join('');
  sel.value = locs.has(keep) ? keep : ''; DF.loc = sel.value;
}
const titleCase = s => s === 'SIN DATO' ? 'Sin dato' : s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/\b(De|Del|La|Los)\b/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase());

function initDash() {
  $('#fLoc').addEventListener('change', e => { DF.loc = e.target.value; renderDash(); });
  const seg = (id, key) => $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    DF[key] = b.dataset.v;
    $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    if (key === 'by') { DF.loc = ''; prepDash(); }
    renderDash();
  });
  seg('#fBy', 'by'); seg('#fUnit', 'unit');
  $('#fFrom').addEventListener('change', e => { DF.from = e.target.value; renderDash(); });
  $('#fTo').addEventListener('change', e => { DF.to = e.target.value; renderDash(); });
  $('#fClear').addEventListener('click', () => {
    Object.assign(DF, {loc: '', from: '', to: ''}); $('#fLoc').value = ''; $('#fFrom').value = ''; $('#fTo').value = ''; renderDash();
  });
  // tooltip
  const tip = $('#tip');
  const show = (el, x, y) => { tip.innerHTML = el.dataset.tip; tip.style.display = 'block';
    const r = tip.getBoundingClientRect(); let L = x + 14, T = y + 14;
    if (L + r.width > innerWidth - 8) L = x - r.width - 14; if (T + r.height > innerHeight - 8) T = y - r.height - 14;
    tip.style.left = Math.max(8, L) + 'px'; tip.style.top = Math.max(8, T) + 'px'; };
  document.addEventListener('mousemove', e => { const el = e.target.closest('[data-tip]'); if (el) show(el, e.clientX, e.clientY); else tip.style.display = 'none'; });
  document.addEventListener('click', e => { const el = e.target.closest('[data-tip]'); if (!el) tip.style.display = 'none'; });
  $('#dash').addEventListener('click', e => {
    const r = e.target.closest('[data-loc]'); if (r) { DF.loc = DF.loc === r.dataset.loc ? '' : r.dataset.loc; $('#fLoc').value = DF.loc; renderDash(); return; }
    const c = e.target.closest('[data-csv]'); if (c) downloadCsv(c.dataset.csv);
  });
}

// visitas filtradas por fecha (sin localidad)
function byDate() {
  const f = DF.from ? new Date(DF.from + 'T00:00:00').getTime() : -Infinity, t = DF.to ? new Date(DF.to + 'T23:59:59').getTime() : Infinity;
  if (!DF.from && !DF.to) return VPREP;
  return VPREP.filter(v => v.t && v.t >= f && v.t <= t);
}
// unidad: visitas o última visita por beneficiario
function toUnit(list) {
  if (DF.unit === 'vis') return list;
  const last = new Map();
  for (const v of list) { const p = last.get(v.doc); if (!p || v.num > p.num || (v.num === p.num && v.t > p.t)) last.set(v.doc, v); }
  return [...last.values()];
}
const locOf = v => DF.by === 'col' ? v.col : v.res;

function stackGroups(list, keyFn, order) {
  const m = new Map();
  for (const v of list) { const k = keyFn(v); if (k == null) continue; let g = m.get(k); if (!g) m.set(k, g = {k, pay: 0, nopay: 0, n: 0}); g.n++; if (v.nopay) g.nopay++; else if (v.pay) g.pay++; }
  let arr = [...m.values()];
  if (order) arr.sort(order); else arr.sort((a, b) => b.n - a.n);
  return arr;
}

const TABLES = {};
function tableHtml(id, head, rows) {
  TABLES[id] = [head, ...rows];
  return `<details class="tbl"><summary>Ver como tabla</summary><div class="tablewrap"><table><thead><tr>${head.map((h, i) => `<th${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${esc(typeof c === 'number' ? fmtN(c) : c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div style="margin-top:8px"><button type="button" data-csv="${id}">Descargar CSV</button></div></details>`;
}
function downloadCsv(id) {
  const rows = TABLES[id]; if (!rows) return;
  const csv = '﻿' + rows.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  a.download = 'tablero_visitas_' + id + (DF.loc ? '_' + DF.loc.replace(/\s+/g, '_') : '') + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// barras horizontales apiladas (Pagar / No pagar)
function hbars(groups, unitWord, opts = {}) {
  const max = Math.max(1, ...groups.map(g => g.n));
  const rows = groups.map(g => {
    const lab = opts.label ? opts.label(g.k) : g.k;
    const tip = `<b>${esc(lab)}</b><br>${fmtN(g.n)} ${unitWord}<br>Pagar: ${fmtN(g.pay)} (${pct(g.pay, g.n)})<br>No pagar: ${fmtN(g.nopay)} (${pct(g.nopay, g.n)})`;
    const segs = opts.single ? `<div class="seg-b fill-${opts.single}" style="width:${100 * g.n / max}%"></div>` :
      [['pay', g.pay], ['nopay', g.nopay]].filter(([, n]) => n > 0).map(([c, n]) => `<div class="seg-b fill-${c}" style="width:calc(${100 * n / max}% - 1px)"></div>`).join('');
    const cls = opts.sel ? (opts.sel === g.k ? ' sel' : opts.selActive ? ' dim' : '') : '';
    const val = opts.single ? `${fmtN(g.n)} <small>· ${pct(g.n, opts.total)}</small>` : `${fmtN(g.n)} <small>· ${pct(g.nopay, g.n)} no pagar</small>`;
    return `<div class="row${cls}" data-tip="${esc(opts.tip ? opts.tip(g, lab) : tip)}"${opts.click ? ` data-loc="${esc(g.k)}"` : ''}>
      <div class="lab" title="${esc(lab)}">${esc(lab)}</div><div class="track">${segs}</div><div class="val">${val}</div></div>`;
  }).join('');
  return `<div class="hb${opts.click ? ' click' : ''}">${rows}</div>`;
}

function niceMax(v) { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
// columnas apiladas
function vcols(groups, unitWord, labelFn, opts = {}) {
  const top = niceMax(Math.max(1, ...groups.map(g => g.n)));
  const ticks = [0, .25, .5, .75, 1].map(f => f * top);
  const grid = ticks.map(t => `<div class="gl${t === 0 ? ' base' : ''}" style="bottom:${100 * t / top}%"><span>${fmtN(Math.round(t))}</span></div>`).join('');
  const cols = groups.map(g => {
    const segs = [['pay', g.pay], ['nopay', g.nopay]].filter(([, n]) => n > 0);
    const html = segs.map(([c, n], i) => `<div class="s fill-${c}${i === segs.length - 1 ? ' top' : ''}" style="height:calc(${100 * n / top}% - ${segs.length > 1 ? 1 : 0}px)"></div>`).join('');
    const tip = `<b>${esc(opts.tipTitle ? opts.tipTitle(g) : labelFn(g))}</b><br>${fmtN(g.n)} ${unitWord}<br>Pagar: ${fmtN(g.pay)} (${pct(g.pay, g.n)})<br>No pagar: ${fmtN(g.nopay)} (${pct(g.nopay, g.n)})`;
    return `<div class="col" data-tip="${esc(tip)}">${html}</div>`;
  }).join('');
  const every = Math.ceil(groups.length / 14);
  const xl = groups.map((g, i) => `<span>${i % every === 0 ? esc(labelFn(g)) : ''}</span>`).join('');
  const refs = (opts.refs || []).map(r => `<div class="ref" style="left:${r.pos}%"><span>${esc(r.label)}</span></div>`).join('');
  return `<div class="vc">${grid}<div class="cols">${cols}</div>${refs}</div><div class="xl">${xl}</div>`;
}

const LEGEND = `<div class="legend"><span><i class="sw-pay"></i>Recomendación PAGAR</span><span><i class="sw-nopay"></i>Recomendación NO PAGAR</span></div>`;

function renderDash() {
  const el = $('#dash'); if (!el) return;
  if (!VPREP.length) {
    $('#fNote').textContent = '';
    el.innerHTML = `<div class="msg" style="margin-top:16px">No hay consolidado de visitas cargado. Use <b>Datos cargados / actualizar</b> y seleccione el archivo del consolidado de visitas domiciliarias.</div>`;
    return;
  }
  const noLoc = VPREP.every(v => v.res === 'SIN DATO' && v.col === 'SIN DATO');
  const dated = byDate();
  const all = toUnit(dated);                                 // sin filtro de localidad (para el gráfico por localidad)
  const list = DF.loc ? toUnit(dated.filter(v => locOf(v) === DF.loc)) : all;
  const U = DF.unit === 'vis' ? 'visitas' : 'beneficiarios';
  const u1 = DF.unit === 'vis' ? 'visita' : 'beneficiario';
  const n = list.length;
  const docs = new Set(list.map(v => v.doc)).size;
  const nPay = list.filter(v => v.pay).length, nNo = list.filter(v => v.nopay).length;
  const nEf = list.filter(v => v.efectiva).length;
  const nDist = list.filter(v => v.distNo).length;
  const ds = list.map(v => v.dist).filter(x => x != null && x >= 0).sort((a, b) => a - b);
  const med = ds.length ? ds[Math.floor(ds.length / 2)] : null;
  const avg = ds.length ? ds.reduce((t, x) => t + x, 0) / ds.length : null;
  const rev = DF.unit === 'vis' ? list.filter(v => v.num >= 2).length : 0;
  const multi = DF.unit === 'ben' ? (() => { const c = new Map(); dated.filter(v => !DF.loc || locOf(v) === DF.loc).forEach(v => c.set(v.doc, (c.get(v.doc) || 0) + 1)); return [...c.values()].filter(x => x > 1).length; })() : 0;
  const ts = list.map(v => v.t).filter(Boolean);
  const dmin = ts.length ? new Date(Math.min(...ts)) : null, dmax = ts.length ? new Date(Math.max(...ts)) : null;
  const fd = d => d ? d.toLocaleDateString('es-CO', {day: '2-digit', month: 'short', year: 'numeric'}) : '—';
  const where = DF.loc ? `${titleCase(DF.loc)} (localidad de ${DF.by === 'col' ? 'colegio' : 'residencia'})` : 'Todas las localidades';
  $('#fNote').innerHTML = `Mostrando <b>${esc(where)}</b> · ${fmtN(n)} ${U} · visitas entre ${fd(dmin)} y ${fd(dmax)}` +
    (DF.unit === 'ben' ? ' · cada beneficiario se cuenta con su última visita' : '') +
    (noLoc ? ' · <span style="color:var(--bad)">El consolidado cargado no trae la localidad: vuelva a cargarlo para filtrar.</span>' : '');
  if (!n) { el.innerHTML = `<div class="msg" style="margin-top:16px">No hay ${U} con los filtros seleccionados.</div>`; return; }

  const kpis = `<div class="kpis">
    <div class="kpi"><div class="k">${DF.unit === 'vis' ? 'Visitas realizadas' : 'Beneficiarios visitados'}</div><div class="v">${fmtN(n)}</div>
      <div class="s">${DF.unit === 'vis' ? fmtN(docs) + ' beneficiarios distintos' : fmtN(multi) + ' con más de una visita'}</div></div>
    <div class="kpi"><div class="k">Visitas efectivas</div><div class="v">${fmtN(nEf)}<span class="pct">${pct(nEf, n)}</span></div>
      <div class="s">${fmtN(n - nEf)} no efectivas (ausente, rechazada u otra dirección)</div></div>
    <div class="kpi k-ok"><div class="k"><span class="ico" style="color:var(--ok)">✓</span>Recomendación PAGAR</div><div class="v">${fmtN(nPay)}<span class="pct">${pct(nPay, n)}</span></div>
      <div class="s">sujeto a verificación en liquidación</div></div>
    <div class="kpi k-bad"><div class="k"><span class="ico" style="color:var(--bad)">✕</span>Recomendación NO PAGAR</div><div class="v">${fmtN(nNo)}<span class="pct">${pct(nNo, n)}</span></div>
      <div class="s">no cumple criterios</div></div>
    <div class="kpi"><div class="k">No cumplen la distancia</div><div class="v">${fmtN(nDist)}<span class="pct">${pct(nDist, n)}</span></div>
      <div class="s">menos de 2 km (o de 1 km si aplica)</div></div>
    <div class="kpi"><div class="k">Distancia casa – sede (mediana)</div><div class="v">${med == null ? '—' : km(med)}</div>
      <div class="s">${avg == null ? '' : 'promedio ' + km(avg)}</div></div>
    ${DF.unit === 'vis' ? `<div class="kpi"><div class="k">Revisitas (2.ª visita o más)</div><div class="v">${fmtN(rev)}</div><div class="s">${pct(rev, n)} de las visitas</div></div>` : ''}
  </div>`;

  // semana
  const wk = stackGroups(list.filter(v => v.semana != null), v => v.semana, (a, b) => a.k - b.k);
  const perOf = new Map(); list.forEach(v => { if (v.semana != null && !perOf.has(v.semana)) perOf.set(v.semana, v.periodo); });
  const cWeek = `<section class="card wide"><h2>${U[0].toUpperCase() + U.slice(1)} por semana</h2>
    <div class="sub2">Semana del consolidado según la fecha de la visita${DF.unit === 'ben' ? ' (última visita de cada beneficiario)' : ''}.</div>${LEGEND}
    ${vcols(wk, U, g => 'S' + g.k, {tipTitle: g => `Semana ${g.k} · ${perOf.get(g.k) || ''}`})}
    ${tableHtml('semana', ['Semana', 'Periodo', U, 'Pagar', 'No pagar', '% no pagar'], wk.map(g => ['Semana ' + g.k, perOf.get(g.k) || '', g.n, g.pay, g.nopay, pct(g.nopay, g.n)]))}</section>`;

  // resultado
  const TIPOS = ['Atendida', 'Vive en dirección diferente', 'Ausente', 'Rechazada'];
  const tg = stackGroups(list, v => v.tipo, (a, b) => (TIPOS.indexOf(a.k) + 1 || 99) - (TIPOS.indexOf(b.k) + 1 || 99));
  const cTipo = `<section class="card"><h2>Resultado de la visita</h2><div class="sub2">Tipo de visita registrado por el verificador.</div>${LEGEND}
    ${hbars(tg, U)}${tableHtml('resultado', ['Resultado', U, 'Pagar', 'No pagar', '% del total'], tg.map(g => [g.k, g.n, g.pay, g.nopay, pct(g.n, n)]))}</section>`;

  // motivos de no pago
  const MOT = ['No cumple la distancia', 'No vive en la dirección registrada', 'No se pudo verificar (visita no efectiva)', 'Otra causa'];
  const mg = stackGroups(list.filter(v => v.nopay), v => v.motivo, (a, b) => MOT.indexOf(a.k) - MOT.indexOf(b.k));
  const cMot = `<section class="card"><h2>Motivo de NO PAGAR</h2><div class="sub2">${fmtN(nNo)} ${U} con recomendación NO PAGAR, según la georreferenciación.</div>
    ${mg.length ? hbars(mg, U, {single: 'nopay', total: nNo, tip: (g, lab) => `<b>${esc(lab)}</b><br>${fmtN(g.n)} ${U} · ${pct(g.n, nNo)} de los NO PAGAR`}) : '<div class="empty">Sin recomendaciones NO PAGAR.</div>'}
    ${tableHtml('motivo', ['Motivo', U, '% de NO PAGAR'], mg.map(g => [g.k, g.n, pct(g.n, nNo)]))}
    <div class="hint" style="margin:10px 0 0">Cuando hay varias causas se toma la primera: verificación, luego residencia, luego distancia.</div></section>`;

  // localidad (ignora el filtro de localidad; resalta la seleccionada)
  const lg = stackGroups(all, locOf);
  const cLoc = `<section class="card wide"><h2>${U[0].toUpperCase() + U.slice(1)} por localidad de ${DF.by === 'col' ? 'colegio' : 'residencia'}</h2>
    <div class="sub2">Todas las localidades con los demás filtros aplicados. Clic en una localidad para filtrar el tablero; clic de nuevo para quitar el filtro.</div>${LEGEND}
    ${hbars(lg, U, {click: true, sel: DF.loc || null, selActive: !!DF.loc, label: titleCase})}
    ${tableHtml('localidad', ['Localidad', U, 'Pagar', 'No pagar', '% no pagar', 'Efectivas', 'No cumple distancia'],
      lg.map(g => { const s = all.filter(v => locOf(v) === g.k); return [titleCase(g.k), g.n, g.pay, g.nopay, pct(g.nopay, g.n), s.filter(v => v.efectiva).length, s.filter(v => v.distNo).length]; }))}</section>`;

  // distancia
  const BINS = [[0, 1, '< 1'], [1, 2, '1–2'], [2, 3, '2–3'], [3, 4, '3–4'], [4, 5, '4–5'], [5, 7, '5–7'], [7, 10, '7–10'], [10, Infinity, '> 10']];
  const dg = BINS.map(([a, b, l]) => { const s = list.filter(v => v.dist != null && v.dist >= a && v.dist < b); return {k: l, n: s.length, pay: s.filter(v => v.pay).length, nopay: s.filter(v => v.nopay).length}; });
  const sinDist = list.filter(v => v.dist == null).length;
  const cDist = `<section class="card"><h2>Distancia casa – sede medida en la visita</h2><div class="sub2">Kilómetros${sinDist ? ` · ${fmtN(sinDist)} sin distancia registrada` : ''}. Umbral: 2 km (1 km para preescolar o discapacidad).</div>${LEGEND}
    ${vcols(dg, U, g => g.k, {tipTitle: g => g.k + ' km', refs: [{pos: 12.5, label: '1 km'}, {pos: 25, label: '2 km'}]})}
    <div class="hint" style="margin:4px 0 0;text-align:center">Rango de distancia (km)</div>
    ${tableHtml('distancia', ['Rango (km)', U, 'Pagar', 'No pagar'], dg.map(g => [g.k, g.n, g.pay, g.nopay]))}</section>`;

  // origen
  const og = stackGroups(list, v => v.origen);
  const cOri = `<section class="card"><h2>Origen de la visita</h2><div class="sub2">Visita inicial, reprogramaciones y solicitudes (PQR).</div>${LEGEND}
    ${hbars(og, U)}${tableHtml('origen', ['Origen', U, 'Pagar', 'No pagar', '% del total'], og.map(g => [g.k, g.n, g.pay, g.nopay, pct(g.n, n)]))}</section>`;

  el.innerHTML = kpis + `<div class="dash-grid">${cWeek}${cTipo}${cMot}${cLoc}${cDist}${cOri}</div>`;
}

