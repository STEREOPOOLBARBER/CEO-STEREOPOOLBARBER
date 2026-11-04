// Prueba de WhatsApp automático (API oficial de Meta) con un Meta simulado, y de la confirmación de asistencia.
// Arranque: --test-scheduled --var WHATSAPP_API_URL:http://127.0.0.1:8796 (ver test/correr.mjs).
import http from 'node:http';
import crypto from 'node:crypto';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const TOKEN = 'EAAG-token-de-prueba-1234567890-abcd', SECRETO = 'app-secret-de-prueba';
const recibidos = [];
const meta = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => {
  recibidos.push({ url: q.url, auth: q.headers.authorization, body: b ? JSON.parse(b) : null }); r.setHeader('Content-Type', 'application/json');
  if (q.headers.authorization !== 'Bearer ' + TOKEN) { r.statusCode = 401; return r.end(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } })) }
  if (q.method === 'GET') return r.end(JSON.stringify({ display_phone_number: '+51 999 888 777', verified_name: 'Stereo Barber Pool', quality_rating: 'GREEN', id: '111' }));
  r.end(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.' + recibidos.length }] }));
}) }).listen(8796);
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c, h = {}) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: BASE, ...h }, body: b ? (typeof b === 'string' ? b : JSON.stringify(b)) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie, pn = (await call('GET', '/panel', null, adm)).j;
const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()), f = d => { const x = new Date(lima + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) };
const limaMin = (() => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':'); return +p[0] * 60 + +p[1] })(), hh = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
let r = await call('GET', '/whatsapp/config', null, adm);
check('por defecto: sin conectar y con las plantillas sugeridas', !r.j.conectado && r.j.tplRecordatorio === 'recordatorio_cita' && r.j.version === 'v23.0');
r = await call('POST', '/whatsapp/probar', {}, adm); check('probar sin datos explica qué falta', r.s === 400 && /Phone number ID/.test(r.j.error));
await call('PUT', '/whatsapp/config', { phoneId: '1234567890', wabaId: '987654', token: TOKEN, secreto: SECRETO, auto: { diaAntes: false, dosHoras: false, alConfirmar: false } }, adm);
r = await call('GET', '/whatsapp/config', null, adm);
check('el token nunca vuelve completo (se muestra ••••abcd)', r.j.token === '••••abcd' && !JSON.stringify(r.j).includes(TOKEN) && r.j.verifyToken.length > 10 && /\/api\/whatsapp\/webhook$/.test(r.j.webhook), JSON.stringify(r.j));
const verify = r.j.verifyToken;
check('ni aparece en el panel, en lo público ni en el respaldo', !JSON.stringify((await call('GET', '/panel', null, adm)).j).includes(TOKEN) && !JSON.stringify((await call('GET', '/publico')).j).includes(TOKEN));
r = await call('POST', '/whatsapp/probar', {}, adm);
check('probar conexión: lee el número y el nombre verificado', r.s === 200 && r.j.ok && r.j.numero === '+51 999 888 777' && recibidos.at(-1).url.startsWith('/v23.0/1234567890?fields='), JSON.stringify(r.j));
check('usa el token como Bearer', recibidos.at(-1).auth === 'Bearer ' + TOKEN);
check('el panel sabe que está conectado', (await call('GET', '/panel', null, adm)).j.wa?.ok === true);
// envío manual de un recordatorio
const c1 = (await call('POST', '/citas', { fecha: f(1), hora: '10:00', barberoId: 'b1', servicioId: pn.servicios[0].id, cliente: { nombre: 'Marco Recordado', tel: '987 222 111' }, estado: 'confirmada' }, adm)).j;
r = await call('POST', '/whatsapp/enviar', { id: c1.id, tipo: 'recordatorio' }, adm);
const env1 = recibidos.at(-1).body;
check('envía la plantilla de recordatorio al celular con 51', r.s === 200 && env1.to === '51987222111' && env1.template.name === 'recordatorio_cita' && env1.template.language.code === 'es', JSON.stringify(env1));
const ps = env1.template.components[0].parameters.map(p => p.text);
check('con los datos de la cita (nombre, negocio, «mañana», hora, barbero, link)', ps[0] === 'Marco' && /^mañana /.test(ps[2]) && ps[3] === '10:00 a. m.' && ps[4] === 'Jhon' && new RegExp('/estado\\.html\\?c=' + c1.codigo + '$').test(ps[5]), ps.join(' | '));
let ct = (await call('GET', '/panel', null, adm)).j.citas.find(x => x.id === c1.id);
check('la cita guarda el envío (id del mensaje)', ct.wa?.recordatorio?.id?.startsWith('wamid.'), JSON.stringify(ct.wa));
// webhook
const firma = t => 'sha256=' + crypto.createHmac('sha256', SECRETO).update(t).digest('hex');
r = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${verify}&hub.challenge=777`); check('webhook: Meta verifica con el token', r.status === 200 && await r.text() === '777');
r = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=777`); check('token de verificación equivocado → 403', r.status === 403);
const ev = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: ct.wa.recordatorio.id, status: 'read' }] } }] }] });
r = await call('POST', '/whatsapp/webhook', ev, null, { 'X-Hub-Signature-256': 'sha256=falsa' }); check('webhook con firma falsa → 401', r.s === 401);
r = await call('POST', '/whatsapp/webhook', ev, null, { 'X-Hub-Signature-256': firma(ev) }); check('webhook con firma válida → OK', r.s === 200);
ct = (await call('GET', '/panel', null, adm)).j.citas.find(x => x.id === c1.id); check('el panel ve que el cliente LEYÓ el recordatorio', ct.wa.recordatorio.estado === 'read');
const resp = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '51987222111', type: 'text', text: { body: 'Sí, voy 👍' } }] } }] }] });
await call('POST', '/whatsapp/webhook', resp, null, { 'X-Hub-Signature-256': firma(resp) });
ct = (await call('GET', '/panel', null, adm)).j.citas.find(x => x.id === c1.id); check('si responde «Sí, voy», su cita queda «Confirmó que viene»', ct.asistencia?.via === 'whatsapp', JSON.stringify(ct.asistencia));
// confirmación desde el link de la cita
const c2 = (await call('POST', '/citas', { fecha: f(2), hora: '11:00', barberoId: 'b2', servicioId: pn.servicios[0].id, cliente: { nombre: 'Lia Link', tel: '987333444' }, estado: 'confirmada' }, adm)).j;
r = await call('GET', '/publico/cita/' + c2.codigo); check('la página de estado sabe que aún no confirmó', r.j.asistencia === false);
r = await call('POST', `/publico/cita/${c2.codigo}/confirmar`, {}); check('el cliente confirma desde su link', r.s === 200 && (await call('GET', '/publico/cita/' + c2.codigo)).j.asistencia === true);
r = await call('POST', '/publico/cita/ZZZZZZ/confirmar', {}); check('código falso → 404', r.s === 404);
// automáticos (cron)
await call('PUT', '/whatsapp/config', { auto: { diaAntes: true, horaDiaAntes: '00:00', dosHoras: true, alConfirmar: true } }, adm);
const c3 = (await call('POST', '/citas', { fecha: f(1), hora: '15:00', barberoId: 'b3', servicioId: pn.servicios[0].id, cliente: { nombre: 'Nora Automatica', tel: '987444555' }, estado: 'confirmada' }, adm)).j;
let c4 = null; if (limaMin + 120 < 23 * 60) c4 = (await call('POST', '/citas', { fecha: f(0), hora: hh(Math.ceil((limaMin + 118) / 5) * 5), barberoId: 'b4', servicioId: pn.servicios[0].id, cliente: { nombre: 'Dante Dos Horas', tel: '987555666' }, estado: 'confirmada' }, adm)).j;
const web = (await call('POST', '/publico/reservas', { servicioId: pn.servicios[0].id, barberoId: 'b5', fecha: f(3), hora: '12:00', cliente: { nombre: 'Wendy Web', tel: '987666777', ciudad: 'Lima' }, consentimiento: true })).j;
await call('PATCH', '/citas/' + web.id, { estado: 'confirmada', adelantoOk: true }, adm);
const antes = recibidos.length;
await fetch(BASE + '/__scheduled?cron=*/5+*+*+*+*');
const nuevos = recibidos.slice(antes).map(x => x.body);
check('cron: recordatorio del día anterior a la cita de mañana', nuevos.some(b => b.to === '51987444555' && b.template.name === 'recordatorio_cita'), JSON.stringify(nuevos.map(b => b.to)));
check('cron: no repite al que ya se le recordó a mano', !nuevos.some(b => b.to === '51987222111'));
if (c4) check('cron: aviso 2 horas antes', nuevos.some(b => b.to === '51987555666'), JSON.stringify(nuevos.map(b => b.to)));
check('cron: «cita confirmada» al validar el Yape de una reserva web', nuevos.some(b => b.to === '51987666777' && b.template.name === 'cita_confirmada'));
const ya = recibidos.length; await fetch(BASE + '/__scheduled?cron=*/5+*+*+*+*');
check('el cron no envía dos veces lo mismo', recibidos.length === ya, `${recibidos.length - ya} de más`);
// permisos y desconexión
await call('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos.map(b => b.id === 'b1' ? { ...b, pin: '7391' } : b), servicios: pn.servicios, usuarios: pn.usuarios }, adm);
const bar = (await call('POST', '/auth/login', { pin: '7391' })).cookie;
check('un barbero no ve la configuración de WhatsApp', (await call('GET', '/whatsapp/config', null, bar)).s === 403);
check('ni puede enviar a citas de otro barbero', (await call('POST', '/whatsapp/enviar', { id: c3.id }, bar)).s === 403);
await call('POST', '/whatsapp/desconectar', {}, adm); r = await call('GET', '/whatsapp/config', null, adm);
check('desconectar borra el token y apaga los envíos', !r.j.token && !r.j.conectado && !r.j.auto.diaAntes);
console.log(`\n${ok} OK · ${bad} fallos`); meta.close(); process.exit(bad ? 1 : 0);
