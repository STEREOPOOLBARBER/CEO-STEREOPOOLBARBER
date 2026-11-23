// Prueba de pantalla de los avisos al celular. El servicio de avisos del navegador se simula (el Chromium de
// pruebas no tiene uno real): la suscripción apunta a 127.0.0.1:8795, que responde 201.
// Cliente: tarjeta «Recibe avisos de tu cita» → Activar → «Avisos activados» → Apagar.
// Panel: ☰ → Avisos en este celular → Activar → Probar → Apagar (y al cerrar sesión se apagan).
import { createRequire } from 'node:module';
import http from 'node:http';
import crypto from 'node:crypto';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const recibidos = []; const srv = http.createServer((req, res) => { req.resume(); req.on('end', () => { recibidos.push(req.url); res.writeHead(201); res.end() }) });
await new Promise(r => srv.listen(8795, '127.0.0.1', r));
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const SUB = { endpoint: 'http://127.0.0.1:8795/push/ui', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Lima' });
await ctx.addInitScript(sub => {
  let actual = null; const fake = { getSubscription: async () => actual, subscribe: async o => { window.__subscribeKey = o.applicationServerKey?.length; actual = { toJSON: () => sub }; return actual } };
  Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { get: () => fake });
  window.PushManager = window.PushManager || function () { };
  let permiso = 'default'; // el Chromium sin pantalla los niega siempre: se simula el permiso del celular
  Object.defineProperty(Notification, 'permission', { get: () => permiso });
  Notification.requestPermission = async () => (permiso = 'granted');
}, SUB);
const errores = [];
const nueva = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errores.push(e.message)); p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(m.text()) }); return p };
const api = async (m, p, data) => (await ctx.request.fetch(B + '/api' + p, { method: m, data, headers: { Origin: B } })).json();
const adm = await api('POST', '/auth/login', { pin: '5821' });
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);

// ---- cliente
const cf = await api('POST', '/citas', { fecha: lima(3), hora: '10:00', barberoId: 'b2', servicioId: 's1', servicioNombre: 'Corte', precio: 25, cliente: { nombre: 'Rosa Avisos', tel: '966000777' }, estado: 'confirmada' });
const E = await nueva(); await E.goto(B + '/cita/' + cf.codigo); await E.waitForSelector('#splash.listo'); await E.click('#splash');
await E.waitForSelector('#avisosCard:not([hidden])');
check('la app de la cita ofrece «Recibe avisos de tu cita»', /recibe avisos de tu cita/i.test(await E.locator('#avisosCard').innerText()));
await E.click('[data-on-click="avisosActivar"]'); await E.waitForSelector('text=Avisos activados', { timeout: 8000 });
check('al activar: registra el service worker de /cita/ y se suscribe con la clave del servidor', await E.evaluate(async () => (await navigator.serviceWorker.getRegistration('/cita/'))?.scope.endsWith('/cita/') && window.__subscribeKey === 65));
check('sin emojis en la tarjeta', !/\p{Extended_Pictographic}/u.test(await E.locator('#avisosCard').innerText()));
const sw = await (await ctx.request.get(B + '/cita/sw.js')).text();
check('/cita/sw.js muestra avisos y no guarda caché', /showNotification/.test(sw) && !/caches\./.test(sw));
await E.click('[data-on-click="avisosApagar"]'); await E.waitForSelector('text=Recibe avisos de tu cita');
check('el cliente puede apagarlos', true);

// ---- panel
const P = await nueva(); await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), adm); await P.reload(); await P.waitForSelector('#agChips .chip');
await P.evaluate(() => abrirMenu()); await P.click('[data-on-click="abrirAvisos"]'); await P.waitForSelector('[data-on-click="avisosActivar"]');
check('☰ → «Avisos en este celular» explica qué avisa', /nueva reserva/i.test(await P.locator('#mbody').innerText()));
await P.click('[data-on-click="avisosActivar"]'); await P.waitForSelector('text=Avisos activados', { timeout: 8000 });
const n0 = recibidos.length; await P.click('[data-on-click="avisosProbar"]'); await P.waitForFunction(n => window.document.body.innerText.includes('Enviado'), n0, { timeout: 8000 }).catch(() => { });
check('«Enviarme un aviso de prueba» llega al servicio de avisos', recibidos.length === n0 + 1, String(recibidos.length - n0));
await P.click('[data-on-click="avisosApagar"]'); await P.waitForSelector('[data-on-click="avisosActivar"]');
const n1 = recibidos.length; await api('POST', '/push/probar', {});
check('apagado: ya no le llegan', recibidos.length === n1);
check('sin errores ni violaciones de CSP', !errores.length, errores.join(' | '));
srv.close(); console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
