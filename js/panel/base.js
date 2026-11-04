/* =====================================================================
   BARBERÍA · PANEL DE CONTROL  (index.html)
   Modo nube:  publicado en Cloudflare usa la API /api (worker/index.js):
               datos en D1, fotos en R2, login SOLO con Google.
   Modo local: abierto como archivo o en GitHub Pages, los datos viven en
               este navegador (localStorage + IndexedDB para fotos).
   La sesión viaja en una cookie segura; el rol y los permisos SIEMPRE
   los decide el Worker, nunca el navegador.
   ===================================================================== */
const CONFIG={API_URL:/^https?:$/.test(location.protocol)&&!/(^|\.)github\.io$/.test(location.hostname)?'/api':'',FORM_URL:'reservar.html',POLL_MS:20000,DUR:60};

/* ---------- utilidades ---------- */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pYmd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addD=(s,n)=>{const d=pYmd(s);d.setDate(d.getDate()+n);return ymd(d)};
const hoy=()=>ymd(new Date());
const toMin=h=>{if(!h)return null;const[a,b]=h.split(':').map(Number);return a*60+b};
const fromMin=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const DIAS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],DIASL=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],MES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],MESC=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'],ORDEN=[1,2,3,4,5,6,0];
const fLarga=s=>{const d=pYmd(s);return `${DIASL[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}`};
const h12=h=>{if(!h)return'';let[H,M]=h.split(':').map(Number);const ap=H>=12?'p.m.':'a.m.';H=H%12||12;return `${H}:${pad(M)} ${ap}`};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const codigo=()=>Array.from({length:6},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
const soles=n=>{n=Number(n)||0;return 'S/ '+(n%1?n.toFixed(2):n)};
const telKey=t=>String(t||'').replace(/\D/g,'').slice(-9);
const waNum=t=>{let d=String(t||'').replace(/\D/g,'');if(d.length===9)d='51'+d;return d};
/* En computadora se abre WhatsApp Web directo (evita que los emojis salgan como signos de pregunta). */
const waUrl=(n,t)=>(!n||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))?`https://wa.me/${n||''}?text=${encodeURIComponent(t)}`:`https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(t)}`;
const abrirWA=(t,msg)=>window.open(waUrl(waNum(t),msg),'_blank');
const lsGet=(k,d)=>{try{const v=localStorage.getItem('brb_'+k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem('brb_'+k,JSON.stringify(v));return true}catch(e){toast('⚠️ Memoria llena: exporta un respaldo');return false}};
const clone=o=>JSON.parse(JSON.stringify(o));
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),2800)}
function copiar(txt){navigator.clipboard?.writeText(txt).then(()=>toast('📋 Copiado')).catch(()=>prompt('Copia:',txt))}
/* iPhone/Safari bloquea ventanas y copiado que ocurren DESPUÉS de esperar a la red:
   se abre la ventana (o se prepara el copiado) en el mismo toque y se completa al terminar. */
const ventana=()=>{try{return window.open('','_blank')}catch(e){return null}};
const irA=(w,url)=>{if(w&&!w.closed)w.location.href=url;else location.href=url};
async function copiarP(p){if(window.ClipboardItem&&navigator.clipboard?.write){try{await navigator.clipboard.write([new ClipboardItem({'text/plain':p.then(x=>new Blob([x],{type:'text/plain'}))})]);return toast('📋 Copiado')}catch(e){}}copiar(await p)}
function beep(){try{const a=new(window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.frequency.value=880;g.gain.value=.08;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.18)}catch(e){}}

/* ---------- fotos ---------- */
const IDB={_db:null,open(){return this._db||(this._db=new Promise((res,rej)=>{const r=indexedDB.open('brb_fotos',1);r.onupgradeneeded=()=>r.result.createObjectStore('f');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))},
 async put(k,v){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('f','readwrite');t.objectStore('f').put(v,k);t.oncomplete=()=>res(k);t.onerror=()=>rej(t.error)})},
 async get(k){const db=await this.open();return new Promise(res=>{const r=db.transaction('f').objectStore('f').get(k);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null)})}};
function compressImg(file,max=1000,q=.72,type='image/jpeg'){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{let w=img.width,h=img.height;const s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);URL.revokeObjectURL(url);res(c.toDataURL(type,q))};img.onerror=()=>rej(new Error('Imagen no válida'));img.src=url})}
const FOTO_CACHE=new Map();

/* ---------- valores por defecto (todo editable en ⚙️ Config) ---------- */
const PALETA=['#ff3fd2','#8a3ffc','#5b2bd6','#c48cff','#4d6bff','#ffb057'];
const COLORES=['#ff3fd2','#8a3ffc','#4d6bff','#ffb057','#3fb950','#f0883e','#d29922','#f85149','#39c5cf','#db61a2'];
const DEF_EST={por_validar:{t:'Yape por validar',i:'💸',c:'#f0883e'},confirmada:{t:'Confirmada',i:'✅',c:'#8a3ffc'},en_silla:{t:'En silla',i:'💺',c:'#ff3fd2'},atendida:{t:'Atendido',i:'✔️',c:'#3fb950'},no_vino:{t:'No vino',i:'❌',c:'#f85149'},cancelada:{t:'Cancelada',i:'🚫',c:'#a397b8'},expirada:{t:'Expirada',i:'⌛',c:'#a397b8'}};
const DEF_CFG={nombre:'Stereo Barber Pool',eslogan:'Barber · Pool · Lima',logo:'🎱',logoImg:'',acento:'#8a3ffc',acento2:'#ff3fd2',
 whatsapp:'',ciudad:'Lima, Perú',direccion:'Av. Principal 123, Puente Piedra',maps:'',lat:'',lng:'',
 modAdelanto:true,yapeNum:'',yapeTitular:'',yapeQR:'',adelanto:10,holdMin:20,
 dias:[1,2,3,4,5,6],apertura:'09:00',cierre:'20:00',refIni:'13:00',refFin:'14:00',anticipacion:0,ventana:14,dniTopeDia:300,tolerancia:10,horasReprog:24,maxReprog:1,politicaTxt:'',
 modFotos:true,modFidelidad:true,fidelidad:6,modComision:true,modWalkin:true,
 txtBienvenida:'¿Qué te hacemos hoy?',txtFinal:'¡Reserva recibida!',
 waConfirma:'Hola {cliente} 👋\nTu cita en *{negocio}* está *CONFIRMADA* ✅\n\n📅 {fecha} a las {hora}\n💈 Barbero: {barbero}\n✂️ {servicio}\n🔖 Código: {codigo}\n📍 {direccion}\n🗺️ {maps}\n\n🔎 Mira el estado de tu cita: {seguimiento}\n\nTe esperamos 💪',
 waRecuerda:'Hola {cliente} 👋 Te recordamos tu cita en *{negocio}*:\n\n📅 {fecha} a las {hora}\n💈 {barbero} · ✂️ {servicio}\n📍 {direccion}\n\nSi no puedes venir, avísanos por aquí 🙏',
 waGracias:'¡Gracias por venir a *{negocio}*, {cliente}! 💈🔥\nCuando quieras repetir, reserva aquí:\n{link}',
 waYape:'Hola {cliente} 👋 Para confirmar tu cita del {fecha} a las {hora} falta el adelanto de *{adelanto}* por Yape al *{yape}*. Envíanos la captura por aquí 🙏',
 waVuelve:'Hola {cliente} 👋 ¡Te extrañamos en *{negocio}*, sobrino! Ya toca corte 💈\nReserva aquí: {link}',
 linkBase:'',
 waReserva:'💈 *NUEVA RESERVA* — #{codigo}\n\n👤 {cliente}\n📱 {telefono}\n📍 {ciudad}\n✂️ {servicio} — {precio}\n💈 {barbero}\n📅 {fecha} · {hora}\n💸 {pago}\n📝 {nota}\n\n🔎 Estado de la cita: {seguimiento}',
 narrOn:true,narrNombre:'Tío Stereo',narrImg:'',narrVoz:false,narrRate:1,narrTono:.5,narrAudio:{},splashOn:true,splashImg:'',splashMelt:true,
 narr:{holaLink:'¡Qué tal, sobrino {cliente}! Este link es solo para ti 💪 Elige tu corte.',hola:'¡Qué tal, sobrino! Soy el {narrador} 💪 Elige tu corte y yo te guío.',servicio:'¡Buena elección, sobrino! {servicio}, {precio}. Ahora elige a tu barbero.',barbero:'{barbero} te va a dejar fino, sobrino. {especialidad} 💪',cualquiera:'Tranqui sobrino, te asigno al primero que esté libre. Elige día y hora.',dia:'{fecha}. ¿A qué hora te acomoda, sobrino?',hora:'{fecha} a las {hora} ✅ Ese turno ya es casi tuyo, sobrino.',datos:'Listo {cliente}, yapea {adelanto} al {yape} y sube la captura, sobrino.',listo:'¡Reserva hecha, sobrino {cliente}! Nos vemos el {fecha} a las {hora} 🔥',ocupado:'Uy sobrino, te ganaron ese turno. Elige otro.',vencido:'Se acabó el tiempo, sobrino, pero tranqui: reserva de nuevo.',estado_por_validar:'Tranqui {cliente}, estamos validando tu Yape. En un ratito te confirmo, sobrino.',estado_confirmada:'¡Listo {cliente}! Tu cita está CONFIRMADA: {fecha} a las {hora} con {barbero}. Puntual, sobrino 💪',estado_en_silla:'{cliente}, ya estás en la silla. Relájate que te dejamos fino.',estado_atendida:'¡Corte terminado, {cliente}! Gracias por venir. Cuando quieras repetir, aquí estoy, sobrino.',estado_no_vino:'{cliente}, no llegaste a tu cita. Si quieres, reserva otra vez, sobrino.',estado_cancelada:'Tu cita fue cancelada. Si fue un error, escríbenos por WhatsApp.',estado_expirada:'Se acabó el tiempo para enviar el comprobante, {cliente}. Reserva de nuevo, sobrino.'},
 est:{},adminPin:'1234',bloqueos:[]};
const DEF_BARB=()=>[['Jhon','Fades y degradados'],['Brayan','Diseños y freestyle'],['Piero','Cortes clásicos'],['Alexis','Barba y perfilado'],['Renzo','Taper y mullet']].map(([n,e],i)=>({id:'b'+(i+1),nombre:n,esp:e,foto:'',color:COLORES[i],pin:String(i+1).repeat(4),comision:50,dias:[1,2,3,4,5,6],activo:true}));
const DEF_SERV=()=>[
 {id:'s1',emoji:'✂️',nombre:'Corte clásico',precio:25,desc:'Tijera y máquina, acabado limpio',foto:'',activo:true},
 {id:'s2',emoji:'🔥',nombre:'Fade / Degradado',precio:30,desc:'Low, mid o high fade',foto:'',activo:true},
 {id:'s3',emoji:'💈',nombre:'Taper',precio:30,desc:'Degradado suave en patillas y nuca',foto:'',activo:true},
 {id:'s4',emoji:'🧔',nombre:'Corte + Barba',precio:40,desc:'Corte completo y perfilado de barba',foto:'',activo:true},
 {id:'s5',emoji:'🪒',nombre:'Barba',precio:15,desc:'Perfilado con toalla caliente',foto:'',activo:true},
 {id:'s6',emoji:'🎨',nombre:'Diseño / Freestyle',precio:35,desc:'Líneas y figuras a mano alzada',foto:'',activo:true}];
function demoCitas(){const h=hoy(),m=addD(h,1),sv=DEF_SERV(),mk=(f,hr,b,s,nom,tel,ciu,est,x={})=>({id:'demo_'+uid(),codigo:codigo(),creada:Date.now(),demo:true,fecha:f,hora:hr,barberoId:b,servicioId:sv[s].id,servicioNombre:sv[s].nombre,precio:sv[s].precio,cliente:{nombre:nom,tel,ciudad:ciu},nota:'',estado:est,adelanto:10,adelantoOk:['confirmada','en_silla','atendida'].includes(est),origen:'web',...x});
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

/* ---------- reglas del negocio ---------- */
const ACTIVOS=['por_validar','confirmada','en_silla','atendida'];
const activa=(c,now=Date.now())=>ACTIVOS.includes(c.estado)&&!(c.estado==='por_validar'&&c.expira&&c.expira<now&&!c.yapeCaptura);
function slotsDia(cfg){const out=[],dur=CONFIG.DUR,fin=toMin(cfg.cierre),ri=toMin(cfg.refIni),rf=toMin(cfg.refFin);let t=toMin(cfg.apertura),g=0;if(t==null||fin==null)return out;while(t+dur<=fin&&g++<60){if(ri!=null&&rf!=null&&rf>ri&&t<rf&&t+dur>ri){t=rf;continue}out.push(fromMin(t));t+=dur}return out}
const bloqueado=(cfg,f,bid)=>(cfg.bloqueos||[]).some(b=>b.fecha===f&&(!b.barberoId||b.barberoId===bid));
const trabaja=(cfg,b,f)=>{const d=pYmd(f).getDay();return b&&b.activo!==false&&(cfg.dias||[]).includes(d)&&(b.dias||[]).includes(d)&&!bloqueado(cfg,f,b.id)};
const ocupado=(cs,bid,f,h,ign)=>cs.some(c=>c.id!==ign&&c.barberoId===bid&&c.fecha===f&&c.hora===h&&activa(c));
function expirarLocal(){const cs=lsGet('citas',[]),now=Date.now();let ch=false;cs.forEach(c=>{if(c.estado==='pendiente_pago'){c.estado='por_validar';ch=true}if(c.estado==='por_validar'&&c.expira&&c.expira<now&&!c.yapeCaptura){c.estado='expirada';ch=true}});if(ch)lsSet('citas',cs);return cs}

/* ---------- API (local ahora, Cloudflare después) ---------- */
const API={
 get remote(){return !!CONFIG.API_URL},
 async req(m,p,b){const r=await fetch(CONFIG.API_URL+p,{method:m,credentials:'same-origin',headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(r.status===401){localStorage.removeItem('brb_ses');location.reload()}if(!r.ok)throw new Error(j.error||('Error '+r.status));return j},
 async dni(d){return this.req('GET','/dni/'+d)},
 async authCfg(){return this.req('GET','/auth/config')},
 async google(credential){return this.req('POST','/auth/google',{credential})},
 async logout(){if(this.remote)await this.req('POST','/auth/logout').catch(()=>{})},
 async login(pin){if(this.remote)return this.req('POST','/auth/login',{pin});seed();const cfg=mergeCfg(lsGet('cfg',{}));if(pin&&pin===cfg.adminPin)return{rol:'dueno',nombre:'Dueño'};const u=lsGet('usuarios',[]).find(x=>x.pin===pin&&x.activo!==false);if(u&&pin)return{rol:u.rol,uid:u.id,nombre:u.nombre,barberoId:u.barberoId||''};const b=lsGet('barberos',[]).find(x=>x.pin===pin&&x.activo!==false);if(b&&pin)return{rol:'barbero',barberoId:b.id,nombre:b.nombre};throw new Error('PIN incorrecto')},
 async load(){if(this.remote){const r=await this.req('GET','/panel'+(this._d?'?v='+this._v:''));if(r.same)return this._d;this._v=r.v;return this._d=r}seed();const citas=expirarLocal();return{cfg:lsGet('cfg',{}),barberos:lsGet('barberos',[]),servicios:lsGet('servicios',[]),usuarios:lsGet('usuarios',[]),citas}},
 async saveConfig(cfg,barberos,servicios,usuarios){if(this.remote){const{adminPin,...c}=cfg;return this.req('PUT','/config',{cfg:c,barberos:barberos.map(({pin,...b})=>b),servicios,usuarios:(usuarios||[]).map(({pin,...u})=>u)})}lsSet('cfg',cfg);lsSet('barberos',barberos);lsSet('servicios',servicios);if(usuarios)lsSet('usuarios',usuarios)},
 async crearCita(d){if(this.remote)return this.req('POST','/citas',d);const cs=expirarLocal();if(d.hora&&ocupado(cs,d.barberoId,d.fecha,d.hora))throw new Error('Ese horario ya está ocupado');const c={id:uid(),codigo:codigo(),creada:Date.now(),...d};cs.push(c);lsSet('citas',cs);return c},
 async updateCita(id,patch){if(this.remote)return this.req('PATCH','/citas/'+id,patch);const cs=lsGet('citas',[]),c=cs.find(x=>x.id===id);if(!c)throw new Error('La cita ya no existe');if(S.ses.rol==='barbero'&&c.barberoId!==S.ses.barberoId)throw new Error('No es tu cita');Object.assign(c,patch,{upd:Date.now()});lsSet('citas',cs);return c},
 async borrarCita(id){if(this.remote)return this.req('DELETE','/citas/'+id);lsSet('citas',lsGet('citas',[]).filter(c=>c.id!==id))},
 async links(){if(this.remote)return this.req('GET','/links');return lsGet('links',[])},
 async saveLink(l){if(this.remote)return this.req('POST','/links',l);const ls=lsGet('links',[]);ls.unshift(l);lsSet('links',ls.slice(0,300));return l},
 async delLink(id){if(this.remote)return this.req('DELETE','/links/'+id);lsSet('links',lsGet('links',[]).filter(l=>l.id!==id))},
 async importCitas(arr){if(this.remote)return this.req('POST','/citas/import',{citas:arr});const cs=lsGet('citas',[]);let n=0,u=0;arr.forEach(c=>{const ex=c.codigo&&cs.find(x=>x.codigo===c.codigo);if(ex){Object.assign(ex,c);u++}else{cs.push({id:uid(),creada:Date.now(),...c,codigo:c.codigo||codigo()});n++}});lsSet('citas',cs);return{n,u}},
 async putFoto(data){if(this.remote)return(await this.req('POST','/fotos',{data})).key;const k='f_'+uid();await IDB.put(k,data);return k},
 async putAudio(data){if(this.remote)return(await this.req('POST','/audio',{data})).key;const k='a_'+uid();await IDB.put(k,data);return k},
 async audioUrl(k){if(this.remote){const r=await fetch(`${CONFIG.API_URL}/audio/${k}`,{credentials:'same-origin'});if(!r.ok)throw new Error('No se pudo cargar el audio');return URL.createObjectURL(await r.blob())}const u=await IDB.get(k);if(!u)throw new Error('No se encontró el audio');return u},
 async foto(k){if(!k)return'';if(/^(data:|https?:)/.test(k))return k;if(FOTO_CACHE.has(k))return FOTO_CACHE.get(k);const v=this.remote?`${CONFIG.API_URL}/fotos/${k}`:(await IDB.get(k))||'';FOTO_CACHE.set(k,v);return v}
};

/* ---------- estado ---------- */
const S={usuarios:[],perm:{},ses:lsGet('ses',null),cfg:mergeCfg({}),barberos:[],servicios:[],citas:[],tab:'agenda',colap:new Set(),cliQ:'',cajaF:hoy(),draft:null,dirty:false,open:'',known:new Set(),loaded:false};
const est=k=>({...DEF_EST[k]||DEF_EST.confirmada,...(S.cfg.est||{})[k]});
const fCortaD=s=>{const d=pYmd(s);return `${d.getDate()} ${MESC[d.getMonth()]}`};
const lunesDe=f=>addD(f,-((pYmd(f).getDay()+6)%7)); // semana de lunes a domingo
/* Etiquetas de la agenda (los filtros están en js/panel/filtros.js). */
const ETIQUETAS=['todos','por_validar','confirmada','en_silla','atendida','no_vino','cancelada'];
const barb=id=>S.barberos.find(b=>b.id===id);
const cita=id=>S.citas.find(c=>c.id===id);
const PERMS=[['verTodas','📅 Ver la agenda de todos los barberos'],['verTel','📞 Ver celular de clientes'],['verMontos','💰 Ver precios y caja'],['crear','➕ Crear y editar citas'],['cancelar','🚫 Cancelar, "No vino" y eliminar'],['yape','💸 Validar pagos Yape'],['links','🔗 Generar links para clientes'],['dash','📈 Ver dashboard y clientes'],['excel','📊 Excel y respaldos'],['config','⚙️ Configuración y usuarios']];
const ALLP=Object.fromEntries(PERMS.map(([k])=>[k,true]));
const ROLES={dueno:{t:'👑 Dueño',p:ALLP},encargado:{t:'🧑‍💼 Encargado',p:{...ALLP,config:false}},recepcion:{t:'📋 Recepción',p:{verTodas:true,verTel:true,verMontos:true,crear:true,cancelar:true,yape:true,links:true}},barbero:{t:'💈 Barbero',p:{verTel:true,crear:true,links:true}},personal:{t:'⚙️ Personalizado',p:{}}};
function permsFor(ses){if(!ses)return{};if(ses.rol==='admin'||ses.rol==='dueno')return{...ALLP};if(ses.uid){const u=(S.usuarios||[]).find(x=>x.id===ses.uid);return u?{...(u.permisos||{})}:null}if(ses.rol==='barbero')return{...ROLES.barbero.p,...(S.cfg.permBarbero||{})};return{}}
const can=p=>!!(S.perm||{})[p];
const isAdmin=()=>can('verTodas');
const telV=t=>can('verTel')?t:'••• ••• '+String(t||'').slice(-3);
const monV=n=>can('verMontos')?soles(n):'S/ •••';
const mine=c=>isAdmin()||c.barberoId===S.ses?.barberoId;
const scope=()=>S.citas.filter(mine);
// Link de «Ver estado de cita»: la página estado.html junto al formulario.
function estadoUrl(cod){const f=formUrl();let u;try{u=new URL(f,location.href)}catch(e){return 'estado.html?c='+cod}u.pathname=/\/reservar(\.html)?$/.test(u.pathname)?u.pathname.replace(/reservar(\.html)?$/,'estado.html'):u.pathname.replace(/[^/]*$/,'estado.html');u.search='?c='+cod;u.hash='';return u.href}
function formUrl(q=''){let base=(S.cfg.linkBase||'').trim();if(!base){try{if(/^https?:/.test(location.href))base=new URL(CONFIG.FORM_URL,location.href).href}catch(e){}}if(!base)base=CONFIG.FORM_URL;return base+q}
const pagoOn=()=>S.cfg.modAdelanto&&+S.cfg.adelanto>0;
function tpl(s,c,cfg=S.cfg){const b=barb(c?.barberoId);const v={cliente:c?.cliente?.nombre||'',telefono:c?.cliente?.tel||'',ciudad:c?.cliente?.ciudad||'',negocio:cfg.nombre,fecha:c?.fecha?fLarga(c.fecha):'',hora:c?.hora?h12(c.hora):'',barbero:b?.nombre||'',servicio:c?.servicioNombre||'',precio:c?soles(c.precio):'',codigo:c?.codigo||'',direccion:cfg.direccion||cfg.ciudad,maps:cfg.maps||'',link:formUrl(),seguimiento:c?.codigo?estadoUrl(c.codigo):'',adelanto:soles(c?.adelanto||cfg.adelanto),yape:cfg.yapeNum||'',nota:c?.nota||'',pago:''};
 return String(s||'').split('\n').map(l=>{let had=false,full=false;const r=l.replace(/\{(\w+)\}/g,(m,k)=>{if(!(k in v))return m;had=true;if(v[k])full=true;return v[k]});return had&&!full?null:r}).filter(x=>x!==null).join('\n')}
function applyTheme(c){const r=document.documentElement.style;const a1=!c.acento||c.acento==='#388bfd'?'#8a3ffc':c.acento,a2=!c.acento2||c.acento2==='#a371f7'?'#ff3fd2':c.acento2;r.setProperty('--blue',a1);r.setProperty('--pur',a2)}
async function logoHTML(el,c){el.innerHTML=c.logoImg?`<img data-foto="${c.logoImg}">`:esc(c.logo||'💈');hydrate(el)}

/* ---------- login / arranque ---------- */
async function doLogin(){const pin=$('#pin').value.trim();try{await entrar(await API.login(pin))}catch(e){toast('❌ '+e.message);$('#pin').value=''}}
async function entrar(s){S.ses=s;lsSet('ses',s);$('#login').style.display='none';await boot()}
let GCFG=null;
async function gPintar(){const n=(await API.req('GET','/auth/nonce')).nonce;
 google.accounts.id.initialize({client_id:GCFG.google,callback:loginGoogle,nonce:n,ux_mode:'popup',auto_select:false});
 $('#gbtn').innerHTML='';google.accounts.id.renderButton($('#gbtn'),{theme:'filled_black',size:'large',shape:'pill',text:'signin_with',locale:'es'})}
async function loginGoogle(r){try{const x=await API.google(r.credential);if(x.puerta){await initLoginNube();return}await entrar(x)}catch(e){toast('❌ '+e.message);gPintar().catch(()=>{})}}
async function initLoginNube(){let ac={google:'',pin:true};try{ac=await API.authCfg()}catch(e){}
 GCFG=ac;$('#pinBox').style.display=ac.pin?'flex':'none';await loginExtras(ac);if($('#pfBox').style.display==='flex')return;
 $('#lgHint').innerHTML=ac.google?'Entra con la cuenta de Google que el dueño autorizó.':'⚠️ Falta configurar GOOGLE_CLIENT_ID en Cloudflare.';
 if(!ac.google)return;const r=()=>gPintar().catch(e=>toast('❌ '+e.message));
 if(window.google?.accounts)return r();const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=r;document.head.appendChild(s)}
async function logout(){if(S.dirty&&!confirm('Tienes cambios sin guardar en Config. ¿Salir igual?'))return;if(!confirm('¿Cerrar sesión?'))return;await API.logout();localStorage.removeItem('brb_ses');location.reload()}
/* ---------- tiempo real: WebSocket con el Durable Object «Avisos» ----------
   El aviso no trae datos: solo dice «algo cambió» y el panel vuelve a pedir lo suyo (con sus permisos). */
const TR={ws:null,intentos:0,t:null};
const trVivo=()=>TR.ws?.readyState===1;
function marcarVivo(){const v=$('#vivo');if(v){v.classList.toggle('on',trVivo());v.title=trVivo()?'En vivo: los cambios llegan al instante':'Sin conexión en vivo: se actualiza cada 20 s'}}
function conectarTR(){if(!API.remote||!S.ses||TR.ws)return;let ws;try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+CONFIG.API_URL+'/tiempo-real')}catch(e){return}
 TR.ws=ws;ws.onopen=()=>{TR.intentos=0;marcarVivo()};
 ws.onmessage=e=>{if(e.data==='pong')return;clearTimeout(TR.t);TR.t=setTimeout(()=>reload(true),250)};
 ws.onclose=()=>{TR.ws=null;marcarVivo();if(!S.ses)return;setTimeout(conectarTR,Math.min(30e3,1e3*2**TR.intentos++))};ws.onerror=()=>{}}
setInterval(()=>{if(trVivo())TR.ws.send('ping')},25e3);
async function boot(){
 await reload();
 const tabs=[['agenda','📅 Agenda']];if(can('links'))tabs.push(['compartir','🔗 Compartir']);if(can('config'))tabs.push(['config','⚙️ Config']);
 $('#tabs').innerHTML=tabs.map(([k,t])=>`<button data-t="${k}" data-on-click="a48f04866" data-p0="${k}">${t}</button>`).join('');
 goTab('agenda');
 let lt=0;$('#hBrand').addEventListener('click',()=>{const n=Date.now();if(n-lt<380){lt=0;can('dash')?abrirDash():toast('🔒 Sin permiso para el dashboard')}else lt=n});
 $('#hLogo').style.cursor='pointer';$('#hLogo').addEventListener('click',()=>can('excel')?abrirDatos():toast('🔒 Sin permiso para Excel y respaldos'));
 setInterval(tickCD,30000);setInterval(tickSec,1000);
 // Si el tiempo real está conectado, la consulta periódica solo es un respaldo (cada 2 min).
 setInterval(()=>{if(trVivo()&&Date.now()-(S.ultCarga||0)<120e3)return;reload(true)},CONFIG.POLL_MS);
 conectarTR();addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){reload(true);conectarTR()}});
 addEventListener('storage',e=>{if(e.key==='brb_citas')reload(true)});
}
async function reload(notify){
 try{const d=await API.load();Object.assign(S,{cfg:mergeCfg(d.cfg),barberos:d.barberos||[],servicios:d.servicios||[],usuarios:d.usuarios||[],citas:(d.citas||[]).map(c=>c.estado==='pendiente_pago'?{...c,estado:'por_validar'}:c)})}catch(e){toast('⚠️ '+e.message);return}
 if(API.remote){const v=API._v;if(v!==S._vPrev){S._vPrev=v;S.extra=new Map();S.rangosOk=new Set();S.hist=null}S.ventana=API._d?.ventana||null;S.visitas=API._d?.visitas||null;S.primeraFecha=API._d?.primeraFecha||null;S.waOk=!!API._d?.wa?.ok;S.waDiaAntes=!!API._d?.wa?.diaAntes;mezclar([])}
 const pm=permsFor(S.ses);if(pm===null){toast('Tu usuario fue desactivado');localStorage.removeItem('brb_ses');return setTimeout(()=>location.reload(),900)}S.perm=pm;
 if(notify&&S.loaded){const nuevas=S.citas.filter(c=>!S.known.has(c.id)&&mine(c)&&c.origen==='web');if(nuevas.length){toast(`🔔 ${nuevas.length} reserva(s) nueva(s)`);navigator.vibrate?.([120,60,120]);beep()}
  const rep=S.citas.filter(c=>c.reprogTs&&mine(c)&&S.known.has(c.id)&&c.reprogTs>(S.repVisto||0));if(rep.length){toast(`🔁 ${rep.map(c=>c.cliente?.nombre?.split(' ')[0]).join(', ')} reprogramó: ${fLarga(rep[0].fecha)} · ${h12(rep[0].hora)}`);navigator.vibrate?.([120,60,120]);beep()}}
 S.repVisto=Math.max(S.repVisto||0,...S.citas.map(c=>c.reprogTs||0));
 cargarAlertas();
 S.ultCarga=Date.now();
 S.known=new Set(S.citas.map(c=>c.id));S.loaded=true;if(!S.dirty)applyTheme(S.cfg);renderHeader();renderProx();
 if(S.tab==='agenda'&&document.activeElement?.id==='q'){renderConteos();renderLista()}else if(S.tab==='agenda')renderTab();
}
function renderHeader(){
 $('#hNombre').textContent=S.cfg.nombre;document.title=S.cfg.nombre+' · Panel';logoHTML($('#hLogo'),S.cfg);
 $('#hSub').innerHTML=`${S.cfg.whatsapp?esc(S.cfg.whatsapp):esc(S.cfg.eslogan||'')} <span class="pill" style="color:var(--pur);border-color:var(--pur)">${S.ses.uid?(ROLES[S.ses.rol]?.t||'👤').split(' ')[0]+' '+esc(S.ses.nombre):S.ses.rol==='barbero'?'💈 '+esc(barb(S.ses.barberoId)?.nombre||S.ses.nombre):'👑 Dueño'}</span>`;
 const n=notifs().filter(x=>!S.leidas.has(x.k)).length;const d=$('#hDot');d.style.display=n?'grid':'none';d.textContent=n>99?'99+':n;if($('#notif')?.classList.contains('on'))pintaNotif();
}
function goTab(t){S.tab=t;$$('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));$$('.sec').forEach(s=>s.classList.toggle('on',s.id==='t-'+t));renderTab();scrollTo(0,0)}
function renderTab(){({agenda:renderAgenda,compartir:renderCompartir,config:renderConfig})[S.tab]?.()}
function hydrate(root=document){root.querySelectorAll('img[data-foto]').forEach(async im=>{if(im.dataset.ok)return;im.dataset.ok=1;const src=await API.foto(im.dataset.foto);if(src)im.src=src})}
const avatar=(b,lg)=>b?.foto?`<img class="av ${lg?'lg':''}" data-foto="${b.foto}">`:`<span class="av ${lg?'lg':''}" style="background:${b?.color||'var(--card2)'}33">💈</span>`;
function openModal(html){$('#mbody').innerHTML=html;$('#modal').classList.add('on');hydrate($('#mbody'))}
function closeModal(){if(G){G=null;try{REC?.mr.stop()}catch(_){}}$('#modal').classList.remove('on')}
let G=null;
const mHead=t=>`<h3>${t}<button class="x" data-on-click="a5a8704f9">✕</button></h3>`;
async function verFoto(k){const v=$('#viewer');v.innerHTML='<img alt=""><button class="x">✕</button>';v.classList.add('on');v.querySelector('img').src=await API.foto(k)}

