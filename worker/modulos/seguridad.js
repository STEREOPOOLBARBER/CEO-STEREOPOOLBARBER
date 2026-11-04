import { b64uEnc } from '../webauthn.js';
import { ahoraLocal, fail, rnd } from '../comun.js';
import { leerKV } from '../datos.js';
import { igualTxt, pinPermitido } from './auth.js';

export async function limitar(env, clave, max, ventanaMs) {
  const desde = Date.now() - ventanaMs;
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM intentos WHERE ip = ? AND ts > ?').bind(clave, desde).first();
  if (r.n >= max) fail(429, 'Demasiados intentos. Espera unos minutos.');
  await env.DB.prepare('INSERT INTO intentos(ip, ts) VALUES(?, ?)').bind(clave, Date.now()).run();
}
export const ipDe = req => req.headers.get('CF-Connecting-IP') || 'local';
/* Límite de Cloudflare (binding de Workers): no escribe en la base de datos y corta antes de tocarla.
   Si el binding no está (p. ej. un despliegue viejo), cae al limitador de D1. */
/* Contador de bloqueos de seguridad por día y tipo. Se acumula en memoria y se escribe como mucho una vez por minuto,
   para que un ataque no se convierta en miles de escrituras a la base de datos. */
export const SEG = { pend: new Map(), ult: 0 };
export async function anotarSeg(env, tipo, forzar) {
  const k = 'seg:' + ahoraLocal(env).fecha + ':' + tipo; SEG.pend.set(k, (SEG.pend.get(k) || 0) + 1);
  if (!forzar && Date.now() - SEG.ult < 60e3) return;
  SEG.ult = Date.now(); const lote = [...SEG.pend]; SEG.pend.clear();
  try { await env.DB.batch(lote.map(([k, n]) => env.DB.prepare('INSERT INTO contadores(k, n) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET n = n + excluded.n').bind(k, n))) } catch { }
}
export async function frenar(env, binding, clave, respaldo) {
  // Solo en pruebas locales (modo PIN encendido) se pueden apagar los límites de Cloudflare para correr muchas pruebas seguidas.
  if (env.SIN_LIMITES_CF === 'true' && pinPermitido(env)) binding = '_';
  if (env[binding]?.limit) { const { success } = await env[binding].limit({ key: clave }); if (!success) { await anotarSeg(env, 'limite_' + binding.slice(3).toLowerCase()); fail(429, 'Demasiadas solicitudes. Espera un minuto.') } return }
  if (respaldo) await limitar(env, binding + ':' + clave, respaldo[0], respaldo[1]);
}
export async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const r = await fetch(env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token), remoteip: ip }), signal: AbortSignal.timeout(8000) });
    return !!(await r.json().catch(() => ({}))).success;
  } catch { return false }
}
/* Ficha del formulario: token firmado de corta vida que solo entrega la página de reservas
   (tras pasar Turnstile si está activo). Sin ficha no se puede consultar DNI desde la consola. */
export const FICHA_MS = 30 * 60e3;
export async function claveFicha(env) {
  let k = (await leerKV(env, ['secretoFicha'])).secretoFicha;
  if (!k) { k = rnd(32); await env.DB.prepare('INSERT OR IGNORE INTO kv(k, v) VALUES(?, ?)').bind('secretoFicha', JSON.stringify(k)).run(); k = (await leerKV(env, ['secretoFicha'])).secretoFicha }
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.FICHA_SECRET || k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
export const firmarFicha = async (env, exp) => b64uEnc(await crypto.subtle.sign('HMAC', await claveFicha(env), new TextEncoder().encode('ficha|' + exp)));
export async function nuevaFicha(env) { const exp = Date.now() + FICHA_MS; return { ficha: `${exp}.${await firmarFicha(env, exp)}`, exp } }
export async function fichaValida(env, f) {
  const [e, firma] = String(f || '').split('.'), exp = +e;
  if (!exp || !firma || exp < Date.now() || exp > Date.now() + FICHA_MS + 60e3) return false;
  return igualTxt(await firmarFicha(env, exp), firma);
}
