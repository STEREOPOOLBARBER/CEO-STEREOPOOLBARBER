// Duración de servicios y horas de espera (bloques [1,0,1]): el link de reservas y el panel respetan cada hora
// ocupada; la hora de espera queda libre para otro cliente; nada se pisa, ni con dos reservas a la vez (tabla turnos).
// Requiere wrangler dev con ALLOW_PIN y el PIN 5821 del dueño.
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: B }, body: b ? JSON.stringify(b) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx) } catch { j = tx } return { s: r.status, j } };
const adm = (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B }, body: JSON.stringify({ pin: '5821' }) })).headers.get('set-cookie').split(';')[0];
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), dow = f => new Date(f + 'T12:00:00Z').getUTCDay();
const [f, f2] = [2, 3, 4, 5, 6, 7, 8].map(lima).filter(x => dow(x) !== 0);
const pn = (await call('GET', '/panel', null, adm)).j;
const cfg = { ...pn.cfg, dias: [0, 1, 2, 3, 4, 5, 6], apertura: '09:00', cierre: '20:00', refIni: '13:00', refFin: '14:00', anticipacion: 0, ventana: 14 };
const servicios = pn.servicios.map(s => s.id === 's3' ? { ...s, nombre: 'Semiondulación', bloques: [1, 0, 1] } : s.id === 's4' ? { ...s, bloques: [1, 1] } : s.id === 's5' ? { ...s, bloques: [0, 1] } : s);
let r = await call('PUT', '/config', { cfg, equipo: pn.equipo, servicios }, adm);
check('el dueño guarda la duración de cada servicio', r.s === 200, JSON.stringify(r.j).slice(0, 200));
const pub = (await call('GET', '/publico')).j, sv = id => pub.servicios.find(s => s.id === id);
check('el servicio de 3 h con espera queda guardado (ocupado · espera · ocupado)', JSON.stringify(sv('s3').bloques) === '[1,0,1]' && JSON.stringify(sv('s4').bloques) === '[1,1]');
check('una duración mal hecha (empieza en espera) no se guarda: queda de 1 h', !sv('s5').bloques && !sv('s1').bloques);

const reservar = (servicioId, hora, tel, fecha = f, barberoId = 'b1') => call('POST', '/publico/reservas', { servicioId, barberoId, fecha, hora, cliente: { nombre: 'Cliente ' + tel.slice(-3), tel, ciudad: 'Lima' }, consentimiento: true });
r = await reservar('s3', '09:00', '955200001');
check('reserva la semiondulación de 3 h a las 9', r.s === 200, JSON.stringify(r.j));
const larga = r.j;
const oc = (await call('GET', '/publico')).j.ocupados.filter(o => o.b === 'b1' && o.f === f).map(o => o.h).sort();
check('ocupa 9:00 y 11:00; las 10:00 (espera) quedan libres', JSON.stringify(oc) === '["09:00","11:00"]', JSON.stringify(oc));
r = await reservar('s1', '10:00', '955200002');
check('otro cliente reserva un corte de 1 h en la hora de espera', r.s === 200, JSON.stringify(r.j));
r = await reservar('s1', '11:00', '955200003');
check('nadie puede reservar en una hora ocupada del servicio largo (409)', r.s === 409, JSON.stringify(r.j));
r = await reservar('s3', '08:00', '955200004'); check('hora fuera del horario → 400', r.s === 400);
r = await reservar('s3', '18:00', '955200005');
check('no entra si su última hora pasa del cierre (18:00 + 3 h)', r.s === 400 && /cierre/.test(r.j.error), JSON.stringify(r.j));
r = await reservar('s4', '12:00', '955200006');
check('no entra si una hora OCUPADA cae en el refrigerio', r.s === 400 && /refrigerio/.test(r.j.error), JSON.stringify(r.j));
r = await reservar('s3', '12:00', '955200007', f, 'b2');
check('la hora de ESPERA sí puede caer en el refrigerio (12:00 · 13:00 espera · 14:00)', r.s === 200, JSON.stringify(r.j));
r = await reservar('s3', '15:00', '955200008', f, 'any');
check('«cualquier barbero» elige uno libre en TODAS sus horas', r.s === 200 && !!r.j.barberoId, JSON.stringify(r.j));

// panel: también respeta las horas ocupadas
r = await call('POST', '/citas', { fecha: f, hora: '11:00', barberoId: 'b1', servicioId: 's1', servicioNombre: 'Corte', precio: 25, cliente: { nombre: 'Panel Choca' }, estado: 'confirmada' }, adm);
check('el panel tampoco puede poner una cita encima (409)', r.s === 409, JSON.stringify(r.j));
r = await call('POST', '/citas', { fecha: f, hora: '16:00', barberoId: 'b1', servicioId: 's3', servicioNombre: 'Semiondulación', precio: 250, cliente: { nombre: 'Panel Larga' }, estado: 'confirmada' }, adm);
check('el panel copia la duración del servicio a la cita', r.s === 200 && JSON.stringify(r.j.bloques) === '[1,0,1]', JSON.stringify(r.j));
const pl = r.j;
check('mover una cita larga encima de otra → 409', (await call('PATCH', '/citas/' + pl.id, { hora: '09:00' }, adm)).s === 409);
r = await call('PATCH', '/citas/' + pl.id, { servicioId: 's1' }, adm);
check('si cambias el servicio a uno de 1 h, la cita pasa a ocupar 1 h', r.s === 200 && !r.j.bloques, JSON.stringify(r.j));

// cancelar libera todas sus horas
await call('PATCH', '/citas/' + larga.id, { estado: 'cancelada' }, adm);
r = await reservar('s1', '11:00', '955200009');
check('al cancelar la cita larga, sus horas quedan libres', r.s === 200, JSON.stringify(r.j));

// dos reservas a la vez que se pisan: solo una gana
const [a, b] = await Promise.all([reservar('s3', '15:00', '955200010', f2), reservar('s1', '17:00', '955200011', f2)]);
check('dos clientes a la vez por la misma hora: entra uno solo', [a.s, b.s].sort().join() === '200,409', `${a.s} ${b.s}`);
check('la migración v11 (duración) quedó registrada', (await call('GET', '/diagnostico', null, adm)).j.db?.migraciones?.includes(11));
console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
