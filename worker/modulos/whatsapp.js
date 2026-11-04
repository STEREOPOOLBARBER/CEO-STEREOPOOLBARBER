import { addD, ahoraLocal, fail, json, rnd, str, toMin } from '../comun.js';
import { bumpStmt, datos, filaCita, kvStmt, leerKV } from '../datos.js';
import { b64uDec, b64uEnc } from '../webauthn.js';
import { auditar, quienEs } from './auth.js';
import { cifrar, descifrar } from './respaldos.js';

/* ---------- WhatsApp automático (API oficial de Meta · WhatsApp Cloud API) ----------
   Listo para conectar un número nuevo desde ⚙️ Config → «🤖 WhatsApp automático».
   - El token y el «App secret» se guardan CIFRADOS (o como secretos WHATSAPP_TOKEN / WHATSAPP_APP_SECRET en Cloudflare).
   - Fuera de la ventana de 24 h, Meta solo permite mensajes con PLANTILLAS aprobadas (categoría «Utilidad»).
   - El webhook recibe el estado de cada mensaje (enviado/entregado/leído) y las respuestas del cliente («sí, voy» confirma). */
const API_META = env => (env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/$/, '');
const DEF_WA = { version: 'v23.0', idioma: 'es', tplRecordatorio: 'recordatorio_cita', tplConfirmacion: 'cita_confirmada', auto: { diaAntes: false, horaDiaAntes: '18:00', dosHoras: false, alConfirmar: false } };
const MASC = t => t ? '••••' + String(t).slice(-4) : '';
async function leerWA(env) { const w = (await leerKV(env, ['whatsappApi'])).whatsappApi || {}; return { ...DEF_WA, ...w, auto: { ...DEF_WA.auto, ...(w.auto || {}) } } }
const guardarWA = (env, w) => env.DB.batch([kvStmt(env, 'whatsappApi', w), bumpStmt(env)]);
const abrir = async (env, c) => c ? descifrar(env, b64uDec(c)) : '';
const cerrar = async (env, t) => b64uEnc(await cifrar(env, t));
async function credenciales(env, w) { return { token: env.WHATSAPP_TOKEN || await abrir(env, w.token_c), secreto: env.WHATSAPP_APP_SECRET || await abrir(env, w.secreto_c) } }
export const telWA = t => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 9) d = '51' + d; return d };

async function meta(env, w, ruta, cuerpo) {
  const { token } = await credenciales(env, w); if (!token || !w.phoneId) fail(400, 'Falta conectar WhatsApp: pon el Phone number ID y el token en ⚙️ Config → WhatsApp automático');
  let r; try { r = await fetch(`${API_META(env)}/${w.version}/${ruta}`, { method: cuerpo ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(10000) }) } catch { fail(502, 'No se pudo conectar con WhatsApp. Inténtalo de nuevo.') }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = j.error || {}; fail(r.status === 401 ? 401 : 502, `WhatsApp respondió: ${e.message || 'error ' + r.status}${e.code ? ' (código ' + e.code + ')' : ''}`) }
  return j;
}
const FECHA_L = f => { const d = new Date(f + 'T12:00:00Z'), D = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; return `${D[d.getUTCDay()]} ${d.getUTCDate()} de ${M[d.getUTCMonth()]}` };
const H12 = h => { let [H, M] = String(h || '0:0').split(':').map(Number); const ap = H >= 12 ? 'p. m.' : 'a. m.'; H = H % 12 || 12; return `${H}:${String(M).padStart(2, '0')} ${ap}` };
const tx = t => ({ type: 'text', text: String(t || '-').slice(0, 300) });

/* Envía la plantilla que toca para una cita y deja constancia (en la cita y en la tabla wa_mensajes). */
export async function enviarPlantilla(env, c, tipo, w, d) {
  w = w || await leerWA(env); d = d || await datos(env);
  const tel = telWA(c.cliente?.tel); if (tel.length < 11) fail(400, 'La cita no tiene un celular válido');
  const hoy = ahoraLocal(env).fecha, b = d.barberos.find(x => x.id === c.barberoId), negocio = d.cfg.nombre || 'la barbería';
  const link = `${w.urlBase || ''}/estado.html?c=${c.codigo}`, fecha = c.fecha === hoy ? 'hoy' : c.fecha === addD(hoy, 1) ? 'mañana ' + FECHA_L(c.fecha) : FECHA_L(c.fecha);
  const plantilla = tipo === 'confirmacion' ? w.tplConfirmacion : w.tplRecordatorio;
  const params = tipo === 'confirmacion' ? [c.cliente?.nombre?.split(' ')[0], negocio, fecha, H12(c.hora), link] : [c.cliente?.nombre?.split(' ')[0], negocio, fecha, H12(c.hora), b?.nombre || 'tu barbero', link];
  const j = await meta(env, w, `${w.phoneId}/messages`, { messaging_product: 'whatsapp', to: tel, type: 'template', template: { name: plantilla, language: { code: w.idioma }, components: [{ type: 'body', parameters: params.map(tx) }] } });
  const id = j.messages?.[0]?.id || '', reg = { ts: Date.now(), id, estado: 'enviado' };
  await env.DB.batch([
    env.DB.prepare('UPDATE citas SET data = json_set(data, ?, json(?)) WHERE id = ?').bind('$.wa.' + tipo, JSON.stringify(reg), c.id),
    env.DB.prepare('INSERT OR REPLACE INTO wa_mensajes(id, cita_id, tipo, ts, estado) VALUES(?, ?, ?, ?, ?)').bind(id || 'sin-id-' + rnd(6), c.id, tipo, Date.now(), 'enviado'),
    bumpStmt(env),
  ]);
  return reg;
}

/* Tarea programada (cada 5 min): recordatorio el día antes, aviso 2 horas antes y confirmación al validar el Yape. */
export async function whatsappAuto(env) {
  const w = await leerWA(env); if (!w.conectado?.ok) return { enviados: 0 };
  const a = w.auto, ahora = ahoraLocal(env), hoy = ahora.fecha, d = await datos(env); let enviados = 0;
  const lote = async (sql, args, tipo) => {
    const r = await env.DB.prepare(sql + ' LIMIT 25').bind(...args).all();
    for (const x of r.results) { try { await enviarPlantilla(env, filaCita(x), tipo, w, d); enviados++ } catch (e) { console.error('wa', tipo, e.message); await env.DB.prepare('UPDATE citas SET data = json_set(data, ?, json(?)) WHERE id = ?').bind('$.wa.' + tipo, JSON.stringify({ ts: Date.now(), estado: 'error', error: String(e.message).slice(0, 160) }), x.id).run() } }
  };
  const sinEnviar = t => `json_extract(data, '$.wa.${t}') IS NULL AND tel <> ''`;
  if (a.diaAntes && ahora.min >= (toMin(a.horaDiaAntes) ?? 18 * 60)) await lote(`SELECT * FROM citas WHERE fecha = ? AND estado = 'confirmada' AND ${sinEnviar('recordatorio')}`, [addD(hoy, 1)], 'recordatorio');
  if (a.dosHoras) {
    const desde = ahora.min + 100, hasta = ahora.min + 135, hh = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (hasta < 24 * 60) await lote(`SELECT * FROM citas WHERE fecha = ? AND hora >= ? AND hora <= ? AND estado = 'confirmada' AND ${sinEnviar('dosHoras')}`, [hoy, hh(desde), hh(hasta)], 'dosHoras');
  }
  if (a.alConfirmar) await lote(`SELECT * FROM citas WHERE fecha >= ? AND estado = 'confirmada' AND creada > ? AND json_extract(data, '$.origen') IN ('web', 'link') AND ${sinEnviar('confirmacion')}`, [hoy, Date.now() - 2 * 864e5], 'confirmacion');
  return { enviados };
}

// «sí», «si», «sip», «claro», «confirmo», «ok», «voy», «ahí estaré», «de acuerdo», «listo», 👍 (sin \b: no funciona con letras con tilde)
const SI = /^\s*(s[ií]+p?|claro|confirm(o|ado)?|ok(a|ey)?|voy|ah[ií] estar[eé]|de acuerdo|listo|👍)(?=$|[\s,.;:!?¡¿👍])/iu;
async function firmaValida(env, w, req, texto) {
  const { secreto } = await credenciales(env, w); if (!secreto) return false;
  const f = (req.headers.get('X-Hub-Signature-256') || '').replace(/^sha256=/, '');
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const h = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto)))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (h.length !== f.length) return false; let r = 0; for (let i = 0; i < h.length; i++) r |= h.charCodeAt(i) ^ f.charCodeAt(i); return r === 0;
}

/* Rutas públicas: el webhook que configura Meta. */
export async function rutasWhatsappPublicas(c) {
  const { req, env, path, m } = c;
  if (path !== '/whatsapp/webhook') return;
  const w = await leerWA(env);
  if (m === 'GET') { // verificación inicial de Meta
    const q = new URL(req.url).searchParams;
    if (q.get('hub.mode') === 'subscribe' && w.verifyToken && q.get('hub.verify_token') === w.verifyToken) return new Response(q.get('hub.challenge') || '', { headers: { 'Content-Type': 'text/plain' } });
    fail(403, 'Token de verificación incorrecto');
  }
  if (m !== 'POST') return;
  const texto = await req.text();
  if (!await firmaValida(env, w, req, texto)) fail(401, 'Firma inválida');
  let j; try { j = JSON.parse(texto) } catch { fail(400, 'JSON inválido') }
  const hoy = ahoraLocal(env).fecha;
  for (const e of j.entry || []) for (const ch of e.changes || []) {
    const v = ch.value || {};
    for (const s of v.statuses || []) { // enviado → entregado → leído (o fallido)
      const mm = await env.DB.prepare('SELECT cita_id, tipo FROM wa_mensajes WHERE id = ?').bind(s.id).first(); if (!mm) continue;
      await env.DB.batch([env.DB.prepare('UPDATE wa_mensajes SET estado = ? WHERE id = ?').bind(s.status, s.id), env.DB.prepare('UPDATE citas SET data = json_set(data, ?, ?) WHERE id = ?').bind('$.wa.' + mm.tipo + '.estado', s.status, mm.cita_id), bumpStmt(env)]);
    }
    for (const msg of v.messages || []) { // respuesta del cliente: «sí», «confirmo», «voy»… confirma su próxima cita
      const t = msg.text?.body || msg.button?.text || ''; if (!SI.test(t)) continue;
      const tel = String(msg.from || '').slice(-9);
      const ci = await env.DB.prepare("SELECT id, codigo FROM citas WHERE tel = ? AND fecha BETWEEN ? AND ? AND estado IN ('confirmada', 'por_validar') AND json_extract(data, '$.asistencia') IS NULL ORDER BY fecha, hora LIMIT 1").bind(tel, hoy, addD(hoy, 2)).first();
      if (!ci) continue;
      await env.DB.batch([env.DB.prepare('UPDATE citas SET data = json_set(data, ?, json(?)) WHERE id = ?').bind('$.asistencia', JSON.stringify({ ts: Date.now(), via: 'whatsapp' }), ci.id), bumpStmt(env)]);
      await auditar(env, 'Cliente', 'Confirmó asistencia', ci.codigo, 'respondió por WhatsApp');
    }
  }
  return json({ ok: true });
}

/* Rutas del panel. */
export async function rutasWhatsapp(c) {
  const { req, env, path, m, body, s, exigir } = c;
  if (path === '/whatsapp/config' && m === 'GET') {
    exigir('config'); const w = await leerWA(env), cr = await credenciales(env, w), u = new URL(req.url);
    return json({ phoneId: w.phoneId || '', wabaId: w.wabaId || '', version: w.version, idioma: w.idioma, tplRecordatorio: w.tplRecordatorio, tplConfirmacion: w.tplConfirmacion, auto: w.auto,
      token: MASC(cr.token), tokenEnCloudflare: !!env.WHATSAPP_TOKEN, secreto: cr.secreto ? '••••' : '', secretoEnCloudflare: !!env.WHATSAPP_APP_SECRET,
      verifyToken: w.verifyToken || '', webhook: `${u.origin}/api/whatsapp/webhook`, conectado: w.conectado || null });
  }
  if (path === '/whatsapp/config' && m === 'PUT') {
    exigir('config'); const b = await body(), w = await leerWA(env);
    const n = { ...w, phoneId: str(b.phoneId ?? w.phoneId, 40).replace(/\D/g, ''), wabaId: str(b.wabaId ?? w.wabaId, 40).replace(/\D/g, ''), version: /^v\d{1,2}\.\d$/.test(b.version || '') ? b.version : w.version, idioma: /^[a-z]{2}(_[A-Z]{2})?$/.test(b.idioma || '') ? b.idioma : w.idioma,
      tplRecordatorio: str(b.tplRecordatorio || w.tplRecordatorio, 60).replace(/[^a-z0-9_]/g, ''), tplConfirmacion: str(b.tplConfirmacion || w.tplConfirmacion, 60).replace(/[^a-z0-9_]/g, ''),
      auto: { diaAntes: !!b.auto?.diaAntes, horaDiaAntes: /^\d{2}:\d{2}$/.test(b.auto?.horaDiaAntes || '') ? b.auto.horaDiaAntes : w.auto.horaDiaAntes, dosHoras: !!b.auto?.dosHoras, alConfirmar: !!b.auto?.alConfirmar },
      verifyToken: w.verifyToken || rnd(18), urlBase: new URL(req.url).origin };
    if (b.token && !b.token.startsWith('••••')) { n.token_c = await cerrar(env, str(b.token, 600)); n.conectado = null }
    if (b.secreto && !b.secreto.startsWith('••••')) n.secreto_c = await cerrar(env, str(b.secreto, 200));
    if (b.phoneId !== undefined && n.phoneId !== w.phoneId) n.conectado = null;
    await guardarWA(env, n); await auditar(env, quienEs(s), 'Configuró WhatsApp automático', '', [b.token && !b.token.startsWith('••••') ? 'token nuevo' : '', `auto: ${Object.entries(n.auto).filter(([k, v]) => v === true).map(([k]) => k).join(', ') || 'apagado'}`].filter(Boolean).join(' · '));
    return json({ ok: true });
  }
  if (path === '/whatsapp/probar' && m === 'POST') {
    exigir('config'); const w = await leerWA(env), b = await body();
    const info = await meta(env, w, `${w.phoneId}?fields=display_phone_number,verified_name,quality_rating`);
    w.conectado = { ok: true, ts: Date.now(), numero: info.display_phone_number || '', nombre: info.verified_name || '', calidad: info.quality_rating || '' };
    await guardarWA(env, w);
    let prueba = null;
    if (b.tel) { const t = telWA(b.tel); if (t.length < 11) fail(400, 'Celular de prueba no válido'); const j = await meta(env, w, `${w.phoneId}/messages`, { messaging_product: 'whatsapp', to: t, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }); prueba = j.messages?.[0]?.id || 'enviado' }
    return json({ ...w.conectado, prueba });
  }
  if (path === '/whatsapp/desconectar' && m === 'POST') {
    exigir('config'); const w = await leerWA(env); delete w.token_c; delete w.secreto_c; w.conectado = null; w.auto = { ...w.auto, diaAntes: false, dosHoras: false, alConfirmar: false };
    await guardarWA(env, w); await auditar(env, quienEs(s), 'Desconectó WhatsApp automático'); return json({ ok: true });
  }
  if (path === '/whatsapp/enviar' && m === 'POST') {
    exigir('crear'); const b = await body(), tipo = b.tipo === 'confirmacion' ? 'confirmacion' : 'recordatorio';
    const r = await env.DB.prepare('SELECT * FROM citas WHERE id = ?').bind(str(b.id, 40)).first(); if (!r) fail(404, 'La cita ya no existe');
    const ci = filaCita(r); if (!s.perm.verTodas && ci.barberoId !== s.barberoId) fail(403, 'No es tu cita');
    const reg = await enviarPlantilla(env, ci, tipo);
    await auditar(env, quienEs(s), 'Envió WhatsApp automático', ci.codigo, tipo);
    return json(reg);
  }
}
