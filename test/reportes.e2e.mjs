// Prueba del reporte semanal de caja: montos iguales a la Caja, comisiones, comparación con la semana anterior y cron.
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: BASE }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { s: r.status, j } };
const adm = (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: '{"pin":"5821"}' })).headers.get('set-cookie')).split(';')[0];
const pn = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: { ...pn.cfg, modComision: true }, barberos: pn.barberos.map((b, i) => ({ ...b, comision: i === 0 ? 40 : 50 })), servicios: pn.servicios, usuarios: pn.usuarios }, adm);
const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()), dia = new Date(lima + 'T12:00:00Z');
const add = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) };
const esta = add(lima, -((dia.getUTCDay() + 6) % 7)), pasada = add(esta, -7), antes = add(esta, -14);
let n = 0; const cita = (f, b, estado, precio, extra = {}) => call('POST', '/citas', { fecha: f, hora: `${String(9 + (n++ % 10)).padStart(2, '0')}:00`, barberoId: b, servicioId: pn.servicios[extra.s || 0].id, servicioNombre: pn.servicios[extra.s || 0].nombre, precio, cliente: { nombre: 'Cliente ' + n, tel: '9876' + String(10000 + n).slice(-5) }, estado, ...extra }, adm);
// semana pasada: b1 → 3 atendidos (30, 40, gratis con adelanto 10 validado) ; b2 → 1 atendido 50 + 1 no vino con adelanto 10 validado + 1 cancelada
await cita(pasada, 'b1', 'atendida', 30); await cita(add(pasada, 1), 'b1', 'atendida', 40, { s: 1 }); await cita(add(pasada, 2), 'b1', 'atendida', 30, { gratis: true, adelanto: 10, adelantoOk: true });
await cita(add(pasada, 3), 'b2', 'atendida', 50, { s: 1, adelanto: 10, adelantoOk: true }); await cita(add(pasada, 4), 'b2', 'no_vino', 30, { adelanto: 10, adelantoOk: true }); await cita(add(pasada, 5), 'b2', 'cancelada', 30);
// semana anterior a esa: 1 atendido 50
await cita(antes, 'b1', 'atendida', 50);
let r = await call('GET', '/reportes/' + pasada, null, adm);
const j = r.j; console.log('   ', JSON.stringify({ ingresos: j.ingresos, atendidos: j.atendidos, noVino: j.noVino, barberos: j.barberos?.map(b => [b.nombre, b.ingresos, b.comision]) }));
check('ingresos como la Caja (30+40+10 de gratis con adelanto + 50 + 10 de no vino con adelanto = 140)', j.ingresos === 140, j.ingresos);
check('cortes atendidos, no vinieron y cancelados', j.atendidos === 4 && j.noVino === 1 && j.cancelados === 1 && j.noVinoPct === 20);
check('ticket promedio (140 / 4 = 35)', j.ticket === 35);
const b1 = j.barberos.find(b => b.id === 'b1'), b2 = j.barberos.find(b => b.id === 'b2');
check('por barbero con comisión (Jhon 80 al 40% = 32 · Brayan 60 al 50% = 30)', b1.ingresos === 80 && b1.comision === 32 && b2.ingresos === 60 && b2.comision === 30 && j.comisiones === 62, JSON.stringify(j.barberos));
check('adelantos Yape validados (3 · S/ 30)', j.yape.citas === 3 && j.yape.monto === 30, JSON.stringify(j.yape));
check('comparación con la semana anterior (S/ 50 → S/ 140)', j.anterior.ingresos === 50 && j.anterior.atendidos === 1);
check('7 días de lunes a domingo', j.dias.length === 7 && j.dias[0].fecha === pasada && j.dias[6].fecha === add(pasada, 6));
check('servicios más pedidos', j.servicios.length >= 1 && j.servicios[0].cortes >= 2);
check('clientes y nuevos', j.clientes === 4 && j.nuevos === 6, `${j.clientes} / ${j.nuevos}`);
r = await call('GET', '/reportes/' + esta, null, adm); check('la semana en curso se calcula al momento (marcada «en curso»)', r.s === 200 && r.j.enCurso === true);
r = await call('GET', '/reportes/' + add(esta, 14), null, adm); check('una semana futura → 400', r.s === 400);
// cron: arma y guarda el de la semana pasada una sola vez
await fetch(BASE + '/__scheduled?cron=*/5+*+*+*+*');
r = await call('GET', '/reportes', null, adm); check('el cron guarda el reporte de la semana que terminó', r.j.some(x => x.semana === pasada && x.ingresos === 140), JSON.stringify(r.j));
r = await call('GET', '/alertas', null, adm); check('y avisa en la campana con el total y la variación', r.j.some(a => a.accion === 'reporte' && /S\/ 140/.test(a.s) && /↑ 180%/.test(a.s)), JSON.stringify(r.j));
await cita(add(pasada, 6), 'b1', 'atendida', 25);
r = await call('GET', '/reportes/' + pasada, null, adm); check('el guardado no cambia solo (es la foto del lunes)', r.j.ingresos === 140);
r = await call('POST', `/reportes/${pasada}/rehacer`, {}, adm); check('«rehacer» lo recalcula si corregiste citas', r.j.ingresos === 165);
// permisos
await call('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos.map(b => b.id === 'b1' ? { ...b, pin: '7391' } : b), servicios: pn.servicios, usuarios: pn.usuarios }, adm);
const bar = (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: '{"pin":"7391"}' })).headers.get('set-cookie')).split(';')[0];
check('un barbero no ve el reporte de toda la barbería', (await call('GET', '/reportes/' + pasada, null, bar)).s === 403);
check('sin sesión → 401', (await call('GET', '/reportes')).s === 401);
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
