/* ---------- clave y huella (multiusuario) ---------- */
const b64u={enc:b=>{let t='';for(const x of new Uint8Array(b))t+=String.fromCharCode(x);return btoa(t).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')},
 dec:t=>Uint8Array.from(atob(t.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((t.length+3)%4)),c=>c.charCodeAt(0)).buffer};
const hayHuella=()=>!!(window.PublicKeyCredential&&navigator.credentials);
async function loginExtras(ac){
 let r={puerta:false};try{r=await API.req('GET','/auth/perfiles')}catch(e){}
 if(!r.puerta)return;
 $('#gbtn').style.display='none';$('#gLbl').style.display=$('#lgEquipo').style.display='none';$('#lgHint').textContent='';$('#pfBox').style.display='flex';S.perf=r.perfiles;
 const ini=n=>esc((n||'?').trim()[0]||'?').toUpperCase();
 $('#pfGrid').innerHTML=r.perfiles.map(p=>`<button class="btn" data-s="${esc(p.sujeto)}" data-on-click="a30bb08e9" data-p0="${esc(p.sujeto)}" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px"><span style="width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:22px;font-weight:800;overflow:hidden;background:${esc(p.color||'var(--blue)')}">${p.rol==='dueno'?'👑':p.foto?`<img data-foto="${esc(p.foto)}" style="width:100%;height:100%;object-fit:cover">`:ini(p.nombre)}</span><b>${esc(p.nombre)}</b><small style="color:var(--mu)">${p.huella?'👆 ':''}${p.clave?'🔑':p.crear?'🆕 crear clave':''}</small></button>`).join('');
 hydrate($('#pfGrid'));
 // Celular de una sola persona (activado con su QR o con su Google): «Hola, Jhon», sin cuadrícula.
 const uno=r.perfiles.length===1?r.perfiles[0]:null;$('#pfGrid').style.display=$('#pfTit').style.display=uno?'none':'';$('#pfHola').style.display=uno?'flex':'none';
 if(uno){$('#pfHola').innerHTML=`<span style="width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:26px;font-weight:800;overflow:hidden;background:${esc(uno.color||'var(--blue)')}">${uno.foto?`<img data-foto="${esc(uno.foto)}" style="width:100%;height:100%;object-fit:cover" alt="">`:ini(uno.nombre)}</span><b style="font-size:18px">Hola, ${esc(uno.nombre)}</b>`;hydrate($('#pfHola'));$('#pfSalir').textContent='No soy '+uno.nombre;elegirPerfil(uno.sujeto);return}
 $('#pfSalir').textContent=r.email?'Cambiar cuenta de Google':'Salir de este aparato';
 const ult=lsGet('ultimoPerfil','');if(ult&&r.perfiles.some(p=>p.sujeto===ult))elegirPerfil(ult)}
/* Cada persona entra con SU clave o su huella. Si aún no tiene clave y puede crearla (su Google abrió el aparato, o es el dueño), la crea aquí. */
function elegirPerfil(suj){const p=(S.perf||[]).find(x=>x.sujeto===suj);if(!p)return;S.selP=suj;
 document.querySelectorAll('#pfGrid .btn').forEach(b=>b.style.outline=b.dataset.s===suj?'2px solid var(--blue)':'none');
 $('#pfAcc').style.display='flex';$('#hBtn').style.display=p.huella&&hayHuella()?'inline-flex':'none';$('#hBtn').classList.toggle('p',!!p.huella);$('#hBtn').textContent='👆 Entrar con huella / Face ID';
 $('#cBox').style.display=p.clave?'flex':'none';$('#nBox').style.display=p.crear?'flex':'none';$('#tBox').style.display='none';$('#rBox').style.display='none';$('#olvBtn').style.display=p.clave&&GCFG?.google?'inline-flex':'none';$('#sinAcceso').style.display=!p.clave&&!p.crear&&!p.huella?'block':'none';
 setTimeout(()=>(p.clave?$('#cClave'):p.crear?$('#nClave'):null)?.focus(),50)}
async function loginClave(){const q=S.selP,c=$('#cClave').value;if(!q)return toast('Elige quién eres');if(!c)return toast('Escribe tu clave');
 try{const r=await API.req('POST','/auth/clave',{sujeto:q,clave:c});$('#cClave').value='';lsSet('ultimoPerfil',q);
  if(r.cambiar){S._tmp=c;$('#cBox').style.display='none';$('#olvBtn').style.display='none';$('#tBox').style.display='flex';setTimeout(()=>$('#tClave').focus(),50);return}
  await entrar(r);if(!r.bloqueo)ofrecerHuella()}catch(e){toast('❌ '+e.message);$('#cClave').value=''}}
const dosClaves=(a,b)=>{const x=$(a).value;if(x.length<6){toast('La clave debe tener al menos 6 caracteres');return null}if(x!==$(b).value){toast('Las dos claves no coinciden');return null}return x};
/* Clave temporal que puso el dueño → la persona crea la suya y entra. */
ACC.cambiarTemporal=async function(){const n=dosClaves('#tClave','#tClave2');if(!n)return;
 try{const r=await API.req('POST','/auth/clave/cambiar',{sujeto:S.selP,actual:S._tmp,nueva:n});S._tmp=null;await entrar(r);if(!r.bloqueo)ofrecerHuella()}catch(e){toast('❌ '+e.message)}};
/* ¿Olvidaste tu clave? → clave nueva + confirmar con su propio Google. */
ACC.olvideClave=function(){$('#cBox').style.display='none';this.style.display='none';$('#rBox').style.display='flex';gPintar('#rG',recuperarConGoogle).catch(e=>toast('❌ '+e.message))};
async function recuperarConGoogle(g){const n=dosClaves('#rClave','#rClave2');if(!n)return gPintar('#rG',recuperarConGoogle).catch(()=>{});
 try{const r=await API.req('POST','/auth/clave/recuperar',{sujeto:S.selP,credential:g.credential,nueva:n});await entrar(r)}catch(e){toast('❌ '+e.message);gPintar('#rG',recuperarConGoogle).catch(()=>{})}}
async function crearClave(){const a=$('#nClave').value,b=$('#nClave2').value;if(a.length<6)return toast('La clave debe tener al menos 6 caracteres');if(a!==b)return toast('Las dos claves no coinciden');
 try{const r=await API.req('POST','/auth/clave/crear',{sujeto:S.selP,clave:a});lsSet('ultimoPerfil',S.selP);await entrar(r);if(!r.bloqueo)ofrecerHuella()}catch(e){toast('❌ '+e.message)}}
ACC.crearClave=function(){crearClave()};
ACC.claveNuevaTecla=function(event){if(event.key==='Enter')crearClave()};
async function salirPuerta(){try{await API.req('POST','/auth/puerta/salir',{})}catch(e){}localStorage.removeItem('brb_ses');location.reload()}
async function loginHuella(){
 try{const r=await API.req('GET','/auth/huella/reto');
  const cr=await navigator.credentials.get({publicKey:{challenge:b64u.dec(r.challenge),rpId:r.rpId,userVerification:'required',timeout:60000}});
  const x=cr.response;
  const s=await API.req('POST','/auth/huella',{challenge:r.challenge,credential:{id:cr.id,response:{clientDataJSON:b64u.enc(x.clientDataJSON),authenticatorData:b64u.enc(x.authenticatorData),signature:b64u.enc(x.signature)}}});
  lsSet('huellaAqui',s.pid);await entrar(s)
 }catch(e){toast(e.name==='NotAllowedError'?'Cancelaste o no se reconoció la huella':'❌ '+e.message)}}
ACC.entrarHuella=function(){loginHuella()};
/* Crea la passkey en este aparato con las opciones del servidor y devuelve lo que hay que mandarle. */
async function crearPasskey(pk){const ch=pk.challenge;
 const cr=await navigator.credentials.create({publicKey:{...pk,challenge:b64u.dec(ch),user:{...pk.user,id:b64u.dec(pk.user.id)},excludeCredentials:(pk.excludeCredentials||[]).map(e=>({...e,id:b64u.dec(e.id)}))}});
 const ua=navigator.userAgent,et=/iPhone/.test(ua)?'iPhone':/iPad/.test(ua)?'iPad':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'Mac':'Celular';
 return {challenge:ch,etiqueta:et,credential:{id:cr.id,response:{clientDataJSON:b64u.enc(cr.response.clientDataJSON),attestationObject:b64u.enc(cr.response.attestationObject)}}}}
/* «¿Entrar la próxima vez con tu huella o Face ID?» — justo después de entrar con Google (o desde ☰ Menú). */
function ofrecerHuella(desdeMenu){if(!API.remote||!hayHuella()||!S.ses)return desdeMenu&&toast('Este navegador no permite huella. Usa Chrome, Safari o Edge actualizado.');
 if(!desdeMenu&&(lsGet('huellaAqui','')===S.ses.pid||lsGet('huellaNo','')===S.ses.pid))return;
 openModal(mHead('👆 Huella o Face ID')+`<p style="margin-top:0">¿Quieres entrar la próxima vez <b>solo con tu huella o tu cara</b>, sin Google ni clave?</p>
 <p class="hint">Tu huella nunca sale de este aparato: el panel solo recibe una firma de que eres tú.</p>
 ${lsGet('huellaAqui','')===S.ses.pid?'<div class="banner">✅ Este aparato ya tiene tu huella activada. Puedes activarla también en otro aparato desde allí.</div>':''}
 <button class="btn p w" style="padding:14px;margin-top:8px" data-on-click="miHuellaActivar">👆 Sí, activar en este aparato</button>
 <button class="btn w" style="margin-top:8px" data-on-click="miHuellaNo">Ahora no</button>`)}
ACC.miHuella=function(){ofrecerHuella(true)};
ACC.miHuellaNo=function(){lsSet('huellaNo',S.ses.pid);closeModal()};
ACC.miHuellaActivar=async function(){this.disabled=true;
 try{const o=await API.req('POST','/acceso/mi-huella/opciones',{});await API.req('POST','/acceso/mi-huella',await crearPasskey(o.publicKey));
  lsSet('huellaAqui',S.ses.pid);closeModal();toast('✅ Listo: la próxima vez entra con tu huella o Face ID')}
 catch(e){this.disabled=false;toast(e.name==='NotAllowedError'?'No se completó. Vuelve a intentarlo.':e.name==='InvalidStateError'?'Este aparato ya tiene tu huella activada.':'❌ '+e.message)}};

/* Página que abre el barbero con el QR o link que le genera el dueño («Activar su celular»).
   Ese aparato queda autorizado para él (sin Google); después entra con su clave y puede activar su huella o Face ID. */
async function activarCelular(cod){history.replaceState(null,'',location.pathname);
 const L=$('#login');L.innerHTML='<div class="logo">📲</div><h2>Activar mi celular</h2><p class="hint" id="pkMsg" style="text-align:center">Activando…</p>';
 const msg=t=>$('#pkMsg').innerHTML=t;
 let r;try{r=await API.req('POST','/auth/activar',{codigo:cod})}catch(e){return msg('❌ '+esc(e.message))}
 lsSet('ultimoPerfil',r.sujeto);
 msg(`✅ <b>Listo, ${esc(r.nombre)}.</b> Este celular quedó activado.<br>${r.clave?'Ahora entra con la clave que te dio el dueño.':'Ahora crea tu clave.'}${hayHuella()?' Luego podrás entrar con tu huella o Face ID.':''}`);
 const b=document.createElement('a');b.className='btn p';b.style.cssText='width:260px;padding:14px;margin-top:14px;text-decoration:none;display:inline-flex;justify-content:center';b.href=location.pathname;b.textContent='Entrar';L.appendChild(b)}

/* Bloque del administrador dentro de cada persona */
const accHTML=(suj)=>API.remote&&suj&&can('config')?`<div class="card" id="acc" style="margin-top:16px;padding:12px"><b>🔐 Acceso propio</b><p class="hint" style="margin-top:4px">Cargando…</p></div>`:'';
async function accCargar(suj){const el=$('#acc');if(!el)return;
 let a;try{a=await API.req('GET','/acceso')}catch(e){el.innerHTML='<b>🔐 Acceso propio</b><p class="hint">❌ '+esc(e.message)+'</p>';return}
 const tiene=a.claves.includes(suj),hs=a.huellas.filter(h=>h.sujeto===suj),tmp=(a.temporales||[]).includes(suj),bloq=(a.bloqueados||[]).includes(suj);
 if(suj===S.ses?.sujeto){el.innerHTML=`<b>🔐 Tu acceso</b><p class="hint" style="margin-top:4px">Tu clave la cambias tú en ☰ Menú → <b>🔑 Mi clave</b>.</p>`;return}
 el.innerHTML=`<b>🔐 Acceso</b><p class="hint" style="margin-top:4px">1) Ponle su <b>clave</b>. 2) Toca <b>«Activar su celular»</b> y que escanee el QR. Desde ahí entra con su clave o su huella / Face ID, sin Google.</p>
 ${bloq?`<div class="banner" style="margin-top:8px">🔒 Bloqueado por intentos fallidos. <button class="btn sm" data-on-click="accDesbloquear" data-p0="${suj}">🔓 Desbloquear</button></div>`:''}
 <label class="lb">Clave ${tiene?`<span class="tag" style="margin-left:6px">${tmp?'temporal (aún no la cambia)':'activa'}</span>`:''}</label>
 <input class="in" id="accC" type="text" autocomplete="off" placeholder="${tiene?'Escribe una nueva para cambiarla':'Mínimo 6 caracteres'}">
 <label class="chk" style="margin-top:6px"><input type="checkbox" id="accTmp"><span>Que la cambie por una suya al entrar</span></label>
 <div class="g2" style="margin-top:8px"><button class="btn sm" data-on-click="a24ebc3ff">🎲 Generar</button><button class="btn sm p" data-on-click="aa9971596" data-p0="${suj}">💾 Guardar clave</button></div>
 ${tiene?`<button class="btn sm r w" style="margin-top:8px" data-on-click="a6d74157b" data-p0="${suj}">Quitar clave</button>`:''}
 <button class="btn p w" style="margin-top:12px;padding:12px" data-on-click="aa6a3b664" data-p0="${suj}">📲 Activar su celular (QR)</button><div id="accInv"></div>
 <label class="lb">Huella / Face ID</label>
 ${hs.length?hs.map(h=>`<div class="li"><div class="t"><b>👆 ${esc(h.etiqueta)}</b><small>${new Date(h.creada).toLocaleDateString('es-PE')}</small></div><button class="btn sm r" data-on-click="a0e985dcd" data-p0="${h.id}" data-p1="${suj}">Quitar</button></div>`).join(''):'<p class="hint" style="margin-top:0">Aún no la activa. Se le ofrece al entrar con su clave en su celular.</p>'}`}
function accGenerar(){const a='abcdefghjkmnpqrstuvwxyz23456789',r=crypto.getRandomValues(new Uint8Array(8));$('#accC').value=[...r].map(x=>a[x%a.length]).join('')}
async function accClave(suj){const c=$('#accC').value,temporal=!!$('#accTmp')?.checked;if(c.length<6)return toast('Mínimo 6 caracteres');
 try{await API.req('PUT','/acceso/'+suj+'/clave',{clave:c,temporal});toast('✅ Clave guardada');await accCargar(suj);
  $('#accInv').innerHTML=`<div class="banner" style="margin-top:8px">🔑 Clave de esta persona: <b class="syne" style="font-size:18px;user-select:all">${esc(c)}</b><br><small>Pásasela en persona. ${temporal?'Al entrar creará la suya.':'Puede seguir usándola o cambiarla en ☰ → 🔑 Mi clave.'}</small></div>`}catch(e){toast('❌ '+e.message)}}
async function accQuitar(suj){if(!confirm('¿Quitar la clave? Se cierra su sesión.'))return;try{await API.req('DELETE','/acceso/'+suj+'/clave');accCargar(suj)}catch(e){toast('❌ '+e.message)}}
async function accHuellaDel(id,suj){if(!confirm('¿Quitar este dispositivo?'))return;try{await API.req('DELETE','/acceso/huella/'+id);accCargar(suj)}catch(e){toast('❌ '+e.message)}}
async function accInvitar(suj){try{const r=await API.req('POST','/acceso/'+suj+'/invitacion'),url=location.origin+'/?activar='+r.codigo;
 $('#accInv').innerHTML=`<div class="card" style="margin-top:8px;text-align:center"><p class="hint" style="margin-top:0">Que lo escanee con la <b>cámara de su celular</b> y lo abra en <b>Safari o Chrome</b>. Sirve <b>una sola vez</b> y por <b>24 horas</b>.</p>
 <div id="accQR" style="display:inline-block;padding:10px;background:#fff;border-radius:12px"></div>
 <input class="in" readonly value="${esc(url)}" data-on-click="a5c3a010b" style="margin-top:8px"><div class="g2" style="margin-top:8px"><button class="btn sm" data-on-click="a71d0100d" data-p0="${url}">📋 Copiar</button><a class="btn sm" style="text-decoration:none;text-align:center" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Abre este link en tu celular (Safari o Chrome) para activar tu acceso al panel: '+url)}">💬 WhatsApp</a></div></div>`;
 try{new QRCode($('#accQR'),{text:url,width:200,height:200,colorDark:'#000000',colorLight:'#ffffff'})}catch(e){$('#accQR').remove()}}catch(e){toast('❌ '+e.message)}}

ACC.accDesbloquear=async function(){try{await API.req('POST','/acceso/'+this.dataset.p0+'/desbloquear');toast('🔓 Desbloqueado');accCargar(this.dataset.p0)}catch(e){toast('❌ '+e.message)}};

/* ---------- 🔑 Mi clave (cada persona cambia la suya) ---------- */
function miClave(){openModal(mHead('🔑 Mi clave')+`<p class="hint" style="margin-top:0">Solo tú la sabes. Al cambiarla se cierran tus otras sesiones abiertas.</p>
 <label class="lb">Clave actual</label><input class="in" id="mcA" type="password" autocomplete="current-password">
 <label class="lb">Clave nueva</label><input class="in" id="mcN" type="password" autocomplete="new-password" placeholder="Mínimo 6, que nadie más sepa">
 <label class="lb">Repite la nueva</label><input class="in" id="mcN2" type="password" autocomplete="new-password">
 <button class="btn p w" style="margin-top:14px;padding:14px" data-on-click="miClaveGuardar">💾 Cambiar mi clave</button>`)}
ACC.miClave=function(){closeModal();miClave()};
ACC.miClaveGuardar=async function(){const n=dosClaves('#mcN','#mcN2');if(!n)return;this.disabled=true;
 try{const r=await API.req('POST','/auth/clave/cambiar',{actual:$('#mcA').value,nueva:n});S.ses={...S.ses,...r};lsSet('ses',S.ses);closeModal();toast('✅ Clave cambiada')}catch(e){this.disabled=false;toast('❌ '+e.message)}};

/* ---------- 📱 Aparatos autorizados ---------- */
const fechaCorta=t=>t?new Date(t).toLocaleString('es-PE',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'—';
async function abrirAparatos(){let l;try{l=await API.req('GET','/acceso/aparatos')}catch(e){return toast('❌ '+e.message)}
 openModal(mHead('📱 Aparatos autorizados')+`<p class="hint" style="margin-top:0">Celulares, tablets y computadoras que entraron con Google. Si uno se perdió, quítalo: se cierran al instante todas sus sesiones.</p>`+
 (l.length?l.map(a=>`<div class="li"><span class="av">${/iPhone|Android/.test(a.aparato)?'📱':/iPad/.test(a.aparato)?'📲':'💻'}</span><div class="t"><b>${esc(a.aparato)}${a.actual?' · <span style="color:var(--grn)">este aparato</span>':''}</b><small>${esc(a.quien)} · desde ${fechaCorta(a.creado)} · último uso ${fechaCorta(a.uso)}</small></div><button class="btn sm r" data-on-click="apQuitar" data-p0="${a.id}" data-p1="${a.actual?1:''}">Quitar</button></div>`).join(''):'<div class="empty">No hay aparatos autorizados</div>'))}
ACC.abrirAparatos=function(){abrirAparatos()};
ACC.apQuitar=async function(){const yo=!!this.dataset.p1;if(!confirm(yo?'Es ESTE aparato: se cerrará tu sesión aquí. ¿Seguir?':'¿Quitar este aparato? Se cierran sus sesiones al instante.'))return;
 try{await API.req('DELETE','/acceso/aparatos/'+this.dataset.p0);if(yo){localStorage.removeItem('brb_ses');return location.reload()}toast('✅ Aparato quitado');abrirAparatos()}catch(e){toast('❌ '+e.message)}};
