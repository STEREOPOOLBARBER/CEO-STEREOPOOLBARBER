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

const ACTIVOS = ['por_validar', 'confirmada', 'en_silla', 'atendida'];
const DUR = 60;
const PERMS = ['verTodas', 'verTel', 'verMontos', 'crear', 'cancelar', 'yape', 'links', 'dash', 'excel', 'config'];
const ALLP = Object.fromEntries(PERMS.map(k => [k, true]));
const ROL_BARBERO = { verTel: true, crear: true, links: true };
const SES_MS = 14 * 864e5;
const COOKIE = 'brb_s';
const MAX_FOTO = 3 * 1024 * 1024;
const DEF = { dias: [1, 2, 3, 4, 5, 6], apertura: '09:00', cierre: '20:00', refIni: '13:00', refFin: '14:00', anticipacion: 0, ventana: 14, modAdelanto: true, yapeNum: '', adelanto: 10, holdMin: 20, bloqueos: [] };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS citas(id TEXT PRIMARY KEY, codigo TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL DEFAULT '', barbero_id TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL, expira INTEGER, creada INTEGER NOT NULL, upd INTEGER, data TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_codigo ON citas(codigo)`,
  `CREATE INDEX IF NOT EXISTS ix_citas_fecha ON citas(fecha)`,
  `CREATE INDEX IF NOT EXISTS ix_citas_estado ON citas(estado, expira)`,
  // Un barbero no puede tener dos citas activas a la misma hora: lo garantiza la base de datos.
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_turno ON citas(barbero_id, fecha, hora) WHERE hora <> '' AND estado IN ('pendiente_pago','por_validar','confirmada','en_silla','atendida')`,
  `CREATE TABLE IF NOT EXISTS links(id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, creado INTEGER NOT NULL, data TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sesiones(id TEXT PRIMARY KEY, data TEXT NOT NULL, exp INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS intentos(ip TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ix_intentos ON intentos(ip, ts)`,
  `CREATE TABLE IF NOT EXISTS nonces(h TEXT PRIMARY KEY, exp INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS accesos(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, via TEXT NOT NULL, quien TEXT, ok INTEGER NOT NULL, motivo TEXT, ip TEXT)`,
];

/* ---------- utilidades ---------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status } }
const fail = (status, msg) => { throw new HttpError(status, msg) };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const uid = () => Date.now().toString(36) + rnd(6).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
const codigo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
const pad = n => String(n).padStart(2, '0');
const toMin = h => { if (!h || !/^\d{1,2}:\d{2}$/.test(h)) return null; const [a, b] = h.split(':').map(Number); return a * 60 + b };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const pYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) };
const addD = (s, n) => { const d = pYmd(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) };
const norm = e => String(e || '').trim().toLowerCase();
const str = (v, max) => String(v ?? '').trim().slice(0, max);
function rnd(n = 32) { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('') }
function ahoraLocal(env) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: env.TZ || 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}

/* ---------- reglas de agenda (mismas que el formulario) ---------- */
function slotsDia(cfg) {
  const out = [], fin = toMin(cfg.cierre), ri = toMin(cfg.refIni), rf = toMin(cfg.refFin); let t = toMin(cfg.apertura), g = 0;
  if (t == null || fin == null) return out;
  while (t + DUR <= fin && g++ < 60) { if (ri != null && rf != null && rf > ri && t < rf && t + DUR > ri) { t = rf; continue } out.push(fromMin(t)); t += DUR }
  return out;
}
const bloqueado = (cfg, f, bid) => (cfg.bloqueos || []).some(b => b.fecha === f && (!b.barberoId || b.barberoId === bid));
const trabaja = (cfg, b, f) => { const d = pYmd(f).getUTCDay(); return b && b.activo !== false && (cfg.dias || []).includes(d) && (b.dias || []).includes(d) && !bloqueado(cfg, f, b.id) };

/* ---------- base de datos ---------- */
let schemaListo = null;
function asegurarSchema(env) { return schemaListo ||= env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).catch(e => { schemaListo = null; throw e }) }

// Primera vez: deja la app lista con barberos y servicios de ejemplo (sin PIN: se entra con Google).
const COLORES = ['#ff3fd2', '#8a3ffc', '#4d6bff', '#ffb057', '#3fb950'];
const SEED = {
  cfg: { nombre: 'Stereo Barber Pool' },
  barberos: [['Jhon', 'Fades y degradados'], ['Brayan', 'Diseños y freestyle'], ['Piero', 'Cortes clásicos'], ['Alexis', 'Barba y perfilado'], ['Renzo', 'Taper y mullet']]
    .map(([nombre, esp], i) => ({ id: 'b' + (i + 1), nombre, esp, foto: '', color: COLORES[i], comision: 50, dias: [1, 2, 3, 4, 5, 6], activo: true })),
  servicios: [['✂️', 'Corte clásico', 25, 'Tijera y máquina, acabado limpio'], ['🔥', 'Fade / Degradado', 30, 'Low, mid o high fade'], ['💈', 'Taper', 30, 'Degradado suave en patillas y nuca'], ['🧔', 'Corte + Barba', 40, 'Corte completo y perfilado de barba'], ['🪒', 'Barba', 15, 'Perfilado con toalla caliente'], ['🎨', 'Diseño / Freestyle', 35, 'Líneas y figuras a mano alzada']]
    .map(([emoji, nombre, precio, desc], i) => ({ id: 's' + (i + 1), emoji, nombre, precio, desc, foto: '', activo: true })),
  usuarios: [],
};
let sembrado = false;
async function sembrar(env) {
  if (sembrado) return;
  await env.DB.batch(Object.entries(SEED).map(([k, v]) => env.DB.prepare('INSERT OR IGNORE INTO kv(k, v) VALUES(?, ?)').bind(k, JSON.stringify(v))));
  await env.DB.prepare("UPDATE citas SET estado = 'por_validar' WHERE estado = 'pendiente_pago'").run();
  if (!pinPermitido(env)) await quitarPines(env);
  sembrado = true;
}
// Borra los PIN que quedaron guardados (el acceso es solo con Google). Los que no sean los de ejemplo se conservan.
async function quitarPines(env) {
  const d = await leerKV(env, ['cfg', 'barberos', 'usuarios']); const cambios = [];
  if (d.cfg?.adminPin) { const { adminPin, ...cfg } = d.cfg; cambios.push(kvStmt(env, 'cfg', cfg)) }
  const sinPin = a => a.map(({ pin, ...x }) => x);
  if ((d.barberos || []).some(b => b.pin)) cambios.push(kvStmt(env, 'barberos', sinPin(d.barberos)));
  if ((d.usuarios || []).some(u => u.pin)) cambios.push(kvStmt(env, 'usuarios', sinPin(d.usuarios)));
  if (cambios.length) await env.DB.batch(cambios);
}

async function leerKV(env, keys) {
  const r = await env.DB.prepare(`SELECT k, v FROM kv WHERE k IN (${keys.map(() => '?').join(',')})`).bind(...keys).all();
  return Object.fromEntries(r.results.map(x => [x.k, JSON.parse(x.v)]));
}
const kvStmt = (env, k, v) => env.DB.prepare('INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v));
async function datos(env) {
  const d = await leerKV(env, ['cfg', 'barberos', 'servicios', 'usuarios']);
  return { cfg: d.cfg || {}, barberos: d.barberos || [], servicios: d.servicios || [], usuarios: d.usuarios || [] };
}
// Cada cambio sube la versión; el panel solo descarga todo cuando la versión cambia.
const bumpStmt = env => kvStmt(env, 'ver', Date.now());
const bump = env => bumpStmt(env).run();

const filaCita = r => ({ ...JSON.parse(r.data), id: r.id, codigo: r.codigo, fecha: r.fecha, hora: r.hora, barberoId: r.barbero_id, estado: r.estado, expira: r.expira ?? null, creada: r.creada, ...(r.upd ? { upd: r.upd } : {}) });
function paramsCita(c) {
  const { id, codigo, fecha, hora, barberoId, estado, expira, creada, upd, ...resto } = c;
  return [id, codigo, fecha, hora || '', barberoId || '', estado, expira || null, creada || Date.now(), upd || null, JSON.stringify(resto)];
}
const INSERT_CITA = 'INSERT INTO citas(id, codigo, fecha, hora, barbero_id, estado, expira, creada, upd, data) VALUES(?,?,?,?,?,?,?,?,?,?)';
const UPDATE_CITA = 'UPDATE citas SET codigo=?2, fecha=?3, hora=?4, barbero_id=?5, estado=?6, expira=?7, creada=?8, upd=?9, data=?10 WHERE id=?1';
const esTurnoOcupado = e => /UNIQUE/i.test(e.message) && /barbero_id|ux_citas_turno|fecha|hora/i.test(e.message);
const esCodigoRepetido = e => /UNIQUE/i.test(e.message) && /codigo/i.test(e.message);

async function insertarCita(env, c, extra = []) {
  for (let i = 0; i < 4; i++) {
    try { await env.DB.batch([env.DB.prepare(INSERT_CITA).bind(...paramsCita(c)), ...extra, bumpStmt(env)]); return c }
    catch (e) {
      if (esCodigoRepetido(e)) { c.codigo = codigo(); continue }
      if (esTurnoOcupado(e)) fail(409, 'Ese horario ya está ocupado');
      throw e;
    }
  }
  fail(500, 'No se pudo crear la cita');
}
async function guardarCita(env, c) {
  try { await env.DB.batch([env.DB.prepare(UPDATE_CITA).bind(...paramsCita(c)), bumpStmt(env)]) }
  catch (e) { if (esTurnoOcupado(e)) fail(409, 'Ese horario ya está ocupado'); throw e }
}
async function citaPorId(env, id) { const r = await env.DB.prepare('SELECT * FROM citas WHERE id = ?').bind(id).first(); return r ? filaCita(r) : null }

async function expirar(env) {
  const r = await env.DB.prepare("UPDATE citas SET estado = 'expirada', upd = ?1 WHERE estado = 'por_validar' AND expira IS NOT NULL AND expira < ?1").bind(Date.now()).run();
  if (r.meta?.changes) await bump(env);
}

/* ---------- fotos (R2) ---------- */
function leerDataURL(data) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) fail(400, 'Imagen no válida');
  const bin = atob(m[2]); if (bin.length > MAX_FOTO) fail(413, 'La imagen pesa demasiado (máx. 3 MB)');
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { tipo: m[1], bytes };
}
async function guardarFoto(env, data, key = 'f_' + uid()) {
  if (!env.FOTOS) fail(503, 'Falta conectar el almacén de fotos (R2). En Cloudflare: Settings → Bindings → agrega R2 con el nombre FOTOS.');
  const { tipo, bytes } = leerDataURL(data);
  await env.FOTOS.put(key, bytes, { httpMetadata: { contentType: tipo } });
  return key;
}
// Fotos que el formulario público necesita ver (logo, barberos, servicios…). El resto es privado.
function fotosPublicas(d) {
  const s = new Set();
  for (const v of Object.values(d.cfg)) if (typeof v === 'string' && /^f_[\w-]+$/.test(v)) s.add(v);
  for (const x of [...d.barberos, ...d.servicios]) if (x.foto) s.add(x.foto);
  return s;
}

/* ---------- autenticación ---------- */
function cookieDe(req) { const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)brb_s=([^;]+)/); return m ? m[1] : '' }
const setCookie = (val, maxAge) => `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const pinValido = p => /^\d{4,6}$/.test(p);
// El PIN está apagado: el acceso es solo con Google. Solo se enciende con ALLOW_PIN=true (pruebas locales).
const pinPermitido = env => env.ALLOW_PIN === 'true';
function porEmail(email, d, env) {
  const e = norm(email); if (!e) return null;
  if ((env.OWNER_EMAILS || '').split(/[,\s;]+/).map(norm).filter(Boolean).includes(e)) return { rol: 'dueno', nombre: 'Dueño' };
  const u = d.usuarios.find(x => norm(x.email) === e && x.activo !== false);
  if (u) return { rol: u.rol, uid: u.id, nombre: u.nombre, barberoId: u.barberoId || '' };
  const b = d.barberos.find(x => norm(x.email) === e && x.activo !== false);
  if (b) return { rol: 'barbero', barberoId: b.id, nombre: b.nombre };
  return null;
}

function porPin(pin, d) {
  if (pin === d.cfg.adminPin) return { ident: { rol: 'dueno', nombre: 'Dueño' }, ref: 'admin' };
  const u = d.usuarios.find(x => x.pin === pin && x.activo !== false);
  if (u) return { ident: { rol: u.rol, uid: u.id, nombre: u.nombre, barberoId: u.barberoId || '' }, ref: 'u:' + u.id };
  const b = d.barberos.find(x => x.pin === pin && x.activo !== false);
  if (b) return { ident: { rol: 'barbero', barberoId: b.id, nombre: b.nombre }, ref: 'b:' + b.id };
  return null;
}
function pinDeRef(ref, d) {
  if (ref === 'admin') return d.cfg.adminPin;
  const [t, id] = ref.split(':'); const x = (t === 'u' ? d.usuarios : d.barberos).find(y => y.id === id && y.activo !== false);
  return x?.pin;
}
function permisos(id, d) {
  if (id.rol === 'dueno' || id.rol === 'admin') return { ...ALLP };
  if (id.uid) { const u = d.usuarios.find(x => x.id === id.uid); return u ? { ...(u.permisos || {}) } : null }
  if (id.rol === 'barbero') return { ...ROL_BARBERO, ...(d.cfg.permBarbero || {}) };
  return {};
}
// Revalida la sesión contra los datos actuales: si quitan a alguien, pierde acceso al instante.
async function sesion(req, env, d) {
  const t = cookieDe(req); if (!t) return null;
  const r = await env.DB.prepare('SELECT data, exp FROM sesiones WHERE id = ?').bind(await sha256(t)).first();
  if (!r || r.exp < Date.now()) return null;
  const s = JSON.parse(r.data);
  let ident = null;
  if (s.via === 'google') ident = porEmail(s.email, d, env);
  else if (s.via === 'pin' && pinPermitido(env)) { const p = pinDeRef(s.ref, d); if (p && await sha256(p) === s.pinH) ident = s.ident }
  if (!ident) return null;
  const perm = permisos(ident, d); if (!perm) return null;
  return { ...ident, email: s.email, perm };
}
async function abrirSesion(env, data) {
  const t = rnd();
  await env.DB.prepare('INSERT INTO sesiones(id, data, exp) VALUES(?, ?, ?)').bind(await sha256(t), JSON.stringify(data), Date.now() + SES_MS).run();
  return setCookie(t, SES_MS / 1000);
}

let jwks = { exp: 0, keys: [] };
async function clavesGoogle(env, fetcher = fetch) {
  if (jwks.exp > Date.now()) return jwks.keys;
  const r = await fetcher(env?.GOOGLE_CERTS_URL || 'https://www.googleapis.com/oauth2/v3/certs'); if (!r.ok) fail(502, 'No se pudo contactar a Google');
  const max = +(/max-age=(\d+)/.exec(r.headers.get('Cache-Control') || '')?.[1] || 3600);
  jwks = { exp: Date.now() + max * 1000, keys: (await r.json()).keys || [] };
  return jwks.keys;
}
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
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
async function nuevoNonce(env) {
  const n = rnd(24);
  await env.DB.prepare('INSERT INTO nonces(h, exp) VALUES(?, ?)').bind(await sha256(n), Date.now() + 5 * 60e3).run();
  return n;
}
async function gastarNonce(env, n) {
  if (!n) return false;
  const r = await env.DB.prepare('DELETE FROM nonces WHERE h = ? AND exp > ?').bind(await sha256(String(n)), Date.now()).run();
  return !!r.meta?.changes;
}
const anotar = (env, via, quien, ok, motivo, req) => env.DB.prepare('INSERT INTO accesos(ts, via, quien, ok, motivo, ip) VALUES(?,?,?,?,?,?)').bind(Date.now(), via, str(quien, 120), ok ? 1 : 0, str(motivo, 120), ipDe(req)).run().catch(() => { });

async function limitar(env, clave, max, ventanaMs) {
  const desde = Date.now() - ventanaMs;
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM intentos WHERE ip = ? AND ts > ?').bind(clave, desde).first();
  if (r.n >= max) fail(429, 'Demasiados intentos. Espera unos minutos.');
  await env.DB.prepare('INSERT INTO intentos(ip, ts) VALUES(?, ?)').bind(clave, Date.now()).run();
}
const ipDe = req => req.headers.get('CF-Connecting-IP') || 'local';

/* ---------- vistas según permisos ---------- */
function vistaPanel(d, citas, s) {
  const cfg = { ...d.cfg }, esConfig = s.perm.config;
  let barberos = d.barberos, usuarios = d.usuarios;
  if (!esConfig) {
    delete cfg.adminPin;
    barberos = barberos.map(({ pin, email, ...b }) => b);
    usuarios = usuarios.filter(u => u.id === s.uid).map(({ pin, email, ...u }) => u);
  }
  if (!s.perm.verTodas) citas = citas.filter(c => c.barberoId === s.barberoId);
  if (!s.perm.verTel) citas = citas.map(c => c.cliente?.tel ? { ...c, cliente: { ...c.cliente, tel: '••• ••• ' + String(c.cliente.tel).slice(-3), dni: undefined } } : c);
  return { cfg, barberos, servicios: d.servicios, usuarios, citas };
}
function vistaPublica(d) {
  const { adminPin, permBarbero, ...cfg } = d.cfg;
  return {
    cfg,
    barberos: d.barberos.filter(b => b.activo !== false).map(({ pin, comision, email, ...b }) => b),
    servicios: d.servicios.filter(s => s.activo !== false),
  };
}

/* ---------- rutas ---------- */
async function api(req, env, path) {
  const m = req.method;
  const body = async () => { try { return await req.json() } catch { fail(400, 'Datos no válidos') } };

  if (m !== 'GET' && m !== 'HEAD') {
    const o = req.headers.get('Origin');
    let ok = true; try { ok = !o || new URL(o).host === new URL(req.url).host } catch { ok = false }
    if (!ok) fail(403, 'Origen no permitido');
  }
  await asegurarSchema(env);
  await sembrar(env);

  /* ----- público (formulario de reservas) ----- */
  if (path === '/publico' && m === 'GET') {
    await expirar(env);
    const d = await datos(env), hoy = ahoraLocal(env).fecha;
    const r = await env.DB.prepare(`SELECT barbero_id AS b, fecha AS f, hora AS h FROM citas WHERE fecha >= ? AND hora <> '' AND estado IN (${ACTIVOS.map(() => '?').join(',')})`).bind(addD(hoy, -1), ...ACTIVOS).all();
    return json({ ...vistaPublica(d), ocupados: r.results, ts: env.TURNSTILE_SITEKEY || '' });
  }
  let x;
  if ((x = path.match(/^\/publico\/link\/([\w-]{6,80})$/)) && m === 'GET') {
    const r = await env.DB.prepare('SELECT data FROM links WHERE token = ?').bind(x[1]).first();
    if (!r) return json(null);
    const l = JSON.parse(r.data);
    return json({ token: l.token, estado: l.estado, vence: l.vence, cliente: { nombre: l.cliente?.nombre || '', tel: l.cliente?.tel || '' }, servicioId: l.servicioId, barberoId: l.barberoId, adelanto: l.adelanto, nota: l.nota });
  }
  if ((x = path.match(/^\/publico\/cita\/([A-Za-z0-9]{6})$/)) && m === 'GET') {
    // El cliente consulta su cita con el código que recibió. Solo se devuelve lo suyo y el teléfono va oculto.
    await limitar(env, 'c:' + ipDe(req), 120, 15 * 60e3);
    await expirar(env);
    const r = await env.DB.prepare('SELECT * FROM citas WHERE codigo = ?').bind(x[1].toUpperCase()).first();
    if (!r) fail(404, 'No encontramos una cita con ese código');
    const c = filaCita(r), d = await datos(env), b = d.barberos.find(y => y.id === c.barberoId);
    return json({ codigo: c.codigo, estado: c.estado, fecha: c.fecha, hora: c.hora, servicio: c.servicioNombre || '', precio: +c.precio || 0, adelanto: +c.adelanto || 0, adelantoOk: !!c.adelantoOk, barbero: b?.nombre || '', cliente: { nombre: c.cliente?.nombre || '', tel: '••• ••• ' + String(c.cliente?.tel || '').slice(-3) }, sinComprobante: c.estado === 'por_validar' && !c.yapeCaptura && !!c.expira, expira: c.expira ?? null });
  }
  if (path === '/publico/reservas' && m === 'POST') return reservar(req, env, await body());
  if ((x = path.match(/^\/publico\/reservas\/([\w-]+)\/captura$/)) && m === 'POST') {
    const b = await body(); const c = await citaPorId(env, x[1]);
    if (!c || c.codigo !== b.codigo) fail(404, 'Reserva no encontrada');
    if (c.estado === 'expirada') fail(410, 'Se venció el tiempo de pago');
    if (c.estado !== 'por_validar' || !c.expira) fail(409, 'Esta reserva ya fue procesada');
    if (c.expira < Date.now()) fail(410, 'Se venció el tiempo de pago');
    Object.assign(c, { yapeCaptura: await guardarFoto(env, b.data), estado: 'por_validar', expira: null, upd: Date.now() });
    await guardarCita(env, c);
    return json({ ok: true });
  }

  /* ----- fotos ----- */
  if ((x = path.match(/^\/fotos\/(f_[\w-]+)$/)) && m === 'GET') {
    const d = await datos(env);
    const publica = fotosPublicas(d).has(x[1]);
    if (!publica && !await sesion(req, env, d)) fail(401, 'Inicia sesión para ver esta foto');
    if (!env.FOTOS) fail(503, 'Falta conectar el almacén de fotos (R2)');
    const o = await env.FOTOS.get(x[1]); if (!o) fail(404, 'Foto no encontrada');
    return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': publica ? 'public, max-age=86400' : 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  }

  /* ----- autenticación ----- */
  if (path === '/auth/config' && m === 'GET') return json({ google: env.GOOGLE_CLIENT_ID || '', pin: pinPermitido(env) });
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
    const cookie = await abrirSesion(env, { via: 'google', email: norm(g.email) });
    await anotar(env, 'google', g.email, true, ident.rol, req);
    return json({ ...ident, email: norm(g.email) }, 200, { 'Set-Cookie': cookie });
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
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie('', 0) });
  }

  /* ----- panel (requiere sesión) ----- */
  const d = await datos(env);
  const s = await sesion(req, env, d);
  if (!s) fail(401, 'Tu sesión terminó. Vuelve a entrar.');
  const exigir = p => { if (!s.perm[p]) fail(403, 'No tienes permiso para esto') };
  const propia = c => { if (!s.perm.verTodas && c.barberoId !== s.barberoId) fail(403, 'No es tu cita') };

  if (path === '/accesos' && m === 'GET') {
    exigir('config');
    const r = await env.DB.prepare('SELECT ts, via, quien, ok, motivo, ip FROM accesos ORDER BY id DESC LIMIT 100').all();
    return json(r.results);
  }
  if (path === '/diagnostico' && m === 'GET') {
    exigir('config');
    const out = { db: { ok: false }, fotos: { ok: false } };
    try {
      const n = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM citas) AS citas, (SELECT COUNT(*) FROM links) AS links').first();
      out.db = { ok: true, ...n };
    } catch (e) { out.db = { ok: false, error: String(e.message || e) } }
    try {
      if (!env.FOTOS) throw new Error('No está conectado el almacén FOTOS');
      const k = '_diag_' + uid();
      await env.FOTOS.put(k, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'application/octet-stream' } });
      const o = await env.FOTOS.get(k); const ok = !!o && (await o.arrayBuffer()).byteLength === 3;
      await env.FOTOS.delete(k);
      out.fotos = ok ? { ok: true } : { ok: false, error: 'No se pudo leer lo guardado' };
    } catch (e) { out.fotos = { ok: false, error: String(e.message || e) } }
    return json(out);
  }

  if (path === '/panel' && m === 'GET') {
    await expirar(env);
    const ver = String((await leerKV(env, ['ver'])).ver || 0);
    if (new URL(req.url).searchParams.get('v') === ver) return json({ same: true, v: ver });
    const r = await env.DB.prepare('SELECT * FROM citas ORDER BY fecha, hora').all();
    return json({ ...vistaPanel(d, r.results.map(filaCita), s), v: ver });
  }
  if (path === '/config' && m === 'PUT') {
    exigir('config'); const b = await body();
    if (!b.cfg || typeof b.cfg !== 'object' || !Array.isArray(b.barberos) || !Array.isArray(b.servicios)) fail(400, 'Datos no válidos');
    if (!pinPermitido(env)) { delete b.cfg.adminPin; b.barberos = b.barberos.map(({ pin, ...x }) => x); if (Array.isArray(b.usuarios)) b.usuarios = b.usuarios.map(({ pin, ...x }) => x) }
    await env.DB.batch([kvStmt(env, 'cfg', b.cfg), kvStmt(env, 'barberos', b.barberos), kvStmt(env, 'servicios', b.servicios), ...(Array.isArray(b.usuarios) ? [kvStmt(env, 'usuarios', b.usuarios)] : []), bumpStmt(env)]);
    return json({ ok: true });
  }
  if (path === '/citas' && m === 'POST') {
    exigir('crear'); const b = await body();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) fail(400, 'Fecha no válida');
    const { id, codigo: _c, creada, ...resto } = b;
    const c = { ...resto, id: uid(), codigo: codigo(), creada: Date.now(), estado: b.estado || 'confirmada', creadoPor: s.uid || s.barberoId || 'dueno' };
    if (!s.perm.verTodas) c.barberoId = s.barberoId;
    return json(await insertarCita(env, c));
  }
  if ((x = path.match(/^\/citas\/([\w-]+)$/)) && (m === 'PATCH' || m === 'DELETE')) {
    const c = await citaPorId(env, x[1]); if (!c) fail(404, 'La cita ya no existe'); propia(c);
    if (m === 'DELETE') { exigir('cancelar'); await env.DB.batch([env.DB.prepare('DELETE FROM citas WHERE id = ?').bind(c.id), bumpStmt(env)]); return json({ ok: true }) }
    const { id, codigo: _c, creada, ...patch } = await body();
    if (['cancelada', 'no_vino'].includes(patch.estado)) exigir('cancelar');
    else if ('adelantoOk' in patch) { if (!s.perm.yape && !s.perm.crear) fail(403, 'No tienes permiso para validar pagos') }
    else exigir('crear');
    if (!s.perm.verTodas && patch.barberoId && patch.barberoId !== s.barberoId) fail(403, 'No puedes pasar la cita a otro barbero');
    Object.assign(c, patch, { upd: Date.now() });
    if (patch.estado && patch.estado !== 'por_validar') c.expira = null;
    await guardarCita(env, c);
    return json(c);
  }
  if (path === '/citas/import' && m === 'POST') {
    exigir('excel'); const arr = (await body()).citas; if (!Array.isArray(arr)) fail(400, 'Datos no válidos');
    let n = 0, u = 0, err = 0;
    for (const raw of arr.slice(0, 5000)) {
      try {
        const ex = raw.codigo && await env.DB.prepare('SELECT * FROM citas WHERE codigo = ?').bind(raw.codigo).first();
        if (ex) { const c = { ...filaCita(ex), ...raw, id: ex.id, upd: Date.now() }; await guardarCita(env, c); u++ }
        else { await insertarCita(env, { estado: 'confirmada', ...raw, id: uid(), creada: raw.creada || Date.now(), codigo: raw.codigo || codigo() }); n++ }
      } catch { err++ }
    }
    return json({ n, u, err });
  }
  if (path === '/links' && m === 'GET') {
    exigir('links'); const r = await env.DB.prepare('SELECT data FROM links ORDER BY creado DESC LIMIT 300').all();
    return json(r.results.map(x => JSON.parse(x.data)));
  }
  if (path === '/links' && m === 'POST') {
    exigir('links'); const l = await body();
    if (!l.id || !/^[\w-]{6,80}$/.test(l.token || '')) fail(400, 'Link no válido');
    await env.DB.prepare('INSERT INTO links(id, token, creado, data) VALUES(?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').bind(l.id, l.token, Date.now(), JSON.stringify(l)).run();
    return json(l);
  }
  if ((x = path.match(/^\/links\/([\w-]+)$/)) && m === 'DELETE') {
    exigir('links'); await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(x[1]).run(); return json({ ok: true });
  }
  if (path === '/fotos' && m === 'POST') return json({ key: await guardarFoto(env, (await body()).data) });

  /* ----- respaldo completo (migrar desde el modo local) ----- */
  if (path === '/exportar' && m === 'GET') {
    exigir('excel');
    const [c, l] = await Promise.all([env.DB.prepare('SELECT * FROM citas').all(), env.DB.prepare('SELECT data FROM links').all()]);
    return json({ v: 4, fecha: new Date().toISOString(), ...d, citas: c.results.map(filaCita), links: l.results.map(r => JSON.parse(r.data)) });
  }
  if (path === '/importar' && m === 'POST') {
    exigir('config'); const b = await body();
    if (!b.cfg || !Array.isArray(b.citas)) fail(400, 'Archivo no válido');
    if (!pinPermitido(env)) { delete b.cfg.adminPin; b.barberos = (b.barberos || []).map(({ pin, ...x }) => x); b.usuarios = (b.usuarios || []).map(({ pin, ...x }) => x) }
    let fotos = 0;
    for (const [k, v] of Object.entries(b.fotos || {})) if (/^f_[\w-]+$/.test(k)) { try { await guardarFoto(env, v, k); fotos++ } catch { } }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM citas'), env.DB.prepare('DELETE FROM links'),
      kvStmt(env, 'cfg', b.cfg), kvStmt(env, 'barberos', b.barberos || []), kvStmt(env, 'servicios', b.servicios || []), kvStmt(env, 'usuarios', b.usuarios || []),
    ]);
    let n = 0, err = 0;
    const citas = b.citas.filter(c => !c.demo && c.id && c.fecha);
    for (let i = 0; i < citas.length; i += 50) {
      const lote = citas.slice(i, i + 50).map(c => env.DB.prepare(INSERT_CITA.replace('INSERT', 'INSERT OR IGNORE')).bind(...paramsCita({ estado: 'confirmada', codigo: codigo(), ...c })));
      const rs = await env.DB.batch(lote); for (const r of rs) r.meta?.changes ? n++ : err++;
    }
    for (const l of (b.links || []).filter(l => l.id && l.token)) await env.DB.prepare('INSERT OR IGNORE INTO links(id, token, creado, data) VALUES(?, ?, ?, ?)').bind(l.id, l.token, l.creado || Date.now(), JSON.stringify(l)).run();
    await bump(env);
    return json({ citas: n, omitidas: err, fotos });
  }

  fail(404, 'Ruta no encontrada');
}

/* ---------- reserva pública ---------- */
async function reservar(req, env, b) {
  await limitar(env, 'r:' + ipDe(req), 15, 60 * 60e3);
  if (env.TURNSTILE_SECRET) {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(b.turnstile || ''), remoteip: ipDe(req) }) });
    if (!(await r.json()).success) fail(400, 'No pudimos verificar que no eres un robot. Inténtalo de nuevo.');
  }
  const cliente = { nombre: str(b.cliente?.nombre, 80), tel: String(b.cliente?.tel || '').replace(/\D/g, '').slice(-9), dni: String(b.cliente?.dni || '').replace(/\D/g, ''), ciudad: str(b.cliente?.ciudad, 60) };
  if (cliente.nombre.length < 3) fail(400, 'Escribe tu nombre completo');
  if (!/^9\d{8}$/.test(cliente.tel)) fail(400, 'Escribe un WhatsApp válido (9 dígitos, empieza con 9)');
  if (cliente.dni && cliente.dni.length !== 8) fail(400, 'El DNI debe tener 8 dígitos (o déjalo vacío)');
  if (cliente.ciudad.length < 2) fail(400, 'Escribe tu ciudad o distrito');

  await expirar(env);
  const d = await datos(env), cfg = { ...DEF, ...d.cfg }, ahora = ahoraLocal(env);
  const s = d.servicios.find(x => x.id === b.servicioId && x.activo !== false); if (!s) fail(400, 'El servicio ya no está disponible');
  const fecha = String(b.fecha || ''), hora = String(b.hora || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fail(400, 'Fecha no válida');
  const ini = addD(ahora.fecha, +cfg.anticipacion || 0), fin = addD(ini, Math.max(1, +cfg.ventana || 14) - 1);
  if (fecha < ini || fecha > fin) fail(400, 'Esa fecha no está disponible');
  if (!slotsDia(cfg).includes(hora)) fail(400, 'Horario no válido');
  if (fecha === ahora.fecha && toMin(hora) <= ahora.min + 10) fail(400, 'Esa hora ya pasó, elige otra');

  let link = null;
  if (b.linkToken) {
    const r = await env.DB.prepare('SELECT data FROM links WHERE token = ?').bind(String(b.linkToken)).first();
    if (!r) fail(400, 'Este link ya no existe');
    link = JSON.parse(r.data);
    if (link.estado === 'usado') fail(400, 'Este link ya fue usado');
    if (link.vence && link.vence < Date.now()) fail(400, 'Este link ya venció');
  }

  let candidatos;
  if (b.barberoId === 'any') {
    const r = await env.DB.prepare(`SELECT barbero_id AS b, hora AS h FROM citas WHERE fecha = ? AND estado IN (${ACTIVOS.map(() => '?').join(',')})`).bind(fecha, ...ACTIVOS).all();
    const carga = id => r.results.filter(x => x.b === id).length;
    candidatos = d.barberos.filter(x => trabaja(cfg, x, fecha) && !r.results.some(y => y.b === x.id && y.h === hora)).sort((a, z) => carga(a.id) - carga(z.id));
    if (!candidatos.length) fail(409, 'Ese horario se acaba de ocupar 😕');
  } else {
    const x = d.barberos.find(y => y.id === b.barberoId);
    if (!trabaja(cfg, x, fecha)) fail(400, 'Ese barbero no atiende ese día');
    candidatos = [x];
  }

  const ad = link && link.adelanto != null && link.adelanto !== '' ? +link.adelanto : +cfg.adelanto;
  const sinPago = !(cfg.modAdelanto && cfg.yapeNum && ad > 0);
  const refFoto = b.refFoto ? await guardarFoto(env, b.refFoto) : '';
  let nota = str(b.nota, 300); if (link?.nota) nota = '🎁 ' + link.nota + (nota ? ' · ' + nota : '');
  const base = {
    fecha, hora, servicioId: s.id, servicioNombre: s.nombre, precio: +s.precio || 0, cliente, nota, refFoto,
    adelanto: sinPago ? 0 : ad, linkId: link?.id || '', adelantoOk: false,
    estado: 'por_validar', expira: sinPago ? null : Date.now() + (+cfg.holdMin || 20) * 60e3, origen: link ? 'link' : 'web',
  };
  for (const barb of candidatos) {
    const c = { id: uid(), codigo: codigo(), creada: Date.now(), ...base, barberoId: barb.id };
    const extra = link ? [env.DB.prepare('UPDATE links SET data = ? WHERE id = ?').bind(JSON.stringify({ ...link, estado: 'usado', citaId: c.id, usado: Date.now() }), link.id)] : [];
    try { await insertarCita(env, c, extra); return json({ id: c.id, codigo: c.codigo, expira: c.expira, barberoId: c.barberoId, estado: c.estado }) }
    catch (e) { if (e.status !== 409) throw e }
  }
  fail(409, 'Ese horario se acaba de ocupar 😕');
}

/* ---------- entrada ---------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!env.DB) return json({ error: 'Falta conectar la base de datos (D1). En Cloudflare: Settings → Bindings → agrega D1 con el nombre DB.' }, 503);
    try { return await api(req, env, url.pathname.slice(4)) }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Error del servidor, inténtalo de nuevo' }, 500);
    }
  },
  async scheduled(_ev, env) {
    await asegurarSchema(env);
    await expirar(env);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sesiones WHERE exp < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM intentos WHERE ts < ?').bind(Date.now() - 864e5),
      env.DB.prepare('DELETE FROM nonces WHERE exp < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM accesos WHERE ts < ?').bind(Date.now() - 90 * 864e5),
    ]);
  },
};
