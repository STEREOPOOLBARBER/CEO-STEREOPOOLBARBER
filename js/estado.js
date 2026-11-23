/* =====================================================================
   APP DEL CLIENTE · «Mi cita» (/cita/CODIGO). Fondo blanco, sin emojis (íconos de /img/iconos.svg) y los
   colores de la marca (⚙️ Config → Marca). Se instala en el celular y abre directo SU cita
   (el Worker le da un manifiesto por cita: worker/app.js). Sin service worker: siempre lo último del servidor.
   API: GET /api/publico/cita/:codigo, POST …/confirmar, …/reprogramar (el Worker valida las 24 h), …/calificar.
   · Antes de la cita: QR para que el barbero la encuentre al toque (📷 en el panel).
   · Atendida: fotos de antes y después, calificación anónima y reseña en Google para todos.
   · El narrador (js/escena.js) dice el estado con la voz grabada.
   ===================================================================== */
const CONFIG={API_URL:'/api',DUR:60};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pYmd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addD=(s,n)=>{const d=pYmd(s);d.setDate(d.getDate()+n);return ymd(d)};
const hoy=()=>ymd(new Date());
const toMin=h=>{if(!h)return null;const[a,b]=h.split(':').map(Number);return a*60+b};
const fromMin=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const DIAS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],DIASL=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],MES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],MESC=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fLarga=s=>{const d=pYmd(s);return `${DIASL[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}`};
const h12=h=>{if(!h)return'';let[H,M]=h.split(':').map(Number);const ap=H>=12?'p.m.':'a.m.';H=H%12||12;return `${H}:${pad(M)} ${ap}`};
const soles=n=>{n=Number(n)||0;return 'S/ '+(n%1?n.toFixed(2):n)};
const waNum=t=>{let d=String(t||'').replace(/\D/g,'');if(d.length===9)d='51'+d;return d};
const waUrl=(n,t)=>(!n||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))?`https://wa.me/${n||''}?text=${encodeURIComponent(t)}`:`https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(t)}`;
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),2800)}
function slotsDia(cfg){const out=[],dur=CONFIG.DUR,fin=toMin(cfg.cierre),ri=toMin(cfg.refIni),rf=toMin(cfg.refFin);let t=toMin(cfg.apertura),g=0;if(t==null||fin==null)return out;while(t+dur<=fin&&g++<60){if(ri!=null&&rf!=null&&rf>ri&&t<rf&&t+dur>ri){t=rf;continue}out.push(fromMin(t));t+=dur}return out}
/* Duración en turnos: bloques [1,0,1] = ocupado · espera (barbero libre) · ocupado. Misma regla que worker/comun.js. */
const bloquesOk=b=>Array.isArray(b)&&b.length>=1&&b.length<=6&&b.every(x=>x===0||x===1)&&b[0]===1&&b[b.length-1]===1;
const horasOcupa=(h,bl)=>(bloquesOk(bl)?bl:[1]).map((x,k)=>x?fromMin(toMin(h)+k*CONFIG.DUR):null).filter(Boolean);
const entra=(cfg,h,bl)=>{const sl=slotsDia(cfg);return horasOcupa(h,bl).every(x=>sl.includes(x))};
const bloqueado=(cfg,f,bid)=>(cfg.bloqueos||[]).some(b=>b.fecha===f&&(!b.barberoId||b.barberoId===bid));
const trabaja=(cfg,b,f)=>{const d=pYmd(f).getDay();return b&&b.activo!==false&&(cfg.dias||[]).includes(d)&&(b.dias||[]).includes(d)&&!bloqueado(cfg,f,b.id)};
function applyTheme(c){const s=document.documentElement.style;const a1=!c.acento||c.acento==='#388bfd'?'#8a3ffc':c.acento,a2=!c.acento2||c.acento2==='#a371f7'?'#ff3fd2':c.acento2;s.setProperty('--blue',a1);s.setProperty('--pur',a2)}
const startOf=(f,h)=>{const[y,m,d]=f.split('-').map(Number),[H,M]=(h||'00:00').split(':').map(Number);return new Date(y,m-1,d,H,M).getTime()};
const fmtF=d=>{d=Math.max(0,Math.floor(d));if(d<3600)return `${Math.floor(d/60)} min ${pad(d%60)} s`;if(d<86400)return `${Math.floor(d/3600)} h ${Math.floor(d%3600/60)} min`;return `${Math.floor(d/86400)} d ${Math.floor(d%86400/3600)} h`};
const ic=(n,cl='')=>`<svg class="ic ${cl}" aria-hidden="true"><use href="/img/iconos.svg#${n}"/></svg>`;
const lsGet=(k,d)=>{try{const v=localStorage.getItem('brb_'+k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem('brb_'+k,JSON.stringify(v))}catch(e){}};
const API={
 async req(m,p,b){const r=await fetch(CONFIG.API_URL+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Error '+r.status));return j},
 publico(){return this.req('GET','/publico')},
 estado(c){return this.req('GET','/publico/cita/'+encodeURIComponent(c))},
 reprogramar(c,fecha,hora){return this.req('POST','/publico/cita/'+encodeURIComponent(c)+'/reprogramar',{fecha,hora})},
 foto(k){return !k?'':/^(data:|https?:)/.test(k)?k:`${CONFIG.API_URL}/fotos/${k}`},
 async audio(k){const r=await fetch(`${CONFIG.API_URL}/audio/${k}`);if(!r.ok)throw new Error('audio');return r.arrayBuffer()},
 fotoCita(c,cual){return `${CONFIG.API_URL}/publico/cita/${encodeURIComponent(c)}/foto/${cual}`},
 calificar(c,d){return this.req('POST','/publico/cita/'+encodeURIComponent(c)+'/calificar',d)},
 confirmar(c){return this.req('POST','/publico/cita/'+encodeURIComponent(c)+'/confirmar',{})}
};
const P={cfg:{},barberos:[],ocupados:[]},E={codigo:'',info:null,rf:null,rh:null,timer:null,cal:null,instalar:null};
/* La app del cliente no lleva emojis: tampoco en el globo del narrador (la voz grabada no cambia). */
const sinEmojis=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='string'?v.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').replace(/ {2,}/g,' ').trim():v]));
/* Lo que el narrador y la pantalla de carga necesitan si el dueño aún no lo cambió en ⚙️ Config. */
const DEF_ESCENA={narrOn:true,narrNombre:'Tío Stereo',narrImg:'',narrAudio:{},splashOn:true,splashImg:'',splashMelt:true};
const nvEst=i=>({narrador:P.cfg.narrNombre,servicio:i.servicio||'',precio:soles(i.precio),barbero:i.barbero||'',fecha:fLarga(i.fecha).toLowerCase(),hora:h12(i.hora),cliente:(i.cliente?.nombre||'').split(' ')[0],adelanto:soles(i.adelanto),negocio:P.cfg.nombre});
const hablar=i=>Escena.decir('estado_'+i.estado,nvEst(i),{fecha:i.fecha,hora:i.hora});
const urlCita=c=>location.origin+'/cita/'+c;
const instalada=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const esIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
addEventListener('beforeinstallprompt',e=>{e.preventDefault();E.instalar=e});
/* Citas que este celular ya abrió (para volver a ellas desde la app). Solo el código y la fecha: nada personal. */
function recordar(i){const l=lsGet('misCitas',[]).filter(x=>x.c!==i.codigo);l.unshift({c:i.codigo,f:i.fecha,h:i.hora});lsSet('misCitas',l.slice(0,8))}

/* ---------- textos del estado (sin emojis) ---------- */
const ESTADOS={por_validar:['Por validar','av'],confirmada:['Confirmada','ok'],en_silla:['En silla','mar'],atendida:['Atendido','ok'],no_vino:['No vino','mal'],cancelada:['Cancelada','mal'],expirada:['Vencida','']};
const titulo=i=>({por_validar:i.sinComprobante?'Falta tu comprobante de Yape':'Estamos validando tu adelanto',confirmada:'Tu cita está confirmada',en_silla:'Ya estás en la silla',atendida:'Corte terminado. ¡Gracias por venir!',no_vino:'No llegaste a tu cita',cancelada:'Tu cita fue cancelada',expirada:'Se venció el tiempo para pagar el adelanto'})[i.estado]||'Tu cita';
/* Pasos: Reservada → (Adelanto) → Confirmada → En silla → Atendida */
function pasosHTML(i){const conAdelanto=+i.adelanto>0,pasos=[['Reservada','calendario'],...(conAdelanto?[['Adelanto','billetera']]:[]),['Confirmada','check'],['En silla','silla'],['Atendida','estrella']];
 const pos={por_validar:conAdelanto?1:0,confirmada:conAdelanto?2:1,en_silla:conAdelanto?3:2,atendida:pasos.length}[i.estado];if(pos==null)return'';
 return `<ol class="pasos" aria-label="Avance de tu cita">${pasos.map(([t,n],k)=>`<li class="${k<pos?'hecho':k===pos?'ahora':''}"><span class="punto">${ic(k<pos?'check':n)}</span>${t}</li>`).join('')}</ol>`}

function cab(){const c=P.cfg;applyTheme(c);document.title='Tu cita · '+(c.nombre||'Barbería');
 $('#cab').innerHTML=`<div class="logo">${c.logoImg?`<img src="${esc(API.foto(c.logoImg))}" alt="">`:esc((c.nombre||'B')[0])}</div><div><h1>${esc(c.nombre||'Barbería')}</h1><p>${esc(c.direccion||c.ciudad||'')}</p></div>`}
function shell(inner,foot=''){$('#app').innerHTML=inner;let f=$('#foot');if(!foot){f?.remove();return}if(!f){f=document.createElement('div');f.className='foot';f.id='foot';document.body.appendChild(f)}f.innerHTML=foot}
function abrirHoja(html){$('#hoja').innerHTML=html;$('#modal').classList.add('on')}
ACC.cerrarHoja=function(event){if(event.target===this||event.target.closest('[data-cerrar]'))$('#modal').classList.remove('on')};

/* ---------- sin código: escribirlo o elegir una cita guardada ---------- */
function pedirCodigo(msg){clearInterval(E.timer);const l=lsGet('misCitas',[]);
 shell(`<div class="hola"><h2>Tu cita</h2><p>Escribe el código de 6 letras que te llegó por WhatsApp.</p></div>
 <div class="card"><input class="in" id="cod" maxlength="6" autocomplete="off" autocapitalize="characters" aria-label="Código de tu cita" placeholder="Ej: GXCYZW" style="text-transform:uppercase;letter-spacing:.2em;font-size:22px;text-align:center" value="${esc(E.codigo)}" data-on-keydown="codigoTecla">
 ${msg?`<div class="aviso av">${ic('alerta')}<span>${esc(msg)}</span></div>`:''}<button class="btn p mt" data-on-click="buscarCodigo">Ver mi cita ${ic('flecha')}</button></div>
 ${l.length?`<div class="card"><p class="h3">${ic('lista')}Mis citas</p>${l.map(x=>`<button class="btn sec mt" data-on-click="abrirCita" data-p0="${esc(x.c)}">${ic('calendario')}${fLarga(x.f)} · ${h12(x.h)}<span style="margin-left:auto;color:var(--mu)">${esc(x.c)}</span></button>`).join('')}</div>`:''}`);setTimeout(()=>$('#cod')?.focus(),50)}
function buscar(){const c=($('#cod')?.value||'').trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(c))return toast('El código tiene 6 letras o números');cargar(c)}
ACC.buscarCodigo=function(){buscar()};
ACC.codigoTecla=function(event){if(event.key==='Enter')buscar()};
ACC.abrirCita=function(){cargar(this.dataset.p0)};
async function cargar(cod){E.codigo=cod;$('#app').innerHTML='<div class="spin"></div>';
 try{E.info=await API.estado(cod);history.replaceState(null,'','/cita/'+cod);recordar(E.info);E.cal=null;pintar();hablar(E.info)}catch(e){pedirCodigo(e.message)}}

/* ---------- la cita ---------- */
/* Servicio de varias horas: «– 1:00 p. m.» y, si tiene horas de espera, se dice (puede salir o esperar). */
const finTxt=i=>bloquesOk(i.bloques)&&i.bloques.length>1?' – '+h12(fromMin(toMin(i.hora)+i.bloques.length*CONFIG.DUR)):'';
const esperaTxt=i=>{const bl=i.bloques;if(!bloquesOk(bl))return'';const e=bl.map((x,k)=>x?null:h12(fromMin(toMin(i.hora)+k*CONFIG.DUR))).filter(Boolean);return e.length?` · espera desde ${e.join(', ')} (1 h)`:''};
const puedeRep=i=>!!(i&&i.puedeReprog&&startOf(i.fecha,i.hora)-Date.now()>=(+i.horasReprog||24)*3600e3);
const confirmable=i=>startOf(i.fecha,i.hora)-Date.now()>-30*60e3;
function pintar(){const c=P.cfg,i=E.info;clearInterval(E.timer);
 const [et,cls]=ESTADOS[i.estado]||['',''],ts=startOf(i.fecha,i.hora),viva=['por_validar','confirmada'].includes(i.estado),nombre=(i.cliente?.nombre||'').split(' ')[0];
 const pago=!(+i.adelanto>0)?'Pagas todo en el local':i.adelantoOk?`Adelanto de ${soles(i.adelanto)} validado`:i.sinComprobante?`Falta enviar el comprobante del adelanto (${soles(i.adelanto)})`:`Adelanto de ${soles(i.adelanto)} en validación`;
 const fl=()=>{const d=(ts-Date.now())/1000;return viva?(d>0?`Faltan ${fmtF(d)}`:'Es tu hora'):''};
 shell(`<div class="hola"><h2>Hola${nombre?', '+esc(nombre):''}</h2><p>Aquí ves tu cita al momento.</p></div>
 <section class="card estado">
  <div class="fila"><button class="codigo" data-on-click="copiarCodigo" aria-label="Copiar código">${esc(i.codigo)}${ic('copiar')}</button>${et?`<span class="pill ${cls}">${et}</span>`:''}</div>
  <h3 class="titulo">${titulo(i)}</h3><p class="sub">${fLarga(i.fecha)} · ${h12(i.hora)}${finTxt(i)}${i.barbero?' · con '+esc(i.barbero):''}</p>
  ${viva?`<p class="cuenta">${ic('reloj')}<span id="fl">${fl()}</span></p>`:''}
  ${pasosHTML(i)}
  ${viva&&confirmable(i)?(i.asistencia?`<div class="aviso ok">${ic('check-circulo')}<span><b>Confirmaste que vienes.</b> ¡Te esperamos!</span></div>`:`<button class="btn p mt" data-on-click="confirmarAsistencia">${ic('check')}Confirmo que voy</button>`):''}
  ${puedeRep(i)?`<button class="btn sec mt" data-on-click="reprogramar">${ic('calendario')}Cambiar día u hora</button><p class="nota">Puedes cambiarla hasta ${i.horasReprog||24} h antes.</p>`:''}
 </section>
 ${['por_validar','confirmada','en_silla'].includes(i.estado)?'<section class="card avisos" id="avisosCard" hidden></section>':''}
 ${viva&&confirmable(i)?`<section class="card qr"><p class="h3" style="justify-content:center">${ic('qr')}Muéstralo al llegar</p><div id="qrCita"></div><p>Tu barbero lo escanea y encuentra tu cita al instante.</p></section>`:''}
 ${i.estado==='atendida'?atendidaHTML(i):''}
 ${promosHTML(i)}
 ${instalada()?'':`<section class="card instalar"><div class="t"><b>Ten tu cita a la mano</b><small>Agrégala a tu pantalla de inicio: se abre directo, sin buscar el mensaje.</small></div><button class="btn p" data-on-click="instalarApp">${ic('descargar')}Descargar</button></section>`}
 <section class="card"><p class="h3">${ic('info')}Detalles</p><div class="datos">
  <div class="dato">${ic('tijera')}<div><b>${esc(i.servicio||'')}</b><small>${soles(i.precio)}</small></div></div>
  ${i.barbero?`<div class="dato">${ic('persona')}<div><b>${esc(i.barbero)}</b><small>Tu barbero</small></div></div>`:''}
  <div class="dato">${ic('calendario')}<div><b>${fLarga(i.fecha)}</b><small>${h12(i.hora)}${finTxt(i)}${esperaTxt(i)}</small></div></div>
  <div class="dato">${ic('billetera')}<div><b>Pago</b><small>${pago}</small></div></div>
 </div></section>
 ${mapaHTML(c)}
 ${c.politicaTxt?`<section class="card"><details><summary>Política de la barbería</summary><div>${esc(c.politicaTxt)}</div></details></section>`:''}`,
 `${c.whatsapp?`<button class="btn wa" data-on-click="escribirBarberia">${ic('mensaje')}WhatsApp</button>`:''}<button class="btn" data-on-click="actualizarCita" aria-label="Actualizar">${ic('actualizar')}Actualizar</button>`);
 qrCita(i);promosVistas();pintarAvisos();
 let n=0;E.timer=setInterval(async()=>{const x=$('#fl');if(x)x.textContent=fl();if(++n%30)return;try{const nuevo=await API.estado(E.codigo);const cambio=nuevo.estado!==E.info.estado||nuevo.fecha!==E.info.fecha||nuevo.hora!==E.info.hora;E.info=nuevo;if(cambio){pintar();hablar(nuevo)}}catch(_){}},1000)}
function mapaHTML(c){const la=parseFloat(c.lat),lo=parseFloat(c.lng),dir=esc(c.direccion||c.ciudad||''),hay=isFinite(la)&&isFinite(lo)&&(la||lo);
 const ir=hay?`https://www.google.com/maps/dir/?api=1&destination=${la},${lo}`:c.maps||'';if(!dir&&!ir)return'';
 const bb=hay?[lo-.004,la-.0022,lo+.004,la+.0022].map(n=>n.toFixed(5)).join(','):'';
 return `<section class="card mapa"><p class="h3">${ic('ubicacion')}Cómo llegar</p>${hay?`<iframe title="Mapa de la barbería" loading="lazy" referrerpolicy="no-referrer" src="https://www.openstreetmap.org/export/embed.html?bbox=${bb}&layer=mapnik&marker=${la},${lo}"></iframe>`:''}
 ${dir?`<p class="sub" style="margin-bottom:10px">${dir}</p>`:''}${ir?`<a class="btn" target="_blank" rel="noopener" href="${esc(ir)}">${ic('ruta')}Abrir en el mapa</a>`:''}</section>`}
/* QR con el link de esta cita: la cámara del celular abre esta página; el 📷 del panel abre la cita. */
function qrCita(i){const el=$('#qrCita');if(!el)return;try{if(!window.QRCode)throw 0;new QRCode(el,{text:urlCita(i.codigo),width:196,height:196,colorDark:'#15111d',colorLight:'#ffffff'})}catch(e){el.closest('.qr')?.remove()}}
ACC.verPrivacidad=function(event){event?.preventDefault?.();Privacidad.abrir(P.cfg)};
ACC.copiarCodigo=function(){navigator.clipboard?.writeText(E.codigo).then(()=>toast('Código copiado')).catch(()=>{})};
ACC.actualizarCita=function(){cargar(E.codigo)};
ACC.escribirBarberia=function(){const i=E.info;window.open(waUrl(waNum(P.cfg.whatsapp),`Hola, soy ${(i.cliente?.nombre||'').split(' ')[0]}. Mi código de cita es ${i.codigo}.`),'_blank')};
/* Confirmar asistencia (reduce los «no vino»). */
ACC.confirmarAsistencia=async function(){this.disabled=true;try{await API.confirmar(E.codigo);toast('¡Listo! Te esperamos');await cargar(E.codigo)}catch(e){this.disabled=false;toast(e.message)}};

/* ---------- promociones (las pone el dueño en el panel; el precio lo aplica el servidor al reservar) ---------- */
const DIAS_L=['domingos','lunes','martes','miércoles','jueves','viernes','sábados'];
const fCorta=f=>{const d=pYmd(f);return `${d.getDate()} ${MESC[d.getMonth()]}`};
function vigencia(p){const dias=p.dias?.length&&p.dias.length<7?'Solo '+p.dias.map(x=>DIAS_L[x]).join(', ').replace(/, ([^,]*)$/,' y $1'):'';
 const fe=p.desde>hoy()?`Desde el ${fCorta(p.desde)}`:`Hasta el ${fCorta(p.hasta)}`;return dias?`${dias} · ${fe.toLowerCase()}`:fe}
function promosHTML(i){const L=P.promos||[];if(!L.length)return'';
 return `<p class="promos-t">${ic('etiqueta')}${i.estado==='atendida'?'Vuelve con una promo':'Promociones'}</p><div class="promos" role="list">${L.map(p=>`<article class="promo" role="listitem">
  <div class="img">${p.foto?`<img src="${esc(API.foto(p.foto))}" alt="" loading="lazy">`:ic('etiqueta')}</div>
  <div class="cu"><b>${esc(p.titulo)}</b>${p.texto?`<small>${esc(p.texto)}</small>`:''}<span class="vig">${esc(p.servicio)} · ${vigencia(p)}</span><span class="pre"><s>${soles(p.precioNormal)}</s>${soles(p.precio)}</span></div>
  <button class="btn" data-on-click="promoReservar" data-p0="${esc(p.id)}">Reservar ${ic('flecha')}</button></article>`).join('')}</div>`}
/* Cuenta una vista por promo y por visita (sin datos personales). */
function promosVistas(){const ids=(P.promos||[]).map(p=>p.id).filter(id=>{try{if(sessionStorage.getItem('pv_'+id))return false;sessionStorage.setItem('pv_'+id,1)}catch(e){}return true});
 if(ids.length)API.req('POST','/publico/promos/visto',{ids,tipo:'v'}).catch(()=>{})}
ACC.promoReservar=function(){const id=this.dataset.p0;API.req('POST','/publico/promos/visto',{ids:[id],tipo:'c'}).catch(()=>{}).finally(()=>{location.href='/reservar.html?promo='+encodeURIComponent(id)})};

/* ---------- avisos al celular (Web Push): confirmada, recordatorios, cambios y «¿cómo te atendimos?» ----------
   El permiso se pide solo al tocar el botón. iPhone: solo con la app instalada (regla de Apple). */
const pushSoportado=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const b64uBytes=t=>Uint8Array.from(atob(t.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((t.length+3)%4)),c=>c.charCodeAt(0));
async function subActual(){const reg=await navigator.serviceWorker.getRegistration('/cita/');return reg?reg.pushManager.getSubscription():null}
async function pintarAvisos(){const el=$('#avisosCard');if(!el)return;let html='';
 const cab=(t,s)=>`<div class="t"><b>${t}</b><small>${s}</small></div>`;
 if(!pushSoportado()){if(esIOS()&&!instalada())html=cab('Recibe avisos de tu cita','En iPhone primero descarga la app; luego actívalos desde el ícono.')+`<button class="btn sec" data-on-click="instalarApp">${ic('descargar')}Descargar</button>`}
 else if(Notification.permission==='denied')html=cab('Avisos bloqueados','Los bloqueaste en este navegador. Puedes activarlos en su configuración.')
 else{const on=lsGet('avisos_'+E.codigo,0)&&!!await subActual().catch(()=>null);
  html=on?cab('Avisos activados','Te avisaremos si tu cita cambia y antes de tu hora.')+`<button class="btn sec" data-on-click="avisosApagar">Apagar</button>`
   :cab('Recibe avisos de tu cita','Te avisamos cuando se confirme, el día anterior y 2 horas antes.')+`<button class="btn p" data-on-click="avisosActivar">${ic('reloj')}Activar</button>`}
 el.innerHTML=html;el.hidden=!html}
ACC.avisosActivar=async function(){this.disabled=true;
 try{if(await Notification.requestPermission()!=='granted'){toast('Sin permiso no podemos avisarte');return pintarAvisos()}
  const reg=await navigator.serviceWorker.register('/cita/sw.js',{scope:'/cita/'});
  const lista=reg.active?reg:await new Promise(res=>{const w=reg.installing||reg.waiting;if(!w)return res(reg);w.addEventListener('statechange',()=>{if(w.state==='activated')res(reg)})});
  const{clave}=await API.req('GET','/publico/push/clave');
  const sub=await lista.pushManager.getSubscription()||await lista.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uBytes(clave)});
  await API.req('POST','/publico/cita/'+E.codigo+'/push',sub.toJSON());lsSet('avisos_'+E.codigo,1);toast('Listo: te avisaremos');pintarAvisos()}
 catch(e){this.disabled=false;toast(e.message||'No se pudo activar')}};
ACC.avisosApagar=async function(){try{const sub=await subActual();if(sub)await API.req('DELETE','/publico/cita/'+E.codigo+'/push',sub.toJSON())}catch(e){}lsSet('avisos_'+E.codigo,0);toast('Avisos apagados');pintarAvisos()};

/* ---------- descargar la app: el aviso del navegador o los pasos (iPhone no deja instalar con un botón) ---------- */
ACC.instalarApp=async function(){
 if(E.instalar){E.instalar.prompt();await E.instalar.userChoice.catch(()=>null);E.instalar=null;return}
 const pasos=esIOS()?[['Ábrela en Safari','No dentro de WhatsApp: toca los tres puntos y «Abrir en Safari».'],['Toca Compartir',`El cuadrado con la flecha hacia arriba ${ic('compartir')}.`],['«Agregar a inicio»',`Baja en la lista ${ic('agregar')} y toca Agregar.`]]
  :[['Abre el menú del navegador','Los tres puntos arriba a la derecha.'],['«Instalar app» o «Agregar a la pantalla principal»','Y confirma.']];
 abrirHoja(`<div class="fila"><p class="h3" style="margin:0">${ic('descargar')}Descargar la app</p><button class="btn sec" style="width:auto;min-height:40px" data-cerrar aria-label="Cerrar">${ic('cerrar')}</button></div>
 <div class="pasosi mt">${pasos.map((p,k)=>`<div><i>${k+1}</i><span><b>${p[0]}</b><br><small style="color:var(--mu)">${p[1]}</small></span></div>`).join('')}</div>
 <p class="nota">Al abrirla desde tu pantalla de inicio, entra directo a esta cita.</p>`)};

/* ---------- después del corte: fotos, calificación anónima y reseña ---------- */
const ETQ_CAL=[['corte','Corte'],['trato','Trato'],['puntualidad','Puntualidad'],['limpieza','Limpieza'],['ambiente','Ambiente']];
const resenaUrl=()=>/^https:\/\/[^\s"'<>]+$/.test(P.cfg.resenaUrl||'')?P.cfg.resenaUrl:'';
function atendidaHTML(i){const f=i.fotos||{},foto=(k,t)=>f[k]?`<a href="${esc(API.fotoCita(i.codigo,k))}" target="_blank" rel="noopener"><img src="${esc(API.fotoCita(i.codigo,k))}" alt="${t}" loading="lazy"><span>${t}</span></a>`:'';
 return `${f.antes||f.despues?`<section class="card"><p class="h3">${ic('camara')}Tu antes y después</p><div class="fotos">${foto('antes','ANTES')}${foto('despues','DESPUÉS')}</div></section>`:''}
 <div id="calCard">${calHTML(i)}</div>
 ${resenaUrl()?`<section class="card" style="text-align:center"><p class="h3" style="justify-content:center">${ic('estrella')}¿Nos dejas una reseña en Google?</p><p class="sub" style="margin-bottom:12px">Nos ayuda muchísimo a crecer.</p><a class="btn p" href="${esc(resenaUrl())}" target="_blank" rel="noopener">Dejar mi reseña en Google</a></section>`:''}`}
function calHTML(i){const c=i.calificacion||{};if(c.hecha)return `<section class="card"><div class="aviso ok" style="margin:0">${ic('check-circulo')}<span><b>¡Gracias por calificarnos!</b> Tu opinión es anónima.</span></div></section>`;if(!c.puede)return'';
 const k=E.cal||(E.cal={estrellas:0,etiquetas:[],txt:''});
 return `<section class="card"><p class="h3">${ic('estrella')}¿Cómo te atendimos?</p><p class="sub">Es <b>anónimo</b>: la barbería no ve tu nombre ni tu celular.</p>
 <div class="stars">${[1,2,3,4,5].map(n=>`<button class="${n<=k.estrellas?'on':''}" aria-label="${n} estrella${n>1?'s':''}" data-on-click="calEstrella" data-p0="${n}">${ic('estrella','lleno')}</button>`).join('')}</div>
 ${k.estrellas?`<p class="nota" style="margin-bottom:8px">¿Qué destacas?</p><div class="chipsc">${ETQ_CAL.map(([v,t])=>`<button class="${k.etiquetas.includes(v)?'on':''}" data-on-click="calEtiqueta" data-p0="${v}">${t}</button>`).join('')}</div>
 <textarea class="in mt" rows="3" maxlength="300" placeholder="Cuéntanos algo más (opcional)" data-on-input="calTexto">${esc(k.txt)}</textarea>
 <button class="btn p mt" data-on-click="calEnviar">Enviar calificación</button>`:''}</section>`}
const pintarCal=()=>{const el=$('#calCard');if(el)el.innerHTML=calHTML(E.info)};
ACC.calEstrella=function(){E.cal.estrellas=+this.dataset.p0;pintarCal()};
ACC.calEtiqueta=function(){const v=this.dataset.p0,l=E.cal.etiquetas;E.cal.etiquetas=l.includes(v)?l.filter(x=>x!==v):[...l,v];pintarCal()};
ACC.calTexto=function(){E.cal.txt=this.value};
ACC.calEnviar=async function(){this.disabled=true;const k=E.cal;try{await API.calificar(E.codigo,{estrellas:k.estrellas,etiquetas:k.etiquetas,comentario:k.txt});E.info.calificacion={hecha:true,puede:false};pintarCal();toast('¡Gracias!')}catch(e){this.disabled=false;toast(e.message)}};

/* ---------- reprogramar: mismo barbero, solo días y horas libres ---------- */
function libres(fecha,bid){const cfg=P.cfg,b=P.barberos.find(x=>x.id===bid);if(!trabaja(cfg,b,fecha))return[];
 const esHoy=fecha===hoy(),n=new Date(),nm=n.getHours()*60+n.getMinutes();
 const bl=E.info?.bloques,yo=E.info?horasOcupa(E.info.hora,bl):[],mia=o=>E.info&&o.f===E.info.fecha&&yo.includes(o.h); // sus propias horas no le estorban
 return slotsDia(cfg).filter(h=>(!esHoy||toMin(h)>nm+10)&&entra(cfg,h,bl)).map(h=>{const mias=horasOcupa(h,bl);return{h,ok:!P.ocupados.some(o=>o.b===bid&&o.f===fecha&&mias.includes(o.h)&&!mia(o))}})}
async function reprogUI(){const i=E.info;if(!puedeRep(i))return pintar();clearInterval(E.timer);
 try{const d=await API.publico();P.ocupados=d.ocupados||[]}catch(e){}
 const ini=addD(hoy(),+P.cfg.anticipacion||0),dias=[];for(let k=0;k<Math.max(1,+P.cfg.ventana||14);k++){const f=addD(ini,k);dias.push({f,ok:libres(f,i.barberoId).some(x=>x.ok)})}
 if(!E.rf||!dias.find(d=>d.f===E.rf&&d.ok))E.rf=dias.find(d=>d.ok)?.f||null;
 const sl=E.rf?libres(E.rf,i.barberoId):[];if(E.rh&&!sl.find(x=>x.h===E.rh&&x.ok))E.rh=null;
 shell(`<div class="hola"><h2>Cambiar día u hora</h2><p>Ahora: <b>${fLarga(i.fecha)} · ${h12(i.hora)}</b>${i.barbero?' con '+esc(i.barbero):''}.</p></div>
 <section class="card">${dias.some(d=>d.ok)?`<div class="days">${dias.map(d=>{const x=pYmd(d.f);return `<button class="day ${E.rf===d.f?'on':''}" ${d.ok?'':'disabled'} data-on-click="repDia" data-p0="${d.f}"><small>${d.f===hoy()?'Hoy':DIAS[x.getDay()]}</small><b>${x.getDate()}</b><small>${MESC[x.getMonth()]}</small></button>`}).join('')}</div>
 <div class="slots">${sl.map(x=>`<button class="slot ${E.rh===x.h?'on':''}" ${x.ok?'':'disabled'} data-on-click="repHora" data-p0="${x.h}">${h12(x.h)}</button>`).join('')}</div>`:`<p class="vacio">Tu barbero no tiene horarios libres en los próximos días. Escríbenos por WhatsApp.</p>`}</section>`,
 `<button class="btn" style="width:auto" data-on-click="repVolver" aria-label="Volver">${ic('atras')}</button><button class="btn p" ${E.rh?'':'disabled'} data-on-click="repOk">${ic('check')}Confirmar cambio</button>`)}
ACC.reprogramar=function(){reprogUI()};
ACC.repDia=function(){E.rf=this.dataset.p0;E.rh=null;reprogUI()};
ACC.repHora=function(){E.rh=this.dataset.p0;reprogUI()};
ACC.repVolver=function(){E.rf=E.rh=null;pintar()};
ACC.repOk=async function(){const i=E.info;if(!E.rf||!E.rh)return;if(!confirm(`¿Cambiar tu cita al ${fLarga(E.rf)} a las ${h12(E.rh)}?`))return;
 try{await API.reprogramar(i.codigo,E.rf,E.rh);toast('Cita reprogramada');E.rf=E.rh=null;await cargar(i.codigo)}catch(e){toast(e.message);reprogUI()}};

/* ---------- inicio: el código viene en la ruta (/cita/CODIGO) ---------- */
(async function(){
 try{const d=await API.publico();P.cfg={dias:[1,2,3,4,5,6],apertura:'09:00',cierre:'20:00',refIni:'13:00',refFin:'14:00',anticipacion:0,ventana:14,...DEF_ESCENA,...(d.cfg||{}),narr:sinEmojis({...VOZ.FRASES,...(d.cfg?.narr||{})})};P.barberos=d.barberos||[];P.ocupados=d.ocupados||[];P.promos=d.promos||[];cab();
  Escena.iniciar({cfg:P.cfg,hoy,audio:k=>API.audio(k),foto:async k=>API.foto(k)})}
 catch(e){Escena.error()}
 const c=((location.pathname.match(/^\/cita\/([A-Za-z0-9]{6})$/)||[])[1]||new URLSearchParams(location.search).get('c')||'').trim().toUpperCase();
 if(/^[A-Z0-9]{6}$/.test(c))cargar(c);else pedirCodigo('');
})();
