/* =================== AGENDA =================== */
function contarVisitas(){if(nube()&&S.visitas)return S.visitas;const m={};S.citas.forEach(c=>{if(c.estado==='atendida'){const k=telKey(c.cliente?.tel);if(k)m[k]=(m[k]||0)+1}});return m}
/* ---------- citas bajo demanda (la base de datos solo entrega lo que se ve) ---------- */
const nube=()=>API.remote&&!!S.ventana;
function mezclar(items){S.extra=S.extra||new Map();items.forEach(c=>{S.extra.set(c.id,c);S.known?.add(c.id)});if(!S.extra.size)return;const ids=new Set(S.citas.map(c=>c.id));S.citas=S.citas.concat([...S.extra.values()].filter(c=>!ids.has(c.id)))}
const cubre=(d,h)=>!nube()||(d>=S.ventana.desde&&h<=S.ventana.hasta)||S.rangosOk?.has(d+'|'+h);
async function paginas(qs,tope=20000){let cur='',all=[];do{const r=await API.req('GET',`/citas/buscar?${qs}&limit=500${cur?'&cursor='+encodeURIComponent(cur):''}`);all=all.concat(r.items);cur=r.siguiente}while(cur&&all.length<tope);return all}
async function traerRango(d,h){const k=d+'|'+h;S.trayendo=S.trayendo||new Set();if(cubre(d,h)||S.trayendo.has(k))return false;S.trayendo.add(k);
 try{mezclar(await paginas(`desde=${d}&hasta=${h}`,60000));S.rangosOk.add(k);return true}catch(e){toast('⚠️ '+e.message);return false}finally{S.trayendo.delete(k)}}
/* Historial completo: solo para Clientes, Dashboard y Excel (se pide una vez y se guarda hasta que algo cambie). */
async function historial(){if(!nube())return S.citas;if(S.hist)return S.hist;toast('⏳ Cargando historial…');S.hist=await paginas('');mezclar([]);return S.hist}
const todas=()=>(S.hist||S.citas).filter(mine);
async function buscarServidor(key,off){const [q,f,b]=key.split('|'),est=f==='todos'?'':f==='cancelada'?'cancelada,expirada':f;
 try{const r=await API.req('GET',`/citas/buscar?q=${encodeURIComponent(q)}${est?'&estado='+est:''}${b?'&barbero='+b:''}&limit=30&offset=${off}`);mezclar(r.items);
  if([S.q.trim().toLowerCase(),S.filtro,S.barbF].join('|')!==key)return;S.busq=off&&S.busq?.key===key?{key,items:S.busq.items.concat(r.items),total:r.total}:{key,items:r.items,total:r.total};renderLista()}catch(e){toast('⚠️ '+e.message)}}
function renderAgenda(){
 {const r=esRango()?rangoAg():{desde:S.fecha,hasta:S.fecha};if(!cubre(r.desde,r.hasta))traerRango(r.desde,r.hasta).then(ok=>{if(ok&&S.tab==='agenda')renderAgenda()})}
 const all=scope(),dia=esRango()?all.filter(enRango):all.filter(c=>c.fecha===S.fecha),pv=all.filter(c=>c.estado==='por_validar').length,demo=S.citas.some(c=>c.demo);
 const dias=[];for(let i=-1;i<7;i++)dias.push(addD(hoy(),i));if(!esRango()&&!dias.includes(S.fecha))dias.push(S.fecha);
 const cuenta=f=>all.filter(c=>c.fecha===f&&activa(c)).length;
 const filtros=[];if(S.barbF)filtros.push(`<span class="fchip" data-on-click="a0f7565b8">💈 ${esc(barb(S.barbF)?.nombre||'')} ✕</span>`);if(S.filtro!=='todos')filtros.push(`<span class="fchip">${est(S.filtro).i} ${esc(est(S.filtro).t)}</span>`);
 if(filtros.length||S.q)filtros.push(`<span class="fchip x" data-on-click="a288921b1">✕ Limpiar</span>`);
 $('#t-agenda').innerHTML=`
 ${demo&&can('config')?`<div class="banner pu">🧪 <b>Estás viendo datos de ejemplo.</b> Prueba todo libremente; cuando estés listo pon tus datos en ⚙️ Config y borra los ejemplos.<div class="row"><button class="btn sm" data-on-click="aa8fc6a26">⚙️ Ir a Config</button><button class="btn sm r" data-on-click="aac281993">🧹 Quitar ejemplos</button></div></div>`:''}
 ${can('config')&&pagoOn()&&!S.cfg.yapeNum?`<div class="banner">⚠️ Falta tu número de Yape. Sin él, el formulario no cobra el adelanto. <span style="text-decoration:underline;cursor:pointer" data-on-click="aa7c933c5">Configurar</span></div>`:''}
 <div class="stats">
  <div class="stat" data-on-click="ae8344bc8"><b style="color:var(--grn)">${dia.filter(c=>activa(c)).length}</b><span>📅 Citas ${S.fecha==='semana'?'de la semana':S.fecha==='mes'?'del mes':S.fecha===hoy()?'de hoy':'del día'}</span></div>
  <div class="stat" data-on-click="a60584dd9"><b style="color:var(--red)">${pv}</b><span>🟡 Yape por validar</span></div>
  <div class="stat" data-on-click="a0241ca29"><b style="color:var(--blue)">${dia.filter(c=>c.estado==='confirmada'||c.estado==='en_silla').length}</b><span>🔵 Por atender</span></div>
  <div class="stat" data-on-click="aecac7f70"><b style="color:var(--pur)">${dia.filter(c=>c.estado==='atendida').length}</b><span>✅ Atendidos</span></div>
 </div>
 <div class="card">
  <div class="row"><div class="search">🔍<input id="q" placeholder="Buscar nombre, DNI, celular, código…" value="${esc(S.q)}" data-on-input="aceafc09c">${isAdmin()?`<button class="ibtn bare" data-on-click="aa169ac47">⚙️</button>`:''}</div></div>
  ${S.showF&&isAdmin()?`<select class="in" style="margin-top:10px" data-on-change="a723f4fa0"><option value="">💈 Todos los barberos</option>${S.barberos.map(b=>`<option value="${b.id}" ${S.barbF===b.id?'selected':''}>${esc(b.nombre)}</option>`).join('')}</select>`:''}
  <p class="hint" id="qHint" style="margin:8px 0 0;${S.q.trim()?'':'display:none'}">🔎 Buscando en <b style="color:var(--tx)">todas las fechas</b></p>
  ${filtros.length?`<div class="row" style="margin-top:10px;flex-wrap:wrap">${filtros.join('')}</div>`:''}
  <div class="days">${[['semana','Semana','🗓️'],['mes','Mes','📆']].map(([k,l,i])=>{const n=all.filter(c=>c.fecha>=hoy()&&activa(c)&&(k==='semana'?c.fecha<=addD(hoy(),6):c.fecha.slice(0,7)===hoy().slice(0,7))).length;return `<button class="day ${S.fecha===k?'on':''}" data-on-click="a18a90d39" data-p0="${k}">${n?`<i>${n}</i>`:''}<small>${l}</small><b>${i}</b><small>${k==='semana'?'lun–dom':'completo'}</small></button>`}).join('')}${dias.map(f=>{const d=pYmd(f),n=cuenta(f);return `<button class="day ${f===S.fecha?'on':''}" data-on-click="a9eb70928" data-p0="${f}">${n?`<i>${n}</i>`:''}<small>${f===hoy()?'Hoy':f===addD(hoy(),1)?'Mañ':DIAS[d.getDay()]}</small><b>${d.getDate()}</b><small>${MESC[d.getMonth()]}</small></button>`}).join('')}<label class="day cal">📅<input type="date" data-on-change="a045aa24d"></label></div>
  ${esRango()?`<div class="row" style="margin-top:10px;justify-content:space-between"><button class="btn sm" data-on-click="a16064d4b">‹</button><b style="text-transform:capitalize;text-align:center;flex:1">${S.fecha==='semana'?'Semana':'Mes'} · ${rangoAg().t}${(+S.off||0)?` <button class="btn sm" data-on-click="a7e972fb6">Hoy</button>`:''}</b><button class="btn sm" data-on-click="afb485eea">›</button></div>`:''}
  <div class="chiprow"><button class="chip ${S.filtro==='todos'?'on':''}" data-on-click="ac1bc02aa">Todos<i class="cc">${dia.filter(c=>c.estado!=='expirada').length}</i></button><div class="chips">${FILTROS.slice(1).map(k=>{const n=['por_validar'].includes(k)?all.filter(c=>c.estado===k).length:dia.filter(c=>k==='cancelada'?['cancelada','expirada'].includes(c.estado):c.estado===k).length;return `<button class="chip ${S.filtro===k?'on':''}" data-on-click="a180b68a0" data-p0="${k}">${est(k).i} ${esc(est(k).t)}${n?`<i class="cc">${n}</i>`:''}</button>`}).join('')}</div></div>
  <p class="hint" style="margin-top:4px;font-size:11px">Toca 2 veces "Todos" para ver todas las etiquetas</p>
  <div class="tools">${can('dash')?`<button class="tool" title="Clientes" data-on-click="a9f1c1a7e">👥</button>`:''}${can('verMontos')?`<button class="tool" title="Caja" data-on-click="a0211b28c">📊</button>`:''}<button class="tool" title="Actualizar" data-on-click="a1d5ed7f2">🔄</button><button class="tool" title="Ayuda" data-on-click="a6f742281">📖</button>${isAdmin()&&can('crear')?`<button class="tool" title="Mover citas a otro día" data-on-click="a9080fa1d">📅</button>`:''}${can('crear')?`<button class="tool p" title="Nueva cita" data-on-click="ab17bc635">➕</button>`:''}${S.cfg.modWalkin&&can('crear')?`<button class="tool pu" title="Cliente sin cita" data-on-click="adb1da1e1">⚡</button>`:''}</div>
 </div>
 <div id="lista"></div>`;
 $('#t-agenda').insertAdjacentHTML('afterbegin','<div id="nextBox"></div>');renderNext();renderLista();
}
/* ---- tiempo para la próxima cita ---- */
const startTs=c=>{const[y,m,d]=c.fecha.split('-').map(Number),[H,M]=(c.hora||'00:00').split(':').map(Number);return new Date(y,m-1,d,H,M).getTime()};
function falta(ts){const m=Math.round((ts-Date.now())/60000);if(m>=0){if(m<1)return'ahora';if(m<60)return`en ${m} min`;const h=Math.floor(m/60),r=m%60;if(h<24)return`en ${h} h${r?' '+r+' min':''}`;const d=Math.round(m/1440);return d===1?'mañana':`en ${d} días`}const a=-m;return a<60?`hace ${a} min`:`hace ${Math.floor(a/60)} h`}
function cdLabel(ts){return ts-Date.now()<=0?'🕘 Es su hora':`⏳ ${falta(ts)}`}
const faltaHasta=ts=>ts-Date.now()<=0?'es su hora':falta(ts);
const ESPERA=['confirmada','por_validar'];
const hms=x=>{x=Math.max(0,Math.floor(x));const h=Math.floor(x/3600),m=Math.floor(x%3600/60),z=x%60;return(h?pad(h)+':':'')+pad(m)+':'+pad(z)};
function fmtFalta(d){d=Math.max(0,Math.floor(d));if(d<3600)return `${Math.floor(d/60)} min ${pad(d%60)} s`;return `${Math.floor(d/3600)} h ${Math.floor(d%3600/60)} min`}
/* Cuenta regresiva hasta la hora de la cita. Al llegar la hora se detiene ("Es su hora"); en silla, atendido o cancelado no se muestra. */
function chrono(c){if(!ESPERA.includes(c.estado)||!activa(c))return'';
 const ts=startTs(c),d=(ts-Date.now())/1000;if(d>12*3600)return'';
 if(d<=0)return `<span class="chr late">🕘 Es su hora</span>`;
 return `<span class="chr ${d<900?'warn':''}" data-cdn="${ts}" title="Tiempo que falta para su cita" ${can('crear')?`data-on-click="a18add9c0" data-p0="${c.id}"`:''}>⏳ Faltan ${fmtFalta(d)}</span>`}
function tickSec(){const now=Date.now();
 $$('[data-cdn]').forEach(e=>{const d=(e.dataset.cdn-now)/1000;if(d<=0){e.textContent='🕘 Es su hora';e.classList.remove('warn');e.classList.add('late');e.removeAttribute('data-cdn');return}e.textContent='⏳ Faltan '+fmtFalta(d);e.classList.toggle('warn',d<900)})}
function cdTag(c){if(!ESPERA.includes(c.estado)||!activa(c))return'';const ts=startTs(c);if(ts-Date.now()>7*864e5||ts<Date.now()-12*36e5)return'';return `<span class="tag cd ${ts<Date.now()-60000?'late':''}" data-cd="${ts}">${cdLabel(ts)}</span>`}
function gNext(bid){const now=Date.now(),cs=S.citas.filter(c=>c.barberoId===bid&&c.fecha===hoy()&&activa(c));const silla=cs.find(c=>c.estado==='en_silla');const nx=cs.filter(c=>ESPERA.includes(c.estado)&&startTs(c)>now-15*60000).sort((a,b)=>startTs(a)-startTs(b))[0];
 return `<span class="gnx">${silla?'💺 Atendiendo a '+esc(silla.cliente?.nombre?.split(' ')[0]||'')+' · ':'🟢 Libre · '}${nx?`próx. ${h12(nx.hora)} (<b data-cdt="${startTs(nx)}">${falta(startTs(nx))}</b>)`:'sin más citas hoy'}</span>`}
function proxima(){const now=Date.now();return scope().filter(c=>ESPERA.includes(c.estado)&&activa(c)&&startTs(c)>now-90*60000).sort((a,b)=>startTs(a)-startTs(b))[0]}
function renderNext(){const el=$('#nextBox');if(!el)return;const c=proxima();if(!c){el.innerHTML='';return}const ts=startTs(c),late=ts<Date.now()-60000,b=barb(c.barberoId),silla=scope().filter(x=>x.estado==='en_silla'&&x.fecha===hoy());
 el.innerHTML=`<div class="next ${late?'late':''}"><div class="row"><span class="lbl">${late?'🕘 YA ES SU HORA':'⏳ PRÓXIMA CITA'}</span><b class="big2" data-cdb="${ts}">${late?'Es su hora':falta(ts)}</b></div>
 <div class="row" style="margin-top:8px">${avatar(b)}<div style="flex:1;min-width:0"><b style="font-size:16px">${esc(c.cliente?.nombre||'')}</b> <span class="pill" style="color:${est(c.estado).c};border-color:${est(c.estado).c}">${est(c.estado).i} ${esc(est(c.estado).t)}</span><p class="hint" style="margin:0">${c.fecha===hoy()?'Hoy':fLarga(c.fecha)} ${h12(c.hora)} · ✂️ ${esc(c.servicioNombre)} · 💈 ${esc(b?.nombre||'')}</p></div>${c.cliente?.tel?`<button class="rb al ${c.avisado?'ok':''}" title="${c.avisado?'Ya se le avisó':'Avisarle por WhatsApp'}" data-on-click="a3b2a7c8c" data-p0="${c.id}">⏰</button>`:''}</div>
 ${late&&can('cancelar')?`<div class="row" style="margin-top:10px"><button class="btn sm" style="flex:1" data-on-click="ac75f11b7" data-p0="${c.id}">💺 Ya llegó</button><button class="btn sm r" style="flex:1" data-on-click="ad5a2be51" data-p0="${c.id}">❌ No vino</button></div>`:''}
 ${silla.length?`<p class="hint" style="margin-top:8px">💺 En silla: ${silla.map(x=>`${esc(x.cliente?.nombre?.split(' ')[0]||'')} con ${esc(barb(x.barberoId)?.nombre||'')}${x.enSillaTs?` (${Math.round((Date.now()-x.enSillaTs)/60000)} min)`:''}`).join(' · ')}</p>`:''}</div>`;hydrate(el)}
/* Avisa al cliente por WhatsApp y deja marcado (en verde) que ya se le avisó. */
function recordar(id){const c=cita(id);if(!c?.cliente?.tel)return toast('Esa cita no tiene teléfono');
 abrirWA(c.cliente.tel,tpl(S.cfg.waRecuerda,c));
 c.avisado=Date.now();renderNext();renderProx();renderLista?.();toast('⏰ Avisado · marcado en verde');
 API.updateCita(id,{avisado:c.avisado}).catch(()=>{})}
/* Barra deslizable con los cortes de las próximas 3 horas (visible en todas las pestañas). */
function renderProx(){const el=$('#proxBar');if(!el)return;if(!S.loaded||!S.ses){el.innerHTML='';return}const now=Date.now();
 const cs=scope().filter(c=>ESPERA.includes(c.estado)&&activa(c)).filter(c=>{const d=startTs(c)-now;return d<=3*36e5&&d>-36e5}).sort((a,b)=>startTs(a)-startTs(b));
 if(!cs.length){el.innerHTML='';return}
 el.innerHTML=`<div class="prox"><div class="pxh">⏳ Próximos 3 horas <b>${cs.length}</b></div><div class="pxl">${cs.map(c=>{const ts=startTs(c),b=barb(c.barberoId),late=ts<=now;
  return `<div class="pc ${late?'late':''}" data-on-click="a8b4735fa" data-p0="${c.id}"><div class="pt"><b>${esc((c.cliente?.nombre||'').split(' ').slice(0,2).join(' '))}</b><span>${h12(c.hora)}</span></div><div class="ps"><span data-cdt="${ts}">${late?'es su hora':falta(ts)}</span> · 💈 <b>${esc(b?.nombre||'')}</b><br>${esc(c.servicioNombre||'')}</div>${c.cliente?.tel?`<button class="rb al ${c.avisado?'ok':''}" title="${c.avisado?'Ya se le avisó':'Avisarle por WhatsApp'}" data-on-click="acda53179" data-p0="${c.id}">⏰</button>`:''}</div>`}).join('')}</div></div>`}
function irACita(id){const c=cita(id);if(!c)return;S.q='';S.filtro='todos';S.fecha=c.fecha;S.off=0;if(S.tab==='agenda')renderAgenda();else goTab('agenda');
 setTimeout(()=>{const e=document.getElementById('c_'+id);e?.scrollIntoView({behavior:'smooth',block:'center'});e?.animate([{boxShadow:'0 0 0 3px var(--pur)'},{boxShadow:'0 0 0 0 transparent'}],{duration:1600})},120)}
function tickCD(){$$('[data-cd]').forEach(e=>{const ts=+e.dataset.cd;e.textContent=cdLabel(ts);e.classList.toggle('late',ts<=Date.now())});$$('[data-cdt]').forEach(e=>e.textContent=faltaHasta(+e.dataset.cdt));if(S.tab==='agenda')renderNext();renderProx()}
function tapTodos(){const n=Date.now();if(n-(S._tt||0)<380){S._tt=0;abrirEtiquetas();return}S._tt=n;if(S.filtro!=='todos')setFiltro('todos')}
function abrirEtiquetas(){const all=scope(),dia=esRango()?all.filter(enRango):all.filter(c=>c.fecha===S.fecha);
 const rows=FILTROS.map(k=>{const src=k==='todos'?dia.filter(c=>c.estado!=='expirada'):['por_validar'].includes(k)?all.filter(c=>c.estado===k):dia.filter(c=>k==='cancelada'?['cancelada','expirada'].includes(c.estado):c.estado===k);
  const e=k==='todos'?{i:'📋',t:'Todos',c:'#8a3ffc'}:est(k),tot=src.reduce((a,c)=>a+(c.gratis?0:+c.precio||0),0);
  return `<button class="et" style="color:${e.c};border-color:${e.c};background:color-mix(in srgb,${e.c} 10%,var(--card))" data-on-click="aed63da19" data-p0="${k}"><span>${e.i} ${esc(e.t)}</span><em>${can('verMontos')?'S/ '+tot.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}):''}</em><b>${src.length}</b></button>`}).join('');
 openModal(`<div class="grab"></div>${mHead('🏷️ Todas las etiquetas')}<p class="hint" style="margin:0 0 14px">${esRango()?`Cuentan las citas de la <b style="color:var(--tx)">${S.fecha==='semana'?'semana':'mes'} · ${rangoAg().t}</b>. «Yape por validar» cuenta todos los días.`:`Cuentan las citas del <b style="color:var(--tx)">${fLarga(S.fecha)}</b>. «Yape por validar» cuenta todos los días.`} Toca una para filtrar.</p>${rows}`)}
function limpiar(){S.q='';S.barbF='';S.filtro='todos';renderAgenda()}
function setFiltro(f){S.filtro=f;renderAgenda()}
/* ---------- notificaciones (campana) ---------- */
S.leidas=new Set(lsGet('notifLeidas',[]));
function notifs(){const now=Date.now(),H=48*3600e3,out=[];
 for(const c of scope()){const nm=c.cliente?.nombre||'Cliente',cu=`${fLarga(c.fecha)} · ${h12(c.hora)}`,bn=barb(c.barberoId)?.nombre||'',st=startTs(c);
  if(c.estado==='por_validar'&&activa(c))out.push({k:'y_'+c.id+(c.yapeCaptura?'_c':''),ts:c.upd||c.creada||0,i:'💸',t:(c.yapeCaptura?'Yape por validar — ':'Esperando comprobante — ')+nm,s:`${cu} · ${bn} · ${soles(c.adelanto)}`,c,tipo:'yape'});
  else if(c.origen==='web'&&(c.creada||0)>now-H&&activa(c)&&c.estado!=='atendida')out.push({k:'n_'+c.id,ts:c.creada,i:'🆕',t:'Nueva reserva — '+nm,s:`${cu} · ${bn} · ✂️ ${c.servicioNombre||''}`,c,tipo:'nueva'});
  if(c.reprogTs&&c.reprogTs>now-H&&activa(c))out.push({k:'r_'+c.id+'_'+c.reprogTs,ts:c.reprogTs,i:'🔁',t:'Reprogramó — '+nm,s:`Ahora ${cu}${c.reprogDe?` · antes ${fLarga(c.reprogDe.fecha)} ${h12(c.reprogDe.hora)}`:''}`,c,tipo:'reprog'});
  if(c.estado==='confirmada'&&st>now&&st-now<=60*60e3)out.push({k:'p_'+c.id+'_'+c.fecha+c.hora,ts:st-60*60e3,i:'⏰',t:`Cita ${falta(st)} — ${nm}`,s:`${h12(c.hora)} · ${bn} · ✂️ ${c.servicioNombre||''}`,c,tipo:'prox'});
  if(['cancelada','no_vino'].includes(c.estado)&&(c.upd||0)>now-H&&st>now-24*3600e3)out.push({k:'x_'+c.id+'_'+c.estado,ts:c.upd,i:c.estado==='cancelada'?'🚫':'❌',t:(c.estado==='cancelada'?'Cita cancelada — ':'No vino — ')+nm,s:`${cu} · ${bn}`,c,tipo:'baja'})}
 if(can('config'))(S.alertas||[]).forEach(a=>out.push({k:'a_'+a.k,ts:Date.now()+1,i:a.i,t:a.t,s:a.s,tipo:'alerta'}));
 return out.sort((a,b)=>b.ts-a.ts)}
function cargarAlertas(){if(!API.remote||!can('config')||Date.now()-(S.alT||0)<300e3)return;S.alT=Date.now();API.req('GET','/alertas').then(a=>{S.alertas=a;renderHeader()}).catch(()=>{})}
function togNotif(e){e?.stopPropagation();let el=$('#notif');if(!el){el=document.createElement('div');el.id='notif';document.body.appendChild(el);
  document.addEventListener('pointerdown',ev=>{if(!el.contains(ev.target)&&!ev.target.closest?.('#hBell'))el.classList.remove('on')},true)}
 if(el.classList.contains('on'))return el.classList.remove('on');pintaNotif();el.classList.add('on')}
function pintaNotif(){const el=$('#notif'),l=notifs(),vis=l.filter(x=>!S.leidas.has(x.k)||x.tipo==='yape'||x.tipo==='prox');
 const wa=(x,key,txt)=>x.c.cliente?.tel&&(can('verTel')||isAdmin())?`<button class="btn sm" style="border-color:#25d366;color:#25d366" data-on-click="a94557f45" data-p0="${x.c.id}" data-p1="${key}" data-p2="${x.k}">💬 ${txt}</button>`:'';
 const acc=x=>{if(x.tipo==='alerta')return `<button class="btn sm" data-on-click="a74da319d" data-p0="${x.k}">🛡️ Ver seguridad</button>`;const v=`<button class="btn sm" data-on-click="ac80577bd" data-p0="${x.c.id}" data-p1="${x.k}">👁️ Ver</button>`;
  if(x.tipo==='yape')return v+(x.c.yapeCaptura&&can('yape')?`<button class="btn sm p" data-on-click="a545db87c" data-p0="${x.k}" data-p1="${x.c.id}">✅ Validar Yape</button>`:wa(x,'waYape','Pedir Yape'));
  if(x.tipo==='prox')return v+wa(x,'waRecuerda','Recordar');
  if(x.tipo==='baja')return v+wa(x,'waVuelve','Reagendar');
  return v+wa(x,'waConfirma','Confirmar')};
 el.innerHTML=`<div class="nh"><b>🔔 Notificaciones</b>${l.some(x=>!S.leidas.has(x.k))?`<button data-on-click="ac48ed6f5">Marcar todo leído</button>`:''}</div>
 <div class="nl">${vis.length?vis.map(x=>`<div class="ni ${S.leidas.has(x.k)?'':'nueva'}"><span class="e">${x.i}</span><div class="x"><b>${esc(x.t)}</b><small>${esc(x.s)}</small><div class="ac">${acc(x)}</div></div><span class="t">${x.tipo==='prox'||x.tipo==='alerta'?'':hace(x.ts)}</span></div>`).join(''):'<div class="vac">✨ Todo al día. Aquí verás reservas nuevas, Yapes por validar, reprogramaciones y citas próximas.</div>'}</div>`}
function notifLeer(k){S.leidas.add(k);lsSet('notifLeidas',[...S.leidas].slice(-300));renderHeader()}
function notifTodas(){notifs().forEach(x=>S.leidas.add(x.k));lsSet('notifLeidas',[...S.leidas].slice(-300));renderHeader();pintaNotif()}
function notifVer(id,k){notifLeer(k);$('#notif').classList.remove('on');irACita(id)}
function notifWA(id,key,k){const c=cita(id);if(!c)return;window.open(waUrl(waNum(c.cliente.tel),tpl(S.cfg[key]||'',c)),'_blank');notifLeer(k)}
function verPorValidar(){if(S.tab!=='agenda')goTab('agenda');S.filtro='por_validar';S.q='';renderAgenda()}
function renderLista(){
 let cs=scope();const q=S.q.trim().toLowerCase(),global=!!q||esRango()||['por_validar'].includes(S.filtro);
 const srv=q.length>=2&&nube(),key=[q,S.filtro,S.barbF].join('|');
 if(srv){if(S.busq?.key!==key){clearTimeout(S._bt);const el0=$('#lista');if(el0)el0.innerHTML='<div class="empty">🔎 Buscando en todas las fechas…</div>';const qh0=$('#qHint');if(qh0)qh0.style.display='';S._bt=setTimeout(()=>buscarServidor(key,0),300);return}
  const ids=new Set(S.busq.items.map(c=>c.id));cs=S.citas.filter(c=>ids.has(c.id)&&mine(c))}
 if(srv||q||['por_validar'].includes(S.filtro)){}else if(esRango())cs=cs.filter(enRango);else cs=cs.filter(c=>c.fecha===S.fecha);
 if(S.barbF)cs=cs.filter(c=>c.barberoId===S.barbF);
 if(S.filtro==='cancelada')cs=cs.filter(c=>c.estado==='cancelada'||c.estado==='expirada');
 else if(S.filtro!=='todos')cs=cs.filter(c=>c.estado===S.filtro);
 else if(!q)cs=cs.filter(c=>c.estado!=='expirada');
 if(q&&!srv){const qd=q.replace(/\D/g,'');cs=cs.filter(c=>[c.cliente?.nombre,c.cliente?.tel,c.cliente?.dni,c.cliente?.ciudad,c.codigo,c.servicioNombre].join(' ').toLowerCase().includes(q)||(qd.length>=3&&[c.cliente?.tel,c.cliente?.dni].some(x=>String(x||'').replace(/\D/g,'').includes(qd))))}
 const h0=hoy();cs.sort((a,b)=>{if(!q)return (a.fecha+a.hora).localeCompare(b.fecha+b.hora);const pa=a.fecha>=h0,pb=b.fecha>=h0;if(pa!==pb)return pa?-1:1;const k=(a.fecha+a.hora).localeCompare(b.fecha+b.hora);return pa?k:-k});
 const el=$('#lista');if(!el)return;
 const qh=$('#qHint');if(qh)qh.style.display=q?'':'none';
 if(!cs.length){el.innerHTML=`<div class="empty"><b>✂️</b>No hay citas${global?'':' para '+fLarga(S.fecha)}<br><br><button class="btn p" data-on-click="ab17bc635">➕ Agendar una cita</button></div>`;return}
 const vis=contarVisitas(),grupos={};cs.forEach(c=>(grupos[c.barberoId]=grupos[c.barberoId]||[]).push(c));
 const orden=Object.keys(grupos).sort((a,b)=>S.barberos.findIndex(x=>x.id===a)-S.barberos.findIndex(x=>x.id===b));
 el.innerHTML=orden.map(bid=>{const b=barb(bid),arr=grupos[bid],cl=S.colap.has(bid);return `<div class="grp"><div class="grp-h"><span class="bar" style="background:${b?.color||'var(--pur)'}"></span>${avatar(b)}<h3>${esc(b?.nombre||'Sin asignar')}${S.fecha===hoy()?gNext(bid):''}</h3><button class="ibtn bare" data-on-click="a1ea7c1f6" data-p0="${bid}">${cl?'▼':'▲'}</button><span class="cnt">${arr.length}</span></div>${cl?'':arr.map(c=>cardCita(c,global,vis)).join('')}</div>`}).join('');
 if(srv&&S.busq.items.length<S.busq.total)el.insertAdjacentHTML('beforeend',`<button class="btn w" style="margin-top:10px" data-on-click="a80e5e8ff">Ver más (${S.busq.total-S.busq.items.length} más)</button>`);
 hydrate(el);
}
function togGrp(id){S.colap.has(id)?S.colap.delete(id):S.colap.add(id);renderLista()}
function cardCita(c,global,vis){
 const cl=c.cliente||{},n=S.cfg.modFidelidad?+S.cfg.fidelidad||0:0,v=vis[telKey(cl.tel)]||0,gratis=n>1&&c.estado!=='atendida'&&(v+1)%n===0;
 const e=est(c.estado),ac=accion(c);
 let pagoBox='';
 if(c.adelanto>0&&c.estado==='por_validar'){
  pagoBox=`<div class="box"><h5>💸 <span>Adelanto Yape</span>${!c.yapeCaptura&&c.expira?`<b style="color:var(--yel)">⏳ ${Math.max(0,Math.ceil((c.expira-Date.now())/60000))} min para enviar el comprobante</b>`:''}</h5>
  <div class="row"><b class="syne" style="font-size:22px;flex:1">${soles(c.adelanto)}</b>${c.yapeCaptura?`<button class="btn sm" data-on-click="ac88d927c" data-p0="${c.id}">🧾 Ver captura</button>`:'<span class="hint" style="margin:0">Sin captura</span>'}${c.estado==='por_validar'&&!c.yapeCaptura&&cl.tel?`<button class="btn sm" data-on-click="a072b4d07" data-p0="${c.id}" data-p1="${c.id}">💬 Pedir</button>`:''}</div></div>`}
 const fotosBox=S.cfg.modFotos&&['confirmada','en_silla','atendida'].includes(c.estado)?`<div class="box"><h5>📷 <span>Antes y después</span>${c.adelantoOk?`<span class="pill" style="color:var(--grn);border-color:var(--grn)">✔ Adelanto ${soles(c.adelanto)}</span>`:''}</h5><div class="phs">${ph(c,'antes')}${ph(c,'despues')}</div></div>`:'';
 return `<div class="cita" id="c_${c.id}">
  <div class="row"><div class="cn">${esc(cl.nombre||'Cliente')}${chrono(c)?`<div style="margin-top:6px">${chrono(c)}</div>`:''}</div>${cl.tel?`<button class="rb" data-on-click="a75bbbc50" data-p0="${telKey(cl.tel)}">📋</button><button class="rb" data-on-click="a77e36977" data-p0="${c.id}">💬</button>`:''}</div>
  <div class="meta">
   ${cl.tel?can('verTel')?`<span class="lk" data-on-click="a2dade712" data-p0="${c.id}">📞 ${esc(cl.tel)} ⧉</span>`:`<span>📞 ${esc(telV(cl.tel))}</span>`:''}${cl.dni?`<span>🪪 ${esc(cl.dni)}</span>`:''}
   <span class="lk">📅 ${DIAS[pYmd(c.fecha).getDay()]} ${pYmd(c.fecha).getDate()} ${MESC[pYmd(c.fecha).getMonth()]} · ${h12(c.hora)}</span>
   <span class="lk">💰 ${c.gratis?'GRATIS':monV(c.precio)}</span>
  </div>
  <div class="sub2">✂️ ${esc(c.servicioNombre||'')}${cl.ciudad?' · 📍 '+esc(cl.ciudad):''}</div>
  ${c.nota?`<div class="nota">📝 ${esc(c.nota)}</div>`:''}
  <div class="tags"><span class="tag">#${esc(c.codigo||'')}</span>${c.reprog?`<span class="tag" style="color:var(--blue);border-color:var(--blue)" title="Antes: ${c.reprogDe?esc(fLarga(c.reprogDe.fecha)+' · '+h12(c.reprogDe.hora)):''}">🔁 Reprogramada${c.reprogDe?' (antes '+esc(fLarga(c.reprogDe.fecha).split(' ').slice(0,2).join(' ')+' '+h12(c.reprogDe.hora))+')':''}</span>`:''}${v?`<span class="tag">⭐ ${v} visita${v>1?'s':''}</span>`:''}${gratis?'<span class="tag" style="color:var(--pur);border-color:var(--pur)">🎁 Le toca gratis</span>':''}${(c.links||[]).slice(0,1).map(l=>`<span class="tag lk" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" data-on-click="a7df36ca4" data-p0="${c.id}">🔗 ${esc(l.url.replace(/^https?:\/\//,'').slice(0,22))}…</span>`).join('')}${(c.links||[]).length>1?`<span class="tag">+${c.links.length-1}</span>`:''}${c.origen==='web'?'<span class="tag">🌐 Web</span>':c.origen==='walkin'?'<span class="tag">⚡ Sin cita</span>':''}</div>
  ${pagoBox}${S.cfg.modFotos&&(['confirmada','en_silla','atendida'].includes(c.estado)||c.fotoAntes||c.fotoDespues||c.refFoto)?`<div class="box"><h5>📷 <span>Fotos del corte</span>${c.adelantoOk?`<span class="pill" style="color:var(--grn);border-color:var(--grn)">✔ Adelanto ${soles(c.adelanto)}</span>`:''}</h5><div class="phs3">${ph(c,'antes')}${ph(c,'despues')}${ph(c,'ref')}</div></div>`:''}
  <div class="acts"><button class="big" style="color:${ac?ac.c:e.c};border-color:${ac?ac.c:e.c};background:${ac?ac.c:e.c}1a" data-on-click="afa8ec677" data-p0="${c.id}">${ac?ac.t:`${e.i} ${esc(e.t)} 🔒`}</button>${can('crear')?`<button class="sq" data-on-click="a1b96555c" data-p0="${c.id}">✏️</button>`:''}${can('cancelar')?`<button class="sq r" data-on-click="a42b723aa" data-p0="${c.id}">🗑️</button>`:''}</div>
 </div>`}
function ph(c,k){const key=k==='antes'?c.fotoAntes:k==='ref'?c.refFoto:c.fotoDespues,lbl=k==='antes'?'ANTES':k==='ref'?'REFERENCIA':'DESPUÉS',inp=`<input type="file" accept="image/*" ${k==='ref'?'':'capture="environment"'} data-on-change="a6646ca8f" data-p0="${c.id}" data-p1="${k}">`;
 return key?`<div class="ph"><span class="tg">${lbl}</span><img data-foto="${key}" data-on-click="adb395fd1" data-p0="${key}"><label class="re">↻${inp}</label></div>`:`<label class="ph">📷<br>Foto ${lbl.toLowerCase()}${inp}</label>`}
function accion(c){const id=c.id,E=k=>est(k);switch(c.estado){
 case 'por_validar':if(!can('yape'))return{t:'💸 Yape por validar 🔒',go:()=>toast('🔒 Solo quien valida pagos puede confirmarlo'),c:E('por_validar').c};return{t:c.yapeCaptura?`💸 Validar Yape`:`💸 Validar Yape · sin comprobante`,go:()=>verYape(id),c:E('por_validar').c};
 case 'confirmada':return{t:`${E('en_silla').i} Pasar a silla`,go:()=>setEstado(id,'en_silla',{enSillaTs:Date.now()}),c:E('confirmada').c};
 case 'en_silla':return{t:`${E('atendida').i} Terminar corte`,go:()=>terminar(id),c:E('en_silla').c};
 default:return null}}
// Botón grande de la tarjeta: la acción que toca según el estado (o editar la cita).
function hacerAccion(id){const c=cita(id);if(!c)return;const ac=accion(c);if(ac)return ac.go();if(can('crear'))formCita(id)}
function waPlantilla(id,k){if(k==='waRecuerda')return recordar(id);const c=cita(id);if(c)abrirWA(c.cliente.tel,k?tpl(S.cfg[k],c):'Hola '+c.cliente.nombre+' 👋')}
async function setEstado(id,k,extra={},msg){try{await API.updateCita(id,{estado:k,...extra});await reload();toast(msg||`${est(k).i} ${est(k).t}`)}catch(e){toast('❌ '+e.message)}}
/* Foto ANTES: pasa a "En silla". Foto DESPUÉS: termina el corte (queda "Atendido"). */
async function subirFoto(id,k,inp){const f=inp.files[0];if(!f)return;toast('⏳ Subiendo foto…');
 try{const key=await API.putFoto(await compressImg(f,1000,.72)),c=cita(id),p={[k==='antes'?'fotoAntes':k==='ref'?'refFoto':'fotoDespues']:key};let msg='📷 Foto guardada';
  if(k==='antes'&&c?.estado==='confirmada'){p.estado='en_silla';p.enSillaTs=Date.now();msg='💺 Foto guardada · ahora está En silla'}
  await API.updateCita(id,p);await reload();toast(msg);
  if(k==='despues'&&['confirmada','en_silla'].includes(cita(id)?.estado))await terminar(id,true)}catch(e){toast('❌ '+e.message)}}
async function verYape(id){const c=cita(id);if(!c)return;
 openModal(mHead('💸 Comprobante Yape')+`<p><b>${esc(c.cliente?.nombre)}</b> · ${fLarga(c.fecha)} ${h12(c.hora)}<br><span style="color:var(--mu)">Adelanto esperado: <b style="color:var(--tx)">${soles(c.adelanto)}</b> · #${esc(c.codigo)}</span></p>
 <div id="yimg" class="empty" style="padding:20px">${c.yapeCaptura?'Cargando…':'⚠️ El cliente no adjuntó captura. Revisa tu Yape antes de validar.'}</div>
 <div class="row" style="margin-top:12px"><button class="btn r" style="flex:1" data-on-click="af70b1863" data-p0="${id}">✕ Rechazar</button><button class="btn g" style="flex:2" data-on-click="a016c33a4" data-p0="${id}">✔ Validar y confirmar</button></div>`);
 if(c.yapeCaptura){const src=await API.foto(c.yapeCaptura);$('#yimg').innerHTML=src?`<img src="${src}" style="width:100%;border-radius:14px">`:'No se encontró la imagen'}}
async function validar(id){const c0=cita(id),enviar=!!c0?.cliente?.tel&&confirm('¿Enviar la confirmación al cliente por WhatsApp?\n\nAceptar: valida el pago y abre WhatsApp\nCancelar: solo valida el pago'),w=enviar?ventana():null;
 await setEstado(id,'confirmada',{adelantoOk:true},'✅ Cita confirmada');const c=cita(id);
 if(w){if(c?.estado==='confirmada')irA(w,waUrl(waNum(c.cliente.tel),tpl(S.cfg.waConfirma,c)));else w.close()}}
async function rechazar(id){if(!confirm('¿Rechazar el pago y cancelar la cita? El horario se libera.'))return;closeModal();await setEstado(id,'cancelada',{motivo:'Yape no válido'})}
async function terminar(id,auto){const c=cita(id);if(!c)return;if(!auto&&S.cfg.modFotos&&!c.fotoDespues&&!confirm('Aún no tiene foto DESPUÉS 📷 (tómala en el recuadro de la tarjeta).\n\n¿Terminar igual?'))return;
 const n=S.cfg.modFidelidad?+S.cfg.fidelidad||0:0,v=contarVisitas()[telKey(c.cliente?.tel)]||0,extra={atendidaTs:Date.now()};
 if(!c.enSillaTs)extra.enSillaTs=c.enSillaTs||Date.now();
 if(n>1&&(v+1)%n===0&&confirm(`🎁 Este cliente cumple ${n} cortes. ¿Aplicar corte GRATIS?`))extra.gratis=true;
 const enviar=!!c.cliente?.tel&&confirm('¿Enviar agradecimiento por WhatsApp?'),w=enviar?ventana():null;
 await setEstado(id,'atendida',extra,'✔️ Corte terminado');
 if(w){if(cita(id)?.estado==='atendida')irA(w,waUrl(waNum(c.cliente.tel),tpl(S.cfg.waGracias,cita(id))));else w.close()}}
async function quitar(id){const c=cita(id);if(!c)return;
 if(['cancelada','expirada'].includes(c.estado)){if(can('cancelar')&&confirm('¿Eliminar la cita para siempre?')){await API.borrarCita(id);await reload();toast('🗑️ Eliminada')}return}
 if(!confirm('¿Cancelar esta cita? El horario queda libre.'))return;await setEstado(id,'cancelada')}
function menuWA(id){const c=cita(id);if(!c)return;
 const o=[['waConfirma','✅ Confirmación de cita'],['waRecuerda','⏰ Recordatorio'],['waYape','💸 Pedir adelanto Yape'],['waGracias','🙏 Agradecimiento + link'],['','✉️ Mensaje libre']];
 openModal(mHead('💬 '+esc(c.cliente?.nombre||''))+o.map(([k,t])=>`<button class="btn w" style="margin-top:8px;justify-content:flex-start;padding:14px" data-on-click="a19860b2c" data-p0="${id}" data-p1="${k}">${t}</button>`).join('')+`<p class="hint">Los textos se editan en ⚙️ Config → Mensajes.</p>`)}

/* ---- crear / editar cita ---- */
function formCita(id){const c=id?cita(id):null,cl=c?.cliente||{};
 const bid=c?.barberoId||(isAdmin()?(S.barbF||S.barberos.find(b=>b.activo!==false)?.id||''):S.ses.barberoId);
 const bOpts=(isAdmin()?S.barberos:S.barberos.filter(b=>b.id===S.ses.barberoId)).map(b=>`<option value="${b.id}" ${b.id===bid?'selected':''}>${esc(b.nombre)}</option>`).join('');
 S._ed={fotoAntes:c?.fotoAntes||'',fotoDespues:c?.fotoDespues||'',refFoto:c?.refFoto||'',links:[...(c?.links||[])],precio:c?.precio};
 const estSel=c?.estado||'confirmada';
 openModal(`<div class="grab"></div>`+mHead(c?'✏️ Editar cita':'➕ Nueva cita')+`
 ${c?'':pegarBox()}
 <div class="g2"><div><label class="lb">DNI (opcional)</label><input class="in" id="fDni" inputmode="numeric" maxlength="8" placeholder="8 dígitos" value="${esc(cl.dni||'')}" data-on-input="a2e87e5f0"><small id="fDniEst" style="color:var(--mu);display:block;min-height:16px;margin-top:4px"></small></div><div><label class="lb">Teléfono</label><input class="in" id="fTel" inputmode="tel" placeholder="9XXXXXXXX" value="${esc(cl.tel||'')}"></div></div>
 <div class="g2"><div><label class="lb">Nombre *</label><input class="in" id="fNom" placeholder="Nombre y apellido" value="${esc(cl.nombre||'')}"></div><div><label class="lb">Ciudad / distrito</label><input class="in" id="fCiu" placeholder="Ej: Puente Piedra" value="${esc(cl.ciudad||'')}"></div></div>
 <div class="g2"><div><label class="lb">Barbero</label><select class="in" id="fBarb" data-on-change="abcce00c9">${bOpts}</select></div><div><label class="lb">Servicio</label><select class="in" id="fServ" data-on-change="a52e1df12">${S.servicios.map(s=>`<option value="${s.id}" ${s.id===c?.servicioId?'selected':''}>${s.emoji} ${esc(s.nombre)}</option>`).join('')}</select></div></div>
 <div class="g2"><div><label class="lb">Fecha</label><input type="date" class="in" id="fFecha" value="${c?.fecha||(esRango()?hoy():S.fecha)}" data-on-change="abcce00c9"></div><div><label class="lb">Hora</label><select class="in" id="fHora"></select></div></div>
 <p class="hint" id="fWarn" style="color:var(--yel);margin-top:4px"></p>
 <div class="g2"><div><label class="lb">Estado</label><select class="in" id="fEst" style="text-transform:uppercase;font-weight:600">${['por_validar',...FILTROS.slice(2),'expirada'].filter(k=>c||['confirmada','en_silla','atendida','por_validar'].includes(k)).map(k=>`<option value="${k}" ${estSel===k?'selected':''}>${est(k).t.toUpperCase()}</option>`).join('')}</select></div>
  <div><label class="lb">💰 Precio S/</label>${can('verMontos')?`<input class="in" id="fPre" type="number" min="0" step="0.5" value="${c?.precio??(S.servicios.find(s=>s.id===c?.servicioId)||S.servicios[0])?.precio??''}">`:`<input class="in" disabled value="S/ •••">`}</div></div>
 <label class="lb">Notas</label><textarea class="in" id="fNota" rows="2" placeholder="Ej: mid fade, sin tocar la barba">${esc(c?.nota||'')}</textarea>
 <details class="dsec2" open><summary>📎 Fotos y adjuntos de la cita <span>▴</span></summary><div class="dsb">
  <div class="dgrid" id="edTiles">${edTiles()}</div>
  <div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px"><p class="hint" style="margin:0 0 8px">🔗 Agregar link (Drive, Mega, Instagram, TikTok…)</p>
  <div class="row"><input class="in" id="edLink" placeholder="https://…" data-on-keydown="a016b11f5"><button class="btn p" style="white-space:nowrap;flex:none" data-on-click="a9ce1658b">+ Add</button></div>
  <div id="edLinks">${edLinks()}</div></div></div></details>
 <button class="btn p w" style="margin-top:16px;padding:15px;font-size:17px" data-on-click="a1d58ed45" data-p0="${id||''}">💾 Guardar cita</button>
 ${c&&API.remote&&can('config')?`<button class="btn w" style="margin-top:8px" data-on-click="a9952d4b5" data-p0="${esc(c.codigo)}">📝 Historial de cambios de esta cita</button>`:''}
 <button class="btn w" style="margin-top:10px;padding:13px;color:var(--mu)" data-on-click="a5a8704f9">Cancelar</button>
`);
 S._eh=c?.hora||'';S._eid=id||'';fillHoras()}
function edTiles(){if(!S.cfg.modFotos)return'<p class="hint" style="grid-column:1/-1">Las fotos están apagadas en ⚙️ Config → Funciones.</p>';
 return [['fotoAntes','📷','Antes'],['fotoDespues','✨','Después'],['refFoto','🖼️','Referencia']].map(([k,i,t])=>{const v=S._ed[k],inp=`<input type="file" accept="image/*" ${k==='refFoto'?'':'capture="environment"'} data-on-change="a9ae09c29" data-p0="${k}">`;
  return `<div>${v?`<div class="dbox has" data-on-click="adb395fd1" data-p0="${v}"><img data-foto="${v}"><span class="dt">${t}</span></div><div class="row" style="gap:6px"><label class="dadd" style="flex:1">↻${inp}</label><button class="dadd" style="width:44px;flex:none;color:var(--red);border-color:#f8514966;background:rgba(248,81,73,.08)" data-on-click="ab4b08f58" data-p0="${k}">✕</button></div>`
  :`<label class="dbox"><span class="di">${i}</span><b>${t}</b>${inp}</label><label class="dadd">+ Agregar${inp}</label>`}</div>`}).join('')}
function edLinks(){return S._ed.links.map((l,i)=>`<div class="lkrow"><span>🔗</span><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url.replace(/^https?:\/\//,''))}</a><button class="ibtn bare" style="color:var(--blue)" data-on-click="ad75c19e9" data-p0="${i}">↗</button><button class="ibtn bare" style="color:var(--red)" data-on-click="a788d2896" data-p0="${i}">✕</button></div>`).join('')}
function edRefresh(){$('#edTiles').innerHTML=edTiles();hydrate($('#edTiles'))}
async function edFoto(k,inp){const f=inp.files[0];if(!f)return;toast('⏳ Subiendo foto…');try{S._ed[k]=await API.putFoto(await compressImg(f,1000,.72));edRefresh();const se=$('#fEst');let m='📷 Foto lista · toca Guardar';
  if(se&&k==='fotoAntes'&&se.value==='confirmada'){se.value='en_silla';m='💺 Foto lista · pasa a En silla · toca Guardar'}
  else if(se&&k==='fotoDespues'&&['confirmada','en_silla'].includes(se.value)){se.value='atendida';m='✅ Foto lista · pasa a Atendido · toca Guardar'}
  toast(m)}catch(e){toast('❌ '+e.message)}}
function edAddLink(){let u=$('#edLink').value.trim();if(!u)return;if(!/^https?:\/\//i.test(u))u='https://'+u;S._ed.links.push({url:u,t:Date.now()});$('#edLink').value='';$('#edLinks').innerHTML=edLinks()}
function fillHoras(){const f=$('#fFecha').value,bid=$('#fBarb').value,b=barb(bid);if(f&&!cubre(f,f))traerRango(f,f).then(ok=>{if(ok&&$('#fHora'))fillHoras()});const sl=slotsDia(S.cfg);if(S._eh&&!sl.includes(S._eh))sl.push(S._eh);sl.sort();
 let first=true;$('#fHora').innerHTML=sl.map(h=>{const oc=ocupado(S.citas,bid,f,h,S._eid);const sel=h===S._eh||(!S._eh&&!oc&&first);if(sel&&!oc)first=false;return `<option value="${h}" ${sel?'selected':''} ${oc?'disabled':''}>${h12(h)}${oc?' · ocupado':''}</option>`}).join('')||'<option value="">Sin horarios</option>';
 $('#fWarn').textContent=b&&!trabaja(S.cfg,b,f)?'⚠️ Ese barbero no atiende ese día (puedes guardarla igual).':''}
async function guardarCita(id){const s=S.servicios.find(x=>x.id===$('#fServ').value),c=id?cita(id):null,estN=$('#fEst').value;
 const pre=$('#fPre')?Math.max(0,+$('#fPre').value||0):(c?.precio??+s?.precio??0);
 const d={fecha:$('#fFecha').value,hora:$('#fHora').value,barberoId:$('#fBarb').value,servicioId:s?.id,servicioNombre:s?.nombre||'',precio:pre,cliente:{nombre:$('#fNom').value.trim(),tel:$('#fTel').value.replace(/[^\d+ ]/g,'').trim(),ciudad:$('#fCiu').value.trim(),dni:$('#fDni').value.replace(/\D/g,'').slice(0,8)},nota:$('#fNota').value.trim(),fotoAntes:S._ed.fotoAntes,fotoDespues:S._ed.fotoDespues,refFoto:S._ed.refFoto,links:S._ed.links,estado:estN};
 if(!d.fecha||!d.hora)return toast('Elige fecha y una hora libre');if(!d.cliente.nombre)return toast('Falta el nombre del cliente');
 if(c&&estN!==c.estado){if(c.estado==='por_validar'&&['confirmada','en_silla','atendida'].includes(estN)&&!can('yape'))return toast('🔒 Solo quien valida pagos puede confirmar esta cita');if(['cancelada','no_vino'].includes(estN)&&!can('cancelar'))return toast('🔒 Sin permiso para cancelar');
  if(estN==='en_silla'&&!c.enSillaTs)d.enSillaTs=Date.now();if(estN==='atendida'&&!c.atendidaTs)d.atendidaTs=Date.now();if(estN==='confirmada'&&c.adelanto>0&&c.estado==='por_validar')d.adelantoOk=true}
 try{const vaActiva=ACTIVOS.includes(estN);if(vaActiva&&ocupado(S.citas,d.barberoId,d.fecha,d.hora,id||undefined))throw new Error('Ese horario está ocupado');
  if(id)await API.updateCita(id,d);else await API.crearCita({...d,enSillaTs:estN==='en_silla'?Date.now():undefined,adelanto:0,adelantoOk:false,origen:'panel',creadoPor:S.ses.uid||S.ses.barberoId||'dueno'});
  closeModal();S.fecha=d.fecha;await reload();toast('✅ Cita guardada')}catch(e){toast('❌ '+e.message)}}
async function cambiarEstado(id,k){const c=cita(id);if(ACTIVOS.includes(k)&&!activa(c)&&ocupado(S.citas,c.barberoId,c.fecha,c.hora,id))return toast('❌ Ese horario ya lo tomó otra cita');closeModal();await setEstado(id,k,k==='confirmada'&&c.adelanto>0?{adelantoOk:true}:{})}
async function eliminar(id){if(!confirm('¿Eliminar la cita para siempre?'))return;closeModal();try{await API.borrarCita(id);await reload();toast('🗑️ Eliminada')}catch(e){toast('❌ '+e.message)}}
function walkIn(){const bid=isAdmin()?(S.barbF||S.barberos.find(b=>b.activo!==false)?.id||''):S.ses.barberoId;
 const bOpts=(isAdmin()?S.barberos.filter(b=>b.activo!==false):S.barberos.filter(b=>b.id===S.ses.barberoId)).map(b=>`<option value="${b.id}" ${b.id===bid?'selected':''}>${esc(b.nombre)}</option>`).join('');
 openModal(mHead('⚡ Cliente sin cita')+`<p class="hint" style="margin-top:0">Llegó sin reservar: entra directo a la silla.</p>
 <label class="lb">Barbero</label><select class="in" id="wBarb">${bOpts}</select>
 <label class="lb">Servicio</label><select class="in" id="wServ">${S.servicios.filter(s=>s.activo!==false).map(s=>`<option value="${s.id}">${s.emoji} ${esc(s.nombre)} — ${soles(s.precio)}</option>`).join('')}</select>
 <label class="lb">Cliente (opcional)</label><input class="in" id="wNom" placeholder="Nombre">
 <div class="g2" style="margin-top:8px"><input class="in" id="wTel" inputmode="tel" placeholder="Celular"><input class="in" id="wCiu" placeholder="Ciudad / distrito"></div>
 <button class="btn pu w" style="margin-top:14px;padding:14px" data-on-click="aeff5c34f">💺 Pasar a silla</button>`)}
async function guardarWalk(){const s=S.servicios.find(x=>x.id===$('#wServ').value),bid=$('#wBarb').value,now=new Date(),m=now.getHours()*60+now.getMinutes();
 let hora=slotsDia(S.cfg).find(h=>toMin(h)<=m&&m<toMin(h)+CONFIG.DUR)||fromMin(m);if(ocupado(S.citas,bid,hoy(),hora))hora=fromMin(m);
 try{await API.crearCita({fecha:hoy(),hora,barberoId:bid,servicioId:s?.id,servicioNombre:s?.nombre||'',precio:+s?.precio||0,cliente:{nombre:$('#wNom').value.trim()||'Cliente sin cita',tel:$('#wTel').value.replace(/[^\d+ ]/g,'').trim(),ciudad:$('#wCiu').value.trim()},nota:'',estado:'en_silla',enSillaTs:Date.now(),adelanto:0,adelantoOk:false,origen:'walkin',creadoPor:S.ses.uid||S.ses.barberoId||'dueno'});
  closeModal();S.fecha=hoy();await reload();toast('💺 En silla')}catch(e){toast('❌ '+e.message)}}
async function quitarDemo(){if(!confirm('¿Borrar todas las citas de ejemplo?'))return;lsSet('citas',lsGet('citas',[]).filter(c=>!c.demo));await reload();toast('🧹 Ejemplos borrados')}
function ayuda(){openModal(mHead('📖 Cómo funciona')+[
 ['El cliente reserva','Desde el link de 🔗 Compartir elige corte, barbero, día y hora, y paga el adelanto por Yape.'],
 ['Te llega aquí','Aparece con 🔔 y en "Yape por validar". Toca <b>Validar Yape</b>, mira la captura y confirma.'],
 ['Llega a la barbería','Toca <b>Pasar a silla</b> y toma la foto 📷 ANTES.'],
 ['Termina el corte','Toma la foto DESPUÉS y toca <b>Terminar corte</b>. Puedes mandarle el agradecimiento por WhatsApp.'],
 ['Fin del día','En 📊 Caja ves lo cobrado y la comisión de cada barbero.']].map((s,i)=>`<div class="stp"><b>${i+1}</b><div><b>${s[0]}</b><p class="hint" style="margin-top:2px">${s[1]}</p></div></div>`).join('')+`<p class="hint">👆👆 Doble toque en el nombre → Dashboard · Toca el logo → Excel y respaldo · ☰ → menú y cerrar sesión · 👆👆 Doble toque en "Todos" → ver todas las etiquetas.</p><p class="hint">✏️ edita la cita o cambia su estado · 🗑️ la cancela · 📋 historial del cliente · 💬 mensajes listos.</p>`)}

