// Prueba de pantalla de las promociones: el dueño la crea en el panel (🏷️ Promociones), el cliente la ve en
// su app «Mi cita» (fila deslizable, sin emojis), toca «Reservar» y llega al formulario con el servicio elegido,
// los días de promo marcados y el precio rebajado en el resumen.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Lima' });
const errores = [];
const nueva = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errores.push(e.message)); p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(m.text()) }); return p };
const api = async (m, p, data) => (await ctx.request.fetch(B + '/api' + p, { method: m, data, headers: { Origin: B } })).json();
const adm = await api('POST', '/auth/login', { pin: '5821' });
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), dow = f => new Date(f + 'T12:00:00Z').getUTCDay();
const dia = [1, 2, 3, 4, 5, 6, 7].map(lima).find(f => dow(f) !== 0);

// ---- panel: crear la promo
const P = await nueva(); await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), adm); await P.reload(); await P.waitForSelector('#agChips .chip');
await P.evaluate(() => abrirMenu()); await P.click('[data-on-click="abrirPromos"]'); await P.waitForSelector('text=Aún no tienes promociones');
check('el menú del dueño tiene «Promociones»', true);
await P.click('text=Nueva promoción'); await P.waitForSelector('#prTit');
await P.fill('#prTit', 'Corte de la semana'); await P.fill('#prTxt', 'Tu corte clásico a precio especial');
await P.selectOption('#prSrv', 's1'); await P.fill('#prPre', '99'); await P.click('text=Guardar promoción');
check('el panel no deja poner un precio promo mayor al normal', await P.locator('#prTit').count() === 1);
await P.fill('#prPre', '20'); await P.click(`#prDias [data-p0="${dow(dia)}"]`);
check('la vista previa muestra cómo la verá el cliente', /Corte de la semana/.test(await P.locator('#prVista').innerText()));
await P.click('text=Guardar promoción'); await P.waitForSelector('[data-on-click="prActiva"]');
check("la promo queda en la lista como activa, con sus contadores", /Activa/.test(await P.locator('#mbody').innerText()) && /0 vistas/.test(await P.locator('#mbody').innerText()), await P.locator("#mbody").innerText());
const pub = await api('GET', '/publico');
check('el servidor la guardó', pub.promos?.length === 1 && pub.promos[0].precio === 20, JSON.stringify(pub.promos));

// ---- el cliente la ve en su app «Mi cita»
const cf = await api('POST', '/citas', { fecha: lima(3), hora: '10:00', barberoId: 'b2', servicioId: 's2', servicioNombre: 'Fade', precio: 30, cliente: { nombre: 'Rosa Promo', tel: '966000555' }, estado: 'confirmada' });
const E = await nueva(); await E.goto(B + '/cita/' + cf.codigo); await E.waitForSelector('#splash', { state: 'detached', timeout: 9000 }); await E.waitForSelector('.promo');
const txt = await E.locator('.promos').innerText();
check('«Mi cita» muestra la promo con precio tachado y vigencia', /Corte de la semana/.test(txt) && /S\/ ?25/.test(await E.locator('.promo s').innerText()) && /20/.test(txt) && /solo/i.test(txt), txt);
check('la promo no tiene emojis', !/\p{Extended_Pictographic}/u.test(txt));
await E.waitForTimeout(500);
await E.click('.promo button'); await E.waitForURL(/reservar(\.html)?\?promo=/); await E.waitForSelector('#splash', { state: 'detached', timeout: 9000 });
await E.waitForSelector('#cNom');
check('«Reservar» abre el formulario con el servicio ya elegido', await E.evaluate(() => F.serv) === 's1');
const st = (await api('GET', '/promos')).stats[pub.promos[0].id] || {};
check('se contó la vista y el toque', st.vistas >= 1 && st.clics === 1, JSON.stringify(st));

// ---- formulario (servicio → tus datos → día y hora → barbero): días marcados y precio rebajado
await E.fill('#cNom', 'Rosa Promo'); await E.fill('#cTel', '966000555'); await E.click('[data-on-click="resDatosOk"]'); await E.waitForSelector('.day');
check('los días de promo salen marcados', await E.locator(`.day[data-p0="${dia}"] .dpromo`).count() === 1 && await E.locator('.dpromo').count() >= 1);
await E.click(`.day[data-p0="${dia}"]`); await E.waitForSelector('text=este día pagas');
await E.locator('.slot:not([disabled])').first().click(); await E.click('[data-on-click="resHoraOk"]');
await E.waitForSelector('text=Elige tu barbero');
check('el resumen muestra el precio promo', /S\/ ?20/.test(await E.locator('.res').innerText()), await E.locator('.res').innerText());
check('sin errores ni violaciones de CSP', !errores.length, errores.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
