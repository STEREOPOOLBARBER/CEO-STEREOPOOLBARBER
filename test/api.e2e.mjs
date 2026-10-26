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
check('reserva nueva entra como Yape por validar, con plazo para el comprobante', r.s === 200 && r.j.estado === 'por_validar' && r.j.expira, JSON.stringify(r.j));
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

// El cliente consulta su cita con el código
r = await call('GET', `/publico/cita/${cita.codigo.toLowerCase()}`);
check('el cliente ve el estado de su cita con su código (sin importar mayúsculas)', r.s === 200 && r.j.estado === 'por_validar' && r.j.codigo === cita.codigo && r.j.barbero === 'Jhon' && r.j.servicio === 'Fade' && r.j.precio === 30, JSON.stringify(r));
check('la consulta no expone el teléfono completo ni el DNI', !JSON.stringify(r.j).includes('987654321') && r.j.cliente.tel.endsWith('321'), JSON.stringify(r.j.cliente));
r = await call('GET', '/publico/cita/ZZZZZZ');
check('código que no existe → 404', r.s === 404, JSON.stringify(r));
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
r = await call('GET', `/publico/cita/${cita.codigo}`);
check('el cliente ve que ya está confirmada y el adelanto validado', r.j.estado === 'confirmada' && r.j.adelantoOk === true, JSON.stringify(r.j));
r = await call('POST', '/fotos', { data: PNG }, adm.cookie);
check('subir foto desde el panel', r.s === 200 && /^f_/.test(r.j.key));

r = await call('GET', '/diagnostico', null, adm.cookie);
check('diagnóstico: base de datos y fotos conectadas', r.s === 200 && r.j.db.ok && r.j.fotos.ok, JSON.stringify(r.j));
// Voz grabada del narrador
const wav = n => { const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return 'data:audio/wav;base64,' + b.toString('base64') };
r = await call('POST', '/audio', { data: wav(800) }, adm.cookie);
check('el dueño sube un audio de su voz', r.s === 200 && /^a_/.test(r.j.key), JSON.stringify(r));
const aKey = r.j.key;
r = await call('POST', '/audio', { data: PNG }, adm.cookie);
check('un archivo que no es audio → 400', r.s === 400);
r = await call('POST', '/audio', { data: wav(1_400_000) }, adm.cookie);
check('audio demasiado grande → 413', r.s === 413, JSON.stringify(r));
let f2 = await fetch(`${BASE}/api/audio/${aKey}`);
check('audio que aún no está en la configuración → privado (401)', f2.status === 401);
f2 = await fetch(`${BASE}/api/audio/${aKey}`, { headers: { Cookie: adm.cookie } });
check('con sesión se puede oír', f2.status === 200 && f2.headers.get('content-type') === 'audio/wav');
const pnA = (await call('GET', '/panel', null, adm.cookie)).j;
await call('PUT', '/config', { cfg: { ...pnA.cfg, narrAudio: { hola: aKey } }, barberos: pnA.barberos, servicios: pnA.servicios, usuarios: pnA.usuarios }, adm.cookie);
f2 = await fetch(`${BASE}/api/audio/${aKey}`);
check('al guardarlo en la configuración el cliente lo oye sin sesión', f2.status === 200 && f2.headers.get('content-type') === 'audio/wav' && (await f2.arrayBuffer()).byteLength === 44 + 1600);
r = await call('GET', '/publico');
check('el formulario recibe cuál audio usar en cada frase', r.j.cfg.narrAudio?.hola === aKey);
await call('PUT', '/config', { cfg: pnA.cfg, barberos: pnA.barberos, servicios: pnA.servicios, usuarios: pnA.usuarios }, adm.cookie);
const barb = await call('POST', '/auth/login', { pin: '4826' });
r = await call('POST', '/audio', { data: wav(100) }, barb.cookie);
check('un barbero no puede subir audios', r.s === 403);
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
// Sin comprobante a tiempo la reserva se libera (plazo corto solo para la prueba)
const pn = (await call('GET', '/panel', null, adm.cookie)).j;
await call('PUT', '/config', { cfg: { ...pn.cfg, holdMin: 0.02 }, barberos: pn.barberos, servicios: pn.servicios, usuarios: pn.usuarios }, adm.cookie);
const corta = await call('POST', '/publico/reservas', { ...reserva, hora: '17:00' });
check('reserva con plazo corto creada', corta.s === 200 && corta.j.estado === 'por_validar', JSON.stringify(corta.j));
await new Promise(x => setTimeout(x, 2200));
const tarde = await call('POST', `/publico/reservas/${corta.j.id}/captura`, { codigo: corta.j.codigo, data: PNG });
check('comprobante fuera de plazo → 410', tarde.s === 410, JSON.stringify(tarde));
r = await call('GET', '/panel', null, adm.cookie);
check('la reserva sin comprobante pasó a expirada y libera el horario', r.j.citas.find(c => c.id === corta.j.id)?.estado === 'expirada');
const otra2 = await call('POST', '/publico/reservas', { ...reserva, hora: '17:00', cliente: { ...reserva.cliente, nombre: 'Otro Cliente' } });
check('el horario liberado se puede volver a reservar', otra2.s === 200, JSON.stringify(otra2.j));
await call('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos, servicios: pn.servicios, usuarios: pn.usuarios }, adm.cookie);
// Validar a mano limpia el plazo; avisado se guarda
const manual = await call('POST', '/publico/reservas', { ...reserva, hora: '18:00' });
r = await call('PATCH', '/citas/' + manual.j.id, { estado: 'confirmada', adelantoOk: true, avisado: 123 }, adm.cookie);
check('validar a mano confirma, quita el plazo y guarda el aviso', r.s === 200 && r.j.estado === 'confirmada' && r.j.expira === null && r.j.avisado === 123, JSON.stringify(r.j));
r = await call('POST', '/auth/logout', {}, adm.cookie);
r = await call('GET', '/panel', null, adm.cookie);
check('sesión cerrada → 401', r.s === 401);
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
