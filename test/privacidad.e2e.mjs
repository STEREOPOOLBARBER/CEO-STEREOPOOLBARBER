// Prueba de la Fase 7 (Ley 29733): consentimiento, derechos del cliente (acceso y anonimización), retención y respaldos cifrados.
// Arranque: --test-scheduled (ver test/correr.mjs).
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: BASE }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { s: r.status, j, h: r.headers, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie, pn = (await call('GET', '/panel', null, adm)).j;
const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()), f = d => { const x = new Date(lima + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); if (x.getUTCDay() === 0) x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) };
// consentimiento
const res = { servicioId: pn.servicios[0].id, barberoId: 'b1', fecha: f(3), hora: '10:00', cliente: { nombre: 'Paula Privada', tel: '987600100', ciudad: 'Lima' } };
let r = await call('POST', '/publico/reservas', res); check('sin aceptar el aviso de privacidad no se guarda la reserva', r.s === 400 && /aceptación/.test(r.j.error), JSON.stringify(r.j));
r = await call('POST', '/publico/reservas', { ...res, consentimiento: true }); check('con aceptación sí', r.s === 200);
let c = (await call('GET', '/panel', null, adm)).j.citas.find(x => x.codigo === r.j.codigo);
check('queda constancia del consentimiento (fecha y versión del aviso)', c.consentimiento?.ts > 0 && c.consentimiento?.version === 1, JSON.stringify(c.consentimiento));
// datos completos de un cliente: fotos, link personal, bitácora
const foto = (await call('POST', '/fotos', { data: PNG }, adm)).j.key, cap = (await call('POST', '/fotos', { data: PNG }, adm)).j.key;
const nc = (await call('POST', '/citas', { fecha: f(-10), hora: '11:00', barberoId: 'b2', servicioId: pn.servicios[0].id, precio: 35, cliente: { nombre: 'Rodrigo Borrame', tel: '987600200', dni: '40001111', ciudad: 'Comas' }, nota: 'alérgico al gel', estado: 'atendida', fotoAntes: foto, yapeCaptura: cap }, adm)).j;
await call('POST', '/links', { id: 'lk1', token: 'tok-privado-1', cliente: { nombre: 'Rodrigo Borrame', tel: '987600200' } }, adm);
await call('PATCH', '/clientes/987600200', { notas: 'prefiere tarde', prefs: 'mid fade' }, adm);
check('la foto existe antes de anonimizar', (await fetch(BASE + '/api/fotos/' + foto, { headers: { Cookie: adm } })).status === 200);
// derecho de acceso
r = await call('GET', '/clientes/987600200/datos', null, adm);
check('derecho de acceso: descarga todos sus datos', r.s === 200 && /attachment/.test(r.h.get('content-disposition')) && r.j.cliente.nombre === 'Rodrigo Borrame' && r.j.citas.length === 1);
// derecho de cancelación
r = await call('POST', '/clientes/987600200/anonimizar', { confirmar: 'si' }, adm); check('anonimizar exige escribir ANONIMIZAR', r.s === 400);
await call('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos.map(b => b.id === 'b2' ? { ...b, pin: '7391' } : b), servicios: pn.servicios, usuarios: pn.usuarios }, adm);
const bar = (await call('POST', '/auth/login', { pin: '7391' })).cookie;
r = await call('POST', '/clientes/987600200/anonimizar', { confirmar: 'ANONIMIZAR' }, bar); check('un barbero no puede anonimizar', r.s === 403);
r = await call('POST', '/clientes/987600200/anonimizar', { confirmar: 'ANONIMIZAR', motivo: 'lo pidió por WhatsApp' }, adm);
check('anonimiza la cita y borra fotos y captura', r.s === 200 && r.j.citas === 1 && r.j.fotos === 2, JSON.stringify(r.j));
c = (await call('GET', '/citas/buscar?desde=' + f(-10) + '&hasta=' + f(-10), null, adm)).j.items.find(x => x.id === nc.id);
check('la cita queda sin datos personales pero con lo contable', c.cliente.nombre === 'Cliente anónimo' && !c.cliente.tel && !c.cliente.dni && !c.cliente.ciudad && !c.nota && !c.fotoAntes && !c.yapeCaptura && c.precio === 35 && c.estado === 'atendida', JSON.stringify(c));
check('las fotos ya no existen', (await fetch(BASE + '/api/fotos/' + foto, { headers: { Cookie: adm } })).status === 404 && (await fetch(BASE + '/api/fotos/' + cap, { headers: { Cookie: adm } })).status === 404);
check('la ficha (con sus notas) desaparece', (await call('GET', '/clientes/987600200', null, adm)).s === 404);
r = await call('GET', '/auditoria?limit=100', null, adm);
check('su nombre ya no aparece en la bitácora', !JSON.stringify(r.j).includes('Rodrigo Borrame') && r.j.items.some(x => x.accion === 'Anonimizó cliente'));
check('la búsqueda ya no lo encuentra', (await call('GET', '/citas/buscar?q=borrame', null, adm)).j.total === 0);
const links = (await call('GET', '/links', null, adm)).j; check('su link personal quedó anónimo', !JSON.stringify(links).includes('Rodrigo'));
// retención automática (apagada por defecto)
const vieja = (await call('POST', '/citas', { fecha: f(-800), hora: '09:00', barberoId: 'b3', servicioId: pn.servicios[0].id, precio: 20, cliente: { nombre: 'Viejo Inactivo', tel: '987600300' }, estado: 'atendida' }, adm)).j;
const cap2 = (await call('POST', '/fotos', { data: PNG }, adm)).j.key;
await call('POST', '/citas', { fecha: f(-200), hora: '09:00', barberoId: 'b3', servicioId: pn.servicios[0].id, precio: 20, cliente: { nombre: 'Activo Reciente', tel: '987600400' }, estado: 'atendida', yapeCaptura: cap2 }, adm);
await fetch(BASE + '/__scheduled?cron=*/5+*+*+*+*');
check('con la retención apagada no se borra nada', (await call('GET', '/clientes/987600300', null, adm)).s === 200);
const cfg = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: { ...cfg.cfg, retencionMeses: 24, capturasDias: 180 }, barberos: cfg.barberos, servicios: cfg.servicios, usuarios: cfg.usuarios }, adm);
await fetch(BASE + '/__scheduled?cron=*/5+*+*+*+*');
check('con retención de 24 meses se anonimiza al cliente inactivo', (await call('GET', '/clientes/987600300', null, adm)).s === 404);
check('y no toca al cliente reciente', (await call('GET', '/clientes/987600400', null, adm)).s === 200);
check('las capturas de Yape de más de 180 días se borran', (await fetch(BASE + '/api/fotos/' + cap2, { headers: { Cookie: adm } })).status === 404);
// respaldos cifrados
await call('POST', '/respaldos', {}, adm);
r = await call('GET', '/respaldos', null, adm); check('el respaldo se guarda cifrado en R2', r.j[0]?.cifrado === true, JSON.stringify(r.j));
r = await call('GET', '/respaldos/' + r.j[0].fecha, null, adm); check('y se descarga ya descifrado, listo para restaurar', r.s === 200 && r.j.v === 4 && Array.isArray(r.j.citas));
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
