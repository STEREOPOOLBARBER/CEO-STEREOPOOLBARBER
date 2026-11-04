/* =================== FILTROS DE LA AGENDA ===================
   Una sola «vista» (S.vista) decide qué se ve: periodo, etiqueta, texto, filtros y orden.
   · VISTA_DEF(): lo predeterminado (Hoy · Todos · sin filtros · por hora). «Limpiar» vuelve exactamente a esto.
   · De dónde salen las citas:
       - del navegador (filtroLocal): el día elegido, que el panel ya tiene en memoria, y el modo demo;
       - del servidor (paramsVista → /citas/buscar y /citas/conteo): el mes, un rango, la búsqueda con texto
         y los filtros de cliente (necesitan toda la historia). La misma regla vive en worker/modulos/filtros.js.
   · alcance: qué partes de la vista se aplican. La lista usa todo; los números de las etiquetas no filtran
     por etiqueta (cuentan cada una) ni por los filtros propios de una etiqueta (captura, fotos, tipo).
   =========================================================== */
const VISTA_DEF=()=>({per:{t:'dia',f:hoy()},etq:'todos',q:'',barb:[],serv:[],pago:'',origen:'',cli:'',wa:'',captura:'',foto:'',tipo:'',orden:'hora'});
S.vista=VISTA_DEF();

/* ---------- periodo ---------- */
function rangoPer(p){if(p.t==='dia')return{d:p.f,h:p.f};if(p.t==='rango')return{d:p.d,h:p.h};const[y,m]=p.m.split('-').map(Number);return{d:p.m+'-01',h:ymd(new Date(y,m,0))}}
function textoPer(p){if(p.t==='dia')return p.f===hoy()?'Hoy':fLarga(p.f);if(p.t==='mes'){const[y,m]=p.m.split('-').map(Number);return `${MES[m-1]} ${y}`}return p.d===p.h?fCortaD(p.d):`${fCortaD(p.d)} – ${fCortaD(p.h)}`}
const mesMas=(m,n)=>{const[y,x]=m.split('-').map(Number),d=new Date(y,x-1+n,1);return ymd(d).slice(0,7)};
const conTexto=v=>v.q.trim().length>=2;
const todasLasFechas=v=>conTexto(v)||v.etq==='por_validar'; // la búsqueda y «Yape por validar» miran todos los días
const usaServidor=v=>nube()&&(conTexto(v)||v.per.t!=='dia'||!!v.cli);
const ALC_LISTA=v=>({estado:true,periodo:!todasLasFechas(v),etq:true,orden:true});
const ALC_CONTEO=v=>({estado:false,periodo:!conTexto(v),etq:false,orden:false});

/* ---------- etiquetas, filtros y órdenes ---------- */
const ESTADOS_ETQ={todos:['por_validar','pendiente_pago','confirmada','en_silla','atendida','no_vino','cancelada'],por_validar:['por_validar','pendiente_pago'],cancelada:['cancelada','expirada']};
const estadosDe=v=>v.etq==='cancelada'&&v.tipo?[v.tipo]:ESTADOS_ETQ[v.etq]||[v.etq];
const pagoDe=c=>c.gratis?'gratis':+c.adelanto>0?(c.adelantoOk?'yape_ok':'yape_pend'):'sin';
const origenDe=c=>['web','link'].includes(c.origen)?'web':c.origen==='walkin'?'walkin':'panel';
const waDe=c=>c.asistencia?'confirmo':recordada(c)?'recordado':'sin_recordar';
const montoDe=c=>c.gratis?0:+c.precio||0;
/* Cada filtro: título, opciones [valor, texto], si se elige más de uno, quién lo ve y, si es propio de una etiqueta, cuál. */
const DIMS={
 barb:{t:'💈 Barbero',multi:true,ver:()=>isAdmin(),ops:()=>S.barberos.filter(b=>b.activo!==false||S.vista.barb.includes(b.id)).map(b=>[b.id,'💈 '+b.nombre])},
 serv:{t:'✂️ Servicio',multi:true,ver:()=>S.servicios.length>0,ops:()=>S.servicios.map(s=>[s.id,`${s.emoji||'✂️'} ${s.nombre}`])},
 pago:{t:'💰 Pago',ver:()=>can('verMontos'),ops:()=>[['yape_ok','✅ Adelanto validado'],['yape_pend','🟡 Yape pendiente'],['sin','💵 Sin adelanto'],['gratis','🎁 Gratis']]},
 origen:{t:'📲 Origen',ops:()=>[['web','🌐 Reservó por link'],['panel','🖥️ Agendada en panel'],['walkin','⚡ Sin cita']]},
 cli:{t:'👤 Cliente',ver:()=>can('dash'),ops:()=>[['nuevo','🆕 Nuevo (primera visita)'],['frecuente','⭐ Frecuente (3+ visitas)'],...(nube()?[['notas','📝 Con notas']]:[])]},
 wa:{t:'💬 WhatsApp',ops:()=>[['confirmo','👍 Confirmó que viene'],['recordado','⏰ Recordado sin respuesta'],['sin_recordar','🔕 Sin recordar']]},
 captura:{t:'🧾 Captura de Yape',etq:'por_validar',ops:()=>[['con','🧾 Con captura'],['sin','⏳ Sin captura']]},
 foto:{t:'📸 Fotos',etq:'atendida',ver:()=>!!S.cfg.modFotos,ops:()=>[['sin_despues','📸 Sin foto «después»']]},
 tipo:{t:'🏷️ Tipo',etq:'cancelada',ops:()=>[['cancelada','🚫 Canceladas'],['expirada','⌛ Expiradas (Yape no pagado)']]},
};
const DIMS_GEN=['barb','serv','pago','origen','cli','wa'];
const dimVisible=k=>!DIMS[k].ver||DIMS[k].ver();
const dimAplica=(k,v)=>!DIMS[k].etq||DIMS[k].etq===v.etq;
const ORDENES={hora:{t:'🕘 Por hora',k:c=>[c.fecha,c.hora||'',c.id]},hora_desc:{t:'🕘 Más reciente primero',desc:true,k:c=>[c.fecha,c.hora||'',c.id]},
 nombre:{t:'🔤 Nombre A–Z',k:c=>[(c.cliente?.nombre||'').toLowerCase(),c.fecha,c.hora||'',c.id]},monto:{t:'💰 Mayor monto',ver:()=>can('verMontos'),k:c=>[-montoDe(c),c.fecha,c.hora||'',c.id]},
 creada:{t:'📝 Más antiguo primero',k:c=>[c.creada||0,c.id]},vence:{t:'⏳ Por vencer',k:c=>[c.expira||9e15,c.fecha,c.hora||'',c.id]},silla:{t:'💺 Más tiempo en silla',k:c=>[c.enSillaTs||9e15,c.id]}};
const ORD_GEN=['hora','hora_desc','nombre','monto'];
/* Lo que ofrece cada etiqueta al tocarla 2 veces: sus órdenes (el primero es el suyo por defecto) y sus filtros. */
const ETQ={todos:{ord:['hora','hora_desc','nombre','monto']},por_validar:{ord:['creada','vence','hora'],dims:['captura']},confirmada:{ord:['hora','nombre'],dims:['wa']},
 en_silla:{ord:['silla','hora']},atendida:{ord:['hora','hora_desc','monto'],dims:['foto','pago']},no_vino:{ord:['hora_desc','hora'],dims:['cli']},cancelada:{ord:['hora_desc','hora'],dims:['tipo']}};
const ordenVisible=k=>!ORDENES[k].ver||ORDENES[k].ver();
const ordenDef=etq=>ETQ[etq].ord[0];
const ordenesDe=etq=>[...new Set([...ETQ[etq].ord,...ORD_GEN])].filter(ordenVisible);
// Cada etiqueta recuerda en este celular el orden que se eligió.
const ordenGuardado=etq=>{const o=lsGet('ordenEtq',{})[etq];return ORDENES[o]&&ordenVisible(o)?o:ordenDef(etq)};
function guardarOrden(etq,o){const m=lsGet('ordenEtq',{});if(o===ordenDef(etq))delete m[etq];else m[etq]=o;lsSet('ordenEtq',m)}

/* ---------- la regla en el navegador ---------- */
function historiaLocal(){const m={};S.citas.forEach(c=>{if(c.estado==='atendida'){const k=telKey(c.cliente?.tel);if(k)(m[k]=m[k]||[]).push(c.fecha)}});return m}
function pasaCliente(c,cli,h){const k=telKey(c.cliente?.tel);if(!k)return false;const fs=h[k]||[];return cli==='nuevo'?!fs.some(f=>f<c.fecha):cli==='frecuente'?fs.length>=3:false}
function filtroLocal(v,alc){
 const r=rangoPer(v.per),est=estadosDe(v),txt=conTexto(v)?v.q.trim().toLowerCase():'',dig=txt.replace(/\D/g,''),h=v.cli?historiaLocal():null;
 const etq=k=>alc.etq&&dimAplica(k,v)&&v[k];
 return c=>(!alc.estado||est.includes(c.estado))&&(!alc.periodo||(c.fecha>=r.d&&c.fecha<=r.h))
  &&(!v.barb.length||v.barb.includes(c.barberoId))&&(!v.serv.length||v.serv.includes(c.servicioId))
  &&(!v.pago||!can('verMontos')||pagoDe(c)===v.pago)&&(!v.origen||origenDe(c)===v.origen)&&(!v.wa||waDe(c)===v.wa)
  &&(!v.cli||!can('dash')||pasaCliente(c,v.cli,h))
  &&(!etq('captura')||!!c.yapeCaptura===(v.captura==='con'))&&(!etq('foto')||!c.fotoDespues)
  &&(!txt||[c.cliente?.nombre,c.cliente?.tel,c.cliente?.dni,c.cliente?.ciudad,c.codigo,c.servicioNombre].join(' ').toLowerCase().includes(txt)||(dig.length>=3&&[c.cliente?.tel,c.cliente?.dni].some(x=>String(x||'').replace(/\D/g,'').includes(dig))))}
function ordenar(cs,v){const o=ORDENES[v.orden]&&ordenVisible(v.orden)?v.orden:'hora';
 if(o==='hora'&&conTexto(v)){const h0=hoy();return cs.sort((a,b)=>{const pa=a.fecha>=h0,pb=b.fecha>=h0;if(pa!==pb)return pa?-1:1;const k=(a.fecha+a.hora).localeCompare(b.fecha+b.hora);return pa?k:-k})}
 const{k,desc}=ORDENES[o];return cs.sort((a,b)=>{const x=k(a),y=k(b);for(let i=0;i<x.length;i++){if(x[i]<y[i])return desc?1:-1;if(x[i]>y[i])return desc?-1:1}return 0})}

/* ---------- la regla para el servidor ---------- */
function paramsVista(v,alc){const p=new URLSearchParams();
 if(conTexto(v))p.set('q',v.q.trim());
 if(alc.estado)p.set('estado',estadosDe(v).join(','));
 if(alc.periodo){const r=rangoPer(v.per);p.set('desde',r.d);p.set('hasta',r.h)}
 if(v.barb.length)p.set('barbero',v.barb.join(','));if(v.serv.length)p.set('servicio',v.serv.join(','));
 [['pago','pago'],['origen','origen'],['cli','cliente'],['wa','wa']].forEach(([k,n])=>{if(v[k])p.set(n,v[k])});
 if(alc.etq){if(dimAplica('captura',v)&&v.captura)p.set('captura',v.captura);if(dimAplica('foto',v)&&v.foto)p.set('foto',v.foto)}
 if(alc.orden&&v.orden!=='hora')p.set('orden',v.orden);
 return p.toString()}

/* ---------- números de las etiquetas: {estados:{estado:{n,m}}, porValidar:{n,m}} ---------- */
function conteoLocal(v){const cs=scope().filter(filtroLocal(v,ALC_CONTEO(v))),estados={},pv={n:0,m:0};
 cs.forEach(c=>{const e=estados[c.estado]=estados[c.estado]||{n:0,m:0};e.n++;e.m+=montoDe(c)});
 scope().filter(filtroLocal(v,{...ALC_CONTEO(v),periodo:false})).forEach(c=>{if(ESTADOS_ETQ.por_validar.includes(c.estado)){pv.n++;pv.m+=montoDe(c)}});
 return{estados,porValidar:pv}}
function conteos(v){if(!usaServidor(v))return conteoLocal(v);
 const key=paramsVista(v,ALC_CONTEO(v)),ver=API._v,c=S.cnt;
 if(c?.key===key&&c.v===ver)return c.data;
 if(c?.pide!==key+'#'+ver){S.cnt={...(c?.key===key?c:{key}),pide:key+'#'+ver};
  API.req('GET','/citas/conteo?'+key).then(d=>{if(S.cnt.pide!==key+'#'+ver)return;S.cnt={key,v:ver,data:d};if(S.tab==='agenda')renderConteos()}).catch(e=>toast('⚠️ '+e.message))}
 return c?.key===key?c.data||null:null}
const sumaEst=(cnt,ests)=>ests.reduce((a,e)=>({n:a.n+(cnt.estados[e]?.n||0),m:a.m+(cnt.estados[e]?.m||0)}),{n:0,m:0});
const numEtq=(cnt,k)=>!cnt?null:k==='por_validar'?cnt.porValidar:sumaEst(cnt,ESTADOS_ETQ[k]||[k]);

/* ---------- la lista: del navegador o por páginas del servidor ---------- */
function resultado(v){
 if(!usaServidor(v))return{items:ordenar(scope().filter(filtroLocal(v,ALC_LISTA(v))),v)};
 const key=paramsVista(v,ALC_LISTA(v)),p=S.pag;
 if(p?.key!==key){pedirLista(key,false);return{items:[],cargando:true}}
 if(p.v!==API._v&&!p.cargando)pedirLista(key,false); // algo cambió: se vuelve a pedir lo mismo sin perder lo ya cargado
 return{items:p.items,cargando:p.cargando,mas:p.items.length<p.total,total:p.total}}
function pedirLista(key,mas){clearTimeout(S._lt);const p=S.pag?.key===key?S.pag:{key,items:[],total:0,sig:null};p.cargando=true;S.pag=p;
 S._lt=setTimeout(async()=>{const ver=API._v,lim=mas?30:Math.min(500,Math.max(30,p.items.length)),pos=mas?(p.sig?'&cursor='+encodeURIComponent(p.sig):'&offset='+p.items.length):'';
  try{const r=await API.req('GET',`/citas/buscar?${key}&limit=${lim}${pos}`);if(S.pag!==p)return;mezclar(r.items);Object.assign(p,{items:mas?p.items.concat(r.items):r.items,total:r.total,sig:r.siguiente,v:ver})}
  catch(e){p.v=ver;toast('⚠️ '+e.message)}
  p.cargando=false;if(S.pag===p&&S.tab==='agenda')renderLista()},new URLSearchParams(key).has('q')&&!mas?300:0)}
ACC.verMas=function(){this.disabled=true;pedirLista(S.pag.key,true)};

/* ---------- cambiar la vista ---------- */
function ponerVista(cambios){Object.assign(S.vista,cambios);renderAgenda()}
function ponerEtq(k){const v=S.vista;if(v.etq===k)return;const limpia={};Object.keys(DIMS).forEach(d=>{if(DIMS[d].etq&&DIMS[d].etq!==k)limpia[d]=''});ponerVista({...limpia,etq:k,orden:ordenGuardado(k)})}
const fijarDia=f=>{S.vista.per={t:'dia',f}};
function verDia(f){fijarDia(f);renderAgenda()}
function limpiarVista(){try{localStorage.removeItem('brb_ordenEtq')}catch(e){}S.vista=VISTA_DEF();renderAgenda()}
/* Las pastillas de afuera: lo que se aplicó (cada una se quita con su ✕). */
function pastillas(v){const out=[];
 if(v.per.t==='rango')out.push({t:'📅 '+textoPer(v.per),k:'per'});
 Object.keys(DIMS).forEach(k=>{if(!dimVisible(k)||!dimAplica(k,v))return;const ops=Object.fromEntries(DIMS[k].ops());
  (DIMS[k].multi?v[k]:v[k]?[v[k]]:[]).forEach(x=>out.push({t:ops[x]||x,k,x}))});
 if(v.orden!==ordenDef(v.etq)&&ordenVisible(v.orden))out.push({t:'↕️ '+ORDENES[v.orden].t.replace(/^\S+\s/,''),k:'orden'});
 return out}
ACC.fQuitar=function(){const{p0:k,p1:x}=this.dataset,v=S.vista;
 if(k==='per')return ponerVista({per:{t:'dia',f:hoy()}});
 if(k==='orden'){guardarOrden(v.etq,ordenDef(v.etq));return ponerVista({orden:ordenDef(v.etq)})}
 ponerVista({[k]:DIMS[k].multi?v[k].filter(y=>y!==x):''})};
ACC.fLimpiar=function(){limpiarVista()};
ACC.fBuscar=function(){S.vista.q=this.value;renderConteos();renderLista()};
ACC.fDia=function(){const f=this.dataset.p0,p=S.vista.per;if(p.t==='dia'&&p.f===f)return ponerVista({per:{t:'mes',m:f.slice(0,7)}});verDia(f)};
ACC.fMes=function(){const p=S.vista.per;if(p.t!=='mes')ponerVista({per:{t:'mes',m:(p.t==='dia'?p.f:p.d).slice(0,7)}})};
ACC.fMesMover=function(){const p=S.vista.per,n=+this.dataset.p0;ponerVista({per:{t:'mes',m:n?mesMas(p.m,n):hoy().slice(0,7)}})};
ACC.fEtq=function(){const k=this.dataset.p0,n=Date.now(),t=S._tt||{};S._tt={k,n};if(t.k===k&&n-t.n<380){S._tt=null;ponerEtq(k);return abrirEtiqueta(k)}ponerEtq(k)};
ACC.fStat=function(){ponerEtq(this.dataset.p0)};

/* ---------- ⚙️ Búsqueda avanzada (se edita un borrador; «Aplicar» lo vuelve la vista) ---------- */
const PER_RAPIDO={hoy:()=>({t:'dia',f:hoy()}),man:()=>({t:'dia',f:addD(hoy(),1)}),sem:()=>{const d=lunesDe(hoy());return{t:'rango',d,h:addD(d,6)}},mes:()=>({t:'mes',m:hoy().slice(0,7)})};
const PER_TXT={hoy:'⏱️ Hoy',man:'🌅 Mañana',sem:'🗓️ Esta semana',mes:'📆 Este mes'};
const mismoPer=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const chipF=(on,txt,acc,p0,p1)=>`<button class="chip f ${on?'on':''}" data-on-click="${acc}" data-p0="${esc(p0)}"${p1!=null?` data-p1="${esc(p1)}"`:''}>${esc(txt)}</button>`;
function secDim(k,v,acc){return `<p class="lb">${DIMS[k].t}</p><div class="fchips" data-g="${k}">${DIMS[k].ops().map(([x,t])=>chipF(DIMS[k].multi?v[k].includes(x):v[k]===x,t,acc,k,x)).join('')}</div>`}
function secOrden(v,ords,acc){return `<p class="lb">↕️ Ordenar por</p><div class="fchips" data-g="orden">${ords.map(o=>chipF(v.orden===o,ORDENES[o].t,acc,'orden',o)).join('')}</div>`}
function abrirAvanzada(){S.borr=clone(S.vista);const v=S.borr,r=v.per.t==='dia'?{d:'',h:''}:rangoPer(v.per);
 openModal(`<div class="grab"></div><h3>🔍 Búsqueda avanzada<span class="limpia" data-on-click="fBorrLimpiar">Limpiar todo</span></h3>
 <p class="lb">📅 Fecha</p><div class="fchips" data-g="per">${Object.keys(PER_RAPIDO).map(k=>chipF(mismoPer(v.per,PER_RAPIDO[k]()),PER_TXT[k],'fBorrPer',k)).join('')}</div>
 <div class="g2" style="margin-top:10px"><div><label class="lb" style="margin-top:0">Desde</label><input class="in" type="date" id="fDesde" value="${r.d}" data-on-change="fBorrRango"></div><div><label class="lb" style="margin-top:0">Hasta</label><input class="in" type="date" id="fHasta" value="${r.h}" data-on-change="fBorrRango"></div></div>
 ${[...DIMS_GEN,...(ETQ[v.etq].dims||[]).filter(k=>DIMS[k].etq)].filter(dimVisible).map(k=>secDim(k,v,'fBorrDim')).join('')}
 ${secOrden(v,ordenesDe(v.etq),'fBorrDim')}
 <div class="fbar"><button class="btn p w" data-on-click="fAplicar">🔍 Aplicar filtros</button><button class="btn w" data-on-click="a5a8704f9">Cancelar</button></div>`)}
// Marca en su lugar (sin volver a pintar la hoja, para no perder el desplazamiento).
function marcarGrupo(g,v){$$(`#mbody [data-g="${g}"] .chip`).forEach(b=>{const x=b.dataset.p1??b.dataset.p0;b.classList.toggle('on',g==='per'?mismoPer(v.per,PER_RAPIDO[x]()):g==='orden'?v.orden===x:DIMS[g].multi?v[g].includes(x):v[g]===x)})}
function elegir(v,k,x){if(k==='orden')v.orden=x;else if(DIMS[k].multi)v[k]=v[k].includes(x)?v[k].filter(y=>y!==x):[...v[k],x];else v[k]=v[k]===x?'':x}
function pintarBorrador(){const v=S.borr,r=v.per.t==='dia'?{d:'',h:''}:rangoPer(v.per);$('#fDesde').value=r.d;$('#fHasta').value=r.h;$$('#mbody [data-g]').forEach(g=>marcarGrupo(g.dataset.g,v))}
ACC.fBorrPer=function(){S.borr.per=PER_RAPIDO[this.dataset.p0]();pintarBorrador()};
ACC.fBorrRango=function(){const v=S.borr;let d=$('#fDesde').value,h=$('#fHasta').value;if(!d&&!h)return;d=d||h;h=h||d;if(h<d)[d,h]=[h,d];$('#fDesde').value=d;$('#fHasta').value=h;v.per=d===h?{t:'dia',f:d}:{t:'rango',d,h};marcarGrupo('per',v)};
ACC.fBorrDim=function(){const{p0:k,p1:x}=this.dataset;elegir(S.borr,k,x);marcarGrupo(k,S.borr)};
ACC.fBorrLimpiar=function(){const etq=S.borr.etq;S.borr={...VISTA_DEF(),etq,orden:ordenDef(etq)};pintarBorrador()};
ACC.fAplicar=function(){const b=S.borr;S.borr=null;closeModal();if(b.orden!==S.vista.orden)guardarOrden(b.etq,b.orden);S.vista={...b,q:S.vista.q};renderAgenda()};
ACC.abrirAvanzada=function(){abrirAvanzada()};

/* ---------- doble toque en una etiqueta: su orden y sus filtros (se aplican al instante) ---------- */
function abrirEtiqueta(k){const v=S.vista,cnt=conteos(v),e=k==='todos'?{i:'📋',t:'Todos',c:'#8a3ffc'}:est(k),n=numEtq(cnt,k);
 const resumen=k!=='todos'?'':ETIQUETAS.map(x=>{const y=x==='todos'?{i:'📋',t:'Todos',c:'#8a3ffc'}:est(x),z=numEtq(cnt,x);
  return `<button class="et" style="color:${y.c};border-color:${y.c};background:color-mix(in srgb,${y.c} 10%,var(--card))" data-on-click="fEtqIr" data-p0="${x}"><span>${y.i} ${esc(y.t)}</span><em>${can('verMontos')&&z?soles(z.m):''}</em><b>${z?z.n:'…'}</b></button>`}).join('');
 openModal(`<div class="grab"></div>${mHead(`${e.i} ${esc(e.t)}`)}
 <p class="hint" style="margin:0 0 6px">${n?`<b style="color:var(--tx)">${n.n}</b> cita${n.n===1?'':'s'}${can('verMontos')?' · '+soles(n.m):''} · `:''}${k==='por_validar'?'todos los días':esc(conTexto(v)?'en todas las fechas':textoPer(v.per))}${k==='todos'?'. Toca una etiqueta para verla.':''}</p>
 ${resumen}${secOrden(v,ETQ[k].ord.filter(ordenVisible),'fEtqDim')}${(ETQ[k].dims||[]).filter(dimVisible).map(d=>secDim(d,v,'fEtqDim')).join('')}
 <button class="btn w" style="margin-top:16px" data-on-click="a5a8704f9">Listo</button>`)}
ACC.fEtqDim=function(){const{p0:k,p1:x}=this.dataset,v=S.vista;elegir(v,k,x);if(k==='orden')guardarOrden(v.etq,x);marcarGrupo(k,v);renderAgenda()};
ACC.fEtqIr=function(){closeModal();ponerEtq(this.dataset.p0)};
