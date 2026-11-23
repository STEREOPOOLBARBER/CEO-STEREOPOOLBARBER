/* =================== 🗑️ PAPELERA ===================
   Las citas eliminadas quedan aquí 7 días (worker/modulos/papelera.js): «Recuperar» las devuelve a la agenda
   (si su horario ya se ocupó, vuelven como canceladas) y «Eliminar ya» las borra para siempre.
   Después de 7 días se borran solas, con sus fotos. Permiso «cancelar»; el barbero sin «ver todas», solo las suyas.
   ===================================================================== */
const quedan=v=>Math.max(0,Math.ceil((v-Date.now())/864e5));
async function abrirPapelera(){openModal(mHead('🗑️ Papelera')+'<div class="spin"></div>');let r;
 try{r=await API.req('GET','/papelera')}catch(e){return $('#mbody').innerHTML=mHead('🗑️ Papelera')+`<div class="empty">⚠️ ${esc(e.message)}</div>`}
 $('#mbody').innerHTML=mHead('🗑️ Papelera')+`<p class="hint" style="margin-top:0">Las citas eliminadas quedan aquí <b>${r.dias} días</b> y luego se borran para siempre (con sus fotos). «Recuperar» la devuelve a la agenda.</p>
 ${r.items.length?r.items.map(x=>{const q=quedan(x.vence);return `<div class="card" style="padding:12px 14px"><div class="row" style="justify-content:space-between;gap:8px"><b>${esc(x.cliente||'Cliente')}</b><span class="hint" style="margin:0">#${esc(x.codigo||'')}</span></div>
  <p class="hint" style="margin:4px 0 0">${fLarga(x.fecha)} · ${h12(x.hora)} · ${esc(x.servicio)}${x.precio!=null?' · '+soles(x.precio):''} · ${esc(est(x.estado).t)}</p>
  <p class="hint" style="margin:2px 0 0">Eliminada por ${esc(x.quien)} · ${q?`se borra en ${q} día${q===1?'':'s'}`:'se borra hoy'}</p>
  <div class="row" style="gap:8px;margin-top:8px"><button class="btn sm p" data-on-click="papRecuperar" data-p0="${x.id}">↩️ Recuperar</button><button class="btn sm r" style="margin-left:auto" data-on-click="papBorrar" data-p0="${x.id}">Eliminar ya</button></div></div>`}).join(''):'<div class="empty">🗑️ La papelera está vacía.</div>'}`}
ACC.abrirPapelera=function(){abrirPapelera()};
ACC.papRecuperar=async function(){this.disabled=true;
 try{const r=await API.req('POST','/papelera/'+this.dataset.p0+'/recuperar',{});await reload();toast(r.ocupado?'↩️ Recuperada como CANCELADA: su horario ya estaba ocupado. Edítala para darle otra hora.':'↩️ Recuperada en la agenda');abrirPapelera()}
 catch(e){this.disabled=false;toast('❌ '+e.message)}};
ACC.papBorrar=async function(){if(!confirm('¿Eliminar para siempre? Ya no se podrá recuperar.'))return;
 try{await API.req('DELETE','/papelera/'+this.dataset.p0);await reload();toast('Eliminada para siempre');abrirPapelera()}catch(e){toast('❌ '+e.message)}};
