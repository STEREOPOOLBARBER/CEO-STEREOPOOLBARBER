/* =================== VOZ DEL NARRADOR (panel · ⚙️ Config → Narrador) ===================
   El dueño graba (o sube) su voz para cada trozo del guion de js/voz.js y para las piezas de fecha y hora.
   · Solo habla lo grabado: lo que no tiene audio sale únicamente en el globo de texto.
   · Todo se convierte a WAV mono 16 kHz (aWav), sin silencios al inicio ni al final y con volumen parejo:
     es el formato que leen todos los navegadores (iPhone incluido). El servidor solo acepta WAV.
   · Guion guiado: una frase o pieza por pantalla, con «Siguiente →».
   ===================================================================== */
const NAUDIO_MAX=25;let REC=null;
const audiosVoz=()=>D().cfg.narrAudio||(D().cfg.narrAudio={});
/* Lo que se graba: las frases del guion o las piezas de fecha y hora (las horas salen del horario configurado). */
const horasVoz=()=>slotsDia(D().cfg);
function listaVoz(tipo){if(tipo==='frases')return VOZ.grabables().map(x=>({clave:x.clave,texto:x.texto,et:x.momento}));
 return[...VOZ.PIEZAS_FECHA.map(([k,t])=>({clave:k,texto:t,et:k.startsWith('f_d_')?'📅 Número del día':k.startsWith('f_m_')?'📅 Mes':k.startsWith('f_dow_')?'📅 Día de la semana':'📅 Fecha'})),
  ...horasVoz().map(h=>({clave:VOZ.claveHora(h),texto:VOZ.textoHora(h),et:'⏰ Hora · '+h12(h)}))]}
const hechasVoz=tipo=>listaVoz(tipo).filter(x=>audiosVoz()[x.clave]).length;

/* ---------- sección de Config ---------- */
function vozHTML(c){const fr=listaVoz('frases'),fh=listaVoz('fechas'),nf=hechasVoz('frases'),nh=hechasVoz('fechas'),faltanHoras=horasVoz().filter(h=>!audiosVoz()[VOZ.claveHora(h)]);
 const trozo=t=>t.tipo==='fecha'?'<span class="pill">📅 fecha</span>':t.tipo==='hora'?'<span class="pill">⏰ hora</span>':'';
 return `<div class="banner pu" style="margin-top:14px">🎙️ <b>Solo habla tu voz grabada.</b> Lo que no grabes sale solo en el globo de texto. Graba sin nombres ni precios: la fecha y la hora se arman solas con las piezas que grabes una por una («el» + «sábado» + «veinticinco» + «de octubre» + «a las diez de la mañana»).</div>
 <div class="g2" style="margin-top:12px"><button class="btn p" style="padding:14px;flex-direction:column;gap:2px" data-on-click="vozGuion" data-p0="frases">🎬 Frases<br><small>${nf} de ${fr.length}</small></button><button class="btn p" style="padding:14px;flex-direction:column;gap:2px" data-on-click="vozGuion" data-p0="fechas">📅 Fechas y horas<br><small>${nh} de ${fh.length}</small></button></div>
 ${faltanHoras.length&&nh?`<p class="hint" style="color:var(--yel)">⏰ Faltan grabar ${faltanHoras.length} hora${faltanHoras.length>1?'s':''} de tu horario: ${faltanHoras.map(h12).join(', ')}.</p>`:''}
 <label class="lb" style="margin-top:18px">Frases (lo que dice en cada paso y según el estado de la cita)</label>
 ${VOZ.MOMENTOS.map(([k,t])=>`<label class="lb">${t}</label><textarea class="in" id="tn_${k}" rows="2" data-on-change="aaff98a67" data-p0="${k}">${esc(c.narr[k])}</textarea><div class="vars">${NVARS.map(v=>`<button data-on-click="ae92c8d5e" data-p0="${k}" data-p1="${v}">{${v}}</button>`).join('')}<button style="color:var(--mu)" data-on-click="a9c14d532" data-p0="${k}" data-p1="${k}">↺</button></div>
  <div class="vozt">🗣️ Voz: ${VOZ.trozos(k).map(x=>x.tipo==='grab'?`«${esc(x.texto)}»`:trozo(x)).join(' + ')}</div>
  ${VOZ.trozos(k).filter(x=>x.tipo==='grab').map(x=>`<div class="row" style="gap:6px;margin:6px 0 14px;flex-wrap:wrap"><button class="btn sm" data-rec="${x.clave}" data-on-click="vozGrabar" data-p0="${x.clave}">🎙️ Grabar mi voz</button><label class="btn sm">⬆️ Subir audio<input type="file" accept="audio/*" style="display:none" data-on-change="vozSubir" data-p0="${x.clave}"></label>${audiosVoz()[x.clave]?`<button class="btn sm" data-on-click="vozOir" data-p0="${x.clave}">▶️ Oír</button><button class="btn sm r" data-on-click="vozQuitar" data-p0="${x.clave}">🗑️</button><span class="pill" style="color:var(--grn);border-color:var(--grn)">🎙️ con tu voz</span>`:'<span class="hint" style="margin:0">Sin voz (solo texto)</span>'}</div>`).join('')}`).join('')}
 <button class="btn w" style="margin-top:8px" data-on-click="vozProbar">▶️ Oír cómo suena «Al elegir hora» (mañana, primer turno)</button>`}

/* ---------- guion guiado ---------- */
function abrirGuion(tipo,i=0){G={tipo,i};openModal('');guionPinta()}
function guionPinta(){if(!G)return;const l=listaVoz(G.tipo),x=l[G.i];if(!x)return closeModal();const ya=!!audiosVoz()[x.clave],n=hechasVoz(G.tipo);
 $('#mbody').innerHTML=mHead(`${G.tipo==='frases'?'🎬 Frases':'📅 Fechas y horas'} · ${G.i+1} de ${l.length}`)+`<div style="height:6px;background:var(--line);border-radius:6px;overflow:hidden"><div style="height:100%;width:${Math.round(n/l.length*100)}%;background:var(--grn)"></div></div>
 <p class="hint" style="margin:8px 0 0">${esc(x.et)} · ${n} de ${l.length} con tu voz</p>
 <div class="card" style="margin:12px 0;text-align:center;padding:26px 16px"><div style="font:800 26px/1.35 'Syne'">${esc(x.texto)}</div></div>
 <p class="hint" style="text-align:center;margin:0 0 12px">Toca <b>Grabar</b>, léelo ${G.tipo==='frases'?'con voz grave y firme':'claro y sin pausa'} (celular a 20 cm, sin ruido) y toca <b>Detener</b>.</p>
 <div class="row" style="gap:8px"><button class="btn p" data-rec="${x.clave}" data-label="🎙️ Grabar" style="flex:2;padding:16px;font-size:17px" data-on-click="vozGrabar" data-p0="${x.clave}">🎙️ Grabar</button>${ya?`<button class="btn" style="flex:1" data-on-click="vozOir" data-p0="${x.clave}">▶️ Oír</button>`:''}</div>
 ${ya?'<p style="text-align:center;color:var(--grn);font-weight:700;margin:10px 0 0">✅ Ya tiene tu voz</p>':''}
 <div class="row" style="gap:8px;margin-top:14px"><button class="btn" style="flex:1" data-on-click="vozIr" data-p0="-1" ${G.i?'':'disabled'}>← Anterior</button><button class="btn g" style="flex:1" data-on-click="vozIr" data-p0="1">${G.i<l.length-1?'Siguiente →':'Terminar ✔'}</button></div>`}
function guionIr(d){if(!G)return;try{REC?.mr.stop()}catch(_){}const n=G.i+d,l=listaVoz(G.tipo);if(n>=l.length){closeModal();renderConfig();return toast('🎉 Listo · toca «Guardar cambios»')}if(n<0)return;G.i=n;setTimeout(guionPinta,REC?500:0)}

/* ---------- grabar, subir y convertir a WAV ---------- */
/* Cualquier audio (grabación o archivo) → WAV mono 16 kHz, sin silencios en los bordes y con volumen parejo. */
async function aWav(blob){const ab=await blob.arrayBuffer(),AC=window.AudioContext||window.webkitAudioContext,OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext,ctx=new AC();
 const buf=await new Promise((ok,no)=>{const r=ctx.decodeAudioData(ab,ok,no);r?.then?.(ok,no)}).catch(()=>{throw new Error('No pude leer ese audio. Prueba con otro archivo o grábalo aquí.')});ctx.close?.();
 const sr=16000,len=Math.max(1,Math.floor(Math.min(buf.duration,NAUDIO_MAX)*sr)),off=new OAC(1,len,sr),src=off.createBufferSource();src.buffer=buf;src.connect(off.destination);src.start();
 const d=(await new Promise((ok,no)=>{const r=off.startRendering();r?.then?.(ok,no);off.oncomplete=e=>ok(e.renderedBuffer)})).getChannelData(0);
 let a=0,z=d.length-1;const um=.015;while(a<z&&Math.abs(d[a])<um)a++;while(z>a&&Math.abs(d[z])<um)z--;a=Math.max(0,a-Math.floor(sr*.06));z=Math.min(d.length-1,z+Math.floor(sr*.12));
 const x=d.slice(a,z+1);let pk=0;for(let i=0;i<x.length;i++)pk=Math.max(pk,Math.abs(x[i]));const g=pk>.01?Math.min(8,.92/pk):1;
 const v=new DataView(new ArrayBuffer(44+x.length*2)),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
 w(0,'RIFF');v.setUint32(4,36+x.length*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,x.length*2,true);
 for(let i=0;i<x.length;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,x[i]*g))*32767,true);
 return new Blob([v],{type:'audio/wav'})}
function marcarRec(k,on){document.querySelectorAll(`[data-rec="${k}"]`).forEach(b=>{b.textContent=on?'⏹️ Detener':(b.dataset.label||'🎙️ Grabar mi voz');b.classList.toggle('r',on)})}
async function grabarVoz(k){
 if(REC){const mismo=REC.k===k;REC.mr.stop();if(mismo)return;await new Promise(r=>setTimeout(r,400))}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('Este navegador no puede grabar: usa «Subir audio»');
 try{const st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  const mt=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(x=>MediaRecorder.isTypeSupported?.(x))||'',mr=new MediaRecorder(st,mt?{mimeType:mt}:{}),ch=[],t0=Date.now();
  mr.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data)};
  mr.onstop=async()=>{clearInterval(REC?.t);st.getTracks().forEach(x=>x.stop());REC=null;marcarRec(k,false);await guardarVoz(k,new Blob(ch,{type:mr.mimeType||mt||'audio/webm'}))};
  REC={k,mr,t:setInterval(()=>{const s=(Date.now()-t0)/1000;document.querySelectorAll(`[data-rec="${k}"]`).forEach(b=>b.textContent=`⏹️ Detener · ${Math.floor(s)} s`);if(s>=NAUDIO_MAX)mr.stop()},250)};
  mr.start();marcarRec(k,true);toast('🎙️ Grabando… léelo y toca Detener')}
 catch(e){toast(e.name==='NotAllowedError'?'❌ Permite el micrófono en tu navegador':'❌ No se pudo grabar: '+e.message)}}
async function guardarVoz(k,blob){toast('⏳ Procesando audio…');
 try{const w=await aWav(blob),data=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(w)});
  audiosVoz()[k]=await API.putAudio(data);dirty();if(G&&$('#mbody [data-rec]'))guionPinta();else renderConfig();toast('✅ Audio listo · toca «Guardar cambios»')}
 catch(e){toast('❌ '+(e.message||'No se pudo procesar el audio'))}}
/* Oír una o varias piezas seguidas (como las oirá el cliente). */
async function oirVoz(claves){const keys=claves.map(k=>audiosVoz()[k]).filter(Boolean);if(!keys.length)return toast('Aún no hay audio grabado');
 try{for(const k of keys){const a=new Audio(await API.audioUrl(k));await new Promise(ok=>{a.onended=ok;a.onerror=ok;a.play().catch(ok)})}}catch(e){toast('❌ '+e.message)}}
ACC.vozGrabar=function(){grabarVoz(this.dataset.p0)};
ACC.vozSubir=function(){const f=this.files[0];if(f)guardarVoz(this.dataset.p0,f);this.value=''};
ACC.vozOir=function(){oirVoz([this.dataset.p0])};
ACC.vozQuitar=function(){if(!confirm('¿Quitar tu audio? Esa parte quedará sin voz (solo el texto).'))return;delete audiosVoz()[this.dataset.p0];dirty();renderConfig()};
ACC.vozGuion=function(){abrirGuion(this.dataset.p0)};
ACC.vozIr=function(){guionIr(+this.dataset.p0)};
ACC.vozProbar=function(){const h=horasVoz()[0];oirVoz(VOZ.claves('hora',{fecha:addD(hoy(),1),hora:h,hoy:hoy()}))};
