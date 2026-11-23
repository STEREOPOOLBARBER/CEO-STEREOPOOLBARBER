// Promociones (worker/modulos/promos.js): solo quien tiene «config» las crea; el público las ve;
// el precio promo lo pone el Worker al reservar SOLO si vale ese día; contadores de vistas, toques y citas.
// Requiere wrangler dev con --var ALLOW_PIN:true y el PIN 5821 del dueño.
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: B }, body: b ? JSON.stringify(b) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx) } catch { j = tx } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), dow = f => new Date(f + 'T12:00:00Z').getUTCDay();
// Dos días hábiles (no domingo) desde mañana: en el primero vale la promo, en el segundo no.
const habiles = [1, 2, 3, 4, 5, 6, 7].map(lima).filter(f => dow(f) !== 0), [dia1, dia2] = habiles;
const pn = (await call('GET', '/panel', null, adm)).j, s1 = pn.servicios.find(s => s.id === 's1');
const reservar = (fecha, hora, tel) => call('POST', '/publico/reservas', { servicioId: 's1', barberoId: 'b1', fecha, hora, cliente: { nombre: 'Cliente Promo', tel, ciudad: 'Lima' }, consentimiento: true });
const promo = x => ({ titulo: 'Martes de corte', texto: 'Precio especial', servicioId: 's1', precio: s1.precio - 5, desde: lima(0), hasta: lima(30), dias: [dow(dia1)], activo: true, ...x });

// ---- permisos
await call('PUT', '/config', { cfg: pn.cfg, equipo: pn.equipo.map(b => b.id === 'b1' ? { ...b, pin: '7391' } : b), servicios: pn.servicios }, adm);
const bar = (await call('POST', '/auth/login', { pin: '7391' })).cookie;
check('el barbero sin permiso de config no ve ni cambia promociones', (await call('GET', '/promos', null, bar)).s === 403 && (await call('PUT', '/promos', { promos: [promo()] }, bar)).s === 403);
check('sin sesión → 401', (await call('GET', '/promos')).s === 401);

// ---- validaciones del servidor
const malo = async (x, n) => check(n, (await call('PUT', '/promos', { promos: [promo(x)] }, adm)).s === 400);
await malo({ precio: s1.precio }, 'precio promo igual o mayor que el normal → 400');
await malo({ desde: lima(5), hasta: lima(1) }, 'fechas al revés → 400');
await malo({ titulo: '' }, 'sin título → 400');
await malo({ servicioId: 'zz' }, 'servicio que no existe → 400');
check('máximo 12 promociones', (await call('PUT', '/promos', { promos: Array.from({ length: 13 }, () => promo()) }, adm)).s === 400);

// ---- crear: el texto se limpia y la foto queda pública solo mientras la promo está activa
const foto = (await call('POST', '/fotos', { data: PNG }, adm)).j.key;
let r = await call('PUT', '/promos', { promos: [promo({ foto, titulo: '  Martes de corte <b>  ', id: 'x' }), promo({ titulo: 'Vencida', desde: lima(-20), hasta: lima(-1) })] }, adm);
const [A] = r.j.promos || [];
check('el dueño guarda promociones (id propio, días limpios)', r.s === 200 && /^pr_/.test(A?.id) && A.dias.join() === String(dow(dia1)), JSON.stringify(r.j));
const pub = (await call('GET', '/publico')).j;
check('el público ve solo las vigentes, con el precio normal para tacharlo', pub.promos?.length === 1 && pub.promos[0].id === A.id && pub.promos[0].precioNormal === s1.precio && pub.promos[0].precio === s1.precio - 5, JSON.stringify(pub.promos));
check('la foto de la promo se ve sin sesión', (await call('GET', '/fotos/' + foto)).s === 200);

// ---- el precio lo decide el Worker
r = await reservar(dia1, '10:00', '955100001');
check('reserva en un día de promo → precio promo', r.s === 200 && r.j.precio === s1.precio - 5 && r.j.promo === A.titulo, JSON.stringify(r.j));
const cita = (await call('GET', '/citas/buscar?q=' + r.j.codigo, null, adm)).j.items[0];
check('la cita guarda qué promo usó y el precio normal', cita?.promo?.id === A.id && cita.promo.precioNormal === s1.precio && cita.precio === s1.precio - 5, JSON.stringify(cita?.promo));
r = await reservar(dia2, '10:00', '955100002');
check('otro día (fuera de sus días) → precio normal', r.s === 200 && r.j.precio === s1.precio && !r.j.promo, JSON.stringify(r.j));

// ---- contadores
await call('POST', '/publico/promos/visto', { ids: [A.id, 'pr_inventada'], tipo: 'v' });
await call('POST', '/publico/promos/visto', { ids: [A.id], tipo: 'v' });
await call('POST', '/publico/promos/visto', { ids: [A.id], tipo: 'c' });
r = await call('GET', '/promos', null, adm);
const st = r.j.stats?.[A.id] || {};
check('vistas, toques y citas de la promo', st.vistas === 2 && st.clics === 1 && st.citas === 1 && !r.j.stats.pr_inventada, JSON.stringify(r.j.stats));

// ---- pausada: ya no se aplica ni se muestra, y su foto deja de ser pública
await call('PUT', '/promos', { promos: [{ ...A, activo: false }] }, adm);
r = await reservar(dia1, '11:00', '955100003');
check('promo pausada → precio normal', r.s === 200 && r.j.precio === s1.precio, JSON.stringify(r.j));
check('pausada no sale al público', !(await call('GET', '/publico')).j.promos.length);
check('…y su foto ya no es pública', (await call('GET', '/fotos/' + foto)).s === 401);
check('el respaldo incluye las promociones', (await call('GET', '/exportar', null, adm)).j.promos?.length === 1);
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
