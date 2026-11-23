// Papelera (worker/modulos/papelera.js): eliminar manda la cita 7 días a la papelera (su horario queda libre),
// recuperar la devuelve (o como «cancelada» si su horario ya se ocupó), «eliminar ya» y el borrado automático (cron).
// Requiere wrangler dev con ALLOW_PIN, el PIN 5821 del dueño, PAPELERA_PRUEBA y --test-scheduled.
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: B }, body: b ? JSON.stringify(b) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx) } catch { j = tx } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie;
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), f = lima(3);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const nueva = (hora, x = {}) => call('POST', '/citas', { fecha: f, hora, barberoId: 'b1', servicioId: 's1', servicioNombre: 'Corte', precio: 25, cliente: { nombre: 'Papa Lera', tel: '966111222' }, estado: 'confirmada', ...x }, adm).then(r => r.j);

const foto = (await call('POST', '/fotos', { data: PNG }, adm)).j.key;
const a = await nueva('10:00', { fotoAntes: foto });
let r = await call('DELETE', '/citas/' + a.id, null, adm);
check('eliminar una cita la manda a la papelera', r.s === 200 && r.j.papelera === true, JSON.stringify(r.j));
check('ya no está en la agenda', (await call('GET', '/citas/buscar?q=' + a.codigo, null, adm)).j.items.length === 0);
check('su horario quedó libre', !!(await nueva('10:00', { cliente: { nombre: 'Otro Cliente', tel: '966111333' } })).id);
r = await call('GET', '/papelera', null, adm);
const it = r.j.items?.find(x => x.id === a.id);
check('la papelera la muestra con quién la eliminó y cuándo se borra (7 días)', r.j.dias === 7 && it?.cliente === 'Papa Lera' && /Dueño/.test(it.quien) && it.vence - it.borrada === 7 * 864e5, JSON.stringify(r.j).slice(0, 300));
check('el panel trae cuántas hay en la papelera', (await call('GET', '/panel', null, adm)).j.papelera === 1);

// recuperar: su horario ya lo tomó otra → vuelve como cancelada (nada se pisa)
r = await call('POST', `/papelera/${a.id}/recuperar`, {}, adm);
check('si su horario ya se ocupó, vuelve como CANCELADA', r.s === 200 && r.j.ocupado === true, JSON.stringify(r.j));
let c = (await call('GET', '/citas/buscar?q=' + a.codigo, null, adm)).j.items[0];
check('…con sus datos intactos', c?.estado === 'cancelada' && c.cliente?.nombre === 'Papa Lera' && c.fotoAntes === foto, JSON.stringify(c));
check('y salió de la papelera', !(await call('GET', '/papelera', null, adm)).j.items.length);

// recuperar normal
const b = await nueva('12:00');
await call('DELETE', '/citas/' + b.id, null, adm);
r = await call('POST', `/papelera/${b.id}/recuperar`, {}, adm);
c = (await call('GET', '/citas/buscar?q=' + b.codigo, null, adm)).j.items[0];
check('con su horario libre, vuelve tal cual (confirmada, misma hora y código)', r.j.ocupado === false && c?.estado === 'confirmada' && c.hora === '12:00', JSON.stringify(c));

// permisos
const pn = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: pn.cfg, equipo: pn.equipo.map(p => p.id === 'b1' ? { ...p, pin: '7391', permisos: { ...p.permisos, cancelar: false } } : p), servicios: pn.servicios }, adm);
const bar = (await call('POST', '/auth/login', { pin: '7391' })).cookie;
check('sin permiso de cancelar no ve la papelera', (await call('GET', '/papelera', null, bar)).s === 403);
check('sin sesión → 401', (await call('GET', '/papelera')).s === 401);

// eliminar ya → borra también sus fotos
await call('DELETE', '/citas/' + a.id, null, adm);
r = await call('DELETE', '/papelera/' + a.id, null, adm);
check('«Eliminar ya» la borra para siempre', r.s === 200 && !(await call('GET', '/papelera', null, adm)).j.items.length);
check('…y su foto también', (await call('GET', '/fotos/' + foto, null, adm)).s === 404);
check('no se puede recuperar lo ya borrado', (await call('POST', `/papelera/${a.id}/recuperar`, {}, adm)).s === 404);

// cron: lo que lleva más de 7 días se borra solo
await call('DELETE', '/citas/' + b.id, null, adm);
await call('POST', '/prueba/papelera-vieja', { id: b.id }, adm); // solo en pruebas: la marca como de hace 8 días
await fetch(B + '/__scheduled?cron=*/5+*+*+*+*'); await new Promise(res => setTimeout(res, 800));
check('a los 7 días se borra sola', !(await call('GET', '/papelera', null, adm)).j.items.length);
check('la migración v10 (papelera) quedó registrada', (await call('GET', '/diagnostico', null, adm)).j.db?.migraciones?.includes(10));
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
