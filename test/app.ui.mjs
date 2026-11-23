// App instalable (PWA) del panel: manifiesto, íconos, service worker con la versión del despliegue,
// la cáscara guardada (abre sin internet), los datos NUNCA guardados, y el aviso «Hay una versión nueva».
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 390, height: 800 } });
const errores = []; const P = await ctx.newPage(); P.on('pageerror', e => errores.push(e.message));

const man = await (await ctx.request.get(B + '/manifest.webmanifest')).json();
check('manifiesto de la app del panel (nombre, pantalla completa, íconos normal y adaptable)', man.display === 'standalone' && man.start_url === '/index.html' && man.icons.some(i => i.purpose === 'maskable') && man.icons.some(i => i.sizes === '512x512'));
const ics = await Promise.all(man.icons.map(i => ctx.request.get(B + i.src)));
check('los íconos existen y son PNG', ics.every(r => r.ok() && r.headers()['content-type'].includes('image/png')));
const sw = await ctx.request.get(B + '/sw.js'), swTxt = await sw.text();
check('el service worker sale con la versión del despliegue y sin caché', sw.ok() && !swTxt.includes('__VERSION__') && /stereo-panel-/.test(swTxt) && /no-cache/.test(sw.headers()['cache-control'] || ''), sw.headers()['cache-control']);

const adm = await (await ctx.request.post(B + '/api/auth/login', { data: { pin: '5821' }, headers: { Origin: B } })).json();
await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), adm); await P.reload(); await P.waitForSelector('#agChips .chip');
await P.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
await P.evaluate(() => navigator.serviceWorker.ready); await P.waitForTimeout(800);
const guardado = await P.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out });
check('guarda la cáscara del panel (HTML, scripts y estilos de una misma versión)', ['/index.html', '/js/panel/base.js', '/js/eventos.js', '/manifest.webmanifest'].every(u => guardado.includes(u)), guardado.join(' '));
check('NUNCA guarda datos de la API (citas, clientes, sesiones)', !guardado.some(u => u.startsWith('/api/')));
await P.reload(); await P.waitForSelector('#agChips .chip');
check('con el service worker activo, el panel controla la página', await P.evaluate(() => !!navigator.serviceWorker.controller));
// sin internet: abre igual (los datos dicen que falta conexión, pero la app no se cae)
await ctx.setOffline(true); await P.reload({ waitUntil: 'domcontentloaded' }).catch(() => { }); await P.waitForTimeout(1200);
check('sin internet la app abre (cáscara guardada)', await P.evaluate(() => typeof renderAgenda === 'function' && !!document.querySelector('#t-agenda, #login')));
await ctx.setOffline(false);
// versión nueva: el servidor entrega otro sw.js → aviso «Hay una versión nueva» → Actualizar → recarga con la nueva
// (en pruebas, /sw.js?v=… simula un despliegue nuevo)
await P.evaluate(async () => (await caches.open('stereo-panel-vieja')).put('/x', new Response('vieja'))); // copia de una versión antigua
await P.evaluate(() => navigator.serviceWorker.register('/sw.js?v=v-nueva', { updateViaCache: 'none' })); await P.waitForSelector('#nuevaVer', { timeout: 15000 }).catch(() => { });
check('al subir cambios aparece el aviso «Hay una versión nueva» (no se corta lo que estás haciendo)', await P.locator('#nuevaVer').isVisible());
await Promise.all([P.waitForEvent('load', { timeout: 15000 }).catch(() => { }), P.click('#nuevaVer button')]); await P.waitForSelector('#agChips .chip');
const ver = await P.evaluate(() => new Promise(ok => { navigator.serviceWorker.addEventListener('message', e => ok(e.data.version), { once: true }); navigator.serviceWorker.controller.postMessage('version') }));
check('al tocar «Actualizar» queda la versión nueva', ver === 'v-nueva', ver);
await P.waitForFunction(async () => !(await caches.keys()).includes('stereo-panel-vieja'), null, { timeout: 8000 }).catch(() => { });
const cachesV = await P.evaluate(() => caches.keys());
check('y se borran las copias de versiones anteriores', !cachesV.includes('stereo-panel-vieja') && cachesV.includes('stereo-panel-v-nueva'), cachesV.join());
// el tamaño de app: columna de 480 px centrada en PC
const PC = await (await br.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); await PC.context().request.post(B + '/api/auth/login', { data: { pin: '5821' }, headers: { Origin: B } });
await PC.goto(B + '/index.html'); await PC.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), adm); await PC.reload(); await PC.waitForSelector('#agChips .chip');
const caja = await PC.evaluate(() => { const r = document.body.getBoundingClientRect(); return [r.width, r.left] });
check('en PC se ve igual que en el celular: una columna de 480 px centrada', caja[0] === 480 && Math.abs(caja[1] - (1366 - 480) / 2) < 2, JSON.stringify(caja));
await PC.click('[data-on-click="a497cf057"]'); await PC.waitForSelector('.sheet');
const hoja = await PC.evaluate(() => document.querySelector('.sheet').getBoundingClientRect().width);
check('las hojas (menú, formularios) también miden 480 px', hoja <= 480, hoja);
check('sin errores', !errores.length, errores.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
