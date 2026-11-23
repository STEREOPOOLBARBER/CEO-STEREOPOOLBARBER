/* =================== 🏷️ PROMOCIONES ===================
   Una promo = un servicio con precio especial entre dos fechas (y, si quieres, solo ciertos días).
   El cliente las ve en su app «Mi cita» y en el formulario; el precio lo pone el Worker al reservar
   (worker/modulos/promos.js). Aquí: crear, editar, pausar, ordenar y ver cuánto rinden. Permiso «config».
   ===================================================================== */
const PR={lista:[],stats:{},hoy:'',max:12,ed:null};
const prServ=id=>S.servicios.find(s=>s.id===id);
const prDias=p=>!p.dias?.length?'Todos los días':ORDEN.filter(x=>p.dias.includes(x)).map(x=>DIAS[x]).join(', ');
const prFecha=f=>{const d=pYmd(f);return `${d.getDate()} ${MESC[d.getMonth()]}`};
function prEstado(p){if(p.activo===false)return['Pausada','var(--mu)'];if(p.hasta<PR.hoy)return['Vencida','var(--red)'];if(p.desde>PR.hoy)return['Programada','var(--yel)'];return['Activa','var(--grn)']}
async function abrirPromos(){openModal(mHead('🏷️ Promociones')+'<div class="spin"></div>');
 try{const r=await API.req('GET','/promos');Object.assign(PR,{lista:r.promos,stats:r.stats,hoy:r.hoy,max:r.max})}catch(e){return $('#mbody').innerHTML=mHead('🏷️ Promociones')+`<div class="empty">⚠️ ${esc(e.message)}</div>`}
 pintarPromos()}
function pintarPromos(){const L=PR.lista;
 $('#mbody').innerHTML=mHead('🏷️ Promociones')+`<p class="hint" style="margin-top:0">Tus clientes las ven en su app «Mi cita» y en el formulario. El precio promo se aplica solo al reservar ese servicio en un día válido.</p>
 ${L.length?L.map((p,i)=>{const s=prServ(p.servicioId),[et,col]=prEstado(p),st=PR.stats[p.id]||{};return `<div class="card" style="padding:12px 14px">
  <div class="row" style="gap:10px;align-items:flex-start">${p.foto?`<img data-foto="${p.foto}" style="width:56px;height:56px;border-radius:12px;object-fit:cover;flex:none" alt="">`:'<span class="av lg">🏷️</span>'}
   <div style="flex:1;min-width:0"><b>${esc(p.titulo)}</b><p class="hint" style="margin:2px 0 0">${esc(s?.nombre||'Servicio borrado')} · <s>${soles(s?.precio)}</s> <b>${soles(p.precio)}</b></p>
   <p class="hint" style="margin:2px 0 0">${prFecha(p.desde)} → ${prFecha(p.hasta)} · ${prDias(p)} · <b style="color:${col}">${et}</b></p></div>
   <button class="sw ${p.activo!==false?'on':''}" aria-label="Activa" data-on-click="prActiva" data-p0="${i}"></button></div>
  <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><span class="pill">👀 ${st.vistas||0} vista${st.vistas===1?"":"s"}</span><span class="pill">👆 ${st.clics||0} toque${st.clics===1?"":"s"}</span><span class="pill">📅 ${st.citas||0} cita${st.citas===1?"":"s"}</span>${can('verMontos')?`<span class="pill">💰 ${soles(st.monto||0)}</span>`:''}</div>
  <div class="row" style="gap:6px;margin-top:8px"><button class="btn sm" data-on-click="prEditar" data-p0="${i}">✏️ Editar</button>${i?`<button class="btn sm" aria-label="Subir" data-on-click="prSubir" data-p0="${i}">⬆️</button>`:''}<button class="btn sm r" style="margin-left:auto" data-on-click="prBorrar" data-p0="${i}">🗑️</button></div></div>`}).join(''):'<div class="empty">Aún no tienes promociones.</div>'}
 ${L.length<PR.max?`<button class="btn p w" style="padding:14px" data-on-click="prEditar" data-p0="">➕ Nueva promoción</button>`:`<p class="hint">Llegaste al máximo de ${PR.max} promociones.</p>`}
 <p class="hint">«Vistas» y «toques» cuentan cuántas veces la vieron y tocaron «Reservar»; «citas», las reservas que salieron con ese precio.</p>`;hydrate($('#mbody'))}
async function guardarPromos(msg){try{const r=await API.req('PUT','/promos',{promos:PR.lista});PR.lista=r.promos;toast(msg||'✅ Guardado');pintarPromos()}catch(e){toast('❌ '+e.message);abrirPromos()}}

/* ---------- editar una promo ---------- */
function prEditar(i){const sv=S.servicios.filter(s=>s.activo!==false),p=i===''?{id:'',titulo:'',texto:'',foto:'',servicioId:sv[0]?.id||'',precio:'',desde:PR.hoy,hasta:addD(PR.hoy,30),dias:[],activo:true}:clone(PR.lista[+i]);
 PR.ed={i,p};
 $('#mbody').innerHTML=mHead(i===''?'➕ Nueva promoción':'✏️ Editar promoción')+`
 <label class="upl"><span class="prev" id="prPrev">${p.foto?`<img data-foto="${p.foto}">`:'🏷️'}</span><span class="btn sm">📷 Foto (opcional)</span><input type="file" accept="image/*" data-on-change="prFoto"></label>
 <label class="lb">Título (corto)</label><input class="in" id="prTit" data-on-input="prPrecioNormal" maxlength="40" value="${esc(p.titulo)}" placeholder="Ej: Martes de fade">
 <label class="lb">Texto</label><textarea class="in" id="prTxt" data-on-input="prPrecioNormal" maxlength="140" rows="2" placeholder="Ej: Tu fade a precio especial todos los martes">${esc(p.texto)}</textarea>
 <label class="lb">Servicio</label><select class="in" id="prSrv" data-on-change="prPrecioNormal">${sv.map(s=>`<option value="${s.id}" ${s.id===p.servicioId?'selected':''}>${esc(s.nombre)} · ${soles(s.precio)}</option>`).join('')}</select>
 <label class="lb">Precio promo <span id="prNormal" class="hint"></span></label><input class="in" id="prPre" data-on-input="prPrecioNormal" type="number" min="1" step="0.5" inputmode="decimal" value="${esc(p.precio)}">
 <div class="row" style="gap:8px"><div style="flex:1"><label class="lb">Desde</label><input class="in" id="prDes" type="date" value="${p.desde}"></div><div style="flex:1"><label class="lb">Hasta</label><input class="in" id="prHas" type="date" value="${p.hasta}"></div></div>
 <label class="lb">Días que vale <span class="hint">(ninguno marcado = todos)</span></label><div class="dchips" id="prDias"></div>
 <p class="lb">Así la verá el cliente</p><div id="prVista"></div>
 <button class="btn p w" style="margin-top:16px;padding:14px" data-on-click="prGuardar">💾 Guardar promoción</button>
 <button class="btn w" style="margin-top:8px" data-on-click="prVolver">← Volver</button>`;
 prPintarDias();prNormal();hydrate($('#mbody'))}
function prLeer(){const p=PR.ed.p,v=id=>$(id)?.value??'';Object.assign(p,{titulo:v('#prTit').trim(),texto:v('#prTxt').trim(),servicioId:v('#prSrv'),precio:+v('#prPre')||'',desde:v('#prDes'),hasta:v('#prHas')});return p}
function prPintarDias(){const p=PR.ed.p;$('#prDias').innerHTML=ORDEN.map(x=>`<button class="dchip ${p.dias.includes(x)?'on':''}" data-on-click="prDia" data-p0="${x}">${DIAS[x]}</button>`).join('')}
function prNormal(){const p=prLeer(),s=prServ(p.servicioId);$('#prNormal').textContent=s?`(normal ${soles(s.precio)})`:'';
 $('#prVista').innerHTML=`<div class="card" style="padding:12px;max-width:220px">${p.foto?`<img data-foto="${p.foto}" style="width:100%;height:110px;object-fit:cover;border-radius:10px" alt="">`:''}<b style="display:block;margin-top:6px">${esc(p.titulo||'Título')}</b><small class="hint">${esc(p.texto||'')}</small><p style="margin:6px 0 0"><s class="hint">${soles(s?.precio)}</s> <b>${soles(p.precio)}</b></p></div>`;hydrate($('#prVista'))}
ACC.abrirPromos=function(){abrirPromos()};
ACC.prEditar=function(){prEditar(this.dataset.p0)};
ACC.prVolver=function(){pintarPromos()};
ACC.prPrecioNormal=function(){prNormal()};
ACC.prDia=function(){prLeer();const x=+this.dataset.p0,d=PR.ed.p.dias;PR.ed.p.dias=d.includes(x)?d.filter(y=>y!==x):[...d,x];prPintarDias()};
ACC.prFoto=async function(){const f=this.files[0];if(!f)return;prLeer();try{PR.ed.p.foto=await API.putFoto(await compressImg(f,720,.8));$('#prPrev').innerHTML=`<img data-foto="${PR.ed.p.foto}">`;hydrate($('#prPrev'));prNormal()}catch(e){toast('❌ '+e.message)}};
ACC.prGuardar=function(){const p=prLeer(),s=prServ(p.servicioId);
 if(p.titulo.length<3)return toast('Escribe un título');
 if(!s)return toast('Elige un servicio');
 if(!(p.precio>0)||p.precio>=+s.precio)return toast(`El precio promo debe ser menor que ${soles(s.precio)}`);
 if(!p.desde||!p.hasta||p.desde>p.hasta)return toast('Revisa las fechas');
 if(PR.ed.i==='')PR.lista.push(p);else PR.lista[+PR.ed.i]=p;guardarPromos()};
ACC.prActiva=function(){const p=PR.lista[+this.dataset.p0];p.activo=p.activo===false;guardarPromos(p.activo?'✅ Promoción activa':'⏸️ Promoción pausada')};
ACC.prSubir=function(){const i=+this.dataset.p0,L=PR.lista;[L[i-1],L[i]]=[L[i],L[i-1]];guardarPromos('✅ Orden guardado')};
ACC.prBorrar=function(){const i=+this.dataset.p0;if(!confirm(`¿Borrar la promoción «${PR.lista[i].titulo}»? Las citas ya hechas mantienen su precio.`))return;PR.lista.splice(i,1);guardarPromos('🗑️ Promoción borrada')};
