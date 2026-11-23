/* =====================================================================
   PROMOCIONES · una promo = un servicio con un precio especial, entre dos fechas y (si se quiere) solo ciertos días.
   · Se guardan en kv 'promos' (pocas, máximo PROMO_MAX). Solo quien tiene el permiso «config» las crea o cambia.
   · El cliente las ve en «Mi cita» y en el formulario. El PRECIO lo decide el Worker al reservar (promoPara):
     si hay una promo vigente para ese servicio ESE día (hora de Lima), la cita sale con ese precio y guarda cita.promo.
   · Contadores sin datos personales: vistas y toques en «Reservar» (tabla contadores, claves 'promo:<id>:v|c').
   ===================================================================== */
import { ahoraLocal, fail, json, str, uid } from '../comun.js';
import { bump, datos, kvStmt } from '../datos.js';
import { auditar, quienEs } from './auth.js';

export const PROMO_MAX = 12;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const diaSemana = f => new Date(f + 'T12:00:00Z').getUTCDay();
const servicioActivo = (d, id) => d.servicios.find(s => s.id === id && s.activo !== false);

/* ¿La promo vale para esa fecha? (activa, dentro de las fechas y, si tiene días, uno de ellos) */
export const valeEl = (p, fecha) => p.activo !== false && p.desde <= fecha && fecha <= p.hasta && (!p.dias?.length || p.dias.includes(diaSemana(fecha)));

/* La promo que se aplica a una reserva: la de menor precio entre las que valen ese día para ese servicio. */
export function promoPara(d, servicioId, fecha) {
  const s = servicioActivo(d, servicioId); if (!s) return null;
  return (d.promos || []).filter(p => p.servicioId === servicioId && valeEl(p, fecha) && +p.precio < +s.precio)
    .sort((a, b) => a.precio - b.precio)[0] || null;
}

/* Lo que ve el público: solo las activas que aún no vencen, con el precio normal para mostrarlo tachado. */
export function promosPublicas(d, hoy) {
  return (d.promos || []).filter(p => p.activo !== false && p.hasta >= hoy).map(p => {
    const s = servicioActivo(d, p.servicioId); if (!s || +p.precio >= +s.precio) return null;
    return { id: p.id, titulo: p.titulo, texto: p.texto, foto: p.foto, servicioId: s.id, servicio: s.nombre, precio: +p.precio, precioNormal: +s.precio, desde: p.desde, hasta: p.hasta, dias: p.dias };
  }).filter(Boolean);
}

/* Revisa y limpia lo que manda el panel. Nada se guarda sin pasar por aquí. */
export function validarPromos(lista, d) {
  if (!Array.isArray(lista)) fail(400, 'Lista de promociones no válida');
  if (lista.length > PROMO_MAX) fail(400, `Máximo ${PROMO_MAX} promociones`);
  const ids = new Set();
  return lista.map((x, i) => {
    const p = {
      id: /^pr_[\w-]{4,30}$/.test(x?.id || '') ? x.id : 'pr_' + uid(),
      titulo: str(x?.titulo, 40), texto: str(x?.texto, 140),
      foto: /^f_[\w-]+$/.test(x?.foto || '') ? x.foto : '',
      servicioId: String(x?.servicioId || ''), precio: Math.round((+x?.precio || 0) * 100) / 100,
      desde: String(x?.desde || ''), hasta: String(x?.hasta || ''),
      dias: [...new Set((Array.isArray(x?.dias) ? x.dias : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort(),
      activo: x?.activo !== false, orden: i,
    };
    const s = d.servicios.find(y => y.id === p.servicioId);
    if (p.titulo.length < 3) fail(400, 'Cada promoción necesita un título');
    if (!s) fail(400, `«${p.titulo}»: elige un servicio`);
    if (!(p.precio > 0) || p.precio >= +s.precio) fail(400, `«${p.titulo}»: el precio promo debe ser menor que el normal (${s.precio})`);
    if (!FECHA.test(p.desde) || !FECHA.test(p.hasta) || p.desde > p.hasta) fail(400, `«${p.titulo}»: revisa las fechas`);
    if (ids.has(p.id)) p.id = 'pr_' + uid();
    ids.add(p.id);
    return p;
  });
}

/* Cuántas veces la vieron, cuántos tocaron «Reservar» y cuántas citas (y cuánto dinero) dejó. */
async function estadisticas(env) {
  const [c, r] = await Promise.all([
    env.DB.prepare("SELECT k, n FROM contadores WHERE k LIKE 'promo:%'").all(),
    env.DB.prepare(`SELECT json_extract(data, '$.promo.id') AS id, COUNT(*) AS citas,
      SUM(CASE WHEN estado = 'atendida' THEN 1 ELSE 0 END) AS atendidas,
      SUM(CASE WHEN estado = 'atendida' THEN IFNULL(CAST(json_extract(data, '$.precio') AS REAL), 0) ELSE 0 END) AS monto
      FROM citas WHERE json_extract(data, '$.promo.id') IS NOT NULL AND estado NOT IN ('cancelada', 'expirada') GROUP BY 1`).all(),
  ]);
  const st = {}, de = id => st[id] ||= { vistas: 0, clics: 0, citas: 0, atendidas: 0, monto: 0 };
  for (const x of c.results) { const [, id, t] = x.k.split(':'); de(id)[t === 'v' ? 'vistas' : 'clics'] = x.n }
  for (const x of r.results) Object.assign(de(x.id), { citas: x.citas, atendidas: x.atendidas, monto: x.monto || 0 });
  return st;
}

/* ----- panel ----- */
export async function rutasPromos(c) {
  const { env, path, m, body, d, s, exigir } = c;
  if (path === '/promos' && m === 'GET') {
    exigir('config');
    return json({ promos: d.promos || [], stats: await estadisticas(env), hoy: ahoraLocal(env).fecha, max: PROMO_MAX });
  }
  if (path === '/promos' && m === 'PUT') {
    exigir('config');
    const promos = validarPromos((await body()).promos, d);
    await env.DB.batch([kvStmt(env, 'promos', promos)]); await bump(env);
    await auditar(env, quienEs(s), 'Guardó promociones', '', `${promos.length} promo(s)`);
    return json({ promos });
  }
}

/* ----- público: anotar vistas y toques (sin datos personales; el límite público ya frena abusos) ----- */
export async function rutasPromosPublicas(c) {
  const { env, path, m, body } = c;
  if (path === '/publico/promos/visto' && m === 'POST') {
    const b = await body(), tipo = b.tipo === 'c' ? 'c' : 'v';
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(String).filter(x => /^pr_[\w-]{4,30}$/.test(x)))].slice(0, PROMO_MAX);
    const d = await datos(env), validos = new Set((d.promos || []).map(p => p.id));
    const lote = ids.filter(id => validos.has(id)).map(id => env.DB.prepare('INSERT INTO contadores(k, n) VALUES(?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1').bind(`promo:${id}:${tipo}`));
    if (lote.length) await env.DB.batch(lote);
    return json({ ok: true });
  }
}
