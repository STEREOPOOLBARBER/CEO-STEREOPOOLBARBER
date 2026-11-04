import { ACTIVOS, ahoraLocal, addD, fail, json, str } from '../comun.js';
import { auditar, quienEs } from './auth.js';
import { filaCita } from '../datos.js';

/* ---------- ficha de cliente ----------
   La tabla `clientes` resume a cada cliente (clave: últimos 9 dígitos del celular) a partir de sus citas:
   visitas, gasto, faltas, primera y última visita, próxima cita. Se recalcula sola cuando una cita cambia.
   Las notas y preferencias de corte las escribe la barbería y nunca se pisan. */
export const sinAcentos = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const telDe = c => String(c?.cliente?.tel || '').replace(/\D/g, '').slice(-9);
const ENMASC = t => '••• ••• ' + String(t).slice(-3);

// Resumen de citas → ficha. Una sola consulta para uno o para todos los clientes (no gasta una consulta por cliente).
const AGREGAR = (filtro) => `INSERT INTO clientes(tel, nombre, dni, ciudad, visitas, gasto, faltas, citas, primera, ultima, prox, upd)
  SELECT c.tel,
    substr(coalesce((SELECT json_extract(x.data, '$.cliente.nombre') FROM citas x WHERE x.tel = c.tel ORDER BY x.fecha DESC, x.hora DESC LIMIT 1), ''), 1, 80),
    coalesce((SELECT json_extract(x.data, '$.cliente.dni') FROM citas x WHERE x.tel = c.tel AND coalesce(json_extract(x.data, '$.cliente.dni'), '') <> '' ORDER BY x.fecha DESC LIMIT 1), ''),
    substr(coalesce((SELECT json_extract(x.data, '$.cliente.ciudad') FROM citas x WHERE x.tel = c.tel ORDER BY x.fecha DESC, x.hora DESC LIMIT 1), ''), 1, 60),
    SUM(c.estado = 'atendida'),
    SUM(CASE WHEN c.estado = 'atendida' AND NOT coalesce(json_extract(c.data, '$.gratis'), 0) THEN coalesce(json_extract(c.data, '$.precio'), 0) ELSE 0 END),
    SUM(c.estado = 'no_vino'), COUNT(*), MIN(c.fecha), MAX(CASE WHEN c.estado = 'atendida' THEN c.fecha END),
    MIN(CASE WHEN c.fecha >= ?1 AND c.estado IN ('por_validar', 'confirmada', 'en_silla') THEN c.fecha || ' ' || c.hora END), ?2
  FROM citas c WHERE ${filtro} GROUP BY c.tel
  ON CONFLICT(tel) DO UPDATE SET nombre = excluded.nombre, dni = excluded.dni, ciudad = excluded.ciudad, visitas = excluded.visitas, gasto = excluded.gasto,
    faltas = excluded.faltas, citas = excluded.citas, primera = excluded.primera, ultima = excluded.ultima, prox = excluded.prox, upd = excluded.upd`;
// Nombre y texto de búsqueda sin acentos (SQLite no sabe quitar tildes): se calculan aquí y se guardan en lotes.
async function normalizar(env, filas) {
  for (let i = 0; i < filas.length; i += 100) await env.DB.batch(filas.slice(i, i + 100).map(f => env.DB.prepare('UPDATE clientes SET nombre_n = ?, buscar = ? WHERE tel = ?').bind(sinAcentos(f.nombre), sinAcentos(`${f.nombre} ${f.tel} ${f.dni} ${f.ciudad}`), f.tel)));
}
export async function actualizarCliente(env, tel) {
  if (!/^\d{6,9}$/.test(tel || '')) return;
  try {
    const hoy = ahoraLocal(env).fecha;
    await env.DB.batch([
      env.DB.prepare(AGREGAR('c.tel = ?3')).bind(hoy, Date.now(), tel),
      env.DB.prepare("DELETE FROM clientes WHERE tel = ? AND notas = '' AND prefs = '' AND NOT EXISTS (SELECT 1 FROM citas WHERE citas.tel = clientes.tel)").bind(tel),
    ]);
    const f = await env.DB.prepare('SELECT tel, nombre, dni, ciudad FROM clientes WHERE tel = ?').bind(tel).first();
    if (f) await normalizar(env, [f]);
  } catch (e) { console.error('cliente', tel, e) }
}
// Reconstruye todas las fichas (migración inicial, importaciones y botón «Reconstruir fichas»).
export async function rehacerClientes(env) {
  await env.DB.batch([
    env.DB.prepare(AGREGAR("c.tel <> ''")).bind(ahoraLocal(env).fecha, Date.now()),
    env.DB.prepare("DELETE FROM clientes WHERE notas = '' AND prefs = '' AND tel NOT IN (SELECT DISTINCT tel FROM citas)"),
  ]);
  await normalizar(env, (await env.DB.prepare('SELECT tel, nombre, dni, ciudad FROM clientes').all()).results);
}

const cursorDe = v => btoa(unescape(encodeURIComponent(JSON.stringify(v)))).replace(/=+$/, '');
const leerCursor = t => { try { return JSON.parse(decodeURIComponent(escape(atob(String(t))))) } catch { return null } };
const ORDENES = { ultima: ["coalesce(ultima, '')", 'DESC'], visitas: ['visitas', 'DESC'], gasto: ['gasto', 'DESC'], nombre: ['nombre_n', 'ASC'], recuperar: ["coalesce(ultima, '')", 'ASC'] };
function vistaCliente(s, x) {
  const v = { k: s.perm.verTel ? x.tel : null, nombre: x.nombre, ciudad: x.ciudad, visitas: x.visitas, gasto: x.gasto, faltas: x.faltas, citas: x.citas, primera: x.primera, ultima: x.ultima, prox: x.prox, notas: x.notas, prefs: x.prefs };
  if (s.perm.verTel) Object.assign(v, { tel: x.tel, dni: x.dni }); else v.tel = ENMASC(x.tel);
  return v;
}

/* Rutas de clientes (panel). */
export async function rutasClientes(c) {
  const { req, env, path, m, body, s, exigir } = c;
  let x;
  const propio = s.perm.verTodas ? '' : ' AND EXISTS (SELECT 1 FROM citas WHERE citas.tel = clientes.tel AND citas.barbero_id = ?)', pa = s.perm.verTodas ? [] : [s.barberoId];
  if (path === '/clientes' && m === 'GET') {
    exigir('dash');
    const q = new URL(req.url).searchParams, orden = ORDENES[q.get('orden')] ? q.get('orden') : 'ultima', [col, dir] = ORDENES[orden];
    const lim = Math.min(200, Math.max(1, +q.get('limit') || 30)), hoy = ahoraLocal(env).fecha, w = ['1 = 1'], a = [];
    const txt = sinAcentos(q.get('q') || '').slice(0, 60);
    if (txt.length >= 2) { w.push(`${s.perm.verTel ? 'buscar' : 'nombre_n'} LIKE ? ESCAPE '\\'`); a.push('%' + txt.replace(/[\\%_]/g, z => '\\' + z) + '%') }
    if (orden === 'recuperar') { w.push("ultima IS NOT NULL AND ultima < ? AND (prox IS NULL OR prox < ?)"); a.push(addD(hoy, -35), hoy) }
    const base = ' FROM clientes WHERE ' + w.join(' AND ') + propio, ab = [...a, ...pa];
    // Paginación por cursor (keyset): la página 1 y la 1000 tardan lo mismo y no se repiten ni saltan clientes.
    const cur = leerCursor(q.get('cursor')), cw = cur ? ` AND (${col}, tel) ${dir === 'DESC' ? '<' : '>'} (?, ?)` : '';
    const [tot, r] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n' + base).bind(...ab).first(),
      env.DB.prepare('SELECT *' + base + cw + ` ORDER BY ${col} ${dir}, tel ${dir} LIMIT ?`).bind(...ab, ...(cur ? cur : []), lim).all(),
    ]);
    const items = r.results, ult = items.at(-1);
    return json({ total: tot.n, items: items.map(y => vistaCliente(s, y)), siguiente: items.length === lim ? cursorDe([orden === 'nombre' ? ult.nombre_n : orden === 'visitas' ? ult.visitas : orden === 'gasto' ? ult.gasto : (ult.ultima || ''), ult.tel]) : null });
  }
  if (path === '/clientes/rehacer' && m === 'POST') {
    exigir('config'); await rehacerClientes(env);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM clientes').first();
    await auditar(env, quienEs(s), 'Reconstruyó fichas de clientes', '', `${n.n} clientes`);
    return json({ clientes: n.n });
  }
  // Retención para el dashboard: visitas totales y primera cita de una lista de clientes.
  if (path === '/clientes/resumen' && m === 'POST') {
    exigir('dash'); if (!s.perm.verTel) return json({});
    const tels = [...new Set(((await body()).tels || []).map(t => String(t).replace(/\D/g, '').slice(-9)).filter(t => t.length >= 6))].slice(0, 3000), out = {};
    for (let i = 0; i < tels.length; i += 90) {
      const p = tels.slice(i, i + 90), r = await env.DB.prepare(`SELECT tel, visitas, primera FROM clientes WHERE tel IN (${p.map(() => '?').join(',')})`).bind(...p).all();
      for (const y of r.results) out[y.tel] = { visitas: y.visitas, primera: y.primera };
    }
    return json(out);
  }
  if ((x = path.match(/^\/clientes\/(\d{6,9})$/)) && (m === 'GET' || m === 'PATCH')) {
    exigir('dash'); if (!s.perm.verTel) fail(403, 'No tienes permiso para ver datos de clientes');
    const cli = await env.DB.prepare('SELECT * FROM clientes WHERE tel = ?' + propio).bind(x[1], ...pa).first();
    if (!cli) fail(404, 'Cliente no encontrado');
    if (m === 'PATCH') {
      const b = await body(), notas = str(b.notas ?? cli.notas, 1000), prefs = str(b.prefs ?? cli.prefs, 500);
      await env.DB.prepare('UPDATE clientes SET notas = ?, prefs = ?, upd = ? WHERE tel = ?').bind(notas, prefs, Date.now(), x[1]).run();
      await auditar(env, quienEs(s), 'Editó ficha de cliente', cli.nombre, [notas !== cli.notas ? 'notas' : '', prefs !== cli.prefs ? 'preferencias' : ''].filter(Boolean).join(', '));
      return json({ ok: true });
    }
    const q = new URL(req.url).searchParams, cur = leerCursor(q.get('cursor')), lim = 30;
    const r = await env.DB.prepare(`SELECT * FROM citas WHERE tel = ?${s.perm.verTodas ? '' : ' AND barbero_id = ?'}${cur ? ' AND (fecha, hora, id) < (?, ?, ?)' : ''} ORDER BY fecha DESC, hora DESC, id DESC LIMIT ?`).bind(x[1], ...pa, ...(cur || []), lim).all();
    const ult = r.results.at(-1);
    return json({ cliente: vistaCliente(s, cli), citas: r.results.map(filaCita), siguiente: r.results.length === lim ? cursorDe([ult.fecha, ult.hora, ult.id]) : null });
  }
}
export { cursorDe, leerCursor };
