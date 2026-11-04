// Prueba de pantalla de los filtros de la agenda (js/panel/filtros.js):
// ⚙️ Búsqueda avanzada, pastillas afuera, Limpiar, tira de días con «Mes», doble toque en las etiquetas,
// páginas del servidor y que la regla del navegador dé lo mismo que la del servidor.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 412, height: 900 }, timezoneId: 'America/Lima' }), P = await ctx.newPage();
const errores = []; P.on('pageerror', e => errores.push(e.message)); P.on('dialog', d => d.accept());
const api = async (m, p, data, h = {}) => (await ctx.request.fetch(B + '/api' + p, { method: m, data, headers: { Origin: B, ...h } })).json();
const adm = await api('POST', '/auth/login', { pin: '5821' });

// ---- datos de hoy (en memoria del panel) y del mes siguiente (por páginas del servidor)
const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const hoy = lima(0), man = lima(1), lejos = Date.now() + 20 * 864e5;
const mk = (fecha, hora, barberoId, servicioId, nombre, tel, estado, precio, x = {}) => ({ fecha, hora, barberoId, servicioId, servicioNombre: servicioId, precio, cliente: { nombre, tel }, estado, origen: 'panel', adelanto: 0, adelantoOk: false, ...x });
const HOY = [
  mk(hoy, '09:00', 'b1', 's1', 'Alan Uno', '911000001', 'confirmada', 25, { origen: 'web', adelanto: 10, adelantoOk: true, asistencia: { ts: 1, via: 'link' } }),
  mk(hoy, '10:00', 'b1', 's2', 'Beto Dos', '911000002', 'confirmada', 30, { recordado: 1 }),
  mk(hoy, '09:00', 'b2', 's1', 'Ciro Tres', '911000003', 'atendida', 40, { origen: 'walkin', fotoDespues: 'f_x' }),
  mk(hoy, '10:00', 'b2', 's4', 'Dino Cuatro', '911000004', 'atendida', 40, { gratis: true }),
  mk(hoy, '09:00', 'b3', 's1', 'Eva Cinco', '911000005', 'por_validar', 25, { origen: 'web', adelanto: 10, yapeCaptura: 'f_c', expira: lejos }),
  mk(hoy, '10:00', 'b3', 's2', 'Fito Seis', '911000006', 'por_validar', 30, { origen: 'web', adelanto: 10, expira: lejos - 864e5 }),
  mk(hoy, '09:00', 'b4', 's1', 'Gus Siete', '911000007', 'no_vino', 25),
  mk(hoy, '10:00', 'b4', 's1', 'Hilda Ocho', '911000008', 'cancelada', 25),
  mk(hoy, '09:00', 'b5', 's1', 'Ivo Nueve', '911000009', 'en_silla', 25, { enSillaTs: Date.now() }),
  mk(man, '09:00', 'b1', 's1', 'Jaz Diez', '911000010', 'por_validar', 25, { origen: 'web', adelanto: 10, expira: lejos }),
];
for (const c of HOY) await api('POST', '/citas', c);
const [y, m] = hoy.split('-').map(Number), sig = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
for (let i = 0; i < 35; i++) await api('POST', '/citas', mk(`${sig}-0${1 + Math.floor(i / 5)}`, '09:00', 'b' + (1 + i % 5), 's1', 'Mes Siguiente ' + i, '9120000' + String(i).padStart(2, '0'), 'confirmada', 25));

await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), adm); await P.reload();
await P.waitForSelector('#login', { state: 'hidden' }); await P.waitForSelector('#agChips .chip');
const nLista = () => P.locator('#lista .cita').count();
const vista = () => P.evaluate(() => S.vista);

check('ya no están Semana/Mes sueltos ni el calendario al costado de los días', !(await P.locator('.day.cal, [data-on-click="a18a90d39"]').count()) && (await P.locator('.days .day').first().innerText()).includes('MES'));
check('arranca en Hoy · Todos · sin filtros', JSON.stringify(await vista()) === await P.evaluate(() => JSON.stringify(VISTA_DEF())));
check('Hoy muestra las 9 citas del día (sin la de mañana)', await nLista() === 9, await nLista());

// ---- la regla del navegador = la del servidor (lista, orden y números)
const igualQueServidor = v => P.evaluate(async v => {
  S.vista = { ...VISTA_DEF(), ...v }; const x = S.vista;
  const loc = ordenar(scope().filter(filtroLocal(x, ALC_LISTA(x))), x).map(c => c.cliente.nombre);
  const srv = (await API.req('GET', '/citas/buscar?' + paramsVista(x, ALC_LISTA(x)) + '&limit=500')).items.map(c => c.cliente.nombre);
  const cl = conteoLocal(x), cs = await API.req('GET', '/citas/conteo?' + paramsVista(x, ALC_CONTEO(x)));
  const n = o => JSON.stringify(Object.fromEntries(Object.entries(o.estados).map(([k, e]) => [k, [e.n, e.m]]).sort())) + o.porValidar.n + '/' + o.porValidar.m;
  return { igual: loc.join() === srv.join() && n(cl) === n(cs), loc: loc.join(), srv: srv.join(), cl: n(cl), cs: n(cs) };
}, v);
const CASOS = [{}, { etq: 'confirmada' }, { etq: 'por_validar', orden: 'creada' }, { etq: 'por_validar', captura: 'sin' }, { etq: 'cancelada' }, { etq: 'atendida', foto: 'sin_despues' },
  { barb: ['b1', 'b2'] }, { serv: ['s2', 's4'] }, { pago: 'yape_ok' }, { pago: 'yape_pend' }, { pago: 'gratis' }, { pago: 'sin' }, { origen: 'web' }, { origen: 'walkin' }, { origen: 'panel' },
  { wa: 'confirmo' }, { wa: 'recordado' }, { wa: 'sin_recordar' }, { orden: 'nombre' }, { orden: 'monto' }, { orden: 'hora_desc' }, { etq: 'por_validar', orden: 'vence' }, { etq: 'en_silla', orden: 'silla' },
  { barb: ['b1'], origen: 'web', etq: 'confirmada' }];
let difs = [];
for (const c of CASOS) { const r = await igualQueServidor({ per: { t: 'dia', f: hoy }, ...c }); if (!r.igual) difs.push(JSON.stringify(c) + ' → ' + JSON.stringify(r)) }
check(`navegador y servidor dan lo mismo en ${CASOS.length} combinaciones (lista, orden y números)`, !difs.length, difs.join('\n'));
await P.evaluate(() => { S.vista = VISTA_DEF(); renderAgenda() });

// ---- ⚙️ Búsqueda avanzada
await P.click('[data-on-click="abrirAvanzada"]'); await P.waitForSelector('#mbody .fbar');
const secciones = await P.locator('#mbody .lb').allInnerTexts();
check('la hoja trae Fecha, Barbero, Servicio, Pago, Origen, Cliente, WhatsApp y Ordenar', ['FECHA', 'BARBERO', 'SERVICIO', 'PAGO', 'ORIGEN', 'CLIENTE', 'WHATSAPP', 'ORDENAR'].every(t => secciones.some(s => s.toUpperCase().includes(t))), secciones.join(' | '));
await P.click('#mbody [data-g="origen"] [data-p1="web"]'); await P.click('#mbody [data-g="barb"] [data-p1="b1"]');
await P.click('#mbody >> text=Cancelar'); await P.waitForTimeout(200);
check('Cancelar no aplica nada', JSON.stringify(await vista()) === await P.evaluate(() => JSON.stringify(VISTA_DEF())));
await P.click('[data-on-click="abrirAvanzada"]'); await P.waitForSelector('#mbody .fbar');
await P.click('#mbody [data-g="origen"] [data-p1="web"]'); await P.click('#mbody [data-g="barb"] [data-p1="b1"]');
check('al tocar, la opción se marca en la hoja', await P.locator('#mbody [data-g="origen"] .chip.on').count() === 1);
await P.click('#mbody >> text=Limpiar todo');
check('«Limpiar todo» desmarca la hoja', await P.locator('#mbody .fchips:not([data-g="per"]):not([data-g="orden"]) .chip.on').count() === 0);
await P.click('#mbody [data-g="origen"] [data-p1="web"]'); await P.click('#mbody [data-g="barb"] [data-p1="b1"]'); await P.click('#mbody [data-g="orden"] [data-p1="nombre"]');
await P.click('#mbody >> text=Aplicar filtros'); await P.waitForTimeout(300);
const pas = await P.locator('#t-agenda .fchip:not(.lim)').allInnerTexts();
check('al aplicar aparecen afuera como pastillas', pas.length === 3 && pas.some(t => /Jhon/.test(t)) && pas.some(t => /link/i.test(t)) && pas.some(t => /Nombre/.test(t)), pas.join(' | '));
check('el ⚙️ muestra cuántos filtros hay', (await P.locator('[data-on-click="abrirAvanzada"] .dot').innerText()) === '3');
check('la lista queda filtrada (Jhon + reservó por link = Alan)', await nLista() === 1 && /Alan Uno/.test(await P.locator('#lista').innerText()));
await P.click('#t-agenda .fchip:has-text("Jhon")'); await P.waitForTimeout(200);
check('el ✕ de una pastilla quita solo ese filtro', (await P.locator('#t-agenda .fchip:not(.lim)').count()) === 2 && !(await vista()).barb.length && (await vista()).origen === 'web');
await P.click('#t-agenda .fchip.lim'); await P.waitForTimeout(200);
check('«✕ Limpiar» vuelve a lo predeterminado', JSON.stringify(await vista()) === await P.evaluate(() => JSON.stringify(VISTA_DEF())) && await nLista() === 9 && !(await P.locator('#t-agenda .fchip').count()));

// ---- Fecha desde el ⚙️: esta semana y un rango
await P.click('[data-on-click="abrirAvanzada"]'); await P.click('#mbody [data-g="per"] [data-p0="sem"]'); await P.click('#mbody >> text=Aplicar filtros'); await P.waitForTimeout(800);
{ const v = await vista(), txt = await P.locator('#lista').innerText();
  check('«Esta semana» queda como pastilla de fecha y trae la semana', v.per.t === 'rango' && /📅/.test(await P.locator('#t-agenda .fchip').first().innerText()) && txt.includes('Alan Uno') && txt.includes('Jaz Diez') === (man <= v.per.h), JSON.stringify(v.per)) }
await P.click('#t-agenda .fchip.lim'); await P.waitForTimeout(200);

// ---- etiquetas: un toque filtra, dos toques abren sus opciones
await P.click('[data-on-click="fEtq"][data-p0="confirmada"]'); await P.waitForTimeout(200);
check('un toque en «Confirmada» filtra el día', await nLista() === 2 && (await vista()).etq === 'confirmada');
await P.waitForTimeout(450); await P.dblclick('[data-on-click="fEtq"][data-p0="confirmada"]'); await P.waitForSelector('#mbody [data-g="wa"]');
check('dos toques en «Confirmada» abren su orden y sus filtros', await P.locator('#mbody [data-g="orden"] .chip').count() >= 2);
await P.click('#mbody [data-g="wa"] [data-p1="confirmo"]'); await P.waitForTimeout(200);
check('elegir «Confirmó que viene» se aplica al instante', await nLista() === 1 && /Alan Uno/.test(await P.locator('#lista').innerText()));
await P.evaluate(() => closeModal()); await P.click('#t-agenda .fchip.lim'); await P.waitForTimeout(200);
await P.waitForTimeout(450); await P.dblclick('[data-on-click="fEtq"][data-p0="por_validar"]'); await P.waitForSelector('#mbody [data-g="captura"]');
check('«Yape por validar» cuenta y muestra todos los días (hoy y mañana)', await nLista() === 3 && (await P.locator('[data-on-click="fEtq"][data-p0="por_validar"] .cc').innerText()) === '3');
await P.click('#mbody [data-g="orden"] [data-p1="vence"]'); await P.evaluate(() => closeModal());
await P.click('[data-on-click="fEtq"][data-p0="todos"]'); await P.click('[data-on-click="fEtq"][data-p0="por_validar"]'); await P.waitForTimeout(200);
check('cada etiqueta recuerda su orden en este celular', (await vista()).orden === 'vence' && (await P.evaluate(() => lsGet('ordenEtq', {}).por_validar)) === 'vence');
await P.click('#t-agenda .fchip.lim'); await P.waitForTimeout(200);
await P.waitForTimeout(450); await P.dblclick('[data-on-click="fEtq"][data-p0="todos"]'); await P.waitForSelector('#mbody .et');
check('dos toques en «Todos» muestran el resumen de todas las etiquetas', await P.locator('#mbody .et').count() === 7);
await P.click('#mbody .et:has-text("No vino")'); await P.waitForTimeout(200);
check('tocar una etiqueta del resumen la filtra', (await vista()).etq === 'no_vino' && await nLista() === 1);
await P.click('.stat:has-text("Atendidos")'); await P.waitForTimeout(200);
check('los cuadros de arriba también filtran', (await vista()).etq === 'atendida' && await nLista() === 2);
check('elegir un día o una etiqueta no agrega la fila de filtros (la pantalla no se mueve)', !(await P.locator('#t-agenda .fchip').count()));
await P.evaluate(() => limpiarVista());

// ---- Mes: tocando otra vez el día, páginas del servidor y «Ver más»
await P.click('.day.on'); await P.waitForFunction(() => S.vista.per.t === 'mes' && S.pag && !S.pag.cargando, null, { timeout: 8000 });
check('tocar otra vez el día elegido muestra todo el mes', (await vista()).per.m === hoy.slice(0, 7) && /citas del mes/i.test(await P.locator('#agStats').innerText()));
check('el mes se agrupa por día', await P.locator('#lista .grp-h h3').first().innerText().then(t => /\d+ de /i.test(t)));
await P.click('[data-on-click="fMesMover"][data-p0="1"]'); await P.waitForFunction(() => S.pag?.items.length && !S.pag.cargando, null, { timeout: 8000 });
check('el mes siguiente trae 30 y ofrece «Ver más»', await nLista() === 30 && /Ver más \(5 más\)/.test(await P.locator('#lista').innerText()), await nLista());
check('los números de las etiquetas del mes salen del servidor', (await P.locator('[data-on-click="fEtq"][data-p0="todos"] .cc').innerText()) === '35');
await P.click('text=Ver más'); await P.waitForFunction(() => S.pag.items.length === 35 && !S.pag.cargando, null, { timeout: 8000 });
check('«Ver más» trae el resto sin repetir', await nLista() === 35 && new Set(await P.evaluate(() => S.pag.items.map(c => c.id))).size === 35);
await P.click('[data-on-click="fEtq"][data-p0="confirmada"]'); await P.waitForFunction(() => S.pag && !S.pag.cargando && S.pag.key.includes('estado=confirmada'), null, { timeout: 8000 });
check('en el mes, cada etiqueta muestra todo el mes de esa etiqueta', await nLista() === 30 && (await P.locator('[data-on-click="fEtq"][data-p0="confirmada"] .cc').innerText()) === '35');
await P.evaluate(() => limpiarVista()); await P.waitForTimeout(300);

// ---- búsqueda con texto + un cambio de otro dispositivo sin perder los filtros
await P.fill('#q', 'fito'); await P.waitForFunction(() => S.pag?.key.includes('q=fito') && !S.pag.cargando, null, { timeout: 8000 });
check('buscar con texto mira todas las fechas', await nLista() === 1 && await P.locator('#qHint').isVisible());
await P.fill('#q', ''); await P.waitForTimeout(400);
await P.evaluate(() => { S.vista.origen = 'web'; renderAgenda() });
const id = await P.evaluate(() => S.citas.find(c => c.cliente?.nombre === 'Beto Dos').id);
await api('PATCH', '/citas/' + id, { origen: 'web' }); await P.evaluate(() => reload(true)); await P.waitForTimeout(500);
check('un cambio de otro dispositivo se ve sin perder los filtros', (await vista()).origen === 'web' && /Beto Dos/.test(await P.locator('#lista').innerText()));
await P.evaluate(() => limpiarVista());

// ---- desde la 🔔: va directo al día de la cita, con todo limpio
await P.evaluate(() => { S.vista.pago = 'gratis'; S.vista.per = { t: 'mes', m: '2020-01' }; irACita(S.citas.find(c => c.cliente?.nombre === 'Jaz Diez').id) }); await P.waitForTimeout(300);
check('ir a una cita limpia los filtros y abre su día', JSON.stringify(await vista()) === await P.evaluate(m => JSON.stringify({ ...VISTA_DEF(), per: { t: 'dia', f: m } }), man));
await P.evaluate(() => limpiarVista());

// ---- barbero: sin filtro de barbero ni de pago
const pn = await api('GET', '/panel');
await api('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos.map(b => b.id === 'b1' ? { ...b, pin: '7391' } : b), servicios: pn.servicios, usuarios: pn.usuarios });
const P2 = await (await br.newContext({ viewport: { width: 412, height: 900 }, timezoneId: 'America/Lima' })).newPage(); P2.on('pageerror', e => errores.push(e.message));
const bar = await (await P2.context().request.post(B + '/api/auth/login', { data: { pin: '7391' }, headers: { Origin: B } })).json();
await P2.goto(B + '/index.html'); await P2.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), bar); await P2.reload(); await P2.waitForSelector('#agChips .chip');
await P2.click('[data-on-click="abrirAvanzada"]'); await P2.waitForSelector('#mbody .fbar');
const sb = (await P2.locator('#mbody .lb').allInnerTexts()).join(' ').toUpperCase();
check('el barbero tiene el ⚙️ pero sin Barbero, Pago ni Cliente', !/BARBERO|PAGO|CLIENTE/.test(sb) && /SERVICIO/.test(sb), sb);
check('sin errores en la página', !errores.length, errores.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
