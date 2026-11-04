// Filtros de la agenda en el servidor (worker/modulos/filtros.js): cada filtro, los conteos, el orden,
// la paginación por cursor con cualquier orden y los permisos.
// Requiere wrangler dev con --var ALLOW_PIN:true --var GOOGLE_CLIENT_ID: y adminPin 5821.
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: B }, body: b ? JSON.stringify(b) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx) } catch { j = tx } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie;

// ---- datos: enero 2026 (más una fuera del mes y la historia de Ana en 2025)
const lejos = Date.now() + 30 * 864e5, pronto = Date.now() + 3600e3;
const mk = (fecha, hora, barberoId, servicioId, nombre, tel, estado, precio, x = {}) => ({ fecha, hora, barberoId, servicioId, servicioNombre: servicioId, precio, cliente: { nombre, tel }, estado, origen: 'panel', adelanto: 0, adelantoOk: false, ...x });
const DATOS = {
  A: mk('2026-01-05', '09:00', 'b1', 's1', 'Ana Zeta', '900000101', 'confirmada', 25, { origen: 'web', adelanto: 10, adelantoOk: true, asistencia: { ts: 1, via: 'link' } }),
  B: mk('2026-01-05', '10:00', 'b1', 's2', 'Bruno Alfa', '900000102', 'confirmada', 30, { recordado: 1 }),
  C: mk('2026-01-06', '09:00', 'b2', 's1', 'Carla Media', '900000103', 'atendida', 40, { origen: 'walkin', fotoDespues: 'f_x' }),
  D: mk('2026-01-06', '10:00', 'b2', 's4', 'Dario Beta', '900000104', 'atendida', 40, { gratis: true }),
  E: mk('2026-01-07', '09:00', 'b1', 's1', 'Elsa Gama', '900000105', 'por_validar', 25, { origen: 'web', adelanto: 10, yapeCaptura: 'f_cap', expira: lejos }),
  F: mk('2026-01-07', '10:00', 'b1', 's2', 'Fabio Delta', '900000106', 'por_validar', 30, { origen: 'web', adelanto: 10, expira: pronto }),
  G: mk('2026-02-10', '09:00', 'b1', 's1', 'Gina Fuera', '900000107', 'por_validar', 25, { origen: 'web', adelanto: 10, yapeCaptura: 'f_c2', expira: lejos }),
  H: mk('2026-01-08', '09:00', 'b2', 's1', 'Hugo Falta', '900000108', 'no_vino', 25),
  I: mk('2026-01-08', '10:00', 'b2', 's1', 'Iris Cancel', '900000109', 'cancelada', 25),
  J: mk('2026-01-09', '09:00', 'b2', 's1', 'Juan Expira', '900000110', 'expirada', 25, { origen: 'web', adelanto: 10 }),
  K: mk('2026-01-09', '11:00', 'b1', 's1', 'Ana Zeta', '900000101', 'en_silla', 25, { enSillaTs: Date.now() }),
};
const ID = {};
for (const [k, c] of Object.entries(DATOS)) ID[(await call('POST', '/citas', c, adm)).j.id] = k;
for (const f of ['2025-10-01', '2025-11-01', '2025-12-01']) await call('POST', '/citas', mk(f, '09:00', 'b1', 's1', 'Ana Zeta', '900000101', 'atendida', 25), adm);
await call('PATCH', '/clientes/900000102', { notas: 'Le gusta corto', prefs: '' }, adm);

const TODOS = 'por_validar,pendiente_pago,confirmada,en_silla,atendida,no_vino,cancelada', ENE = 'desde=2026-01-01&hasta=2026-01-31';
const letras = items => items.map(c => ID[c.id] || '·').join('');
const lista = async (qs, c = adm) => { const r = await call('GET', '/citas/buscar?' + qs + '&limit=100', null, c); return r.s === 200 ? letras(r.j.items) : 'ERROR ' + r.s + ' ' + JSON.stringify(r.j) };
const igual = async (n, qs, esperado, c) => { const x = await lista(qs, c); check(n, [...x].sort().join('') === [...esperado].sort().join(''), `${x} ≠ ${esperado}`) };

await igual('periodo + «Todos» (sin expiradas ni otros meses)', `${ENE}&estado=${TODOS}`, 'ABCDEFHIK');
await igual('varios barberos y uno solo', `${ENE}&estado=${TODOS}&barbero=b2`, 'CDHI');
await igual('un servicio', `${ENE}&estado=${TODOS}&servicio=s2`, 'BF');
await igual('varios servicios', `${ENE}&estado=${TODOS}&servicio=s2,s4`, 'BFD');
await igual('pago: adelanto validado', `${ENE}&estado=${TODOS}&pago=yape_ok`, 'A');
await igual('pago: Yape pendiente', `${ENE}&estado=${TODOS}&pago=yape_pend`, 'EF');
await igual('pago: gratis', `${ENE}&estado=${TODOS}&pago=gratis`, 'D');
await igual('pago: sin adelanto', `${ENE}&estado=${TODOS}&pago=sin`, 'BCHIK');
await igual('origen: reservó por link', `${ENE}&estado=${TODOS}&origen=web`, 'AEF');
await igual('origen: sin cita', `${ENE}&estado=${TODOS}&origen=walkin`, 'C');
await igual('origen: agendada en panel', `${ENE}&estado=${TODOS}&origen=panel`, 'BDHIK');
await igual('WhatsApp: confirmó que viene', `${ENE}&estado=${TODOS}&wa=confirmo`, 'A');
await igual('WhatsApp: recordado sin respuesta', `${ENE}&estado=${TODOS}&wa=recordado`, 'B');
await igual('WhatsApp: sin recordar', `${ENE}&estado=${TODOS}&wa=sin_recordar`, 'CDEFHIK');
await igual('cliente nuevo (sin visitas antes de esa fecha)', `${ENE}&estado=${TODOS}&cliente=nuevo`, 'BCDEFHI');
await igual('cliente frecuente (3+ visitas)', `${ENE}&estado=${TODOS}&cliente=frecuente`, 'AK');
await igual('cliente con notas', `${ENE}&estado=${TODOS}&cliente=notas`, 'B');
await igual('Yape por validar: todos los días, con captura', `estado=por_validar,pendiente_pago&captura=con`, 'EG');
await igual('Yape por validar: sin captura', `estado=por_validar,pendiente_pago&captura=sin`, 'F');
await igual('Atendido: sin foto «después»', `${ENE}&estado=atendida&foto=sin_despues`, 'D');
await igual('Cancelada: solo expiradas', `${ENE}&estado=expirada`, 'J');
await igual('filtros combinados (barbero + origen + WhatsApp)', `${ENE}&estado=${TODOS}&barbero=b1&origen=web&wa=sin_recordar`, 'EF');
await igual('valores raros se ignoran sin romper nada', `${ENE}&estado=${TODOS}&servicio=${encodeURIComponent("s1') OR 1=1--")}&pago=nada&orden=${encodeURIComponent('fecha; DROP TABLE citas')}`, 'ABCDEFHIK');

// ---- orden
const primero = async (qs, k) => { const x = await lista(qs); check(`orden ${qs.match(/orden=(\w+)/)?.[1]}: primero ${k}`, x[0] === k, x) };
await primero(`${ENE}&estado=${TODOS}&orden=nombre`, 'A');
await primero(`${ENE}&estado=${TODOS}&orden=monto`, 'C');
await primero(`${ENE}&estado=${TODOS}&orden=hora_desc`, 'K');
await primero(`estado=por_validar,pendiente_pago&orden=creada`, 'E');
await primero(`estado=por_validar,pendiente_pago&orden=vence`, 'F');
await primero(`${ENE}&estado=en_silla&orden=silla`, 'K');
check('orden por nombre: Iris al final', (await lista(`${ENE}&estado=${TODOS}&orden=nombre`)).endsWith('I'));
for (const orden of ['nombre', 'monto', 'hora_desc', 'hora']) {
  let cur = '', vistos = [], vueltas = 0;
  do { const r = await call('GET', `/citas/buscar?${ENE}&estado=${TODOS}&orden=${orden}&limit=2${cur ? '&cursor=' + encodeURIComponent(cur) : ''}`, null, adm); vistos.push(...r.j.items.map(c => ID[c.id])); cur = r.j.siguiente } while (cur && ++vueltas < 20);
  const todo = await lista(`${ENE}&estado=${TODOS}&orden=${orden}`);
  check(`páginas por cursor con orden «${orden}»: sin repetir ni saltar, en el mismo orden`, vistos.join('') === todo && new Set(vistos).size === 9, `${vistos.join('')} vs ${todo}`);
}
const t = await call('GET', '/citas/buscar?q=zeta&limit=30', null, adm);
check('la búsqueda con texto mira todas las fechas (Ana: 2 en enero + 3 de 2025)', t.j.total === 5, t.j.total);

// ---- conteos
let r = await call('GET', `/citas/conteo?${ENE}`, null, adm), e = r.j.estados || {};
check('conteo por estado del periodo', e.confirmada?.n === 2 && e.atendida?.n === 2 && e.por_validar?.n === 2 && e.no_vino?.n === 1 && e.cancelada?.n === 1 && e.expirada?.n === 1 && e.en_silla?.n === 1, JSON.stringify(e));
check('«Yape por validar» cuenta todos los días (también febrero)', r.j.porValidar?.n === 3, JSON.stringify(r.j.porValidar));
check('montos por estado (gratis cuenta 0)', e.atendida?.m === 40 && e.confirmada?.m === 55, JSON.stringify(e));
r = await call('GET', `/citas/conteo?${ENE}&origen=web`, null, adm);
check('el conteo respeta los filtros', r.j.estados.por_validar?.n === 2 && r.j.estados.confirmada?.n === 1 && !r.j.estados.atendida && r.j.porValidar.n === 3, JSON.stringify(r.j));
r = await call('GET', `/citas/conteo?q=zeta`, null, adm);
check('el conteo con texto mira todas las fechas', r.j.estados.atendida?.n === 3 && r.j.estados.confirmada?.n === 1 && r.j.estados.en_silla?.n === 1, JSON.stringify(r.j));

// ---- permisos: barbero sin ver todas, sin montos y sin clientes
const pn = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos.map(b => b.id === 'b1' ? { ...b, pin: '7391' } : b), servicios: pn.servicios, usuarios: pn.usuarios }, adm);
const bar = (await call('POST', '/auth/login', { pin: '7391' })).cookie;
await igual('el barbero solo ve sus citas aunque pida otro barbero', `${ENE}&estado=${TODOS}&barbero=b2`, 'ABEFK', bar);
await igual('sin permiso de montos, el filtro de pago no se aplica', `${ENE}&estado=${TODOS}&pago=yape_ok`, 'ABEFK', bar);
await igual('sin permiso de clientes, el filtro de cliente no se aplica', `${ENE}&estado=${TODOS}&cliente=notas`, 'ABEFK', bar);
check('sin permiso de montos, el orden por monto no se aplica', (await lista(`${ENE}&estado=${TODOS}&orden=monto`, bar)) === (await lista(`${ENE}&estado=${TODOS}`, bar)));
r = await call('GET', `/citas/conteo?${ENE}`, null, bar);
check('el conteo del barbero: solo lo suyo y sin montos', r.j.estados.atendida === undefined && r.j.estados.confirmada?.n === 2 && r.j.estados.confirmada.m === null && r.j.porValidar.n === 3, JSON.stringify(r.j));
check('sin sesión → 401', (await call('GET', '/citas/conteo')).s === 401);
const d = (await call('GET', '/diagnostico', null, adm)).j;
check('la migración v5 (filtros) quedó registrada', d.db?.migraciones?.includes(5), JSON.stringify(d).slice(0, 200));

console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
