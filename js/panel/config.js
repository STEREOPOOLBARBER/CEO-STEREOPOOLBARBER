/* =================== CONFIG (admin) =================== */
function dirty(){S.dirty=true;const b=$('#cfgSave');if(b){b.textContent='💾 Guardar cambios •';b.classList.add('pend')}}
const D=()=>S.draft;
function setC(k,v){D().cfg[k]=v;dirty()}
function setN(k,v){D().cfg[k]=Math.max(0,+v||0);dirty()}
function setB(k){D().cfg[k]=!D().cfg[k];dirty();renderConfig()}
function acc(id,title,sub,body){return `<div class="acc ${S.open===id?'open':''}" id="acc_${id}"><button data-on-click="a6eb6b3e0" data-p0="${id}"><b>${title}<small>${sub}</small></b><i>›</i></button><div><div class="accb">${body()}</div></div></div>`}
function accTog(id){const el=$('#acc_'+id);if(!el)return;const abrir=!el.classList.contains('open');$$('.acc.open').forEach(x=>x.classList.remove('open'));S.open=abrir?id:'';if(abrir){el.classList.add('open');if(id==='waapi')cargarWA();setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'start'}),320)}}
// Interruptor: recibe el NOMBRE de la función y sus datos (no código), así funciona con la CSP estricta.
const SW_OK=new Set(['togUser','togPB','togBarb','togServ','setB','togPermU']);
const sw=(on,f,...a)=>`<button class="sw ${on?'on':''}" data-on-click="a6e350824" data-f="${f}" data-a="${esc(JSON.stringify(a))}"></button>`;
function swAccion(el){const f=el.dataset.f;if(SW_OK.has(f)&&typeof window[f]==='function')window[f](...JSON.parse(el.dataset.a||'[]'))}
function togPermU(k){S._u.permisos[k]=!S._u.permisos[k];S._u.rol='personal';$('#uRol').value='personal';uPerms()}
/* ---------- voz propia del narrador ---------- */
/* Guion: las 18 frases SIN datos (nombre, precio, hora…) para leerlas con tu voz, una por una. */
const GUION=[['hola','¡Qué tal, sobrino! Soy el Tío Stereo. Elige tu corte y yo te guío.'],['holaLink','¡Qué tal, sobrino! Este link es solo para ti. Elige tu corte.'],['servicio','¡Buena elección, sobrino! Ahora elige a tu barbero.'],['barbero','Ese barbero te va a dejar fino, sobrino.'],['cualquiera','Tranqui, sobrino, te asigno al primero que esté libre. Elige día y hora.'],['dia','¿A qué hora te acomoda, sobrino?'],['hora','Ese turno ya es casi tuyo, sobrino.'],['datos','Listo, sobrino. Yapea el adelanto y sube la captura.'],['listo','¡Reserva hecha, sobrino! Nos vemos pronto.'],['ocupado','Uy, sobrino, te ganaron ese turno. Elige otro.'],['vencido','Se acabó el tiempo, sobrino, pero tranqui: reserva de nuevo.'],
 ['estado_por_validar','Tranqui, sobrino, estamos validando tu Yape. En un ratito te confirmo.'],['estado_confirmada','¡Listo, sobrino! Tu cita está confirmada. Sé puntual, que te estaré esperando.'],['estado_en_silla','Ya estás en la silla, sobrino. Relájate que te dejamos fino.'],['estado_atendida','¡Corte terminado, sobrino! Gracias por venir. Cuando quieras repetir, aquí estoy.'],['estado_no_vino','Sobrino, no llegaste a tu cita. Si quieres, reserva otra vez.'],['estado_cancelada','Tu cita fue cancelada, sobrino. Si fue un error, escríbenos por WhatsApp.'],['estado_expirada','Se acabó el tiempo para enviar el comprobante, sobrino. Reserva de nuevo.']];
function abrirGuion(i){G={i:i||0};openModal('');guionPinta()}
function guionPinta(){if(!G)return;const[k,txt]=GUION[G.i],au=D().cfg.narrAudio||{},ya=!!au[k],hechas=GUION.filter(([x])=>au[x]).length,et=(NKEYS.find(x=>x[0]===k)||[k,k])[1];
 $('#mbody').innerHTML=mHead(`🎬 Guion · ${G.i+1} de ${GUION.length}`)+`<div style="height:6px;background:var(--line);border-radius:6px;overflow:hidden"><div style="height:100%;width:${Math.round(hechas/GUION.length*100)}%;background:var(--grn)"></div></div>
 <p class="hint" style="margin:8px 0 0">${et} · ${hechas} de ${GUION.length} con tu voz</p>
 <div class="card" style="margin:12px 0;text-align:center;padding:26px 16px"><div style="font:800 24px/1.35 'Syne'">${esc(txt)}</div></div>
 <p class="hint" style="text-align:center;margin:0 0 12px">Toca <b>Grabar</b>, léela con voz grave y firme (celular a 20 cm, sin ruido) y toca <b>Detener</b>.</p>
 <div class="row" style="gap:8px"><button class="btn p" id="g_rec" data-rec="${k}" data-label="🎙️ Grabar" style="flex:2;padding:16px;font-size:17px" data-on-click="a2fadf31d" data-p0="${k}">🎙️ Grabar</button>${ya?`<button class="btn" style="flex:1" data-on-click="a6ea62739" data-p0="${k}">▶️ Oír</button>`:''}</div>
 ${ya?'<p style="text-align:center;color:var(--grn);font-weight:700;margin:10px 0 0">✅ Esta frase ya tiene tu voz</p>':''}
 <div class="row" style="gap:8px;margin-top:14px"><button class="btn" style="flex:1" data-on-click="abc3de889" ${G.i?'':'disabled'}>← Anterior</button><button class="btn g" style="flex:1" data-on-click="acf3fc65e">${G.i<GUION.length-1?'Siguiente →':'Terminar ✔'}</button></div>`}
function guionIr(d){if(!G)return;try{REC?.mr.stop()}catch(_){}const n=G.i+d;if(n>=GUION.length){closeModal();return toast('🎉 Guion terminado · toca «Guardar configuración»')}if(n<0)return;G.i=n;setTimeout(guionPinta,REC?500:0)}
const NAUDIO_MAX=25;let REC=null;
/* Cualquier audio (grabación o archivo) se convierte a WAV mono 16 kHz: suena igual en iPhone, Android y computadora. */
async function aWav(blob){const ab=await blob.arrayBuffer(),AC=window.AudioContext||window.webkitAudioContext,OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext,ctx=new AC();
 const buf=await new Promise((ok,no)=>{const r=ctx.decodeAudioData(ab,ok,no);r?.then?.(ok,no)}).catch(()=>{throw new Error('No pude leer ese audio. Prueba con otro archivo o grábalo aquí.')});ctx.close?.();
 const sr=16000,len=Math.max(1,Math.floor(Math.min(buf.duration,NAUDIO_MAX)*sr)),off=new OAC(1,len,sr),src=off.createBufferSource();src.buffer=buf;src.connect(off.destination);src.start();
 const d=(await new Promise((ok,no)=>{const r=off.startRendering();r?.then?.(ok,no);off.oncomplete=e=>ok(e.renderedBuffer)})).getChannelData(0);
 let a=0,z=d.length-1;const um=.015;while(a<z&&Math.abs(d[a])<um)a++;while(z>a&&Math.abs(d[z])<um)z--;a=Math.max(0,a-Math.floor(sr*.12));z=Math.min(d.length-1,z+Math.floor(sr*.2));
 const x=d.slice(a,z+1);let pk=0;for(let i=0;i<x.length;i++)pk=Math.max(pk,Math.abs(x[i]));const g=pk>.01?Math.min(8,.92/pk):1;
 const v=new DataView(new ArrayBuffer(44+x.length*2)),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
 w(0,'RIFF');v.setUint32(4,36+x.length*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,x.length*2,true);
 for(let i=0;i<x.length;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,x[i]*g))*32767,true);
 return new Blob([v],{type:'audio/wav'})}
function marcarRec(k,on){document.querySelectorAll(`[data-rec="${k}"]`).forEach(b=>{b.textContent=on?'⏹️ Detener':(b.dataset.label||'🎙️ Grabar mi voz');b.classList.toggle('r',on)})}
async function grabarNarr(k){
 if(REC){const mismo=REC.k===k;REC.mr.stop();if(mismo)return;await new Promise(r=>setTimeout(r,400))}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('Este navegador no puede grabar: usa «Subir audio»');
 try{const st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  const mt=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(x=>MediaRecorder.isTypeSupported?.(x))||'',mr=new MediaRecorder(st,mt?{mimeType:mt}:{}),ch=[],t0=Date.now();
  mr.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data)};
  mr.onstop=async()=>{clearInterval(REC?.t);st.getTracks().forEach(x=>x.stop());REC=null;marcarRec(k,false);await subirAudioNarr(k,new Blob(ch,{type:mr.mimeType||mt||'audio/webm'}))};
  REC={k,mr,t:setInterval(()=>{const s=(Date.now()-t0)/1000;document.querySelectorAll(`[data-rec="${k}"]`).forEach(b=>b.textContent=`⏹️ Detener · ${Math.floor(s)} s`);if(s>=NAUDIO_MAX)mr.stop()},250)};
  mr.start();marcarRec(k,true);toast('🎙️ Grabando… di la frase y toca Detener')}
 catch(e){toast(e.name==='NotAllowedError'?'❌ Permite el micrófono en tu navegador':'❌ No se pudo grabar: '+e.message)}}
async function subirAudioNarr(k,blob){toast('⏳ Procesando audio…');
 try{const w=await aWav(blob),data=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(w)});
  const key=await API.putAudio(data);(D().cfg.narrAudio=D().cfg.narrAudio||{})[k]=key;dirty();renderConfig();if(G&&$('#g_rec'))guionPinta();toast('✅ Audio listo · toca Guardar configuración')}
 catch(e){toast('❌ '+(e.message||'No se pudo procesar el audio'))}}
function subirArchivoNarr(k,inp){const f=inp.files[0];if(f)subirAudioNarr(k,f);inp.value=''}
async function oirNarr(k){const key=D().cfg.narrAudio?.[k];if(!key)return;try{await new Audio(await API.audioUrl(key)).play()}catch(e){toast('❌ '+e.message)}}
function quitarAudioNarr(k){if(!confirm('¿Quitar tu audio de esta frase? Volverá la voz del celular.'))return;delete D().cfg.narrAudio[k];dirty();renderConfig()}
function setLL(la,lo){D().cfg.lat=String(+(+la).toFixed(6));D().cfg.lng=String(+(+lo).toFixed(6));dirty();renderConfig()}
function ubicAqui(){if(!navigator.geolocation)return toast('Tu navegador no permite la ubicación');toast('📍 Buscando tu ubicación…');navigator.geolocation.getCurrentPosition(p=>{setLL(p.coords.latitude,p.coords.longitude);toast('✅ Ubicación lista · toca Guardar')},e=>toast(e.code===1?'❌ Permite la ubicación en tu navegador (candado junto a la dirección)':e.code===3?'❌ Tardó demasiado: prueba de nuevo o usa «Buscar mi dirección»':'❌ No se pudo obtener tu ubicación: usa «Buscar mi dirección»'),{enableHighAccuracy:true,timeout:15000})}
async function ubicBuscar(){const c=D().cfg,q=[c.direccion,c.ciudad].filter(Boolean).join(', ');if(!q)return toast('Primero escribe la dirección');toast('🔎 Buscando…');try{const r=await(await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q='+encodeURIComponent(q))).json();if(!r[0])return toast('No la encontré: usa «Usar donde estoy»');setLL(r[0].lat,r[0].lon);toast('✅ Encontrada · revisa el mapa y toca Guardar')}catch(e){toast('❌ No se pudo buscar')}}
function mapsCoords(u){const m=String(u).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)||String(u).match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)||String(u).match(/[?&](?:q|ll|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);if(m&&!D().cfg.lat&&!D().cfg.lng)setLL(m[1],m[2])}
const VARS=['cliente','fecha','hora','barbero','servicio','precio','codigo','negocio','direccion','maps','link','adelanto','yape','telefono','ciudad','nota','pago','seguimiento'];
function renderConfig(){if(!S.draft){S.draft=clone({cfg:S.cfg,barberos:S.barberos,servicios:S.servicios,usuarios:S.usuarios||[]});S.dirty=false}
 const d=D(),c=d.cfg;applyTheme(c);
 $('#t-config').innerHTML=`
 <div class="row" style="margin-bottom:10px"><span style="font-size:34px">⚙️</span><h2 style="font:800 28px 'Syne';flex:1">Configuración</h2></div>
 <button class="btn g w ${S.dirty?'pend':''}" id="cfgSave" style="padding:15px;font-size:17px" data-on-click="a69fc76d3">💾 ${S.dirty?'Guardar cambios •':'Guardar configuración'}</button>
 <p class="hint" style="margin:8px 0 14px">Toca una sección para desplegarla. Cuando termines, toca el botón verde.</p>
 ${API.remote?'':'<div class="banner">🧪 <b>Modo local:</b> los datos viven en este navegador. Al conectar Cloudflare pasan a la nube con login seguro.</div>'}
 ${acc('marca','🎨 Marca y apariencia','Nombre, logo, colores y eslogan',()=>`
  <label class="lb">Nombre de la barbería</label><input class="in" value="${esc(c.nombre)}" data-on-change="aae58213e">
  <label class="lb">Eslogan</label><input class="in" value="${esc(c.eslogan)}" placeholder="Ej: Cortes con estilo desde 2020" data-on-change="a2a894482">
  <label class="lb">Logo</label><div class="row"><label class="upl"><span class="prev" style="background:linear-gradient(135deg,${c.acento},${c.acento2})">${c.logoImg?`<img data-foto="${c.logoImg}">`:esc(c.logo)}</span><span class="btn sm">📷 Subir logo</span><input type="file" accept="image/*" data-on-change="a0b4fb88a"></label>${c.logoImg?`<button class="btn sm r" data-on-click="a1c088907">Quitar</button>`:''}</div>
  <label class="lb">…o usa un emoji</label><div class="sws">${['💈','✂️','🪒','💇‍♂️','🔥','👑','⚡','💀'].map(e=>`<button class="btn sm" style="font-size:20px;${c.logo===e&&!c.logoImg?'border-color:var(--blue)':''}" data-on-click="a1744e91b" data-p0="${e}">${e}</button>`).join('')}</div>
  <label class="lb">Color principal</label><div class="sws">${PALETA.map(x=>`<button class="swc ${c.acento===x?'on':''}" style="background:${x}" data-on-click="abc0db760" data-p0="${x}"></button>`).join('')}</div>
  <label class="lb">Color secundario</label><div class="sws">${PALETA.map(x=>`<button class="swc ${c.acento2===x?'on':''}" style="background:${x}" data-on-click="a1d8ad0e9" data-p0="${x}"></button>`).join('')}</div>`)}
 ${acc('negocio','🏪 Datos del negocio','WhatsApp, ciudad, dirección y mapa',()=>`
  <label class="lb">WhatsApp (recibe las reservas)</label><div class="pre"><span>+51</span><input class="in" inputmode="tel" value="${esc(c.whatsapp)}" placeholder="9XXXXXXXX" data-on-change="a3b92acf1"></div>
  <label class="lb">Ciudad</label><input class="in" value="${esc(c.ciudad)}" data-on-change="a9855bb80">
  <label class="lb">Dirección</label><input class="in" value="${esc(c.direccion)}" placeholder="Av. ..., distrito" data-on-change="a9deb6a94">
  <label class="lb">Dirección pública del formulario (opcional)</label><input class="in" value="${esc(c.linkBase||'')}" placeholder="https://tuusuario.github.io/barberia/reservar.html" data-on-change="aefaf21d8"><p class="hint" style="margin-top:4px">Déjalo vacío si el panel y el formulario están en la misma carpeta.</p>
  <label class="lb">Link de Google Maps</label><input class="in" value="${esc(c.maps)}" placeholder="https://maps.app.goo.gl/..." data-on-change="a68861e9a">
  <label class="lb">📍 Ubicación en el mapa <small style="color:var(--mu)">(el cliente la ve en «Estado de su cita»)</small></label>
  <div class="g2"><input class="in" inputmode="decimal" placeholder="Latitud" value="${esc(c.lat)}" data-on-change="a6a6ee416"><input class="in" inputmode="decimal" placeholder="Longitud" value="${esc(c.lng)}" data-on-change="a4a18599e"></div>
  <div class="g2" style="margin-top:8px"><button class="btn" data-on-click="a0bc1a925">📍 Usar donde estoy</button><button class="btn" data-on-click="a22667b57">🔎 Buscar mi dirección</button></div>
  ${parseFloat(c.lat)&&parseFloat(c.lng)?`<iframe title="Vista previa del mapa" loading="lazy" style="width:100%;height:190px;border:0;border-radius:12px;margin-top:10px" src="https://www.openstreetmap.org/export/embed.html?bbox=${[+c.lng-.004,+c.lat-.0022,+c.lng+.004,+c.lat+.0022].map(n=>n.toFixed(5)).join(',')}&layer=mapnik&marker=${+c.lat},${+c.lng}"></iframe>`:'<p class="hint">Tip: estando en la barbería toca «Usar donde estoy». Si pegas un link de Google Maps con coordenadas, se llena solo.</p>'}`)}
 ${acc('horario','📅 Días y horario','Días de atención, apertura, refrigerio',()=>{const sl=slotsDia(c);return `
  <label class="lb">Días de atención</label><div class="dchips">${ORDEN.map(x=>`<button class="dchip ${c.dias.includes(x)?'on':''}" data-on-click="a30f2903b" data-p0="${x}">${DIAS[x]}</button>`).join('')}</div>
  <div class="g2"><div><label class="lb">Abre</label><input class="in" type="time" value="${c.apertura}" data-on-change="ab8022d92"></div><div><label class="lb">Cierra</label><input class="in" type="time" value="${c.cierre}" data-on-change="a4f72d1b1"></div></div>
  <div class="g2"><div><label class="lb">Refrigerio desde</label><input class="in" type="time" value="${c.refIni}" data-on-change="aa4123b8d"></div><div><label class="lb">Refrigerio hasta</label><input class="in" type="time" value="${c.refFin}" data-on-change="a9976b33e"></div></div>
  <div class="g2"><div><label class="lb">Anticipación (días)</label><input class="in" type="number" min="0" value="${c.anticipacion}" data-on-change="a75ff6b31"></div><div><label class="lb">Reservar hasta (días)</label><input class="in" type="number" min="1" value="${c.ventana}" data-on-change="af40bb7f1"></div></div>
  <p class="hint">⏱️ Turnos de 1 hora · ${sl.length} por día: ${sl.map(h12).join(' · ')||'— revisa el horario —'}</p>
  <label class="lb">Días bloqueados (feriados, vacaciones)</label>
  <div class="g2"><input class="in" type="date" id="blF" min="${hoy()}"><select class="in" id="blB"><option value="">Toda la barbería</option>${d.barberos.map(b=>`<option value="${b.id}">${esc(b.nombre)}</option>`).join('')}</select></div>
  <div class="row" style="margin-top:8px"><input class="in" id="blM" placeholder="Motivo"><button class="btn p" data-on-click="a1be48efd">➕</button></div>
  ${(c.bloqueos||[]).filter(b=>b.fecha>=hoy()).sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(b=>`<div class="li"><span class="av">🚫</span><div class="t"><b>${fLarga(b.fecha)}</b><small>${b.barberoId?esc(d.barberos.find(x=>x.id===b.barberoId)?.nombre||''):'Toda la barbería'}${b.motivo?' · '+esc(b.motivo):''}</small></div><button class="ibtn" data-on-click="ac7a4a56e" data-p0="${b.id}">🗑️</button></div>`).join('')}`})}
 ${acc('usuarios',`👥 Usuarios y permisos (${(d.usuarios||[]).length+1+d.barberos.length})`,'Quién entra, qué puede hacer y sus citas',()=>{const pb={...ROLES.barbero.p,...(c.permBarbero||{})};return `
  <p class="hint" style="margin-top:0">${API.remote?'Cada persona entra con su cuenta de Google: agrega su correo.':'Cada persona entra con su PIN.'} Recepción, encargado o un barbero ven solo lo que les permites.</p>
  <div class="li"><span class="av lg">👑</span><div class="t"><b>Dueño</b><small>${API.remote?'Correo en Cloudflare (OWNER_EMAILS)':'PIN '+esc(c.adminPin)} · todos los permisos</small></div></div>
  ${(d.usuarios||[]).map(u=>`<div class="li"><span class="av lg">${(ROLES[u.rol]?.t||'👤').split(' ')[0]}</span><div class="t"><b>${esc(u.nombre)}</b><small>${ROLES[u.rol]?.t||''} · ${API.remote?esc(u.email||'⚠️ sin correo'):'PIN '+esc(u.pin)} · ${Object.values(u.permisos||{}).filter(Boolean).length}/${PERMS.length} permisos${u.barberoId?' · 💈 '+esc(d.barberos.find(b=>b.id===u.barberoId)?.nombre||''):''}<br>${resumenCitas(u)}</small></div>${sw(u.activo!==false,'togUser',u.id)}<button class="ibtn" data-on-click="a09c9e85a" data-p0="${u.id}">✏️</button></div>`).join('')}
  <button class="btn p w" style="margin-top:12px" data-on-click="a895e08fc">➕ Agregar usuario</button>
  <label class="lb" style="margin-top:20px">💈 Barberos (${API.remote?'entran con su cuenta de Google':'entran con su PIN'})</label>
  ${d.barberos.map(b=>`<div class="li" style="cursor:pointer" data-on-click="a69663813" data-p0="${b.id}">${avatar(b)}<div class="t"><b>${esc(b.nombre)}</b><small>${API.remote?esc(b.email||'⚠️ sin correo'):'PIN '+esc(b.pin)} · ${resumenCitas({barberoId:b.id,id:b.id})}</small></div><span style="color:var(--mu)">›</span></div>`).join('')}
  <label class="lb">Permisos de los barberos</label>${PERMS.map(([k,t])=>`<div class="perm"><span>${t}</span>${sw(pb[k],'togPB',k)}</div>`).join('')}`})}
 ${acc('barberos',`💈 Barberos (${d.barberos.length})`,API.remote?'Foto, color, correo, días y comisión':'Foto, color, PIN, días y comisión',()=>`
  ${d.barberos.map(b=>`<div class="li"><span class="bar" style="width:5px;height:38px;border-radius:4px;background:${b.color||'var(--pur)'}"></span>${avatar(b,1)}<div class="t"><b>${esc(b.nombre)}</b><small>${esc(b.esp||'')}${b.esp?' · ':''}${ORDEN.filter(x=>b.dias.includes(x)).map(x=>DIAS[x]).join(' ')} · ${API.remote?esc(b.email||'⚠️ sin correo'):'PIN '+esc(b.pin)}</small></div>${sw(b.activo!==false,'togBarb',b.id)}<button class="ibtn" data-on-click="afda928ce" data-p0="${b.id}">✏️</button></div>`).join('')}
  <button class="btn p w" style="margin-top:12px" data-on-click="a0c1f4acd">➕ Agregar barbero</button>
  <p class="hint">Cada barbero entra con ${API.remote?'su cuenta de Google':'su PIN'} y solo ve sus citas. El interruptor lo oculta del formulario sin borrarlo.</p>`)}
 ${acc('servicios',`✂️ Servicios y precios (${d.servicios.length})`,'Cortes con foto de referencia',()=>`
  ${d.servicios.map(s=>`<div class="li"><span class="av lg" style="border-radius:12px;overflow:hidden">${s.foto?`<img data-foto="${s.foto}" style="width:100%;height:100%;object-fit:cover">`:s.emoji}</span><div class="t"><b>${esc(s.nombre)}</b><small>${soles(s.precio)} · ${esc(s.desc||'')}</small></div>${sw(s.activo!==false,'togServ',s.id)}<button class="ibtn" data-on-click="a38880731" data-p0="${s.id}">✏️</button></div>`).join('')}
  <button class="btn p w" style="margin-top:12px" data-on-click="a7600a346">➕ Agregar servicio</button>`)}
 ${acc('yape','💸 Adelanto por Yape',pagoOn()?`Activo · ${soles(c.adelanto)}`:'Desactivado',()=>`
  <div class="li"><div class="t"><b>Cobrar adelanto para confirmar</b><small>Si lo apagas, las reservas llegan sin pago</small></div>${sw(c.modAdelanto,'setB','modAdelanto')}</div>
  ${c.modAdelanto?`<label class="lb">Número de Yape</label><input class="in" inputmode="tel" value="${esc(c.yapeNum)}" placeholder="9XXXXXXXX" data-on-change="aea3ce74b">
  <label class="lb">Titular (como aparece en Yape)</label><input class="in" value="${esc(c.yapeTitular)}" data-on-change="a99418512">
  <div class="g2"><div><label class="lb">Adelanto S/</label><input class="in" type="number" min="0" value="${c.adelanto}" data-on-change="a1d0b1a75"></div><div><label class="lb">Minutos para pagar</label><input class="in" type="number" min="5" value="${c.holdMin}" data-on-change="a9eb79fc2"></div></div>
  <label class="lb">QR de Yape (opcional)</label><label class="upl"><span class="prev">${c.yapeQR?`<img data-foto="${c.yapeQR}">`:'📱'}</span><span class="btn sm">Subir imagen</span><input type="file" accept="image/*" data-on-change="a21916402"></label>`:''}`)}
 ${acc('mensajes','💬 Mensajes de WhatsApp','Edita los textos que se envían',()=>`
  <p class="hint" style="margin-top:0">Toca una variable para insertarla. Las líneas con variables vacías se ocultan solas.</p>
  ${[['waConfirma','✅ Confirmación'],['waVuelve','💈 Cliente por recuperar'],['waRecuerda','⏰ Recordatorio'],['waYape','💸 Pedir adelanto'],['waGracias','🙏 Agradecimiento'],['waReserva','📥 Aviso de nueva reserva (cliente → tú)']].map(([k,t])=>`<label class="lb">${t}</label><textarea class="in" id="ta_${k}" rows="6" data-on-change="a79203c4c" data-p0="${k}">${esc(c[k])}</textarea><div class="vars">${VARS.map(v=>`<button data-on-click="aa7ec0841" data-p0="${k}" data-p1="${v}">{${v}}</button>`).join('')}<button style="color:var(--mu)" data-on-click="a04fd9758" data-p0="${k}" data-p1="${k}">↺ original</button></div>`).join('')}
  <label class="lb">Vista previa (confirmación)</label><div class="url" style="white-space:pre-wrap;color:var(--tx)">${esc(tplPreview(c.waConfirma))}</div>`)}
 ${API.remote?acc('waapi','🤖 WhatsApp automático','API oficial de Meta · número nuevo',()=>`<div id="waCfg"><div class="spin"></div></div>`):''}
 ${acc('form','📝 Formulario del cliente','Textos que ve tu cliente',()=>`
  <label class="lb">Título del primer paso</label><input class="in" value="${esc(c.txtBienvenida)}" data-on-change="a5b1dd04e">
  <label class="lb">Mensaje al terminar</label><input class="in" value="${esc(c.txtFinal)}" data-on-change="a3440152d">
  <button class="btn w" style="margin-top:12px" data-on-click="aa29a5450">↗ Ver formulario</button>`)}
 ${acc('narrador','🗣️ Narrador y pantalla de carga',c.narrOn?`${esc(c.narrNombre)} · activo`:'Narrador apagado',()=>`
  <div class="li"><div class="t"><b>Pantalla de carga</b><small>Tu logo al abrir el formulario</small></div>${sw(c.splashOn,'setB','splashOn')}</div>
  ${c.splashOn?`<div class="li"><div class="t"><b>Efecto derretir</b><small>El logo se derrite cuando termina de cargar</small></div>${sw(c.splashMelt,'setB','splashMelt')}</div>
  <label class="lb">Imagen de carga</label><div class="row"><label class="upl"><span class="prev" style="background:#000">${c.splashImg?`<img data-foto="${c.splashImg}">`:`<small style="font-size:11px;color:#f5c542">Incluido ✓</small>`}</span><span class="btn sm">📷 Subir logo</span><input type="file" accept="image/*" data-on-change="a893e370d"></label>${c.splashImg?`<button class="btn sm r" data-on-click="ad42f0c21">Quitar</button>`:''}</div>
  <p class="hint">Sin imagen subida usa el logo Stereo incluido (con su versión derretida).</p>`:''}
  <div class="li" style="margin-top:8px"><div class="t"><b>Narrador</b><small>Personaje que acompaña al cliente</small></div>${sw(c.narrOn,'setB','narrOn')}</div>
  ${c.narrOn?`<label class="lb">Nombre del narrador</label><input class="in" value="${esc(c.narrNombre)}" data-on-change="a65b5ad8f">
  <label class="lb">Imagen del narrador</label><div class="row"><label class="upl"><span class="prev" style="border-radius:50%;border:3px solid #e01b1b">${c.narrImg?`<img data-foto="${c.narrImg}">`:`<small style="font-size:11px;color:#f5c542">Incluido ✓</small>`}</span><span class="btn sm">📷 Subir imagen</span><input type="file" accept="image/*" data-on-change="a17f88ebd"></label>${c.narrImg?`<button class="btn sm r" data-on-click="ade5ce8b5">Quitar</button>`:''}</div>
  <p class="hint">Sin imagen subida usa al Tío Stereo incluido.</p>
  <div class="li"><div class="t"><b>Voz encendida desde el inicio</b><small>Si está apagada, el cliente la activa tocando al narrador</small></div>${sw(c.narrVoz,'setB','narrVoz')}</div>
  <label class="lb">Velocidad de la voz</label><select class="in" data-on-change="aa952ff32">${[[.85,'Lenta'],[1,'Normal'],[1.15,'Rápida']].map(([v,t])=>`<option value="${v}" ${+c.narrRate===v?'selected':''}>${t}</option>`).join('')}</select>
  <label class="lb">Tono de la voz</label><select class="in" data-on-change="aa9330099">${[[.35,'Muy grave · hombre rudo'],[.5,'Grave'],[.75,'Medio'],[1,'Normal']].map(([v,tx])=>`<option value="${v}" ${+c.narrTono===v?'selected':''}>${tx}</option>`).join('')}</select><p class="hint">La voz es la que trae el celular de cada cliente: se elige una masculina en español y se le baja el tono.</p>
  <div class="banner pu" style="margin-top:14px">🎙️ <b>Pon tu propia voz.</b> Debajo de cada frase toca <b>Grabar mi voz</b> (o sube un audio de WhatsApp) y léela con tu voz de hombre rudo. Donde no grabes nada, habla la voz del celular del cliente. Graba la frase <b>sin los datos entre llaves</b> (nombre, precio, hora…): en pantalla sí salen completos.</div>
  <button class="btn p w" style="margin-top:12px;padding:14px" data-on-click="a95659710">🎬 Grabar todas las frases con el guion</button>
  <label class="lb" style="margin-top:18px">Frases (lo que dice en cada paso y según el estado de la cita)</label>
  ${NKEYS.map(([k,t])=>`<label class="lb">${t}</label><textarea class="in" id="tn_${k}" rows="2" data-on-change="aaff98a67" data-p0="${k}">${esc(c.narr[k])}</textarea><div class="vars">${NVARS.map(v=>`<button data-on-click="ae92c8d5e" data-p0="${k}" data-p1="${v}">{${v}}</button>`).join('')}<button style="color:var(--mu)" data-on-click="a9c14d532" data-p0="${k}" data-p1="${k}">↺</button></div>
   <div class="row" style="gap:6px;margin:8px 0 14px;flex-wrap:wrap"><button class="btn sm" id="rec_${k}" data-rec="${k}" data-on-click="a2fadf31d" data-p0="${k}">🎙️ Grabar mi voz</button><label class="btn sm">⬆️ Subir audio<input type="file" accept="audio/*" style="display:none" data-on-change="a5d9979b7" data-p0="${k}"></label>${(c.narrAudio||{})[k]?`<button class="btn sm" data-on-click="a6ea62739" data-p0="${k}">▶️ Oír</button><button class="btn sm r" data-on-click="a302cf191" data-p0="${k}">🗑️</button><span class="pill" style="color:var(--grn);border-color:var(--grn)">🎙️ con tu voz</span>`:'<span class="hint" style="margin:0">Voz del celular</span>'}</div>`).join('')}`:''}
  <button class="btn w" style="margin-top:14px" data-on-click="aa29a5450">↗ Probar en el formulario</button>`)}
 ${acc('estados','🏷️ Estados de la cita','Nombre y emoji de cada estado',()=>`
  ${Object.keys(DEF_EST).map(k=>{const e={...DEF_EST[k],...(c.est[k]||{})};return `<div class="row" style="margin-top:8px"><input class="in" style="width:62px;text-align:center" maxlength="3" value="${esc(e.i)}" data-on-change="a0218b0f2" data-p0="${k}"><input class="in" value="${esc(e.t)}" data-on-change="a0d710823" data-p0="${k}"><span style="width:14px;height:14px;border-radius:50%;background:${e.c};flex:none"></span></div>`}).join('')}
  <button class="btn sm" style="margin-top:10px" data-on-click="af2e41742">↺ Restaurar originales</button>`)}
 ${acc('funciones','🧩 Funciones','Activa solo lo que usas',()=>`
  ${[['modFotos','📷 Fotos antes y después','En cada cita confirmada'],['modFidelidad','🎁 Tarjeta de fidelidad','Corte gratis cada N visitas'],['modComision','💰 Comisiones','% por barbero en la Caja'],['modWalkin','⚡ Clientes sin cita','Botón para pasar directo a silla']].map(([k,t,s])=>`<div class="li"><div class="t"><b>${t}</b><small>${s}</small></div>${sw(c[k],'setB',k)}</div>`).join('')}
  ${c.modFidelidad?`<label class="lb">Corte gratis cada</label><input class="in" type="number" min="2" value="${c.fidelidad}" data-on-change="afed2ea6a">`:''}`)}
 ${acc('privacidad','🔏 Privacidad y datos personales','Ley 29733: aviso, responsable y retención',()=>`
  <p class="hint" style="margin-top:0">Estos datos aparecen en tu <a href="privacidad.html" target="_blank" rel="noopener" style="color:var(--blue)">aviso de privacidad</a>, que el cliente acepta al reservar.</p>
  <label class="lb">Responsable de los datos (nombre o razón social)</label><input class="in" value="${esc(c.privTitular||'')}" placeholder="Ej: Juan Pérez · Stereo Barber Pool" data-cfg="privTitular" data-on-change="cfgTexto">
  <div class="g2"><div><label class="lb">RUC o DNI (opcional)</label><input class="in" value="${esc(c.privRuc||'')}" data-cfg="privRuc" data-on-change="cfgTexto"></div><div><label class="lb">Correo para solicitudes</label><input class="in" type="email" value="${esc(c.privCorreo||'')}" placeholder="tu@correo.com" data-cfg="privCorreo" data-on-change="cfgTexto"></div></div>
  <label class="lb">Anonimizar clientes que no vienen hace…</label><select class="in" data-cfg="retencionMeses" data-on-change="cfgNumero">${[[0,'No anonimizar automáticamente'],[12,'12 meses'],[24,'24 meses (recomendado)'],[36,'36 meses']].map(([v,t])=>`<option value="${v}" ${+(c.retencionMeses||0)===v?'selected':''}>${t}</option>`).join('')}</select>
  <label class="lb">Borrar capturas de Yape después de…</label><select class="in" data-cfg="capturasDias" data-on-change="cfgNumero">${[[0,'No borrar'],[90,'90 días'],[180,'180 días (recomendado)'],[365,'1 año']].map(([v,t])=>`<option value="${v}" ${+(c.capturasDias||0)===v?'selected':''}>${t}</option>`).join('')}</select>
  <p class="hint">Los clientes con notas o preferencias guardadas no se anonimizan solos. Para un pedido puntual: 👥 Clientes → ficha → 🔏 Datos personales. Los respaldos se guardan cifrados 30 días.</p>`)}
 ${acc('politica','📜 Política','Tolerancia y reprogramación',()=>`
  <div class="g2"><div><label class="lb">Tolerancia (minutos)</label><input class="in" type="number" min="0" max="120" value="${c.tolerancia??10}" data-on-change="a6ffed754"></div><div><label class="lb">Reprogramar hasta (horas antes)</label><input class="in" type="number" min="1" max="168" value="${c.horasReprog??24}" data-on-change="af822b928"></div></div>
  <label class="lb">Veces que el cliente puede reprogramar</label><select class="in" data-on-change="a77c8e8c2">${[0,1,2,3].map(n=>`<option value="${n}" ${+(c.maxReprog??1)===n?'selected':''}>${n===0?'No permitir':n===1?'1 vez':n+' veces'}</option>`).join('')}</select>
  <label class="lb">Texto de la política (lo ve el cliente en su cita)</label><textarea class="in" rows="3" placeholder="Ej: Si no llegas a tiempo, la cita se libera y el adelanto no se devuelve." data-on-change="ac1d45c51">${esc(c.politicaTxt||'')}</textarea>
  <p class="hint">En «Ver estado de cita» el cliente ve solo este texto (escribe ahí tu tolerancia y reglas). El botón <b>📅 Reprogramar</b> solo le aparece si faltan ${c.horasReprog??24} horas o más para su corte.</p>`)}
 ${acc('seguridad','🔐 Seguridad y respaldo',API.remote?'Accesos, respaldo y pruebas':'PIN admin, exportar, ejemplos',()=>`
  ${API.remote?'<p class="hint" style="margin-top:0">🔒 El acceso es solo con Google. Los dueños se definen en Cloudflare (variable OWNER_EMAILS); barberos y personal, por su correo.</p>':`<label class="lb">PIN de administrador</label><input class="in" inputmode="numeric" maxlength="6" value="${esc(c.adminPin)}" data-on-change="a7ea41258">`}
  ${API.remote?`<button class="btn p w" style="margin-top:12px;padding:14px" data-on-click="aea4720ac">🛡️ Monitoreo y respaldos</button>`:''}
  ${API.remote?`<button class="btn w" style="margin-top:12px" data-on-click="acae14b6b">🪪 Probar consulta de DNI</button><label class="lb">Tope de consultas DNI por día (0 = sin tope)</label><input class="in" type="number" min="0" value="${c.dniTopeDia??300}" data-on-change="ae4c0f398"><p class="hint">Protege tu saldo de Shalom. Las consultas repetidas salen de la memoria y no cuentan.</p>`:''}
  ${API.remote?`<button class="btn w" style="margin-top:12px" data-on-click="acfaa7afe">🔑 Mi clave y huella (dueño)</button>`:''}
  ${API.remote?`<div class="g2" style="margin-top:12px"><button class="btn" data-on-click="a30005ea1">🔍 Probar nube</button><button class="btn" data-on-click="ae15fe1d6">📜 Registro de accesos</button></div>`:''}
  <div class="g2" style="margin-top:12px"><button class="btn" data-on-click="adcacc9dc">⬇️ Exportar</button><label class="btn">⬆️ Importar<input type="file" accept=".json" style="display:none" data-on-change="a6ee55804"></label></div>
  <p class="hint">${API.remote?'Para pasar tus datos a la nube: en el panel anterior toca ⬇️ Exportar y aquí ⬆️ Importar (incluye fotos).':'El respaldo guarda configuración, citas y fotos.'}</p>
  ${API.remote?'':`
  <div class="g2" style="margin-top:12px"><button class="btn" data-on-click="a430eaa1e">🧪 Cargar ejemplos</button><button class="btn" data-on-click="aac281993">🧹 Quitar ejemplos</button></div>
  <button class="btn r w" style="margin-top:10px" data-on-click="ab255ef33">🗑️ Borrar todas las citas</button>`}`)}`;
 hydrate($('#t-config'))}
function resumenCitas(u){const now=Date.now(),act=S.citas.filter(c=>activa(c)&&c.estado!=='atendida'&&startTs(c)>now-30*60000);const mias=u.barberoId?act.filter(c=>c.barberoId===u.barberoId).sort((a,b)=>startTs(a)-startTs(b)):[];const hoyN=mias.filter(c=>c.fecha===hoy()).length,creo=S.citas.filter(c=>c.creadoPor===u.id).length;
 return (u.barberoId?`📅 ${mias.length} próximas · hoy ${hoyN}${mias[0]?` · siguiente <b style="color:var(--blue)">${falta(startTs(mias[0]))}</b>`:''}`:'')+(creo?`${u.barberoId?' · ':''}✍️ agendó ${creo}`:'')||'Sin citas'}
function verCitasDe(bid){const b=barb(bid)||D()?.barberos.find(x=>x.id===bid);const now=Date.now(),cs=S.citas.filter(c=>c.barberoId===bid&&activa(c)&&startTs(c)>now-30*60000&&c.estado!=='atendida').sort((a,b)=>startTs(a)-startTs(b));
 openModal(mHead('📅 Citas de '+esc(b?.nombre||''))+(cs.map(c=>`<div class="li"><div class="t"><b>${esc(c.cliente?.nombre)}</b><small>${fLarga(c.fecha)} · ${h12(c.hora)} · ✂️ ${esc(c.servicioNombre)}</small></div><span class="tag cd ${startTs(c)<now?'late':''}">${cdLabel(startTs(c))}</span></div>`).join('')||'<div class="empty"><b>📭</b>Sin citas próximas</div>'))}
/* ---------- pegar mensaje de WhatsApp: rellena una cita o crea toda una agenda ---------- */
const nrm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const tCase=s=>s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu,(_,a,b)=>a+b.toUpperCase()).replace(/\s+/g,' ').trim();
const DOWN={domingo:0,lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6};
function fechaDeDia(w){const t=hoy();if(w==='hoy')return t;if(w==='manana')return addD(t,1);const n=DOWN[w],h=pYmd(t).getDay();return addD(t,(n-h+7)%7)}
function servPor(kw){const act=S.servicios.filter(s=>s.activo!==false),has=(s,k)=>nrm(s.nombre).includes(k);
 const k=kw.includes('barba')?'barba':kw.includes('facial')?'facial':kw.includes('semi')?'semi':kw.includes('platin')?'platin':'';
 if(k)return act.find(s=>has(s,k))||act[0];
 return act.find(s=>has(s,'corte')&&has(s,'asesor')&&!has(s,'barba')&&!has(s,'facial')&&!has(s,'semi'))||act.find(s=>has(s,'corte'))||act[0]}
function parseAgenda(txt){
 const RX=/(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|hoy|ma[nñ]ana)\s+(?:a\s+las\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/gi;
 const out=[];let barb='',prevBlank=true,cur=null;
 for(const raw of String(txt).split(/\r?\n/)){const line=raw.trim();
  if(!line){prevBlank=true;cur=null;continue}
  const ms=[...line.matchAll(RX)];
  if(!ms.length){if(prevBlank&&line.split(/\s+/).length<=3&&!/\d/.test(line)){barb=line.replace(/[:\-–—\s]+$/,'');cur=null}else if(cur)cur.resto+=' '+line;prevBlank=false;continue}
  if(cur&&ms[0].index>0)cur.resto+=' '+line.slice(0,ms[0].index);
  ms.forEach((m,i)=>{const fin=i+1<ms.length?ms[i+1].index:line.length;let h=+m[2];const mi=+(m[3]||0),ap=(m[4]||'').toLowerCase();
   if(ap.startsWith('p')&&h<12)h+=12;else if(ap.startsWith('a')&&h===12)h=0;else if(!ap&&h>=1&&h<=7)h+=12;
   cur={dia:nrm(m[1]),hora:`${pad(h)}:${pad(mi)}`,resto:line.slice(m.index+m[0].length,fin),barbTxt:barb};out.push(cur)});
  prevBlank=false}
 return out.map(e=>{let r=e.resto.replace(/\s+/g,' ').trim();const kw=nrm(r);
  const tel=(r.match(/(?:\+?51)?\s?(9\d{2}\s?\d{3}\s?\d{3})/)||[])[1]?.replace(/\s/g,'')||'';if(tel)r=r.replace(/(?:\+?51)?\s?9\d{2}\s?\d{3}\s?\d{3}/,'');
  const dni=(r.match(/\b\d{8}\b/)||[])[0]||'';if(dni)r=r.replace(dni,'');
  const sv=servPor(kw);r=r.replace(/\b(barba|facial|semi(?:ondulaci[oó]n)?|platinado)\b/gi,'').replace(/\s+/g,' ').trim();
  const b=S.barberos.find(x=>x.activo!==false&&nrm(x.nombre)===nrm(e.barbTxt))||S.barberos.find(x=>x.activo!==false&&e.barbTxt&&nrm(x.nombre).startsWith(nrm(e.barbTxt)))||null;
  return{fecha:fechaDeDia(e.dia),hora:e.hora,nombre:tCase(r),tel,dni,servicioId:sv?.id,barberoId:b?.id||'',barbTxt:e.barbTxt,ok:true}})}
function pegarBox(){return`<div style="background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.5);border-radius:14px;padding:10px;margin-bottom:12px"><div style="font-size:13px;font-weight:700;color:#4ade80">📲 ¿Te mandaron datos o la agenda por WhatsApp? Pégalos aquí y se llenan solos <small style="font-weight:400">(opcional)</small></div><div style="display:flex;gap:8px;margin-top:8px"><textarea class="in" id="pegaTxt" rows="2" placeholder="Pega el mensaje de WhatsApp…" style="flex:1;min-height:44px"></textarea><button class="btn p" data-on-click="a33b7d25e">Rellenar</button></div></div>`}
function pegarProcesar(){const t=$('#pegaTxt').value;if(!t.trim())return toast('Pega primero el mensaje');
 const l=parseAgenda(t);if(l.length>=2||(l.length===1&&/\n/.test(t.trim())))return agendaVista(l);
 const dni=(t.match(/\b\d{8}\b/)||[])[0]||'',tel=((t.replace(dni,'').match(/(?:\+?51)?\s?(9\d{2}\s?\d{3}\s?\d{3})/)||[])[1]||'').replace(/\s/g,'');
 let nom=(t.match(/nombre\s*[:\-]\s*([^\n,;]+)/i)||[])[1]||t.replace(/\d+/g,' ').replace(/[^\p{L}\s]/gu,' ').replace(/\b(hola|soy|mi|nombre|dni|cel|celular|tel|telefono|whatsapp|es|el|de)\b/gi,' ').split(/\s+/).filter(Boolean).slice(0,5).join(' ');
 if(l.length===1&&l[0].nombre)nom=l[0].nombre;
 if(dni){$('#fDni').value=dni;buscarDniP($('#fDni'))}if(tel&&!$('#fTel').value)$('#fTel').value=tel;if(nom&&!$('#fNom').value)$('#fNom').value=tCase(nom);
 if(l.length===1){$('#fFecha').value=l[0].fecha;if(typeof fillHoras==='function'){fillHoras();setTimeout(()=>{if([...$('#fHora').options].some(o=>o.value===l[0].hora))$('#fHora').value=l[0].hora},50)}}
 toast('✅ Datos rellenados. Revísalos.')}
function agendaVista(l){S._ag=l;const adm=isAdmin(),bs=(adm?S.barberos.filter(b=>b.activo!==false):S.barberos.filter(b=>b.id===S.ses.barberoId));
 const sOpts=id=>S.servicios.filter(s=>s.activo!==false).map(s=>`<option value="${s.id}" ${s.id===id?'selected':''}>${esc(s.nombre)}</option>`).join('');
 const bOpts=id=>`<option value="">— Elige barbero —</option>`+bs.map(b=>`<option value="${b.id}" ${b.id===id?'selected':''}>${esc(b.nombre)}</option>`).join('');
 openModal(mHead('📋 Agenda detectada')+`<p class="hint" style="margin-top:0">Revisa cada línea. Si el barbero del mensaje no está registrado, elígelo en la lista. Nada se guarda hasta que toques <b>Crear</b>.</p><div class="g2"><div><label class="lb">Día de todas</label><input class="in" type="date" id="agFecha" value="${l[0]?.fecha||hoy()}" data-on-change="a9c6835d7"></div><div><label class="lb">Estado</label><select class="in" id="agEst"><option value="confirmada">Confirmada</option><option value="atendida" ${(l[0]?.fecha||hoy())<hoy()?'selected':''}>Atendida (ya pasó)</option></select></div></div><div id="agL" style="margin-top:10px">${l.map((e,i)=>`<div class="card" id="ag${i}" style="padding:10px;margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center"><input type="checkbox" ${e.ok?'checked':''} data-on-change="a5528013a" data-p0="${i}"><b style="flex:1" id="agt${i}">${fLarga(e.fecha)} · ${h12(e.hora)}</b><small id="agw${i}" style="color:#f87171"></small></div><input class="in" value="${esc(e.nombre)}" placeholder="Nombre" data-on-input="a4c08466b" data-p0="${i}" style="margin-top:6px"><div class="g2" style="margin-top:6px"><select class="in" data-on-change="a5ca068cf" data-p0="${i}">${sOpts(e.servicioId)}</select><select class="in" data-on-change="ad5e86962" data-p0="${i}">${bOpts(e.barberoId)}</select></div></div>`).join('')}</div><button class="btn p w" id="agBtn" style="margin-top:12px;padding:14px" data-on-click="a6656e549">✅ Crear citas</button>`);agMarca()}
function agFecha(v){if(!v)return;S._ag.forEach((e,i)=>{e.fecha=v;const t=$('#agt'+i);if(t)t.textContent=fLarga(v)+' · '+h12(e.hora)});$('#agEst').value=v<hoy()?'atendida':'confirmada';agMarca()}
function agMarca(){const l=S._ag,vistos=new Set();let n=0;l.forEach((e,i)=>{const w=$('#agw'+i);let m='';const k=e.barberoId+e.fecha+e.hora;
  if(e.ok){if(!e.barberoId)m='⚠️ sin barbero';else if(ocupado(S.citas,e.barberoId,e.fecha,e.hora))m='⛔ horario ocupado';else if(vistos.has(k))m='⛔ repetido';vistos.add(k)}
  if(w)w.textContent=m;e._bad=!!m;if(e.ok&&!m)n++});
 const b=$('#agBtn');if(b){b.textContent=n?`✅ Crear ${n} cita${n>1?'s':''}`:'Nada para crear';b.disabled=!n}}
async function agendaCrear(){const est=$('#agEst').value,l=S._ag.filter(e=>e.ok&&!e._bad&&e.nombre.trim());let n=0,err=[];$('#agBtn').disabled=true;
 for(const e of l){const s=S.servicios.find(x=>x.id===e.servicioId);
  try{await API.crearCita({fecha:e.fecha,hora:e.hora,barberoId:e.barberoId,servicioId:s?.id,servicioNombre:s?.nombre||'',precio:+s?.precio||0,cliente:{nombre:e.nombre.trim(),tel:e.tel||'',ciudad:'',dni:e.dni||''},nota:'',estado:est,...(est==='atendida'?{atendidaTs:new Date(e.fecha+'T'+e.hora).getTime()}:{}),adelanto:0,adelantoOk:false,origen:'panel',creadoPor:S.ses.uid||S.ses.barberoId||'dueno'});n++}catch(x){err.push(e.nombre)}}
 closeModal();if(l[0])fijarDia(l[0].fecha);await reload();toast(`✅ ${n} cita${n!==1?'s':''} creada${n!==1?'s':''}${err.length?` · ❌ fallaron: ${err.join(', ')}`:''}`)}

/* Mover varias citas a otro día (p. ej. una carga masiva que quedó con la fecha equivocada) */
function moverCitas(){const now=Date.now(),dom=(()=>{const t=hoy(),w=pYmd(t).getDay();return addD(t,w?-w:-7)})();
 const cs=S.citas.filter(c=>c.estado!=='cancelada').sort((a,b)=>(b.creada||0)-(a.creada||0)||(a.fecha+a.hora).localeCompare(b.fecha+b.hora));
 const rec=c=>c.origen==='panel'&&(c.creada||0)>now-48*3600e3;
 S._mv=Object.fromEntries(cs.map(c=>[c.id,rec(c)]));
 const grupos={};cs.forEach(c=>{const k=rec(c)?'Cargadas en las últimas 48 h':'Otras citas';(grupos[k]=grupos[k]||[]).push(c)});
 openModal(mHead('📅 Mover citas a otro día')+`<p class="hint" style="margin-top:0">Marca las citas y elige el nuevo día. La hora, el barbero y el servicio no cambian.</p>
 <div class="g2"><div><label class="lb">Nuevo día</label><input class="in" type="date" id="mvF" value="${dom}" data-on-change="aabae33e1"></div><div><label class="lb">&nbsp;</label><label style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" id="mvAt" ${dom<hoy()?'checked':''}> Marcar como atendidas</label></div></div>
 <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" data-on-click="a15fcc86d">Marcar todas</button><button class="btn sm" data-on-click="a62f9bb25">Ninguna</button></div>
 <div id="mvL" style="margin-top:8px;max-height:50vh;overflow:auto">${Object.entries(grupos).map(([g,l])=>`<p class="lb">${g} (${l.length})</p>`+l.map(c=>`<label class="li" style="cursor:pointer"><input type="checkbox" data-id="${c.id}" ${S._mv[c.id]?'checked':''} data-on-change="a4107e257" data-p0="${c.id}"><div class="t"><b>${esc(c.cliente?.nombre||'')}</b><small>${fLarga(c.fecha)} · ${h12(c.hora)} · ${esc(barb(c.barberoId)?.nombre||'')} · ${esc(c.servicioNombre||'')}</small></div></label>`).join('')).join('')}</div>
 <button class="btn p w" id="mvBtn" style="margin-top:12px;padding:14px" data-on-click="aaff5afcb"></button>`);mvCuenta()}
function mvTodas(v){$$('#mvL input[type=checkbox]').forEach(x=>{x.checked=v;S._mv[x.dataset.id]=v});mvCuenta()}
function mvCuenta(){const n=Object.values(S._mv).filter(Boolean).length,b=$('#mvBtn');b.textContent=n?`📅 Mover ${n} cita${n>1?'s':''}`:'Marca al menos una';b.disabled=!n}
async function mvAplicar(){const f=$('#mvF').value,at=$('#mvAt').checked;if(!f)return toast('Elige el nuevo día');
 const ids=Object.keys(S._mv).filter(k=>S._mv[k]);if(!confirm(`¿Mover ${ids.length} cita(s) al ${fLarga(f)}${at?' y marcarlas como atendidas':''}?`))return;
 $('#mvBtn').disabled=true;let n=0;const err=[];
 for(const id of ids){const c=cita(id);if(!c)continue;
  try{await API.updateCita(id,{fecha:f,...(at?{estado:'atendida',atendidaTs:c.atendidaTs||new Date(f+'T'+(c.hora||'12:00')).getTime()}:{})});n++}catch(e){err.push(`${c.cliente?.nombre} (${e.message})`)}}
 closeModal();fijarDia(f);await reload();toast(`✅ ${n} cita${n!==1?'s':''} movida${n!==1?'s':''} al ${fLarga(f)}`);if(err.length)alert('No se pudieron mover:\n'+err.join('\n'))}
let dniAutoP='';
async function buscarDniP(inp){const v=inp.value.replace(/\D/g,'');inp.value=v;const est=$('#fDniEst');if(!est)return;
 if(v.length!==8||!API.remote){est.textContent='';return}
 est.textContent='🔎 Buscando en RENIEC…';
 try{const r=await API.dni(v);if($('#fDni')?.value!==v)return;const n=$('#fNom');
  if(n&&(!n.value.trim()||n.value===dniAutoP)){n.value=r.nombre;dniAutoP=r.nombre}
  est.textContent='✅ '+r.nombre}
 catch(e){est.textContent='⚠️ '+e.message}}
/* ---------- Fase 4: monitoreo y respaldos ---------- */
const BLOQ={limite_pub:'Demasiadas visitas seguidas',limite_dni:'Demasiadas consultas de DNI',limite_res:'Demasiadas reservas seguidas',sin_ficha:'DNI pedido fuera del formulario',robot:'No pasó Turnstile (robot)',tope_dni:'Tope diario de DNI'};
const kb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
async function verSeguridad(){openModal(mHead('🛡️ Monitoreo y respaldos')+'<div class="spin"></div>');
 let r,rs=[];try{[r,rs]=await Promise.all([API.req('GET','/seguridad'),can('excel')?API.req('GET','/respaldos').catch(()=>[]):[]])}catch(e){return $('#mbody').innerHTML=mHead('🛡️ Monitoreo')+`<p class="hint">❌ ${esc(e.message)}</p>`}
 const ds=Object.entries(r.dias).sort((a,b)=>b[0].localeCompare(a[0])),tot=k=>ds.reduce((a,[,x])=>a+(k==='bloq'?Object.values(x.bloqueos).reduce((p,n)=>p+n,0):x[k]),0),u=r.ultimoRespaldo;
 const chip=(ok,t)=>`<span class="tag" style="color:${ok?'var(--grn)':'#f0883e'};border-color:${ok?'var(--grn)':'#f0883e'}">${ok?'✅':'⚠️'} ${t}</span>`;
 const tipos={};ds.forEach(([,x])=>Object.entries(x.bloqueos).forEach(([k,n])=>tipos[k]=(tipos[k]||0)+n));
 $('#mbody').innerHTML=mHead('🛡️ Monitoreo y respaldos')+`
 <div class="tags" style="margin-bottom:12px">${chip(r.turnstile,'Turnstile')}${chip(r.shalom,'Consulta DNI')}${chip(u&&u.fecha>=addD(hoy(),-1),'Respaldo '+(u?fLarga(u.fecha).split(' ').slice(0,2).join(' '):'pendiente'))}</div>
 <p class="lb" style="margin-top:0">Últimos 14 días</p>
 <div class="stats"><div class="stat"><b style="color:var(--grn)">${tot('reservas')}</b><span>📥 Reservas web</span></div><div class="stat"><b style="color:var(--blue)">${tot('dni')}</b><span>🪪 Consultas DNI${r.topeDni?` (tope ${r.topeDni}/día)`:''}</span></div><div class="stat"><b style="color:var(--red)">${tot('bloq')}</b><span>🛡️ Bloqueos</span></div><div class="stat"><b style="color:#f0883e">${tot('ingresosFallidos')}</b><span>🔐 Ingresos fallidos</span></div></div>
 ${Object.keys(tipos).length?`<p class="lb">Qué se bloqueó</p>${Object.entries(tipos).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="li"><div class="t"><b>${esc(BLOQ[k]||k)}</b></div><span class="tag">${n}</span></div>`).join('')}`:'<p class="hint">✨ Sin bloqueos: nadie intentó abusar del formulario.</p>'}
 <p class="lb">Por día</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:var(--mu);text-align:right"><th style="text-align:left">Día</th><th>📥</th><th>🪪</th><th>🛡️</th><th>🔐✗</th></tr>${ds.map(([f,x])=>{const b=Object.values(x.bloqueos).reduce((a,n)=>a+n,0);return `<tr style="text-align:right;border-top:1px solid var(--line)"><td style="text-align:left;padding:6px 0">${fLarga(f).split(' ').slice(0,2).join(' ')}</td><td>${x.reservas||'·'}</td><td>${x.dni||'·'}</td><td style="color:${b?'var(--red)':''}">${b||'·'}</td><td style="color:${x.ingresosFallidos?'#f0883e':''}">${x.ingresosFallidos||'·'}</td></tr>`}).join('')}</table></div>
 <p class="lb">💾 Respaldos automáticos</p><p class="hint" style="margin-top:0">Cada madrugada se guarda una copia completa (citas, clientes, configuración) en tu almacén privado de Cloudflare. Se guardan los últimos 30 días. Para restaurar: descarga uno y usa «♻️ Restaurar respaldo».</p>
 ${can('config')?`<button class="btn w" data-on-click="a91de6128">💾 Crear respaldo ahora</button>`:''}
 <button class="btn w" style="margin-top:14px" data-on-click="a114435f6">📝 Bitácora: quién hizo qué</button>
 ${can('config')?`<button class="btn w" style="margin-top:8px" data-on-click="aa7cb2ea4">🔄 Reconstruir fichas de clientes</button>`:''}
 <div style="margin-top:8px">${rs.length?rs.slice(0,30).map(x=>`<div class="li"><div class="t"><b>${fLarga(x.fecha)}</b><small>${x.citas} citas · ${kb(x.bytes)}</small></div><a class="btn sm" href="${CONFIG.API_URL}/respaldos/${x.fecha}" download>⬇️ Descargar</a></div>`).join(''):'<p class="hint">Todavía no hay respaldos.</p>'}</div>`}
/* Bitácora (auditoría): quién creó, editó, validó, canceló, reprogramó o cambió la configuración. */
async function verBitacora(cod,off=0){const q=`/auditoria?limit=40&offset=${off}${cod?'&objeto='+encodeURIComponent(cod):''}`;
 let r;try{r=await API.req('GET',q)}catch(e){return toast('❌ '+e.message)}
 S._bit=off?{...r,items:S._bit.items.concat(r.items)}:r;const it=S._bit.items;
 const fh=ts=>{const d=new Date(ts);return d.toLocaleDateString('es-PE',{day:'numeric',month:'short'})+' '+d.toLocaleTimeString('es-PE',{hour:'numeric',minute:'2-digit'})};
 openModal(mHead('📝 '+(cod?'Historial de la cita '+esc(cod):'Bitácora'))+`<p class="hint" style="margin-top:0">Se guarda 180 días. ${S._bit.total} registro(s).</p>
 ${it.length?it.map(x=>`<div class="li" style="align-items:flex-start"><div class="t"><b>${esc(x.accion)}${x.objeto&&!cod?` · <span style="color:var(--blue);cursor:pointer" data-on-click="a9952d4b5" data-p0="${esc(x.objeto)}">#${esc(x.objeto)}</span>`:''}</b><small>${esc(x.detalle)}</small><small>👤 ${esc(x.quien)}</small></div><small style="color:var(--mu);white-space:nowrap">${fh(x.ts)}</small></div>`).join(''):'<p class="hint">Todavía no hay registros.</p>'}
 ${it.length<S._bit.total?`<button class="btn w" style="margin-top:10px" data-on-click="a92877b10" data-p0="${cod?esc(cod):''}" data-p1="${it.length}">Ver más</button>`:''}`)}
async function rehacerFichas(b){b.disabled=true;b.textContent='⏳ Reconstruyendo…';try{const r=await API.req('POST','/clientes/rehacer',{});toast(`✅ ${r.clientes} fichas al día`)}catch(e){toast('❌ '+e.message)}b.disabled=false;b.textContent='🔄 Reconstruir fichas de clientes'}
async function respaldarAhora(b){b.disabled=true;b.textContent='⏳ Creando…';try{const r=await API.req('POST','/respaldos');toast(`✅ Respaldo creado: ${r.citas} citas`);S.alT=0;cargarAlertas();verSeguridad()}catch(e){toast('❌ '+e.message);b.disabled=false;b.textContent='💾 Crear respaldo ahora'}}
async function probarDni(){const d=prompt('DNI de 8 dígitos para probar la conexión con RENIEC:');if(!d)return;
 try{const r=await API.req('GET','/dni/'+d.replace(/\D/g,'')+'?crudo=1');alert(`Consultas de DNI hoy: ${r.usoHoy}${r.tope?' de '+r.tope:''}\n\n`+'Nombre que usará el sistema: '+(r.nombre||'(no se pudo armar)')+'\n\nRespuesta del servicio:\n'+JSON.stringify(r.crudo,null,1).slice(0,1200))}catch(e){alert('❌ '+e.message)}}
function togUser(id){const u=D().usuarios.find(x=>x.id===id);u.activo=u.activo===false;dirty();renderConfig()}
function togPB(k){const c=D().cfg;c.permBarbero={...ROLES.barbero.p,...(c.permBarbero||{})};c.permBarbero[k]=!c.permBarbero[k];dirty();renderConfig()}
function editUser(id){const u=id?D().usuarios.find(x=>x.id===id):{id:'',nombre:'',pin:'',rol:'recepcion',barberoId:'',permisos:{...ROLES.recepcion.p},activo:true};S._u=clone(u);
 openModal(mHead(id?'✏️ Editar usuario':'➕ Nuevo usuario')+`
 <label class="lb">Nombre</label><input class="in" id="uNom" value="${esc(u.nombre)}" placeholder="Ej: Kiara (recepción)">
 <label class="lb">Correo de Google (para entrar con Google)</label><input class="in" id="uMail" type="email" value="${esc(u.email||'')}" placeholder="ej: kiara@gmail.com">
 <div class="g2">${API.remote?'':`<div><label class="lb">PIN</label><input class="in" id="uPin" inputmode="numeric" maxlength="6" value="${esc(u.pin)}" placeholder="4-6 dígitos"></div>`}<div><label class="lb">Rol</label><select class="in" id="uRol" data-on-change="aa0eea588">${Object.entries(ROLES).filter(([k])=>k!=='dueno').map(([k,r])=>`<option value="${k}" ${u.rol===k?'selected':''}>${r.t}</option>`).join('')}</select></div></div>
 <label class="lb">Vincular a un barbero (ve sus citas)</label><select class="in" id="uBarb" data-on-change="aaee9a791"><option value="">— Ninguno —</option>${D().barberos.map(b=>`<option value="${b.id}" ${u.barberoId===b.id?'selected':''}>${esc(b.nombre)}</option>`).join('')}</select>
 <label class="lb">Permisos</label><div id="uPerms"></div>
 ${accHTML(id&&'u_'+id)}
 <button class="btn p w" style="margin-top:16px;padding:14px" data-on-click="a8613fc93">💾 Listo</button>
 ${id?`<button class="btn r w" style="margin-top:8px" data-on-click="a71761b67" data-p0="${id}">🗑️ Eliminar usuario</button>`:''}`);uPerms();if(id)accCargar('u_'+id)}
function uPerms(){$('#uPerms').innerHTML=PERMS.map(([k,t])=>`<div class="perm"><span>${t}</span>${sw(S._u.permisos[k],'togPermU',k)}</div>`).join('')}
function rolUser(r){S._u.rol=r;if(r!=='personal')S._u.permisos={...ROLES[r].p};uPerms()}
function saveUser(){const u=S._u;u.nombre=$('#uNom').value.trim();u.pin=API.remote?'':$('#uPin').value.replace(/\D/g,'');u.barberoId=$('#uBarb').value;u.email=$('#uMail').value.trim().toLowerCase();
 if(!u.nombre)return toast('Falta el nombre');if(u.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email))return toast('Correo no válido');
 if(!API.remote&&!u.email&&u.pin.length<4)return toast('Pon un correo de Google o un PIN de 4 a 6 dígitos');if(u.pin&&u.pin.length<4)return toast('El PIN debe tener 4 a 6 dígitos');
 const usados=[D().cfg.adminPin,...D().barberos.map(b=>b.pin),...D().usuarios.filter(x=>x.id!==u.id).map(x=>x.pin)];if(u.pin&&usados.includes(u.pin))return toast('Ese PIN ya lo usa otra persona');
 if(u.email&&[...D().barberos.map(b=>b.email),...D().usuarios.filter(x=>x.id!==u.id).map(x=>x.email)].includes(u.email))return toast('Ese correo ya lo usa otra persona');
 if(!Object.values(u.permisos).some(Boolean))return toast('Dale al menos un permiso');
 if(u.id){const i=D().usuarios.findIndex(x=>x.id===u.id);D().usuarios[i]=u}else{u.id='u'+uid();D().usuarios.push(u)}closeModal();dirty();renderConfig()}
function delUser(id){if(!confirm('¿Eliminar este usuario? Ya no podrá entrar.'))return;D().usuarios=D().usuarios.filter(x=>x.id!==id);closeModal();dirty();renderConfig()}
function tplPreview(s){return tpl(s,{fecha:hoy(),hora:'10:00',barberoId:D().barberos[0]?.id,servicioNombre:'Fade / Degradado',precio:30,codigo:'AB12CD',adelanto:D().cfg.adelanto,cliente:{nombre:'Carlos',tel:'987654321',ciudad:'Puente Piedra'}},D().cfg)}
const NKEYS=[['hola','👋 Al abrir'],['holaLink','🔗 Al abrir un link personalizado'],['servicio','✂️ Al elegir servicio'],['barbero','💈 Al elegir barbero'],['cualquiera','🎲 Si elige cualquier barbero'],['dia','📅 Al elegir día'],['hora','⏰ Al elegir hora'],['datos','💸 Antes de pagar'],['listo','✅ Reserva lista'],['ocupado','😕 Turno ocupado'],['vencido','⌛ Tiempo de pago vencido'],['estado_por_validar','🔎 Estado: Yape por validar'],['estado_confirmada','✅ Estado: Confirmada'],['estado_en_silla','💺 Estado: En silla'],['estado_atendida','✔️ Estado: Atendido'],['estado_no_vino','❌ Estado: No vino'],['estado_cancelada','🚫 Estado: Cancelada'],['estado_expirada','⌛ Estado: Expirada']];
const NVARS=['narrador','cliente','servicio','precio','barbero','especialidad','fecha','hora','adelanto','yape','negocio'];
function insVarN(k,v){const ta=$('#tn_'+k);const p=ta.selectionStart??ta.value.length;ta.value=ta.value.slice(0,p)+'{'+v+'}'+ta.value.slice(ta.selectionEnd??p);D().cfg.narr[k]=ta.value;dirty();ta.focus()}
async function subirImg(inp,key,max,type){const f=inp.files[0];if(!f)return;try{D().cfg[key]=await API.putFoto(await compressImg(f,max,.85,type));dirty();renderConfig()}catch(e){toast('❌ '+e.message)}}
function insVar(k,v){const ta=$('#ta_'+k);const p=ta.selectionStart??ta.value.length;ta.value=ta.value.slice(0,p)+'{'+v+'}'+ta.value.slice(ta.selectionEnd??p);setC(k,ta.value);ta.focus()}
function setEst(k,f,v){const e=D().cfg.est;e[k]={...(e[k]||{}),[f]:v.trim()||DEF_EST[k][f]};dirty()}
function togDia(x){const a=D().cfg.dias;const i=a.indexOf(x);i<0?a.push(x):a.splice(i,1);dirty();renderConfig()}
function togBarb(id){const b=D().barberos.find(x=>x.id===id);b.activo=b.activo===false;dirty();renderConfig()}
function togServ(id){const s=D().servicios.find(x=>x.id===id);s.activo=s.activo===false;dirty();renderConfig()}
async function subirLogo(inp){const f=inp.files[0];if(!f)return;try{D().cfg.logoImg=await API.putFoto(await compressImg(f,600,.85));dirty();renderConfig()}catch(e){toast('❌ '+e.message)}}
async function subirYapeQR(inp){const f=inp.files[0];if(!f)return;try{D().cfg.yapeQR=await API.putFoto(await compressImg(f,700,.85));dirty();renderConfig()}catch(e){toast('❌ '+e.message)}}
function addBloqueo(){const f=$('#blF').value;if(!f)return toast('Elige una fecha');D().cfg.bloqueos=[...(D().cfg.bloqueos||[]),{id:uid(),fecha:f,barberoId:$('#blB').value,motivo:$('#blM').value.trim()}];dirty();renderConfig()}
function delBloqueo(id){D().cfg.bloqueos=D().cfg.bloqueos.filter(b=>b.id!==id);dirty();renderConfig()}
function editBarbero(id){const b=id?D().barberos.find(x=>x.id===id):{id:'',nombre:'',esp:'',foto:'',color:COLORES[D().barberos.length%COLORES.length],pin:'',comision:50,dias:[...D().cfg.dias],activo:true};S._b=clone(b);
 openModal(mHead(id?'✏️ Editar barbero':'➕ Nuevo barbero')+`
 <label class="upl"><span class="prev" id="bPrev">${b.foto?`<img data-foto="${b.foto}">`:'💈'}</span><span class="btn sm">📷 Foto del barbero</span><input type="file" accept="image/*" data-on-change="a55f32410"></label>
 <label class="lb">Nombre</label><input class="in" id="bNom" value="${esc(b.nombre)}">
 <label class="lb">Especialidad (se ve en el formulario)</label><input class="in" id="bEsp" value="${esc(b.esp||'')}" placeholder="Ej: Fades y diseños">
 <label class="lb">Correo de Google (para entrar con Google)</label><input class="in" id="bMail" type="email" value="${esc(b.email||'')}" placeholder="ej: jhon@gmail.com">
 <label class="lb">Color en la agenda</label><div class="sws" id="bCol"></div>
 <div class="g2">${API.remote?'':`<div><label class="lb">PIN de acceso</label><input class="in" id="bPin" inputmode="numeric" maxlength="6" value="${esc(b.pin)}" placeholder="4 dígitos"></div>`}<div><label class="lb">Comisión %</label><input class="in" id="bCom" type="number" min="0" max="100" value="${b.comision}"></div></div>
 <label class="lb">Días que trabaja</label><div class="dchips" id="bDias"></div>
 ${accHTML(id&&'b_'+id)}
 <button class="btn p w" style="margin-top:16px;padding:14px" data-on-click="ac48da0da">💾 Listo</button>
 ${id?`<button class="btn r w" style="margin-top:8px" data-on-click="a86516cc0" data-p0="${id}">🗑️ Eliminar barbero</button>`:''}`);bDias();bCol();if(id)accCargar('b_'+id)}
function bDias(){$('#bDias').innerHTML=ORDEN.map(x=>`<button class="dchip ${S._b.dias.includes(x)?'on':''}" data-on-click="a6a5d3cf3" data-p0="${x}" data-p1="${x}" data-p2="${x}">${DIAS[x]}</button>`).join('')}
function bCol(){$('#bCol').innerHTML=COLORES.map(x=>`<button class="swc ${S._b.color===x?'on':''}" style="background:${x}" data-on-click="aa2dbbcdc" data-p0="${x}"></button>`).join('')}
async function fotoBarb(inp){const f=inp.files[0];if(!f)return;try{S._b.foto=await API.putFoto(await compressImg(f,320,.8));$('#bPrev').innerHTML=`<img src="${await API.foto(S._b.foto)}">`}catch(e){toast('❌ '+e.message)}}
function saveBarbero(){const b=S._b;b.nombre=$('#bNom').value.trim();b.esp=$('#bEsp').value.trim();b.pin=API.remote?'':$('#bPin').value.replace(/\D/g,'');b.email=$('#bMail').value.trim().toLowerCase();b.comision=Math.min(100,Math.max(0,+$('#bCom').value||0));
 if(!b.nombre)return toast('Falta el nombre');if(b.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email))return toast('Correo no válido');
 if(!API.remote&&!b.email&&b.pin.length<4)return toast('Pon un correo de Google o un PIN de al menos 4 dígitos');if(b.pin&&b.pin.length<4)return toast('El PIN debe tener al menos 4 dígitos');
 if(b.pin&&(b.pin===D().cfg.adminPin||D().barberos.some(x=>x.id!==b.id&&x.pin===b.pin)||(D().usuarios||[]).some(x=>x.pin===b.pin)))return toast('Ese PIN ya está en uso');
 if(b.email&&[...D().barberos.filter(x=>x.id!==b.id).map(x=>x.email),...(D().usuarios||[]).map(x=>x.email)].includes(b.email))return toast('Ese correo ya lo usa otra persona');
 if(b.id){const i=D().barberos.findIndex(x=>x.id===b.id);D().barberos[i]=b}else{b.id='b'+uid();D().barberos.push(b)}closeModal();dirty();renderConfig()}
function delBarbero(id){const fut=S.citas.filter(c=>c.barberoId===id&&c.fecha>=hoy()&&activa(c)).length;if(!confirm(fut?`Tiene ${fut} cita(s) próximas. Mejor desactívalo con el interruptor. ¿Eliminar igual?`:'¿Eliminar este barbero?'))return;D().barberos=D().barberos.filter(b=>b.id!==id);closeModal();dirty();renderConfig()}
function editServicio(id){const s=id?D().servicios.find(x=>x.id===id):{id:'',emoji:'✂️',nombre:'',precio:25,desc:'',foto:'',activo:true};S._s=clone(s);
 openModal(mHead(id?'✏️ Editar servicio':'➕ Nuevo servicio')+`
 <label class="upl"><span class="prev" id="sPrev">${s.foto?`<img data-foto="${s.foto}">`:s.emoji}</span><span class="btn sm">📷 Foto de referencia</span><input type="file" accept="image/*" data-on-change="ae7c93562"></label>
 <div class="g2"><div><label class="lb">Emoji</label><input class="in" id="sEmo" value="${esc(s.emoji)}" maxlength="4"></div><div><label class="lb">Precio S/</label><input class="in" id="sPre" type="number" min="0" step="0.5" value="${s.precio}"></div></div>
 <label class="lb">Nombre</label><input class="in" id="sNom" value="${esc(s.nombre)}" placeholder="Ej: Mid Fade">
 <label class="lb">Descripción corta</label><input class="in" id="sDes" value="${esc(s.desc||'')}">
 <button class="btn p w" style="margin-top:16px;padding:14px" data-on-click="ad71daada">💾 Listo</button>
 ${s.foto?`<button class="btn w" style="margin-top:8px" data-on-click="a5cf464b9">Quitar foto</button>`:''}
 ${id?`<button class="btn r w" style="margin-top:8px" data-on-click="ae4d87b13" data-p0="${id}">🗑️ Eliminar servicio</button>`:''}`)}
async function fotoServ(inp){const f=inp.files[0];if(!f)return;try{S._s.foto=await API.putFoto(await compressImg(f,600,.78));$('#sPrev').innerHTML=`<img src="${await API.foto(S._s.foto)}">`}catch(e){toast('❌ '+e.message)}}
function saveServicio(){const s=S._s;s.emoji=$('#sEmo').value.trim()||'✂️';s.nombre=$('#sNom').value.trim();s.precio=Math.max(0,+$('#sPre').value||0);s.desc=$('#sDes').value.trim();if(!s.nombre)return toast('Falta el nombre');
 if(s.id){const i=D().servicios.findIndex(x=>x.id===s.id);D().servicios[i]=s}else{s.id='s'+uid();D().servicios.push(s)}closeModal();dirty();renderConfig()}
function delServicio(id){if(!confirm('¿Eliminar este servicio?'))return;D().servicios=D().servicios.filter(s=>s.id!==id);closeModal();dirty();renderConfig()}
async function guardarConfig(){const d=D();if(!d)return;if(!d.cfg.nombre)return toast('Falta el nombre de la barbería');if(!API.remote&&(d.cfg.adminPin||'').length<4)return toast('El PIN admin debe tener 4+ dígitos');
 if(!slotsDia(d.cfg).length)return toast('⚠️ Revisa el horario: no hay turnos de 1 hora');
 try{await API.saveConfig(d.cfg,d.barberos,d.servicios,d.usuarios);S.draft=null;S.dirty=false;await reload();renderConfig();toast('✅ Configuración guardada')}catch(e){toast('❌ '+e.message)}}
async function exportar(){let data;if(API.remote){try{data=await API.req('GET','/exportar')}catch(e){return toast('❌ '+e.message)}}
 else{data={v:4,usuarios:lsGet('usuarios',[]),fecha:new Date().toISOString(),cfg:lsGet('cfg',{}),barberos:lsGet('barberos',[]),servicios:lsGet('servicios',[]),citas:lsGet('citas',[]),links:lsGet('links',[]),fotos:{}};
  const keys=new Set(JSON.stringify(data).match(/f_[a-z0-9]+/g)||[]);for(const k of keys){const v=await IDB.get(k);if(v)data.fotos[k]=v}}
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,1)],{type:'application/json'}));a.download=`barberia-respaldo-${hoy()}.json`;a.click()}
function importar(inp){const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const d=JSON.parse(r.result);if(!d.cfg||!Array.isArray(d.citas))throw new Error('Archivo no válido');if(!confirm(`¿Reemplazar todo con el respaldo (${d.citas.length} citas)?`))return;
 if(API.remote){toast('⏳ Subiendo respaldo a la nube…');const x=await API.req('POST','/importar',d);S.draft=null;S.dirty=false;API._d=null;await reload();renderConfig();return toast(`✅ ${x.citas} citas y ${x.fotos} fotos en la nube`)}
 if(d.fotos)for(const[k,v]of Object.entries(d.fotos))await IDB.put(k,v);lsSet('cfg',d.cfg);lsSet('barberos',d.barberos||[]);lsSet('servicios',d.servicios||[]);lsSet('citas',d.citas);if(Array.isArray(d.links))lsSet('links',d.links);if(Array.isArray(d.usuarios))lsSet('usuarios',d.usuarios);S.draft=null;S.dirty=false;await reload();renderConfig();toast('✅ Respaldo importado')}catch(e){toast('❌ '+e.message)}};r.readAsText(f)}
async function verAccesos(){try{const r=await API.req('GET','/accesos');
 openModal(mHead('📜 Registro de accesos')+`<p class="hint">Últimos ${r.length} intentos de entrada (Google y PIN).</p>`+(r.length?r.map(x=>`<div class="li"><div class="t"><b>${x.ok?'✅':'❌'} ${esc(x.quien||'—')} <small style="color:var(--mu)">· ${x.via==='google'?'Google':'PIN'}</small></b><small>${new Date(x.ts).toLocaleString('es-PE')} · ${esc(x.motivo||'')}${x.ip?' · '+esc(x.ip):''}</small></div></div>`).join(''):'<div class="empty">Todavía no hay accesos</div>'))}catch(e){toast('❌ '+e.message)}}
async function probarNube(){toast('⏳ Probando…');try{const r=await API.req('GET','/diagnostico');
 const f=(n,x)=>`${x.ok?'✅':'❌'} ${n}: ${x.ok?'funciona':x.error}`;alert([f('Base de datos (D1)',r.db),f('Fotos (R2)',r.fotos),'',r.db.ok?`Citas guardadas: ${r.db.citas} · Links: ${r.db.links}`:'',(r.db.ok&&r.fotos.ok)?'Todo conectado correctamente.':'En Cloudflare: Workers & Pages → tu Worker → Settings → Bindings.'].join('\n').trim())}catch(e){toast('❌ '+e.message)}}
async function cargarDemo(){lsSet('citas',[...lsGet('citas',[]).filter(c=>!c.demo),...demoCitas()]);await reload();toast('🧪 Ejemplos cargados en la Agenda')}
async function borrarTodo(){if(!confirm('¿Borrar TODAS las citas?')||prompt('Escribe BORRAR para confirmar')!=='BORRAR')return;lsSet('citas',[]);await reload();toast('🗑️ Citas borradas')}


/* Campos simples de configuración (sin JavaScript en línea): data-cfg = nombre del campo. */
ACC.cfgTexto=function(){setC(this.dataset.cfg,this.value.trim())};
ACC.cfgNumero=function(){setN(this.dataset.cfg,this.value)};

/* ---------- 🤖 WhatsApp automático (API oficial de Meta) ----------
   Se guarda aparte de la configuración general (el token va cifrado en el servidor y nunca vuelve completo). */
const WA_TPL={recordatorio:'Hola {{1}} 👋 Te recordamos tu cita en {{2}}: {{3}} a las {{4}} con {{5}}. Confirma que vienes o reprograma aquí: {{6}} ¡Te esperamos!',
 confirmacion:'Hola {{1}} ✅ Tu cita en {{2}} está confirmada para {{3}} a las {{4}}. Mira el estado de tu cita aquí: {{5}} ¡Gracias por reservar!'};
async function cargarWA(){const el=$('#waCfg');if(!el)return;let w;try{w=await API.req('GET','/whatsapp/config')}catch(e){el.innerHTML='<p class="hint">❌ '+esc(e.message)+'</p>';return}S._wa=w;
 const ok=w.conectado?.ok,paso=(n,t)=>`<div class="stp"><b>${n}</b><div>${t}</div></div>`,cp=(t,v)=>`<div class="row" style="margin-top:4px"><code style="flex:1;font-size:11px;word-break:break-all;color:var(--tx)">${esc(v)}</code><button class="btn sm" data-on-click="waCopiar" data-p0="${esc(v)}">📋</button></div>`;
 el.innerHTML=`<div class="card" style="padding:12px;border-color:${ok?'#3fb950':'var(--line)'}">${ok?`✅ <b>Conectado</b> · ${esc(w.conectado.numero)} · ${esc(w.conectado.nombre)}${w.conectado.calidad?` · calidad ${esc(w.conectado.calidad)}`:''}`:'⚪ <b>Sin conectar.</b> Mientras tanto, los recordatorios funcionan con un toque (⏰ en la agenda).'}</div>
 <details style="margin-top:10px"><summary class="lb" style="cursor:pointer">📘 Cómo conectar tu número nuevo (una sola vez)</summary>
 ${paso(1,'Compra un chip nuevo: ese número <b>no puede estar en la app de WhatsApp</b> (ni en WhatsApp Business del celular).')}
 ${paso(2,'Entra a <b>developers.facebook.com</b> → <b>Mis apps</b> → <b>Crear app</b> → tipo <b>Empresa</b> → agrega el producto <b>WhatsApp</b>. Te pedirá tu cuenta comercial de Meta (Business).')}
 ${paso(3,'En <b>WhatsApp → Configuración de la API</b>: <b>Agregar número de teléfono</b>, ponle el nombre de la barbería y verifícalo con el código SMS.')}
 ${paso(4,'Copia el <b>Identificador del número de teléfono</b> (Phone number ID) y el <b>Identificador de la cuenta de WhatsApp Business</b> y pégalos abajo.')}
 ${paso(5,'Token permanente: en <b>business.facebook.com → Configuración del negocio → Usuarios del sistema</b> crea uno (Administrador), asígnale la app y genera un token con los permisos <b>whatsapp_business_messaging</b> y <b>whatsapp_business_management</b>. Pégalo abajo.')}
 ${paso(6,'En tu app: <b>Configuración → Básica → Clave secreta de la app</b> (App secret). Pégala abajo.')}
 ${paso(7,`Webhook (para saber si llegó/leyó y recibir los «sí, voy»): <b>WhatsApp → Configuración</b> → URL de devolución de llamada y token de verificación (guarda primero esta sección para que aparezca el token), y suscríbete a <b>messages</b>.${cp('URL',w.webhook)}${w.verifyToken?cp('Token',w.verifyToken):''}`)}
 ${paso(8,`Plantillas: en <b>WhatsApp Manager → Plantillas de mensajes</b> crea 2 de categoría <b>Utilidad</b>, idioma <b>Español</b>:<br><b>${esc(w.tplRecordatorio)}</b>${cp('',WA_TPL.recordatorio)}<b>${esc(w.tplConfirmacion)}</b>${cp('',WA_TPL.confirmacion)}<small>Meta las revisa (minutos u horas). Los nombres deben coincidir con los de abajo.</small>`)}
 ${paso(9,'En <b>WhatsApp Manager</b> agrega un <b>método de pago</b>: Meta cobra cada mensaje de plantilla (centavos de dólar; el precio exacto lo muestra Meta).')}
 </details>
 <div class="g2"><div><label class="lb">Phone number ID</label><input class="in" id="waPhone" inputmode="numeric" value="${esc(w.phoneId)}"></div><div><label class="lb">WhatsApp Business Account ID</label><input class="in" id="waWaba" inputmode="numeric" value="${esc(w.wabaId)}"></div></div>
 <label class="lb">Token de acceso ${w.tokenEnCloudflare?'(definido como secreto en Cloudflare)':''}</label><input class="in" id="waToken" type="password" autocomplete="off" placeholder="${w.token?'Guardado '+esc(w.token)+' · escribe uno nuevo para cambiarlo':'Pega aquí el token permanente'}">
 <label class="lb">App secret (para verificar el webhook)</label><input class="in" id="waSecreto" type="password" autocomplete="off" placeholder="${w.secreto?'Guardado · escribe uno nuevo para cambiarlo':'Pega aquí la clave secreta de la app'}">
 <div class="g2"><div><label class="lb">Plantilla de recordatorio</label><input class="in" id="waTplR" value="${esc(w.tplRecordatorio)}"></div><div><label class="lb">Plantilla de confirmación</label><input class="in" id="waTplC" value="${esc(w.tplConfirmacion)}"></div></div>
 <div class="g2"><div><label class="lb">Idioma de las plantillas</label><input class="in" id="waIdi" value="${esc(w.idioma)}"></div><div><label class="lb">Versión de la API</label><input class="in" id="waVer" value="${esc(w.version)}"></div></div>
 <label class="lb">Envíos automáticos</label>
 <label class="chk"><input type="checkbox" id="waA1" ${w.auto.diaAntes?'checked':''}><span>Recordar <b>el día anterior</b> desde las <input class="in" id="waH1" type="time" value="${esc(w.auto.horaDiaAntes)}" style="width:110px;display:inline-block;padding:6px"></span></label>
 <label class="chk"><input type="checkbox" id="waA2" ${w.auto.dosHoras?'checked':''}><span>Recordar <b>2 horas antes</b></span></label>
 <label class="chk"><input type="checkbox" id="waA3" ${w.auto.alConfirmar?'checked':''}><span>Avisar <b>«cita confirmada»</b> cuando se valida el Yape de una reserva web</span></label>
 <button class="btn p w" style="margin-top:12px" data-on-click="waGuardar">💾 Guardar WhatsApp</button>
 <div class="g2" style="margin-top:8px"><button class="btn" data-on-click="waProbar">🔌 Probar conexión</button><button class="btn" data-on-click="waPrueba">📱 Mensaje de prueba</button></div>
 ${ok||w.token?`<button class="btn r w" style="margin-top:8px" data-on-click="waDesconectar">Desconectar</button>`:''}
 <p class="hint">Solo se envían recordatorios a citas <b>confirmadas</b>, una vez por cita. Si el cliente responde «sí» o «voy», su cita queda como <b>👍 Confirmó</b>.</p>`;hydrate(el)}
ACC.waCopiar=function(){copiar(this.dataset.p0)};
ACC.waGuardar=async function(){const v=id=>$('#'+id).value.trim();this.disabled=true;
 try{await API.req('PUT','/whatsapp/config',{phoneId:v('waPhone'),wabaId:v('waWaba'),token:v('waToken'),secreto:v('waSecreto'),tplRecordatorio:v('waTplR'),tplConfirmacion:v('waTplC'),idioma:v('waIdi'),version:v('waVer'),auto:{diaAntes:$('#waA1').checked,horaDiaAntes:v('waH1'),dosHoras:$('#waA2').checked,alConfirmar:$('#waA3').checked}});toast('✅ WhatsApp guardado');await cargarWA()}catch(e){toast('❌ '+e.message)}this.disabled=false};
ACC.waProbar=async function(){this.disabled=true;try{const r=await API.req('POST','/whatsapp/probar',{});toast(`✅ Conectado: ${r.numero} · ${r.nombre}`);await cargarWA();reload()}catch(e){toast('❌ '+e.message)}this.disabled=false};
ACC.waPrueba=async function(){const t=prompt('¿A qué celular envío el mensaje de prueba? (debe estar en tu lista de números de prueba de Meta mientras la app esté en desarrollo)');if(!t)return;
 try{await API.req('POST','/whatsapp/probar',{tel:t});toast('📱 Mensaje de prueba enviado (plantilla hello_world)');await cargarWA()}catch(e){toast('❌ '+e.message)}};
ACC.waDesconectar=async function(){if(!confirm('¿Desconectar WhatsApp automático? Se borran el token y la clave guardados y se apagan los envíos.'))return;try{await API.req('POST','/whatsapp/desconectar',{});toast('Desconectado');await cargarWA();reload()}catch(e){toast('❌ '+e.message)}};
