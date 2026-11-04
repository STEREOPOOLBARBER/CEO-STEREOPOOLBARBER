// Prueba de la Fase 4: ficha de clientes en la base de datos, paginación por cursor y búsqueda sin acentos.
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: BASE }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie, pn = (await call('GET', '/panel', null, adm)).j;
const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()), f = d => { const x = new Date(lima + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) };
const nueva = (fecha, hora, b, estado, extra = {}) => call('POST', '/citas', { fecha, hora, barberoId: b, servicioId: pn.servicios[0].id, servicioNombre: pn.servicios[0].nombre, precio: 30, cliente: { nombre: 'José Ñúñez', tel: '+51 987 654 321', dni: '44556677', ciudad: 'Puente Piedra' }, estado, ...extra }, adm);
const a = (await nueva(f(-60), '10:00', 'b1', 'atendida')).j, b = (await nueva(f(-30), '11:00', 'b2', 'atendida')).j;
await nueva(f(-20), '12:00', 'b1', 'no_vino'); const p = (await nueva(f(5), '15:00', 'b1', 'confirmada')).j;
let r = await call('GET', '/clientes/987654321', null, adm);
check('la ficha se arma sola desde las citas (visitas, gasto, faltas, primera, última, próxima)', r.s === 200 && r.j.cliente.visitas === 2 && r.j.cliente.gasto === 60 && r.j.cliente.faltas === 1 && r.j.cliente.citas === 4 && r.j.cliente.primera === f(-60) && r.j.cliente.ultima === f(-30) && r.j.cliente.prox === f(5) + ' 15:00', JSON.stringify(r.j.cliente));
check('guarda el DNI y el celular normalizado (+51 987 654 321 → 987654321)', r.j.cliente.dni === '44556677' && r.j.cliente.tel === '987654321');
check('el historial de la ficha viene de la más reciente a la más antigua', r.j.citas.map(c => c.fecha).join() === [f(5), f(-20), f(-30), f(-60)].join());
await call('PATCH', '/citas/' + p.id, { estado: 'atendida' }, adm);
r = await call('GET', '/clientes/987654321', null, adm);
check('al atender una cita la ficha se actualiza sola', r.j.cliente.visitas === 3 && r.j.cliente.prox === null, JSON.stringify(r.j.cliente));
await call('DELETE', '/citas/' + a.id, null, adm);
r = await call('GET', '/clientes/987654321', null, adm);
check('al eliminar una cita también', r.j.cliente.visitas === 2 && r.j.cliente.primera === f(-30), JSON.stringify(r.j.cliente));
r = await call('PATCH', '/clientes/987654321', { prefs: 'Mid fade', notas: 'Prefiere a Jhon' }, adm);
await nueva(f(7), '16:00', 'b2', 'confirmada');
r = await call('GET', '/clientes/987654321', null, adm);
check('notas y preferencias se guardan y no se pisan cuando cambian las citas', r.j.cliente.prefs === 'Mid fade' && r.j.cliente.notas === 'Prefiere a Jhon' && r.j.cliente.prox === f(7) + ' 16:00');
r = await call('GET', '/clientes?q=jose%20nunez', null, adm);
check('búsqueda sin acentos ni eñe («jose nunez» → José Ñúñez)', r.j.total === 1 && r.j.items[0].nombre === 'José Ñúñez', JSON.stringify(r.j));
r = await call('GET', '/citas/buscar?q=nunez&limit=10', null, adm);
check('la búsqueda de la agenda también encuentra sin acentos', r.j.total >= 3, r.j.total);
// varios clientes para paginar
for (let i = 0; i < 7; i++) await call('POST', '/citas', { fecha: f(-i - 1), hora: '09:00', barberoId: 'b3', servicioId: pn.servicios[0].id, precio: 20 + i, cliente: { nombre: 'Cliente ' + i, tel: '91000000' + i }, estado: 'atendida' }, adm);
let todos = [], cur = '', vueltas = 0;
do { r = await call('GET', '/clientes?orden=gasto&limit=3' + (cur ? '&cursor=' + encodeURIComponent(cur) : ''), null, adm); todos = todos.concat(r.j.items); cur = r.j.siguiente; vueltas++ } while (cur && vueltas < 10);
check('paginación por cursor: recorre todos sin repetir', todos.length === 8 && new Set(todos.map(x => x.k)).size === 8 && vueltas === 3, `${todos.length} en ${vueltas} páginas`);
check('y en el orden pedido (más gasto primero)', todos.every((x, i) => !i || todos[i - 1].gasto >= x.gasto));
r = await call('GET', '/citas/buscar?desde=' + f(-90) + '&hasta=' + f(30) + '&limit=4', null, adm);
let pag = r.j.items, sig = r.j.siguiente; while (sig) { r = await call('GET', '/citas/buscar?desde=' + f(-90) + '&hasta=' + f(30) + '&limit=4&cursor=' + encodeURIComponent(sig), null, adm); pag = pag.concat(r.j.items); sig = r.j.siguiente }
check('citas por cursor: mismas citas que el total y sin repetir', pag.length === r.j.total && new Set(pag.map(x => x.id)).size === pag.length, `${pag.length}/${r.j.total}`);
// permisos
const pnl = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: { ...pnl.cfg, permBarbero: { verTel: false, dash: true } }, barberos: pnl.barberos.map(x => x.id === 'b3' ? { ...x, pin: '7391' } : x), servicios: pnl.servicios, usuarios: pnl.usuarios }, adm);
const bar = (await call('POST', '/auth/login', { pin: '7391' })).cookie;
r = await call('GET', '/clientes?limit=50', null, bar);
check('un barbero solo ve los clientes que atendió, sin celular', r.j.total === 7 && r.j.items.every(x => /^•••/.test(x.tel) && !x.dni && x.k === null), JSON.stringify(r.j).slice(0, 200));
r = await call('GET', '/clientes/987654321', null, bar); check('y no puede abrir fichas con datos personales', r.s === 403);
r = await call('GET', '/clientes'); check('sin sesión → 401', r.s === 401);
r = await call('GET', '/panel', null, adm);
check('el panel sigue trayendo las visitas para la fidelidad', r.j.visitas['987654321'] === 2, JSON.stringify(r.j.visitas));
check('y la fecha de la primera cita (para «Todo»)', r.j.primeraFecha === f(-30) || r.j.primeraFecha <= f(-7), r.j.primeraFecha);
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
