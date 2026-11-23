// Prueba de pantalla de la duración de servicios: el dueño pone 3 h con la 2.ª de espera; el formulario solo ofrece
// horas donde entra todo el servicio y deja la hora de espera libre; la agenda y «Mi cita» muestran el rango.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Lima' });
const errores = []; const nueva = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errores.push(e.message)); p.on('dialog', d => d.accept()); p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errores.push(m.text()) }); return p };
const api = async (m, p, data) => (await ctx.request.fetch(B + '/api' + p, { method: m, data, headers: { Origin: B } })).json();
const adm = await api('POST', '/auth/login', { pin: '5821' });
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), dow = f => new Date(f + 'T12:00:00Z').getUTCDay();
const f = [2, 3, 4, 5, 6, 7].map(lima).find(x => dow(x) !== 0);
const pn = await api('GET', '/panel');
await api('PUT', '/config', { cfg: { ...pn.cfg, dias: [1, 2, 3, 4, 5, 6], apertura: '09:00', cierre: '20:00', refIni: '13:00', refFin: '14:00' }, equipo: pn.equipo, servicios: pn.servicios });

// ---- panel: duración del servicio
const P = await nueva(); await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), adm); await P.reload(); await P.waitForSelector('#agChips .chip');
await P.click('text=⚙️ Config'); await P.evaluate(() => { S.open = 'servicios'; renderConfig() });
await P.click('[data-on-click="a38880731"][data-p0="s3"]'); await P.waitForSelector('#sDur');
check('cada servicio tiene «Duración» (1 h por defecto)', await P.locator('#sDur .dchip.on').innerText() === '1 h');
await P.click('#sDur [data-p0="3"]');
check('al elegir 3 h, la 1.ª y la 3.ª son de trabajo (fijas)', await P.locator('#sBloq [data-on-click="svBloq"][disabled]').count() === 2);
await P.click('#sBloq [data-p0="1"]');
check('la 2.ª hora se marca como espera (barbero libre)', /espera/i.test(await P.locator('#sBloq [data-p0="1"]').innerText()) && /otro cliente/.test(await P.locator('#sDurTxt').innerText()));
await P.click('text=💾 Listo');
// Se guarda lo que quedó en el borrador del panel (el PIN de pruebas no viaja en «Guardar configuración»)
const servs = await P.evaluate(() => D().servicios), pn2 = await api('GET', '/panel');
await api('PUT', '/config', { cfg: pn2.cfg, equipo: pn2.equipo, servicios: servs });
const sv = (await api('GET', '/publico')).servicios.find(s => s.id === 's3');
check('se guarda: ocupado · espera · ocupado', JSON.stringify(sv.bloques) === '[1,0,1]', JSON.stringify(sv));
check('la lista de servicios dice «3 h (1 h de espera)»', (await P.locator('#t-config').innerText()).includes('3 h (1 h de espera)'));

// ---- formulario: solo horas donde entra
const R = await nueva(); await R.goto(B + '/reservar.html'); await R.waitForSelector('#splash.listo'); await R.click('#splash'); await R.waitForSelector('.opt');
check('el formulario muestra la duración', /3 h \(1 h de espera\)/.test(await R.locator('.opt[data-p0="s3"]').innerText()));
const horas = async (sid) => R.evaluate(async ([sid, f]) => { F.serv = sid; F.barb = 'b1'; F.fecha = f; await s2(); return [...document.querySelectorAll('.slot:not([disabled])')].map(b => b.dataset.p0) }, [sid, f]);
let h = await horas('s3');
check('3 h: no ofrece horas que chocan con el refrigerio o el cierre', h.includes('09:00') && h.includes('12:00') && !h.includes('11:00') && !h.includes('18:00') && !h.includes('19:00'), h.join());
const larga = await api('POST', '/citas', { fecha: f, hora: '09:00', barberoId: 'b1', servicioId: 's3', servicioNombre: 'Taper', precio: 30, cliente: { nombre: 'Larga Uno', tel: '966000901' }, estado: 'confirmada' });
h = await horas('s1');
check('con la de 3 h a las 9: el corte de 1 h puede a las 10 (espera), no a las 9 ni a las 11', h.includes('10:00') && !h.includes('09:00') && !h.includes('11:00'), h.join());

// ---- agenda y «Mi cita» muestran el rango
await P.evaluate(f => { S.vista.per = { t: 'dia', f }; renderAgenda() }, f); await P.click('text=📅 Agenda').catch(() => { });
await P.evaluate(f => { goTab('agenda'); S.vista.per = { t: 'dia', f }; renderAgenda() }, f); await P.waitForSelector('#lista .cita');
check('la tarjeta muestra «9:00 – 12:00 · espera 10:00»', /9:00 a\.\s?m\. – 12:00 p\.\s?m\..*espera 10:00/i.test(await P.locator('#lista').innerText()), (await P.locator('#lista .cita').first().innerText()).slice(0, 200));
const E = await nueva(); await E.goto(B + '/cita/' + larga.codigo); await E.waitForSelector('#splash.listo'); await E.click('#splash'); await E.waitForSelector('.card.estado');
check('«Mi cita» muestra hasta qué hora y la hora de espera', /9:00 a\.\s?m\. – 12:00 p\.\s?m\./.test(await E.locator('.card.estado .sub').innerText()) && /espera desde 10:00/.test(await E.locator('#app').innerText()), await E.locator('.card.estado .sub').innerText());
check('sin errores ni violaciones de CSP', !errores.length, errores.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
