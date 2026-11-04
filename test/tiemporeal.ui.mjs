// Prueba de la Fase 6: tiempo real. Con el panel abierto, una reserva hecha desde el formulario aparece al instante.
import { createRequire } from 'node:module';
import http from 'node:http';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const api = async (m, p, b, h = {}) => { const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), Origin: B, ...h }, body: b ? JSON.stringify(p === '/publico/reservas' && b && !('consentimiento' in b) ? { consentimiento: true, ...b } : b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) } };
// petición de WebSocket «a mano» (fetch no permite el encabezado Upgrade): devuelve el código HTTP
const ws = (h = {}) => new Promise(res => { const u = new URL(B + '/api/tiempo-real'); const q = http.request({ host: u.hostname, port: u.port, path: u.pathname, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...h } }); q.on('response', r => { res(r.statusCode); r.resume() }); q.on('upgrade', (r, sock) => { res(101); sock.destroy() }); q.on('error', () => res(0)); q.end() });
// seguridad del WebSocket
check('sin sesión no se abre el tiempo real', await ws({ Origin: B }) === 401);
const login = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B }, body: '{"pin":"5821"}' }), cookie = login.headers.get('set-cookie').split(';')[0];
check('desde otro sitio → 403 (aunque tenga la cookie)', await ws({ Cookie: cookie, Origin: 'https://otro-sitio.com' }) === 403);
check('desde la propia página y con sesión → se abre (101)', await ws({ Cookie: cookie, Origin: B }) === 101);
let r;
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 412, height: 900 }, timezoneId: 'America/Lima' }), P = await ctx.newPage();
const errs = []; P.on('pageerror', e => errs.push(e.message)); P.on('console', m => { if (/Refused|Content Security/i.test(m.text())) errs.push(m.text()) });
const lr = await ctx.request.post(B + '/api/auth/login', { data: { pin: '5821' }, headers: { Origin: B } });
await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), await lr.json()); await P.reload(); await P.waitForSelector('#login', { state: 'hidden' });
await P.waitForFunction(() => document.querySelector('#vivo')?.classList.contains('on'), null, { timeout: 8000 }).catch(() => {});
check('el panel queda «en vivo» (punto verde)', await P.evaluate(() => trVivo()));
r = await api('GET', '/tiempo-real/estado', null, { Cookie: cookie }); check('el servidor ve 1 panel conectado', r.j.activo && r.j.conectados >= 1, JSON.stringify(r.j));
// reserva desde el formulario público (otro «celular»)
const pub = (await api('GET', '/publico')).j, lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()), d = new Date(lima + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 2); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
const t0 = Date.now();
r = await api('POST', '/publico/reservas', { servicioId: pub.servicios[0].id, barberoId: pub.barberos[0].id, fecha: d.toISOString().slice(0, 10), hora: '10:00', cliente: { nombre: 'Viviana Envivo', tel: '987654000', ciudad: 'Lima' } });
check('reserva creada', r.s === 200, JSON.stringify(r.j));
await P.waitForFunction(() => S.citas.some(c => c.cliente?.nombre === 'Viviana Envivo'), null, { timeout: 10000 }).catch(() => {});
const ms = Date.now() - t0, llego = await P.evaluate(() => S.citas.some(c => c.cliente?.nombre === 'Viviana Envivo'));
check(`la reserva aparece en el panel al instante (${ms} ms, antes hasta 20 000 ms)`, llego && ms < 5000, `${ms} ms`);
check('y la campana la cuenta', +(await P.locator('#hDot').innerText()) >= 1);
// edición desde otro dispositivo
const id = await P.evaluate(() => S.citas.find(c => c.cliente?.nombre === 'Viviana Envivo').id), t1 = Date.now();
await api('PATCH', '/citas/' + id, { estado: 'confirmada', adelantoOk: true }, { Cookie: cookie });
await P.waitForFunction(i => S.citas.find(c => c.id === i)?.estado === 'confirmada', id, { timeout: 10000 }).catch(() => {});
check(`un cambio hecho en otro dispositivo también llega al instante (${Date.now() - t1} ms)`, (await P.evaluate(i => S.citas.find(c => c.id === i)?.estado, id)) === 'confirmada' && Date.now() - t1 < 5000);
check('sin errores ni violaciones de CSP (el WebSocket cumple la política)', !errs.length, errs.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
