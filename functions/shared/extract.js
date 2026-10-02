// Lógica de extracción compartida (navegador y Node).
// Convierte las hojas de Excel (liquidaciones y consolidado de visitas) en registros compactos.
var STE = (function () {
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, '');
  }
  function normDoc(v) {
    if (v == null) return '';
    var s = String(v).trim().toUpperCase();
    if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
    if (/^[\d.,\s]+$/.test(s)) s = s.replace(/[.,\s]/g, '');
    return s;
  }
  function txt(v) {
    if (v == null) return '';
    if (v instanceof Date) return fmtDate(v);
    var s = String(v).trim();
    return s === 'nan' || s === 'None' ? '' : s;
  }
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    var n = Number(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  function excelDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return fmtDate(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return fmtDate(d, true);
    }
    return txt(v);
  }
  function fmtDate(d, utc) {
    if (isNaN(d.getTime())) return '';
    var y = utc ? d.getUTCFullYear() : d.getFullYear();
    var m = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
    var day = utc ? d.getUTCDate() : d.getDate();
    // corrige desfase de zona horaria de fechas leídas como medianoche
    if (!utc && d.getHours() === 23) { var n = new Date(d.getTime() + 3600000); y = n.getFullYear(); m = n.getMonth() + 1; day = n.getDate(); }
    return (day < 10 ? '0' : '') + day + '/' + (m < 10 ? '0' : '') + m + '/' + y;
  }

  // Índice de columnas por nombre normalizado (la primera aparición gana; se guardan todas)
  function headerIndex(header) {
    var idx = Object.create(null);
    header.forEach(function (h, i) {
      var k = norm(h);
      if (!(k in idx)) idx[k] = [];
      idx[k].push(i);
    });
    return idx;
  }
  function col(idx, name) {
    var a = idx[norm(name)];
    return a ? a[0] : -1;
  }

  function findHeaderRow(rows, mustHave) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var r = rows[i] || [];
      var ok = mustHave.every(function (m) {
        return r.some(function (c) { return norm(c) === norm(m); });
      });
      if (ok) return i;
    }
    return -1;
  }

  // ---------- Liquidaciones ----------
  function isLiquidacion(rows) {
    return findHeaderRow(rows, ['CICLOABONADO', 'TOTAL_DIAS_A_LIQUIDAR']) >= 0;
  }

  function extractLiquidacion(rows, sourceName) {
    var h = findHeaderRow(rows, ['CICLOABONADO', 'TOTAL_DIAS_A_LIQUIDAR']);
    if (h < 0) throw new Error('El archivo ' + sourceName + ' no tiene las columnas de una liquidación (CICLOABONADO, TOTAL_DIAS_A_LIQUIDAR).');
    var header = rows[h];
    var idx = headerIndex(header);
    var docCols = idx[norm('NUMERO_DOCUMENTO')] || [];
    // columnas de fallas injustificadas por ciclo: clave "N_AAAA"
    var injCols = Object.create(null);
    header.forEach(function (name, i) {
      var k = norm(name);
      if (k.indexOf('INJUSTIF') < 0 || k.indexOf('TOTAL') === 0) return;
      var m = k.match(/CICLO(\d)_(\d{4})/);
      if (m) { var key = m[1] + '_' + m[2]; if (!(key in injCols)) injCols[key] = i; }
    });
    var C = function (n) { return col(idx, n); };
    var c = {
      lote: C('CICLO'), key: C('KEY'), contar: C('contar'), archivo: C('ARCHIVO'), anexo: C('ANEXO_VAL'),
      tipoBen: C('TIPO_BENEFICIO'), estado: C('ESTADO_BENEFICIO'), nombre: C('NOMBRE_ESTUDIANTE'),
      tipoDoc: C('TIPO_DOCUMENTO'), colegio: C('NOMBRE_COLEGIO_MATRICULA'), sede: C('NOMBRE_SEDE_MATRICULA'),
      dane: C('DANE12_SEDE_MATRICULA'), jornada: C('NOMBRE_JORNADA_MATRICULA'), grado: C('NOMBRE_GRADO_MATRICULA'),
      locRes: C('NOMBRE_LOCALIDAD_RESIDENCIA'), tipoTrans: C('NOMBRE_TIPO_TRANS'), tipoPago: C('TIPO_PAGO'),
      disc: C('NOMBRE_DISCAPACIDAD_MATRICULA'), edad: C('EDAD_BENEFICIO'), docResp: C('NUMERO_DOC_RESPONSABLE'),
      evalTipo: C('EVALUACION TIPO DE PAGO'), evalGrupo: C('EVALUACION GRUPO FAMILIAR'),
      dist: C('ANALIZAR DISTANCIA CAMBIO DE COLEGIO'), obs: C('OBSERVACIONES'), fechaExc: C('FECH -  DE  - SIGN - CION EXCEPCION - L'),
      obsVis: C('OBSERVACIONES_VISITA'), decision: C('PAGAR - NO PAGAR'), rutas: C('RUTAS_ESCOLARES'),
      medios: C('MEDIOS_ALTERNATIVOS'), cicloAb: C('CICLOABONADO'), fj: C('FALLAS_JUSTIF_CICLO_A_PAGAR'),
      obsAsis: C('OBSERVACION_ASISTENCIA'), totInj: C('TOTAL_FALLAS_INJUSTIFICADAS_ 2026'), ajustes: C('AJUSTES A REALIZAR'),
      dias: C('DIAS_CICLO'), total: C('TOTAL_DIAS_A_LIQUIDAR'), pago: C('PAGO_SUBSIDIO'), tarjeta: C('TARJETATULLAVE'),
      subtotal: C('SUBTOTAL'), obsPago: C('OBSERVACIONES_DE_PAGO')
    };
    var g = function (r, i) { return i >= 0 ? r[i] : null; };
    var out = [], lotes = Object.create(null);
    for (var i = h + 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      var doc = '';
      for (var j = 0; j < docCols.length && !doc; j++) doc = normDoc(r[docCols[j]]);
      if (!doc) continue;
      var cicloAb = txt(g(r, c.cicloAb));
      var m = norm(cicloAb).match(/CICLO-?(\d)_(\d{4})/);
      var inj = null;
      if (m && injCols[m[1] + '_' + m[2]] != null) inj = g(r, injCols[m[1] + '_' + m[2]]);
      var lote = txt(g(r, c.lote)) || sourceName;
      lotes[lote] = (lotes[lote] || 0) + 1;
      out.push({
        doc: doc, key: txt(g(r, c.key)), lote: lote, fuente: sourceName, contar: txt(g(r, c.contar)), archivo: txt(g(r, c.archivo)),
        cicloAb: cicloAb, anexo: txt(g(r, c.anexo)), tipoBen: txt(g(r, c.tipoBen)), estado: txt(g(r, c.estado)),
        tipoTrans: txt(g(r, c.tipoTrans)), tipoPago: txt(g(r, c.tipoPago)),
        dias: num(g(r, c.dias)), fj: num(g(r, c.fj)), fi: (num(inj) != null ? num(inj) : txt(inj)), total: num(g(r, c.total)),
        pago: num(g(r, c.pago)), tarjeta: num(g(r, c.tarjeta)), subtotal: num(g(r, c.subtotal)),
        decision: txt(g(r, c.decision)), obs: txt(g(r, c.obs)), obsVis: txt(g(r, c.obsVis)), obsAsis: txt(g(r, c.obsAsis)),
        obsPago: txt(g(r, c.obsPago)), evalTipo: txt(g(r, c.evalTipo)), evalGrupo: txt(g(r, c.evalGrupo)),
        dist: txt(g(r, c.dist)), rutas: txt(g(r, c.rutas)), medios: txt(g(r, c.medios)), fechaExc: excelDate(g(r, c.fechaExc)),
        totInj: num(g(r, c.totInj)), ajustes: txt(g(r, c.ajustes)),
        est: {
          nombre: txt(g(r, c.nombre)), tipoDoc: txt(g(r, c.tipoDoc)), colegio: txt(g(r, c.colegio)), sede: txt(g(r, c.sede)),
          dane: txt(g(r, c.dane)), jornada: txt(g(r, c.jornada)), grado: txt(g(r, c.grado)), locRes: txt(g(r, c.locRes)),
          tipoTrans: txt(g(r, c.tipoTrans)), tipoPago: txt(g(r, c.tipoPago)), disc: txt(g(r, c.disc)), edad: txt(g(r, c.edad)),
          tipoBen: txt(g(r, c.tipoBen)), estado: txt(g(r, c.estado))
        }
      });
    }
    return { rows: out, lotes: lotes };
  }

  // ---------- Visitas domiciliarias ----------
  function isVisitas(rows) {
    return findHeaderRow(rows, ['IDENTIFICACIÓN DEL BENEFICIARIO', 'GEOREFERENCIACIÓN']) >= 0;
  }
  function extractVisitas(rows) {
    var h = findHeaderRow(rows, ['IDENTIFICACIÓN DEL BENEFICIARIO', 'GEOREFERENCIACIÓN']);
    if (h < 0) throw new Error('El archivo no tiene las columnas del consolidado de visitas.');
    var header = rows[h];
    var idx = headerIndex(header);
    var C = function (n) { return col(idx, n); };
    var findStart = function (prefix) {
      var p = norm(prefix);
      for (var i = 0; i < header.length; i++) if (norm(header[i]).indexOf(p) === 0) return i;
      return -1;
    };
    var c = {
      doc: C('IDENTIFICACIÓN DEL BENEFICIARIO'), nombre: C('NOMBRE DEL BENEFICIARIO'), periodo: C('PERIODO'), semana: C('SEMANA'),
      tipoVisita: C('Tipo de Visita'), distancia: C('RANGO DISTANCIA RESIDENCIA - SEDE COLEGIO (Kilometros)'),
      origen: C('PQRS / TUTELA'), num: C('# VISITA'), sticker: C('STICKER VISITA'), fecha: C('FECHA VISITA'),
      verificador: C('USUARIO VERIFICADOR'), dirCorrecta: findStart('ASPECTO A EVALUAR 1'), habita: findStart('PREGUNTA 1'),
      estudia: findStart('PREGUNTA 2'), estado: C('ESTADO FINAL DE LA(S) VISITA(S) DOMICILIARIA(S)'), disc: C('DISCAPACIDAD'),
      obs: C('OBSERVACION'), grado: C('GRADO'), jornada: C('JORNADA'), georef: C('GEOREFERENCIACIÓN'),
      recom: findStart('RECOMENDACIÓN FINAL'), colegio: C('COLEGIO MATRICULA'), sede: C('SEDE MATRICULA'),
      loc: C('LOCALIDAD RESIDENCIA'), locCol: C('LOCALIDAD COLEGIO MATRICULA'),
      lat: C('LATITUD'), lon: C('LONGITUD'), dirVisita: C('DIRECCION DONDE SE REALIZA LA VISITA'), dirBen: C('DIRECCIÓN BENEFICIO'),
      daneSede: C('CODIGO DANE SEDE MATRICULA'), dirSede: C('DIRECCION SEDE - COLEGIO')
    };
    var g = function (r, i) { return i >= 0 ? r[i] : null; };
    var out = [];
    for (var i = h + 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      var doc = normDoc(g(r, c.doc));
      if (!doc) continue;
      out.push({
        doc: doc, nombre: txt(g(r, c.nombre)), periodo: txt(g(r, c.periodo)), semana: txt(g(r, c.semana)),
        num: txt(g(r, c.num)), fecha: excelDate(g(r, c.fecha)), tipoVisita: txt(g(r, c.tipoVisita)),
        origen: txt(g(r, c.origen)), distancia: num(g(r, c.distancia)), sticker: txt(g(r, c.sticker)),
        verificador: txt(g(r, c.verificador)), dirCorrecta: txt(g(r, c.dirCorrecta)), habita: txt(g(r, c.habita)),
        estudia: txt(g(r, c.estudia)), estado: txt(g(r, c.estado)), disc: txt(g(r, c.disc)), obs: txt(g(r, c.obs)),
        grado: txt(g(r, c.grado)), jornada: txt(g(r, c.jornada)), georef: txt(g(r, c.georef)), recom: txt(g(r, c.recom)),
        colegio: txt(g(r, c.colegio)), sede: txt(g(r, c.sede)), loc: txt(g(r, c.loc)), locCol: txt(g(r, c.locCol)),
        lat: num(g(r, c.lat)), lon: num(g(r, c.lon)), dirVisita: txt(g(r, c.dirVisita)), dirBen: txt(g(r, c.dirBen)),
        daneSede: normDoc(g(r, c.daneSede)), dirSede: txt(g(r, c.dirSede))
      });
    }
    return out;
  }

  // ---------- Empaquetado compacto (columnar con diccionario de textos) ----------
  function pack(records, fields) {
    var dict = [], dmap = new Map(), cols = {};
    fields.forEach(function (f) { cols[f] = []; });
    records.forEach(function (rec) {
      fields.forEach(function (f) {
        var v = rec[f];
        if (typeof v === 'string') {
          var id = dmap.get(v);
          if (id === undefined) { id = dict.length; dict.push(v); dmap.set(v, id); }
          cols[f].push(id);
        } else cols[f].push(v == null ? null : { n: v });
      });
    });
    // números se guardan como {n:valor}; textos como índice de diccionario
    fields.forEach(function (f) {
      cols[f] = cols[f].map(function (x) { return x && typeof x === 'object' ? (x.n === null ? null : [x.n]) : x; });
    });
    return { n: records.length, dict: dict, cols: cols, fields: fields };
  }
  function unpack(p) {
    var out = new Array(p.n);
    for (var i = 0; i < p.n; i++) {
      var o = {};
      for (var k = 0; k < p.fields.length; k++) {
        var f = p.fields[k], x = p.cols[f][i];
        o[f] = x == null ? null : (Array.isArray(x) ? x[0] : p.dict[x]);
      }
      out[i] = o;
    }
    return out;
  }

  var LIQ_FIELDS = ['doc', 'lote', 'fuente', 'contar', 'archivo', 'cicloAb', 'anexo', 'tipoBen', 'estado', 'tipoTrans', 'tipoPago',
    'dias', 'fj', 'fi', 'total', 'pago', 'tarjeta', 'subtotal', 'decision', 'obs', 'obsVis', 'obsAsis', 'obsPago', 'evalTipo',
    'evalGrupo', 'dist', 'rutas', 'key', 'medios', 'fechaExc', 'totInj', 'ajustes'];
  var EST_FIELDS = ['doc', 'nombre', 'tipoDoc', 'colegio', 'sede', 'dane', 'jornada', 'grado', 'locRes', 'tipoTrans', 'tipoPago',
    'disc', 'edad', 'tipoBen', 'estado', 'lote'];
  var VIS_FIELDS = ['doc', 'nombre', 'periodo', 'semana', 'num', 'fecha', 'tipoVisita', 'origen', 'distancia', 'sticker',
    'verificador', 'dirCorrecta', 'habita', 'estudia', 'estado', 'disc', 'obs', 'grado', 'jornada', 'georef', 'recom', 'colegio', 'sede', 'loc', 'locCol', 'lat', 'lon', 'dirVisita', 'dirBen', 'daneSede', 'dirSede'];


  // ---------- Consolidado de pagos ----------
  function isPagos(rows) {
    return findHeaderRow(rows, ['CICLO EN LIQUIDACION', 'ESTADO DE PAGO']) >= 0;
  }
  function extractPagos(rows) {
    var h = findHeaderRow(rows, ['CICLO EN LIQUIDACION', 'ESTADO DE PAGO']);
    if (h < 0) throw new Error('El archivo no tiene las columnas del consolidado de pagos.');
    var idx = headerIndex(rows[h]);
    var C = function (n) { return col(idx, n); };
    var docCols = idx[norm('NUMERO_DOCUMENTO')] || [];
    var c = { lote: C('CICLO EN LIQUIDACION'), key: C('KEY'), cicloAb: C('CICLOABONADO'), est: C('ESTADO DE PAGO'), raz: C('RAZON DE NO PAGO'),
      fa: C('FECHA_ABONO_DISPERSION'), fi: C('FECHA INICIO VIGENCIA BASE'), ff: C('FECHA FINAL VIGENCIA BASE'), fmr: C('FECHA MAXIMA RECLAMACION'),
      fc: C('FECHA DE COBRO'), medio: C('MEDIO_DE_PAGO'), medio2: C('MEDIO DE PAGO'), val: C('PAGO_SUBSIDIO'), sub: C('SUBTOTAL'),
      dec: C('PAGAR - NO PAGAR'), estLiq: C('ESTADO LIQUIDACION') };
    var g = function (r, i) { return i >= 0 ? r[i] : null; };
    var d = function (v) { var t = excelDate(v); return /^(N\/A|N\/D|#N\/A)$/i.test(t) ? '' : t; };
    var out = [];
    for (var i = h + 1; i < rows.length; i++) {
      var r = rows[i]; if (!r) continue;
      var doc = ''; for (var j = 0; j < docCols.length && !doc; j++) doc = normDoc(r[docCols[j]]);
      var key = txt(g(r, c.key)); if (!doc && !key) continue;
      var medio = txt(g(r, c.medio)); if (!medio || /^(N\/A|N\/D|#N\/A)$/i.test(medio)) medio = txt(g(r, c.medio2));
      out.push({ doc: doc, pid: key.split('_')[0], lote: txt(g(r, c.lote)).replace(/^LIQUIDACION\s*/i, ''), cicloAb: txt(g(r, c.cicloAb)),
        est: txt(g(r, c.est)), raz: txt(g(r, c.raz)), fa: d(g(r, c.fa)), fi: d(g(r, c.fi)), ff: d(g(r, c.ff)), fmr: d(g(r, c.fmr)),
        fc: d(g(r, c.fc)), medio: /^(N\/A|N\/D|#N\/A)$/i.test(medio) ? '' : medio, val: num(g(r, c.val)), sub: num(g(r, c.sub)), dec: txt(g(r, c.dec)) });
    }
    return out;
  }
  var PAG_FIELDS = ['doc', 'pid', 'lote', 'cicloAb', 'est', 'raz', 'fa', 'fi', 'ff', 'fmr', 'fc', 'medio', 'val', 'sub', 'dec'];

  function detectKind(rows) { return isPagos(rows) ? 'pag' : isLiquidacion(rows) ? 'liq' : isVisitas(rows) ? 'vis' : null; }
  return {
    detectKind: detectKind, norm: norm, isPagos: isPagos, extractPagos: extractPagos, PAG_FIELDS: PAG_FIELDS, normDoc: normDoc, isLiquidacion: isLiquidacion, isVisitas: isVisitas,
    extractLiquidacion: extractLiquidacion, extractVisitas: extractVisitas, pack: pack, unpack: unpack,
    LIQ_FIELDS: LIQ_FIELDS, EST_FIELDS: EST_FIELDS, VIS_FIELDS: VIS_FIELDS
  };
})();
if (typeof module !== 'undefined') module.exports = STE;
