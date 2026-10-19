// Prueba de punta a punta contra `wrangler dev` (BASE=http://127.0.0.1:8787).
// Requiere datos de prueba sembrados en la D1 local y wrangler dev con --var ALLOW_PIN:true
// (el acceso con PIN está apagado por defecto; aquí se enciende solo para probar permisos).
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let ok = 0, bad = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : bad++; console.log(`${cond ? '✅' : '❌'} ${name} ${cond ? '' : extra}`) };
async function call(m, p, b, cookie) {
  const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const d = new Date(Date.now() + 2 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

let r = await call('POST', '/auth/login', { pin: '12' });
check('PIN demasiado corto rechazado', r.s === 403, JSON.stringify(r));
r = await call('POST', '/auth/login', { pin: '9999' });
check('PIN incorrecto rechazado', r.s === 403);
r = await call('GET', '/panel');
check('panel sin sesión → 401', r.s === 401);

const pub = await call('GET', '/publico');
check('publico oculta PINs y correos', !JSON.stringify(pub.j).match(/4826|5821|example\.com/), JSON.stringify(pub.j));

const reserva = { servicioId: 's1', barberoId: 'b1', fecha: d, hora: '10:00', cliente: { nombre: 'Cliente Prueba', tel: '987654321', ciudad: 'Lima' }, nota: 'hola', refFoto: PNG };
r = await call('POST', '/publico/reservas', reserva);
check('reserva creada pendiente de pago', r.s === 200 && r.j.estado === 'pendiente_pago' && r.j.expira, JSON.stringify(r.j));
const cita = r.j;
r = await call('POST', '/publico/reservas', reserva);
check('doble reserva mismo turno → 409', r.s === 409, JSON.stringify(r.j));
r = await call('POST', '/publico/reservas', { ...reserva, barberoId: 'any' });
check('"cualquiera" asigna al barbero libre', r.s === 200 && r.j.barberoId === 'b2', JSON.stringify(r.j));
r = await call('POST', '/publico/reservas', { ...reserva, hora: '13:00' });
check('hora de refrigerio rechazada', r.s === 400);
r = await call('POST', '/publico/reservas', { ...reserva, hora: '11:00', cliente: { ...reserva.cliente, tel: '12345' } });
check('teléfono inválido rechazado', r.s === 400);
r = await call('POST', `/publico/reservas/${cita.id}/captura`, { codigo: 'XXXXXX', data: PNG });
check('captura con código falso → 404', r.s === 404);
r = await call('POST', `/publico/reservas/${cita.id}/captura`, { codigo: cita.codigo, data: PNG });
check('captura de Yape subida', r.s === 200, JSON.stringify(r.j));

const adm = await call('POST', '/auth/login', { pin: '5821' });
check('login dueño con PIN', adm.s === 200 && adm.j.rol === 'dueno' && /brb_s=/.test(adm.cookie), JSON.stringify(adm));
r = await call('GET', '/panel', null, adm.cookie);
const c1 = r.j.citas?.find(c => c.id === cita.id);
check('panel ve la reserva por validar con captura', r.s === 200 && c1?.estado === 'por_validar' && c1.yapeCaptura && c1.refFoto, JSON.stringify(c1));
check('panel del dueño trae PINs para editar', r.j.cfg?.adminPin === '5821');
const v = r.j.v;
r = await call('GET', '/panel?v=' + v, null, adm.cookie);
check('panel sin cambios → respuesta mínima', r.j.same === true);

let f = await fetch(`${BASE}/api/fotos/${c1.yapeCaptura}`);
check('captura privada sin sesión → 401', f.status === 401);
f = await fetch(`${BASE}/api/fotos/${c1.yapeCaptura}`, { headers: { Cookie: adm.cookie } });
check('captura visible con sesión', f.status === 200 && f.headers.get('content-type') === 'image/png');

r = await call('PATCH', '/citas/' + cita.id, { estado: 'confirmada', adelantoOk: true }, adm.cookie);
check('dueño confirma la cita', r.s === 200 && r.j.estado === 'confirmada');
r = await call('POST', '/fotos', { data: PNG }, adm.cookie);
check('subir foto desde el panel', r.s === 200 && /^f_/.test(r.j.key));

r = await call('GET', '/diagnostico', null, adm.cookie);
check('diagnóstico: base de datos y fotos conectadas', r.s === 200 && r.j.db.ok && r.j.fotos.ok, JSON.stringify(r.j));
const barb = await call('POST', '/auth/login', { pin: '4826' });
r = await call('GET', '/diagnostico', null, barb.cookie);
check('diagnóstico solo para quien tiene Config', r.s === 403);
check('login barbero con PIN', barb.s === 200 && barb.j.rol === 'barbero');
r = await call('GET', '/panel', null, barb.cookie);
check('barbero solo ve sus citas y sin PINs', r.s === 200 && r.j.citas.every(c => c.barberoId === 'b1') && !JSON.stringify(r.j).includes('5821'), JSON.stringify(r.j).slice(0, 300));
r = await call('PUT', '/config', { cfg: {}, barberos: [], servicios: [] }, barb.cookie);
check('barbero no puede cambiar config', r.s === 403);
const otra = (await call('GET', '/panel', null, adm.cookie)).j.citas.find(c => c.barberoId === 'b2');
r = await call('PATCH', '/citas/' + otra.id, { estado: 'confirmada' }, barb.cookie);
check('barbero no toca citas ajenas', r.s === 403);
r = await call('DELETE', '/citas/' + cita.id, null, barb.cookie);
check('barbero sin permiso de eliminar', r.s === 403);

r = await call('POST', '/citas', { fecha: d, hora: '10:00', barberoId: 'b1', cliente: { nombre: 'Walk in' } }, adm.cookie);
check('panel tampoco puede duplicar turno', r.s === 409);
r = await call('POST', '/links', { id: 'l1', token: 'tok_abcdef12', adelanto: 0, nota: 'promo', cliente: { nombre: 'Ana' } }, adm.cookie);
check('crear link personal', r.s === 200);
r = await call('GET', '/publico/link/tok_abcdef12');
check('link público visible', r.j?.cliente?.nombre === 'Ana');
r = await call('POST', '/publico/reservas', { ...reserva, hora: '15:00', linkToken: 'tok_abcdef12' });
check('reserva con link sin adelanto', r.s === 200 && r.j.estado === 'por_validar', JSON.stringify(r.j));
r = await call('POST', '/publico/reservas', { ...reserva, hora: '16:00', linkToken: 'tok_abcdef12' });
check('link de un solo uso', r.s === 400);

r = await fetch(BASE + '/api/citas/' + cita.id, { method: 'DELETE', headers: { Cookie: adm.cookie, Origin: 'https://malicioso.example' } });
check('otro origen bloqueado', r.status === 403);
r = await call('POST', '/auth/logout', {}, adm.cookie);
r = await call('GET', '/panel', null, adm.cookie);
check('sesión cerrada → 401', r.s === 401);
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
