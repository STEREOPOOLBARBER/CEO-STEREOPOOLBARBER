import { addD, ahoraLocal, json, rnd } from '../comun.js';
import { datos, filaCita, kvStmt, leerKV } from '../datos.js';

/* ---------- respaldos automáticos en R2 (privados: solo el panel con permiso los descarga) ---------- */
export const RESP_DIAS = 30;
/* Cifrado de respaldos (AES-256-GCM). La clave es el secreto RESPALDO_CLAVE si existe (recomendado);
   si no, una clave aleatoria guardada en la base de datos. Así, si el almacén de fotos (R2) se filtrara,
   los respaldos no se pueden leer sin la base de datos o el secreto. El panel los descarga ya descifrados. */
async function claveRespaldo(env) {
  let base = env.RESPALDO_CLAVE;
  if (!base) { base = (await leerKV(env, ['claveRespaldo'])).claveRespaldo; if (!base) { base = rnd(32); await env.DB.prepare('INSERT OR IGNORE INTO kv(k, v) VALUES(?, ?)').bind('claveRespaldo', JSON.stringify(base)).run(); base = (await leerKV(env, ['claveRespaldo'])).claveRespaldo } }
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('respaldo|' + base));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function cifrar(env, texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await claveRespaldo(env), new TextEncoder().encode(texto)));
  const out = new Uint8Array(5 + 12 + c.length); out.set(new TextEncoder().encode('BRB1:')); out.set(iv, 5); out.set(c, 17); return out;
}
export async function descifrar(env, bytes) {
  const b = new Uint8Array(bytes);
  if (new TextDecoder().decode(b.slice(0, 5)) !== 'BRB1:') return new TextDecoder().decode(b); // respaldo antiguo sin cifrar
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(5, 17) }, await claveRespaldo(env), b.slice(17)));
}
export async function respaldar(env) {
  if (!env.FOTOS) throw new Error('Falta conectar el almacén de fotos (R2)');
  const [d, c, l] = await Promise.all([datos(env), env.DB.prepare('SELECT * FROM citas').all(), env.DB.prepare('SELECT data FROM links').all()]);
  const fecha = ahoraLocal(env).fecha, cuerpo = JSON.stringify({ v: 4, fecha: new Date().toISOString(), ...d, citas: c.results.map(filaCita), links: l.results.map(r => JSON.parse(r.data)) });
  await env.FOTOS.put(`respaldos/${fecha}.json`, await cifrar(env, cuerpo), { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { citas: String(c.results.length), cifrado: 'aes-256-gcm' } });
  await env.DB.batch([kvStmt(env, 'ultimoRespaldo', { fecha, ts: Date.now(), citas: c.results.length, bytes: cuerpo.length })]);
  // borrar los que pasaron los 30 días
  const viejos = (await env.FOTOS.list({ prefix: 'respaldos/' })).objects.filter(o => o.key.slice(10, 20) < addD(fecha, -RESP_DIAS)).map(o => o.key);
  if (viejos.length) await env.FOTOS.delete(viejos);
  return { fecha, citas: c.results.length, bytes: cuerpo.length };
}
export async function respaldoDiario(env) {
  const a = ahoraLocal(env), u = (await leerKV(env, ['ultimoRespaldo'])).ultimoRespaldo;
  if (a.min >= (env.RESPALDO_MIN ?? 3 * 60) && u?.fecha !== a.fecha) await respaldar(env);
}
