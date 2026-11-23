/* =================== APP INSTALABLE (PWA) ===================
   · Registra el service worker (/sw.js, con la versión de cada despliegue: worker/app.js).
   · Versión nueva lista → aviso «Hay una versión nueva · Actualizar». Si la app pasa a segundo plano
     sin cambios por guardar, se aplica sola (nunca corta lo que estás haciendo).
   · «Instalar app»: Android y PC con el aviso del navegador; iPhone con instrucciones (Compartir → Agregar a inicio).
   ============================================================ */
const APP={reg:null,espera:null,instalar:null,aplicando:false,recargando:false};
const instalada=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const esIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const puedeInstalar=()=>API.remote&&!instalada()&&(!!APP.instalar||esIOS());
addEventListener('beforeinstallprompt',e=>{e.preventDefault();APP.instalar=e});
addEventListener('appinstalled',()=>{APP.instalar=null;toast('✅ App instalada: búscala en tu pantalla de inicio')});
function avisarVersion(w){APP.espera=w;if($('#nuevaVer'))return;
 document.body.insertAdjacentHTML('beforeend',`<div class="nuevaver" id="nuevaVer" role="status"><span>✨ Hay una versión nueva del panel</span><button class="btn sm p" data-on-click="appActualizar">Actualizar</button></div>`)}
const aplicarVersion=()=>{if(!APP.espera)return;APP.aplicando=true;APP.espera.postMessage('actualizar')};
async function iniciarApp(){if(!('serviceWorker' in navigator)||!API.remote)return;
 // Solo se recarga cuando se aplica una versión nueva (la primera instalación toma el control sin recargar).
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!APP.aplicando||APP.recargando)return;APP.recargando=true;location.reload()});
 try{const reg=APP.reg=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
  const vigilar=w=>{if(!w)return;const listo=()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)avisarVersion(w)};listo();w.addEventListener('statechange',listo)};
  vigilar(reg.waiting);reg.addEventListener('updatefound',()=>vigilar(reg.installing));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});else if(APP.espera&&!S.dirty)aplicarVersion()});
  setInterval(()=>reg.update().catch(()=>{}),30*60e3)}catch(e){}}
ACC.appActualizar=function(){if(S.dirty&&!confirm('Tienes cambios sin guardar en Config. ¿Actualizar igual?'))return;this.disabled=true;aplicarVersion()};
/* Instalar: el aviso del navegador si existe; en iPhone, los pasos (Apple no deja instalar con un botón). */
ACC.appInstalar=async function(){closeModal();
 if(APP.instalar){APP.instalar.prompt();const r=await APP.instalar.userChoice.catch(()=>null);APP.instalar=null;if(r?.outcome!=='accepted')toast('Puedes instalarla cuando quieras desde ☰ Menú');return}
 openModal(mHead('📲 Instalar en tu iPhone')+`<div class="stp"><b>1</b><div><b>Abre esta página en Safari</b><p class="hint" style="margin-top:2px">No dentro de WhatsApp ni Instagram.</p></div></div>
 <div class="stp"><b>2</b><div><b>Toca Compartir</b><p class="hint" style="margin-top:2px">El cuadrado con la flecha hacia arriba (abajo en la pantalla).</p></div></div>
 <div class="stp"><b>3</b><div><b>«Agregar a inicio»</b><p class="hint" style="margin-top:2px">Baja en la lista si no lo ves. Luego toca <b>Agregar</b>.</p></div></div>
 <p class="hint">Listo: el ícono de Stereo queda en tu pantalla de inicio y abre el panel a pantalla completa.</p>`)};
