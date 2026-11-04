// Prueba de la Fase 1: el panel solo baja una ventana de días y lo demás se busca/pagina en la base de datos.
// Requiere wrangler dev con --var ALLOW_PIN:true --var GOOGLE_CLIENT_ID:, adminPin 5821 y muchas citas antiguas sembradas
// (una se llama «Zacarías Antiguo», ver CLOUDFLARE.md).
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const t0 = Date.now(); const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: B }, body: b ? JSON.stringify(b) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx) } catch { j = tx } return { s: r.status, j, ms: Date.now() - t0, kb: Math.round(tx.length / 1024), cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie;
await call('POST', '/clientes/rehacer', {}, adm); // los datos de prueba se sembraron por SQL
const tot = await call('GET', '/citas/buscar?limit=1', null, adm);
let r = await call('GET', '/panel', null, adm);
console.log(`   total en la base: ${tot.j.total} · el panel bajó ${r.j.citas.length} citas (${r.kb} KB, ${r.ms} ms)`);
check('el panel solo baja la ventana de días, no toda la historia', r.j.citas.length < tot.j.total / 3 && r.j.ventana?.desde && r.j.ventana?.hasta, JSON.stringify(r.j.ventana));
check('todas las citas del panel están dentro de la ventana (o son Yape pendiente)', r.j.citas.every(c => (c.fecha >= r.j.ventana.desde && c.fecha <= r.j.ventana.hasta) || c.estado === 'por_validar'));
check('trae el conteo de visitas por cliente (fidelidad) sin bajar la historia', Object.keys(r.j.visitas || {}).length > 100);
r = await call('GET', '/citas/buscar?q=zacar%C3%ADas&limit=30', null, adm);
check('la búsqueda encuentra a un cliente de hace casi 2 años', r.j.total === 1 && r.j.items[0].cliente.nombre === 'Zacarías Antiguo', JSON.stringify(r.j).slice(0, 200));
r = await call('GET', '/citas/buscar?q=rojas&limit=30', null, adm);
check('la búsqueda pagina de 30 en 30', r.j.items.length === 30 && r.j.total > 30, `${r.j.items.length}/${r.j.total}`);
const p2 = await call('GET', '/citas/buscar?q=rojas&limit=30&offset=30', null, adm);
check('la página 2 trae otras citas', p2.j.items.length && !p2.j.items.some(x => r.j.items.find(y => y.id === x.id)));
r = await call('GET', '/citas/buscar?q=900000005&limit=5', null, adm);
check('busca por celular', r.j.total > 0 && r.j.items.every(c => c.cliente.tel.includes('900000005')), JSON.stringify(r.j).slice(0, 200));
r = await call('GET', '/citas/buscar?desde=2025-03-01&hasta=2025-03-31&limit=500', null, adm);
check('trae un mes antiguo por rango', r.j.total === 31 * 9 && r.j.items.every(c => c.fecha.startsWith('2025-03')), r.j.total);
r = await call('GET', '/citas/buscar?desde=2025-03-01&hasta=2025-03-31&estado=atendida&barbero=b2&limit=500', null, adm);
check('filtra por estado y barbero en la base de datos', r.j.total === 31 * 3 && r.j.items.every(c => c.barberoId === 'b2'), r.j.total);
r = await call('GET', "/citas/buscar?q=%25'%20OR%201%3D1--&limit=5", null, adm);
check('texto raro en la búsqueda no rompe nada (sin inyección SQL)', r.s === 200 && r.j.total === 0, JSON.stringify(r.j).slice(0, 120));
r = await call('GET', '/citas/buscar?q=rojas');
check('sin sesión → 401', r.s === 401);
// barbero sin permiso de ver todas ni teléfonos
const pn = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: { ...pn.cfg, permBarbero: { verTel: false } }, barberos: pn.barberos.map(b => b.id === 'b1' ? { ...b, pin: '7391' } : b), servicios: pn.servicios, usuarios: pn.usuarios }, adm);
const bar = (await call('POST', '/auth/login', { pin: '7391' })).cookie;
r = await call('GET', '/citas/buscar?q=rojas&limit=50', null, bar);
check('el barbero solo encuentra sus propias citas', r.j.total > 0 && r.j.items.every(c => c.barberoId === 'b1'), JSON.stringify(r.j).slice(0, 150));
check('y con el teléfono oculto', r.j.items.every(c => /^•••/.test(c.cliente.tel) && !c.cliente.dni));
r = await call('GET', '/citas/buscar?q=900000005&limit=5', null, bar);
check('sin permiso de teléfonos no puede buscar por celular', r.j.total === 0, r.j.total);
r = await call('GET', '/citas/buscar?barbero=b2&limit=5', null, bar);
check('no puede pedir las citas de otro barbero', r.j.items.every(c => c.barberoId === 'b1'));
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
