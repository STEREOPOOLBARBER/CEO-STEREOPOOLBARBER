/* =====================================================================
   BARBERÍA · FORMULARIO DE RESERVAS (público)
   Modo nube:  publicado en Cloudflare usa la API /api (worker/index.js).
   Modo local: abierto como archivo o en GitHub Pages, comparte datos con
               index.html en el mismo navegador.
   Endpoints públicos del Worker:
   GET  /publico                 -> {cfg,barberos,servicios,ocupados:[{b,f,h}],ts}
   GET  /publico/link/:token     -> link personal
   POST /publico/reservas        {servicioId,barberoId|'any',fecha,hora,cliente,nota,refFoto,turnstile,linkToken}
                                 -> {id,codigo,expira,barberoId,estado}
   POST /publico/reservas/:id/captura {codigo,data} -> {ok}
   El Worker vuelve a validar horario, precio y Turnstile: el navegador no decide nada.
   ===================================================================== */
const CONFIG={API_URL:/^https?:$/.test(location.protocol)&&!/(^|\.)github\.io$/.test(location.hostname)?'/api':'',TURNSTILE_SITEKEY:'',DUR:60};

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
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const codigo=()=>Array.from({length:6},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
const soles=n=>{n=Number(n)||0;return 'S/ '+(n%1?n.toFixed(2):n)};
const waNum=t=>{let d=String(t||'').replace(/\D/g,'');if(d.length===9)d='51'+d;return d};
/* En computadora se abre WhatsApp Web directo (evita que los emojis salgan como signos de pregunta). */
const waUrl=(n,t)=>(!n||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))?`https://wa.me/${n||''}?text=${encodeURIComponent(t)}`:`https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(t)}`;
const lsGet=(k,d)=>{try{const v=localStorage.getItem('brb_'+k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem('brb_'+k,JSON.stringify(v));return true}catch(e){return false}};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),2800)}
function copiar(txt){navigator.clipboard?.writeText(txt).then(()=>toast('📋 Copiado')).catch(()=>prompt('Copia:',txt))}

const IDB={_db:null,open(){return this._db||(this._db=new Promise((res,rej)=>{const r=indexedDB.open('brb_fotos',1);r.onupgradeneeded=()=>r.result.createObjectStore('f');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))},
 async put(k,v){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('f','readwrite');t.objectStore('f').put(v,k);t.oncomplete=()=>res(k);t.onerror=()=>rej(t.error)})},
 async get(k){const db=await this.open();return new Promise(res=>{const r=db.transaction('f').objectStore('f').get(k);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null)})}};
function compressImg(file,max=1000,q=.72){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{let w=img.width,h=img.height;const s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',q))};img.onerror=()=>rej(new Error('Imagen no válida'));img.src=url})}

/* mismos valores por defecto que el panel */
const hoyD=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const COLORES=['#ff3fd2','#8a3ffc','#3fb950','#f0883e','#d29922','#f85149','#39c5cf','#db61a2'];
const DEF_EST={por_validar:{t:'Yape por validar',i:'💸',c:'#f0883e'},confirmada:{t:'Confirmada',i:'✅',c:'#8a3ffc'},en_silla:{t:'En silla',i:'💺',c:'#ff3fd2'},atendida:{t:'Atendido',i:'✔️',c:'#3fb950'},no_vino:{t:'No vino',i:'❌',c:'#f85149'},cancelada:{t:'Cancelada',i:'🚫',c:'#a397b8'},expirada:{t:'Expirada',i:'⌛',c:'#a397b8'}};
const DEF_CFG={nombre:'Stereo Barber Pool',eslogan:'Barber · Pool · Lima',logo:'🎱',logoImg:'',acento:'#8a3ffc',acento2:'#ff3fd2',
 whatsapp:'',ciudad:'Lima, Perú',direccion:'Av. Principal 123, Puente Piedra',maps:'',lat:'',lng:'',
 modAdelanto:true,yapeNum:'',yapeTitular:'',yapeQR:'',adelanto:10,holdMin:20,
 dias:[1,2,3,4,5,6],apertura:'09:00',cierre:'20:00',refIni:'13:00',refFin:'14:00',anticipacion:0,ventana:14,
 modFotos:true,modFidelidad:true,fidelidad:6,modComision:true,modWalkin:true,
 txtBienvenida:'¿Qué te hacemos hoy?',txtFinal:'¡Reserva recibida!',
 waConfirma:'Hola {cliente} 👋\nTu cita en *{negocio}* está *CONFIRMADA* ✅\n\n📅 {fecha} a las {hora}\n💈 Barbero: {barbero}\n✂️ {servicio}\n🔖 Código: {codigo}\n📍 {direccion}\n🗺️ {maps}\n\nTe esperamos 💪',
 waRecuerda:'Hola {cliente} 👋 Te recordamos tu cita en *{negocio}*:\n\n📅 {fecha} a las {hora}\n💈 {barbero} · ✂️ {servicio}\n📍 {direccion}\n\nSi no puedes venir, avísanos por aquí 🙏',
 waGracias:'¡Gracias por venir a *{negocio}*, {cliente}! 💈🔥\nCuando quieras repetir, reserva aquí:\n{link}',
 waYape:'Hola {cliente} 👋 Para confirmar tu cita del {fecha} a las {hora} falta el adelanto de *{adelanto}* por Yape al *{yape}*. Envíanos la captura por aquí 🙏',
 waVuelve:'Hola {cliente} 👋 ¡Te extrañamos en *{negocio}*, sobrino! Ya toca corte 💈\nReserva aquí: {link}',
 linkBase:'',
 waReserva:'💈 *NUEVA RESERVA* — #{codigo}\n\n👤 {cliente}\n📱 {telefono}\n📍 {ciudad}\n✂️ {servicio} — {precio}\n💈 {barbero}\n📅 {fecha} · {hora}\n💸 {pago}\n📝 {nota}\n\n🔎 Estado de la cita: {seguimiento}',
 narrOn:true,narrNombre:'Tío Stereo',narrImg:'',narrAudio:{},splashOn:true,splashImg:'',splashMelt:true,
 narr:{...VOZ.FRASES},
 est:{},adminPin:'1234',bloqueos:[]};
const DEF_BARB=()=>[['Jhon','Fades y degradados'],['Brayan','Diseños y freestyle'],['Piero','Cortes clásicos'],['Alexis','Barba y perfilado'],['Renzo','Taper y mullet']].map(([n,e],i)=>({id:'b'+(i+1),nombre:n,esp:e,foto:'',color:COLORES[i],pin:String(i+1).repeat(4),comision:50,dias:[1,2,3,4,5,6],activo:true}));
const DEF_SERV=()=>[
 {id:'s1',emoji:'✂️',nombre:'Corte clásico',precio:25,desc:'Tijera y máquina, acabado limpio',foto:'',activo:true},
 {id:'s2',emoji:'🔥',nombre:'Fade / Degradado',precio:30,desc:'Low, mid o high fade',foto:'',activo:true},
 {id:'s3',emoji:'💈',nombre:'Taper',precio:30,desc:'Degradado suave en patillas y nuca',foto:'',activo:true},
 {id:'s4',emoji:'🧔',nombre:'Corte + Barba',precio:40,desc:'Corte completo y perfilado de barba',foto:'',activo:true},
 {id:'s5',emoji:'🪒',nombre:'Barba',precio:15,desc:'Perfilado con toalla caliente',foto:'',activo:true},
 {id:'s6',emoji:'🎨',nombre:'Diseño / Freestyle',precio:35,desc:'Líneas y figuras a mano alzada',foto:'',activo:true}];
function demoCitas(){const h=hoyD(),m=addD(h,1),sv=DEF_SERV(),mk=(f,hr,b,s,nom,tel,ciu,est,x={})=>({id:'demo_'+uid(),codigo:codigo(),creada:Date.now(),demo:true,fecha:f,hora:hr,barberoId:b,servicioId:sv[s].id,servicioNombre:sv[s].nombre,precio:sv[s].precio,cliente:{nombre:nom,tel,ciudad:ciu},nota:'',estado:est,adelanto:10,adelantoOk:['confirmada','en_silla','atendida'].includes(est),origen:'web',...x});
 return[mk(h,'09:00','b1',1,'Carlos Ramírez Quispe','987654321','Puente Piedra','atendida'),
  mk(h,'10:00','b1',3,'Luis Fernando Torres','912345678','Carabayllo','en_silla',{nota:'Mid fade, dejar volumen arriba'}),
  mk(h,'11:00','b1',1,'Jhon Paredes Huamán','998877665','Comas','por_validar'),
  mk(h,'15:00','b1',0,'Kevin Rojas Silva','955443322','Los Olivos','confirmada'),
  mk(h,'10:00','b2',5,'Miguel Ángel Flores','944556677','Puente Piedra','confirmada',{nota:'Diseño de rayo al costado'}),
  mk(h,'12:00','b2',2,'Diego Salazar Chávez','966778899','Ancón','por_validar',{expira:Date.now()+14*60000}),
  mk(h,'09:00','b3',4,'Bryan Mendoza Ríos','933221100','Puente Piedra','no_vino'),
  mk(h,'16:00','b3',0,'Renzo Castillo Vega','977665544','Comas','confirmada',{adelanto:0,adelantoOk:false,origen:'panel'}),
  mk(m,'10:00','b1',1,'Carlos Ramírez Quispe','987654321','Puente Piedra','confirmada'),
  mk(m,'11:00','b4',3,'Anthony Gutiérrez','921098765','Santa Rosa','por_validar')]}
function seed(){if(!lsGet('cfg',null))lsSet('cfg',DEF_CFG);if(!lsGet('barberos',null))lsSet('barberos',DEF_BARB());if(!lsGet('servicios',null))lsSet('servicios',DEF_SERV());if(!lsGet('citas',null))lsSet('citas',demoCitas())}
const mergeCfg=c=>({...DEF_CFG,...c,est:{...(c?.est||{})},narr:{...DEF_CFG.narr,...(c?.narr||{})}});

const ACTIVOS=['por_validar','confirmada','en_silla','atendida'];
const activa=(c,now=Date.now())=>ACTIVOS.includes(c.estado)&&!(c.estado==='por_validar'&&c.expira&&c.expira<now);
function slotsDia(cfg){const out=[],dur=CONFIG.DUR,fin=toMin(cfg.cierre),ri=toMin(cfg.refIni),rf=toMin(cfg.refFin);let t=toMin(cfg.apertura),g=0;if(t==null||fin==null)return out;while(t+dur<=fin&&g++<60){if(ri!=null&&rf!=null&&rf>ri&&t<rf&&t+dur>ri){t=rf;continue}out.push(fromMin(t));t+=dur}return out}
const bloqueado=(cfg,f,bid)=>(cfg.bloqueos||[]).some(b=>b.fecha===f&&(!b.barberoId||b.barberoId===bid));
const trabaja=(cfg,b,f)=>{const d=pYmd(f).getDay();return b&&b.activo!==false&&(cfg.dias||[]).includes(d)&&(b.dias||[]).includes(d)&&!bloqueado(cfg,f,b.id)};
const ocupadoLocal=(cs,bid,f,h)=>cs.some(c=>c.barberoId===bid&&c.fecha===f&&c.hora===h&&activa(c));
function expirarLocal(){const cs=lsGet('citas',[]),now=Date.now();let ch=false;cs.forEach(c=>{if(c.estado==='pendiente_pago'){c.estado='por_validar';ch=true}if(c.estado==='por_validar'&&c.expira&&c.expira<now){c.estado='expirada';ch=true}});if(ch)lsSet('citas',cs);return cs}
const sinPago=cfg=>!(cfg.modAdelanto&&cfg.yapeNum&&+cfg.adelanto>0);
const adel=()=>F.link&&F.link.adelanto!=null&&F.link.adelanto!==''?+F.link.adelanto:+P.cfg.adelanto;
const sinPagoF=()=>!(P.cfg.modAdelanto&&P.cfg.yapeNum&&adel()>0);
function applyTheme(c){const s=document.documentElement.style;const a1=!c.acento||c.acento==='#388bfd'?'#8a3ffc':c.acento,a2=!c.acento2||c.acento2==='#a371f7'?'#ff3fd2':c.acento2;s.setProperty('--blue',a1);s.setProperty('--pur',a2)}
function tpl(s,v){return String(s||'').split('\n').map(l=>{let had=false,full=false;const x=l.replace(/\{(\w+)\}/g,(m,k)=>{if(!(k in v))return m;had=true;if(v[k])full=true;return v[k]});return had&&!full?null:x}).filter(x=>x!==null).join('\n')}

/* ---------- API ---------- */
const API={
 get remote(){return !!CONFIG.API_URL},
 async req(m,p,b){const r=await fetch(CONFIG.API_URL+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Error '+r.status));return j},
 /* La consulta de DNI necesita la «ficha» del formulario (token firmado de 30 min que el Worker entrega tras Turnstile). */
 async ficha(){if(F.ficha&&F.fichaExp>Date.now()+60e3)return F.ficha;
  if(CONFIG.TURNSTILE_SITEKEY&&!await tsEsperar(10))throw new Error('Completa la verificación')
  const r=await this.req('POST','/publico/ficha',{turnstile:F.ts||''});if(CONFIG.TURNSTILE_SITEKEY)tsNuevo();F.ficha=r.ficha;F.fichaExp=r.exp;return r.ficha},
 async dni(d,otra){const f=await this.ficha(),r=await fetch(CONFIG.API_URL+'/publico/dni/'+d,{headers:{'X-Ficha':f}}),j=await r.json().catch(()=>({}));
  if(r.status===403&&!otra){F.ficha=null;return this.dni(d,true)}if(!r.ok)throw new Error(j.error||('Error '+r.status));return j},
 async publico(){if(this.remote){const d=await this.req('GET','/publico');d.cfg=mergeCfg(d.cfg);return d}seed();const cs=expirarLocal();const cfg=mergeCfg(lsGet('cfg',{}));delete cfg.adminPin;
  return{cfg,barberos:lsGet('barberos',[]).filter(b=>b.activo!==false).map(({pin,comision,...b})=>b),servicios:lsGet('servicios',[]).filter(s=>s.activo!==false),ocupados:cs.filter(c=>activa(c)).map(c=>({b:c.barberoId,f:c.fecha,h:c.hora}))}},
 async crear(d){if(this.remote)return this.req('POST','/publico/reservas',d);
  const cs=expirarLocal(),cfg=mergeCfg(lsGet('cfg',{})),bs=lsGet('barberos',[]),s=lsGet('servicios',[]).find(x=>x.id===d.servicioId&&x.activo!==false);
  if(!s)throw new Error('El servicio ya no está disponible');
  if(!slotsDia(cfg).includes(d.hora))throw new Error('Horario no válido');
  let bid=d.barberoId;
  if(bid==='any'){const lib=bs.filter(b=>trabaja(cfg,b,d.fecha)&&!ocupadoLocal(cs,b.id,d.fecha,d.hora));if(!lib.length)throw new Error('Ese horario se acaba de ocupar 😕');const carga=b=>cs.filter(c=>c.barberoId===b.id&&c.fecha===d.fecha&&activa(c)).length;lib.sort((a,b)=>carga(a)-carga(b));bid=lib[0].id}
  else{const b=bs.find(x=>x.id===bid);if(!trabaja(cfg,b,d.fecha))throw new Error('Ese barbero no atiende ese día');if(ocupadoLocal(cs,bid,d.fecha,d.hora))throw new Error('Ese horario se acaba de ocupar 😕')}
  let ref='';if(d.refFoto){ref='f_'+uid();await IDB.put(ref,d.refFoto)}
  const lk=d.linkToken?lsGet('links',[]).find(x=>x.token===d.linkToken):null;if(d.linkToken){if(!lk)throw new Error('Este link ya no existe');if(lk.estado==='usado')throw new Error('Este link ya fue usado');if(lk.vence&&lk.vence<Date.now())throw new Error('Este link ya venció')}
  const ad=lk&&lk.adelanto!=null&&lk.adelanto!==''?+lk.adelanto:+cfg.adelanto,np=!(cfg.modAdelanto&&cfg.yapeNum&&ad>0),c={id:uid(),codigo:codigo(),creada:Date.now(),fecha:d.fecha,hora:d.hora,barberoId:bid,servicioId:s.id,servicioNombre:s.nombre,precio:+s.precio||0,cliente:d.cliente,nota:d.nota,refFoto:ref,adelanto:np?0:ad,linkId:lk?.id||'',adelantoOk:false,estado:'por_validar',expira:np?null:Date.now()+(+cfg.holdMin||20)*60000,origen:lk?'link':'web'};if(lk?.nota)c.nota=('🎁 '+lk.nota+(c.nota?' · '+c.nota:''));
  cs.push(c);lsSet('citas',cs);if(lk){const ls=lsGet('links',[]),x=ls.find(y=>y.id===lk.id);Object.assign(x,{estado:'usado',citaId:c.id,usado:Date.now()});lsSet('links',ls)}return{id:c.id,codigo:c.codigo,expira:c.expira,barberoId:bid,estado:c.estado}},
 async captura(id,cod,data){if(this.remote)return this.req('POST',`/publico/reservas/${id}/captura`,{codigo:cod,data});
  const cs=expirarLocal(),c=cs.find(x=>x.id===id&&x.codigo===cod);if(!c)throw new Error('Reserva no encontrada');if(c.estado==='expirada')throw new Error('Se venció el tiempo de pago');if(c.estado!=='por_validar'||!c.expira)throw new Error('Esta reserva ya fue procesada');
  const k='f_'+uid();await IDB.put(k,data);c.yapeCaptura=k;c.estado='por_validar';c.expira=null;c.upd=Date.now();lsSet('citas',cs);return{ok:true}},
 /* Grabación del narrador (WAV) como bytes, para la voz de js/escena.js. */
 async audio(k){if(this.remote){const r=await fetch(`${CONFIG.API_URL}/audio/${k}`);if(!r.ok)throw new Error('audio');return r.arrayBuffer()}const u=await IDB.get(k);if(!u)throw new Error('audio');return(await fetch(u)).arrayBuffer()},
 async link(t){if(this.remote)return this.req('GET','/publico/link/'+encodeURIComponent(t));return lsGet('links',[]).find(l=>l.token===t)||null},
 async foto(k){if(!k)return'';if(/^(data:|https?:)/.test(k))return k;if(this.remote)return `${CONFIG.API_URL}/fotos/${k}`;return(await IDB.get(k))||''}
};

/* ---------- estado del formulario ---------- */
let P=null;
const F={step:0,serv:null,barb:null,fecha:null,hora:null,cli:{nombre:'',tel:'',ciudad:'',...lsGet('yo',{})},nota:'',ref:'',cap:'',cita:null,ts:'',busy:false};
const PASOS=['Servicio','Barbero','Día y hora','Tus datos','Adelanto','Listo'];
let timerInt=null;
const serv=()=>P.servicios.find(s=>s.id===F.serv);
const barbNom=id=>id==='any'?'El primero disponible':(P.barberos.find(b=>b.id===id)?.nombre||'');

function hero(){const c=P.cfg;document.title='Reservar · '+c.nombre;applyTheme(c);
 $('#hero').innerHTML=`<div class="logo">${c.logoImg?`<img data-foto="${c.logoImg}" style="width:100%;height:100%;object-fit:cover">`:esc(c.logo||'💈')}</div><div><h1>${esc(c.nombre)}</h1>${c.eslogan?`<p>${esc(c.eslogan)}</p>`:''}<p>📍 ${esc(c.direccion||c.ciudad)}${c.maps?` · <a href="${esc(c.maps)}" target="_blank" rel="noopener">Ver mapa</a>`:''}</p></div>`;$('#hero').querySelectorAll('img[data-foto]').forEach(async im=>{im.src=await API.foto(im.dataset.foto)})}
function shell(inner,foot=''){
 const n=sinPagoF()?[0,1,2,3,5]:[0,1,2,3,4,5],idx=n.indexOf(F.step);
 $('#app').innerHTML=`${F.step<5?`<div class="prog">${n.slice(0,-1).map((_,i)=>`<i class="${i<=idx?'on':''}"></i>`).join('')}</div><p class="pt">Paso ${idx+1} de ${n.length-1} · ${PASOS[F.step]}</p>`:''}${F.link&&F.step<5?`<div class="warn" style="border-color:var(--pur);color:var(--tx);background:rgba(255,63,210,.1)">🔑 Link personal${F.link.cliente?.nombre?' de <b>'+esc(F.link.cliente.nombre)+'</b>':''}${F.link.nota?`<br>🎁 ${esc(F.link.nota)}`:''}${F.link.adelanto!=null&&F.link.adelanto!==''?`<br>💸 Adelanto: ${+F.link.adelanto?soles(F.link.adelanto):'sin adelanto'}`:''}</div>`:''}${inner}${foot?`<div class="foot">${foot}</div>`:''}`;
 document.querySelectorAll('#app img[data-foto]').forEach(async im=>{const s=await API.foto(im.dataset.foto);if(s)im.src=s});
 Escena.pie(!!foot);
}
function go(s){F.step=s;render();scrollTo(0,0)}
function back(){go(Math.max(0,F.step-1))}
function render(){clearInterval(timerInt);[s0,s1,s2,s3,s4,s5][F.step]()}

/* paso 0: servicio */
function s0(){if(!P.servicios.length)return shell('<div class="empty">✂️<br>La barbería aún no publicó sus servicios.</div>');
 const u=lsGet('ultima',null),prev=u&&u.codigo&&u.fecha>=hoy()?`<a class="warn" style="display:block;text-decoration:none;border-color:var(--pur);color:var(--tx);background:rgba(138,63,252,.12)" href="estado.html?c=${encodeURIComponent(u.codigo)}">📋 Tienes una cita el <b>${fLarga(u.fecha)}</b> · ${h12(u.hora)}<br><small style="color:var(--mu)">Toca para ver su estado</small></a>`:'';
 shell(`${prev}<h2>${esc(P.cfg.txtBienvenida||'¿Qué te hacemos hoy?')}</h2>${P.servicios.map(s=>`<button class="opt ${F.serv===s.id?'on':''}" data-on-click="aab7eb6b8" data-p0="${s.id}"><span class="em">${s.foto?`<img data-foto="${s.foto}" alt="">`:s.emoji}</span><span class="t"><b>${esc(s.nombre)}</b><small>${esc(s.desc||'')} · ⏱️ 1 h</small></span><span class="pr">${soles(s.precio)}</span></button>`).join('')}`)}
/* paso 1: barbero */
function s1(){shell(`<h2>Elige tu barbero</h2>
 <button class="opt ${F.barb==='any'?'on':''}" data-on-click="aae95d490"><span class="em round">🎲</span><span class="t"><b>El primero disponible</b><small>Más horarios para elegir</small></span></button>
 ${P.barberos.map(b=>`<button class="opt ${F.barb===b.id?'on':''}" data-on-click="a9b2b8043" data-p0="${b.id}"><span class="em round">${b.foto?`<img data-foto="${b.foto}" alt="">`:'💈'}</span><span class="t"><b>${esc(b.nombre)}</b><small>${b.esp?esc(b.esp)+' · ':''}${[1,2,3,4,5,6,0].filter(d=>(b.dias||[]).includes(d)&&P.cfg.dias.includes(d)).map(d=>DIAS[d]).join(' ')}</small></span></button>`).join('')}`,
 `<button class="btn" data-on-click="af5d7adc5">←</button>`)}
function pickServ(id){F.serv=id;go(1);say('servicio')}
function pickBarb(id){if(F.barb!==id){F.fecha=null;F.hora=null}F.barb=id;go(2);say(id==='any'?'cualquiera':'barbero')}
async function pickDia(f){F.fecha=f;F.hora=null;await s2();say('dia')}
async function pickHora(h){F.hora=h;await s2();say('hora')}
/* paso 2: día y hora */
function libres(fecha){const cfg=P.cfg,bs=P.barberos.filter(b=>(F.barb==='any'||b.id===F.barb)&&trabaja(cfg,b,fecha));if(!bs.length)return[];
 const esHoy=fecha===hoy(),n=new Date(),nm=n.getHours()*60+n.getMinutes();
 return slotsDia(cfg).filter(h=>!esHoy||toMin(h)>nm+10).map(h=>({h,ok:bs.some(b=>!P.ocupados.some(o=>o.b===b.id&&o.f===fecha&&o.h===h))}))}
async function s2(){
 try{const d=await API.publico();P.ocupados=d.ocupados}catch(e){}
 const ini=addD(hoy(),+P.cfg.anticipacion||0),dias=[];for(let i=0;i<Math.max(1,+P.cfg.ventana||14);i++){const f=addD(ini,i),l=libres(f);dias.push({f,ok:l.some(x=>x.ok)})}
 if(!F.fecha||!dias.find(d=>d.f===F.fecha&&d.ok))F.fecha=dias.find(d=>d.ok)?.f||null;
 const sl=F.fecha?libres(F.fecha):[];if(F.hora&&!sl.find(x=>x.h===F.hora&&x.ok))F.hora=null;
 shell(`<h2>¿Qué día y a qué hora?</h2>
 ${dias.some(d=>d.ok)?`<div class="days">${dias.map(d=>{const x=pYmd(d.f);return `<button class="day ${F.fecha===d.f?'on':''}" ${d.ok?'':'disabled'} data-on-click="aca2472e3" data-p0="${d.f}"><small>${d.f===hoy()?'Hoy':DIAS[x.getDay()]}</small><b>${x.getDate()}</b><small>${MESC[x.getMonth()]}</small></button>`}).join('')}</div>
 <p class="pt" style="margin-bottom:8px">${fLarga(F.fecha)} · ${esc(barbNom(F.barb))}</p>
 <div class="slots">${sl.map(x=>`<button class="slot ${F.hora===x.h?'on':''}" ${x.ok?'':'disabled'} data-on-click="aa1001b6c" data-p0="${x.h}">${h12(x.h)}</button>`).join('')}</div>`
 :`<div class="empty">😕 No hay horarios libres en los próximos días${F.barb!=='any'?' con este barbero.<br><br><button class="btn" style="margin:auto" data-on-click="aae95d490">Ver con cualquier barbero</button>':'.'}</div>`}`,
 `<button class="btn" data-on-click="af5d7adc5">←</button><button class="btn p" ${F.hora?'':'disabled'} data-on-click="a093b2e36">Continuar →</button>`)}
/* paso 3: datos */
function s3(){const s=serv(),np=sinPagoF();
 shell(`<h2>Tus datos</h2>
 <div class="card"><div class="res"><span>✂️</span><span><b>${esc(s.nombre)}</b> · ${soles(s.precio)}</span><span>💈</span><span>${esc(barbNom(F.barb))}</span><span>📅</span><span>${fLarga(F.fecha)} · ${h12(F.hora)}</span></div></div>
 <label class="lb">DNI <small style="color:var(--mu)">(opcional · llena tus datos solo)</small></label><input class="in" id="cDni" inputmode="numeric" maxlength="8" placeholder="8 dígitos" autocomplete="off" value="${esc(F.cli.dni||'')}" data-on-input="a5d5818b0"><small id="dniEst" style="color:var(--mu);display:block;min-height:16px;margin-top:4px"></small><small style="color:var(--mu);display:block;font-size:11px">Si lo escribes, consultamos tu nombre en RENIEC para llenarlo por ti. <a href="privacidad.html" target="_blank" rel="noopener" style="color:var(--blue)">Privacidad</a></small>
 <label class="lb">Nombre y apellido *</label><input class="in" id="cNom" autocomplete="name" value="${esc(F.cli.nombre)}">
 <label class="lb">WhatsApp *</label><div class="pre"><span>+51</span><input class="in" id="cTel" inputmode="tel" autocomplete="tel" placeholder="9XXXXXXXX" maxlength="11" value="${esc(F.cli.tel)}"></div>
 <label class="lb">Ciudad / distrito *</label><input class="in" id="cCiu" placeholder="Ej: Puente Piedra, Lima" value="${esc(F.cli.ciudad)}">
 <label class="lb">¿Algo que deba saber tu barbero?</label><textarea class="in" id="cNota" rows="2" placeholder="Ej: mid fade, dejar largo arriba">${esc(F.nota)}</textarea>
 <label class="lb">Foto de referencia (opcional)</label>
 <label class="upl"><span class="prev" id="refPrev">${F.ref?`<img src="${F.ref}">`:'🖼️'}</span><span><b>Sube el corte que quieres</b><br><small style="color:var(--mu)">Una captura de Instagram o TikTok sirve</small></span><input type="file" accept="image/*" data-on-change="a488e7220"></label>
 <label class="chk"><input type="checkbox" id="cOk" ${F.cli.nombre?'checked':''}><span>Acepto que usen mis datos para gestionar mi cita, validar mi DNI y escribirme por WhatsApp, según el <a href="privacidad.html" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:underline">aviso de privacidad</a>.</span></label>
 <div id="ts" style="margin-top:12px"></div><p class="err" id="err"></p>`,
 `<button class="btn" data-on-click="a50bede1b">←</button><button class="btn p" id="bRes" data-on-click="aba4fdcb4">${np?'✅ Reservar':`Reservar y pagar ${soles(adel())} →`}</button>`);
 if(CONFIG.TURNSTILE_SITEKEY)loadTS()}
let dniAuto='';
async function buscarDni(inp){const v=inp.value.replace(/\D/g,'');inp.value=v;const est=$('#dniEst');if(!est)return;
 if(v.length!==8||!API.remote){est.textContent='';return}
 est.textContent='🔎 Buscando tus datos…';
 try{const r=await API.dni(v);if($('#cDni')?.value!==v)return;const n=$('#cNom');
  if(n&&(!n.value.trim()||n.value===dniAuto)){n.value=r.nombre;dniAuto=r.nombre;n.dispatchEvent(new Event('input'))}
  est.textContent='✅ Datos encontrados. Revísalos antes de continuar.'}
 catch(e){est.textContent=/No encontramos/.test(e.message)?'No encontramos ese DNI. Escribe tu nombre a mano.':/consultas de DNI|Demasiadas/.test(e.message)?'Escribe tu nombre a mano 🙂':''}}
function guardaCli(){const g=id=>$(id)?.value.trim()||'';F.cli={nombre:g('#cNom'),tel:g('#cTel').replace(/\D/g,''),dni:g('#cDni').replace(/\D/g,''),ciudad:g('#cCiu')};F.nota=g('#cNota')}
async function refFoto(inp){const f=inp.files[0];if(!f)return;try{F.ref=await compressImg(f,900,.72);$('#refPrev').innerHTML=`<img src="${F.ref}">`}catch(e){toast('❌ '+e.message)}}
/* Turnstile: cada pase sirve una sola vez. Al usarlo (consulta DNI o reserva) se pide otro con tsNuevo(). */
let TSW=null;
function tsNuevo(){F.ts='';try{if(TSW!=null&&$('#ts')?.childElementCount)window.turnstile?.reset(TSW)}catch(_){}}
async function tsEsperar(seg=10){for(let i=0;i<seg*4&&!F.ts;i++)await new Promise(r=>setTimeout(r,250));return F.ts}
function loadTS(){const r=()=>{F.ts='';TSW=window.turnstile.render('#ts',{sitekey:CONFIG.TURNSTILE_SITEKEY,theme:'dark',callback:t=>F.ts=t,'expired-callback':tsNuevo,'error-callback':()=>{F.ts=''}})};if(window.turnstile)return r();const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.onload=r;document.head.appendChild(s)}
async function reservar(){if(F.busy)return;guardaCli();const e=$('#err'),c=F.cli;
 if(c.nombre.length<3)return e.textContent='Escribe tu nombre completo';
 if(!/^9\d{8}$/.test(c.tel.slice(-9))||c.tel.length<9)return e.textContent='Escribe un WhatsApp válido (9 dígitos, empieza con 9)';
 if(c.dni&&c.dni.length!==8)return e.textContent='El DNI debe tener 8 dígitos (o déjalo vacío)';
 if(c.ciudad.length<2)return e.textContent='Escribe tu ciudad o distrito';
 if(!$('#cOk').checked)return e.textContent='Marca la casilla para continuar';
 F.busy=true;const b=$('#bRes');b.disabled=true;b.textContent='Reservando…';
 if(CONFIG.TURNSTILE_SITEKEY&&!F.ts){b.textContent='Verificando…';if(!await tsEsperar(12)){F.busy=false;b.disabled=false;b.textContent='Reintentar';return e.textContent='Completa la verificación de Cloudflare'}b.textContent='Reservando…'}
 try{c.tel=c.tel.slice(-9);lsSet('yo',c);
  F.cita=await API.crear({servicioId:F.serv,barberoId:F.barb,fecha:F.fecha,hora:F.hora,cliente:c,nota:F.nota,refFoto:F.ref,turnstile:F.ts,linkToken:F.link?.token||'',consentimiento:true});
  go(F.cita.expira?4:5);say(F.cita.expira?'datos':'listo')}
 catch(err){e.textContent='❌ '+err.message;b.disabled=false;b.textContent='Reintentar';if(/link/i.test(err.message)){F.link=null}if(/ocupa/i.test(err.message)){say('ocupado');F.hora=null;setTimeout(()=>go(2),1400)}}
 finally{F.busy=false;if(CONFIG.TURNSTILE_SITEKEY)tsNuevo()}}
/* paso 4: adelanto Yape */
function s4(){const cfg=P.cfg,s=serv(),resto=Math.max(0,(+s.precio||0)-adel());
 shell(`<h2>Confirma con tu adelanto</h2>
 <div class="pay"><p style="color:var(--mu)">Yapea el adelanto a</p><div class="ynum">${esc(cfg.yapeNum.replace(/(\d{3})(\d{3})(\d{3})/,'$1 $2 $3'))}</div><button class="copy" data-on-click="a71d0100d" data-p0="${esc(cfg.yapeNum)}">📋 Copiar número</button>
 ${cfg.yapeTitular?`<p style="margin-top:8px">a nombre de <b>${esc(cfg.yapeTitular)}</b></p>`:''}
 <div class="amt">${soles(adel())}</div>
 <p style="color:var(--mu);font-size:13px">El resto (${soles(resto)}) lo pagas en el local</p>
 ${cfg.yapeQR?`<img class="qr" data-foto="${cfg.yapeQR}" alt="QR Yape">`:''}</div>
 <div class="card" style="margin-top:12px;text-align:center"><p style="color:var(--mu);font-size:13px">Tu horario está apartado por</p><div class="timer" id="tm">--:--</div></div>
 <label class="lb">Sube la captura del Yape *</label>
 <label class="upl"><span class="prev" id="capPrev">${F.cap?`<img src="${F.cap}">`:'📸'}</span><span><b>Toca para subir tu comprobante</b><br><small style="color:var(--mu)">Captura de pantalla del Yape</small></span><input type="file" accept="image/*" data-on-change="a96bf7333"></label>
 <p class="err" id="err"></p>`,
 `<button class="btn g" id="bCap" ${F.cap?'':'disabled'} data-on-click="a3caf2b0f">📤 Enviar comprobante</button>`);
 const tick=()=>{const ms=F.cita.expira-Date.now();if(ms<=0){clearInterval(timerInt);vencido();return}const t=$('#tm');if(t)t.textContent=`${pad(Math.floor(ms/60000))}:${pad(Math.floor(ms/1000)%60)}`};tick();timerInt=setInterval(tick,1000)}
async function capFoto(inp){const f=inp.files[0];if(!f)return;try{F.cap=await compressImg(f,1100,.75);$('#capPrev').innerHTML=`<img src="${F.cap}">`;$('#bCap').disabled=false}catch(e){toast('❌ '+e.message)}}
async function enviarCap(){if(F.busy)return;F.busy=true;const b=$('#bCap');b.disabled=true;b.textContent='Enviando…';
 try{await API.captura(F.cita.id,F.cita.codigo,F.cap);go(5);say('listo')}catch(e){$('#err').textContent='❌ '+e.message;b.disabled=false;b.textContent='📤 Reintentar';if(/venci/i.test(e.message))vencido()}finally{F.busy=false}}
function vencido(){clearInterval(timerInt);say('vencido');$('#app').innerHTML=`<div class="ok"><b>⌛</b><h2>Se acabó el tiempo</h2><p style="color:var(--mu)">Tu horario se liberó porque no recibimos el comprobante a tiempo. Puedes volver a reservar.</p></div><div class="foot"><button class="btn p" data-on-click="a79618d45">🔄 Reservar de nuevo</button></div>`}
/* paso 5: listo */
function s5(){const cfg=P.cfg,s=serv(),c=F.cita,np=!c.expira&&sinPagoF();lsSet('ultima',{codigo:c.codigo,fecha:F.fecha,hora:F.hora});
 const base=(cfg.linkBase||'').trim()||location.origin+location.pathname,seg=(()=>{try{const u=new URL(base,location.href);u.pathname=u.pathname.replace(/reservar(\.html)?$/,'estado.html').replace(/\/$/,'/estado.html');if(!/estado\.html$/.test(u.pathname))u.pathname=u.pathname.replace(/[^/]*$/,'estado.html');u.search='?c='+c.codigo;u.hash='';return u.href}catch(e){return `${base}?c=${c.codigo}`}})(),plant=(cfg.waReserva||'')+((cfg.waReserva||'').includes('{seguimiento}')?'':'\n\n🔎 Estado de la cita: {seguimiento}');
 const msg=tpl(plant,{seguimiento:seg,cliente:F.cli.nombre,telefono:F.cli.tel,ciudad:F.cli.ciudad,servicio:s.nombre,precio:soles(s.precio),barbero:barbNom(c.barberoId),fecha:fLarga(F.fecha),hora:h12(F.hora),codigo:c.codigo,negocio:cfg.nombre,direccion:cfg.direccion||cfg.ciudad,nota:F.nota,adelanto:soles(adel()),pago:np?'':`Adelanto ${soles(adel())} enviado por Yape (adjunto captura)`});
 shell(`<div class="ok"><b>✅</b><h2>${esc(cfg.txtFinal||'¡Reserva recibida!')}</h2><p style="color:var(--mu)">Tu código</p><div class="code">${esc(c.codigo)}</div></div>
 <div class="card"><div class="res"><span>✂️</span><span><b>${esc(s.nombre)}</b> · ${soles(s.precio)}</span><span>💈</span><span>${esc(barbNom(c.barberoId))}</span><span>📅</span><span>${fLarga(F.fecha)} · ${h12(F.hora)}</span><span>📍</span><span>${esc(cfg.direccion||cfg.ciudad)}</span></div></div>
 <div class="warn">⏳ ${np?'La barbería confirmará tu cita por WhatsApp.':'Validaremos tu Yape y te confirmamos por WhatsApp.'} Toca el botón verde para avisarnos ahora.</div>`,
 `${cfg.whatsapp?`<button class="btn g" data-on-click="ac8f245b7" data-p0="${waNum(cfg.whatsapp)}">💬 Avisar por WhatsApp</button>`:''}<button class="btn" data-on-click="a79618d45">＋ Otra</button>`);
 window.MSG=msg}
function reiniciar(){Object.assign(F,{link:null,step:0,serv:null,barb:null,fecha:null,hora:null,nota:'',ref:'',cap:'',cita:null});render();scrollTo(0,0)}

/* =================== NARRADOR (js/escena.js) =================== */
function nv(){const s=serv(),b=P.barberos.find(x=>x.id===(F.cita?.barberoId||F.barb));return{narrador:P.cfg.narrNombre,servicio:s?.nombre||'',precio:s?soles(s.precio):'',barbero:b?.nombre||'',especialidad:b?.esp||'',fecha:F.fecha?fLarga(F.fecha).toLowerCase():'',hora:F.hora?h12(F.hora):'',cliente:(F.cli.nombre||'').split(' ')[0],adelanto:soles(adel()),yape:(P.cfg.yapeNum||'').replace(/(\d{3})(\d{3})(\d{3})/,'$1 $2 $3'),negocio:P.cfg.nombre}}
/* Globo + voz grabada (con la fecha y la hora elegidas, dichas con las piezas grabadas). */
const say=k=>Escena.decir(k,nv(),{fecha:F.fecha,hora:F.hora});

/* =================== INICIO =================== */
// El estado de una cita vive en estado.html (los links antiguos reservar.html?c=… se redirigen).
{const cc=new URLSearchParams(location.search).get('c');if(cc)location.replace('estado.html?c='+encodeURIComponent(cc))}
function linkBloqueado(t,m){$('#app').innerHTML=`<div class="ok"><b>🔒</b><h2>${t}</h2><p style="color:var(--mu)">${m}</p></div><div class="foot">${P.cfg.whatsapp?`<button class="btn g" data-on-click="ae74f37bc" data-p0="${waNum(P.cfg.whatsapp)}">💬 Escribir a la barbería</button>`:''}<button class="btn" data-on-click="a08d935a8">Reservar normal</button></div>`}
async function cargarLink(){const t=new URLSearchParams(location.search).get('l');if(!t)return true;let l=null;try{l=await API.link(t)}catch(e){}
 if(!l){linkBloqueado('Link no válido','Este link no existe o fue eliminado.');return false}
 if(l.estado==='usado'){linkBloqueado('Este link ya fue usado ✅','Cada link personal sirve para una sola reserva.');return false}
 if(l.vence&&l.vence<Date.now()){linkBloqueado('Este link ya venció ⌛','Pide uno nuevo a la barbería, sobrino.');return false}
 F.link=l;if(l.cliente?.nombre)F.cli={...F.cli,nombre:l.cliente.nombre,...(l.cliente.tel?{tel:l.cliente.tel}:{})};
 if(l.servicioId&&P.servicios.find(x=>x.id===l.servicioId))F.serv=l.servicioId;if(l.barberoId&&P.barberos.find(x=>x.id===l.barberoId))F.barb=l.barberoId;
 F.step=F.serv&&F.barb?2:F.serv?1:0;return true}
(async function(){if(new URLSearchParams(location.search).get('c'))return;
 try{P=await API.publico();if(P.ts)CONFIG.TURNSTILE_SITEKEY=P.ts;hero();const ok=await cargarLink();if(ok)render();
  Escena.iniciar({cfg:P.cfg,hoy,audio:k=>API.audio(k),foto:k=>API.foto(k)});if(ok)say(F.link?.cliente?.nombre?'holaLink':'hola')}
 catch(e){Escena.error();$('#app').innerHTML=`<div class="empty">⚠️ No pudimos cargar la agenda.<br>${esc(e.message)}<br><br><button class="btn" style="margin:auto" data-on-click="a59c74e0f">Reintentar</button></div>`}})();
