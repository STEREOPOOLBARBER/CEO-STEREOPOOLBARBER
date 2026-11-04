import { DEF, ahoraLocal, fail, json } from '../comun.js';
import { datos } from '../datos.js';
import { anotarSeg, frenar } from './seguridad.js';

/* ---------- consulta de DNI (RENIEC vía Shalom API) ---------- */
// La clave vive como secreto del Worker (SHALOM_API_KEY); el navegador nunca la ve. Solo se devuelve el nombre.
export const titulo = t => String(t || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\s+/g, ' ').trim();
export function nombreDeReniec(j) {
  const o = j?.data && typeof j.data === 'object' ? j.data : j?.result && typeof j.result === 'object' ? j.result : j || {};
  const k = {}; for (const [a, v] of Object.entries(o)) if (typeof v === 'string') k[a.toLowerCase().replace(/[^a-z]/g, '')] = v;
  const completo = k.nombrecompleto || k.fullname || k.nombrescompletos;
  if (completo) return titulo(completo);
  const nombres = k.nombres || k.nombre || k.prenombres || k.firstname || '';
  const ap = k.apellidopaterno || k.appaterno || k.paterno || k.apellidop || '', am = k.apellidomaterno || k.apmaterno || k.materno || k.apellidom || k.apellidos || '';
  return titulo(`${nombres} ${ap} ${am}`);
}
export async function consultarDni(env, dni, crudo = false) {
  if (!env.SHALOM_API_KEY) fail(503, 'La consulta de DNI no está configurada (falta el secreto SHALOM_API_KEY).');
  if (!crudo) { const c = await env.DB.prepare('SELECT nombre FROM dnis WHERE dni = ? AND ts > ?').bind(dni, Date.now() - 30 * 864e5).first(); if (c) return { nombre: c.nombre } }
  const d0 = await datos(env); await sumarDni(env, +({ ...DEF, ...d0.cfg }).dniTopeDia || 0);
  let r; try { r = await fetch(`${env.DNI_API_URL || 'https://api.shalom-api.lat'}/account/dni/${dni}`, { headers: { 'x-api-key': env.SHALOM_API_KEY }, signal: AbortSignal.timeout(8000) }) } catch { fail(502, 'No se pudo consultar el DNI ahora. Escribe el nombre a mano.') }
  if (r.status === 404) fail(404, 'No encontramos ese DNI');
  if (r.status === 401 || r.status === 403) { console.error('Shalom API: clave rechazada'); fail(502, 'La consulta de DNI no está disponible') }
  if (r.status === 429) fail(429, 'Muchas consultas, espera un momento');
  if (!r.ok) fail(502, 'No se pudo consultar el DNI ahora. Escribe el nombre a mano.');
  const j = await r.json().catch(() => ({}));
  if (crudo) return { crudo: j, nombre: nombreDeReniec(j) };
  const nombre = nombreDeReniec(j); if (!nombre) fail(404, 'No encontramos ese DNI');
  await env.DB.prepare('INSERT INTO dnis(dni, nombre, ts) VALUES(?, ?, ?) ON CONFLICT(dni) DO UPDATE SET nombre = excluded.nombre, ts = excluded.ts').bind(dni, nombre, Date.now()).run();
  return { nombre };
}

// Tope diario de consultas a RENIEC para no gastar el saldo de Shalom (configurable en ⚙️ Config → Seguridad).
export async function sumarDni(env, tope) {
  const k = 'dni:' + ahoraLocal(env).fecha;
  const r = await env.DB.prepare('INSERT INTO contadores(k, n) VALUES(?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n').bind(k).first();
  if (tope > 0 && r.n > tope) { await anotarSeg(env, 'tope_dni'); fail(429, 'Hoy ya se usaron todas las consultas de DNI. Escribe tu nombre a mano.') }
}


/* Consulta de DNI desde el panel (con sesión). */
export async function rutasDni(c) {
  const { req, env, path, m, body, d, s, exigir, propia } = c;
  let x;
  if ((x = path.match(/^\/dni\/(\d{8})$/)) && m === 'GET') {
    await frenar(env, 'RL_DNI', 'p:' + (s.email || s.sujeto || s.nombre), [30, 60e3]);
    // Con ?crudo=1 el dueño ve la respuesta completa del servicio para comprobar los campos.
    if (new URL(req.url).searchParams.get('crudo') === '1') { exigir('config'); const u = await env.DB.prepare('SELECT n FROM contadores WHERE k = ?').bind('dni:' + ahoraLocal(env).fecha).first(); return json({ ...(await consultarDni(env, x[1], true)), usoHoy: (u?.n || 0) + 1, tope: +({ ...DEF, ...d.cfg }).dniTopeDia || 0 }) }
    return json(await consultarDni(env, x[1]));
  }
}
