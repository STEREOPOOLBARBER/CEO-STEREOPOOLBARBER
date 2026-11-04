/* =====================================================================
   ESCENA PÚBLICA · pantalla de carga + narrador + voz grabada.
   La comparten el formulario (reservar.html) y el estado de la cita (estado.html). Usa js/voz.js.

   Flujo: la página carga con el logo → «Toca para entrar» → ese primer toque habilita el sonido
   (los navegadores, sobre todo iPhone, solo dejan sonar tras un toque) → el logo se derrite →
   el narrador saluda con la voz grabada. Nunca usa la voz del celular: sin grabación, solo el globo.

   Sonido en todos los celulares:
   · Web Audio (AudioContext) se desbloquea dentro del toque y las piezas (frase + fecha + hora) se
     encadenan sin cortes. En iPhone se pide sesión de audio «playback» (iOS 17+) para que suene
     aunque el teléfono esté en silencio.
   · Sin Web Audio (navegadores muy antiguos): un <audio> desbloqueado en el mismo toque.
   · Las grabaciones son WAV (el panel las convierte al grabar): todos los navegadores las leen.

   Uso desde la página:
     Escena.iniciar({cfg, hoy, audio:clave=>Promise<ArrayBuffer>, foto:clave=>Promise<url>})
     Escena.decir(momento, variables, {fecha, hora})   // globo + voz
     Escena.pie(conPie)                                  // sube al narrador si hay botones abajo
   ===================================================================== */
const Escena=(()=>{
 const $=s=>document.querySelector(s);
 const guardado=(k,d)=>{try{const v=localStorage.getItem('brb_'+k);return v==null?d:JSON.parse(v)}catch(e){return d}};
 const guardar=(k,v)=>{try{localStorage.setItem('brb_'+k,JSON.stringify(v))}catch(e){}};
 const escH=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const plantilla=(s,v)=>String(s||'').replace(/\{(\w+)\}/g,(m,k)=>k in v?v[k]:m).replace(/\s+([,.!?])/g,'$1').trim();
 const IMG={narr:'img/narrador.webp',logo:'img/logo-stereo.webp',drip:'img/logo-derretido.webp'};
 const E={cfg:null,hoy:()=>'',audio:null,foto:async()=>'',entrado:false,quiereEntrar:false,pendiente:null};

 /* =================== VOZ GRABADA =================== */
 const R={ctx:null,el:null,listo:false,turno:0,fuentes:[],datos:new Map(),bufs:new Map(),mudo:guardado('narrMudo',false),porSonar:null};
 const SILENCIO='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=';
 /* Se llama dentro de un toque: es la única forma de que el navegador deje sonar después. */
 function desbloquear(){if(R.listo)return;
  try{if('audioSession' in navigator)navigator.audioSession.type='playback'}catch(_){}
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){try{R.ctx=new AC();R.ctx.resume?.();const s=R.ctx.createBufferSource();s.buffer=R.ctx.createBuffer(1,1,22050);s.connect(R.ctx.destination);s.start(0)}catch(_){R.ctx=null}}
  if(!R.ctx){R.el=new Audio();R.el.src=SILENCIO;R.el.play()?.catch(()=>{})}
  R.listo=true;if(R.porSonar){const p=R.porSonar;R.porSonar=null;sonar(p.claves,p.fin)}}
 ['pointerup','touchend','click','keydown'].forEach(t=>addEventListener(t,desbloquear,{capture:true,passive:true}));
 const datos=k=>{if(!R.datos.has(k))R.datos.set(k,E.audio(k).catch(e=>{R.datos.delete(k);throw e}));return R.datos.get(k)};
 const decodificar=ab=>new Promise((ok,no)=>{const p=R.ctx.decodeAudioData(ab.slice(0),ok,no);p?.then?.(ok,no)});
 const buffer=k=>{if(!R.bufs.has(k))R.bufs.set(k,datos(k).then(decodificar).catch(e=>{R.bufs.delete(k);throw e}));return R.bufs.get(k)};
 const aTiempo=(p,ms)=>Promise.race([p,new Promise(r=>setTimeout(()=>r(null),ms))]).catch(()=>null);
 function callar(){R.turno++;R.porSonar=null;R.fuentes.forEach(s=>{try{s.stop()}catch(_){}});R.fuentes=[];if(R.el){R.el.pause();R.el.onended=null}}
 /* Suena una lista de claves de audio una tras otra (frase + fecha + hora). fin() avisa al terminar. */
 async function sonar(claves,fin){callar();const t=R.turno,listo=()=>{if(t===R.turno)fin?.()};
  if(!claves.length||R.mudo)return listo();
  if(!R.listo){R.porSonar={claves,fin};return}
  if(R.ctx){const bs=(await Promise.all(claves.map(k=>aTiempo(buffer(k),6000)))).filter(Boolean);if(t!==R.turno)return;if(!bs.length)return listo();
   if(R.ctx.state!=='running')await R.ctx.resume().catch(()=>{});if(t!==R.turno)return;
   let at=R.ctx.currentTime+.05;bs.forEach((b,i)=>{const s=R.ctx.createBufferSource();s.buffer=b;s.connect(R.ctx.destination);s.start(at);at+=b.duration+.05;R.fuentes.push(s);if(i===bs.length-1)s.onended=listo});return}
  for(const k of claves){const ab=await aTiempo(datos(k),6000);if(t!==R.turno)return;if(!ab)continue;
   const url=URL.createObjectURL(new Blob([ab],{type:'audio/wav'}));await new Promise(ok=>{R.el.onended=ok;R.el.onerror=ok;R.el.src=url;R.el.play()?.catch(ok)});URL.revokeObjectURL(url);if(t!==R.turno)return}
  listo()}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)callar()});

 /* =================== PANTALLA DE CARGA =================== */
 const SPL={drawn:false,done:false,dpr:Math.min(2,window.devicePixelRatio||1),img:null,drip:null};
 const cargarImg=src=>new Promise(res=>{if(!src)return res(null);const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src});
 /* convierte el fondo negro del logo en transparente para que solo caiga el dorado */
 function alfa(img){if(!img)return null;try{const c=document.createElement('canvas');c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;const x=c.getContext('2d');if(!x)return img;x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height),p=d.data;for(let i=0;i<p.length;i+=4){const m=Math.max(p[i],p[i+1],p[i+2]);p[i+3]=Math.min(255,Math.max(0,(m-18)*4))}x.putImageData(d,0,0);return c}catch(e){return img}}
 function rectFor(img,W,H){const w=Math.min(W*.88,470*SPL.dpr),h=w*img.height/img.width,hh=Math.min(h,H*.55),ww=hh*img.width/img.height;return[(W-ww)/2,(H-hh)/2-H*.04,ww,hh]}
 function dibujar(){const c=$('#spc');if(!c||SPL.done)return;const x=c.getContext('2d'),W=c.width,H=c.height;if(!x){SPL.drawn=true;return}x.clearRect(0,0,W,H);
  if(SPL.img?.width)x.drawImage(SPL.img,...rectFor(SPL.img,W,H));
  else{const name=(E.cfg?.nombre||'Barbería').toUpperCase();let fs=Math.min(W*.13,90*SPL.dpr);x.font=`800 ${fs}px Syne, serif`;while(x.measureText(name).width>W*.86&&fs>14){fs-=2;x.font=`800 ${fs}px Syne, serif`}
   const g=x.createLinearGradient(0,H/2-fs,0,H/2+fs*.4);g.addColorStop(0,'#fff3b0');g.addColorStop(.45,'#f5c542');g.addColorStop(1,'#a8740b');x.fillStyle=g;x.textAlign='center';x.textBaseline='middle';x.fillText(name,W/2,H/2-H*.04)}
  SPL.drawn=true}
 async function logo(src){const propio=src&&src!==IMG.logo;SPL.img=alfa(await cargarImg(src||IMG.logo));SPL.drip=propio?null:alfa(await cargarImg(IMG.drip));dibujar()}
 function splashInicio(){const sp=$('#splash');if(!sp)return;const c=$('#spc');c.width=innerWidth*SPL.dpr;c.height=innerHeight*SPL.dpr;logo(IMG.logo);
  sp.addEventListener('click',()=>{if(E.cfg)entrar();else{E.quiereEntrar=true;sp.classList.add('espera')}});
  sp.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();sp.click()}})}
 /* El logo se transforma en su versión derretida y cae en gotas (o se desvanece si no hay efecto). */
 function derretir(){const sp=$('#splash');if(!sp)return;SPL.done=true;sp.classList.remove('glow','listo','espera');sp.style.pointerEvents='none';
  const c=$('#spc'),x=c.getContext('2d'),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce||E.cfg?.splashMelt===false||!x||!SPL.drawn){sp.style.opacity='0';setTimeout(()=>sp.remove(),550);return}
  const W=c.width,H=c.height,morph=SPL.drip&&SPL.img?650:0,t0=performance.now();
  (function mf(now){const t=now-t0;if(morph){const k=Math.min(1,t/morph);x.clearRect(0,0,W,H);x.globalAlpha=1-k;x.drawImage(SPL.img,...rectFor(SPL.img,W,H));x.globalAlpha=k;const r=rectFor(SPL.drip,W,H);x.drawImage(SPL.drip,r[0],r[1]+k*H*.015,r[2],r[3]*(1+k*.04));x.globalAlpha=1}
   if(t<morph+250)requestAnimationFrame(mf);else caer()})(t0);
  function caer(){const snap=document.createElement('canvas');snap.width=W;snap.height=H;snap.getContext('2d').drawImage(c,0,0);
   const sw=Math.max(2,Math.round(3*SPL.dpr)),cols=Math.ceil(W/sw),del=[];let n=Math.random()*8;
   for(let i=0;i<cols;i++){n+=(Math.random()-.5)*1.8;n=Math.max(0,Math.min(16,n));del.push(n*22+Math.random()*25)}
   sp.style.backgroundColor='rgba(0,0,0,0)';const s0=performance.now(),END=1700;
   (function fr(now){const t=now-s0;x.clearRect(0,0,W,H);x.globalAlpha=Math.max(0,1-Math.max(0,t-900)/800);
    for(let i=0;i<cols;i++){const tt=Math.max(0,t-del[i])/1000,dy=tt*tt*H*1.6;if(dy>=H)continue;x.drawImage(snap,i*sw,0,sw,H,i*sw,dy,sw,H*(1+dy/H*1.4))}
    if(t<END)requestAnimationFrame(fr);else sp.remove()})(s0)}}
 /* Entrar: el toque ya habilitó el sonido; se derrite el logo y el narrador dice lo que estaba esperando. */
 function entrar(){if(E.entrado)return;E.entrado=true;derretir();setTimeout(()=>{const p=E.pendiente;E.pendiente=null;if(p)decir(p.k,p.v,p.cuando)},E.cfg?.splashOn===false?0:700)}

 /* =================== NARRADOR =================== */
 const NR={last:null,pos:guardado('narrPos',null),off:guardado('narrOff',false),hide:null};
 const lleno=()=>!!(E.cfg?.narrOn&&$('#nBub'));
 function colocar(){const el=$('#narr');if(!el)return;const w=innerWidth,h=innerHeight;let x,y;
  if(NR.pos){x=Math.min(Math.max(2,NR.pos.x*w),w-96);y=Math.min(Math.max(2,NR.pos.y*h),h-96);el.style.left=x+'px';el.style.top=y+'px';el.style.bottom='auto'}
  else{x=6;y=h-92-16;el.style.left='6px';el.style.top='auto'}
  lado(x,y)}
 /* El globo de texto sale hacia el lado con más espacio y nunca se corta. */
 function lado(x,y){const el=$('#narr'),b=$('#nBub'),w=innerWidth,izq=x-12,der=w-(x+92)-12,rev=izq>der;el.classList.toggle('rev',rev);el.classList.toggle('top',y<170);if(b)b.style.maxWidth=Math.max(130,Math.min(290,rev?izq:der))+'px'}
 function pintarEstado(){const el=$('#narr'),ar=$('#nArm');if(el)el.classList.toggle('off',NR.off);if(ar)ar.style.display=NR.off?'grid':'none';const b=$('#nSp');if(b)b.textContent=R.mudo?'🔇':'🔊'}
 /* Al ocultar al personaje, el toque no debe «atravesarlo» y presionar lo que hay detrás. */
 function tragarClick(){const f=e=>{e.stopPropagation();e.preventDefault()};addEventListener('click',f,true);setTimeout(()=>removeEventListener('click',f,true),450)}
 function narrador(){const c=E.cfg,el=$('#narr');if(!c.narrOn||!el){el?.remove();$('#nArm')?.remove();return}
  el.innerHTML=`<div class="av" id="nAv"><span class="sp" id="nSp"></span></div><div class="bub" id="nBub"></div>`;
  E.foto(c.narrImg).then(src=>{const u=src||IMG.narr,i=new Image();i.onload=()=>{$('#nAv').style.backgroundImage=`url("${u}")`};i.onerror=()=>{$('#nAv').insertAdjacentText('afterbegin','💪')};i.src=u});
  const av=$('#nAv'),spb=$('#nSp');let pid=null,sx=0,sy=0,ox=0,oy=0,mov=false;
  spb.addEventListener('pointerdown',e=>e.stopPropagation());
  spb.addEventListener('click',e=>{e.stopPropagation();R.mudo=!R.mudo;guardar('narrMudo',R.mudo);pintarEstado();if(R.mudo)callar();else repetir()});
  /* arrastrar = mover al personaje · tocar sin arrastrar = ocultarlo (el brazo 💪 lo trae de vuelta) */
  av.addEventListener('pointerdown',e=>{if(e.target===spb)return;pid=e.pointerId;try{av.setPointerCapture(pid)}catch(_){}const r=el.getBoundingClientRect();ox=r.left;oy=r.top;sx=e.clientX;sy=e.clientY;mov=false});
  av.addEventListener('pointermove',e=>{if(pid!==e.pointerId)return;const dx=e.clientX-sx,dy=e.clientY-sy;if(!mov&&Math.hypot(dx,dy)<8)return;mov=true;el.classList.add('drag');const w=innerWidth,h=innerHeight,x=Math.min(Math.max(2,ox+dx),w-96),y=Math.min(Math.max(2,oy+dy),h-96);
   el.style.left=x+'px';el.style.top=y+'px';el.style.bottom='auto';lado(x,y);NR.pos={x:x/w,y:y/h}});
  av.addEventListener('pointerup',e=>{if(pid!==e.pointerId)return;pid=null;el.classList.remove('drag');if(mov){guardar('narrPos',NR.pos);return}tragarClick();NR.off=true;guardar('narrOff',true);callar();clearTimeout(NR.hide);$('#nBub').classList.remove('on');pintarEstado()});
  av.addEventListener('touchend',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
  av.addEventListener('pointercancel',()=>{pid=null;el.classList.remove('drag')});
  $('#nBub').addEventListener('click',()=>$('#nBub').classList.remove('on'));
  $('#nArm')?.addEventListener('click',()=>{NR.off=false;guardar('narrOff',false);pintarEstado();colocar();repetir()});
  addEventListener('resize',colocar);pintarEstado();colocar()}
 /* Muestra el globo y suena la voz grabada (frase + piezas de fecha y hora). Lo que no esté grabado se salta. */
 function decir(k,v={},cuando={}){if(!lleno())return;if(!E.entrado){E.pendiente={k,v,cuando};return}
  let t=plantilla(E.cfg.narr?.[k]??VOZ.FRASES[k],v);if(!t)return;t=t[0].toUpperCase()+t.slice(1);
  const au=E.cfg.narrAudio||{},claves=VOZ.claves(k,{...cuando,hoy:E.hoy()}).map(x=>au[x]).filter(x=>typeof x==='string');
  NR.last={t,claves};mostrar()}
 const repetir=()=>{if(NR.last)mostrar()};
 function mostrar(){if(NR.off||!NR.last)return;const{t,claves}=NR.last,b=$('#nBub'),av=$('#nAv');
  b.innerHTML=`<b>${escH(E.cfg.narrNombre||'')}</b>${escH(t)}`;b.classList.add('on');av.classList.add('talk');
  clearTimeout(NR.hide);NR.hide=setTimeout(()=>b.classList.remove('on'),Math.max(3500,t.length*65));
  const quieto=()=>av.classList.remove('talk');if(!claves.length||R.mudo){callar();setTimeout(quieto,1600);return}
  sonar(claves,quieto)}
 /* Con botones fijos abajo, el narrador y el brazo suben para no taparlos. */
 function pie(conPie){const bt=conPie?'calc(96px + env(safe-area-inset-bottom))':'calc(16px + env(safe-area-inset-bottom))',nr=$('#narr'),ar=$('#nArm');if(nr&&!NR.pos)nr.style.bottom=bt;if(ar)ar.style.bottom=bt}

 /* =================== INICIO =================== */
 splashInicio();
 /* La página llama esto cuando ya tiene la configuración del negocio. */
 function iniciar({cfg,hoy,audio,foto}){E.cfg=cfg;E.hoy=hoy;E.audio=audio;E.foto=foto||E.foto;narrador();
  ['hola','holaLink'].forEach(k=>VOZ.claves(k).forEach(x=>{const a=cfg.narrAudio?.[x];if(a)datos(a).catch(()=>{})})); // el saludo ya descargado al tocar
  const sp=$('#splash');
  if(!sp||cfg.splashOn===false){sp?.remove();SPL.done=true;entrar();return}
  if(cfg.splashImg)E.foto(cfg.splashImg).then(u=>u&&logo(u));
  sp.classList.add('listo');if(E.quiereEntrar)entrar()}
 /* Si la página no pudo cargar, se quita la pantalla de carga para mostrar el error. */
 function error(){const sp=$('#splash');if(sp){SPL.done=true;sp.remove()}E.entrado=true}
 /* Para las pruebas y el diagnóstico: qué está pasando con la voz. */
 const estado=()=>({entrado:E.entrado,sonidoListo:R.listo,mudo:R.mudo,ultimo:NR.last,webAudio:!!R.ctx});
 return{iniciar,decir,pie,error,callar,estado}})();
