// Prueba de la Fase 4: contador de bloqueos, monitoreo, avisos y respaldos automáticos.
// Arranque: wrangler dev --test-scheduled --var RESPALDO_MIN:0 --var ALLOW_PIN:true --var GOOGLE_CLIENT_ID: --var SHALOM_API_KEY:sk_test --var DNI_API_URL:http://127.0.0.1:8798 (+ adminPin 5821)
import http from 'node:http';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const dni = http.createServer((q, r) => { r.end(JSON.stringify({ data: { nombres: 'ANA', apellidoPaterno: 'LUZ', apellidoMaterno: 'MAR' } })) }).listen(8798);
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c, h = {}) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: BASE, ...h }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { s: r.status, j, h: r.headers } };
const adm = (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: '{"pin":"5821"}' })).headers.get('set-cookie').split(';')[0];
let r = await call('GET', '/diagnostico', null, adm);
check('la base de datos tiene aplicadas las migraciones versionadas', Array.isArray(r.j.db?.migraciones) && r.j.db.migraciones.includes(1), JSON.stringify(r.j));
r = await call('GET', '/alertas', null, adm);
check('sin respaldo todavía → aviso en la campana', r.j.some(a => /respaldo/i.test(a.t)), JSON.stringify(r.j));
await fetch(BASE + '/__scheduled?cron=*/5+*+*+*+*');
r = await call('GET', '/respaldos', null, adm);
check('el cron de la madrugada crea el respaldo automático', r.j.length === 1, JSON.stringify(r.j));
// bloqueos: DNI sin ficha y exceso de consultas
for (let i = 0; i < 3; i++) await call('GET', '/publico/dni/4427381' + i);
const f = (await call('POST', '/publico/ficha', {})).j.ficha;
const pn = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: { ...pn.cfg, dniTopeDia: 5 }, barberos: pn.barberos, servicios: pn.servicios, usuarios: pn.usuarios }, adm);
for (let i = 0; i < 13; i++) await call('GET', '/publico/dni/5000000' + (i % 10), null, null, { 'X-Ficha': f });
r = await call('GET', '/seguridad', null, adm);
const hoy = Object.keys(r.j.dias).sort().pop(), d = r.j.dias[hoy];
console.log('   hoy:', JSON.stringify(d));
check('cuenta las consultas DNI del día', d.dni >= 5, d.dni);
check('cuenta los bloqueos por tipo (sin ficha, exceso, tope)', d.bloqueos.sin_ficha === 3 && d.bloqueos.limite_dni >= 1 && d.bloqueos.tope_dni >= 1, JSON.stringify(d.bloqueos));
check('muestra 14 días', Object.keys(r.j.dias).length === 14);
r = await call('GET', '/alertas', null, adm);
check('aviso de DNI agotado en la campana', r.j.some(a => /DNI/.test(a.t)), JSON.stringify(r.j));
r = await call('GET', '/seguridad'); check('monitoreo sin sesión → 401', r.s === 401);
// respaldos
r = await call('POST', '/respaldos', {}, adm);
check('crear respaldo ahora', r.s === 200 && r.j.fecha, JSON.stringify(r.j));
r = await call('GET', '/respaldos', null, adm);
check('el del mismo día se reemplaza (uno por día)', r.j.length === 1 && r.j[0].fecha === hoy, JSON.stringify(r.j));
r = await call('GET', '/respaldos/' + hoy, null, adm);
check('se descarga como archivo con todo el sistema', r.s === 200 && /attachment/.test(r.h.get('content-disposition')) && r.j.v === 4 && Array.isArray(r.j.citas) && r.j.cfg && Array.isArray(r.j.barberos));
check('el respaldo no trae el secreto de las fichas', !JSON.stringify(r.j).includes('secretoFicha'));
r = await call('GET', '/respaldos/' + hoy); check('descargar sin sesión → 401', r.s === 401);
r = await fetch(BASE + '/api/fotos/respaldos%2F' + hoy + '.json'); check('no se puede bajar como foto pública', [400, 401, 404].includes(r.status), r.status);
r = await call('GET', '/alertas', null, adm); check('con respaldo reciente desaparece el aviso', !r.j.some(a => /respaldo/i.test(a.t)));
// respaldo automático por el cron (el arranque usa RESPALDO_MIN=0 para no esperar a las 3 a. m.)
await fetch(BASE + '/__scheduled?cron=*/5+*+*+*+*');
r = await call('GET', '/respaldos', null, adm);
check('el cron no duplica el respaldo del día', r.j.length === 1, JSON.stringify(r.j));
console.log(`\n${ok} OK · ${bad} fallos`); dni.close(); process.exit(bad ? 1 : 0);
