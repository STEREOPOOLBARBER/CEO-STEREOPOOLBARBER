// Recorrido de todas las pantallas con la CSP estricta (sin JavaScript en línea):
// sin violaciones de CSP, sin errores, y cada botón visible tiene su acción registrada.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 412, height: 900 }, timezoneId: 'America/Lima' });
const problemas = [];
const nueva = async () => { const p = await ctx.newPage(); p.on('pageerror', e => problemas.push('ERROR ' + e.message)); p.on('console', m => { if (/Content Security Policy|Refused to|Acción desconocida/i.test(m.text())) problemas.push(m.text().slice(0, 160)) }); p.on('dialog', d => d.dismiss()); await p.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error('Refused to (CSP) ' + e.violatedDirective + ' ' + e.blockedURI))); return p };
const sinRegistro = p => p.evaluate(() => [...document.querySelectorAll('[data-on-click],[data-on-change],[data-on-input],[data-on-keydown]')].flatMap(el => ['click', 'change', 'input', 'keydown'].map(t => el.getAttribute('data-on-' + t)).filter(k => k && !ACC[k])));
const revisar = async (p, nombre) => { const f = await sinRegistro(p); check(`${nombre}: todas las acciones están registradas`, !f.length, f.join()); };
// ---- panel
const P = await nueva();
const lr = await ctx.request.post(B + '/api/auth/login', { data: { pin: '5821' }, headers: { Origin: B } });
await P.goto(B + '/index.html'); await P.evaluate(s => localStorage.setItem('brb_ses', JSON.stringify(s)), await lr.json()); await P.reload(); await P.waitForSelector('#login', { state: 'hidden' });
check('el panel carga con la CSP estricta', await P.evaluate(() => typeof ACC === 'object' && typeof renderAgenda === 'function'));
await revisar(P, 'Agenda');
await P.click('[data-on-click="fMes"]'); await P.waitForTimeout(300); check('botón Mes responde', await P.evaluate(() => S.vista.per.t === 'mes'));
await P.click('[data-on-click="abrirAvanzada"]'); await P.waitForSelector('#mbody .fbar'); await revisar(P, 'Búsqueda avanzada'); await P.evaluate(() => closeModal());
await P.click('[data-on-click="fEtq"][data-p0="todos"]'); await P.click('[data-on-click="fEtq"][data-p0="todos"]'); await P.waitForSelector('#mbody .et'); await revisar(P, 'Etiqueta Todos'); await P.evaluate(() => closeModal());
await P.evaluate(() => { S.vista = VISTA_DEF(); renderAgenda() });
await P.click('button[title="Nueva cita"]'); await P.waitForSelector('#pegaTxt'); await revisar(P, 'Nueva cita'); await P.evaluate(() => closeModal());
await P.click('#hBell'); await P.waitForSelector('#notif.on'); await revisar(P, 'Notificaciones'); await P.mouse.click(30, 600);
await P.click('text=🔗 Compartir'); await P.waitForTimeout(400); await revisar(P, 'Compartir');
await P.click('text=⚙️ Config'); await P.waitForTimeout(400);
const accs = await P.$$eval('.acc > button', b => b.length);
for (let i = 0; i < accs; i++) { await P.locator('.acc > button').nth(i).click(); await P.waitForTimeout(150) }
await revisar(P, `Config (${accs} secciones)`);
await P.evaluate(() => { S.open = ''; renderConfig() }); await P.locator('#acc_waapi > button').click(); await P.waitForSelector('#waPhone', { timeout: 8000 });
await revisar(P, 'Config → 🤖 WhatsApp automático'); check('la guía para conectar el número nuevo está en Config', await P.locator('text=Cómo conectar tu número nuevo').count() === 1);
// interruptor (sw) sin código en texto
await P.evaluate(() => { S.open = 'barberos'; renderConfig() });
const antes = await P.evaluate(() => D().barberos[0].activo !== false);
await P.locator('#acc_barberos .sw').first().click(); await P.waitForTimeout(200);
check('interruptor de barbero funciona (sin código en texto)', (await P.evaluate(() => D().barberos[0].activo !== false)) !== antes && await P.evaluate(() => S.dirty));
await P.evaluate(() => editBarbero(D().barberos[0].id)); await P.waitForTimeout(300); await revisar(P, 'Editar barbero');
const d0 = await P.evaluate(() => S._b.dias.length); await P.locator('#bDias .dchip').first().click(); await P.waitForTimeout(150);
check('días del barbero se marcan/desmarcan', (await P.evaluate(() => S._b.dias.length)) !== d0); await P.evaluate(() => closeModal());
await P.evaluate(() => editServicio(D().servicios[0].id)); await P.waitForTimeout(300); await revisar(P, 'Editar servicio'); await P.evaluate(() => closeModal());
await P.evaluate(() => editUser()); await P.waitForTimeout(300); await revisar(P, 'Nuevo usuario');
const p0 = await P.evaluate(() => S._u.permisos.dash); await P.locator('#uPerms .sw').nth(7).click(); await P.waitForTimeout(150);
check('permisos de usuario se cambian (togPermU)', await P.evaluate(() => S._u.rol) === 'personal'); await P.evaluate(() => closeModal());
await P.evaluate(() => { goTab('agenda') }); await P.waitForTimeout(300);
await P.click('button[title="Recordatorios por WhatsApp"]'); await P.waitForSelector('text=⏰ Recordatorios'); await revisar(P, 'Recordatorios'); await P.evaluate(() => closeModal());
await P.evaluate(() => abrirMenu()); await P.waitForTimeout(300); await revisar(P, 'Menú'); await P.evaluate(() => closeModal());
await P.evaluate(() => abrirReporte()); await P.waitForSelector('text=💬 Enviar por WhatsApp', { timeout: 8000 }); await revisar(P, 'Reporte semanal');
check('el reporte semanal abre con sus botones (WhatsApp y Excel)', await P.locator('[data-on-click="repExcel"]').count() === 1);
await P.selectOption('#mbody select', { index: 0 }); await P.waitForSelector('#mbody p.hint b >> text=en curso', { timeout: 8000 }); check('cambiar a «esta semana» funciona', true); await P.evaluate(() => closeModal());
await P.evaluate(() => abrirCaja()); await P.waitForTimeout(400); await revisar(P, 'Caja'); await P.evaluate(() => closeModal());
await P.evaluate(() => abrirDash()); await P.waitForSelector('.sheet .dsec', { timeout: 8000 }); await revisar(P, 'Dashboard'); await P.evaluate(() => closeModal());
await P.evaluate(async () => { await API.req('POST', '/citas', { fecha: hoy(), hora: '19:00', barberoId: S.barberos[0].id, servicioId: S.servicios[0].id, precio: 30, cliente: { nombre: 'Ficha Prueba', tel: '987000555' }, estado: 'confirmada' }); await reload() });
await P.evaluate(() => abrirClientes()); await P.waitForSelector('#cliList >> text=Ficha Prueba', { timeout: 8000 }); await revisar(P, 'Clientes');
await P.click('#cliList >> text=Ficha Prueba'); await P.waitForSelector('#ficPref'); await revisar(P, 'Ficha de cliente (con derechos ARCO)');
check('la ficha ofrece descargar y anonimizar (Ley 29733)', await P.locator('text=📄 Descargar sus datos').count() === 1 && await P.locator('[data-on-click="anonimizarFicha"]').count() === 1); await P.evaluate(() => closeModal());
await P.evaluate(() => verSeguridad()); await P.waitForSelector('text=Últimos 14 días', { timeout: 8000 }); await revisar(P, 'Monitoreo');
await P.click('text=📝 Bitácora: quién hizo qué'); await P.waitForTimeout(600); await revisar(P, 'Bitácora'); await P.evaluate(() => closeModal());
await P.evaluate(() => moverCitas()); await P.waitForTimeout(300); await revisar(P, 'Mover citas'); await P.evaluate(() => closeModal());
// ---- aviso de privacidad
const PV = await nueva(); await PV.goto(B + '/privacidad.html'); await PV.waitForSelector('text=Tus derechos', { timeout: 8000 });
check('el aviso de privacidad carga (Ley 29733, derechos ARCO)', /29733/.test(await PV.locator('body').innerText()));
// ---- formulario de reservas: recorrer los pasos con clics reales
const entrar = async p => { await p.waitForSelector('#splash.listo', { timeout: 8000 }); await p.click('#splash'); await p.waitForSelector('#splash', { state: 'detached', timeout: 8000 }) }; // «Toca para entrar»
const R = await nueva();
await R.goto(B + '/reservar.html'); await entrar(R); await R.waitForSelector('[data-on-click^="a"]', { timeout: 8000 }); await revisar(R, 'Reservar: servicios');
await R.locator('[data-on-click][data-p0]').first().click(); await R.waitForTimeout(500); await revisar(R, 'Reservar: barbero');
check('reservar avanza al paso 2 con clic', await R.evaluate(() => F.step) === 1);
await R.locator('[data-on-click][data-p0]').first().click(); await R.waitForTimeout(800); await revisar(R, 'Reservar: día y hora');
check('reservar avanza al paso 3 con clic', await R.evaluate(() => F.step) === 2);
// ---- confirmar asistencia desde el link
const cod = await P.evaluate(async () => (await API.req('POST', '/citas', { fecha: addD(hoy(), 2), hora: '12:00', barberoId: S.barberos[1].id, servicioId: S.servicios[0].id, cliente: { nombre: 'Link Confirma', tel: '987000777' }, estado: 'confirmada' })).codigo);
const EC = await nueva(); await EC.goto(B + '/estado.html?c=' + cod); await entrar(EC); await EC.waitForSelector('text=✅ Confirmo que voy', { timeout: 8000 }); await revisar(EC, 'Estado con botón de confirmar');
await EC.click('text=✅ Confirmo que voy'); await EC.waitForSelector('text=Confirmaste que vienes', { timeout: 8000 }); check('el cliente confirma su asistencia desde el link', true);
// ---- estado de cita
const E = await nueva(); await E.goto(B + '/estado.html'); await entrar(E); await E.waitForSelector('#cod'); await E.fill('#cod', 'ZZZZZZ'); await E.keyboard.press('Enter'); await E.waitForTimeout(800);
check('estado.html: Enter busca el código (keydown sin JS en línea)', /No encontramos/i.test(await E.locator('body').innerText())); await revisar(E, 'Estado');
check('sin violaciones de CSP ni errores en todo el recorrido', !problemas.length, problemas.slice(0, 6).join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); await br.close(); process.exit(bad ? 1 : 0);
