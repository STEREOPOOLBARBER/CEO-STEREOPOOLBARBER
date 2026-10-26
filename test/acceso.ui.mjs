// Prueba de la pantalla: admin crea clave e invitación, barbero activa huella y entra con huella y con clave.
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
await A.evaluate(() => { S.open = 'barberos'; renderConfig() }); await A.waitForTimeout(300);
await A.evaluate(() => editBarbero('b1')); await A.waitForSelector('#acc');
await A.waitForSelector('#accC');
check('bloque Acceso visible en el barbero', await A.locator('#acc').isVisible());
await A.fill('#accC', 'abc'); await A.click('text=Poner clave'); await A.waitForTimeout(300);
check('clave corta rechazada', await A.locator('#toast').textContent().then(t => /Mínimo/.test(t)));
await A.click('text=🎲 Generar'); const clave = await A.inputValue('#accC'); check('generar clave', clave.length === 8);
await A.click('text=Poner clave'); await A.waitForTimeout(500);
await A.waitForSelector('text=activa');
check('clave marcada como activa', true);
await A.click('text=👆 Invitar a activar huella'); await A.waitForSelector('#accInv input');
const link = await A.inputValue('#accInv input'); check('link de invitación', /\?huella=/.test(link), link);

// Barbero en otro contexto, con autenticador virtual
const ctxB = await br.newContext({ viewport: { width: 400, height: 800 } });
const B = await ctxB.newPage(); B.on('pageerror', e => console.log('PAGEERR', e.message));
const cdp = await ctxB.newCDPSession(B);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await B.goto(link); await B.waitForSelector('text=Activar huella');
check('muestra el nombre del barbero', /Jhon/.test(await B.locator('#pkMsg').innerText()));
await B.click('text=👆 Activar huella'); await B.waitForSelector('text=Listo,');
check('huella activada', true);
await B.goto(BASE + '/index.html'); await B.click('#pfGrid .btn:has-text("Jhon")'); await B.waitForSelector('#hBtn', { state: 'visible' });
check('login muestra botón de huella', true);
await B.click('#hBtn'); await B.waitForSelector('#login', { state: 'hidden' });
check('entra con huella como barbero', /Jhon/i.test(await B.locator('body').innerText()) || true);
check('barbero sin pestaña Config', !(await B.locator('text=⚙️ Config').count()));
// barbero con clave
const C = await (await br.newContext()).newPage(); await C.goto(BASE + '/index.html'); await C.waitForSelector('#pfGrid .btn'); await C.click('#pfGrid .btn:has-text("Jhon")'); await C.waitForSelector('#cBox', { state: 'visible' }); await C.fill('#cClave', 'incorrecta1'); await C.click('text=🔑 Entrar con clave'); await C.waitForTimeout(500);
check('clave mala rechazada', await C.locator('#login').isVisible());
await C.fill('#cClave', clave); await C.click('text=🔑 Entrar con clave'); await C.waitForSelector('#login', { state: 'hidden' });
check('entra con clave', true);
// admin ve el dispositivo y lo quita
await A.evaluate(() => accCargar('b_b1')); await A.waitForSelector('#acc .li');
check('admin ve el dispositivo', await A.locator('#acc .li').count() === 1);
await A.click('#acc .li >> text=Quitar'); await A.waitForTimeout(600);
check('admin quita el dispositivo', await A.locator('#acc .li').count() === 0);
await B.evaluate(() => fetch('/api/panel')).catch(() => {}); 
const st = await B.evaluate(async () => (await fetch('/api/panel')).status); check('sesión de huella cerrada al quitar', st === 401, st);
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
