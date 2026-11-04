/* ---------- clave y huella (multiusuario) ---------- */
const b64u={enc:b=>{let t='';for(const x of new Uint8Array(b))t+=String.fromCharCode(x);return btoa(t).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')},
 dec:t=>Uint8Array.from(atob(t.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((t.length+3)%4)),c=>c.charCodeAt(0)).buffer};
const hayHuella=()=>!!(window.PublicKeyCredential&&navigator.credentials);
async function loginExtras(ac){
 let r={puerta:false};try{r=await API.req('GET','/auth/perfiles')}catch(e){}
 if(!r.puerta)return;
 $('#gbtn').style.display='none';$('#lgHint').textContent='';$('#pfBox').style.display='flex';S.perf=r.perfiles;
 const ini=n=>esc((n||'?').trim()[0]||'?').toUpperCase();
 $('#pfGrid').innerHTML=r.perfiles.map(p=>`<button class="btn" data-s="${esc(p.sujeto)}" data-on-click="a30bb08e9" data-p0="${esc(p.sujeto)}" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px"><span style="width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:22px;font-weight:800;overflow:hidden;background:${esc(p.color||'var(--blue)')}">${p.rol==='dueno'?'👑':p.foto?`<img data-foto="${esc(p.foto)}" style="width:100%;height:100%;object-fit:cover">`:ini(p.nombre)}</span><b>${esc(p.nombre)}</b><small style="color:var(--mu)">${p.huella?'👆 ':''}${p.clave?'🔑':''}${p.directo?'Google':''}</small></button>`).join('');
 hydrate($('#pfGrid'));
 const ult=lsGet('ultimoPerfil','');if(ult&&r.perfiles.some(p=>p.sujeto===ult))elegirPerfil(ult)}
function elegirPerfil(suj){const p=(S.perf||[]).find(x=>x.sujeto===suj);if(!p)return;S.selP=suj;
 document.querySelectorAll('#pfGrid .btn').forEach(b=>b.style.outline=b.dataset.s===suj?'2px solid var(--blue)':'none');
 $('#pfAcc').style.display='flex';$('#hBtn').style.display=p.huella&&hayHuella()?'inline-flex':'none';
 $('#cBox').style.display=p.clave?'flex':'none';$('#dBtn').style.display=p.directo?'inline-flex':'none';
 $('#cClave').placeholder=p.rol==='dueno'?'Clave del dueño':'Tu clave';if(p.clave)setTimeout(()=>$('#cClave').focus(),50)}
async function loginClave(){const q=S.selP,c=$('#cClave').value;if(!q)return toast('Elige quién eres');if(!c)return toast('Escribe tu clave');
 try{const r=await API.req('POST','/auth/clave',{sujeto:q,clave:c});$('#cClave').value='';lsSet('ultimoPerfil',q);await entrar(r)}catch(e){toast('❌ '+e.message);$('#cClave').value=''}}
async function loginDirecto(){try{const r=await API.req('POST','/auth/perfil/directo',{sujeto:S.selP});lsSet('ultimoPerfil',S.selP);await entrar(r)}catch(e){toast('❌ '+e.message)}}
async function salirPuerta(){try{await API.req('POST','/auth/puerta/salir',{})}catch(e){}localStorage.removeItem('brb_ses');location.reload()}
async function loginHuella(){
 try{const r=await API.req('GET','/auth/huella/reto');
  const cr=await navigator.credentials.get({publicKey:{challenge:b64u.dec(r.challenge),rpId:r.rpId,userVerification:'required',timeout:60000}});
  const x=cr.response;
  await entrar(await API.req('POST','/auth/huella',{challenge:r.challenge,credential:{id:cr.id,response:{clientDataJSON:b64u.enc(x.clientDataJSON),authenticatorData:b64u.enc(x.authenticatorData),signature:b64u.enc(x.signature)}}}))
 }catch(e){toast(e.name==='NotAllowedError'?'Cancelaste o no se reconoció la huella':'❌ '+e.message)}}

/* Página que abre el barbero con el link que le manda el administrador */
async function activarHuella(cod){
 const L=$('#login');L.innerHTML='<div class="logo">👆</div><h2>Activar mi huella</h2><p class="hint" id="pkMsg">Revisando tu link…</p>';
 const msg=t=>$('#pkMsg').innerHTML=t;
 if(!hayHuella())return msg('Este navegador no permite huella. Abre el link en <b>Safari</b> (iPhone) o <b>Chrome</b> (Android), no dentro de WhatsApp.');
 let o;try{o=await API.req('POST','/passkey/opciones',{codigo:cod})}catch(e){return msg('❌ '+esc(e.message))}
 msg(`Hola <b>${esc(o.nombre)}</b>. Toca el botón y pon tu huella o tu rostro cuando el teléfono te lo pida.`);
 const b=document.createElement('button');b.className='btn p';b.style.cssText='width:260px;padding:14px;margin-top:14px';b.textContent='👆 Activar huella';L.appendChild(b);
 b.onclick=async()=>{b.disabled=true;
  try{const pk=o.publicKey,ch=pk.challenge;
   const cr=await navigator.credentials.create({publicKey:{...pk,challenge:b64u.dec(ch),user:{...pk.user,id:b64u.dec(pk.user.id)},excludeCredentials:(pk.excludeCredentials||[]).map(e=>({...e,id:b64u.dec(e.id)}))}});
   const ua=navigator.userAgent,et=/iPhone/.test(ua)?'iPhone':/iPad/.test(ua)?'iPad':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'Mac':'Celular';
   await API.req('POST','/passkey/registrar',{codigo:cod,challenge:ch,etiqueta:et,credential:{id:cr.id,response:{clientDataJSON:b64u.enc(cr.response.clientDataJSON),attestationObject:b64u.enc(cr.response.attestationObject)}}});
   b.remove();msg('✅ <b>Listo, '+esc(o.nombre)+'.</b> Tu huella quedó activada. Ya puedes entrar con ella.');
   const a=document.createElement('a');a.className='btn p';a.style.cssText='width:260px;padding:14px;margin-top:14px;text-decoration:none;display:inline-flex;justify-content:center';a.href=location.pathname;a.textContent='Ir al panel';L.appendChild(a)
  }catch(e){b.disabled=false;msg(e.name==='NotAllowedError'?'No se completó. Vuelve a tocar el botón.':e.name==='InvalidStateError'?'Este teléfono ya tiene una huella activada para tu usuario.':'❌ '+esc(e.message))}}}

/* Bloque del administrador dentro de cada persona */
const accHTML=(suj)=>API.remote&&suj&&can('config')?`<div class="card" id="acc" style="margin-top:16px;padding:12px"><b>🔐 Acceso propio</b><p class="hint" style="margin-top:4px">Cargando…</p></div>`:'';
async function accCargar(suj){const el=$('#acc');if(!el)return;
 let a;try{a=await API.req('GET','/acceso')}catch(e){el.innerHTML='<b>🔐 Acceso propio</b><p class="hint">❌ '+esc(e.message)+'</p>';return}
 const tiene=a.claves.includes(suj),hs=a.huellas.filter(h=>h.sujeto===suj);
 el.innerHTML=`<b>🔐 Acceso propio</b><p class="hint" style="margin-top:4px">Solo tú (administrador) puedes darle o quitarle clave y huella.</p>
 <label class="lb">Clave ${tiene?'<span class="tag" style="margin-left:6px">activa</span>':''}</label>
 <input class="in" id="accC" type="text" autocomplete="off" placeholder="${tiene?'Escribe una nueva para cambiarla':suj==='admin'?'Mínimo 4 caracteres':'Mínimo 6 caracteres'}">
 <div class="g2" style="margin-top:8px"><button class="btn sm" data-on-click="a24ebc3ff">🎲 Generar</button><button class="btn sm p" data-on-click="aa9971596" data-p0="${suj}">💾 ${tiene?'Cambiar':'Poner'} clave</button></div>
 ${tiene?`<button class="btn sm r w" style="margin-top:8px" data-on-click="a6d74157b" data-p0="${suj}">Quitar clave</button>`:''}
 <label class="lb">Huella / Face ID</label>
 ${hs.length?hs.map(h=>`<div class="li"><div class="t"><b>👆 ${esc(h.etiqueta)}</b><small>${new Date(h.creada).toLocaleDateString('es-PE')}</small></div><button class="btn sm r" data-on-click="a0e985dcd" data-p0="${h.id}" data-p1="${suj}">Quitar</button></div>`).join(''):'<p class="hint" style="margin-top:0">Sin dispositivos registrados.</p>'}
 <button class="btn w" style="margin-top:8px" data-on-click="aa6a3b664" data-p0="${suj}">👆 Invitar a activar huella</button><div id="accInv"></div>`}
function accDueno(){openModal(mHead('🔑 Acceso del dueño')+'<p class="hint" style="margin-top:0">Después de entrar con Google, el dueño elige su perfil y escribe su clave. Mientras no la cambies aquí, vale la de arranque.</p>'+accHTML('admin'));accCargar('admin')}
function accGenerar(){const a='abcdefghjkmnpqrstuvwxyz23456789',r=crypto.getRandomValues(new Uint8Array(8));$('#accC').value=[...r].map(x=>a[x%a.length]).join('')}
async function accClave(suj){const c=$('#accC').value,mn=suj==='admin'?4:6;if(c.length<mn)return toast('Mínimo '+mn+' caracteres');
 try{await API.req('PUT','/acceso/'+suj+'/clave',{clave:c});toast('✅ Clave guardada. Pásasela por WhatsApp: '+c);prompt('Clave (cópiala y envíala; no se vuelve a mostrar):',c);accCargar(suj)}catch(e){toast('❌ '+e.message)}}
async function accQuitar(suj){if(!confirm('¿Quitar la clave? Se cierra su sesión.'))return;try{await API.req('DELETE','/acceso/'+suj+'/clave');accCargar(suj)}catch(e){toast('❌ '+e.message)}}
async function accHuellaDel(id,suj){if(!confirm('¿Quitar este dispositivo?'))return;try{await API.req('DELETE','/acceso/huella/'+id);accCargar(suj)}catch(e){toast('❌ '+e.message)}}
async function accInvitar(suj){try{const r=await API.req('POST','/acceso/'+suj+'/invitacion'),url=location.origin+location.pathname+'?huella='+r.codigo;
 $('#accInv').innerHTML=`<p class="hint">Link de un solo uso, vale 24 horas. Que lo abra en <b>Safari o Chrome</b> (no dentro de WhatsApp).</p><input class="in" readonly value="${esc(url)}" data-on-click="a5c3a010b"><div class="g2" style="margin-top:8px"><button class="btn sm" data-on-click="a71d0100d" data-p0="${url}">📋 Copiar</button><a class="btn sm" style="text-decoration:none;text-align:center" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Activa tu huella para entrar al panel: '+url)}">💬 WhatsApp</a></div>`}catch(e){toast('❌ '+e.message)}}

