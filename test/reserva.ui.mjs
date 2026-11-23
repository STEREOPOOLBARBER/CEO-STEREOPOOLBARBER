// Formulario nuevo: servicio → tus datos → día y hora → barbero (solo los libres a esa hora que hacen ese servicio).
// Sin distrito, sin foto de referencia, sin casilla (se acepta el aviso al tocar Reservar), aviso de privacidad en hoja.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Lima' });
const errores = [];
const api = async (m, p, data) => { const r = await ctx.request.fetch(B + '/api' + p, { method: m, data, headers: { Origin: B } }); return { s: r.status(), j: await r.json().catch(() => ({})) } };
await api('POST', '/auth/login', { pin: '5821' });
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), dow = f => new Date(f + 'T12:00:00Z').getUTCDay();
const f = [2, 3, 4, 5, 6, 7].map(lima).find(x => dow(x) !== 0);
const pn = (await api('GET', '/panel')).j;
// Solo Jhon (b1) hace «Corte clásico» (s1); los demás solo «Fade» (s2). Jhon tiene una cita a las 10:00.
await api('PUT', '/config', { cfg: { ...pn.cfg, dias: [1, 2, 3, 4, 5, 6], apertura: '09:00', cierre: '20:00', refIni: '13:00', refFin: '14:00' }, equipo: pn.equipo.map(p => p.atiende && p.id !== 'b1' ? { ...p, servicios: ['s2'] } : p), servicios: pn.servicios });
await api('POST', '/citas', { fecha: f, hora: '10:00', barberoId: 'b1', servicioId: 's2', servicioNombre: 'Fade', precio: 30, cliente: { nombre: 'Ocupa Jhon', tel: '966000801' }, estado: 'confirmada' });

// ---- servidor: el barbero tiene que hacer el servicio
const res = (barberoId, servicioId, hora) => api('POST', '/publico/reservas', { servicioId, barberoId, fecha: f, hora, cliente: { nombre: 'Prueba Servidor', tel: '966000802' }, consentimiento: true });
let r = await res('b2', 's1', '11:00'); check('el servidor no deja reservar con un barbero que no hace ese servicio', r.s === 400 && /no hace/.test(r.j.error), JSON.stringify(r.j));
r = await res('any', 's1', '12:00'); check('«el primero disponible» elige solo entre los que hacen el servicio', r.s === 200 && r.j.barberoId === 'b1', JSON.stringify(r.j));
r = await res('any', 's1', '10:00'); check('si el único que lo hace está ocupado → 409', r.s === 409, JSON.stringify(r.j));

// ---- pantalla
const P = await ctx.newPage(); P.on('pageerror', e => errores.push(e.message)); P.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(m.text()) });
await P.goto(B + '/reservar'); await P.waitForSelector('#splash', { state: 'detached', timeout: 9000 });
await P.click('.opt[data-p0="s1"]'); await P.waitForSelector('#cNom');
check('paso 2 es «Tus datos»: sin distrito, sin foto, sin casilla', /tus datos/i.test(await P.locator('.pt').innerText()) && !(await P.locator('#cCiu, #cOk, #refPrev, input[type=file]').count()));
await P.click('[data-on-click="resDatosOk"]'); await P.waitForTimeout(200);
check('sin nombre no avanza', /nombre completo/.test(await P.locator('#err').innerText()));
await P.fill('#cNom', 'Lucía Nueva'); await P.fill('#cTel', '966000803'); await P.fill('#cNota', 'bajito a los lados');
await P.click('[data-on-click="resDatosOk"]'); await P.waitForSelector('.day');
await P.click(`.day[data-p0="${f}"]`); await P.waitForTimeout(400);
const libres = await P.evaluate(() => [...document.querySelectorAll('.slot:not([disabled])')].map(b => b.dataset.p0));
check('día y hora: solo horas donde alguien que hace el servicio está libre (Jhon ocupado a las 10 y 12)', !libres.includes('10:00') && !libres.includes('12:00') && libres.includes('11:00'), libres.join());
await P.click('.slot[data-p0="11:00"]'); await P.waitForTimeout(300); await P.click('[data-on-click="resHoraOk"]'); await P.waitForSelector('text=Elige tu barbero');
const nombres = await P.locator('[data-on-click="resBarb"] b').allInnerTexts();
check('barbero: solo los libres a esa hora que hacen ese servicio (Jhon), ya elegido', nombres.length === 1 && await P.locator('[data-on-click="resBarb"].on').count() === 1 && !(await P.locator('#bRes').isDisabled()), nombres.join());
check('junto al botón: «Al tocar Reservar aceptas el aviso de privacidad»', /Al tocar Reservar aceptas el aviso de privacidad/.test(await P.locator('.legal').innerText()));
await P.click('.legal [data-on-click="verPrivacidad"]'); await P.waitForSelector('#privHoja');
check('el aviso se abre en una hoja encima (versión 2, sin distrito ni foto)', /Versión 2/.test(await P.locator('#privHoja').innerText()) && !/distrito|foto de referencia/i.test(await P.locator('#privHoja').innerText()));
await P.click('#privHoja .ph-x'); await P.waitForSelector('#privHoja', { state: 'detached' });
check('al cerrarlo sigue en el mismo paso con su barbero elegido', await P.evaluate(() => F.step === 3 && F.barb === 'b1'));
await P.click('#bRes'); await P.waitForFunction(() => F.step >= 4, null, { timeout: 8000 });
const cita = (await api('GET', '/citas/buscar?q=Lucía', null)).j.items?.[0];
check('reserva hecha: aceptación guardada (versión 2) y sin distrito', cita?.consentimiento?.version === 2 && !('ciudad' in (cita.cliente || {})) && cita.nota === 'bajito a los lados' && cita.barberoId === 'b1', JSON.stringify(cita).slice(0, 300));
// ---- Fade (s2): todos lo hacen; a las 10:00 Jhon está ocupado → no aparece
const Q = await ctx.newPage(); Q.on('pageerror', e => errores.push(e.message)); await Q.goto(B + '/reservar'); await Q.waitForSelector('#splash', { state: 'detached', timeout: 9000 });
await Q.click('.opt[data-p0="s2"]'); await Q.fill('#cNom', 'Mario Fade'); await Q.fill('#cTel', '966000804'); await Q.click('[data-on-click="resDatosOk"]'); await Q.waitForSelector('.day');
await Q.click(`.day[data-p0="${f}"]`); await Q.waitForTimeout(400); await Q.click('.slot[data-p0="10:00"]'); await Q.waitForTimeout(300); await Q.click('[data-on-click="resHoraOk"]'); await Q.waitForSelector('text=Elige tu barbero');
const n2 = await Q.locator('[data-on-click="resBarb"] b').allInnerTexts();
check('con varios libres: «El primero disponible» + cada barbero libre, sin el ocupado', n2[0] === 'El primero disponible' && n2.length >= 3 && !n2.includes(pn.equipo.find(p => p.id === 'b1').nombre), n2.join());
check('sin errores ni violaciones de CSP', !errores.length, errores.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
