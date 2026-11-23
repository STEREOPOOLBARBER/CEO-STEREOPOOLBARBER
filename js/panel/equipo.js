/* =================== 👥 EQUIPO (⚙️ Config) ===================
   Una sola lista de personas: cada una aparece una vez, con su rol (qué puede hacer), si atiende clientes
   (sale en la agenda, el formulario y la caja), su correo de Google y su acceso propio (clave o huella).
   Regla de entrada, igual para todos: Google abre el aparato → cada persona entra con SU clave o huella.
   El servidor vuelve a validar todo (worker/modulos/citas.js → validarEquipo).
   ===================================================================== */
const atienden=()=>D().equipo.filter(p=>p.atiende);
const soyDueno=()=>S.ses?.rol==='dueno';
const nombreN=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
/* Nombres repetidos entre personas activas (p. ej. alguien que quedó dos veces al juntar las listas antiguas). */
function repetidos(eq){const m={};eq.filter(p=>p.activo!==false).forEach(p=>{const k=nombreN(p.nombre);(m[k]=m[k]||[]).push(p)});return Object.values(m).filter(l=>l.length>1)}
const etiquetaRol=p=>(ROLES[p.rol]||ROLES.personal).t;
function equipoHTML(d){const rep=repetidos(d.equipo);
 return `<p class="hint" style="margin-top:0">${API.remote?'Todos entran <b>primero con Google</b> y luego cada uno con <b>su propia clave o huella</b>.':'En modo local cada persona entra con su PIN.'} Cada persona aparece una sola vez.</p>
 ${rep.length?`<div class="banner">⚠️ <b>Nombres repetidos:</b> ${rep.map(l=>esc(l[0].nombre)+' ('+l.length+' veces)').join(', ')}. Si es la misma persona, deja una y desactiva o elimina la otra.</div>`:''}
 ${d.equipo.map(p=>`<div class="li"><span class="bar" style="width:5px;height:38px;border-radius:4px;background:${p.atiende?(p.color||'var(--pur)'):'transparent'}"></span>${p.rol==='dueno'?'<span class="av lg">👑</span>':avatar(p,1)}<div class="t"><b>${esc(p.nombre)}</b><small>${etiquetaRol(p)}${p.atiende?' · ✂️ atiende':''} · ${API.remote?(p.email?esc(p.email):p.rol==='dueno'?'correo en Cloudflare':'sin correo'):'PIN '+esc(p.pin||'—')}${p.atiende?'<br>'+resumenCitas({barberoId:p.id}):''}</small></div>${p.rol==='dueno'&&!soyDueno()?'':sw(p.activo!==false,'togPersona',p.id)}${p.rol==='dueno'&&!soyDueno()?'':`<button class="ibtn" data-on-click="eqEditar" data-p0="${p.id}">✏️</button>`}</div>`).join('')}
 <button class="btn p w" style="margin-top:12px" data-on-click="eqEditar" data-p0="">➕ Agregar persona</button>
 <p class="hint">El interruptor desactiva a la persona sin borrarla: deja de entrar y, si atiende, sale del formulario de reservas.</p>`}
function togPersona(id){const p=D().equipo.find(x=>x.id===id);if(!p)return;if(p.rol==='dueno'&&p.activo!==false&&D().equipo.filter(x=>x.rol==='dueno'&&x.activo!==false).length<2)return toast('Debe quedar al menos un dueño activo');p.activo=p.activo===false;dirty();renderConfig()}

/* ---------- editar una persona ---------- */
function editPersona(id){const p=id?D().equipo.find(x=>x.id===id):{id:'',nombre:'',rol:'barbero',permisos:{...ROLES.barbero.p},atiende:true,activo:true,email:'',esp:'',foto:'',color:COLORES[atienden().length%COLORES.length],comision:50,dias:[...D().cfg.dias]};
 S._p=clone({dias:[],comision:0,permisos:{},...p});const roles=Object.entries(ROLES).filter(([k])=>k!=='dueno'||soyDueno());
 openModal(mHead(id?'✏️ '+esc(p.nombre):'➕ Nueva persona')+`
 <label class="lb">Nombre</label><input class="in" id="pNom" value="${esc(p.nombre)}" placeholder="Ej: Jhon">
 <label class="lb">Rol</label><select class="in" id="pRol" data-on-change="eqRol">${roles.map(([k,r])=>`<option value="${k}" ${p.rol===k?'selected':''}>${r.t}</option>`).join('')}</select>
 <label class="lb">Correo de Google ${API.remote?'(con él puede abrir el panel en su celular)':''}</label><input class="in" id="pMail" type="email" value="${esc(p.email||'')}" placeholder="ej: jhon@gmail.com">
 ${API.remote?'':`<label class="lb">PIN (modo local)</label><input class="in" id="pPin" inputmode="numeric" maxlength="6" value="${esc(p.pin||'')}" placeholder="4-6 dígitos">`}
 <div class="li" style="margin-top:10px"><div class="t"><b>✂️ Atiende clientes</b><small>Sale en la agenda, en el formulario de reservas y en la caja</small></div><button class="sw ${S._p.atiende?'on':''}" id="pAti" data-on-click="eqAtiende"></button></div>
 <div id="pAtiBox"></div>
 <label class="lb">Permisos</label><div id="pPerms"></div>
 ${accHTML(id&&'p_'+id)}
 <button class="btn p w" style="margin-top:16px;padding:14px" data-on-click="eqGuardar">💾 Listo</button>
 ${id&&API.remote&&id!==S.ses?.pid&&p.activo!==false?`<button class="btn r w" style="margin-top:8px" data-on-click="eqBaja" data-p0="${id}">🚫 Dar de baja (ya no trabaja aquí)</button>`:''}
 ${id?`<button class="btn r w" style="margin-top:8px" data-on-click="eqBorrar" data-p0="${id}">🗑️ Eliminar persona</button>`:''}`);
 pintarAtiende();pintarPermisos();if(id)accCargar('p_'+id)}
function pintarAtiende(){const p=S._p,el=$('#pAtiBox');$('#pAti').classList.toggle('on',p.atiende);if(!p.atiende){el.innerHTML='';return}
 el.innerHTML=`<label class="upl" style="margin-top:8px"><span class="prev" id="pPrev">${p.foto?`<img data-foto="${p.foto}">`:'💈'}</span><span class="btn sm">📷 Foto</span><input type="file" accept="image/*" data-on-change="eqFoto"></label>
 <label class="lb">Especialidad (se ve en el formulario)</label><input class="in" id="pEsp" value="${esc(p.esp||'')}" placeholder="Ej: Fades y diseños">
 <label class="lb">Color en la agenda</label><div class="sws">${COLORES.map(x=>`<button class="swc ${p.color===x?'on':''}" style="background:${x}" data-on-click="eqColor" data-p0="${x}"></button>`).join('')}</div>
 <label class="lb">Comisión %</label><input class="in" id="pCom" type="number" min="0" max="100" value="${+p.comision||0}">
 <label class="lb">Días que trabaja</label><div class="dchips">${ORDEN.map(x=>`<button class="dchip ${p.dias.includes(x)?'on':''}" data-on-click="eqDia" data-p0="${x}">${DIAS[x]}</button>`).join('')}</div>
 <label class="lb">Servicios que hace <span class="hint">(en el link solo aparece para lo que sabe hacer)</span></label><div class="dchips">${D().servicios.filter(s=>s.activo!==false).map(s=>`<button class="dchip ${!p.servicios?.length||p.servicios.includes(s.id)?'on':''}" style="width:auto;padding:11px 12px" data-on-click="eqServ" data-p0="${s.id}">${esc(s.nombre)}</button>`).join('')}</div>`;hydrate(el)}
function pintarPermisos(){const p=S._p,el=$('#pPerms');
 el.innerHTML=p.rol==='dueno'?'<p class="hint" style="margin:0">👑 El dueño tiene todos los permisos.</p>':PERMS.map(([k,t])=>`<div class="perm"><span>${t}</span><button class="sw ${p.permisos[k]?'on':''}" data-on-click="eqPerm" data-p0="${k}"></button></div>`).join('')}
/* Guarda lo escrito en los campos antes de volver a pintar una parte de la hoja. */
function leerCampos(){const p=S._p,v=id=>$(id)?.value;p.nombre=(v('#pNom')||'').trim();p.email=(v('#pMail')||'').trim().toLowerCase();if(!API.remote)p.pin=(v('#pPin')||'').replace(/\D/g,'');
 if(p.atiende&&$('#pEsp')){p.esp=v('#pEsp').trim();p.comision=Math.min(100,Math.max(0,+v('#pCom')||0))}}
ACC.eqEditar=function(){editPersona(this.dataset.p0)};
ACC.eqRol=function(){leerCampos();const p=S._p;p.rol=this.value;if(p.rol!=='personal'&&ROLES[p.rol])p.permisos={...ROLES[p.rol].p};if(p.rol==='barbero')p.atiende=true;if(p.rol==='recepcion')p.atiende=false;if(p.atiende&&!p.dias.length)p.dias=[...D().cfg.dias];pintarAtiende();pintarPermisos()};
ACC.eqAtiende=function(){leerCampos();S._p.atiende=!S._p.atiende;if(S._p.atiende&&!S._p.dias.length)S._p.dias=[...D().cfg.dias];pintarAtiende()};
ACC.eqPerm=function(){const k=this.dataset.p0,p=S._p;p.permisos[k]=!p.permisos[k];p.rol=p.rol==='dueno'?p.rol:'personal';$('#pRol').value=p.rol;pintarPermisos()};
ACC.eqDia=function(){leerCampos();const x=+this.dataset.p0,d=S._p.dias;S._p.dias=d.includes(x)?d.filter(y=>y!==x):[...d,x];pintarAtiende()};
/* Servicios que hace: sin lista = todos. Tocar uno lo quita o lo pone; si vuelven a estar todos, se guarda «todos». */
ACC.eqServ=function(){leerCampos();const ids=D().servicios.filter(s=>s.activo!==false).map(s=>s.id),p=S._p,l=p.servicios?.length?[...p.servicios]:[...ids],k=this.dataset.p0;
 const n=l.includes(k)?l.filter(x=>x!==k):[...l,k];if(!n.length)return toast('Debe hacer al menos un servicio');p.servicios=ids.every(x=>n.includes(x))?undefined:n;pintarAtiende()};
ACC.eqColor=function(){leerCampos();S._p.color=this.dataset.p0;pintarAtiende()};
ACC.eqFoto=async function(){const f=this.files[0];if(!f)return;leerCampos();try{S._p.foto=await API.putFoto(await compressImg(f,320,.8));pintarAtiende()}catch(e){toast('❌ '+e.message)}};
ACC.eqGuardar=function(){leerCampos();const p=S._p,eq=D().equipo,otros=eq.filter(x=>x.id!==p.id);
 if(!p.nombre)return toast('Falta el nombre');
 if(p.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email))return toast('Correo no válido');
 if(p.email&&otros.some(x=>x.email===p.email))return toast('Ese correo ya lo usa otra persona');
 if(!API.remote&&p.pin&&(p.pin.length<4||otros.some(x=>x.pin===p.pin)))return toast('El PIN debe tener 4 a 6 dígitos y no repetirse');
 if(p.rol!=='dueno'&&!Object.values(p.permisos).some(Boolean))return toast('Dale al menos un permiso');
 if(p.atiende&&!p.dias.length)return toast('Marca los días que trabaja');
 if(otros.some(x=>x.activo!==false&&nombreN(x.nombre)===nombreN(p.nombre))&&!confirm(`Ya hay alguien llamado «${p.nombre}». ¿Es otra persona?`))return;
 if(p.id){eq[eq.findIndex(x=>x.id===p.id)]=p}else{p.id='p'+uid();eq.push(p)}closeModal();dirty();renderConfig()};
ACC.eqBorrar=function(){const id=this.dataset.p0,p=D().equipo.find(x=>x.id===id);if(!p)return;
 if(p.rol==='dueno'&&D().equipo.filter(x=>x.rol==='dueno').length<2)return toast('Debe quedar al menos un dueño');
 if(id===S.ses?.pid)return toast('No puedes eliminarte a ti mismo');
 const fut=p.atiende?S.citas.filter(c=>c.barberoId===id&&c.fecha>=hoy()&&activa(c)).length:0;
 if(!confirm(fut?`Tiene ${fut} cita(s) próximas. Mejor desactívala con el interruptor. ¿Eliminar igual?`:`¿Eliminar a ${p.nombre}? Ya no podrá entrar.`))return;
 D().equipo=D().equipo.filter(x=>x.id!==id);closeModal();dirty();renderConfig()};
/* Dar de baja: deja de entrar en todos sus aparatos al instante (sin correo, sin clave ni huellas). Sus citas e historial se conservan. */
ACC.eqBaja=async function(){const id=this.dataset.p0,p=D().equipo.find(x=>x.id===id);if(!p)return;
 if(S.dirty)return toast('Primero guarda los cambios de Config');
 if(!confirm(`¿Dar de baja a ${p.nombre}? Se cierra su sesión en todos sus aparatos y ya no podrá entrar. Sus citas quedan.`))return;
 try{await API.req('POST','/acceso/p_'+id+'/baja');closeModal();S.draft=null;await reload();renderConfig();toast('🚫 '+p.nombre+' dado de baja')}catch(e){toast('❌ '+e.message)}};
