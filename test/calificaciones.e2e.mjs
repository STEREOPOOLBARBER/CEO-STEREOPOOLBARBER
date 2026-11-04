// Después del corte: fotos de antes y después en el estado de la cita, calificación anónima (una sola vez,
// hasta 7 días) y el resumen del panel (solo con 3 o más por barbero). También: la voz solo acepta WAV.
// Requiere wrangler dev con --var ALLOW_PIN:true --var GOOGLE_CLIENT_ID: y adminPin 5821.
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: B }, body: b ? JSON.stringify(b) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx) } catch { j = tx } return { s: r.status, j, ct: r.headers.get('content-type'), cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const nueva = async (fecha, hora, barberoId, estado, x = {}) => (await call('POST', '/citas', { fecha, hora, barberoId, servicioId: 's1', servicioNombre: 'Corte', precio: 25, cliente: { nombre: 'Cliente Secreto', tel: '955000111' }, estado, ...x }, adm)).j;

// ---- fotos de antes y después
const antes = (await call('POST', '/fotos', { data: PNG }, adm)).j.key, despues = (await call('POST', '/fotos', { data: PNG }, adm)).j.key;
const at = await nueva(lima(-1), '09:00', 'b1', 'atendida', { fotoAntes: antes, fotoDespues: despues });
let r = await call('GET', '/publico/cita/' + at.codigo);
check('el estado de una cita atendida avisa que hay fotos y que puede calificar', r.j.fotos?.antes && r.j.fotos?.despues && r.j.calificacion?.puede === true && r.j.calificacion?.hecha === false, JSON.stringify(r.j).slice(0, 200));
r = await call('GET', `/publico/cita/${at.codigo}/foto/despues`);
check('el cliente ve su foto «después» con el código de su cita', r.s === 200 && /image\//.test(r.ct), r.s);
const cf = await nueva(lima(2), '10:00', 'b1', 'confirmada', { fotoAntes: antes });
r = await call('GET', `/publico/cita/${cf.codigo}/foto/antes`);
check('antes de ser atendido no se entregan fotos', r.s === 404, r.s);
check('el estado de una cita no atendida no ofrece calificar', (await call('GET', '/publico/cita/' + cf.codigo)).j.calificacion === null);
check('código inexistente → 404', (await call('GET', '/publico/cita/ZZZZZZ/foto/antes')).s === 404);

// ---- calificar
r = await call('POST', `/publico/cita/${cf.codigo}/calificar`, { estrellas: 5 });
check('no se califica una cita que aún no fue atendida', r.s === 400, r.s);
r = await call('POST', `/publico/cita/${at.codigo}/calificar`, { estrellas: 9 });
check('estrellas fuera de 1 a 5 → 400', r.s === 400, r.s);
r = await call('POST', `/publico/cita/${at.codigo}/calificar`, { estrellas: 4, etiquetas: ['trato', 'corte', 'hackeo'], comentario: 'Muy buen fade, Cliente Secreto' });
check('el cliente califica su atención', r.s === 200, JSON.stringify(r.j));
r = await call('POST', `/publico/cita/${at.codigo}/calificar`, { estrellas: 1 });
check('solo una vez por cita (409)', r.s === 409, r.s);
check('el estado ya dice que calificó', (await call('GET', '/publico/cita/' + at.codigo)).j.calificacion?.hecha === true);
const vieja = await nueva(lima(-9), '09:00', 'b1', 'atendida');
check('pasados 7 días ya no se puede calificar', (await call('POST', `/publico/cita/${vieja.codigo}/calificar`, { estrellas: 5 })).s === 400);

// ---- anonimato: la cita no queda marcada y el panel solo muestra con 3 o más
const cita = (await call('GET', `/citas/buscar?q=${at.codigo}`, null, adm)).j.items[0];
check('la cita no guarda nada que la una con su calificación', !JSON.stringify(cita).includes('calific'), JSON.stringify(cita).slice(0, 120));
r = await call('GET', '/calificaciones', null, adm);
const b1 = () => r.j.barberos.find(b => b.id === 'b1');
check('con 1 calificación el barbero aparece oculto (sin promedio ni comentarios)', b1()?.oculto && b1().faltan === 2 && b1().promedio === undefined && !b1().comentarios, JSON.stringify(r.j));
for (const [i, e] of [[2, 5], [3, 3]]) { const c = await nueva(lima(-1), `1${i}:00`, 'b1', 'atendida'); await call('POST', `/publico/cita/${c.codigo}/calificar`, { estrellas: e, etiquetas: ['trato'] }) }
r = await call('GET', '/calificaciones', null, adm);
check('con 3 ya se ve el promedio y las etiquetas', b1()?.n === 3 && b1().promedio === 4 && b1().etiquetas.trato === 3 && b1().etiquetas.corte === 1 && !b1().etiquetas.hackeo, JSON.stringify(b1()));
check('el comentario se ve solo con el mes, sin día, hora ni nombre del cliente', b1().comentarios.length === 1 && Object.keys(b1().comentarios[0]).sort().join() === 'comentario,estrellas,mes', JSON.stringify(b1().comentarios));
check('el resumen general', r.j.general.n === 3 && r.j.general.promedio === 4);

// ---- permisos
const pn = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos.map(b => b.id === 'b1' ? { ...b, pin: '7391' } : b), servicios: pn.servicios, usuarios: pn.usuarios }, adm);
const bar = (await call('POST', '/auth/login', { pin: '7391' })).cookie;
check('el barbero sin permiso de dashboard no ve las calificaciones', (await call('GET', '/calificaciones', null, bar)).s === 403);
check('sin sesión → 401', (await call('GET', '/calificaciones')).s === 401);

// ---- voz: solo WAV
const wav = n => { const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return 'data:audio/wav;base64,' + b.toString('base64') };
check('la voz acepta WAV', (await call('POST', '/audio', { data: wav(400) }, adm)).s === 200);
check('la voz rechaza otros formatos (webm)', (await call('POST', '/audio', { data: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYEC' }, adm)).s === 400);
check('la voz rechaza un «WAV» que no lo es', (await call('POST', '/audio', { data: 'data:audio/wav;base64,' + Buffer.from('no soy un wav, soy texto').toString('base64') }, adm)).s === 400);
check('la migración v6 (calificaciones) quedó registrada', (await call('GET', '/diagnostico', null, adm)).j.db?.migraciones?.includes(6));
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
