import { addD, ahoraLocal, fail, json, pYmd } from '../comun.js';
import { datos, filaCita } from '../datos.js';
import { auditar, pinPermitido, quienEs } from './auth.js';

/* ---------- reporte semanal de caja ----------
   Semana = lunes a domingo (hora de Lima). Cada lunes desde las 8 a. m. se arma solo el de la semana anterior y queda guardado
   (tabla `reportes`), con la comparación contra la semana previa. Los montos siguen la misma regla que la Caja del panel. */
export const lunesDe = f => addD(f, -((pYmd(f).getUTCDay() + 6) % 7));
// Ingreso de una cita (igual que la Caja): atendida = precio (si fue gratis, solo el adelanto validado); no vino = adelanto validado.
const ingreso = c => c.estado === 'atendida' ? (c.gratis ? (c.adelantoOk ? +c.adelanto || 0 : 0) : +c.precio || 0) : c.estado === 'no_vino' ? (c.adelantoOk ? +c.adelanto || 0 : 0) : 0;
const r2 = n => Math.round(n * 100) / 100;

async function resumen(env, desde, hasta, d) {
  const cs = (await env.DB.prepare('SELECT * FROM citas WHERE fecha BETWEEN ? AND ? ORDER BY fecha, hora').bind(desde, hasta).all()).results.map(filaCita);
  const at = cs.filter(c => c.estado === 'atendida'), nv = cs.filter(c => c.estado === 'no_vino'), canc = cs.filter(c => ['cancelada', 'expirada'].includes(c.estado));
  const ing = cs.reduce((a, c) => a + ingreso(c), 0), com = !!d.cfg.modComision;
  const porB = d.barberos.map(b => { const m = cs.filter(c => c.barberoId === b.id), a = m.filter(c => c.estado === 'atendida'), g = m.reduce((x, c) => x + ingreso(c), 0);
    return { id: b.id, nombre: b.nombre, color: b.color || '', atendidos: a.length, noVino: m.filter(c => c.estado === 'no_vino').length, ingresos: r2(g), ticket: r2(a.length ? g / a.length : 0), comisionPct: com ? +b.comision || 0 : 0, comision: com ? r2(g * (+b.comision || 0) / 100) : 0 } }).filter(x => x.atendidos || x.noVino || x.ingresos);
  const sm = {}; for (const c of at) { const k = c.servicioNombre || '—'; sm[k] = sm[k] || { nombre: k, cortes: 0, ingresos: 0 }; sm[k].cortes++; sm[k].ingresos = r2(sm[k].ingresos + ingreso(c)) }
  const dias = []; for (let f = desde; f <= hasta; f = addD(f, 1)) { const m = cs.filter(c => c.fecha === f); dias.push({ fecha: f, atendidos: m.filter(c => c.estado === 'atendida').length, ingresos: r2(m.reduce((x, c) => x + ingreso(c), 0)) }) }
  const yape = cs.filter(c => c.adelantoOk && +c.adelanto > 0), conf = cs.filter(c => ['confirmada', 'en_silla', 'atendida', 'no_vino'].includes(c.estado));
  const tels = [...new Set(at.map(c => String(c.cliente?.tel || '').replace(/\D/g, '').slice(-9)).filter(Boolean))];
  const nuevos = (await env.DB.prepare('SELECT COUNT(*) AS n FROM clientes WHERE primera BETWEEN ? AND ?').bind(desde, hasta).first()).n;
  return {
    desde, hasta, citas: cs.length, ingresos: r2(ing), atendidos: at.length, noVino: nv.length, cancelados: canc.length,
    noVinoPct: (at.length + nv.length) ? Math.round(nv.length / (at.length + nv.length) * 100) : 0, ticket: r2(at.length ? ing / at.length : 0),
    yape: { citas: yape.length, monto: r2(yape.reduce((a, c) => a + (+c.adelanto || 0), 0)) },
    web: cs.filter(c => ['web', 'link'].includes(c.origen)).length, clientes: tels.length, nuevos,
    confirmaron: conf.filter(c => c.asistencia).length, recordados: conf.filter(c => c.recordado || c.wa?.recordatorio?.id || c.wa?.dosHoras?.id).length,
    comisiones: r2(porB.reduce((a, b) => a + b.comision, 0)), barberos: porB.sort((a, b) => b.ingresos - a.ingresos),
    servicios: Object.values(sm).sort((a, b) => b.cortes - a.cortes).slice(0, 8), dias,
  };
}
export async function armarReporte(env, lunes, guardar = true) {
  const d = await datos(env), hasta = addD(lunes, 6), [act, prev, rec] = await Promise.all([
    resumen(env, lunes, hasta, d), resumen(env, addD(lunes, -7), addD(lunes, -1), d),
    env.DB.prepare("SELECT COUNT(*) AS n FROM clientes WHERE ultima IS NOT NULL AND ultima < ? AND (prox IS NULL OR prox < ?)").bind(addD(hasta, -35), hasta).first(),
  ]);
  const rep = { semana: lunes, negocio: d.cfg.nombre || '', ...act, porRecuperar: rec.n, anterior: { ingresos: prev.ingresos, atendidos: prev.atendidos, noVinoPct: prev.noVinoPct, ticket: prev.ticket, nuevos: prev.nuevos }, generado: Date.now() };
  if (guardar) await env.DB.prepare('INSERT INTO reportes(semana, datos, creado) VALUES(?, ?, ?) ON CONFLICT(semana) DO UPDATE SET datos = excluded.datos, creado = excluded.creado').bind(lunes, JSON.stringify(rep), Date.now()).run();
  return rep;
}
// Cron: los lunes desde las 8 a. m. arma el reporte de la semana que terminó (una sola vez).
export async function reporteSemanal(env) {
  const a = ahoraLocal(env), forzar = env.REPORTE_FORZAR === 'true' && pinPermitido(env); // forzar: solo en pruebas locales
  if (!forzar && (pYmd(a.fecha).getUTCDay() !== 1 || a.min < 8 * 60)) return null;
  const lunes = addD(lunesDe(a.fecha), -7); // el lunes de la semana que terminó if (await env.DB.prepare('SELECT 1 FROM reportes WHERE semana = ?').bind(lunes).first()) return null;
  return armarReporte(env, lunes);
}

/* Rutas del panel: solo quien ve todas las citas y los montos (dueño o encargado). */
export async function rutasReportes(c) {
  const { req, env, path, m, s, exigir } = c; let x;
  if (!path.startsWith('/reportes')) return;
  exigir('verMontos'); exigir('verTodas');
  if (path === '/reportes' && m === 'GET') {
    const r = await env.DB.prepare('SELECT semana, datos FROM reportes ORDER BY semana DESC LIMIT 60').all();
    return json(r.results.map(y => { const j = JSON.parse(y.datos); return { semana: y.semana, hasta: j.hasta, ingresos: j.ingresos, atendidos: j.atendidos, anterior: j.anterior?.ingresos ?? null } }));
  }
  if ((x = path.match(/^\/reportes\/(\d{4}-\d{2}-\d{2})$/)) && m === 'GET') {
    const lunes = lunesDe(x[1]), hoy = ahoraLocal(env).fecha;
    if (lunes > hoy) fail(400, 'Esa semana aún no empieza');
    const g = await env.DB.prepare('SELECT datos FROM reportes WHERE semana = ?').bind(lunes).first();
    // Semana en curso: se calcula al momento y no se guarda (todavía faltan días).
    if (!g || lunes === lunesDe(hoy)) return json({ ...(await armarReporte(env, lunes, lunes !== lunesDe(hoy))), enCurso: lunes === lunesDe(hoy) });
    return json(JSON.parse(g.datos));
  }
  if ((x = path.match(/^\/reportes\/(\d{4}-\d{2}-\d{2})\/rehacer$/)) && m === 'POST') {
    exigir('config'); const lunes = lunesDe(x[1]); if (lunes >= lunesDe(ahoraLocal(env).fecha)) fail(400, 'Solo semanas terminadas');
    const rep = await armarReporte(env, lunes); await auditar(env, quienEs(s), 'Rehízo reporte semanal', lunes); return json(rep);
  }
}
