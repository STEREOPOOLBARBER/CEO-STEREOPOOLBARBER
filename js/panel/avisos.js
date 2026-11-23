/* =================== 🔔 AVISOS EN ESTE CELULAR (Web Push) ===================
   Cada persona activa los avisos en su aparato: nueva reserva, comprobante de Yape, confirmó que viene,
   reprogramó (el barbero, solo sus citas). El servidor decide a quién avisar (worker/modulos/push.js).
   iPhone: solo con la app instalada en la pantalla de inicio. Al cerrar sesión se apagan en este aparato.
   ===================================================================== */
const pushSoportado=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const b64uBytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
async function pushRegistro(){return APP.reg||await navigator.serviceWorker.getRegistration('/')||await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'})}
async function pushActual(){if(!pushSoportado())return null;const reg=await navigator.serviceWorker.getRegistration('/');return reg?await reg.pushManager.getSubscription():null}
async function abrirAvisos(){openModal(mHead('🔔 Avisos en este celular')+'<div class="spin"></div>');
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent),sub=await pushActual().catch(()=>null),activos=!!sub&&lsGet('avisos',0)===S.ses?.pid;
 let cuerpo;
 if(!pushSoportado())cuerpo=ios&&!instalada()?`<div class="banner">📲 En iPhone los avisos solo funcionan con la app instalada. Instálala desde ☰ Menú → «Instalar la app» y vuelve aquí desde el ícono.</div>`:`<div class="banner">⚠️ Este navegador no permite avisos. Prueba con Chrome, Edge, Firefox o Safari actualizado.</div>`;
 else if(Notification.permission==='denied')cuerpo=`<div class="banner">🚫 Bloqueaste los avisos para este sitio. Actívalos en la configuración del navegador (candado junto a la dirección → Notificaciones) y vuelve aquí.</div>`;
 else cuerpo=activos?`<div class="card"><b>✅ Avisos activados</b><p class="hint" style="margin:4px 0 0">Te llegarán aunque el panel esté cerrado.</p></div>
  <button class="btn w" style="padding:14px;margin-bottom:8px" data-on-click="avisosProbar">📨 Enviarme un aviso de prueba</button>
  <button class="btn r w" style="padding:14px" data-on-click="avisosApagar">🔕 Apagar en este celular</button>`
  :`<button class="btn p w" style="padding:14px" data-on-click="avisosActivar">🔔 Activar avisos</button>`;
 $('#mbody').innerHTML=mHead('🔔 Avisos en este celular')+`<p class="hint" style="margin-top:0">Te avisamos al momento de: <b>nueva reserva</b>, <b>comprobante de Yape</b>${can('yape')?'':' (si tienes permiso de Yape)'}, <b>cliente confirmó que viene</b> y <b>reprogramó</b>${can('verTodas')?'':' — solo de tus citas'}. Los avisos no muestran el celular ni el DNI.</p>${cuerpo}`}
async function avisosActivar(btn){btn.disabled=true;
 try{if(await Notification.requestPermission()!=='granted'){btn.disabled=false;return abrirAvisos()}
  const reg=await pushRegistro();await navigator.serviceWorker.ready;const{clave}=await API.req('GET','/push/clave');
  const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uBytes(clave)});
  await API.req('POST','/push',sub.toJSON());lsSet('avisos',S.ses.pid);toast('✅ Avisos activados');abrirAvisos()}
 catch(e){btn.disabled=false;toast('❌ '+e.message)}}
/* Al cerrar sesión o apagar: el servidor deja de avisar a este aparato (el navegador conserva el permiso). */
async function pushQuitarAparato(){try{const sub=await pushActual();if(sub&&API.remote)await API.req('DELETE','/push',sub.toJSON())}catch(e){}lsSet('avisos',0)}
ACC.abrirAvisos=function(){abrirAvisos()};
ACC.avisosActivar=function(){avisosActivar(this)};
ACC.avisosApagar=async function(){await pushQuitarAparato();toast('🔕 Avisos apagados en este celular');abrirAvisos()};
ACC.avisosProbar=async function(){this.disabled=true;try{const r=await API.req('POST','/push/probar',{});toast(r.enviados?'📨 Enviado: debería llegarte en segundos':'⚠️ No se pudo enviar. Apaga y vuelve a activar.')}catch(e){toast('❌ '+e.message)}this.disabled=false};
