// Prueba de Turnstile con un verificador simulado (Cloudflare real no es accesible desde las pruebas).
// Arranque: wrangler dev --var ALLOW_PIN:true --var GOOGLE_CLIENT_ID: --var TURNSTILE_SECRET:secreto --var TURNSTILE_SITEKEY:sitio
//           --var TURNSTILE_VERIFY_URL:http://127.0.0.1:8797/verify --var SHALOM_API_KEY:sk_test --var DNI_API_URL:http://127.0.0.1:8798
import http from 'node:http';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const usados = new Set();
const ver = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { const p = new URLSearchParams(b), t = p.get('response'); const ok = p.get('secret') === 'secreto' && t?.startsWith('bueno') && !usados.has(t); if (ok) usados.add(t); r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ success: ok })) }) }).listen(8797);
const dni = http.createServer((q, r) => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ data: { nombres: 'ANA', apellidoPaterno: 'LUZ', apellidoMaterno: 'MAR' } })) }).listen(8798);
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, h = {}) => { const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), Origin: BASE, ...h }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) } };
let r = await call('GET', '/publico'); check('la página recibe la site key de Turnstile', r.j.ts === 'sitio');
r = await call('POST', '/publico/ficha', {}); check('sin Turnstile no hay ficha', r.s === 403);
r = await call('POST', '/publico/ficha', { turnstile: 'malo1' }); check('Turnstile inválido → sin ficha', r.s === 403);
r = await call('POST', '/publico/ficha', { turnstile: 'bueno1' }); check('Turnstile válido → ficha', r.s === 200 && r.j.ficha);
const f = r.j.ficha;
r = await call('POST', '/publico/ficha', { turnstile: 'bueno1' }); check('el mismo token de Turnstile no se puede reutilizar', r.s === 403);
r = await call('GET', '/publico/dni/44273815', null, { 'X-Ficha': f }); check('con la ficha se consulta el DNI', r.s === 200 && r.j.nombre === 'Ana Luz Mar', JSON.stringify(r.j));
const pub = (await call('GET', '/publico')).j;
const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()); const d = new Date(lima + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 3); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
const res = { servicioId: pub.servicios[0].id, barberoId: pub.barberos[0].id, fecha: d.toISOString().slice(0, 10), hora: '10:00', cliente: { nombre: 'Ana Luz', tel: '987123456', ciudad: 'Lima' } };
r = await call('POST', '/publico/reservas', res); check('reservar sin Turnstile → rechazado', r.s === 400);
r = await call('POST', '/publico/reservas', { ...res, turnstile: 'bueno2' }); check('reservar con Turnstile válido → OK', r.s === 200, JSON.stringify(r.j));
console.log(`\n${ok} OK · ${bad} fallos`); ver.close(); dni.close(); process.exit(bad ? 1 : 0);
