// Prueba de pantalla de la escena pública (js/escena.js + js/voz.js):
// «Toca para entrar» → se derrite → saludo con la voz GRABADA (nunca la voz del celular), fecha y hora con piezas
// grabadas, el narrador en el estado de la cita, QR, fotos, calificación y reseña. Y el 📷 del panel abre la cita.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 400, height: 860 }, timezoneId: 'America/Lima' });
const errores = [];
// Se espía el audio: cada pieza que suena (duración en centésimas) y si alguien usa la voz del celular.
await ctx.addInitScript(() => {
  window.__tts = 0; window.__sonidos = [];
  try { speechSynthesis.speak = () => { window.__tts++ } } catch (e) { }
  const st = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { const d = Math.round(this.buffer.duration * 100); if (d) window.__sonidos.push(d); return st.apply(this, a) };
});
const nueva = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errores.push(e.message)); return p };
const api = async (m, p, data) => (await ctx.request.fetch(B + '/api' + p, { method: m, data, headers: { Origin: B } })).json();
const adm = await api('POST', '/auth/login', { pin: '5821' });

// ---- voz grabada: cada pieza con una duración distinta para reconocerla al sonar
const wav = n => { const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), 44 + i * 2); return 'data:audio/wav;base64,' + b.toString('base64') };
const DUR = { hola: 10, hora: 13, f_manana: 16, 'h_09:00': 19, estado_confirmada: 22 }, narrAudio = {};
for (const [k, cs] of Object.entries(DUR)) narrAudio[k] = (await api('POST', '/audio', { data: wav(cs * 160) })).key;
const pn = await api('GET', '/panel');
const ponerCfg = extra => api('PUT', '/config', { cfg: { ...pn.cfg, narrAudio, resenaUrl: 'https://g.page/r/barberia-prueba/review', ...extra }, barberos: pn.barberos, servicios: pn.servicios, usuarios: pn.usuarios });
await ponerCfg({});
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), man = lima(1);
const sonidos = p => p.evaluate(() => window.__sonidos);
const esperaSonidos = (p, n) => p.waitForFunction(n => window.__sonidos.length >= n, n, { timeout: 8000 }).catch(() => { });

// ---- formulario: toca para entrar → saludo grabado
const R = await nueva(); await R.goto(B + '/reservar.html');
await R.waitForSelector('#splash.listo', { timeout: 8000 });
check('carga con el logo y «Toca para entrar»', /toca para entrar/i.test(await R.locator('#splash').innerText()));
await R.waitForTimeout(800);
check('antes del toque el narrador no habla ni suena nada', !(await R.locator('#nBub.on').count()) && !(await sonidos(R)).length);
await R.click('#splash'); await R.waitForSelector('#splash', { state: 'detached', timeout: 8000 });
await R.waitForSelector('#nBub.on', { timeout: 5000 }); await esperaSonidos(R, 1);
check('al tocar se derrite el logo y saluda con la voz grabada', /qué tal/i.test(await R.locator('#nBub').innerText()) && JSON.stringify(await sonidos(R)) === '[10]', JSON.stringify(await sonidos(R)));
await R.locator('.opt').first().click(); await R.waitForTimeout(800);
check('una frase sin grabar sale solo en el globo (sin voz de robot)', /buena elección/i.test(await R.locator('#nBub').innerText()) && (await sonidos(R)).length === 1 && await R.evaluate(() => window.__tts) === 0);
await R.evaluate(m => { F.barb = 'b1'; F.fecha = m; go(2); pickHora('09:00') }, man); await esperaSonidos(R, 4);
check('fecha y hora con las piezas grabadas, en orden: «mañana» + «a las nueve de la mañana» + frase', JSON.stringify((await sonidos(R)).slice(1)) === '[16,19,13]', JSON.stringify(await sonidos(R)));
await R.click('#nSp'); await R.evaluate(() => say('hora')); await R.waitForTimeout(800);
check('🔇 silencia al narrador', (await sonidos(R)).length === 4 && await R.locator('#nSp').innerText() === '🔇');
await R.click('#nSp');
check('nunca se usó la voz del celular', await R.evaluate(() => window.__tts) === 0);
const fuentes = (await Promise.all(['/js/escena.js', '/js/reservar.js', '/js/estado.js', '/js/voz.js'].map(async u => (await ctx.request.get(B + u)).text()))).join('');
check('el código ya no tiene voz de robot (speechSynthesis)', !/speechSynthesis|SpeechSynthesisUtterance/.test(fuentes));

// ---- estado de la cita: el narrador dice el estado con su fecha y hora, y el QR para el barbero
const cf = await api('POST', '/citas', { fecha: man, hora: '09:00', barberoId: 'b2', servicioId: 's1', servicioNombre: 'Corte', precio: 25, cliente: { nombre: 'Rosa Estado', tel: '966000222' }, estado: 'confirmada' });
const E = await nueva(); await E.goto(B + '/estado.html?c=' + cf.codigo); await E.waitForSelector('#splash.listo', { timeout: 8000 });
await E.click('#splash'); await E.waitForSelector('#nBub.on', { timeout: 6000 }); await esperaSonidos(E, 3);
check('en el estado el narrador dice «confirmada» + mañana + a las nueve', /confirmada/i.test(await E.locator('#nBub').innerText()) && JSON.stringify(await sonidos(E)) === '[22,16,19]', JSON.stringify(await sonidos(E)));
check('antes de ser atendido aparece el QR para mostrar al llegar', await E.locator('#qrCita img, #qrCita canvas').count() > 0 && /muéstralo al llegar/i.test(await E.locator('.qrc').innerText()));
check('el QR lleva el link de esta cita', await E.evaluate(c => document.querySelector('#qrCita').title.includes('estado.html?c=' + c), cf.codigo));

// ---- atendida: fotos, calificación anónima y reseña
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const fa = (await api('POST', '/fotos', { data: PNG })).key, fd = (await api('POST', '/fotos', { data: PNG })).key;
const at = await api('POST', '/citas', { fecha: lima(0), hora: '09:00', barberoId: 'b3', servicioId: 's1', servicioNombre: 'Corte', precio: 25, cliente: { nombre: 'Lalo Atendido', tel: '966000333' }, estado: 'atendida', fotoAntes: fa, fotoDespues: fd });
const A = await nueva(); await A.goto(B + '/estado.html?c=' + at.codigo); await A.waitForSelector('#splash.listo', { timeout: 8000 }); await A.click('#splash');
await A.waitForSelector('.fotos img'); await A.waitForFunction(() => [...document.querySelectorAll('.fotos img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => { });
check('el cliente atendido ve su antes y después', await A.evaluate(() => [...document.querySelectorAll('.fotos img')].filter(i => i.naturalWidth > 0).length) === 2);
check('la reseña de Google se ofrece a todos (antes de calificar)', (await A.locator('a:has-text("reseña")').getAttribute('href')) === 'https://g.page/r/barberia-prueba/review');
await A.click('.stars button >> nth=3'); await A.click('.chipsc button:has-text("Trato")'); await A.fill('#calCard textarea', 'Excelente fade');
await A.click('text=Enviar calificación'); await A.waitForSelector('text=Gracias por calificarnos', { timeout: 6000 });
check('califica en anónimo y queda agradecido', true);
await A.reload(); await A.waitForSelector('#splash.listo'); await A.click('#splash'); await A.waitForSelector('#calCard');
check('al volver ya no pide calificar otra vez', /gracias por calificarnos/i.test(await A.locator('#calCard').innerText()));

// ---- sin pantalla de carga: el saludo sale en texto y la voz suena al primer toque
await ponerCfg({ splashOn: false });
const S2 = await nueva(); await S2.goto(B + '/reservar.html'); await S2.waitForSelector('#nBub.on', { timeout: 8000 });
check('sin pantalla de carga: el saludo aparece al abrir, aún sin sonido', !(await S2.locator('#splash').count()) && !(await sonidos(S2)).length);
await S2.mouse.click(200, 40); await esperaSonidos(S2, 1);
check('…y la voz grabada suena con el primer toque', JSON.stringify(await sonidos(S2)) === '[10]', JSON.stringify(await sonidos(S2)));
await ponerCfg({});

// ---- panel: 📷 leer el QR abre la cita
const lejos = lima(80), cl = await api('POST', '/citas', { fecha: lejos, hora: '10:00', barberoId: 'b4', servicioId: 's1', servicioNombre: 'Corte', precio: 25, cliente: { nombre: 'Quique Qr', tel: '966000444' }, estado: 'confirmada' });
const P = await nueva(); await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), adm); await P.reload(); await P.waitForSelector('#agChips .chip');
check('el QR se entiende como link o como código', await P.evaluate(c => codigoDeQR('https://x.workers.dev/estado.html?c=' + c) === c && codigoDeQR(c.toLowerCase()) === c && codigoDeQR('https://otra.cosa/?q=1') === '', cl.codigo));
await P.click('[data-on-click="abrirEscaner"]'); await P.waitForSelector('#escCod');
check('el 📷 abre el lector (con opción de escribir el código)', true);
await P.fill('#escCod', cl.codigo); await P.click('#mbody >> text=Buscar'); await P.waitForSelector('#c_' + cl.id, { timeout: 8000 });
check('encuentra la cita aunque sea de dentro de 80 días y abre su día', (await P.evaluate(() => S.vista.per.f)) === lejos);
check('sin errores en las páginas', !errores.length, errores.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
