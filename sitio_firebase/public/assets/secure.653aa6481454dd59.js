// La sesión y los resultados existen solo en memoria; nunca se descarga la base.
let session=null,epoch=0,queryEpoch=0,dashEpoch=0,idleTimer=null,sessionTimer=null;
const originalSearch=search;
async function api(action,body={}){
  const response=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+await STEAuth.token()},body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error'});
  let data;try{data=await response.json();}catch{throw Error('La API no está disponible. Revise la instalación del servidor.');}
  if(!response.ok){if(response.status===401)await closeSession();throw Error(data.error||'No fue posible completar la operación.');}
  return data;
}
function emptyMemory(){
  DATA={version:2,sources:[],visitas:null,pagos:null};LIQ.clear();EST.clear();VIS.clear();PAG.clear();PAGDOC.clear();VISALL=[];VPREP=[];LOTES=[];
  for(const key of Object.keys(TABLES))delete TABLES[key];
  if(MAP){MAP.remove();MAP=null;}
  ['#out','#dash','#infoData','#log','#list-liq','#list-vis','#list-pag'].forEach(s=>{if($(s))$(s).textContent='';});
  $('#q').value='';$('#dataStatus').textContent='Inicie sesión para consultar la base compartida';
}
async function closeSession(){
  epoch++;queryEpoch++;dashEpoch++;session=null;clearTimeout(idleTimer);clearTimeout(sessionTimer);emptyMemory();
  $('#workspace').hidden=true;$('#authPanel').hidden=false;$('#accountPanel').hidden=true;
  $('#dlg').close();$('#onboarding').hidden=true;$('#loginForm').hidden=false;
  await STEAuth.logout();
}
function touch(){if(session){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{closeSession();$('#authMessage').textContent='Sesión cerrada por 15 minutos de inactividad.';},15*60*1000);}}
async function metadata(){
  const e=epoch,m=await api('metadata');if(e!==epoch||!session)return;
  const liq=m.sources.reduce((n,s)=>n+s.n,0);
  $('#dataStatus').textContent=`Base compartida · ${fmtN(liq)} liquidaciones · ${fmtN(m.visitas?.n||0)} visitas · ${fmtN(m.pagos?.n||0)} pagos`;
  const show=(id,items)=>{
    $('#st-'+id).textContent=items.length?'Cargado':'Sin cargar';
    $('#list-'+id).innerHTML=items.length?'<ul>'+items.map(s=>`<li>${esc(s.name)} · ${fmtN(s.n)} registros · ${esc(s.cargado||'')}</li>`).join('')+'</ul>':'<p>Sin archivos cargados.</p>';
  };
  show('liq',m.sources);show('vis',m.visitas?[m.visitas]:[]);show('pag',m.pagos?[m.pagos]:[]);
}
// Construir índices únicamente con el expediente individual devuelto por la API.
buildIndex=function(){
  LIQ=new Map();EST=new Map();VIS=new Map();PAG=new Map();PAGDOC=new Map();VISALL=[];
  const lots=new Set();
  for(const s of DATA.sources){
    Object.keys(s.lotes).forEach(l=>lots.add(l));
    for(const r of STE.unpack(s.rows)){if(!LIQ.has(r.doc))LIQ.set(r.doc,[]);LIQ.get(r.doc).push(r);}
    for(const e of STE.unpack(s.est))EST.set(e.doc,e);
  }
  for(const v of DATA.visitas?STE.unpack(DATA.visitas.rows):[]){if(!VIS.has(v.doc))VIS.set(v.doc,[]);VIS.get(v.doc).push(v);VISALL.push(v);}
  for(const p of DATA.pagos?STE.unpack(DATA.pagos.rows):[]){PAG.set(p.pid+'|'+p.cicloAb+'|'+p.lote,p);PAG.set('D'+p.doc+'|'+p.cicloAb+'|'+p.lote,p);if(!PAGDOC.has(p.doc))PAGDOC.set(p.doc,[]);PAGDOC.get(p.doc).push(p);}
  LOTES=[...lots].sort((a,b)=>loteOrder(a)-loteOrder(b));
};
search=async function(raw){
  const id=++queryEpoch,e=epoch;
  $('#out').textContent='Consultando…';
  // Borrar el expediente anterior incluso si la siguiente consulta falla.
  DATA={sources:[],visitas:null,pagos:null};buildIndex();
  try{
    const data=await api('consult',{doc:String(raw).trim()});
    if(e!==epoch||id!==queryEpoch||!session)return;
    DATA=data;buildIndex();
    if(!hasData()){$('#out').textContent='No se encontró el documento solicitado.';return;}
    originalSearch(raw);
  }catch(err){if(e===epoch&&id===queryEpoch)$('#out').textContent=err.message;}
};
// No se envían coordenadas de consultas a proveedores externos de mapas.
// Mapa de la vivienda habilitado para consulta autorizada

prepDash=function(){};
renderInfoData=function(){};
downloadCsv=function(){};
renderDash=async function(){
  if(!session)return;
  const id=++dashEpoch,e=epoch,rangeError=STECore.dateRangeError(DF.from,DF.to);
  $('#fFrom').setAttribute('aria-invalid',rangeError?'true':'false');$('#fTo').setAttribute('aria-invalid',rangeError?'true':'false');
  if(rangeError){$('#fNote').textContent=rangeError;$('#dash').textContent='';return;}
  $('#dash').textContent='Consultando cifras…';
  try{
    const m=await api('dashboard',DF);if(e!==epoch||id!==dashEpoch||!session)return;
    $('#fLoc').innerHTML='<option value="">Todas las localidades</option>'+m.locations.map(l=>`<option value="${esc(l)}">${esc(l)}</option>`).join('');$('#fLoc').value=DF.loc;
    const unit=DF.unit==='vis'?'visitas':'beneficiarios';
    $('#fNote').textContent=`${fmtN(m.n)} ${unit} · ${DF.loc||'Todas las localidades'} · base compartida`;
    const cards=[['Registros',fmtN(m.n)],['Beneficiarios distintos',fmtN(m.docs)],['Recomendación PAGAR',fmtN(m.pay)],['Recomendación NO PAGAR',fmtN(m.nopay)],['Visitas efectivas',fmtN(m.effective)],['No cumplen distancia',fmtN(m.notDistance)],['Distancia mediana',km(m.median)],['Distancia promedio',km(m.average)]];
    if(DF.unit==='vis')cards.push(['Revisitas',fmtN(m.revisits)]);
    const chart=(title,groups)=>`<section class="card"><h2>${esc(title)}</h2>${LEGEND}${hbars(groups,unit)}<details><summary>Ver cifras</summary><table><thead><tr><th>Grupo</th><th>Total</th><th>Pagar</th><th>No pagar</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${esc(g.k)}</td><td>${g.n}</td><td>${g.pay}</td><td>${g.nopay}</td></tr>`).join('')}</tbody></table></details></section>`;
    $('#dash').innerHTML='<div class="kpis">'+cards.map(([label,n])=>`<div class="kpi"><div class="k">${esc(label)}</div><div class="v">${n}</div></div>`).join('')+'</div><div class="dash-grid">'+chart('Localidad (todas)',m.locality)+chart('Resultado',m.result)+chart('Semana',m.week)+chart('Motivo de NO PAGAR',m.reasons)+chart('Distancia casa – sede',m.distance)+chart('Origen',m.origin)+'</div>';
    if(m.quality.attendedNotEffective||m.quality.invalidCoordinates)$('#dash').innerHTML+=`<p class="hint">Revisar en origen: ${m.quality.attendedNotEffective} visitas atendidas con estado distinto de efectiva; ${m.quality.invalidCoordinates} coordenadas fuera del área admitida. Los registros no se han alterado.</p>`;
  }catch(err){if(e===epoch&&id===dashEpoch)$('#dash').textContent=err.message;}
};
const log=m=>{$('#log').textContent+=m+'\n';};
let importQueue=Promise.resolve();
async function gzip64(value){
  const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  if(bytes.length>12*1024*1024)throw Error('La carga comprimida supera 12 MB. Divida el archivo.');
  let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);
}
function loadFiles(files,expected){
  const e=epoch;
  const op=importQueue.then(async()=>{
    for(const file of files){
      if(e!==epoch||!session?.upload)return;
      try{
        STECore.validateFile(file);log('Validando '+file.name+'…');
        const book=XLSX.read(await file.arrayBuffer(),{type:'array',dense:true,sheetRows:STECore.MAX_ROWS+16});
        const sheet=book.Sheets[book.SheetNames[0]];if(!sheet||sheet['!fullref'])throw Error('Hoja vacía o con demasiadas filas.');
        const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null});
        STECore.readImport(rows,file.name,expected);
        const gzip=await gzip64({rows,name:file.name,expected:expected||null});
        if(e!==epoch||!session?.upload)return;
        await api('upload',{gzip});
        if(e!==epoch||!session)return;
        log('✓ '+file.name+': guardado cifrado en la base compartida.');await metadata();if(currentView==='tablero')await renderDash();
        DATA={sources:[],visitas:null,pagos:null};buildIndex();$('#out').textContent='La base se actualizó. Consulte de nuevo el documento.';
      }catch(err){if(e===epoch)log('✗ '+file.name+': '+err.message);}
    }
  });importQueue=op.catch(()=>{});return op;
}
async function enter(){
  const e=epoch,s=await api('session');if(e!==epoch)return;
  $('#loginForm').hidden=true;$('#onboarding').hidden=false;
  $('#verifyEmail').hidden=s.verified;$('#refreshEmail').hidden=s.verified;$('#passwordForm').hidden=!s.verified||!s.mustChange;
  if(!s.verified){$('#authMessage').textContent='Verifique su correo con el botón y abra el enlace recibido. Luego pulse Ya verifiqué mi correo.';return;}
  if(s.mustChange){$('#authMessage').textContent='Antes de acceder, cambie su contraseña inicial por una personal.';return;}
  session=s;$('#authPanel').hidden=true;$('#accountPanel').hidden=false;$('#workspace').hidden=false;
  $('#accountEmail').textContent=s.email;$('#btnDatos').hidden=!s.upload;
  touch();sessionTimer=setTimeout(()=>{closeSession();$('#authMessage').textContent='La sesión de 60 minutos terminó. Inicie sesión de nuevo.';},60*60*1000);
  await metadata();if(currentView==='tablero')await renderDash();
}
(async function initSecure(){
  // Elimina la caché privada creada por versiones anteriores de esta herramienta.
  try{const r=indexedDB.deleteDatabase('consulta-ste');r.onerror=()=>{};}catch{}
  $('#loading').remove();emptyMemory();initNav();initDash();
  if(new URLSearchParams(location.search).has('doc'))history.replaceState(null,'',location.pathname+location.hash);
  $('#loginForm').addEventListener('submit',async ev=>{
    ev.preventDefault();const button=$('#loginButton');button.disabled=true;$('#authMessage').textContent='Validando acceso…';
    try{await STEAuth.login($('#email').value.trim(),$('#password').value);$('#password').value='';await enter();}
    catch(err){await closeSession();$('#authMessage').textContent=err.message.startsWith('Firebase:')?'No fue posible iniciar sesión. Revise las credenciales y que su cuenta esté autorizada.':err.message;}
    finally{button.disabled=false;$('#password').value='';}
  });
  $('#verifyEmail').addEventListener('click',async()=>{try{await STEAuth.verify();$('#authMessage').textContent='Correo de verificación enviado.';}catch{$('#authMessage').textContent='No se pudo enviar la verificación. Espere unos minutos.';}});
  $('#refreshEmail').addEventListener('click',async()=>{try{await STEAuth.refresh();await enter();}catch(err){$('#authMessage').textContent=err.message;}});
  $('#passwordForm').addEventListener('submit',async ev=>{ev.preventDefault();try{if($('#newPassword').value!==$('#confirmPassword').value)throw Error('Las contraseñas no coinciden.');await api('password',{password:$('#newPassword').value});await closeSession();$('#authMessage').textContent='Contraseña actualizada. Inicie sesión con su nueva contraseña.';}catch(err){$('#authMessage').textContent=err.message;}finally{$('#newPassword').value='';$('#confirmPassword').value='';}});
  $('#resetPassword').addEventListener('click',async()=>{try{await STEAuth.reset($('#email').value.trim());}catch{}$('#authMessage').textContent='Si la cuenta existe y permite recuperación, recibirá un correo con instrucciones.';});
  $('#logout').addEventListener('click',()=>closeSession());$('#cancelLogin').addEventListener('click',()=>closeSession());
  $('#form').addEventListener('submit',ev=>{ev.preventDefault();search($('#q').value);});
  $('#btnDatos').addEventListener('click',async()=>{try{await metadata();if(session)$('#dlg').showModal();}catch(err){$('#dataStatus').textContent=err.message;}});
  $('#dlgClose').addEventListener('click',()=>$('#dlg').close());
  document.querySelectorAll('input[type=file]').forEach(input=>input.addEventListener('change',ev=>{const files=[...ev.target.files];ev.target.value='';if(files.length)loadFiles(files,input.dataset.kind);}));
  ['dragenter','dragover','dragleave','drop'].forEach(t=>$('#drop').addEventListener(t,e=>e.preventDefault()));$('#drop').addEventListener('drop',ev=>loadFiles([...ev.dataTransfer.files]));
  ['pointerdown','keydown'].forEach(t=>document.addEventListener(t,touch,{passive:true}));
  window.addEventListener('pagehide',()=>{emptyMemory();STEAuth.logout();});
})();
