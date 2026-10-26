// Prueba de la política y de reprogramar desde «Ver estado de cita».
// Requiere wrangler dev con --var ALLOW_PIN:true --var GOOGLE_CLIENT_ID: y adminPin 5821 sembrado.
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: BASE }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const dia = n => { const d = new Date(lima + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) };
const habil = n => { let k = n; while (new Date(dia(k) + 'T12:00:00Z').getUTCDay() === 0) k++; return dia(k) };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie;
const panel = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: { ...panel.cfg, tolerancia: 15, horasReprog: 24, maxReprog: 1, politicaTxt: 'Llega puntual.' }, barberos: panel.barberos, servicios: panel.servicios, usuarios: panel.usuarios }, adm);
const f3 = habil(3), f4 = habil(4);
let r = await call('POST', '/publico/reservas', { servicioId: panel.servicios[0].id, barberoId: panel.barberos[0].id, fecha: f3, hora: '10:00', cliente: { nombre: 'Rosa Prueba', tel: '987111222', ciudad: 'Lima' } });
check('reserva creada', r.s === 200, JSON.stringify(r.j)); const cod = r.j.codigo;
r = await call('GET', '/publico/cita/' + cod);
check('estado trae la tolerancia y permite reprogramar (faltan > 24 h)', r.j.tolerancia === 15 && r.j.puedeReprog === true && r.j.horasReprog === 24, JSON.stringify(r.j));
r = await call('POST', `/publico/cita/${cod}/reprogramar`, { fecha: f4, hora: '25:00' }); check('hora inválida → 400', r.s === 400);
r = await call('POST', `/publico/cita/${cod}/reprogramar`, { fecha: dia(60), hora: '11:00' }); check('fecha fuera de la ventana → 400', r.s === 400);
r = await call('POST', `/publico/cita/${cod}/reprogramar`, { fecha: f4, hora: '11:00' });
check('reprograma a otro día', r.s === 200 && r.j.fecha === f4, JSON.stringify(r.j));
r = await call('GET', '/publico/cita/' + cod);
check('la cita quedó en el nuevo día y ya no permite otro cambio (máx. 1)', r.j.fecha === f4 && r.j.hora === '11:00' && r.j.puedeReprog === false, JSON.stringify(r.j));
r = await call('POST', `/publico/cita/${cod}/reprogramar`, { fecha: f3, hora: '12:00' }); check('segundo cambio → 403', r.s === 403, JSON.stringify(r.j));
const c = (await call('GET', '/panel', null, adm)).j.citas.find(x => x.codigo === cod);
check('el panel ve la marca de reprogramada y la fecha anterior', c.reprog === 1 && c.reprogDe?.fecha === f3 && c.reprogDe?.hora === '10:00', JSON.stringify(c));
// Cita a menos de 24 h
r = await call('POST', '/citas', { fecha: dia(1), hora: '09:00', barberoId: panel.barberos[1].id, servicioId: panel.servicios[0].id, cliente: { nombre: 'Luis Cerca', tel: '987333444' }, estado: 'confirmada' }, adm);
const cerca = r.j.codigo;
// mañana 09:00 está a menos de 24 h salvo que ahora sea antes de las 09:00 en Lima; en ese caso usamos hoy
const ahoraMin = (() => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':'); return +p[0] * 60 + +p[1] })();
if (ahoraMin < 9 * 60) await call('PATCH', '/citas/' + r.j.id, { fecha: dia(0), hora: '19:00' }, adm);
r = await call('GET', '/publico/cita/' + cerca);
check('a menos de 24 h no aparece la opción', r.j.puedeReprog === false, JSON.stringify(r.j));
r = await call('POST', `/publico/cita/${cerca}/reprogramar`, { fecha: f4, hora: '15:00' });
check('y el servidor también lo bloquea', r.s === 403 && /24 horas/.test(r.j.error), JSON.stringify(r.j));
// Ocupado
const otra = await call('POST', '/publico/reservas', { servicioId: panel.servicios[0].id, barberoId: panel.barberos[0].id, fecha: f3, hora: '15:00', cliente: { nombre: 'Ana Prueba', tel: '987555666', ciudad: 'Lima' } });
await call('PUT', '/config', { cfg: { ...panel.cfg, maxReprog: 2 }, barberos: panel.barberos, servicios: panel.servicios, usuarios: panel.usuarios }, adm);
r = await call('POST', `/publico/cita/${otra.j.codigo}/reprogramar`, { fecha: f4, hora: '11:00' });
check('no deja pasar a un horario ocupado', r.s === 409, JSON.stringify(r));
await call('PUT', '/config', { cfg: { ...panel.cfg, maxReprog: 0 }, barberos: panel.barberos, servicios: panel.servicios, usuarios: panel.usuarios }, adm);
r = await call('GET', '/publico/cita/' + otra.j.codigo); check('con «No permitir» no aparece la opción', r.j.puedeReprog === false);
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
