// Corre todas las pruebas, cada una con un servidor local limpio (wrangler dev) y la configuración que necesita.
// Uso: npm test                → todas
//      npm test -- dni acceso  → solo las que contengan esos nombres
// Las pruebas de pantalla usan Playwright (variable PW_PATH si no está instalado en el proyecto).
import { spawn, execFileSync } from 'node:child_process';
import { rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PIN = { ALLOW_PIN: 'true', SIN_LIMITES_CF: 'true', GOOGLE_CLIENT_ID: '' };
const DNI = { SHALOM_API_KEY: 'sk_test', DNI_API_URL: 'http://127.0.0.1:8798' };
const GOOGLE = { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', OWNER_EMAILS: 'dueno@gmail.com', GOOGLE_CERTS_URL: 'http://127.0.0.1:8799/certs' };
const TS = { TURNSTILE_SECRET: 'secreto', TURNSTILE_SITEKEY: 'sitio', TURNSTILE_VERIFY_URL: 'http://127.0.0.1:8797/verify' };
const ADMIN = `UPDATE kv SET v=json_set(v,'$.adminPin','5821') WHERE k='cfg';`;
const SUITES = [
  { n: 'api.e2e', vars: PIN, sql: 'file:test/sembrar.sql' },
  { n: 'acceso.e2e', vars: PIN, sql: ADMIN },
  { n: 'acceso.ui', vars: PIN, sql: ADMIN, ui: true },
  { n: 'google.e2e', vars: GOOGLE },
  { n: 'perfiles.ui', vars: GOOGLE, ui: true },
  { n: 'dni.e2e', vars: { ...PIN, ...DNI, SIN_LIMITES_CF: 'false' }, sql: ADMIN },
  { n: 'turnstile.e2e', vars: { ...PIN, ...DNI, ...TS }, sql: ADMIN },
  { n: 'turnstile.ui', vars: { ...PIN, ...DNI, ...TS }, sql: ADMIN, ui: true },
  { n: 'reprog.e2e', vars: PIN, sql: ADMIN },
  { n: 'agenda.ui', vars: PIN, sql: ADMIN, ui: true },
  { n: 'notif.ui', vars: PIN, sql: ADMIN, ui: true },
  { n: 'paginacion.e2e', vars: PIN, sql: ADMIN, historial: true },
  { n: 'paginacion.ui', vars: PIN, sql: ADMIN, historial: true, ui: true },
  { n: 'clientes.e2e', vars: PIN, sql: ADMIN },
  { n: 'auditoria.e2e', vars: PIN, sql: ADMIN },
  { n: 'whatsapp.e2e', vars: { ...PIN, WHATSAPP_API_URL: 'http://127.0.0.1:8796' }, sql: ADMIN, extra: ['--test-scheduled'] },
  { n: 'reportes.e2e', vars: { ...PIN, REPORTE_FORZAR: 'true' }, sql: ADMIN, extra: ['--test-scheduled'] },
  { n: 'privacidad.e2e', vars: PIN, sql: ADMIN, extra: ['--test-scheduled'] },
  { n: 'csp.ui', vars: PIN, sql: ADMIN, ui: true },
  { n: 'tiemporeal.ui', vars: PIN, sql: ADMIN, ui: true },
  { n: 'monitoreo.e2e', vars: { ...PIN, ...DNI, RESPALDO_MIN: '0', SIN_LIMITES_CF: 'false' }, sql: ADMIN, extra: ['--test-scheduled'] },
];
const filtro = process.argv.slice(2), lista = SUITES.filter(s => !filtro.length || filtro.some(f => s.n.includes(f)));
const wr = (...a) => execFileSync('npx', ['wrangler', ...a], { stdio: 'pipe', maxBuffer: 64e6 });
const esperar = async url => { for (let i = 0; i < 90; i++) { try { const r = await fetch(url); if (r.ok) return } catch { } await new Promise(r => setTimeout(r, 1000)) } throw new Error('wrangler dev no arrancó') };
const tmp = mkdtempSync(join(tmpdir(), 'brb-'));
let hist = null;
const res = [];
for (const s of lista) {
  rmSync('.wrangler/state', { recursive: true, force: true });
  const args = ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1', ...(s.extra || []), ...Object.entries(s.vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
  const dev = spawn('npx', args, { stdio: 'ignore', detached: true });
  const t0 = Date.now(); let out = '', ok = false;
  try {
    await esperar('http://127.0.0.1:8787/api/auth/config');
    await fetch('http://127.0.0.1:8787/api/publico'); // crea las tablas y los datos iniciales
    if (s.sql) { const f = s.sql.startsWith('file:') ? s.sql.slice(5) : (writeFileSync(join(tmp, 's.sql'), s.sql), join(tmp, 's.sql')); wr('d1', 'execute', 'stereo-barber-db', '--local', '--file', f) }
    if (s.historial) { if (!hist) { hist = join(tmp, 'hist.sql'); writeFileSync(hist, execFileSync('node', ['test/sembrar-historial.mjs'], { maxBuffer: 64e6 })) } wr('d1', 'execute', 'stereo-barber-db', '--local', '--file', hist) }
    out = await new Promise(res => { const p = spawn('node', [`test/${s.n}.mjs`], { env: { ...process.env, BASE: s.ui ? 'http://localhost:8787' : 'http://127.0.0.1:8787' } }); let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d); p.on('close', c => { ok = c === 0; res(o) }) });
  } catch (e) { out += '\n' + e.message }
  try { process.kill(-dev.pid, 'SIGTERM') } catch { }
  await new Promise(r => setTimeout(r, 3000));
  const linea = (out.match(/\d+ OK · \d+ fallos/) || ['sin resultado'])[0];
  res.push({ n: s.n, ok, linea, seg: Math.round((Date.now() - t0) / 1000) });
  console.log(`${ok ? '✅' : '❌'} ${s.n.padEnd(16)} ${linea.padEnd(18)} ${res.at(-1).seg}s`);
  if (!ok || process.env.VER) console.log(out.split('\n').filter(l => l.trim()).slice(-40).map(l => '     ' + l).join('\n'));
}
rmSync(tmp, { recursive: true, force: true });
const malos = res.filter(r => !r.ok);
console.log(`\n${res.length - malos.length}/${res.length} suites en verde${malos.length ? ' · fallaron: ' + malos.map(r => r.n).join(', ') : ''}`);
process.exit(malos.length ? 1 : 0);
