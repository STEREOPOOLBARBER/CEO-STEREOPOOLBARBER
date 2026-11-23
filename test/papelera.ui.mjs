// Prueba de pantalla de la agenda: «🚫 Cancelar» como etiqueta, 🗑️ papelera (mover, ver, recuperar)
// y las flechas ▲ ▼ que van tarjeta por tarjeta (también flotando al bajar).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 400, height: 760 }, timezoneId: 'America/Lima' });
const P = await ctx.newPage(), errores = []; P.on('pageerror', e => errores.push(e.message)); P.on('dialog', d => d.accept());
P.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(m.text()) });
const api = async (m, p, data) => (await ctx.request.fetch(B + '/api' + p, { method: m, data, headers: { Origin: B } })).json();
const adm = await api('POST', '/auth/login', { pin: '5821' });
const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const nombres = ['Ana Uno', 'Beto Dos', 'Caro Tres', 'Dani Cuatro', 'Eli Cinco', 'Fede Seis'];
for (const [i, n] of nombres.entries()) await api('POST', '/citas', { fecha: hoy, hora: `${String(9 + i).padStart(2, '0')}:00`, barberoId: 'b' + (1 + i % 5), servicioId: 's1', servicioNombre: 'Corte', precio: 25, cliente: { nombre: n, tel: '96600010' + i }, estado: 'confirmada' });
await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), adm); await P.reload(); await P.waitForSelector('#lista .cita');

// ---- «Cancelar» como etiqueta
const primera = P.locator('#lista .cita').first();
check('cada cita activa tiene la etiqueta «🚫 Cancelar» (ya no el tacho)', await P.locator('#lista .cita .etqcan').count() === 6 && !(await primera.locator('.sq.r').count()));
const id1 = (await primera.getAttribute('id')).slice(2);
await primera.locator('.etqcan').click(); await P.waitForFunction(id => S.citas?.find?.(c => c.id === id)?.estado === 'cancelada' || document.querySelector('#c_' + id + ' .sq.r'), id1, { timeout: 8000 }).catch(() => { });
await P.waitForSelector(`#c_${id1} .sq.r`, { timeout: 8000 });
check('al cancelar, la cita queda en CANCELADA y ahí sí aparece 🗑️', true);

// ---- papelera
await P.click(`#c_${id1} .sq.r`); await P.waitForSelector(`#c_${id1}`, { state: 'detached', timeout: 8000 });
check('🗑️ la manda a la papelera (sale de la agenda)', true);
await P.waitForSelector('[data-on-click="abrirPapelera"] .cc');
check('el 🗑️ de herramientas muestra cuántas hay', (await P.locator('[data-on-click="abrirPapelera"] .cc').innerText()) === '1');
await P.click('[data-on-click="abrirPapelera"]'); await P.waitForSelector('[data-on-click="papRecuperar"]');
check('la papelera la lista con «se borra en 7 días»', /Ana Uno/.test(await P.locator('#mbody').innerText()) && /se borra en 7 días/.test(await P.locator('#mbody').innerText()));
await P.click('[data-on-click="papRecuperar"]'); await P.waitForSelector('text=La papelera está vacía');
check('«Recuperar» la devuelve a la agenda', await P.evaluate(() => { closeModal(); return true }) && await P.locator(`#c_${id1}`).count() === 1);

// ---- flechas ▲ ▼
await P.evaluate(() => scrollTo(0, 0)); await P.waitForTimeout(200);
const tope = () => P.evaluate(() => altoFijo() + 8);
const enTope = async () => { const t = await tope(); return P.evaluate(t => [...document.querySelectorAll('#lista .cita')].findIndex(c => Math.abs(c.getBoundingClientRect().top - t) < 3), t) };
check('flechas ▲ ▼ al costado del ⚡', await P.locator('.tools [data-on-click="irTarjeta"]').count() === 2);
await P.click('.tools [data-on-click="irTarjeta"][data-p0="1"]'); await P.waitForTimeout(900);
check('▼ lleva a la primera tarjeta, alineada arriba', await enTope() === 0, String(await enTope()));
await P.click('#navFl [data-p0="1"]'); await P.waitForTimeout(900);
check('al bajar, las flechas quedan flotando; ▼ va a la siguiente', await P.locator('#navFl.on').count() === 1 && await enTope() === 1, String(await enTope()));
await P.click('#navFl [data-p0="1"]'); await P.waitForTimeout(900);
check('▼ otra vez: la tercera', await enTope() === 2);
await P.click('#navFl [data-p0="-1"]'); await P.waitForTimeout(900);
check('▲ vuelve a la anterior', await enTope() === 1);
await P.click('#navFl [data-p0="-1"]'); await P.click('#navFl [data-p0="-1"]').catch(() => { }); await P.waitForTimeout(1200);
check('▲ en la primera no se pasa de largo', await enTope() === 0);
check('sin errores ni violaciones de CSP', !errores.length, errores.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
