// La publicación web nunca incluye registros de beneficiarios.
const DB_NAME = 'consulta-ste', DB_STORE = 'kv';

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => v == null || v === '' ? '—' : '$' + Math.round(v).toLocaleString('es-CO');
const nf = v => v == null || v === '' ? '—' : (typeof v === 'number' ? v.toLocaleString('es-CO') : esc(v));
const km = v => v == null ? '—' : v.toLocaleString('es-CO', {maximumFractionDigits: 2}) + ' km';
const isPay = d => /^PAGAR/i.test(d || '');
const isNoPay = d => /^NO PAGAR/i.test(d || '');

const WEB = true;
const hasData = () => !!(DATA && (DATA.sources.length || DATA.visitas || DATA.pagos));
async function decodeEmbedded() {
  return {version: 1, generado: 'web-v1', sources: [], visitas: null, pagos: null};
}

// ---------- estado ----------
let DATA = null;          // {generado, sources:[], visitas}
let EMB_GEN = null;       // fecha de generación del paquete embebido
let VISALL = [];
let LIQ = new Map(), EST = new Map(), VIS = new Map(), PAG = new Map(), PAGDOC = new Map(), LOTES = [];

function loteOrder(l) {
  const m = String(l).match(/CICLO\s*(\d+)\s*([A-Z])?/i);
  if (!m) return 999;
  return Number(m[1]) * 10 + (m[2] ? m[2].charCodeAt(0) - 64 : 0);
}
function cicloAbInfo(ca) {
  const m = String(ca || '').toUpperCase().match(/CICLO-?(\d)_(\d{4})/);
  return m ? {n: +m[1], y: +m[2], rec: /RECONOC/i.test(ca)} : null;
}

function buildIndex() {
  LIQ = new Map(); EST = new Map(); VIS = new Map(); PAG = new Map(); PAGDOC = new Map(); VISALL = [];
  const lotes = new Set();
  const srcs = [...DATA.sources].sort((a, b) => Math.max(...Object.keys(a.lotes).map(loteOrder)) - Math.max(...Object.keys(b.lotes).map(loteOrder)));
  for (const s of srcs) {
    Object.keys(s.lotes).forEach(l => lotes.add(l));
    for (const r of STE.unpack(s.rows)) { let a = LIQ.get(r.doc); if (!a) LIQ.set(r.doc, a = []); a.push(r); }
    for (const e of STE.unpack(s.est)) EST.set(e.doc, e);   // la fuente más reciente queda al final
  }
  if (DATA.visitas) for (const v of STE.unpack(DATA.visitas.rows)) { let a = VIS.get(v.doc); if (!a) VIS.set(v.doc, a = []); a.push(v); VISALL.push(v); }
  if (DATA.pagos) for (const p of STE.unpack(DATA.pagos.rows)) {
    PAG.set(p.pid + '|' + p.cicloAb + '|' + p.lote, p); PAG.set('D' + p.doc + '|' + p.cicloAb + '|' + p.lote, p);
    let a = PAGDOC.get(p.doc); if (!a) PAGDOC.set(p.doc, a = []); a.push(p);
  }
  LOTES = [...lotes].sort((a, b) => loteOrder(a) - loteOrder(b));
  const nLiq = DATA.sources.reduce((t, s) => t + s.n, 0);
  prepDash(); renderInfoData(); if (currentView === 'tablero') renderDash();
  if (!hasData()) { $('#dataStatus').textContent = 'Sin datos cargados en este navegador'; return; }
  $('#dataStatus').textContent = `Lotes: ${LOTES.join(', ')} · ${nLiq.toLocaleString('es-CO')} registros de liquidación · ` +
    (DATA.visitas ? `${DATA.visitas.n.toLocaleString('es-CO')} visitas (${DATA.visitas.name})` : 'sin consolidado de visitas') + ' · ' +
    (DATA.pagos ? `pagos: ${DATA.pagos.name}` : 'sin consolidado de pagos');

}

// ---------- estado de pago ----------
const NA = s => !s || /^(N\/A|N\/D|#N\/A)$/i.test(String(s).trim());
const parseDMY = STECore.parseDMY;
function pagoOf(r) {
  const pid = String(r.key || '').split('_')[0];
  const lote = /TUTELA/i.test(r.lote) ? 'CICLO 3' : r.lote;
  return PAG.get(pid + '|' + r.cicloAb + '|' + lote) || PAG.get('D' + r.doc + '|' + r.cicloAb + '|' + lote) || null;
}
// estados: cob (cobrado), nocob (no cobrado, base vencida), pend (base activa / por cobrar), onp, nodisp, nd
function pagoState(p) {
  if (!p) return {k: 'none', label: 'Sin dato de pago', cls: 'info'};
  const est = (p.est || '').toUpperCase(), raz = NA(p.raz) ? '' : p.raz;
  const ff = parseDMY(p.ff), hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (est === 'COBRADO') return {k: 'cob', label: 'Cobrado', cls: 'ok', sub: p.fc ? 'el ' + p.fc : ''};
  if (est === 'NO COBRADO') {
    if (ff && ff < hoy) return {k: 'nocob', label: 'No cobrado', cls: 'bad', sub: 'base vencida ' + p.ff + (raz ? ' · ' + raz : '')};
    return {k: 'pend', label: 'Pendiente de cobro', cls: 'warn', sub: ff ? 'hasta ' + p.ff : ''};
  }
  if (/^BASE ACTIVA/i.test(raz)) return {k: 'pend', label: 'Pendiente de cobro', cls: 'warn', sub: 'base activa' + (ff ? ' hasta ' + p.ff : '')};
  if (/^ONP/.test(est)) return {k: 'onp', label: 'ONP en dispersión', cls: 'info', sub: raz || est};
  if (est === 'N/D') return {k: 'nd', label: 'Sin información (N/D)', cls: 'info', sub: ''};
  return {k: 'nodisp', label: 'No dispersado', cls: 'info', sub: raz};
}
const chipPago = s => `<span class="chip ${s.cls}">${esc(s.label)}</span>${s.sub ? `<div class="more" style="color:var(--muted);font-size:12px;margin-top:3px">${esc(s.sub)}</div>` : ''}`;
// pérdida del beneficio: primer abono no cobrado con base vencida
function perdida(doc) {
  const ps = (PAGDOC.get(doc) || []).map(p => ({p, s: pagoState(p), ff: parseDMY(p.ff)})).filter(x => x.s.k === 'nocob' && x.ff && !/RECLAMACION|RADICADO EN TIEMPOS/i.test(x.p.raz || ''));
  if (!ps.length) return null;
  ps.sort((a, b) => a.ff - b.ff);
  const first = ps[0];
  const after = (PAGDOC.get(doc) || []).filter(p => { const fa = parseDMY(p.fa); const s = pagoState(p); return fa && fa > first.ff && ['cob', 'nocob', 'pend'].includes(s.k); });
  return {first: first.p, after};
}

// ---------- búsqueda y render ----------
function search(raw) {
  const doc = STE.normDoc(raw);
  const out = $('#out');
  if (!hasData()) { out.innerHTML = `<div class="msg">Aún no hay datos cargados en este navegador. Use <b>Datos cargados / actualizar</b> y seleccione las liquidaciones de cada ciclo, el consolidado de visitas y el consolidado de pagos.</div>`; return; }
  if (!doc) { out.innerHTML = ''; return; }
  const liq = (LIQ.get(doc) || []).slice().sort((a, b) => loteOrder(a.lote) - loteOrder(b.lote) || orderCa(a.cicloAb) - orderCa(b.cicloAb));
  const vis = (VIS.get(doc) || []).slice().sort(STECore.compareVisits);
  const est = EST.get(doc);
  if (MAP) { MAP.remove(); MAP = null; }
  if (!liq.length && !vis.length) {
    out.innerHTML = `<div class="msg bad">No se encontró el documento <b>${esc(doc)}</b> en las liquidaciones ni en el consolidado de visitas cargados.</div>`;
    return;
  }
  out.innerHTML = renderWho(doc, est, vis) + renderPerdida(doc) + renderKpis(liq, vis) + renderMap(doc, vis, est) + renderCycles(liq) + renderLiqTable(liq) + renderVisits(vis);
  initMap(vis, est);
  out.querySelectorAll('tr.main').forEach(tr => tr.addEventListener('click', () => {
    const d = tr.nextElementSibling; d.hidden = !d.hidden;
  }));
}
function orderCa(ca) { const i = cicloAbInfo(ca); return i ? i.y * 10 + i.n : 0; }

function renderWho(doc, e, vis) {
  const v = vis[vis.length - 1];
  const nombre = (e && e.nombre) || (v && v.nombre) || '';
  const tipoSub = e ? `${e.tipoTrans || '—'}${e.tipoPago ? ' (tipo pago ' + e.tipoPago + ')' : ''}` : '—';
  const facts = [
    ['Colegio de matrícula', e ? e.colegio : v && v.colegio], ['Sede', e ? e.sede : v && v.sede],
    ['Jornada / grado', e ? `${e.jornada || '—'} · ${e.grado || '—'}` : v ? `${v.jornada} · grado ${v.grado}` : ''],
    ['Localidad de residencia', e && e.locRes], ['Tipo de subsidio', tipoSub],
    ['Discapacidad', (e && e.disc) || (v && v.disc)], ['Edad (beneficio)', e && e.edad],
    ['Medio de pago', e && e.tipoBen], ['Estado del beneficio', e && e.estado],
  ];
  return `<section class="card"><div class="who"><div>
      <div class="name">${esc(nombre || 'Sin nombre registrado')}</div>
      <div class="doc">${esc(e && e.tipoDoc ? e.tipoDoc : 'Documento')} · <b>${esc(doc)}</b>${e && e.lote ? ` · datos tomados del lote ${esc(e.lote)}` : ''}</div>
    </div></div>
    <div class="facts">${facts.map(([k, x]) => `<div class="fact"><div class="k">${k}</div><div class="v">${x ? esc(x) : '—'}</div></div>`).join('')}</div>
  </section>`;
}

function uniquePaid(liq) {
  const seen = new Set(), out = [];
  for (const r of liq) if (isPay(r.decision)) { const k = r.key || (r.doc + r.cicloAb); if (!seen.has(k)) { seen.add(k); out.push(r); } }
  return out;
}

function renderPerdida(doc) {
  const x = perdida(doc);
  if (!x) return '';
  const f = x.first;
  const extra = x.after.length ? `<br>Después de esa fecha se le dispersaron ${x.after.length} abono(s): ${x.after.map(p => `${esc(p.cicloAb)} (${esc(p.lote)}, ${esc(pagoState(p).label.toLowerCase())}, ${money(p.sub != null ? p.sub : p.val)})`).join('; ')}.` : '';
  return `<div class="msg bad" style="margin-top:16px"><b>Pérdida del beneficio por no cobro.</b> No cobró ${esc(f.cicloAb)} del lote ${esc(f.lote)} (abono ${esc(f.fa)}, base vencida ${esc(f.ff)}). Desde esa fecha no se deben dispersar más abonos.${extra}</div>`;
}

function renderKpis(liq, vis) {
  const last = vis[vis.length - 1];
  const paid = uniquePaid(liq);
  const total = paid.reduce((t, r) => t + (r.pago || 0), 0);
  const c26 = cycleStatus(liq).filter(c => c.y === 2026 && c.state !== 'pend');
  const pagados = c26.filter(c => c.state === 'ok').length;
  const recChip = last ? chipRecom(last.recom) : '<span class="chip info">Sin visita</span>';
  const st = paid.map(r => pagoState(pagoOf(r)));
  const cobrado = paid.reduce((t, r, i) => t + (st[i].k === 'cob' ? ((pagoOf(r) || {}).sub || r.pago || 0) : 0), 0);
  const nCob = st.filter(s => s.k === 'cob').length, nNo = st.filter(s => s.k === 'nocob').length, nPend = st.filter(s => s.k === 'pend').length;
  return `<div class="kpis">
    <div class="kpi"><div class="k">Visitas realizadas</div><div class="v">${vis.length}</div><div class="s">${last ? 'Última: ' + esc(last.fecha || last.periodo) : 'No tiene visitas registradas'}</div></div>
    <div class="kpi"><div class="k">Resultado última visita</div><div class="v" style="font-size:15px;margin-top:8px">${recChip}</div><div class="s">${last ? esc(last.estado) + ' · ' + esc(last.tipoVisita) : ''}</div></div>
    <div class="kpi"><div class="k">Distancia casa – sede (visita)</div><div class="v">${last ? km(last.distancia) : '—'}</div><div class="s">${last ? esc(shortGeo(last.georef)) : ''}</div></div>
    <div class="kpi"><div class="k">Ciclos 2026 liquidados para pago</div><div class="v">${pagados} de ${c26.length}</div><div class="s">ciclos con liquidación cargada</div></div>
    <div class="kpi"><div class="k">Total cobrado</div><div class="v">${DATA.pagos ? money(cobrado) : '—'}</div><div class="s">${DATA.pagos ? `${nCob} de ${paid.length} abono(s) cobrados · liquidado ${money(total)}` : 'sin consolidado de pagos'}</div></div>
    <div class="kpi"><div class="k">Abonos no cobrados</div><div class="v" style="${nNo ? 'color:var(--bad)' : ''}">${DATA.pagos ? nNo : '—'}</div><div class="s">${nPend ? nPend + ' pendiente(s) de cobro (base activa)' : 'base vencida sin cobrar'}</div></div>
  </div>`;
}
function shortGeo(g) { return (g || '').replace(/^NO SE PUDO VERIFICAR LA INFORMACIÓN EN VISITA - /, 'No verificada · '); }
function chipRecom(r) {
  if (!r) return '<span class="chip info">—</span>';
  if (/^NO PAGAR/i.test(r)) return `<span class="chip bad">${esc(r)}</span>`;
  if (/^PAGAR/i.test(r)) return `<span class="chip ok">${esc(r)}</span>`;
  return `<span class="chip info">${esc(r)}</span>`;
}
function chipDecision(d) {
  if (isPay(d)) return `<span class="chip ok">${esc(d)}</span>`;
  if (isNoPay(d)) return `<span class="chip bad">NO PAGAR</span>`;
  return `<span class="chip info">${esc(d || 'Sin decisión')}</span>`;
}

// Estado por ciclo abonado (2026 C1–C5 + ciclos 2025 reconocidos)
function cycleStatus(liq) {
  const loaded = new Set(LOTES.map(l => (String(l).match(/CICLO\s*(\d+)/i) || [])[1]).filter(Boolean).map(Number));
  const by = new Map();
  for (const r of liq) { const i = cicloAbInfo(r.cicloAb); if (!i) continue; const k = i.y + '-' + i.n; if (!by.has(k)) by.set(k, {y: i.y, n: i.n, rows: []}); by.get(k).rows.push(r); }
  for (let n = 1; n <= 5; n++) if (!by.has('2026-' + n)) by.set('2026-' + n, {y: 2026, n, rows: []});
  const list = [...by.values()].sort((a, b) => b.y - a.y || a.n - b.n);
  for (const c of list) {
    const paid = uniquePaid(c.rows);
    if (paid.length) {
      c.state = 'ok';
      c.dias = paid.reduce((t, r) => t + (r.total || 0), 0);
      c.valor = paid.reduce((t, r) => t + (r.pago || 0), 0);
      c.where = [...new Set(paid.map(r => r.lote))].join(', ');
      c.pagos = paid.map(r => pagoState(pagoOf(r)));
      c.rec = paid.some(r => cicloAbInfo(r.cicloAb).rec || c.y < 2026 || loteOrder(r.lote) >= (c.n + 1) * 10);
    } else if (c.rows.length) {
      c.state = 'bad'; const last = c.rows[c.rows.length - 1];
      c.motivo = last.decision; c.where = [...new Set(c.rows.map(r => r.lote))].join(', ');
    } else if (c.y === 2026 && loaded.has(c.n)) { c.state = 'warn'; }
    else c.state = 'pend';
  }
  return list;
}

function renderCycles(liq) {
  const list = cycleStatus(liq);
  const cards = list.map(c => {
    const title = `Ciclo ${c.n} · ${c.y}`;
    if (c.state === 'ok') return `<div class="cyc ok"><div class="t">${title}<span class="chip ok">Liquidado</span></div>
      <div class="d">Días liquidados: <b>${nf(c.dias)}</b><br>Valor: <b>${money(c.valor)}</b><br>Lote: ${esc(c.where)}${c.rec ? ' <span class="chip warn">reconocimiento</span>' : ''}
      ${DATA.pagos ? `<div style="margin-top:8px">${c.pagos.map(chipPago).join('')}</div>` : ''}</div></div>`;
    if (c.state === 'bad') return `<div class="cyc bad"><div class="t">${title}<span class="chip bad">No pagado</span></div>
      <div class="d">${esc(c.motivo || 'Sin decisión')}<br>Lote: ${esc(c.where)}</div></div>`;
    if (c.state === 'warn') return `<div class="cyc warn"><div class="t">${title}<span class="chip warn">No aparece</span></div>
      <div class="d">El documento no está en la liquidación de este ciclo.</div></div>`;
    return `<div class="cyc info"><div class="t">${title}<span class="chip info">Pendiente</span></div><div class="d">Liquidación del ciclo aún no cargada.</div></div>`;
  }).join('');
  return `<section class="card"><h2>Liquidación y cobro por ciclo</h2><div class="cycles">${cards}</div>
    <div class="hint" style="margin:10px 0 0">“Reconocimiento”: el ciclo se pagó en un lote posterior (por reclamación, visita, actualización de datos, etc.).</div></section>`;
}

function obsCell(r) {
  const parts = [];
  if (isNoPay(r.decision)) parts.push(`<div class="why">${esc(r.decision.replace(/^NO PAGAR\s*-?\s*/i, '') || 'No pagar')}</div>`);
  if (r.obs) parts.push(`<div>${esc(r.obs)}</div>`);
  if (isNoPay(r.decision) && r.obsVis) parts.push(`<div class="more">Visita: ${esc(r.obsVis)}</div>`);
  if (r.obsAsis && !/^NINGUNA$/i.test(r.obsAsis.trim())) parts.push(`<div class="more">Asistencia: ${esc(r.obsAsis)}</div>`);
  if (r.rutas) parts.push(`<div class="more">${esc(r.rutas)}</div>`);
  return parts.length ? parts.join('') : '<span class="empty">—</span>';
}

function renderLiqTable(liq) {
  if (!liq.length) return `<section class="card"><h2>Detalle de la liquidación</h2><div class="empty">El documento no aparece en ningún lote de liquidación cargado.</div></section>`;
  const present = new Set(liq.map(r => r.lote));
  const missing = LOTES.filter(l => !present.has(l) && /^CICLO\s*\d+$/i.test(l.trim()));
  const rows = liq.map(r => {
    const p = pagoOf(r);
    const tarjeta = r.tarjeta ? `<div class="more" style="color:var(--muted)">+ tarjeta ${money(r.tarjeta)}</div>` : '';
    const det = [
      ['Fuente', `${r.fuente} · origen ${r.archivo || '—'} (${r.contar || '—'})`], ['Estado beneficio / matrícula', `${r.estado || '—'} / ${r.anexo || '—'}`],
      ['Tipo de subsidio', `${r.tipoTrans || '—'} · ${r.tipoBen || ''}`], ['Evaluación tipo de pago', r.evalTipo],
      ['Evaluación grupo familiar', r.evalGrupo], ['Distancia por cambio de colegio', r.dist],
      ['Fecha asignación excepcional', r.fechaExc], ['Total fallas injustificadas 2026', r.totInj],
      ['Observación de pago', r.obsPago], ['Observación de visita', r.obsVis], ['Medios alternativos', r.medios],
      ['Ajustes a realizar', r.ajustes], ['Subtotal (incluye tarjeta)', r.subtotal != null ? money(r.subtotal) : ''],
      ['Pago – medio', p && p.medio], ['Pago – fecha de abono', p && p.fa], ['Pago – vigencia de la base', p && (p.fi || p.ff) ? `${p.fi || '?'} a ${p.ff || '?'}` : ''],
      ['Pago – fecha máxima de reclamación', p && p.fmr], ['Pago – estado', p && p.est], ['Pago – fecha de cobro', p && p.fc],
      ['Pago – razón de no pago', p && !NA(p.raz) ? p.raz : ''], ['Pago – valor dispersado', p && p.sub != null && pagoState(p).k !== 'onp' && pagoState(p).k !== 'nodisp' ? money(p.sub) : ''],
    ].filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<div><span>${k}:</span> ${esc(v)}</div>`).join('');
    return `<tr class="main" title="Clic para ver el detalle">
      <td class="lote"><b>${esc(r.lote)}</b></td><td>${esc(r.cicloAb)}</td>
      <td class="n">${nf(r.dias)}</td><td class="n">${nf(r.fj)}</td><td class="n">${nf(r.fi)}</td>
      <td class="n"><b>${nf(r.total)}</b></td><td class="n">${esc(r.tipoPago || '—')}</td>
      <td class="n${isNoPay(r.decision) ? ' nopay' : ''}" ${isNoPay(r.decision) ? 'title="Valor calculado, no se paga"' : ''}>${money(r.pago)}${tarjeta}</td><td>${chipDecision(r.decision)}</td>
      <td>${DATA.pagos ? chipPago(pagoState(p)) : '—'}</td><td class="obs">${obsCell(r)}</td></tr>
      <tr class="det" hidden><td colspan="11"><div class="dl">${det}</div></td></tr>`;
  }).join('');
  const miss = missing.length ? `<div class="msg" style="margin-top:12px">No aparece en: <b>${missing.map(esc).join(', ')}</b>.</div>` : '';
  return `<section class="card"><h2>Detalle de la liquidación <span class="count">${liq.length} registro(s)</span></h2>
    <div class="tablewrap"><table><thead><tr>
      <th>Lote</th><th>Ciclo abonado</th><th class="n">Días ciclo</th><th class="n">Fallas just.</th><th class="n">Fallas injust.</th>
      <th class="n">Días liquidados</th><th class="n">Tipo pago</th><th class="n">Valor</th><th>Decisión</th><th>Estado de pago</th><th>Observación</th>
    </tr></thead><tbody>${rows}</tbody></table></div>${miss}
    <div class="hint" style="margin:10px 0 0">Días liquidados = días del ciclo − (fallas justificadas + injustificadas). Valor = días liquidados × $5.600 × tipo de pago ($5.100 para ciclos 2025). Los valores tachados se calcularon pero no se pagan.</div>
  </section>`;
}

function renderVisits(vis) {
  if (!vis.length) return `<section class="card"><h2>Visitas domiciliarias</h2><div class="empty">No tiene visitas registradas en el consolidado cargado${DATA.visitas ? ' (' + esc(DATA.visitas.name) + ')' : ''}.</div></section>`;
  const cards = vis.map(v => `<div class="visit">
      <div class="head"><span class="num">Visita ${esc(v.num || '?')}</span><span class="when">${esc(v.fecha)} · ${esc(v.periodo)} · ${esc(v.semana)}</span>
        <span class="chip info">${esc(v.origen)}</span>${chipRecom(v.recom)}</div>
      <div class="grid">
        <div><div class="k">Distancia casa – sede</div><div class="v">${km(v.distancia)}</div></div>
        <div><div class="k">Tipo de visita</div><div class="v">${esc(v.tipoVisita || '—')}</div></div>
        <div><div class="k">Estado final</div><div class="v">${esc(v.estado || '—')}</div></div>
        <div><div class="k">¿Habita en la vivienda?</div><div class="v">${esc(v.habita || '—')}</div></div>
        <div><div class="k">¿Estudia en la IE/sede?</div><div class="v">${esc(v.estudia || '—')}</div></div>
        <div><div class="k">Dirección</div><div class="v">${esc(v.dirCorrecta || '—')}</div></div>
        <div><div class="k">Grado / jornada</div><div class="v">${esc(v.grado || '—')} · ${esc(v.jornada || '—')}</div></div>
        <div><div class="k">Sticker / verificador</div><div class="v">${esc(v.sticker || '—')} · ${esc(v.verificador || '—')}</div></div>
      </div>
      <div class="text"><div class="k">Georreferenciación</div><div>${esc(v.georef || '—')}</div></div>
      <div class="text"><div class="k">Observación de la visita</div><div>${esc(v.obs || '—')}</div></div>
    </div>`).join('');
  return `<section class="card"><h2>Visitas domiciliarias <span class="count">${vis.length} visita(s)</span></h2><div class="visits">${cards}</div></section>`;
}

// ---------- navegación ----------
let currentView = 'info';
function showView(v) {
  if (!['info', 'tablero', 'consulta', 'ied'].includes(v)) v = 'info';
  currentView = v;
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v ? 'true' : 'false'));
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'v-' + v; });
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  if (v === 'tablero') renderDash();
  if (v === 'consulta') setTimeout(() => $('#q').focus(), 0);
  if (v === 'ied' && typeof renderIED === 'function') renderIED();
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
  el.innerHTML = `<div class="kpis">${items.map(([k, v, s]) => `<div class="kpi"><div class="k">${k}</div><div class="v"${String(v).length > 12 ? ' style="font-size:15px;margin-top:8px"' : ''}>${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('')}</div>`;
}

// ---------- tablero de visitas ----------
const DF = {loc: '', by: 'res', unit: 'vis', from: '', to: ''};
let VPREP = [];       // visitas enriquecidas
const LOC_FIX = {'SANTAFE': 'SANTA FE', 'SANTA FE': 'SANTA FE'};
const normLoc = s => { const k = String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); return k ? (LOC_FIX[k] || k) : 'SIN DATO'; };
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
  for (const v of list) { const p = last.get(v.doc); if (!p || v.t > p.t || (v.t === p.t && v.num > p.num)) last.set(v.doc, v); }
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
  const csv = '\uFEFF' + rows.map(r => r.map(STECore.csvCell).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  a.download = 'tablero_visitas_' + id + (DF.loc ? '_' + DF.loc.replace(/\s+/g, '_') : '') + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
  const rangeError = STECore.dateRangeError(DF.from, DF.to);
  $('#fFrom').setAttribute('aria-invalid', rangeError ? 'true' : 'false');
  $('#fTo').setAttribute('aria-invalid', rangeError ? 'true' : 'false');
  if (rangeError) { $('#fNote').textContent = rangeError; el.innerHTML = ''; return; }
  const noLoc = VPREP.every(v => v.res === 'SIN DATO' && v.col === 'SIN DATO');
  const dated = byDate();
  const all = toUnit(dated);                                 // sin filtro de localidad (para el gráfico por localidad)
  const list = DF.loc ? all.filter(v => locOf(v) === DF.loc) : all;
  const U = DF.unit === 'vis' ? 'visitas' : 'beneficiarios';
  const u1 = DF.unit === 'vis' ? 'visita' : 'beneficiario';
  const n = list.length;
  const docs = new Set(list.map(v => v.doc)).size;
  const nPay = list.filter(v => v.pay).length, nNo = list.filter(v => v.nopay).length;
  const nEf = list.filter(v => v.efectiva).length;
  const nDist = list.filter(v => v.distNo).length;
  const ds = list.map(v => v.dist).filter(x => x != null && x >= 0).sort((a, b) => a - b);
  const med = STECore.median(ds);
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

  el.innerHTML = kpis.replace('<div class="kpis">','<div class="kpis dk">') + `<div class="dash-grid">${cWeek}${cTipo}${cMot}${cLoc}${cDist}${cOri}</div>`;
}

// ---------- mapa de la vivienda ----------
const TILE_BASE = 'https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/';
const okXY = v => v && typeof v.lat === 'number' && typeof v.lon === 'number' && v.lat > 3.5 && v.lat < 5.5 && v.lon > -75 && v.lon < -73;
function haversine(a, b) { const R = 6371000, r = x => x * Math.PI / 180; const dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
let MAP = null;
function sedeOf(vis, e) {
  for (let i = vis.length - 1; i >= 0; i--) { const d = vis[i].daneSede; if (d && SEDES[d]) return {dane: d, xy: SEDES[d], dir: vis[i].dirSede, colegio: vis[i].colegio, sede: vis[i].sede}; }
  if (e && e.dane && SEDES[e.dane]) return {dane: e.dane, xy: SEDES[e.dane], dir: '', colegio: e.colegio, sede: e.sede};
  return null;
}
function renderMap(doc, vis, e) {
  if (!vis.length) return '';
  const pts = vis.filter(okXY);
  const hasField = vis.some(v => 'lat' in v);
  const last = vis[vis.length - 1];
  if (!pts.length) {
    const why = !hasField || vis.every(v => v.lat == null) ? (DATA.visitas && !(DATA.visitas.rows.fields || []).includes('lat') ?
      'El consolidado de visitas se cargó con una versión anterior. Vuelva a cargarlo en <b>Datos cargados / actualizar</b> para ver el mapa.' : 'La visita no tiene coordenada registrada.') : 'La coordenada registrada está por fuera de Bogotá.';
    return `<section class="card"><h2>Ubicación de la vivienda</h2><div class="msg">${why}</div></section>`;
  }
  const lp = pts[pts.length - 1];
  const s = sedeOf(vis, e);
  const recta = s ? haversine([lp.lat, lp.lon], s.xy) : null;
  const info = [
    ['Dirección registrada (beneficio)', last.dirBen], ['Dirección donde se hizo la visita', lp.dirVisita],
    ['Coordenada registrada', `${lp.lat.toFixed(6)}, ${lp.lon.toFixed(6)}` + (pts.length > 1 ? ` (visita ${lp.num || pts.length})` : '')],
    ['Sede de matrícula', s ? `${s.sede || s.colegio || ''}${s.dir ? ' · ' + s.dir : ''}` : 'Sin coordenada de la sede'],
    ['Distancia en línea recta a la sede', recta == null ? '—' : km(recta / 1000)],
    ['Distancia medida en la visita (peatonal)', km(lp.distancia)],
  ];
  return `<section class="card"><h2>Ubicación de la vivienda <span class="count">coordenada tomada en la visita</span></h2>
    <div class="maptools"><div class="seg" id="mapLayer"><button type="button" data-v="mapa" aria-pressed="true">Mapa</button><button type="button" data-v="hib" aria-pressed="false">Satélite</button></div>
      <div class="maplegend"><span><i style="background:#2F6BA8;border-radius:50%"></i>Vivienda · visita PAGAR</span><span><i style="background:#CB4F3E;border-radius:50%"></i>Vivienda · visita NO PAGAR</span>${s ? '<span><i style="background:#E39A48;border-radius:3px"></i>Sede de matrícula</span>' : ''}</div></div>
    <div class="mapwrap"><div id="map" role="img" aria-label="Mapa con la ubicación de la vivienda y la sede"></div></div>
    <div class="mapinfo">${info.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v ? esc(v) : '—'}</div></div>`).join('')}</div>
    <div class="hint" style="margin:10px 0 0">Mapa base: Mapas Bogotá (IDECA). El número del marcador es el número de la visita. La línea punteada une la vivienda con la sede en línea recta; la distancia del subsidio es peatonal y siempre es mayor.</div>
  </section>`;
}
function initMap(vis, e) {
  if (MAP) { MAP.remove(); MAP = null; }
  const el = document.getElementById('map'); if (!el || typeof L === 'undefined') return;
  const pts = vis.filter(okXY); if (!pts.length) return;
  MAP = L.map(el, {zoomControl: true, attributionControl: true, scrollWheelZoom: false});
  MAP.attributionControl.setPrefix(false);
  const opt = {maxZoom: 20, maxNativeZoom: 19, attribution: 'Mapas Bogotá · IDECA', referrerPolicy: 'no-referrer'};
  const layers = {mapa: L.tileLayer(TILE_BASE + 'mapa_base_3857/MapServer/tile/{z}/{y}/{x}', opt), hib: L.tileLayer(TILE_BASE + 'mapa_hibrido/MapServer/tile/{z}/{y}/{x}', opt)};
  layers.mapa.addTo(MAP);
  $('#mapLayer').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return;
    Object.entries(layers).forEach(([k, l]) => { if (k === b.dataset.v) l.addTo(MAP); else MAP.removeLayer(l); });
    $('#mapLayer').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); });
  const bounds = [];
  pts.forEach((v, i) => {
    const cls = isNoPay(v.recom) ? 'nopay' : 'pay';
    const icon = L.divIcon({className: '', html: `<div class="pin ${cls}"><span>${esc(v.num || i + 1)}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 30], popupAnchor: [0, -28]});
    L.marker([v.lat, v.lon], {icon, zIndexOffset: 100 + i, title: 'Visita ' + (v.num || i + 1)}).addTo(MAP).bindPopup(
      `<b>Visita ${esc(v.num || i + 1)}</b> · ${esc(v.fecha)}<br>${esc(v.tipoVisita || '')} · ${esc(isNoPay(v.recom) ? 'NO PAGAR' : isPay(v.recom) ? 'PAGAR' : (v.recom || ''))}<br>` +
      `Dirección de la visita: ${esc(v.dirVisita || '—')}<br>Dirección registrada: ${esc(v.dirBen || '—')}<br>Coordenada: ${v.lat.toFixed(6)}, ${v.lon.toFixed(6)}<br>Distancia medida: ${km(v.distancia)}`);
    bounds.push([v.lat, v.lon]);
  });
  const s = sedeOf(vis, e);
  if (s) {
    const lp = pts[pts.length - 1];
    const icon = L.divIcon({className: '', html: '<div class="pin-sede">S</div>', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14]});
    L.marker(s.xy, {icon, title: 'Sede de matrícula'}).addTo(MAP).bindPopup(`<b>Sede de matrícula</b><br>${esc(s.colegio || '')}<br>${esc(s.sede || '')}<br>${esc(s.dir || '')}<br>DANE ${esc(s.dane)}`);
    L.polyline([[lp.lat, lp.lon], s.xy], {color: '#1F4E7E', weight: 2, dashArray: '6 6', opacity: .85}).addTo(MAP)
      .bindTooltip('Línea recta: ' + km(haversine([lp.lat, lp.lon], s.xy) / 1000), {sticky: true});
    bounds.push(s.xy);
  }
  if (bounds.length > 1) MAP.fitBounds(bounds, {padding: [40, 40], maxZoom: 17}); else MAP.setView(bounds[0], 17);
}

