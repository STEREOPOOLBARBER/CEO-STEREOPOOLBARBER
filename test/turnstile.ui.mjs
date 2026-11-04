// Prueba de pantalla: consultar DNI (gasta un pase de Turnstile) y luego reservar (necesita otro pase).
// Usa un Turnstile simulado en el navegador y un verificador simulado (ver turnstile.e2e.mjs para el arranque).
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const B = process.env.BASE || 'http://localhost:8787';
const usados = new Set();
const ver = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { const t = new URLSearchParams(b).get('response'); const ok = t?.startsWith('bueno') && !usados.has(t); if (ok) usados.add(t); r.end(JSON.stringify({ success: ok })) }) }).listen(8797);
const dni = http.createServer((q, r) => { r.end(JSON.stringify({ data: { nombres: 'ANA', apellidoPaterno: 'LUZ', apellidoMaterno: 'MAR' } })) }).listen(8798);
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), p = await br.newPage({ viewport: { width: 400, height: 900 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.route('https://challenges.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: `(()=>{let n=0;const w={};window.turnstile={render(el,o){const id='w'+(++n);w[id]=o;const e=typeof el==='string'?document.querySelector(el):el;e.innerHTML='<div>✅ Simulado</div>';setTimeout(()=>o.callback('bueno'+Date.now()+Math.random()),300);return id},reset(id){const o=w[id];if(!o)throw new Error('sin widget');setTimeout(()=>o.callback('bueno'+Date.now()+Math.random()),300)}}})()` }));
await p.goto(B + '/reservar.html'); await p.waitForTimeout(1500);
const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()); const d = new Date(lima + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 4); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
await p.evaluate(f => { F.serv = P.servicios[0].id; F.barb = P.barberos[0].id; F.fecha = f; F.hora = '10:00'; go(3) }, d.toISOString().slice(0, 10));
await p.waitForSelector('#ts >> text=Simulado');
await p.fill('#cDni', '44273815'); await p.waitForSelector('#dniEst:has-text("Datos encontrados")', { timeout: 10000 });
check('el DNI se consulta (gasta el primer pase)', (await p.inputValue('#cNom')) === 'Ana Luz Mar');
await p.fill('#cTel', '987123456'); await p.fill('#cCiu', 'Lima'); await p.check('#cOk');
await p.click('#bRes'); await p.waitForTimeout(3000);
const err = await p.locator('#err').innerText().catch(() => '');
check('después de consultar el DNI se puede reservar (pide un pase nuevo solo)', !/verificaci/i.test(err) && (await p.evaluate(() => !!F.cita)), err);
console.log(`\n${ok} OK · ${bad} fallos`); ver.close(); dni.close(); await br.close(); process.exit(bad ? 1 : 0);
