/* =================== ⭐ CALIFICACIONES (anónimas) ===================
   Lo que los clientes opinan desde el estado de su cita (worker/modulos/calificaciones.js).
   Sin nombres, celulares ni fechas exactas: solo el mes. Un barbero muestra su promedio y sus comentarios
   cuando junta el mínimo (3), para que no se pueda adivinar quién fue. Requiere el permiso del dashboard.
   ===================================================================== */
const ETQ_CALIF={corte:'✂️ Corte',trato:'🤝 Trato',puntualidad:'⏰ Puntualidad',limpieza:'🧼 Limpieza',ambiente:'🎶 Ambiente'};
const estrellasTxt=n=>'⭐'.repeat(Math.round(n))+'☆'.repeat(5-Math.round(n));
const mesTxt=m=>{const[y,x]=m.split('-').map(Number);return `${MES[x-1]} ${y}`};
async function abrirCalificaciones(){openModal(mHead('⭐ Calificaciones')+'<div class="spin"></div>');let r;
 try{r=await API.req('GET','/calificaciones')}catch(e){return $('#mbody').innerHTML=mHead('⭐ Calificaciones')+`<div class="empty">⚠️ ${esc(e.message)}</div>`}
 const g=r.general,bloque=x=>x.oculto?`<p class="hint" style="margin:6px 0 0">🔒 ${x.n} calificación${x.n===1?'':'es'} · se muestra al juntar ${r.minimo} (faltan ${x.faltan}) para cuidar el anonimato.</p>`
  :`<div class="row" style="align-items:baseline;gap:8px"><b class="syne" style="font-size:30px">${x.promedio}</b><span style="color:var(--yel)">${estrellasTxt(x.promedio)}</span><span class="hint" style="margin:0">${x.n} opiniones</span></div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${Object.entries(x.etiquetas).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<span class="pill">${ETQ_CALIF[k]||esc(k)} · ${n}</span>`).join('')}</div>`;
 $('#mbody').innerHTML=mHead('⭐ Calificaciones')+`<p class="hint" style="margin-top:0">Anónimas: los clientes califican desde el estado de su cita (hasta 7 días después del corte).</p>
 <div class="card"><p class="lb" style="margin-top:0">General</p>${g.n?bloque(g):'<p class="hint" style="margin:0">Aún no hay calificaciones.</p>'}</div>
 ${r.barberos.map(b=>{const x=barb(b.id);return `<div class="card"><p class="lb" style="margin-top:0">💈 ${esc(x?.nombre||'Sin barbero')}</p>${bloque(b)}
  ${b.comentarios?.length?`<div style="margin-top:10px">${b.comentarios.map(c=>`<div class="li" style="display:block"><span style="color:var(--yel)">${estrellasTxt(c.estrellas)}</span> <small class="hint">${mesTxt(c.mes)}</small><p style="margin:4px 0 0">${esc(c.comentario)}</p></div>`).join('')}</div>`:''}</div>`}).join('')}`}
ACC.abrirCalificaciones=function(){abrirCalificaciones()};
