/* =====================================================================
   AVISOS AL CELULAR (Web Push estándar, sin librerías ni servicios de terceros).
   · Firma VAPID (ES256) y cifrado del mensaje (RFC 8291, aes128gcm) con WebCrypto.
   · Claves: secreto VAPID_PRIVADA (JWK) o, si no está, se crean solas y se guardan en kv 'vapid'.
   · Cliente (tipo 'cita'): se suscribe desde /cita/CODIGO. El cron le avisa: confirmada, cambio de fecha u hora,
     recordatorio del día anterior y 2 h antes, y «¿cómo te atendimos?». Una sola vez cada uno (suscripciones.estado).
   · Equipo (tipo 'panel'): nueva reserva, comprobante de Yape, confirmó que viene, reprogramó. Cada persona solo
     lo que le toca (el barbero, sus citas). Nunca celular ni DNI en el aviso.
   · Si el servicio de avisos responde 404/410 (el celular la quitó), la suscripción se borra.
   ===================================================================== */
import { ACTIVOS, addD, ahoraLocal, fail, json, minutosHasta, sha256, toMin } from '../comun.js';
import { datos, filaCita } from '../datos.js';
import { permisos, pinPermitido } from './auth.js';
import { yaCalificada } from './calificaciones.js';

/* ---------- utilidades ---------- */
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const txt = s => new TextEncoder().encode(s);
const une = (...a) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { r.set(x, i); i += x.length } return r };
const hmac = async (clave, dato) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', clave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), dato));

/* ---------- claves VAPID ---------- */
let VAPID = null;
async function claves(env) {
  if (VAPID) return VAPID;
  let k = env.VAPID_PRIVADA ? JSON.parse(env.VAPID_PRIVADA) : null;
  if (!k) {
    const leer = async () => { const r = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first(); return r ? JSON.parse(r.v) : null };
    k = await leer();
    if (!k) {
      const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const j = await crypto.subtle.exportKey('jwk', par.privateKey);
      await env.DB.prepare("INSERT OR IGNORE INTO kv(k, v) VALUES('vapid', ?)").bind(JSON.stringify({ kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d })).run();
      k = await leer(); // si dos peticiones la crearon a la vez, gana la primera
    }
  }
  const priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: k.x, y: k.y, d: k.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return VAPID = { priv, pub: b64u(une(new Uint8Array([4]), deB64u(k.x), deB64u(k.y))) };
}
export const clavePublica = async env => (await claves(env)).pub;

async function jwt(env, aud, sub) {
  const { priv } = await claves(env), parte = o => b64u(txt(JSON.stringify(o)));
  const cuerpo = parte({ typ: 'JWT', alg: 'ES256' }) + '.' + parte({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub });
  return cuerpo + '.' + b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, txt(cuerpo)));
}

/* ---------- cifrado del mensaje (RFC 8291) ---------- */
export async function cifrarPush(p256dh, auth, texto) {
  const ua = deB64u(p256dh), secreto = deB64u(auth);
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, par.privateKey, 256));
  const ikm = await hmac(await hmac(secreto, ecdh), une(txt('WebPush: info\0'), ua, as, new Uint8Array([1])));
  const sal = crypto.getRandomValues(new Uint8Array(16)), prk = await hmac(sal, ikm);
  const cek = (await hmac(prk, une(txt('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, une(txt('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cif = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, une(txt(texto), new Uint8Array([2]))));
  const cab = new Uint8Array(21); cab.set(sal); new DataView(cab.buffer).setUint32(16, 4096); cab[20] = 65;
  return une(cab, as, cif);
}

/* Solo los servicios de avisos de los navegadores (evita que alguien use el Worker para llamar a otras direcciones). */
const SERVICIOS = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
function endpointOk(env, u) {
  try { const x = new URL(u); if (env.PUSH_PERMITIR_LOCAL === 'true' && pinPermitido(env) && x.hostname === '127.0.0.1') return true; return x.protocol === 'https:' && !x.port && SERVICIOS.test(x.hostname) } catch { return false }
}
function leerSuscripcion(env, b) {
  const endpoint = String(b?.endpoint || ''), p256dh = String(b?.keys?.p256dh || ''), auth = String(b?.keys?.auth || '');
  if (endpoint.length > 1000 || !endpointOk(env, endpoint)) fail(400, 'Este navegador no es compatible con los avisos');
  let ok = false; try { const u = deB64u(p256dh), a = deB64u(auth); ok = u.length === 65 && u[0] === 4 && a.length === 16 } catch { }
  if (!ok) fail(400, 'Suscripción no válida');
  return { endpoint, p256dh, auth };
}

/* Envía un aviso {t: título, b: texto, u: link, tag}. Devuelve true si el servicio lo aceptó. */
export async function enviarPush(env, sub, msg) {
  try {
    const u = new URL(sub.endpoint), { pub } = await claves(env);
    const r = await fetch(sub.endpoint, {
      method: 'POST', body: await cifrarPush(sub.p256dh, sub.auth, JSON.stringify(msg)),
      headers: { Authorization: `vapid t=${await jwt(env, u.origin, sub.origen)}, k=${pub}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(msg.ttl || 6 * 3600), Urgency: msg.urgente ? 'high' : 'normal' },
    });
    if (r.status === 404 || r.status === 410) { await env.DB.prepare('DELETE FROM suscripciones WHERE id = ?').bind(sub.id).run(); return false }
    if (!r.ok) console.error('push', r.status, (await r.text().catch(() => '')).slice(0, 200));
    return r.ok;
  } catch (e) { console.error('push', e.message); return false }
}

async function guardarSuscripcion(env, req, s, tipo, ref, pu, estado) {
  const id = await sha256(tipo + '|' + ref + '|' + s.endpoint), origen = new URL(req.url).origin;
  await env.DB.prepare(`INSERT INTO suscripciones(id, endpoint, p256dh, auth, tipo, ref, pu, origen, estado, creado) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, pu = excluded.pu, origen = excluded.origen`).bind(id, s.endpoint, s.p256dh, s.auth, tipo, ref, pu, origen, JSON.stringify(estado), Date.now()).run();
  return id;
}

/* ---------- textos ---------- */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const h12 = h => { const [H, M] = String(h || '00:00').split(':').map(Number); return `${H % 12 || 12}:${String(M).padStart(2, '0')} ${H < 12 ? 'a. m.' : 'p. m.'}` };
function cuando(env, f, h) {
  const hoy = ahoraLocal(env).fecha, d = new Date(f + 'T12:00:00Z');
  const dia = f === hoy ? 'hoy' : f === addD(hoy, 1) ? 'mañana' : `el ${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return `${dia} a las ${h12(h)}`;
}
const primerNombre = c => String(c.cliente?.nombre || 'Cliente').split(' ')[0];

/* ---------- equipo: a quién le toca cada aviso ---------- */
const PARA = {
  reserva: { t: 'Nueva reserva', b: (env, c, d) => `${c.cliente?.nombre || 'Cliente'} · ${cuando(env, c.fecha, c.hora)} · ${c.servicioNombre || ''}${barb(d, c)}` },
  yape: { t: 'Llegó un comprobante de Yape', b: (env, c, d) => `${c.cliente?.nombre || 'Cliente'} · ${cuando(env, c.fecha, c.hora)}${barb(d, c)}. Revísalo para confirmar la cita.`, permiso: 'yape' },
  asistencia: { t: 'Confirmó que viene', b: (env, c, d) => `${c.cliente?.nombre || 'Cliente'} · ${cuando(env, c.fecha, c.hora)}${barb(d, c)}` },
  reprog: { t: 'Cita reprogramada', b: (env, c, d) => `${c.cliente?.nombre || 'Cliente'} la pasó a ${cuando(env, c.fecha, c.hora)}${barb(d, c)}` },
};
const barb = (d, c) => { const b = d.barberos.find(x => x.id === c.barberoId); return b ? ` · con ${b.nombre}` : '' };
export async function avisarEquipo(env, c, tipo) {
  try {
    const d = await datos(env), def = PARA[tipo]; if (!def || !c) return 0;
    const ids = d.equipo.filter(p => {
      if (p.activo === false) return false;
      const perm = permisos({ pid: p.id }, d) || {}, todas = p.rol === 'dueno' || perm.verTodas;
      return (todas || p.id === c.barberoId) && (!def.permiso || p.rol === 'dueno' || perm[def.permiso]);
    }).map(p => p.id);
    if (!ids.length) return 0;
    // Solo aparatos que siguen autorizados (si el dueño quitó el aparato o venció su puerta, ya no reciben).
    const r = await env.DB.prepare(`SELECT s.* FROM suscripciones s LEFT JOIN sesiones a ON a.id = s.pu WHERE s.tipo = 'panel' AND s.ref IN (${ids.map(() => '?').join(',')}) AND (s.pu = '' OR a.exp > ?)`).bind(...ids, Date.now()).all();
    const msg = { t: def.t, b: def.b(env, c, d), u: '/', tag: tipo + '-' + c.codigo, urgente: tipo !== 'asistencia' };
    let n = 0; for (const s of r.results) if (await enviarPush(env, s, msg)) n++;
    return n;
  } catch (e) { console.error('avisarEquipo', e.message); return 0 }
}

/* ---------- cliente: el cron compara la cita con lo último avisado ---------- */
const AVISO_CLIENTE = {
  confirmada: (env, c, d) => `Tu cita está confirmada: ${cuando(env, c.fecha, c.hora)}${barb(d, c)}. Te esperamos.`,
  cambio: (env, c, d) => `Tu cita cambió: ahora es ${cuando(env, c.fecha, c.hora)}${barb(d, c)}.`,
  dia: (env, c, d) => `${primerNombre(c)}, te recordamos tu cita ${cuando(env, c.fecha, c.hora)}${barb(d, c)}.`,
  horas2: (env, c, d) => `Tu cita es ${cuando(env, c.fecha, c.hora)}${barb(d, c)}. Te esperamos.`,
  calificar: () => 'Gracias por venir. ¿Cómo te atendimos? Califícanos en 10 segundos, es anónimo.',
};
const base = c => ({ e: c.estado, f: c.fecha, h: c.hora, hechos: [] });
export async function pushAuto(env) {
  const ahora = ahoraLocal(env), hoy = ahora.fecha, horaDia = toMin(env.PUSH_HORA_DIA || '18:00') ?? 18 * 60;
  // Limpieza: citas borradas, anonimizadas o de hace más de 7 días ya no reciben avisos.
  await env.DB.prepare(`DELETE FROM suscripciones WHERE tipo = 'cita' AND ref NOT IN (SELECT id FROM citas WHERE fecha >= ? AND tel <> '')`).bind(addD(hoy, -7)).run();
  const r = await env.DB.prepare(`SELECT s.*, c.codigo, c.fecha, c.hora, c.barbero_id, c.estado AS cest, c.expira, c.creada, c.data FROM suscripciones s JOIN citas c ON c.id = s.ref WHERE s.tipo = 'cita' LIMIT 300`).all();
  if (!r.results.length) return { enviados: 0 };
  const d = await datos(env), negocio = d.cfg.nombre || 'Tu barbería', cambios = []; let enviados = 0;
  for (const x of r.results) {
    const c = filaCita({ ...x, id: x.ref, estado: x.cest }); let st; try { st = { ...base(c), ...JSON.parse(x.estado) } } catch { st = base(c) }
    const hechos = new Set(st.hechos || []), avisos = [];
    if (c.estado === 'confirmada' && st.e === 'por_validar') avisos.push('confirmada');
    if ((c.fecha !== st.f || c.hora !== st.h) && ACTIVOS.includes(c.estado)) avisos.push('cambio');
    if (c.estado === 'atendida' && st.e !== 'atendida' && !await yaCalificada(env, c)) avisos.push('calificar');
    const falta = minutosHasta(env, c.fecha, c.hora), k2 = 'h2:' + c.fecha + c.hora, kd = 'dia:' + c.fecha;
    if (c.estado === 'confirmada') {
      if (falta > 0 && falta <= 120 && !hechos.has(k2)) avisos.push('horas2');
      else if (c.fecha === addD(hoy, 1) && ahora.min >= horaDia && !hechos.has(kd)) avisos.push('dia');
    }
    // Un solo aviso por vuelta (el más importante; el resto sale en la siguiente). En el celular cada aviso de la cita reemplaza al anterior.
    const tipo = ['calificar', 'cambio', 'horas2', 'confirmada', 'dia'].find(t => avisos.includes(t));
    if (tipo === 'horas2') { hechos.add(k2); hechos.add(kd) } else if (tipo === 'dia') hechos.add(kd);
    if (tipo && await enviarPush(env, x, { t: negocio, b: AVISO_CLIENTE[tipo](env, c, d), u: '/cita/' + c.codigo, tag: 'cita-' + c.codigo, urgente: tipo === 'horas2' })) enviados++;
    // Lo ya avisado: si quedó pendiente otro aviso (p. ej. el recordatorio tras un cambio), la próxima vuelta lo manda.
    const visto = { e: tipo === 'confirmada' || !avisos.includes('confirmada') ? c.estado : st.e, f: tipo === 'cambio' || !avisos.includes('cambio') ? c.fecha : st.f, h: tipo === 'cambio' || !avisos.includes('cambio') ? c.hora : st.h };
    if (tipo === 'calificar') visto.e = c.estado;
    const nuevo = JSON.stringify({ ...visto, hechos: [...hechos].slice(-10) });
    if (nuevo !== x.estado) cambios.push(env.DB.prepare('UPDATE suscripciones SET estado = ? WHERE id = ?').bind(nuevo, x.id));
  }
  if (cambios.length) await env.DB.batch(cambios);
  return { enviados };
}
/* Cuando el propio cliente cambia su cita, no hace falta avisarle a él del cambio. */
export const pushBaseCita = (env, c) => env.DB.prepare("UPDATE suscripciones SET estado = json_set(estado, '$.f', ?, '$.h', ?, '$.e', ?) WHERE tipo = 'cita' AND ref = ?").bind(c.fecha, c.hora, c.estado, c.id).run();

/* ---------- rutas ---------- */
export async function rutasPushPublicas(c) {
  const { req, env, path, m, body } = c; let x;
  if (path === '/publico/push/clave' && m === 'GET') return json({ clave: await clavePublica(env) });
  if ((x = path.match(/^\/publico\/cita\/([A-Za-z0-9]{6})\/push$/)) && (m === 'POST' || m === 'DELETE')) {
    const fila = await env.DB.prepare('SELECT * FROM citas WHERE codigo = ?').bind(x[1].toUpperCase()).first(); if (!fila) fail(404, 'Cita no encontrada');
    const cita = filaCita(fila), s = leerSuscripcion(env, await body());
    if (m === 'DELETE') { await env.DB.prepare("DELETE FROM suscripciones WHERE id = ?").bind(await sha256('cita|' + cita.id + '|' + s.endpoint)).run(); return json({ ok: true }) }
    if (!['por_validar', 'confirmada', 'en_silla'].includes(cita.estado)) fail(400, 'Esta cita ya no recibe avisos');
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM suscripciones WHERE tipo = 'cita' AND ref = ? AND endpoint <> ?").bind(cita.id, s.endpoint).first();
    if (n.n >= 5) fail(400, 'Esta cita ya tiene avisos en 5 celulares');
    await guardarSuscripcion(env, req, s, 'cita', cita.id, '', base(cita));
    return json({ ok: true });
  }
}
export async function rutasPush(c) {
  const { req, env, path, m, body, s } = c;
  if (path === '/push/clave' && m === 'GET') return json({ clave: await clavePublica(env) });
  if (path === '/push' && (m === 'POST' || m === 'DELETE')) {
    const sub = leerSuscripcion(env, await body());
    // Un aparato avisa a una sola persona: si otra activa aquí sus avisos, la anterior deja de recibirlos.
    await env.DB.prepare("DELETE FROM suscripciones WHERE tipo = 'panel' AND endpoint = ?").bind(sub.endpoint).run();
    if (m === 'POST') await guardarSuscripcion(env, req, sub, 'panel', s.pid, s.pu || '', {});
    return json({ ok: true });
  }
  if (path === '/push/probar' && m === 'POST') {
    const r = await env.DB.prepare("SELECT * FROM suscripciones WHERE tipo = 'panel' AND ref = ?").bind(s.pid).all();
    let n = 0; for (const x of r.results) if (await enviarPush(env, x, { t: 'Avisos activados', b: `Hola ${s.nombre}, así te llegarán las reservas nuevas.`, u: '/', tag: 'prueba', urgente: true })) n++;
    return json({ enviados: n, aparatos: r.results.length });
  }
}
