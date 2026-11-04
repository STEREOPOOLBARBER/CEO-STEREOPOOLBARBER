/* =================== 📷 ESCANEAR EL QR DE LA CITA ===================
   El cliente muestra el QR de su página de estado (estado.html?c=CODIGO). Aquí la cámara lo lee y se abre
   la tarjeta de esa cita, lista para «Pasar a silla».
   · Android / Chrome: BarcodeDetector del navegador.
   · iPhone / Safari (no lo tiene): vendor/jsqr.min.js, que se carga solo la primera vez que hace falta.
   · Sin cámara o sin permiso: se escribe el código a mano.
   El barbero solo encuentra sus propias citas: lo decide el Worker en /citas/buscar.
   ===================================================================== */
const codigoDeQR=t=>{const s=String(t||'').trim(),m=s.match(/[?&]c=([A-Za-z0-9]{6})(?:[&#]|$)/)||s.match(/^([A-Za-z0-9]{6})$/);return m?m[1].toUpperCase():''};
const ESC={st:null,t:null,leer:null};
function pararCamara(){clearTimeout(ESC.t);ESC.st?.getTracks().forEach(x=>x.stop());ESC.st=null;ESC.leer=null}
async function lectorQR(){
 if('BarcodeDetector' in window){try{if((await BarcodeDetector.getSupportedFormats()).includes('qr_code')){const d=new BarcodeDetector({formats:['qr_code']});return async v=>(await d.detect(v))[0]?.rawValue||''}}catch(_){}}
 await loadScript(JSQR_SRC);const c=document.createElement('canvas'),x=c.getContext('2d',{willReadFrequently:true});
 return async v=>{const w=Math.min(640,v.videoWidth),h=Math.round(v.videoHeight*w/v.videoWidth);if(!w||!h)return'';c.width=w;c.height=h;x.drawImage(v,0,0,w,h);return jsQR(x.getImageData(0,0,w,h).data,w,h,{inversionAttempts:'dontInvert'})?.data||''}}
async function abrirEscaner(){
 openModal(mHead('📷 Escanear la cita')+`<div class="esc" id="escCaja"><video id="escV" playsinline muted></video><i></i></div><p class="hint" id="escMsg" style="text-align:center">Apunta al QR que el cliente tiene en su celular.</p>
 <div class="row" style="gap:8px;margin-top:8px"><input class="in" id="escCod" maxlength="6" autocomplete="off" placeholder="O escribe el código" style="text-transform:uppercase;letter-spacing:.15em" data-on-keydown="escTecla"><button class="btn p" data-on-click="escBuscar">Buscar</button></div>`);
 S.alCerrar=pararCamara;
 if(!navigator.mediaDevices?.getUserMedia){$('#escCaja').remove();$('#escMsg').textContent='Este navegador no deja usar la cámara: escribe el código.';return}
 try{ESC.st=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});const v=$('#escV');if(!v){pararCamara();return}
  v.srcObject=ESC.st;await v.play();ESC.leer=await lectorQR();
  const ciclo=async()=>{if(!ESC.leer||!$('#escV'))return;let txt='';try{txt=await ESC.leer(v)}catch(_){}const cod=codigoDeQR(txt);
   if(cod){navigator.vibrate?.(80);return buscarCita(cod)}if(txt)$('#escMsg').textContent='Ese QR no es de una cita.';ESC.t=setTimeout(ciclo,200)};ciclo()}
 catch(e){pararCamara();$('#escCaja')?.remove();$('#escMsg').textContent=e.name==='NotAllowedError'?'❌ Permite la cámara en tu navegador (candado junto a la dirección) o escribe el código.':'❌ No se pudo abrir la cámara: escribe el código.'}}
/* Abre la cita del código: primero en lo que ya tiene el panel y si no, en la base de datos. */
async function buscarCita(cod){pararCamara();closeModal();
 let c=S.citas.find(x=>x.codigo===cod&&mine(x));
 if(!c&&API.remote){try{const r=await API.req('GET','/citas/buscar?q='+encodeURIComponent(cod)+'&limit=5');mezclar(r.items);c=r.items.find(x=>x.codigo===cod)}catch(e){return toast('⚠️ '+e.message)}}
 if(!c)return toast('🔎 No encontré la cita '+cod+' (o no es tuya)');
 if(S.tab!=='agenda')goTab('agenda');irACita(c.id);toast(`✅ ${c.cliente?.nombre||'Cita'} · ${h12(c.hora)}`)}
ACC.abrirEscaner=function(){abrirEscaner()};
ACC.escBuscar=function(){const cod=codigoDeQR($('#escCod').value);if(!cod)return toast('El código tiene 6 letras o números');buscarCita(cod)};
ACC.escTecla=function(event){if(event.key==='Enter')ACC.escBuscar.call(this)};
