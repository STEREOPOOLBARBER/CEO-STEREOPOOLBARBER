/* =================== COMPARTIR: links rápidos y personalizados =================== */
const tokenL=()=>Array.from({length:10},()=>'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random()*31)]).join('');
const linkUrl=l=>formUrl('?l='+l.token);
const linkEstado=l=>l.estado==='usado'?'usado':(l.vence&&l.vence<Date.now()?'vencido':'disponible');
const LST={disponible:['● Disponible','var(--blue)'],usado:['✔ Usado','var(--grn)'],vencido:['⌛ Vencido','var(--mu)']};
function hace(ts){const m=Math.round((Date.now()-ts)/60000);if(m<1)return'recién';if(m<60)return`hace ${m} min`;const h=Math.round(m/60);if(h<48)return`hace ${h}h`;return`hace ${Math.round(h/24)} días`}
const fCorta=ts=>{const d=new Date(ts);return`${d.getDate()}-${MESC[d.getMonth()]}.`};
const textoGeneral=()=>`💈 *${S.cfg.nombre}*\n${S.cfg.eslogan?S.cfg.eslogan+'\n':''}Reserva tu corte en 1 minuto, sobrino 👇\n${formUrl()}${S.cfg.direccion?`\n📍 ${S.cfg.direccion}`:''}`;
async function renderCompartir(){
 S.links=await API.links().catch(()=>[]);
 const sv=S.servicios.filter(x=>x.activo!==false),bs=S.barberos.filter(b=>b.activo!==false&&mine({barberoId:b.id}));
 $('#t-compartir').innerHTML=`
 <div class="empty" style="padding:22px 10px 12px;color:var(--tx)"><b style="font-size:64px">🔑</b><h2 style="font:800 26px 'Syne'">Links para clientes</h2><p style="color:var(--mu);margin-top:6px">Generá un link único por cliente.<br>Una vez que lo usa queda bloqueado automáticamente.</p></div>
 <div class="card" style="border-color:var(--pur)">
  <h5 style="font:700 13px 'DM Sans';letter-spacing:.1em;color:var(--blue)">🌐 LINK GENERAL · NO EXPIRA</h5>
  <p class="hint" style="margin-top:6px">Un solo link para todos tus clientes. <b style="color:var(--tx)">Nunca vence</b> y se puede usar todas las veces que quieras: ponlo en tu Instagram, TikTok o estado de WhatsApp.</p>
  <div class="url">${esc(formUrl())}</div>
  <button class="btn p w" style="margin-top:10px;padding:15px;font-size:17px" data-on-click="a8d76aeba">📋 Copiar link general</button>
  <div class="g2" style="margin-top:10px"><button class="btn" style="padding:14px" data-on-click="aa29a5450">↗ Abrir</button><button class="btn g" style="padding:14px" data-on-click="a3bbb640d">💬 WhatsApp</button></div>
 </div>
 <div class="card">
  <div class="row" style="margin-bottom:6px"><h5 style="font:700 13px 'DM Sans';letter-spacing:.1em;color:var(--blue);flex:1">✨ LINK PERSONALIZADO</h5><button class="btn sm" data-on-click="ab20bf097">📖 Ayuda</button></div>
  <p class="hint" style="margin-top:0">Genera un link único con datos del cliente. Se bloquea tras un uso.</p>
  <div class="g2" style="margin-top:12px"><input class="in" id="lkNom" placeholder="Nombre del cliente"><input class="in" id="lkTel" inputmode="tel" placeholder="Teléfono (opcional)"></div>
  <div class="g2" style="margin-top:10px"><select class="in" id="lkServ"><option value="">✂️ Él elige el corte</option>${sv.map(x=>`<option value="${x.id}">${x.emoji} ${esc(x.nombre)}</option>`).join('')}</select><select class="in" id="lkBarb">${isAdmin()?'<option value="">💈 Él elige barbero</option>':''}${bs.map(b=>`<option value="${b.id}">${esc(b.nombre)}</option>`).join('')}</select></div>
  <div class="g2" style="margin-top:10px"><input class="in" id="lkAde" type="number" min="0" placeholder="Adelanto S/ (${+S.cfg.adelanto||0})"><select class="in" id="lkVen"><option value="0">Sin vencimiento</option><option value="1">Vence en 24 horas</option><option value="3">Vence en 3 días</option><option value="7">Vence en 7 días</option><option value="30">Vence en 30 días</option></select></div>
  <input class="in" id="lkNota" style="margin-top:10px" placeholder="🎁 Promo o nota (opcional) — ej: 2x1 en barba">
  <button class="btn w" style="margin-top:12px;padding:14px" data-on-click="a9b48f8c8">📋 Generar y copiar link</button>
  <button class="btn p w" style="margin-top:10px;padding:15px;font-size:17px" data-on-click="a6f1d5870">🔑 Generar y compartir link</button>
 </div>
 <div class="card">
  <h5 style="font:700 13px 'DM Sans';letter-spacing:.1em;color:var(--blue)">⚡ LINKS RÁPIDOS</h5>
  <p class="hint" style="margin-top:6px">Sin datos del cliente — genera un link de <b style="color:var(--tx)">un solo uso</b>; se bloquea al usarse.</p>
  <div class="g2" style="margin-top:12px"><button class="btn" style="padding:14px" data-on-click="ab75a38cc">📋 Copiar link</button><button class="btn" style="padding:14px" data-on-click="a68c435d4">↗ Abrir</button></div>
  <button class="btn w" style="margin-top:10px;padding:14px;color:var(--grn);border-color:#2ea043;background:rgba(46,160,67,.1)" data-on-click="a1329af15">💬 Compartir por WhatsApp</button>
 </div>
 <div class="card">
  <div class="row"><h5 style="font:700 13px 'DM Sans';letter-spacing:.1em;color:var(--blue);flex:1">📋 LINKS GENERADOS</h5><button class="ibtn bare" data-on-click="a808529d1">🔄</button></div>
  <div class="chips" style="padding-top:8px">${['todos','disponible','usado','vencido'].map(k=>`<button class="chip ${(S.lkF||'todos')===k?'on':''}" data-on-click="a0fc44225" data-p0="${k}">${k==='todos'?'Todos':LST[k][0]}</button>`).join('')}</div>
  <div id="lkList">${listaLinks()}</div>
 </div>
 <details class="card"><summary style="font:700 13px 'DM Sans';letter-spacing:.1em;color:var(--blue);cursor:pointer;list-style:none">📱 QR Y TEXTO PARA REDES ›</summary>
  <p class="hint">El QR y el mensaje usan el link general (no expira).</p>
  <div class="qr" id="qr"></div><button class="btn w" data-on-click="a73a12bad">⬇️ Descargar QR</button>
  <textarea class="in" rows="4" style="margin-top:12px" id="shTxt">${esc(textoGeneral())}</textarea>
  <div class="g2" style="margin-top:8px"><button class="btn" data-on-click="a77293e0f">📋 Copiar texto</button><button class="btn g" data-on-click="af59e816b">💬 Compartir</button></div>
 </details>`;
 try{if(window.QRCode)new QRCode($('#qr'),{text:formUrl(),width:200,height:200,colorDark:'#0b0812',colorLight:'#ffffff'});else $('#qr').remove()}catch(e){$('#qr')?.remove()}}
function listaLinks(){const f=S.lkF||'todos';let ls=(S.links||[]).filter(l=>isAdmin()||l.creadoPor===S.ses.barberoId||l.barberoId===S.ses.barberoId);if(f!=='todos')ls=ls.filter(l=>linkEstado(l)===f);
 if(!ls.length)return'<div class="empty" style="padding:20px"><b>🔗</b>Aún no hay links</div>';
 return ls.slice(0,40).map(l=>{const e=linkEstado(l),[t,c]=LST[e],cita=l.citaId&&S.citas.find(x=>x.id===l.citaId);
  return `<div class="lnk"><div class="row"><b>${l.tipo==='rapido'?'Link rápido':esc(l.cliente?.nombre||'Cliente')}</b><span class="st" style="color:${c};border-color:${c};background:color-mix(in srgb,${c} 12%,transparent)">${t}</span></div>
  <p class="hint" style="margin-top:6px">${hace(l.creado)}${l.cliente?.tel?' · 📞 '+esc(l.cliente.tel):''}${l.servicioNombre?' · ✂️ '+esc(l.servicioNombre):''}${l.adelanto!=null&&l.adelanto!==''?' · 💸 '+soles(l.adelanto):''}</p>
  ${l.vence?`<p class="hint" style="margin-top:2px">⏱ Vence ${fCorta(l.vence)}</p>`:''}${l.nota?`<div class="nota">🎁 ${esc(l.nota)}</div>`:''}
  ${cita?`<p class="hint" style="margin-top:4px;color:var(--grn)">✔ Reservó: ${esc(cita.cliente?.nombre)} · ${fLarga(cita.fecha)} ${h12(cita.hora)} · #${esc(cita.codigo)}</p>`:''}
  <div class="row" style="margin-top:10px">${e==='disponible'?`<button class="btn sm" data-on-click="ad3eeda7f" data-p0="${l.id}">📤 Compartir</button><button class="btn sm" data-on-click="aaf913bd3" data-p0="${l.id}">↗</button><button class="btn sm" data-on-click="a5e8976b2" data-p0="${l.id}">📋</button>`:''}<button class="btn sm r" data-on-click="ad34e7e01" data-p0="${l.id}">🗑️</button></div></div>`}).join('')}
async function genLink(modo){const nom=$('#lkNom').value.trim(),tel=$('#lkTel').value.replace(/\D/g,'').slice(-9),sid=$('#lkServ').value,bid=$('#lkBarb').value,ade=$('#lkAde').value,dias=+$('#lkVen').value;
 if(!nom)return toast('Escribe el nombre del cliente');const s=S.servicios.find(x=>x.id===sid);
 const l={id:uid(),token:tokenL(),tipo:'personal',creado:Date.now(),creadoPor:S.ses.barberoId||'admin',estado:'disponible',cliente:{nombre:nom,tel},servicioId:sid||'',servicioNombre:s?.nombre||'',barberoId:bid||'',adelanto:ade===''?null:Math.max(0,+ade),nota:$('#lkNota').value.trim(),vence:dias?Date.now()+dias*864e5:null};
 const w=modo==='copiar'?null:ventana();
 try{const g=API.saveLink(l).then(()=>linkUrl(l));
  if(modo==='copiar'){await copiarP(g)}else{const url=await g,msg=`Hola ${nom} 👋 Te dejo tu link personal para reservar en *${S.cfg.nombre}*, sobrino 💈${l.nota?`\n🎁 ${l.nota}`:''}\n${url}${l.vence?`\n⏱ Válido hasta el ${fCorta(l.vence)}`:''}`;irA(w,waUrl(tel?waNum(tel):'',msg))}
  toast('🔑 Link generado');renderCompartir()}catch(e){w?.close();toast('❌ '+e.message)}}
async function linkRapido(modo){const l={id:uid(),token:tokenL(),tipo:'rapido',creado:Date.now(),creadoPor:S.ses.barberoId||'admin',estado:'disponible',cliente:null,barberoId:isAdmin()?'':S.ses.barberoId,adelanto:null,vence:Date.now()+7*864e5};
 const w=modo==='copiar'?null:ventana();
 try{const g=API.saveLink(l).then(()=>linkUrl(l));
  if(modo==='copiar')await copiarP(g);else{const url=await g;irA(w,modo==='abrir'?url:'https://wa.me/?text='+encodeURIComponent(`💈 Reserva tu corte en *${S.cfg.nombre}*, sobrino 👇\n${url}`))}
  renderCompartir()}catch(e){w?.close();toast('❌ '+e.message)}}
function compartirLink(id){const l=S.links.find(x=>x.id===id);if(!l)return;const url=linkUrl(l),msg=l.tipo==='rapido'?`💈 Reserva tu corte en *${S.cfg.nombre}*, sobrino 👇\n${url}`:`Hola ${l.cliente?.nombre||''} 👋 Tu link personal para reservar en *${S.cfg.nombre}* 💈\n${url}`;
 l.cliente?.tel?abrirWA(l.cliente.tel,msg):window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank')}
async function borrarLink(id){if(!confirm('¿Eliminar este link? Si alguien lo abre verá que ya no es válido.'))return;await API.delLink(id);renderCompartir()}
function ayudaLinks(){openModal(mHead('📖 Links para clientes')+[
 ['🔑 Link personalizado','Pones el nombre (y si quieres el corte, el barbero, un adelanto especial o una promo). El cliente entra con sus datos ya puestos y el Tío Stereo lo saluda por su nombre.'],
 ['⚡ Link rápido','Un link sin datos para mandar rápido. Sirve una sola vez y vence en 7 días.'],
 ['🔒 Un solo uso','Cuando el cliente reserva, el link queda "Usado" y ya no se puede volver a usar.'],
 ['💸 Adelanto especial','Pon 0 para clientes VIP que no pagan adelanto, o déjalo vacío para usar el normal.'],
 ['🌐 Link público','El de abajo no se bloquea: es para redes sociales y el QR.']].map((x,i)=>`<div class="stp"><b>${i+1}</b><div><b>${x[0]}</b><p class="hint" style="margin-top:2px">${x[1]}</p></div></div>`).join(''))}
function bajarQR(){const c=$('#qr canvas'),i=$('#qr img');const src=c?c.toDataURL('image/png'):i?.src;if(!src)return toast('QR no disponible');const a=document.createElement('a');a.href=src;a.download='qr-reservas.png';a.click()}

/* =================== MENÚ (esquina derecha): Excel, respaldo y más =================== */
function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`))return res();const s=document.createElement('script');s.src=src;if(src===XLSX_SRC)s.integrity=XLSX_SRI;s.onload=res;s.onerror=()=>rej(new Error('No se pudo cargar Excel'));document.head.appendChild(s)})}
const XLSX_SRC='vendor/xlsx.full.min.js',XLSX_SRI='sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
const COLS=['Código','Fecha','Hora','Cliente','Teléfono','Ciudad','Barbero','Servicio','Precio','Adelanto','Adelanto validado','Estado','Nota','Origen','Gratis','Creado'];
function abrirMenu(){openModal(`<div class="grab"></div>${mHead('☰ Menú')}
 <div class="card" style="padding:12px 14px"><div class="row"><span class="av lg">👤</span><div style="flex:1"><b>${esc(S.ses.nombre||'')}</b><p class="hint" style="margin:0">${S.ses.uid?ROLES[S.ses.rol]?.t||'':S.ses.rol==='barbero'?'💈 Barbero':'👑 Dueño'} · ${Object.values(S.perm).filter(Boolean).length}/${PERMS.length} permisos</p></div></div>${misCitas()}</div>
 ${API.remote&&can('verMontos')&&can('verTodas')?`<button class="btn w" style="padding:14px;margin-bottom:8px" data-on-click="abrirReporte">📊 Reporte semanal de caja</button>`:''}
 ${can('dash')?`<button class="btn w" style="padding:14px;margin-bottom:8px" data-on-click="aba7c1122">📈 Dashboard del negocio</button>`:''}
 ${can('excel')?`<button class="btn w" style="padding:14px;margin-bottom:8px" data-on-click="a62e261c1">📊 Excel y respaldo</button>`:''}
 ${can('config')?`<button class="btn w" style="padding:14px;margin-bottom:8px" data-on-click="a465d46a3">👥 Usuarios y permisos</button>`:''}
 <button class="btn w" style="padding:14px;margin-bottom:8px" data-on-click="a127fcd5a">📖 Cómo funciona</button>
 <button class="btn r w" style="padding:14px" data-on-click="a973cd47a">🚪 Cerrar sesión</button>
 <p class="hint" style="text-align:center">👆👆 Doble toque en el nombre → Dashboard · Toca el logo → Excel y respaldo</p>`)}
function misCitas(){const bid=S.ses.barberoId||(S.usuarios.find(u=>u.id===S.ses.uid)?.barberoId);const cs=S.citas.filter(c=>(bid?c.barberoId===bid:can('verTodas'))&&activa(c)&&startTs(c)>Date.now()-30*60000&&c.estado!=='atendida').sort((a,b)=>startTs(a)-startTs(b));
 if(!cs.length)return'<p class="hint">Sin citas próximas.</p>';const n=cs[0];return `<p class="hint">📅 ${cs.length} cita(s) próximas · la siguiente <b style="color:var(--blue)">${falta(startTs(n))}</b>: ${esc(n.cliente?.nombre)} (${h12(n.hora)})</p>`}
function abrirDatos(){openModal(`<div class="grab"></div><div class="mn"><h3 style="margin-bottom:14px">📊 Importar / Exportar Excel<button class="btn sm" data-on-click="a31042dab">📖 Ayuda</button></h3>
 <div class="card"><p class="lb" style="margin-top:0;color:var(--blue)">⬇ Exportar</p>
  <button class="btn p w" style="padding:16px;font-size:16px;background:linear-gradient(135deg,var(--blue),color-mix(in srgb,var(--blue) 70%,#000))" data-on-click="a950f3b19">📊 Descargar todas las citas en Excel</button>
  <p class="hint">Descarga un archivo .xlsx con todas tus citas. Guárdalo como respaldo o ábrelo en Excel/Sheets.</p>
  <button class="btn w" style="margin-top:10px" data-on-click="a611625a3">👥 Descargar lista de clientes</button></div>
 <div class="card"><p class="lb" style="margin-top:0;color:var(--grn)">⬆ Importar</p><p class="hint" style="margin-top:0">Sube un archivo Excel exportado desde este panel para restaurar o agregar citas masivamente.</p>
  <label class="btn w" style="margin-top:12px;padding:14px;color:var(--grn);border-color:#2ea043">📂 Seleccionar archivo Excel<input type="file" accept=".xlsx,.xls,.csv" style="display:none" data-on-change="a6daa7f24"></label></div>
 <div class="cols" style="margin-bottom:12px"><b style="color:var(--blue)">📋 Columnas del archivo:</b><br>${COLS.join(' · ')}</div>
 <div class="card" style="border-color:#2ea04366"><h4><span style="color:var(--grn);font:800 20px 'Syne';text-transform:none;letter-spacing:0">🛡️ Respaldo completo</span><button class="btn sm" data-on-click="a31042dab">📖 Ayuda</button></h4>
  <p class="hint" style="margin-top:0">Guarda o recupera <b style="color:var(--tx)">todo</b> el sistema (citas, clientes, links, barberos, servicios, usuarios y configuración) en un archivo .json. Más completo que Excel.</p>
  <button class="btn g w" style="margin-top:12px;padding:16px;font-size:16px" data-on-click="adcacc9dc">🛡️ Crear y descargar respaldo</button>
  <label class="btn w" style="margin-top:10px;padding:14px">♻️ Restaurar respaldo<input type="file" accept=".json" style="display:none" data-on-change="a6ee55804"></label></div></div>`)}
async function exportarClientes(){try{toast('⏳ Preparando…');await loadScript(XLSX_SRC);let rows;if(nube()){let all=[],cur='';do{const r=await API.req('GET','/clientes?orden=nombre&limit=200'+(cur?'&cursor='+encodeURIComponent(cur):''));all=all.concat(r.items);cur=r.siguiente}while(cur&&all.length<50000);rows=all.map(c=>({'Nombre':c.nombre,'Teléfono':c.tel,'DNI':c.dni||'','Ciudad':c.ciudad||'','Visitas':c.visitas,'Gastado':c.gasto,'Faltas':c.faltas,'Cliente desde':c.primera||'','Última visita':c.ultima||'','Próxima cita':c.prox||'','Preferencias':c.prefs||'','Notas':c.notas||''}))}else rows=clientes().map(c=>({'Nombre':c.nombre,'Teléfono':c.tel,'Ciudad':c.ciudad||'','Visitas':c.vis,'Gastado':c.gasto,'Faltas':c.nov,'Última visita':c.ultAt}));const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Clientes');XLSX.writeFile(wb,`clientes-${hoy()}.xlsx`);toast('✅ Clientes descargados')}catch(e){toast('❌ '+e.message)}}
function ayudaExcel(){openModal(mHead('📖 Excel')+`<div class="stp"><b>1</b><div><b>Exportar</b><p class="hint" style="margin-top:2px">Descarga todas las citas con sus datos. Ideal para tu control mensual.</p></div></div><div class="stp"><b>2</b><div><b>Importar</b><p class="hint" style="margin-top:2px">Si una fila tiene un Código que ya existe, se actualiza; si no, se agrega como nueva. Barbero, servicio y estado se reconocen por su nombre.</p></div></div><div class="stp"><b>3</b><div><b>Respaldo completo</b><p class="hint" style="margin-top:2px">Úsalo antes de cambiar de celular. Las fotos quedan en el equipo.</p></div></div>`)}
async function exportarExcel(){try{toast('⏳ Preparando Excel…');await loadScript(XLSX_SRC);
 const rows=(await historial()).slice().sort((a,b)=>(a.fecha+a.hora).localeCompare(b.fecha+b.hora)).map(c=>({'Código':c.codigo,'Fecha':c.fecha,'Hora':c.hora,'Cliente':c.cliente?.nombre||'','Teléfono':c.cliente?.tel||'','DNI':c.cliente?.dni||'','Ciudad':c.cliente?.ciudad||'','Barbero':barb(c.barberoId)?.nombre||'','Servicio':c.servicioNombre||'','Precio':+c.precio||0,'Adelanto':+c.adelanto||0,'Adelanto validado':c.adelantoOk?'Sí':'No','Estado':est(c.estado).t,'Nota':c.nota||'','Origen':c.origen||'','Gratis':c.gratis?'Sí':'No','Creado':c.creada?new Date(c.creada).toLocaleString('es-PE'):''}));
 const ws=XLSX.utils.json_to_sheet(rows,{header:COLS});ws['!cols']=COLS.map(h=>({wch:Math.max(10,h.length+2)}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Citas');XLSX.writeFile(wb,`citas-${S.cfg.nombre.replace(/\W+/g,'-')}-${hoy()}.xlsx`);toast('✅ Excel descargado')}catch(e){toast('❌ '+e.message)}}
async function importarExcel(inp){const f=inp.files[0];if(!f)return;try{await loadScript(XLSX_SRC);const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
 const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
 const byName=(arr,n)=>arr.find(x=>norm(x.nombre)===norm(n));const estKey=n=>Object.keys(DEF_EST).find(k=>norm(est(k).t)===norm(n)||k===norm(n))||'confirmada';
 const toFecha=v=>{if(typeof v==='number'){const d=new Date(Math.round((v-25569)*864e5));return ymd(new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))}return String(v).slice(0,10)};
 const toHora=v=>{if(typeof v==='number'){const m=Math.round(v*1440);return fromMin(m%1440)}return String(v).slice(0,5)};
 const arr=rows.filter(r=>r['Fecha']&&(r['Cliente']||r['Código'])).map(r=>{const b=byName(S.barberos,r['Barbero']),sv=byName(S.servicios,r['Servicio']);return{codigo:String(r['Código']||'').trim()||undefined,fecha:toFecha(r['Fecha']),hora:toHora(r['Hora']),barberoId:b?.id||'',servicioId:sv?.id||'',servicioNombre:r['Servicio']||sv?.nombre||'',precio:+r['Precio']||0,adelanto:+r['Adelanto']||0,adelantoOk:/^s/i.test(r['Adelanto validado']),estado:estKey(r['Estado']),nota:r['Nota']||'',origen:r['Origen']||'excel',gratis:/^s/i.test(r['Gratis']),cliente:{nombre:String(r['Cliente']||''),tel:String(r['Teléfono']||'').replace(/\D/g,''),dni:String(r['DNI']||'').replace(/\D/g,'').slice(0,8),ciudad:r['Ciudad']||''}}});
 if(!arr.length)throw new Error('No encontré filas con Fecha y Cliente');if(!confirm(`¿Importar ${arr.length} citas del Excel?`))return;
 const r=await API.importCitas(arr);closeModal();await reload();toast(`✅ ${r.n} nuevas · ${r.u} actualizadas`)}catch(e){toast('❌ '+e.message)}}

