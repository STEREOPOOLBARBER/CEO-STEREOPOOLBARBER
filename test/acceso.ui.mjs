// Prueba de la pantalla: el dueño pone la clave y genera el QR «Activar su celular»; el barbero lo abre, entra con
// esa clave, activa su huella (autenticador virtual) y vuelve a entrar con ella. También la opción de clave temporal.
// Requiere wrangler dev en http://localhost:8787 con --var ALLOW_PIN:true y los datos de api.e2e.mjs.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0;
const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch();
const ctxA = await br.newContext({ viewport: { width: 420, height: 900 } });
const A = await ctxA.newPage(); A.on('pageerror', e => console.log('PAGEERR', e.message));
A.on('dialog', d => d.accept());
// admin entra por API con PIN (modo pruebas) y se queda con la cookie
const r = await ctxA.request.post(BASE + '/api/auth/login', { data: { pin: '5821' }, headers: { Origin: BASE } });
const ses0 = await r.json();
check('admin entra (PIN de pruebas)', r.ok());
await A.goto(BASE + '/index.html'); await A.waitForTimeout(800);
await A.evaluate(() => { localStorage.setItem('brb_ses', JSON.stringify({})) });
const ses = ses0; await A.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), ses);
await A.reload(); await A.waitForSelector('#login', { state: 'hidden' });
await A.click('text=⚙️ Config'); await A.waitForTimeout(300);
await A.evaluate(() => { S.open = 'equipo'; renderConfig() }); await A.waitForTimeout(300);
await A.click('[data-on-click="eqEditar"][data-p0="b1"]'); await A.waitForSelector('#acc');
await A.waitForSelector('#accC');
check('bloque Acceso visible en el barbero', await A.locator('#acc').isVisible());
await A.fill('#accC', 'abc'); await A.click('text=💾 Guardar clave'); await A.waitForTimeout(300);
check('clave corta rechazada', await A.locator('#toast').textContent().then(t => /Mínimo/.test(t)));
await A.click('text=🎲 Generar'); const clave = await A.inputValue('#accC'); check('generar clave', clave.length === 8);
await A.click('text=💾 Guardar clave'); await A.waitForSelector('#accInv b.syne');
check('el dueño pone la clave y la ve para pasársela', (await A.locator('#accInv b.syne').innerText()) === clave);
await A.waitForSelector('#acc .tag');
check('clave marcada como activa (fija, no temporal)', !(await A.locator('#acc').innerText()).includes('temporal (aún'));
await A.click('text=📲 Activar su celular (QR)'); await A.waitForSelector('#accInv input');
const link = await A.inputValue('#accInv input'); check('«Activar su celular» da un link de un solo uso', /\/\?activar=/.test(link), link);
check('…y su QR', await A.locator('#accQR img, #accQR canvas').count() > 0);

// Barbero en su celular (otro contexto), con autenticador virtual de huella
const ctxB = await br.newContext({ viewport: { width: 400, height: 800 } });
const B = await ctxB.newPage(); B.on('pageerror', e => console.log('PAGEERR', e.message));
const cdp = await ctxB.newCDPSession(B);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await B.goto(link); await B.waitForSelector('text=Listo,');
check('al abrir el QR: «Este celular quedó activado» con su nombre', /Jhon/.test(await B.locator('#pkMsg').innerText()) && /activado/.test(await B.locator('#pkMsg').innerText()));
check('el link ya no queda en la barra (no se puede reusar)', !B.url().includes('activar='));
await B.click('#login a.btn'); await B.waitForSelector('#cBox', { state: 'visible' });
check('entra directo a su perfil, solo pide su clave', await B.evaluate(() => S.selP) === 'p_b1');
await B.fill('#cClave', clave); await B.click('text=🔑 Entrar con clave'); await B.waitForSelector('#login', { state: 'hidden' });
check('con la clave que le puso el dueño entra directo (sin cambiarla)', true);
await B.waitForSelector('[data-on-click="miHuellaActivar"]');
check('en su celular le ofrece entrar la próxima vez con huella o Face ID', true);
await B.click('[data-on-click="miHuellaActivar"]'); await B.waitForSelector('text=Listo: la próxima vez');
check('huella activada', true);
check('barbero sin pestaña Config', !(await B.locator('text=⚙️ Config').count()));
await B.evaluate(() => API.logout()); await B.evaluate(() => localStorage.removeItem('brb_ses')); await B.reload();
await B.waitForSelector('#hBtn', { state: 'visible' });
check('login muestra botón de huella', true);
await B.click('#hBtn'); await B.waitForSelector('#login', { state: 'hidden' });
check('entra con huella como barbero', await B.evaluate(() => S.ses?.barberoId) === 'b1');
// el QR es de un solo uso
const B2 = await (await br.newContext()).newPage(); await B2.goto(link); await B2.waitForSelector('#pkMsg:has-text("ya no sirve")');
check('el mismo QR no sirve dos veces', true);
// clave temporal (opción): al entrar pide crear la suya
await A.evaluate(() => { $('#accC').value = 'TempJhon88'; $('#accTmp').checked = true }); await A.click('text=💾 Guardar clave'); await A.waitForSelector('text=Al entrar creará la suya');
const C = await (await br.newContext()).newPage(); await C.goto(BASE + '/index.html'); await C.waitForSelector('#pfGrid .btn'); await C.click('#pfGrid .btn:has-text("Jhon")'); await C.waitForSelector('#cBox', { state: 'visible' }); await C.fill('#cClave', 'incorrecta'); await C.click('text=🔑 Entrar con clave'); await C.waitForTimeout(500);
check('clave mala rechazada', await C.locator('#login').isVisible());
await C.fill('#cClave', 'TempJhon88'); await C.click('text=🔑 Entrar con clave'); await C.waitForSelector('#tBox', { state: 'visible' });
check('con «que la cambie al entrar», pide crear la propia', !(await C.locator('#cBox').isVisible()));
await C.fill('#tClave', 'JhonPropia77'); await C.fill('#tClave2', 'JhonPropia77'); await C.click('text=💾 Guardar mi clave y entrar'); await C.waitForSelector('#login', { state: 'hidden' });
check('crea su clave y entra', true);
// admin ve el dispositivo y lo quita
await A.evaluate(() => accCargar('p_b1')); await A.waitForSelector('#acc .li');
check('admin ve el dispositivo', await A.locator('#acc .li').count() === 1);
await A.click('#acc .li >> text=Quitar'); await A.waitForTimeout(600);
check('admin quita el dispositivo', await A.locator('#acc .li').count() === 0);
await B.evaluate(() => fetch('/api/panel')).catch(() => {}); 
const st = await B.evaluate(async () => (await fetch('/api/panel')).status); check('sesión de huella cerrada al quitar', st === 401, st);
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
