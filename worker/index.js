/* =====================================================================
   STEREO BARBER POOL · API en Cloudflare Workers
   - D1  (env.DB)    : configuración, barberos, servicios, usuarios,
                       citas, links y sesiones.
   - R2  (env.FOTOS) : fotos (logo, barberos, servicios, cortes, Yape).
   - Login del personal SOLO con Google (verificado aquí, con nonce de un solo uso).
     Sesión en cookie HttpOnly. Registro de accesos.
   - El navegador nunca decide: horarios, precios, permisos y Turnstile
     se validan aquí.

   Variables (Cloudflare → Worker → Settings → Variables and Secrets):
     OWNER_EMAILS       correos de Google de los dueños, separados por coma
     GOOGLE_CLIENT_ID   ID de cliente OAuth (termina en .apps.googleusercontent.com)
     ALLOW_PIN          "true" enciende el acceso con PIN (apagado por defecto; solo para pruebas)
     TURNSTILE_SITEKEY  clave pública de Turnstile (opcional)
     TURNSTILE_SECRET   clave secreta de Turnstile (tipo Secret, opcional)
     TZ                 zona horaria del local (por defecto America/Lima)
   ===================================================================== */

import { DEF, HttpError, addD, ahoraLocal, fail, json } from './comun.js';
import { asegurarSchema, datos, expirar, sembrar } from './datos.js';
import { rutasAcceso, rutasAuth, sesion } from './modulos/auth.js';
import { rutasCitas } from './modulos/citas.js';
import { retencion, rutasClientes } from './modulos/clientes.js';
import { rutasWhatsapp, rutasWhatsappPublicas, whatsappAuto } from './modulos/whatsapp.js';
import { reporteSemanal, rutasReportes } from './modulos/reportes.js';
import { rutasCalificacionPublica, rutasCalificaciones } from './modulos/calificaciones.js';
import { rutasConfig } from './modulos/config.js';
import { rutasDni } from './modulos/dni.js';
import { rutasMonitoreo } from './modulos/monitoreo.js';
import { rutasPublicas } from './modulos/publico.js';
import { respaldoDiario } from './modulos/respaldos.js';
import { frenar, ipDe } from './modulos/seguridad.js';
import { conVistaPrevia } from './vista-previa.js';
import { avisar, rutasTiempoReal, versionActual } from './modulos/tiempo-real.js';
export { Avisos } from './modulos/tiempo-real.js';

/* ---------- rutas: cada módulo atiende las suyas; si ninguno responde → 404 ---------- */
async function api(req, env, path) {
  const m = req.method;
  const body = async () => { try { return await req.json() } catch { fail(400, 'Datos no válidos') } };

  if (/^\/(publico|auth|passkey)\b/.test(path)) await frenar(env, 'RL_PUB', ipDe(req));
  if (m !== 'GET' && m !== 'HEAD') {
    const o = req.headers.get('Origin');
    let ok = true; try { ok = !o || new URL(o).host === new URL(req.url).host } catch { ok = false }
    if (!ok) fail(403, 'Origen no permitido');
  }
  await asegurarSchema(env);
  await sembrar(env);

  const c = { req, env, path, m, body };
  for (const r of [rutasPublicas, rutasCalificacionPublica, rutasWhatsappPublicas, rutasAuth]) { const res = await r(c); if (res) return res }

  /* ----- panel (requiere sesión) ----- */
  const d = await datos(env);
  const s = await sesion(req, env, d);
  if (!s) fail(401, 'Tu sesión terminó. Vuelve a entrar.');
  const exigir = p => { if (!s.perm[p]) fail(403, 'No tienes permiso para esto') };
  const propia = c => { if (!s.perm.verTodas && c.barberoId !== s.barberoId) fail(403, 'No es tu cita') };

  Object.assign(c, { d, s, exigir, propia });
  for (const r of [rutasTiempoReal, rutasWhatsapp, rutasReportes, rutasCalificaciones, rutasDni, rutasAcceso, rutasMonitoreo, rutasClientes, rutasCitas, rutasConfig]) { const res = await r(c); if (res) return res }
  fail(404, 'Ruta no encontrada');
}

/* ---------- entrada ---------- */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return conVistaPrevia(req, env, url);
    if (!env.DB) return json({ error: 'Falta conectar la base de datos (D1). En Cloudflare: Settings → Bindings → agrega D1 con el nombre DB.' }, 503);
    try {
      const path = url.pathname.slice(4), res = await api(req, env, path);
      // Tiempo real: si algo se guardó con éxito, avisar a los paneles abiertos (sin datos; ellos vuelven a pedir lo suyo).
      if (req.method !== 'GET' && req.method !== 'HEAD' && res.ok && !/^\/(auth|passkey)\b|^\/publico\/ficha$/.test(path)) ctx.waitUntil(avisar(env));
      return res;
    }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Error del servidor, inténtalo de nuevo' }, 500);
    }
  },
  async scheduled(_ev, env) {
    await asegurarSchema(env);
    const v0 = await versionActual(env);
    await expirar(env);
    if (await versionActual(env) !== v0) await avisar(env); // una reserva venció sin Yape: los paneles se enteran al toque
    try { await respaldoDiario(env) } catch (e) { console.error('respaldo', e) }
    try { if (await reporteSemanal(env)) await avisar(env) } catch (e) { console.error('reporte', e) }
    try { const r = await whatsappAuto(env); if (r.enviados) await avisar(env) } catch (e) { console.error('whatsapp', e) }
    try { const r = await retencion(env, { ...DEF, ...(await datos(env)).cfg }); if (r.anonimizados || r.capturas) await avisar(env) } catch (e) { console.error('retención', e) }
    const corte = addD(ahoraLocal(env).fecha, -60);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM contadores WHERE (k LIKE 'seg:%' AND k < ?) OR (k LIKE 'dni:%' AND k < ?)").bind('seg:' + corte, 'dni:' + corte),
      env.DB.prepare('DELETE FROM sesiones WHERE exp < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM intentos WHERE ts < ?').bind(Date.now() - 864e5),
      env.DB.prepare('DELETE FROM nonces WHERE exp < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM retos WHERE exp < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM invitaciones WHERE exp < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM accesos WHERE ts < ?').bind(Date.now() - 90 * 864e5),
      env.DB.prepare('DELETE FROM auditoria WHERE ts < ?').bind(Date.now() - 180 * 864e5),
    ]);
  },
};
