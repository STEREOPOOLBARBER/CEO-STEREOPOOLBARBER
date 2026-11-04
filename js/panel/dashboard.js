/* =================== DASHBOARD (doble toque en el nombre) =================== */
const PER=[['hoy','Hoy'],['7','7 días'],['30','30 días'],['mes','Este mes'],['todo','Todo']];
function rango(p){const h=hoy();if(p==='hoy')return[h,h];if(p==='7')return[addD(h,-6),h];if(p==='30')return[addD(h,-29),h];if(p==='mes')return[h.slice(0,8)+'01',h];const f=(nube()&&S.primeraFecha)||(S.hist||S.citas).map(c=>c.fecha).sort()[0]||h;return[f<h?f:h,h]}
function dTog(k){S.dx=S.dx||new Set();S.dx.has(k)?S.dx.delete(k):S.dx.add(k);const sc=$('.sheet').scrollTop;abrirDash(true);$('.sheet').scrollTop=sc}
function bars(id,rows,color){const max=Math.max(1,...rows.map(r=>r.v));S.dx=S.dx||new Set();
 return `<div class="bars">${rows.map(r=>{const k=id+':'+r.k,open=S.dx.has(k);return `<div class="br" data-on-click="a12c081a6" data-p0="${k}"><span>${open?'▾':'▸'} ${esc(r.l)}</span><i><b style="width:${Math.max(2,r.v/max*100)}%;background:${r.c||color}"></b></i><em>${r.t??r.v}</em></div>${open&&r.d?`<div class="dt">${r.d()}</div>`:''}`}).join('')||'<p class="hint">Sin datos en este periodo</p>'}</div>`}
const dl=(a,b)=>`<div class="r"><span>${a}</span><b>${b}</b></div>`;
const citaLn=c=>dl(`${c.fecha.slice(5)} ${h12(c.hora)} · ${esc(c.cliente?.nombre||'')}`,`${esc(barb(c.barberoId)?.nombre||'')}`);
async function abrirDash(keep){const p=S.dp||(S.dp='30'),[d1,d2]=rango(p);let RES=null,LAP=null;
 if(nube()){try{if(!cubre(d1,d2)){toast('⏳ Cargando '+(p==='todo'?'todo el historial':'el periodo')+'…');await traerRango(d1,d2)}
  const tels=[...new Set(S.citas.filter(c=>c.fecha>=d1&&c.fecha<=d2&&c.estado==='atendida').map(c=>telKey(c.cliente?.tel)).filter(Boolean))];
  [RES,LAP]=await Promise.all([can('verTel')?API.req('POST','/clientes/resumen',{tels}):{},API.req('GET','/clientes?orden=recuperar&limit=15').catch(()=>({items:[]}))])}catch(e){return toast('⚠️ '+e.message)}}
 const all=nube()?S.citas.filter(mine):todas(),cs=all.filter(c=>c.fecha>=d1&&c.fecha<=d2);
 const at=cs.filter(c=>c.estado==='atendida'),nv=cs.filter(c=>c.estado==='no_vino'),canc=cs.filter(c=>c.estado==='cancelada');
 const ing=cs.reduce((a,c)=>a+ingresoCita(c),0),ticket=at.length?ing/at.length:0;
 const bs=S.barberos.filter(b=>isAdmin()||b.id===S.ses.barberoId);
 let cap=0;for(let f=d1,i=0;f<=d2&&i<400;f=addD(f,1),i++){const n=slotsDia(S.cfg).length;bs.forEach(b=>{if(trabaja(S.cfg,b,f))cap+=n})}
 const ocup=cs.filter(c=>['confirmada','en_silla','atendida','por_validar'].includes(c.estado)).length,ocP=cap?Math.round(ocup/cap*100):0;
 const nsP=(at.length+nv.length)?Math.round(nv.length/(at.length+nv.length)*100):0;
 const visTot={},primera={};if(RES)Object.entries(RES).forEach(([k,v])=>{visTot[k]=v.visitas;primera[k]=v.primera});else(S.hist||S.citas).forEach(c=>{const k=telKey(c.cliente?.tel);if(!k)return;if(c.estado==='atendida')visTot[k]=(visTot[k]||0)+1;if(!primera[k]||c.fecha<primera[k])primera[k]=c.fecha});
 const cliPer=[...new Set(at.map(c=>telKey(c.cliente?.tel)).filter(Boolean))],ret=cliPer.length?Math.round(cliPer.filter(k=>visTot[k]>1).length/cliPer.length*100):0,nuevos=cliPer.filter(k=>primera[k]>=d1).length;
 const web=cs.filter(c=>c.origen==='web'||c.origen==='link').length,webP=cs.length?Math.round(web/cs.length*100):0;
 const kp=(v,l,c,sub)=>`<div class="stat kp"><b style="color:${c};font-size:30px">${v}</b><span>${l}</span>${sub?`<small>${sub}</small>`:''}</div>`;
 // pipeline
 const pipe=Object.keys(DEF_EST).map(k=>({k,l:est(k).t,v:cs.filter(c=>c.estado===k).length,c:est(k).c,d:()=>cs.filter(c=>c.estado===k).slice(0,15).map(citaLn).join('')||'—'})).filter(r=>r.v).sort((a,b)=>b.v-a.v);
 // barberos
 const prom=bs.length?bs.reduce((a,b)=>a+cs.filter(c=>c.barberoId===b.id).reduce((x,c)=>x+ingresoCita(c),0),0)/bs.length:0;
 const porB=bs.map(b=>{const mc=cs.filter(c=>c.barberoId===b.id),a=mc.filter(c=>c.estado==='atendida'),g=mc.reduce((x,c)=>x+ingresoCita(c),0),n=mc.filter(c=>c.estado==='no_vino').length;let cp=0;for(let f=d1,i=0;f<=d2&&i<400;f=addD(f,1),i++)if(trabaja(S.cfg,b,f))cp+=slotsDia(S.cfg).length;
  const sv={};a.forEach(c=>sv[c.servicioNombre]=(sv[c.servicioNombre]||0)+1);
  return{k:b.id,l:b.nombre,v:g,t:soles(g),c:b.color,d:()=>dl('✂️ Cortes atendidos',a.length)+dl('🎟️ Ticket promedio',soles(a.length?g/a.length:0))+dl('💺 Ocupación',(cp?Math.round(mc.filter(c=>['confirmada','en_silla','atendida','por_validar'].includes(c.estado)).length/cp*100):0)+'%')+dl('❌ No vinieron',n)+(S.cfg.modComision?dl('💰 Comisión ('+(+b.comision||0)+'%)',soles(g*(+b.comision||0)/100)):'')+dl('🔥 Lo que más hace',Object.entries(sv).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([k,v])=>`${esc(k)} (${v})`).join(', ')||'—')+(prom&&g<prom*.8&&bs.length>1?`<p style="color:var(--yel);margin-top:6px">⚠️ Genera más de 20% menos que el promedio del equipo (${soles(prom)}).</p>`:'')}}).sort((a,b)=>b.v-a.v);
 // servicios
 const sm={};at.forEach(c=>{const k=c.servicioNombre||'—';(sm[k]=sm[k]||[]).push(c)});
 const porS=Object.entries(sm).map(([k,a])=>({k:k.replace(/\W/g,''),l:k,v:a.length,d:()=>{const b={};a.forEach(c=>{const n=barb(c.barberoId)?.nombre||'—';b[n]=(b[n]||0)+1});return dl('💰 Ingresos',soles(a.reduce((x,c)=>x+ingresoCita(c),0)))+Object.entries(b).sort((x,y)=>y[1]-x[1]).map(([n,v])=>dl('💈 '+esc(n),v+' cortes')).join('')}})).sort((a,b)=>b.v-a.v);
 // horas y días
 const act=cs.filter(c=>activa(c)||c.estado==='no_vino'),hm={};act.forEach(c=>{const h=c.hora.slice(0,2);(hm[h]=hm[h]||[]).push(c)});
 const porH=Object.keys(hm).sort().map(h=>({k:h,l:h12(h+':00'),v:hm[h].length,d:()=>hm[h].slice(0,12).map(citaLn).join('')}));
 const dm=[0,0,0,0,0,0,0];act.forEach(c=>dm[pYmd(c.fecha).getDay()]++);
 const porD=ORDEN.map(d=>({k:'d'+d,l:DIASL[d],v:dm[d]})).filter(r=>r.v||S.cfg.dias.includes(+r.k.slice(1)));
 // top clientes
 const cm={};at.forEach(c=>{const k=telKey(c.cliente?.tel);if(!k)return;const o=cm[k]||(cm[k]={k,n:c.cliente.nombre,tel:c.cliente.tel,a:[],g:0});o.a.push(c);o.g+=ingresoCita(c)});
 const top=Object.values(cm).sort((a,b)=>b.a.length-a.a.length||b.g-a.g).slice(0,10);
 // por recuperar
 const ult={};if(!LAP)todas().forEach(c=>{if(c.estado!=='atendida')return;const k=telKey(c.cliente?.tel);if(!k)return;if(!ult[k]||c.fecha>ult[k].fecha)ult[k]=c});
 const futuro=new Set((S.hist||S.citas).filter(c=>c.fecha>=hoy()&&activa(c)).map(c=>telKey(c.cliente?.tel)));
 const lapsed=LAP?LAP.items.map(x=>({k:x.k,c:{id:'',cliente:{nombre:x.nombre,tel:x.tel},servicioNombre:`${x.visitas} visita(s) · ${soles(x.gasto)}`,fecha:x.ultima},dias:Math.round((pYmd(hoy())-pYmd(x.ultima))/864e5)})):Object.entries(ult).filter(([k,c])=>c.fecha<addD(hoy(),-35)&&!futuro.has(k)).map(([k,c])=>({k,c,dias:Math.round((pYmd(hoy())-pYmd(c.fecha))/864e5)})).sort((a,b)=>b.dias-a.dias).slice(0,15);
 // distritos
 const zm={};cs.forEach(c=>{const z=(c.cliente?.ciudad||'').trim();if(z)zm[z]=(zm[z]||0)+1});
 const porZ=Object.entries(zm).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([z,v])=>({k:z.replace(/\W/g,''),l:z,v}));
 S.dx=S.dx||new Set();
 const html=mHead('📈 Dashboard')+`
 <div class="chips" style="padding-top:0">${PER.map(([k,t])=>`<button class="chip ${p===k?'on':''}" data-on-click="a6721479a" data-p0="${k}">${t}</button>`).join('')}</div>
 <p class="hint" style="margin:6px 0 12px">${fLarga(d1)}${d1!==d2?' → '+fLarga(d2):''} · ${cs.length} citas · toca cualquier fila para ver el detalle</p>
 <div class="stats">${kp(soles(ing),'💰 Ingresos','var(--grn)')}${kp(at.length,'✂️ Cortes atendidos','var(--pur)')}${kp(soles(Math.round(ticket)),'🎟️ Ticket promedio','var(--blue)')}${kp(ocP+'%','💺 Ocupación de sillas','var(--org)','Referencia del sector: ~56%')}${kp(nsP+'%','❌ No vinieron',nsP>10?'var(--red)':'var(--grn)','Normal: 5–10%')}${kp(ret+'%','🔁 Clientes que regresan','var(--pur)',`${nuevos} nuevo(s)`)}${kp(webP+'%','🌐 Reservas online','var(--blue)',`${web} de ${cs.length}`)}${kp(canc.length,'🚫 Canceladas','var(--mu)')}</div>
 <div class="dsec"><h6>Pipeline por estado</h6>${bars('pipe',pipe,'var(--blue)')}</div>
 ${isAdmin()?`<div class="dsec"><h6>Ingresos por barbero</h6>${bars('barb',porB,'var(--pur)')}</div>`:''}
 <div class="dsec"><h6>Servicios más pedidos</h6>${bars('serv',porS,'var(--blue)')}</div>
 <div class="dsec"><h6>Horas pico</h6>${bars('hora',porH,'var(--org)')}</div>
 <div class="dsec"><h6>Días de la semana</h6>${bars('dia',porD,'var(--grn)')}</div>
 <div class="dsec"><h6>Top 10 clientes</h6><div class="top10">${top.map((o,i)=>{const k='top:'+o.k,open=S.dx.has(k);return `<div class="tr" data-on-click="a12c081a6" data-p0="${k}"><b>${i+1}</b><div class="t"><div>${esc(o.n)}</div><small>${esc(o.tel)}</small></div><em>${o.a.length} <small>visitas</small></em></div>${open?`<div class="bars"><div class="dt">${dl('💰 Gastó',soles(o.g))+o.a.slice(-5).reverse().map(c=>dl(`${c.fecha.slice(5)} · ${esc(c.servicioNombre)}`,esc(barb(c.barberoId)?.nombre||''))).join('')}<button class="btn sm g" style="margin-top:8px" data-on-click="a47748a5f" data-p0="${o.k}">💬 WhatsApp</button></div></div>`:''}`}).join('')||'<p class="hint">Aún no hay clientes atendidos en este periodo</p>'}</div></div>
 <div class="dsec"><h6>💈 Clientes por recuperar <span style="text-transform:none;letter-spacing:0">(más de 5 semanas sin venir)</span></h6>${lapsed.map(o=>`<div class="li"><div class="t"><b>${esc(o.c.cliente.nombre)}</b><small>Último corte hace ${o.dias} días · ${esc(o.c.servicioNombre)}</small></div><button class="btn sm g" data-on-click="a97c37bc5" data-p0="${esc(o.c.cliente.tel)}" data-p1="${o.c.id}" data-p2="${esc(o.c.cliente.nombre).replace(/'/g,'')}">💬</button></div>`).join('')||'<p class="hint">¡Nadie por recuperar! 🔥</p>'}</div>
 ${porZ.length?`<div class="dsec"><h6>Distritos de tus clientes</h6>${bars('zona',porZ,'var(--pur)')}</div>`:''}`;
 if(keep&&$('#modal').classList.contains('on')){$('#mbody').innerHTML=html;hydrate($('#mbody'))}else openModal(html)}

