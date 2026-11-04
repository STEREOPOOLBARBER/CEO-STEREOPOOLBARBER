// Prueba de la Fase 2 (blindaje): bitácora de cambios, cookies __Host- y sesión nueva en cada ingreso.
// Arranque: ver test/correr.mjs (PIN de pruebas 5821, sin Google).
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: BASE }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { s: r.status, j, raw: r.headers.get('set-cookie') || '', cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
let r = await call('POST', '/auth/login', { pin: '5821' }); const adm = r.cookie;
check('la cookie de sesión usa el prefijo __Host-', /^__Host-brb_s=/.test(adm) && /Secure/i.test(r.raw) && /Path=\//.test(r.raw) && !/Domain=/i.test(r.raw), r.raw);
check('una cookie con el nombre viejo sigue sirviendo (transición)', (await call('GET', '/panel', null, adm.replace('__Host-brb_s', 'brb_s'))).s === 200);
const pn = (await call('GET', '/panel', null, adm)).j;
// clave para un barbero y doble ingreso → la sesión anterior se cierra
await call('PUT', '/acceso/b_b1/clave', { clave: 'clave-segura-1' }, adm);
const s1 = (await call('POST', '/auth/clave', { sujeto: 'b_b1', clave: 'clave-segura-1' })).cookie;
const s2 = (await call('POST', '/auth/clave', { sujeto: 'b_b1', clave: 'clave-segura-1' }, null)).cookie;
check('dos ingresos dan sesiones distintas', s1 && s2 && s1 !== s2);
const s3 = (await fetch(BASE + '/api/auth/clave', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: s1 }, body: JSON.stringify({ sujeto: 'b_b1', clave: 'clave-segura-1' }) })).headers.get('set-cookie').split(';')[0];
check('al volver a entrar desde el mismo navegador, la sesión anterior se cierra', (await call('GET', '/panel', null, s1)).s === 401 && (await call('GET', '/panel', null, s3)).s === 200);
// acciones que deben quedar en la bitácora
const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()), f = d => { const x = new Date(lima + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); if (x.getUTCDay() === 0) x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) };
const c = (await call('POST', '/citas', { fecha: f(3), hora: '10:00', barberoId: 'b1', servicioId: pn.servicios[0].id, servicioNombre: pn.servicios[0].nombre, cliente: { nombre: 'Rita Bitácora', tel: '987111000' }, estado: 'confirmada' }, adm)).j;
await call('PATCH', '/citas/' + c.id, { estado: 'en_silla' }, adm);
await call('PATCH', '/citas/' + c.id, { hora: '11:00' }, adm);
await call('PUT', '/config', { cfg: { ...pn.cfg, eslogan: 'Nuevo eslogan' }, barberos: pn.barberos, servicios: pn.servicios, usuarios: pn.usuarios }, adm);
const pub = await call('POST', '/publico/reservas', { servicioId: pn.servicios[0].id, barberoId: 'b2', fecha: f(4), hora: '12:00', cliente: { nombre: 'Cliente Web', tel: '987222333', ciudad: 'Lima' } });
await call('POST', `/publico/cita/${pub.j.codigo}/reprogramar`, { fecha: f(5), hora: '15:00' });
await call('DELETE', '/citas/' + c.id, null, adm);
r = await call('GET', '/auditoria?limit=50', null, adm);
const txt = JSON.stringify(r.j.items); console.log('   ' + r.j.items.map(x => `${x.quien} · ${x.accion} · ${x.objeto}`).join('\n   '));
check('registra quién creó la cita', r.j.items.some(x => x.accion === 'Creó cita' && x.objeto === c.codigo && /Dueño/.test(x.quien)));
check('registra el cambio de estado con antes → después', r.j.items.some(x => x.accion === 'Cambió estado' && /confirmada → en_silla/.test(x.detalle)));
check('registra la edición de hora', r.j.items.some(x => x.accion === 'Editó cita' && /hora: 10:00 → 11:00/.test(x.detalle)));
check('registra qué se cambió en la configuración', r.j.items.some(x => x.accion === 'Configuración' && /eslogan/.test(x.detalle)));
check('registra la reserva y la reprogramación del cliente', r.j.items.some(x => x.accion === 'Reservó' && x.quien === 'Cliente') && r.j.items.some(x => x.accion === 'Reprogramó' && x.objeto === pub.j.codigo));
check('registra la eliminación', r.j.items.some(x => x.accion === 'Eliminó cita' && x.objeto === c.codigo));
check('registra el cambio de clave (sin guardar la clave)', r.j.items.some(x => x.accion === 'Cambió clave') && !txt.includes('clave-segura-1'));
r = await call('GET', '/auditoria?objeto=' + c.codigo, null, adm);
check('historial de una sola cita', r.j.total === 4 && r.j.items.every(x => x.objeto === c.codigo), JSON.stringify(r.j));
r = await call('GET', '/auditoria', null, s3); check('un barbero no puede ver la bitácora', r.s === 403);
r = await call('GET', '/auditoria'); check('sin sesión → 401', r.s === 401);
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
