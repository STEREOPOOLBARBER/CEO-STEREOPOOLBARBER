// Prueba de la consulta de DNI con un RENIEC simulado.
// Arranque: wrangler dev --var ALLOW_PIN:true --var GOOGLE_CLIENT_ID: --var SHALOM_API_KEY:sk_test --var DNI_API_URL:http://127.0.0.1:8798  (+ datos de api.e2e: dueño PIN 5821)
import http from 'node:http';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
let llamadas = 0, claveOk = true;
const srv = http.createServer((q, r) => {
  llamadas++; if (q.headers['x-api-key'] !== 'sk_test') claveOk = false;
  const dni = q.url.split('/').pop(); r.setHeader('Content-Type', 'application/json');
  if (dni === '00000000') { r.statusCode = 404; return r.end('{}') }
  r.end(JSON.stringify({ data: { nombres: 'JUAN CARLOS', apellidoPaterno: 'PÉREZ', apellidoMaterno: 'DE LA CRUZ', direccion: 'Av. Secreta 123' } }));
}).listen(8798);
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
let FICHA = '';
const call = async (m, p, b, c, h = {}) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: BASE, ...(FICHA && p.startsWith('/publico/dni') ? { 'X-Ficha': FICHA } : {}), ...h }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
let r = await call('GET', '/publico/dni/44273815');
check('sin la ficha del formulario no se puede consultar (consola) → 403', r.s === 403, JSON.stringify(r));
r = await call('GET', '/publico/dni/44273815', null, null, { 'X-Ficha': `${Date.now() + 600000}.firmaFalsa` });
check('ficha falsificada → 403', r.s === 403);
r = await call('GET', '/publico/dni/44273815', null, null, { 'X-Ficha': `${Date.now() - 1000}.x` });
check('ficha vencida → 403', r.s === 403);
FICHA = (await call('POST', '/publico/ficha', {})).j.ficha;
check('la página obtiene su ficha', /^\d+\.[\w-]+$/.test(FICHA), FICHA);
r = await call('GET', '/publico/dni/44273815');
check('formulario público devuelve el nombre armado', r.s === 200 && r.j.nombre === 'Juan Carlos Pérez De La Cruz', JSON.stringify(r));
check('solo devuelve el nombre (nada de dirección)', Object.keys(r.j).join() === 'nombre' && !JSON.stringify(r.j).includes('Secreta'));
const antes = llamadas; r = await call('GET', '/publico/dni/44273815');
check('la segunda consulta sale del caché (no gasta cuota)', r.s === 200 && llamadas === antes);
check('el servicio recibió la clave en x-api-key', claveOk);
r = await call('GET', '/publico/dni/123'); check('DNI de menos de 8 dígitos → rechazado', r.s === 404 || r.s === 401);
r = await call('GET', '/publico/dni/00000000'); check('DNI inexistente → 404 con mensaje', r.s === 404 && /No encontramos/.test(r.j.error), JSON.stringify(r));
r = await call('GET', '/dni/44273815'); check('el panel sin sesión → 401', r.s === 401);
const adm = await call('POST', '/auth/login', { pin: '5821' });
r = await call('GET', '/dni/44273815', null, adm.cookie); check('el panel con sesión consulta', r.s === 200 && r.j.nombre.startsWith('Juan'));
r = await call('GET', '/dni/44273815?crudo=1', null, adm.cookie); check('el dueño ve la respuesta cruda para diagnosticar', r.s === 200 && r.j.crudo?.data?.nombres === 'JUAN CARLOS');
const pnl = (await call('GET', '/panel', null, adm.cookie)).j, barbs = pnl.barberos, servs = pnl.servicios, usus = pnl.usuarios;
check('la clave nunca aparece en el panel ni en lo público', !JSON.stringify((await call('GET', '/panel', null, adm.cookie)).j).includes('sk_test') && !JSON.stringify((await call('GET', '/publico')).j).includes('sk_test'));
let lim = 0, n429 = 0; for (let i = 0; i < 14; i++) { const x = await call('GET', '/publico/dni/2000000' + (i % 10)); if (x.s === 429) { lim = 429; n429 = i; break } }
check('más de 10 consultas por minuto desde una IP → 429 (límite de Cloudflare)', lim === 429 && n429 <= 10, `corte en ${n429}`);
// tope diario
await call('PUT', '/config', { cfg: { ...(await call('GET', '/panel', null, adm.cookie)).j.cfg, dniTopeDia: 3 }, barberos: barbs, servicios: servs, usuarios: usus }, adm.cookie);
r = await call('GET', '/dni/31000001', null, adm.cookie);
check('al pasar el tope diario se corta (protege el saldo)', r.s === 429 && /todas las consultas/.test(r.j.error), JSON.stringify(r));
r = await call('GET', '/dni/44273815', null, adm.cookie);
check('las consultas ya guardadas siguen funcionando', r.s === 200);
console.log(`\n${ok} OK · ${bad} fallos`); srv.close(); process.exit(bad ? 1 : 0);
