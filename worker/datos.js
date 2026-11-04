import { MAX_AUDIO, MAX_FOTO, codigo, fail, uid } from './comun.js';
import { pinPermitido } from './modulos/auth.js';
import { actualizarCliente, rehacerClientes, telDe } from './modulos/clientes.js';

/* ---------- migraciones versionadas de la base de datos ----------
   Cada cambio de estructura es una versión nueva al final de MIGRACIONES (nunca se edita una ya publicada).
   Al arrancar se aplican, en orden y una sola vez, las que falten; quedan anotadas en la tabla _migraciones.
   La versión 1 es la estructura completa actual (todo con IF NOT EXISTS: es segura sobre una base que ya existe). */
export const MIGRACIONES = [
  { v: 1, nombre: 'estructura inicial', sql: [
  `CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS citas(id TEXT PRIMARY KEY, codigo TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL DEFAULT '', barbero_id TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL, expira INTEGER, creada INTEGER NOT NULL, upd INTEGER, data TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_codigo ON citas(codigo)`,
  `CREATE INDEX IF NOT EXISTS ix_citas_fecha ON citas(fecha)`,
  `CREATE INDEX IF NOT EXISTS ix_citas_barb ON citas(barbero_id, fecha, hora)`,
  `CREATE INDEX IF NOT EXISTS ix_citas_estado ON citas(estado, expira)`,
  // Un barbero no puede tener dos citas activas a la misma hora: lo garantiza la base de datos.
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_turno ON citas(barbero_id, fecha, hora) WHERE hora <> '' AND estado IN ('pendiente_pago','por_validar','confirmada','en_silla','atendida')`,
  `CREATE TABLE IF NOT EXISTS links(id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, creado INTEGER NOT NULL, data TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sesiones(id TEXT PRIMARY KEY, data TEXT NOT NULL, exp INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS intentos(ip TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ix_intentos ON intentos(ip, ts)`,
  `CREATE TABLE IF NOT EXISTS nonces(h TEXT PRIMARY KEY, exp INTEGER NOT NULL)`,
  // Acceso de barberos y personal: clave (la pone el admin) y huella (llave de acceso del celular)
  `CREATE TABLE IF NOT EXISTS claves(sujeto TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, v INTEGER NOT NULL, upd INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY, sujeto TEXT NOT NULL, jwk TEXT NOT NULL, alg INTEGER NOT NULL, cnt INTEGER NOT NULL DEFAULT 0, etiqueta TEXT, creada INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ix_passkeys_sujeto ON passkeys(sujeto)`,
  `CREATE TABLE IF NOT EXISTS invitaciones(h TEXT PRIMARY KEY, sujeto TEXT NOT NULL, exp INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS retos(h TEXT PRIMARY KEY, tipo TEXT NOT NULL, sujeto TEXT, exp INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auditoria(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, quien TEXT NOT NULL, accion TEXT NOT NULL, objeto TEXT NOT NULL DEFAULT '', detalle TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS ix_auditoria_ts ON auditoria(ts)`,
  `CREATE INDEX IF NOT EXISTS ix_auditoria_obj ON auditoria(objeto, ts)`,
  `CREATE TABLE IF NOT EXISTS contadores(k TEXT PRIMARY KEY, n INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dnis(dni TEXT PRIMARY KEY, nombre TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS accesos(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, via TEXT NOT NULL, quien TEXT, ok INTEGER NOT NULL, motivo TEXT, ip TEXT)`,
] },
  { v: 2, nombre: 'ficha de clientes', sql: [
    `ALTER TABLE citas ADD COLUMN tel TEXT GENERATED ALWAYS AS (substr(replace(replace(replace(replace(replace(coalesce(json_extract(data, '$.cliente.tel'), ''), ' ', ''), '+', ''), '-', ''), '(', ''), ')', ''), -9)) VIRTUAL`,
    `CREATE INDEX IF NOT EXISTS ix_citas_tel ON citas(tel, fecha)`,
    `CREATE TABLE IF NOT EXISTS clientes(tel TEXT PRIMARY KEY, nombre TEXT NOT NULL DEFAULT '', nombre_n TEXT NOT NULL DEFAULT '', dni TEXT NOT NULL DEFAULT '', ciudad TEXT NOT NULL DEFAULT '', buscar TEXT NOT NULL DEFAULT '', notas TEXT NOT NULL DEFAULT '', prefs TEXT NOT NULL DEFAULT '', visitas INTEGER NOT NULL DEFAULT 0, gasto REAL NOT NULL DEFAULT 0, faltas INTEGER NOT NULL DEFAULT 0, citas INTEGER NOT NULL DEFAULT 0, primera TEXT, ultima TEXT, prox TEXT, upd INTEGER)`,
    `CREATE INDEX IF NOT EXISTS ix_cli_ultima ON clientes(ultima, tel)`,
    `CREATE INDEX IF NOT EXISTS ix_cli_visitas ON clientes(visitas, tel)`,
    `CREATE INDEX IF NOT EXISTS ix_cli_gasto ON clientes(gasto, tel)`,
    `CREATE INDEX IF NOT EXISTS ix_cli_nombre ON clientes(nombre_n, tel)`,
  ], despues: rehacerClientes },
  { v: 3, nombre: 'mensajes de WhatsApp', sql: [
    `CREATE TABLE IF NOT EXISTS wa_mensajes(id TEXT PRIMARY KEY, cita_id TEXT NOT NULL, tipo TEXT NOT NULL, ts INTEGER NOT NULL, estado TEXT NOT NULL DEFAULT 'enviado')`,
    `CREATE INDEX IF NOT EXISTS ix_wa_cita ON wa_mensajes(cita_id)`,
  ] },
  { v: 4, nombre: 'reportes semanales', sql: [
    `CREATE TABLE IF NOT EXISTS reportes(semana TEXT PRIMARY KEY, datos TEXT NOT NULL, creado INTEGER NOT NULL)`,
  ] },
  // Filtros de la agenda (worker/modulos/filtros.js): servicio, origen y pago como columnas indexadas.
  { v: 5, nombre: 'filtros de la agenda', sql: [
    `ALTER TABLE citas ADD COLUMN servicio_id TEXT GENERATED ALWAYS AS (IFNULL(json_extract(data, '$.servicioId'), '')) VIRTUAL`,
    `ALTER TABLE citas ADD COLUMN origen TEXT GENERATED ALWAYS AS (CASE WHEN json_extract(data, '$.origen') IN ('web', 'link') THEN 'web' WHEN json_extract(data, '$.origen') = 'walkin' THEN 'walkin' ELSE 'panel' END) VIRTUAL`,
    `ALTER TABLE citas ADD COLUMN pago TEXT GENERATED ALWAYS AS (CASE WHEN IFNULL(json_extract(data, '$.gratis'), 0) NOT IN (0, '') THEN 'gratis' WHEN IFNULL(CAST(json_extract(data, '$.adelanto') AS REAL), 0) > 0 THEN (CASE WHEN IFNULL(json_extract(data, '$.adelantoOk'), 0) NOT IN (0, '') THEN 'yape_ok' ELSE 'yape_pend' END) ELSE 'sin' END) VIRTUAL`,
    `CREATE INDEX IF NOT EXISTS ix_citas_serv ON citas(servicio_id, fecha)`,
    `CREATE INDEX IF NOT EXISTS ix_citas_origen ON citas(origen, fecha)`,
    `CREATE INDEX IF NOT EXISTS ix_citas_pago ON citas(pago, fecha)`,
  ] },
  // Calificaciones anónimas del cliente: sin nombre, celular, código ni hora (solo el mes). Una huella aparte evita calificar dos veces.
  { v: 6, nombre: 'calificaciones anónimas', sql: [
    `CREATE TABLE IF NOT EXISTS calificaciones(id TEXT PRIMARY KEY, barbero_id TEXT NOT NULL DEFAULT '', servicio_id TEXT NOT NULL DEFAULT '', mes TEXT NOT NULL, estrellas INTEGER NOT NULL, etiquetas TEXT NOT NULL DEFAULT '[]', comentario TEXT NOT NULL DEFAULT '')`,
    `CREATE INDEX IF NOT EXISTS ix_calif_barbero ON calificaciones(barbero_id, mes)`,
    // Qué citas ya calificaron, como huella (hash) para que nadie pueda unir una calificación con su cliente.
    `CREATE TABLE IF NOT EXISTS calif_hechas(h TEXT PRIMARY KEY)`,
  ] },
];
export let schemaListo = null;
export function asegurarSchema(env) { return schemaListo ||= aplicarMigraciones(env).catch(e => { schemaListo = null; throw e }) }
async function aplicarMigraciones(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS _migraciones(v INTEGER PRIMARY KEY, nombre TEXT NOT NULL, ts INTEGER NOT NULL)').run();
  const hechas = new Set((await env.DB.prepare('SELECT v FROM _migraciones').all()).results.map(r => r.v));
  for (const mg of MIGRACIONES.filter(x => !hechas.has(x.v)).sort((a, b) => a.v - b.v))
  {
    await env.DB.batch(mg.sql.map(q => env.DB.prepare(q)));
    if (mg.despues) await mg.despues(env);
    await env.DB.prepare('INSERT OR IGNORE INTO _migraciones(v, nombre, ts) VALUES(?, ?, ?)').bind(mg.v, mg.nombre, Date.now()).run();
  }
}

/* ---------- base de datos ---------- */

// Primera vez: deja la app lista con barberos y servicios de ejemplo (sin PIN: se entra con Google).
export const COLORES = ['#ff3fd2', '#8a3ffc', '#4d6bff', '#ffb057', '#3fb950'];
export const SEED = {
  cfg: { nombre: 'Stereo Barber Pool' },
  barberos: [['Jhon', 'Fades y degradados'], ['Brayan', 'Diseños y freestyle'], ['Piero', 'Cortes clásicos'], ['Alexis', 'Barba y perfilado'], ['Renzo', 'Taper y mullet']]
    .map(([nombre, esp], i) => ({ id: 'b' + (i + 1), nombre, esp, foto: '', color: COLORES[i], comision: 50, dias: [1, 2, 3, 4, 5, 6], activo: true })),
  servicios: [['✂️', 'Corte clásico', 25, 'Tijera y máquina, acabado limpio'], ['🔥', 'Fade / Degradado', 30, 'Low, mid o high fade'], ['💈', 'Taper', 30, 'Degradado suave en patillas y nuca'], ['🧔', 'Corte + Barba', 40, 'Corte completo y perfilado de barba'], ['🪒', 'Barba', 15, 'Perfilado con toalla caliente'], ['🎨', 'Diseño / Freestyle', 35, 'Líneas y figuras a mano alzada']]
    .map(([emoji, nombre, precio, desc], i) => ({ id: 's' + (i + 1), emoji, nombre, precio, desc, foto: '', activo: true })),
  usuarios: [],
};
export let sembrado = false;
export async function sembrar(env) {
  if (sembrado) return;
  await env.DB.batch(Object.entries(SEED).map(([k, v]) => env.DB.prepare('INSERT OR IGNORE INTO kv(k, v) VALUES(?, ?)').bind(k, JSON.stringify(v))));
  await env.DB.prepare("UPDATE citas SET estado = 'por_validar' WHERE estado = 'pendiente_pago'").run();
  if (!pinPermitido(env)) await quitarPines(env);
  sembrado = true;
}
// Borra los PIN que quedaron guardados (el acceso es solo con Google). Los que no sean los de ejemplo se conservan.
export async function quitarPines(env) {
  const d = await leerKV(env, ['cfg', 'barberos', 'usuarios']); const cambios = [];
  if (d.cfg?.adminPin) { const { adminPin, ...cfg } = d.cfg; cambios.push(kvStmt(env, 'cfg', cfg)) }
  const sinPin = a => a.map(({ pin, ...x }) => x);
  if ((d.barberos || []).some(b => b.pin)) cambios.push(kvStmt(env, 'barberos', sinPin(d.barberos)));
  if ((d.usuarios || []).some(u => u.pin)) cambios.push(kvStmt(env, 'usuarios', sinPin(d.usuarios)));
  if (cambios.length) await env.DB.batch(cambios);
}

export async function leerKV(env, keys) {
  const r = await env.DB.prepare(`SELECT k, v FROM kv WHERE k IN (${keys.map(() => '?').join(',')})`).bind(...keys).all();
  return Object.fromEntries(r.results.map(x => [x.k, JSON.parse(x.v)]));
}
export const kvStmt = (env, k, v) => env.DB.prepare('INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v));
export async function datos(env) {
  const d = await leerKV(env, ['cfg', 'barberos', 'servicios', 'usuarios']);
  return { cfg: d.cfg || {}, barberos: d.barberos || [], servicios: d.servicios || [], usuarios: d.usuarios || [] };
}
// Cada cambio sube la versión; el panel solo descarga todo cuando la versión cambia.
export const bumpStmt = env => kvStmt(env, 'ver', Date.now());
export const bump = env => bumpStmt(env).run();

export const filaCita = r => ({ ...JSON.parse(r.data), id: r.id, codigo: r.codigo, fecha: r.fecha, hora: r.hora, barberoId: r.barbero_id, estado: r.estado, expira: r.expira ?? null, creada: r.creada, ...(r.upd ? { upd: r.upd } : {}) });
export function paramsCita(c) {
  const { id, codigo, fecha, hora, barberoId, estado, expira, creada, upd, ...resto } = c;
  return [id, codigo, fecha, hora || '', barberoId || '', estado, expira || null, creada || Date.now(), upd || null, JSON.stringify(resto)];
}
export const INSERT_CITA = 'INSERT INTO citas(id, codigo, fecha, hora, barbero_id, estado, expira, creada, upd, data) VALUES(?,?,?,?,?,?,?,?,?,?)';
export const UPDATE_CITA = 'UPDATE citas SET codigo=?2, fecha=?3, hora=?4, barbero_id=?5, estado=?6, expira=?7, creada=?8, upd=?9, data=?10 WHERE id=?1';
export const esTurnoOcupado = e => /UNIQUE/i.test(e.message) && /barbero_id|ux_citas_turno|fecha|hora/i.test(e.message);
export const esCodigoRepetido = e => /UNIQUE/i.test(e.message) && /codigo/i.test(e.message);

export async function insertarCita(env, c, extra = []) {
  for (let i = 0; i < 4; i++) {
    try { await env.DB.batch([env.DB.prepare(INSERT_CITA).bind(...paramsCita(c)), ...extra, bumpStmt(env)]); await actualizarCliente(env, telDe(c)); return c }
    catch (e) {
      if (esCodigoRepetido(e)) { c.codigo = codigo(); continue }
      if (esTurnoOcupado(e)) fail(409, 'Ese horario ya está ocupado');
      throw e;
    }
  }
  fail(500, 'No se pudo crear la cita');
}
export async function guardarCita(env, c) {
  const ant = await env.DB.prepare('SELECT tel FROM citas WHERE id = ?').bind(c.id).first();
  try { await env.DB.batch([env.DB.prepare(UPDATE_CITA).bind(...paramsCita(c)), bumpStmt(env)]) }
  catch (e) { if (esTurnoOcupado(e)) fail(409, 'Ese horario ya está ocupado'); throw e }
  await actualizarCliente(env, telDe(c)); if (ant?.tel && ant.tel !== telDe(c)) await actualizarCliente(env, ant.tel);
}
export async function citaPorId(env, id) { const r = await env.DB.prepare('SELECT * FROM citas WHERE id = ?').bind(id).first(); return r ? filaCita(r) : null }

export async function expirar(env) {
  const r = await env.DB.prepare("UPDATE citas SET estado = 'expirada', upd = ?1 WHERE estado = 'por_validar' AND expira IS NOT NULL AND expira < ?1").bind(Date.now()).run();
  if (r.meta?.changes) await bump(env);
}

/* ---------- fotos (R2) ---------- */
export function leerDataURL(data) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) fail(400, 'Imagen no válida');
  const bin = atob(m[2]); if (bin.length > MAX_FOTO) fail(413, 'La imagen pesa demasiado (máx. 3 MB)');
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { tipo: m[1], bytes };
}
export async function guardarFoto(env, data, key = 'f_' + uid()) {
  if (!env.FOTOS) fail(503, 'Falta conectar el almacén de fotos (R2). En Cloudflare: Settings → Bindings → agrega R2 con el nombre FOTOS.');
  const { tipo, bytes } = leerDataURL(data);
  await env.FOTOS.put(key, bytes, { httpMetadata: { contentType: tipo } });
  return key;
}
// Fotos que el formulario público necesita ver (logo, barberos, servicios…). El resto es privado.
// Audios del narrador (la voz grabada por el dueño). Se guardan en R2 con clave a_xxx.
// Solo WAV: el panel convierte cada grabación a WAV, el único formato que leen todos los navegadores (iPhone incluido).
export function leerAudio(data) {
  const m = /^data:(audio\/[a-z0-9.+-]+)(?:;[a-z0-9=.+-]+)*;base64,([A-Za-z0-9+/=]+)$/i.exec(String(data || ''));
  if (!m || !/^audio\/(wav|x-wav|wave)$/i.test(m[1])) fail(400, 'Audio no válido: debe ser WAV (el panel lo convierte solo)');
  const bin = atob(m[2]); if (bin.length > MAX_AUDIO) fail(413, 'El audio pesa demasiado (máx. 2.5 MB)');
  if (bin.slice(0, 4) !== 'RIFF' || bin.slice(8, 12) !== 'WAVE') fail(400, 'Audio no válido: debe ser WAV (el panel lo convierte solo)');
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { tipo: 'audio/wav', bytes };
}
export async function guardarAudio(env, data) {
  if (!env.FOTOS) fail(503, 'Falta conectar el almacén de fotos (R2). En Cloudflare: Settings → Bindings → agrega R2 con el nombre FOTOS.');
  const { tipo, bytes } = leerAudio(data), key = 'a_' + uid();
  await env.FOTOS.put(key, bytes, { httpMetadata: { contentType: tipo } });
  return key;
}
export function audiosPublicos(d) { const s = new Set(); for (const v of Object.values(d.cfg.narrAudio || {})) if (typeof v === 'string' && /^a_[\w-]+$/.test(v)) s.add(v); return s }
export function fotosPublicas(d) {
  const s = new Set();
  for (const v of Object.values(d.cfg)) if (typeof v === 'string' && /^f_[\w-]+$/.test(v)) s.add(v);
  for (const x of [...d.barberos, ...d.servicios]) if (x.foto) s.add(x.foto);
  return s;
}
