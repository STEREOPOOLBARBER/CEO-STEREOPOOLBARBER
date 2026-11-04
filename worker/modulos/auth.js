import { b64uEnc, verificarAfirmacion, verificarAtestacion } from '../webauthn.js';
import { ALLP, COOKIE, COOKIE_P, ROL_BARBERO, SES_MS, VIEJA, codigo, fail, json, norm, rnd, sha256, str, uid } from '../comun.js';
import { datos } from '../datos.js';
import { ipDe, limitar } from './seguridad.js';

/* ---------- autenticación ---------- */
export function cookieDe(req, n = COOKIE) {
  const c = req.headers.get('Cookie') || '', leer = k => c.match(new RegExp('(?:^|;\\s*)' + k + '=([^;]+)'))?.[1] || '';
  return leer(n) || leer(VIEJA[n] || n); // acepta el nombre viejo mientras dure la transición
}
export const setCookie = (val, maxAge, n = COOKIE) => `${n}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const pinValido = p => /^\d{4,6}$/.test(p);
// El PIN está apagado: el acceso es solo con Google. Solo se enciende con ALLOW_PIN=true (pruebas locales).
export const pinPermitido = env => env.ALLOW_PIN === 'true';
export function porEmail(email, d, env) {
  const e = norm(email); if (!e) return null;
  if ((env.OWNER_EMAILS || '').split(/[,\s;]+/).map(norm).filter(Boolean).includes(e)) return { rol: 'dueno', nombre: 'Dueño' };
  const u = d.usuarios.find(x => norm(x.email) === e && x.activo !== false);
  if (u) return { rol: u.rol, uid: u.id, nombre: u.nombre, barberoId: u.barberoId || '' };
  const b = d.barberos.find(x => norm(x.email) === e && x.activo !== false);
  if (b) return { rol: 'barbero', barberoId: b.id, nombre: b.nombre };
  return null;
}

export function porPin(pin, d) {
  if (pin === d.cfg.adminPin) return { ident: { rol: 'dueno', nombre: 'Dueño' }, ref: 'admin' };
  const u = d.usuarios.find(x => x.pin === pin && x.activo !== false);
  if (u) return { ident: { rol: u.rol, uid: u.id, nombre: u.nombre, barberoId: u.barberoId || '' }, ref: 'u:' + u.id };
  const b = d.barberos.find(x => x.pin === pin && x.activo !== false);
  if (b) return { ident: { rol: 'barbero', barberoId: b.id, nombre: b.nombre }, ref: 'b:' + b.id };
  return null;
}
export function pinDeRef(ref, d) {
  if (ref === 'admin') return d.cfg.adminPin;
  const [t, id] = ref.split(':'); const x = (t === 'u' ? d.usuarios : d.barberos).find(y => y.id === id && y.activo !== false);
  return x?.pin;
}
export function permisos(id, d) {
  if (id.rol === 'dueno' || id.rol === 'admin') return { ...ALLP };
  if (id.uid) { const u = d.usuarios.find(x => x.id === id.uid); return u ? { ...(u.permisos || {}) } : null }
  if (id.rol === 'barbero') return { ...ROL_BARBERO, ...(d.cfg.permBarbero || {}) };
  return {};
}
/* ----- clave y huella de barberos / personal ----- */
// "sujeto" = b_<id del barbero> o u_<id del usuario>; solo existe si está activo en la configuración.
export function porSujeto(sujeto, d) {
  const s = String(sujeto || ''), tipo = s[0], id = s.slice(2);
  if (s === 'admin') return { rol: 'dueno', nombre: 'Dueño', sujeto: 'admin' };
  if (tipo === 'b') { const b = d.barberos.find(x => x.id === id && x.activo !== false); return b ? { rol: 'barbero', barberoId: b.id, nombre: b.nombre, sujeto: s } : null }
  if (tipo === 'u') { const u = d.usuarios.find(x => x.id === id && x.activo !== false); return u ? { rol: u.rol, uid: u.id, nombre: u.nombre, barberoId: u.barberoId || '', sujeto: s } : null }
  return null;
}
export async function hashClave(clave, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  return b64uEnc(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, k, 256));
}
export const igualTxt = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0 };
export const CLAVES_FLOJAS = ['123456', '1234567', '12345678', '123456789', '654321', '111111', '000000', 'abcdef', 'qwerty', 'password', 'contraseña', 'barberia', 'stereo'];
export async function nuevoReto(env, tipo, sujeto) {
  const c = rnd(32);
  await env.DB.prepare('INSERT INTO retos(h, tipo, sujeto, exp) VALUES(?, ?, ?, ?)').bind(await sha256(c), tipo, sujeto || null, Date.now() + 5 * 60e3).run();
  return c;
}
export const gastarReto = async (env, c, tipo) => env.DB.prepare('DELETE FROM retos WHERE h = ? AND tipo = ? AND exp > ? RETURNING sujeto').bind(await sha256(String(c || '')), tipo, Date.now()).first();
export const hashInv = c => sha256(String(c || '').trim().toUpperCase());
export const codigoInv = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

// Revalida la sesión contra los datos actuales: si quitan a alguien, pierde acceso al instante.
export async function sesion(req, env, d) {
  const t = cookieDe(req); if (!t) return null;
  const r = await env.DB.prepare('SELECT data, exp FROM sesiones WHERE id = ?').bind(await sha256(t)).first();
  if (!r || r.exp < Date.now()) return null;
  const s = JSON.parse(r.data);
  let ident = null;
  if (s.via === 'google') ident = porEmail(s.email, d, env);
  else if (s.via === 'clave') { const c = await env.DB.prepare('SELECT v FROM claves WHERE sujeto = ?').bind(s.sujeto).first(); if ((c ? c.v : 0) === s.cv && (c || s.sujeto === 'admin')) ident = porSujeto(s.sujeto, d) }
  else if (s.via === 'huella') { const h = await env.DB.prepare('SELECT 1 AS x FROM passkeys WHERE id = ? AND sujeto = ?').bind(s.cid, s.sujeto).first(); if (h) ident = porSujeto(s.sujeto, d) }
  else if (s.via === 'pin' && pinPermitido(env)) { const p = pinDeRef(s.ref, d); if (p && await sha256(p) === s.pinH) ident = s.ident }
  if (!ident) return null;
  const perm = permisos(ident, d); if (!perm) return null;
  return { ...ident, email: s.email, perm };
}
/* ----- puerta: el dispositivo entra con Google y recién ahí se elige el perfil ----- */
export const exigePuerta = env => !!env.GOOGLE_CLIENT_ID;
export const sujetoDeEmail = (email, d) => { const e = norm(email), u = d.usuarios.find(x => norm(x.email) === e && x.activo !== false), b = d.barberos.find(x => norm(x.email) === e && x.activo !== false); return u ? 'u_' + u.id : b ? 'b_' + b.id : '' };
export async function puerta(req, env, d) {
  const t = cookieDe(req, COOKIE_P); if (!t) return null;
  const r = await env.DB.prepare('SELECT data, exp FROM sesiones WHERE id = ?').bind(await sha256(t)).first();
  if (!r || r.exp < Date.now()) return null;
  const g = JSON.parse(r.data); if (g.via !== 'puerta') return null;
  if (g.email) { const i = porEmail(g.email, d, env); return i ? { email: g.email, dueno: i.rol === 'dueno', propio: sujetoDeEmail(g.email, d) } : null }
  return g.sujeto && porSujeto(g.sujeto, d) ? { dueno: false, propio: g.sujeto } : null;
}
export const permitido = (g, sujeto) => g.dueno || sujeto === g.propio;
export async function exigirPuerta(req, env, d, sujeto) {
  if (!exigePuerta(env)) return null;
  const g = await puerta(req, env, d);
  if (!g || (sujeto !== undefined && !permitido(g, sujeto))) fail(403, 'Primero entra con Google en este dispositivo');
  return g;
}
export async function abrirPuerta(env, data, ms = SES_MS) {
  const t = rnd();
  await env.DB.prepare('INSERT INTO sesiones(id, data, exp) VALUES(?, ?, ?)').bind(await sha256(t), JSON.stringify({ via: 'puerta', ...data }), Date.now() + ms).run();
  return setCookie(t, ms / 1000, COOKIE_P);
}
/* Bitácora: quién hizo qué (citas, configuración, accesos, respaldos). Se guarda 180 días. */
export async function auditar(env, quien, accion, objeto = '', detalle = '') {
  try { await env.DB.prepare('INSERT INTO auditoria(ts, quien, accion, objeto, detalle) VALUES(?, ?, ?, ?, ?)').bind(Date.now(), String(quien || '?').slice(0, 80), accion, String(objeto).slice(0, 80), String(detalle).slice(0, 400)).run() } catch { }
}
export const quienEs = s => s ? (s.nombre || s.email || 'Panel') + (s.rol ? ` (${s.rol})` : '') : 'Cliente';
// Al entrar a un perfil se cierra la sesión anterior de ese navegador: cada ingreso estrena sesión.
export async function cerrarPrevia(req, env) { const t = cookieDe(req); if (t) await env.DB.prepare('DELETE FROM sesiones WHERE id = ?').bind(await sha256(t)).run() }
export async function abrirSesion(env, data) {
  const t = rnd();
  await env.DB.prepare('INSERT INTO sesiones(id, data, exp) VALUES(?, ?, ?)').bind(await sha256(t), JSON.stringify(data), Date.now() + SES_MS).run();
  return setCookie(t, SES_MS / 1000);
}

export let jwks = { exp: 0, keys: [] };
export async function clavesGoogle(env, fetcher = fetch) {
  if (jwks.exp > Date.now()) return jwks.keys;
  const r = await fetcher(env?.GOOGLE_CERTS_URL || 'https://www.googleapis.com/oauth2/v3/certs'); if (!r.ok) fail(502, 'No se pudo contactar a Google');
  const max = +(/max-age=(\d+)/.exec(r.headers.get('Cache-Control') || '')?.[1] || 3600);
  jwks = { exp: Date.now() + max * 1000, keys: (await r.json()).keys || [] };
  return jwks.keys;
}
export const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
// Verifica el ID token (JWT RS256) de Google: firma, emisor, destinatario, vencimiento y correo verificado.
export async function verificarGoogle(token, clientId, env, fetcher) {
  const malo = () => fail(400, 'Token de Google no válido o vencido');
  const partes = String(token || '').split('.'); if (partes.length !== 3 || token.length > 4096) malo();
  const [h, p, firma] = partes, dec = x => JSON.parse(new TextDecoder().decode(b64u(x)));
  let cab, datos; try { cab = dec(h); datos = dec(p) } catch { malo() }
  if (cab.alg !== 'RS256') malo();
  const jwk = (await clavesGoogle(env, fetcher)).find(k => k.kid === cab.kid); if (!jwk) malo();
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(firma), new TextEncoder().encode(`${h}.${p}`))) malo();
  const ahora = Date.now() / 1000;
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(datos.iss) || datos.aud !== clientId || !(datos.exp > ahora - 60) || !(datos.iat <= ahora + 300) || datos.email_verified !== true || !datos.email) malo();
  return datos;
}
// El nonce lo emite el servidor y se usa una sola vez: un token robado no se puede reutilizar.
export async function nuevoNonce(env) {
  const n = rnd(24);
  await env.DB.prepare('INSERT INTO nonces(h, exp) VALUES(?, ?)').bind(await sha256(n), Date.now() + 5 * 60e3).run();
  return n;
}
export async function gastarNonce(env, n) {
  if (!n) return false;
  const r = await env.DB.prepare('DELETE FROM nonces WHERE h = ? AND exp > ?').bind(await sha256(String(n)), Date.now()).run();
  return !!r.meta?.changes;
}
export const anotar = (env, via, quien, ok, motivo, req) => env.DB.prepare('INSERT INTO accesos(ts, via, quien, ok, motivo, ip) VALUES(?,?,?,?,?,?)').bind(Date.now(), via, str(quien, 120), ok ? 1 : 0, str(motivo, 120), ipDe(req)).run().catch(() => { });


/* Rutas de ingreso: Google, puerta, perfiles, clave, huella, PIN (pruebas) y salida. */
export async function rutasAuth(c) {
  const { req, env, path, m, body, d, s, exigir, propia } = c;
  let x;
  if (path === '/auth/config' && m === 'GET') {
    const n = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM passkeys) AS h, (SELECT COUNT(*) FROM claves) AS c').first();
    return json({ google: env.GOOGLE_CLIENT_ID || '', pin: pinPermitido(env), huella: n.h > 0, clave: n.c > 0, puerta: exigePuerta(env) });
  }
  // Nombres de quienes tienen clave (para elegir quién eres en la pantalla de ingreso).
  if (path === '/auth/personal' && m === 'GET') {
    const d = await datos(env); await exigirPuerta(req, env, d);
    const r = await env.DB.prepare('SELECT sujeto FROM claves').all();
    return json(r.results.map(x => porSujeto(x.sujeto, d)).filter(Boolean).map(i => ({ sujeto: i.sujeto, nombre: i.nombre })));
  }
  // Perfiles que puede elegir este dispositivo (solo si ya entró con Google).
  if (path === '/auth/perfiles' && m === 'GET') {
    const d = await datos(env), g = exigePuerta(env) ? await puerta(req, env, d) : { dueno: true };
    if (!g) return json({ puerta: false });
    const [c, h] = await Promise.all([env.DB.prepare('SELECT sujeto FROM claves').all(), env.DB.prepare('SELECT sujeto FROM passkeys').all()]);
    const tc = new Set(c.results.map(x => x.sujeto)), th = new Set(h.results.map(x => x.sujeto));
    const fila = (sujeto, nombre, rol, foto, color) => ({ sujeto, nombre, rol, foto: foto || '', color: color || '', clave: tc.has(sujeto) || (sujeto === 'admin'), huella: th.has(sujeto) });
    const l = [...(g.dueno && exigePuerta(env) ? [fila('admin', 'Dueño', 'dueno')] : []), ...d.barberos.filter(b => b.activo !== false).map(b => fila('b_' + b.id, b.nombre, 'barbero', b.foto, b.color)), ...d.usuarios.filter(u => u.activo !== false).map(u => fila('u_' + u.id, u.nombre, u.rol))].filter(x => permitido(g, x.sujeto));
    return json({ puerta: true, email: g.email || '', perfiles: l.map(x => ({ ...x, directo: !g.dueno && !x.clave && !x.huella && !!g.email })) });
  }
  // Quien entró con su propio correo de Google y no tiene clave ni huella entra directo.
  if (path === '/auth/perfil/directo' && m === 'POST') {
    const d = await datos(env), sujeto = str((await body()).sujeto, 60), g = await exigirPuerta(req, env, d, sujeto);
    const ident = porSujeto(sujeto, d), k = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM claves WHERE sujeto = ?1) + (SELECT COUNT(*) FROM passkeys WHERE sujeto = ?1) AS n').bind(sujeto).first();
    if (!g || !g.email || g.dueno || !ident || k.n > 0) fail(403, 'Este perfil necesita clave o huella');
    await anotar(env, 'google', ident.nombre, true, ident.rol, req);
    await cerrarPrevia(req, env);
    return json(ident, 200, { 'Set-Cookie': await abrirSesion(env, { via: 'google', email: g.email }) });
  }
  if (path === '/auth/puerta/salir' && m === 'POST') {
    const t = cookieDe(req, COOKIE_P); if (t) await env.DB.prepare('DELETE FROM sesiones WHERE id = ?').bind(await sha256(t)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie('', 0, COOKIE_P) });
  }
  if (path === '/auth/clave' && m === 'POST') {
    await limitar(env, 'k:' + ipDe(req), 30, 15 * 60e3);
    const b = await body(), sujeto = str(b.sujeto, 60), clave = String(b.clave || '').slice(0, 100);
    await limitar(env, 'ks:' + sujeto, 6, 15 * 60e3);
    const d = await datos(env); await exigirPuerta(req, env, d, sujeto);
    const ident = porSujeto(sujeto, d), row = ident && await env.DB.prepare('SELECT * FROM claves WHERE sujeto = ?').bind(sujeto).first();
    // Mientras el dueño no cambie su clave, la de arranque es 1111 (solo se acepta tras entrar con Google).
    const ok = row ? igualTxt(await hashClave(clave, row.salt), row.hash) : sujeto === 'admin' && exigePuerta(env) && igualTxt(clave, '1111');
    if (!ident || !ok) { await anotar(env, 'clave', ident?.nombre || sujeto, false, 'clave incorrecta', req); fail(403, 'Clave incorrecta') }
    await cerrarPrevia(req, env);
    const cookie = await abrirSesion(env, { via: 'clave', sujeto, cv: row ? row.v : 0 });
    await anotar(env, 'clave', ident.nombre, true, ident.rol, req);
    return json(ident, 200, { 'Set-Cookie': cookie });
  }
  if (path === '/auth/huella/reto' && m === 'GET') {
    await limitar(env, 'hr:' + ipDe(req), 60, 15 * 60e3); await exigirPuerta(req, env, await datos(env));
    return json({ challenge: await nuevoReto(env, 'get'), rpId: new URL(req.url).hostname });
  }
  if (path === '/auth/huella' && m === 'POST') {
    await limitar(env, 'h:' + ipDe(req), 30, 15 * 60e3);
    const b = await body(), cred = b.credential, u = new URL(req.url);
    if (!await gastarReto(env, b.challenge, 'get')) { await anotar(env, 'huella', '', false, 'reto vencido o repetido', req); fail(400, 'La verificación venció. Inténtalo otra vez.') }
    const g = await env.DB.prepare('SELECT * FROM passkeys WHERE id = ?').bind(str(cred?.id, 600)).first(), d = await datos(env), ident = g && porSujeto(g.sujeto, d);
    if (g) await exigirPuerta(req, env, d, g.sujeto);
    if (!g || !ident) { await anotar(env, 'huella', '', false, 'huella no registrada', req); fail(403, 'Esta huella no está registrada. Pide al administrador que la active.') }
    let cnt; try { cnt = await verificarAfirmacion(cred, g, b.challenge, u.hostname, u.origin) } catch (e) { await anotar(env, 'huella', ident.nombre, false, e.message, req); fail(403, 'No se pudo verificar la huella') }
    await env.DB.prepare('UPDATE passkeys SET cnt = ? WHERE id = ?').bind(cnt, g.id).run();
    await cerrarPrevia(req, env);
    const cookie = await abrirSesion(env, { via: 'huella', sujeto: g.sujeto, cid: g.id });
    await anotar(env, 'huella', ident.nombre, true, ident.rol, req);
    return json(ident, 200, { 'Set-Cookie': cookie });
  }
  // La huella se activa con una invitación que crea el administrador (código de un solo uso, vale 24 h).
  if (path === '/passkey/opciones' && m === 'POST') {
    await limitar(env, 'pk:' + ipDe(req), 20, 15 * 60e3);
    const b = await body(), inv = await env.DB.prepare('SELECT * FROM invitaciones WHERE h = ? AND exp > ?').bind(await hashInv(b.codigo), Date.now()).first();
    if (!inv) fail(404, 'Este link ya no sirve. Pide uno nuevo al administrador.');
    const d = await datos(env), ident = porSujeto(inv.sujeto, d); if (!ident) fail(404, 'Esta persona ya no está activa.');
    const ex = await env.DB.prepare('SELECT id FROM passkeys WHERE sujeto = ?').bind(inv.sujeto).all(), u = new URL(req.url);
    return json({ nombre: ident.nombre, publicKey: { challenge: await nuevoReto(env, 'create', inv.sujeto), rp: { id: u.hostname, name: d.cfg.nombre || 'Barbería' }, user: { id: b64uEnc(new TextEncoder().encode(inv.sujeto)), name: ident.nombre, displayName: ident.nombre }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' }, timeout: 60000, attestation: 'none', excludeCredentials: ex.results.map(x => ({ type: 'public-key', id: x.id })) } });
  }
  if (path === '/passkey/registrar' && m === 'POST') {
    await limitar(env, 'pk:' + ipDe(req), 20, 15 * 60e3);
    const b = await body(), h = await hashInv(b.codigo), inv = await env.DB.prepare('SELECT * FROM invitaciones WHERE h = ? AND exp > ?').bind(h, Date.now()).first();
    if (!inv) fail(404, 'Este link ya no sirve. Pide uno nuevo al administrador.');
    const reto = await gastarReto(env, b.challenge, 'create'); if (!reto || reto.sujeto !== inv.sujeto) fail(400, 'La verificación venció. Abre el link otra vez.');
    const d = await datos(env), ident = porSujeto(inv.sujeto, d); if (!ident) fail(404, 'Esta persona ya no está activa.');
    const u = new URL(req.url); let k; try { k = await verificarAtestacion(b.credential, b.challenge, u.hostname, u.origin) } catch (e) { fail(400, 'No se pudo activar la huella: ' + e.message) }
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE sujeto = ?').bind(inv.sujeto).first(); if (n.n >= 5) fail(409, 'Ya tiene 5 dispositivos. Pide al administrador que quite alguno.');
    await env.DB.batch([env.DB.prepare('INSERT INTO passkeys(id, sujeto, jwk, alg, cnt, etiqueta, creada) VALUES(?,?,?,?,?,?,?)').bind(k.id, inv.sujeto, JSON.stringify(k.jwk), k.alg, k.cnt, str(b.etiqueta, 60) || 'Celular', Date.now()), env.DB.prepare('DELETE FROM invitaciones WHERE h = ?').bind(h)]);
    await anotar(env, 'huella', ident.nombre, true, 'huella activada', req);
    return json({ ok: true, nombre: ident.nombre }, 200, exigePuerta(env) ? { 'Set-Cookie': await abrirPuerta(env, { sujeto: inv.sujeto }, 90 * 864e5) } : {});
  }
  if (path === '/auth/nonce' && m === 'GET') {
    if (!env.GOOGLE_CLIENT_ID) fail(400, 'Falta configurar GOOGLE_CLIENT_ID en Cloudflare');
    await limitar(env, 'n:' + ipDe(req), 60, 15 * 60e3);
    return json({ nonce: await nuevoNonce(env) });
  }
  if (path === '/auth/google' && m === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) fail(400, 'Falta configurar GOOGLE_CLIENT_ID en Cloudflare');
    await limitar(env, 'g:' + ipDe(req), 20, 15 * 60e3);
    let g;
    try { g = await verificarGoogle((await body()).credential, env.GOOGLE_CLIENT_ID, env) }
    catch (e) { await anotar(env, 'google', '', false, e.message, req); throw e }
    if (!await gastarNonce(env, g.nonce)) { await anotar(env, 'google', g.email, false, 'nonce inválido o repetido', req); fail(400, 'La verificación venció. Recarga la página e inténtalo otra vez.') }
    const d = await datos(env), ident = porEmail(g.email, d, env);
    if (!ident) { await anotar(env, 'google', g.email, false, 'correo no autorizado', req); fail(403, `El correo ${norm(g.email)} no está autorizado. Pide al dueño que lo agregue en ⚙️ Config.`) }
    const cookie = await abrirPuerta(env, { email: norm(g.email) });
    await anotar(env, 'google', g.email, true, 'dispositivo autorizado', req);
    return json({ puerta: true, email: norm(g.email) }, 200, { 'Set-Cookie': cookie });
  }
  if (path === '/auth/login' && m === 'POST') {
    if (!pinPermitido(env)) fail(403, 'El acceso con PIN está desactivado. Entra con Google.');
    await limitar(env, 'p:' + ipDe(req), 8, 15 * 60e3);
    const pin = str((await body()).pin, 8);
    const d = await datos(env), r = pinValido(pin) ? porPin(pin, d) : null;
    if (!r) { await anotar(env, 'pin', '', false, 'PIN incorrecto', req); fail(403, 'PIN incorrecto') }
    const cookie = await abrirSesion(env, { via: 'pin', ref: r.ref, pinH: await sha256(pin), ident: r.ident });
    await anotar(env, 'pin', r.ident.nombre, true, r.ident.rol, req);
    return json(r.ident, 200, { 'Set-Cookie': cookie });
  }
  if (path === '/auth/logout' && m === 'POST') {
    const t = cookieDe(req); if (t) await env.DB.prepare('DELETE FROM sesiones WHERE id = ?').bind(await sha256(t)).run();
    const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); h.append('Set-Cookie', setCookie('', 0)); h.append('Set-Cookie', `brb_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
  }

}

/* Administración de accesos (solo el dueño): claves, invitaciones de huella, registro de ingresos. */
export async function rutasAcceso(c) {
  const { req, env, path, m, body, d, s, exigir, propia } = c;
  let x;
  if (path === '/acceso' && m === 'GET') {
    exigir('config');
    const [c, h] = await Promise.all([env.DB.prepare('SELECT sujeto FROM claves').all(), env.DB.prepare('SELECT id, sujeto, etiqueta, creada FROM passkeys ORDER BY creada').all()]);
    return json({ claves: c.results.map(x => x.sujeto), huellas: h.results });
  }
  if ((x = path.match(/^\/acceso\/(admin|[bu]_[\w-]+)\/clave$/)) && (m === 'PUT' || m === 'DELETE')) {
    exigir('config'); const ident = porSujeto(x[1], d); if (!ident) fail(404, 'Esa persona todavía no existe: toca «Guardar configuración» primero.');
    if (m === 'DELETE') { await env.DB.prepare('DELETE FROM claves WHERE sujeto = ?').bind(x[1]).run(); await anotar(env, 'clave', ident.nombre, true, 'clave quitada por ' + s.nombre, req); return json({ ok: true }) }
    const clave = String((await body()).clave || '');
    const minimo = x[1] === 'admin' ? 4 : 6; if (clave.length < minimo || clave.length > 64) fail(400, `La clave debe tener entre ${minimo} y 64 caracteres`);
    if (/^(.)\1+$/.test(clave) || CLAVES_FLOJAS.includes(clave.toLowerCase())) fail(400, 'Esa clave es muy fácil de adivinar. Usa otra.');
    const salt = rnd(16);
    await env.DB.prepare('INSERT INTO claves(sujeto, salt, hash, v, upd) VALUES(?, ?, ?, 1, ?) ON CONFLICT(sujeto) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, v = claves.v + 1, upd = excluded.upd').bind(x[1], salt, await hashClave(clave, salt), Date.now()).run();
    await anotar(env, 'clave', ident.nombre, true, 'clave cambiada por ' + s.nombre, req);
    await auditar(env, quienEs(s), 'Cambió clave', ident.nombre);
    return json({ ok: true });
  }
  if ((x = path.match(/^\/acceso\/(admin|[bu]_[\w-]+)\/invitacion$/)) && m === 'POST') {
    exigir('config'); const ident = porSujeto(x[1], d); if (!ident) fail(404, 'Esa persona todavía no existe: toca «Guardar configuración» primero.');
    await auditar(env, quienEs(s), 'Invitó a activar huella', ident.nombre);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE sujeto = ?').bind(x[1]).first(); if (n.n >= 5) fail(409, 'Ya tiene 5 dispositivos. Quita alguno primero.');
    const codigo = codigoInv(), vence = Date.now() + 864e5;
    await env.DB.prepare('INSERT INTO invitaciones(h, sujeto, exp) VALUES(?, ?, ?)').bind(await hashInv(codigo), x[1], vence).run();
    return json({ codigo, vence });
  }
  if ((x = path.match(/^\/acceso\/huella\/([\w-]+)$/)) && m === 'DELETE') {
    exigir('config'); await env.DB.prepare('DELETE FROM passkeys WHERE id = ?').bind(x[1]).run(); return json({ ok: true });
  }
  if (path === '/accesos' && m === 'GET') {
    exigir('config');
    const r = await env.DB.prepare('SELECT ts, via, quien, ok, motivo, ip FROM accesos ORDER BY id DESC LIMIT 100').all();
    return json(r.results);
  }
}
