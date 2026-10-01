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

