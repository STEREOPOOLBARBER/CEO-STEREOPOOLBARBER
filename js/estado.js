/* =====================================================================
   ESTADO DE LA CITA (público). Solo para consultar la cita con su código:
   estado.html?c=CODIGO. Usa GET /api/publico y GET /api/publico/cita/:codigo;
   reprogramar con POST /api/publico/cita/:codigo/reprogramar (el Worker valida las 24 h).
   · Antes de la cita: QR con el link de la cita para que el barbero la encuentre al toque (📷 en el panel).
   · Atendida: fotos de antes y después, calificación anónima (POST …/calificar) y reseña en Google para todos.
   · El narrador (js/escena.js) dice el estado con la voz grabada, con la fecha y la hora de la cita.
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
const DEF_EST={por_validar:{t:'Yape por validar',i:'💸',c:'#f0883e'},confirmada:{t:'Confirmada',i:'✅',c:'#8a3ffc'},en_silla:{t:'En silla',i:'💺',c:'#ff3fd2'},atendida:{t:'Atendido',i:'✔️',c:'#3fb950'},no_vino:{t:'No vino',i:'❌',c:'#f85149'},cancelada:{t:'Cancelada',i:'🚫',c:'#a397b8'},expirada:{t:'Expirada',i:'⌛',c:'#a397b8'}};
function slotsDia(cfg){const out=[],dur=CONFIG.DUR,fin=toMin(cfg.cierre),ri=toMin(cfg.refIni),rf=toMin(cfg.refFin);let t=toMin(cfg.apertura),g=0;if(t==null||fin==null)return out;while(t+dur<=fin&&g++<60){if(ri!=null&&rf!=null&&rf>ri&&t<rf&&t+dur>ri){t=rf;continue}out.push(fromMin(t));t+=dur}return out}
const bloqueado=(cfg,f,bid)=>(cfg.bloqueos||[]).some(b=>b.fecha===f&&(!b.barberoId||b.barberoId===bid));
const trabaja=(cfg,b,f)=>{const d=pYmd(f).getDay();return b&&b.activo!==false&&(cfg.dias||[]).includes(d)&&(b.dias||[]).includes(d)&&!bloqueado(cfg,f,b.id)};
function applyTheme(c){const s=document.documentElement.style;const a1=!c.acento||c.acento==='#388bfd'?'#8a3ffc':c.acento,a2=!c.acento2||c.acento2==='#a371f7'?'#ff3fd2':c.acento2;s.setProperty('--blue',a1);s.setProperty('--pur',a2)}
const startOf=(f,h)=>{const[y,m,d]=f.split('-').map(Number),[H,M]=(h||'00:00').split(':').map(Number);return new Date(y,m-1,d,H,M).getTime()};
const fmtF=d=>{d=Math.max(0,Math.floor(d));if(d<3600)return `${Math.floor(d/60)} min ${pad(d%60)} s`;if(d<86400)return `${Math.floor(d/3600)} h ${Math.floor(d%3600/60)} min`;return `${Math.floor(d/86400)} d ${Math.floor(d%86400/3600)} h`};
function mapaHTML(c){const la=parseFloat(c.lat),lo=parseFloat(c.lng),dir=esc(c.direccion||c.ciudad||'');
 if(isFinite(la)&&isFinite(lo)&&(la||lo)){const bb=[lo-.004,la-.0022,lo+.004,la+.0022].map(n=>n.toFixed(5)).join(',');
  return `<div class="card mapa"><iframe title="Mapa de la barbería" loading="lazy" referrerpolicy="no-referrer" src="https://www.openstreetmap.org/export/embed.html?bbox=${bb}&layer=mapnik&marker=${la},${lo}"></iframe><p style="margin:10px 2px 0;font-size:14px">📍 ${dir}</p>
  <div class="g2"><a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${la},${lo}">🧭 Cómo llegar</a><a class="btn" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=18/${la}/${lo}">🗺️ Abrir mapa</a></div></div>`}
 if(c.maps)return `<div class="card mapa"><p style="margin:0 2px 10px;font-size:14px">📍 ${dir}</p><a class="btn g" style="text-decoration:none;color:#fff" target="_blank" rel="noopener" href="${esc(c.maps)}">🧭 Ver mapa y cómo llegar</a></div>`;
 return `<div class="card"><p style="margin:0;font-size:14px">📍 ${dir}</p></div>`}
const API={
 async req(m,p,b){const r=await fetch(CONFIG.API_URL+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Error '+r.status));return j},
 publico(){return this.req('GET','/publico')},
 estado(c){return this.req('GET','/publico/cita/'+encodeURIComponent(c))},
 reprogramar(c,fecha,hora){return this.req('POST','/publico/cita/'+encodeURIComponent(c)+'/reprogramar',{fecha,hora})},
 foto(k){return !k?'':/^(data:|https?:)/.test(k)?k:`${CONFIG.API_URL}/fotos/${k}`},
 async audio(k){const r=await fetch(`${CONFIG.API_URL}/audio/${k}`);if(!r.ok)throw new Error('audio');return r.arrayBuffer()},
 fotoCita(c,cual){return `${CONFIG.API_URL}/publico/cita/${encodeURIComponent(c)}/foto/${cual}`},
 calificar(c,d){return this.req('POST','/publico/cita/'+encodeURIComponent(c)+'/calificar',d)}
};
const P={cfg:{},barberos:[],ocupados:[]},E={codigo:'',info:null,rf:null,rh:null,timer:null,cal:null};
/* Lo que el narrador y la pantalla de carga necesitan si el dueño aún no lo cambió en ⚙️ Config. */
const DEF_ESCENA={narrOn:true,narrNombre:'Tío Stereo',narrImg:'',narrAudio:{},splashOn:true,splashImg:'',splashMelt:true};
const nvEst=i=>({narrador:P.cfg.narrNombre,servicio:i.servicio||'',precio:soles(i.precio),barbero:i.barbero||'',fecha:fLarga(i.fecha).toLowerCase(),hora:h12(i.hora),cliente:(i.cliente?.nombre||'').split(' ')[0],adelanto:soles(i.adelanto),negocio:P.cfg.nombre});
const hablar=i=>Escena.decir('estado_'+i.estado,nvEst(i),{fecha:i.fecha,hora:i.hora});

function hero(){const c=P.cfg;applyTheme(c);
 $('#hero').innerHTML=`<div class="logo">${c.logoImg?`<img src="${esc(API.foto(c.logoImg))}" style="width:100%;height:100%;object-fit:cover">`:esc(c.logo||'💈')}</div><div><h1>${esc(c.nombre||'Barbería')}</h1>${c.eslogan?`<p>${esc(c.eslogan)}</p>`:''}<p>📍 ${esc(c.direccion||c.ciudad||'')}</p></div>`}
function shell(inner,foot=''){$('#app').innerHTML=inner+(foot?`<div class="foot">${foot}</div>`:'')}

/* Pantalla para escribir el código (si el link no lo trae) */
function pedirCodigo(msg){clearInterval(E.timer);
 shell(`<h2>🔎 Ver estado de mi cita</h2><p class="pt">Escribe el código de 6 letras que te llegó por WhatsApp.</p>
 <input class="in" id="cod" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="Ej: GXCYZW" style="text-transform:uppercase;letter-spacing:.2em;font-size:22px;text-align:center" value="${esc(E.codigo)}" data-on-keydown="a15d4f7c8">
 ${msg?`<p class="pt" style="color:#f85149;margin-top:8px">${esc(msg)}</p>`:''}`,
 `<button class="btn p" data-on-click="a49f988fa">Ver mi cita →</button>`);setTimeout(()=>$('#cod')?.focus(),50)}
function buscar(){const c=($('#cod')?.value||'').trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(c))return toast('El código tiene 6 letras o números');cargar(c)}
async function cargar(cod){E.codigo=cod;$('#app').innerHTML='<div class="spin"></div>';
 try{E.info=await API.estado(cod);history.replaceState(null,'','?c='+cod);E.cal=null;pintar();hablar(E.info)}catch(e){pedirCodigo(e.message)}}

const puedeRep=i=>!!(i&&i.puedeReprog&&startOf(i.fecha,i.hora)-Date.now()>=(+i.horasReprog||24)*3600e3);
function pintar(){const c=P.cfg,i=E.info;clearInterval(E.timer);
 const e={...(DEF_EST[i.estado]||DEF_EST.por_validar),...((c.est||{})[i.estado]||{})},ts=startOf(i.fecha,i.hora),viva=['por_validar','confirmada'].includes(i.estado);
 const pago=!(+i.adelanto>0)?'Pagas todo en el local':i.adelantoOk?`✅ Adelanto ${soles(i.adelanto)} validado`:i.sinComprobante?`⏳ Falta enviar el comprobante del adelanto (${soles(i.adelanto)})`:`🔎 Adelanto ${soles(i.adelanto)} en validación`;
 const fl=()=>{const d=(ts-Date.now())/1000;return viva?(d>0?`⏳ Faltan ${fmtF(d)}`:'🕘 Es tu hora'):''};
 shell(`<div class="est"><b class="i">${e.i}</b><h2 style="color:${e.c}">${esc(e.t)}</h2><div class="fl" id="fl" style="color:var(--tx)">${fl()}</div></div>
 <div class="card"><div class="res"><span>🔖</span><span>Código <b>${esc(i.codigo)}</b></span><span>👤</span><span>${esc(i.cliente?.nombre||'')}</span><span>✂️</span><span><b>${esc(i.servicio||'')}</b> · ${soles(i.precio)}</span><span>💈</span><span>${esc(i.barbero||'')}</span><span>📅</span><span>${fLarga(i.fecha)} · ${h12(i.hora)}</span><span>💸</span><span>${pago}</span></div></div>
 ${viva&&c.politicaTxt?`<div class="card" style="font-size:14px;line-height:1.45">📜 <b>Política</b><div style="white-space:pre-line;margin-top:4px">${esc(c.politicaTxt)}</div></div>`:''}
 ${viva&&API.confirmable(i)?(i.asistencia?`<div class="card" style="text-align:center;color:#3fb950;font-weight:700">👍 Confirmaste que vienes. ¡Te esperamos!</div>`:`<button class="btn p w" style="margin-top:10px;padding:15px;font-size:17px" data-on-click="confirmarAsistencia">✅ Confirmo que voy</button>`):''}
 ${viva&&API.confirmable(i)?`<div class="card qrc"><div id="qrCita"></div><p class="pt" style="text-transform:none;letter-spacing:0;font-size:14px;color:var(--tx);margin-top:10px">📲 <b>Muéstralo al llegar:</b> tu barbero lo escanea y encuentra tu cita al toque.</p></div>`:''}
 ${i.estado==='atendida'?atendidaHTML(i):''}
 ${puedeRep(i)?`<button class="btn w" style="margin-top:10px" data-on-click="a998d7b77">📅 Reprogramar mi cita</button><p class="pt" style="text-align:center;margin-top:6px">Puedes cambiarla hasta ${i.horasReprog||24} h antes de tu corte.</p>`:''}
 ${mapaHTML(c)}`,
 `${c.whatsapp?`<button class="btn g" data-on-click="aad98fbcb">💬 Escribir a la barbería</button>`:''}<button class="btn" data-on-click="afbbd1a2b">🔄 Actualizar</button>`);
 qrCita(i);
 let n=0;E.timer=setInterval(async()=>{const x=$('#fl');if(x)x.textContent=fl();if(++n%30)return;try{const nuevo=await API.estado(E.codigo);const cambio=nuevo.estado!==E.info.estado||nuevo.fecha!==E.info.fecha||nuevo.hora!==E.info.hora;E.info=nuevo;if(cambio){pintar();hablar(nuevo)}}catch(_){}},1000)}
/* QR con el link de esta cita: la cámara del celular abre esta página; el 📷 del panel abre la cita. */
function qrCita(i){const el=$('#qrCita');if(!el)return;try{if(!window.QRCode)throw 0;new QRCode(el,{text:new URL('estado.html?c='+i.codigo,location.href).href,width:200,height:200,colorDark:'#0b0812',colorLight:'#ffffff'})}catch(e){el.closest('.qrc')?.remove()}}

/* ---------- después del corte: fotos, calificación anónima y reseña ---------- */
const ETQ_CAL=[['corte','✂️ Corte'],['trato','🤝 Trato'],['puntualidad','⏰ Puntualidad'],['limpieza','🧼 Limpieza'],['ambiente','🎶 Ambiente']];
const resenaUrl=()=>/^https:\/\/[^\s"'<>]+$/.test(P.cfg.resenaUrl||'')?P.cfg.resenaUrl:'';
function atendidaHTML(i){const f=i.fotos||{},foto=(k,t)=>f[k]?`<a href="${esc(API.fotoCita(i.codigo,k))}" target="_blank" rel="noopener"><img src="${esc(API.fotoCita(i.codigo,k))}" alt="${t}" loading="lazy"><span>${t}</span></a>`:'';
 return `${f.antes||f.despues?`<div class="card"><p class="pt" style="margin-top:0">📷 Tu antes y después</p><div class="fotos">${foto('antes','ANTES')}${foto('despues','DESPUÉS')}</div></div>`:''}
 <div id="calCard">${calHTML(i)}</div>
 ${resenaUrl()?`<div class="card" style="text-align:center"><p style="margin:0 0 10px">⭐ ¿Nos dejas una reseña en Google? Nos ayuda muchísimo a crecer 🙏</p><a class="btn p" style="text-decoration:none" href="${esc(resenaUrl())}" target="_blank" rel="noopener">⭐ Dejar mi reseña en Google</a></div>`:''}`}
function calHTML(i){const c=i.calificacion||{};if(c.hecha)return `<div class="card" style="text-align:center;color:#3fb950;font-weight:700">⭐ ¡Gracias por calificarnos! Tu opinión es anónima.</div>`;if(!c.puede)return'';
 const k=E.cal||(E.cal={estrellas:0,etiquetas:[],txt:''});
 return `<div class="card"><p class="pt" style="margin-top:0">⭐ ¿Cómo te atendimos?</p><p style="font-size:13px;color:var(--mu);margin:0 0 6px">Es <b>anónimo</b>: la barbería no ve tu nombre ni tu celular.</p>
 <div class="stars">${[1,2,3,4,5].map(n=>`<button class="${n<=k.estrellas?'on':''}" aria-label="${n} estrella${n>1?'s':''}" data-on-click="calEstrella" data-p0="${n}">⭐</button>`).join('')}</div>
 ${k.estrellas?`<p class="pt">¿Qué destacas?</p><div class="chipsc">${ETQ_CAL.map(([v,t])=>`<button class="${k.etiquetas.includes(v)?'on':''}" data-on-click="calEtiqueta" data-p0="${v}">${t}</button>`).join('')}</div>
 <textarea class="in" rows="3" maxlength="300" placeholder="Cuéntanos algo más (opcional)" style="margin-top:10px" data-on-input="calTexto">${esc(k.txt)}</textarea>
 <button class="btn p w" style="margin-top:10px" data-on-click="calEnviar">Enviar calificación</button>`:''}</div>`}
const pintarCal=()=>{const el=$('#calCard');if(el)el.innerHTML=calHTML(E.info)};
ACC.calEstrella=function(){E.cal.estrellas=+this.dataset.p0;pintarCal()};
ACC.calEtiqueta=function(){const v=this.dataset.p0,l=E.cal.etiquetas;E.cal.etiquetas=l.includes(v)?l.filter(x=>x!==v):[...l,v];pintarCal()};
ACC.calTexto=function(){E.cal.txt=this.value};
ACC.calEnviar=async function(){this.disabled=true;const k=E.cal;try{await API.calificar(E.codigo,{estrellas:k.estrellas,etiquetas:k.etiquetas,comentario:k.txt});E.info.calificacion={hecha:true,puede:false};pintarCal();toast('⭐ ¡Gracias!')}catch(e){this.disabled=false;toast('❌ '+e.message)}};
function escribir(){const i=E.info;window.open(waUrl(waNum(P.cfg.whatsapp),`Hola 👋 Soy ${(i.cliente?.nombre||'').split(' ')[0]}. Mi código de cita es ${i.codigo}.`),'_blank')}

/* Reprogramar: mismo barbero, solo días y horas libres */
function libres(fecha,bid){const cfg=P.cfg,b=P.barberos.find(x=>x.id===bid);if(!trabaja(cfg,b,fecha))return[];
 const esHoy=fecha===hoy(),n=new Date(),nm=n.getHours()*60+n.getMinutes();
 return slotsDia(cfg).filter(h=>!esHoy||toMin(h)>nm+10).map(h=>({h,ok:!P.ocupados.some(o=>o.b===bid&&o.f===fecha&&o.h===h)}))}
async function reprogUI(){const i=E.info;if(!puedeRep(i))return pintar();clearInterval(E.timer);
 try{const d=await API.publico();P.ocupados=d.ocupados||[]}catch(e){}
 const ini=addD(hoy(),+P.cfg.anticipacion||0),dias=[];for(let k=0;k<Math.max(1,+P.cfg.ventana||14);k++){const f=addD(ini,k);dias.push({f,ok:libres(f,i.barberoId).some(x=>x.ok)})}
 if(!E.rf||!dias.find(d=>d.f===E.rf&&d.ok))E.rf=dias.find(d=>d.ok)?.f||null;
 const sl=E.rf?libres(E.rf,i.barberoId):[];if(E.rh&&!sl.find(x=>x.h===E.rh&&x.ok))E.rh=null;
 shell(`<h2>📅 Reprogramar</h2><p class="pt">Ahora: <b>${fLarga(i.fecha)} · ${h12(i.hora)}</b> con ${esc(i.barbero||'')}. Elige el nuevo día y hora.</p>
 ${dias.some(d=>d.ok)?`<div class="days">${dias.map(d=>{const x=pYmd(d.f);return `<button class="day ${E.rf===d.f?'on':''}" ${d.ok?'':'disabled'} data-on-click="aac29339c" data-p0="${d.f}"><small>${d.f===hoy()?'Hoy':DIAS[x.getDay()]}</small><b>${x.getDate()}</b><small>${MESC[x.getMonth()]}</small></button>`}).join('')}</div>
 <div class="slots" style="margin-top:10px">${sl.map(x=>`<button class="slot ${E.rh===x.h?'on':''}" ${x.ok?'':'disabled'} data-on-click="a19f99106" data-p0="${x.h}">${h12(x.h)}</button>`).join('')}</div>`:`<div class="empty">😕 Tu barbero no tiene horarios libres en los próximos días. Escríbenos por WhatsApp.</div>`}`,
 `<button class="btn" data-on-click="a4359688b">←</button><button class="btn p" ${E.rh?'':'disabled'} data-on-click="a907ccc13">✅ Confirmar cambio</button>`)}
async function reprogOk(){const i=E.info;if(!E.rf||!E.rh)return;if(!confirm(`¿Cambiar tu cita al ${fLarga(E.rf)} a las ${h12(E.rh)}?`))return;
 try{await API.reprogramar(i.codigo,E.rf,E.rh);toast('✅ Cita reprogramada');E.rf=E.rh=null;await cargar(i.codigo)}catch(e){toast('❌ '+e.message);reprogUI()}}

(async function(){
 try{const d=await API.publico();P.cfg={dias:[1,2,3,4,5,6],apertura:'09:00',cierre:'20:00',refIni:'13:00',refFin:'14:00',anticipacion:0,ventana:14,...DEF_ESCENA,...(d.cfg||{}),narr:{...VOZ.FRASES,...(d.cfg?.narr||{})}};P.barberos=d.barberos||[];P.ocupados=d.ocupados||[];hero();
  Escena.iniciar({cfg:P.cfg,hoy,audio:k=>API.audio(k),foto:async k=>API.foto(k)})}
 catch(e){Escena.error();$('#hero').innerHTML='<div class="logo">💈</div><div><h1>Estado de tu cita</h1></div>'}
 const c=(new URLSearchParams(location.search).get('c')||'').trim().toUpperCase();
 if(/^[A-Z0-9]{6}$/.test(c))cargar(c);else pedirCodigo('');
})();

/* Confirmar asistencia desde el link de la cita (reduce los «no vino»). */
API.confirmable=i=>startOf(i.fecha,i.hora)-Date.now()>-30*60e3;
ACC.confirmarAsistencia=async function(){this.disabled=true;try{await API.req('POST','/publico/cita/'+encodeURIComponent(E.codigo)+'/confirmar',{});toast('👍 ¡Listo! Te esperamos');await cargar(E.codigo)}catch(e){this.disabled=false;toast('❌ '+e.message)}};
