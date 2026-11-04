/* =====================================================================
   Calificaciones anónimas de la atención.
   · El cliente califica desde estado.html cuando su cita está atendida (hasta 7 días después), una sola vez.
   · Se guarda sin nombre, celular, código ni hora: barbero, servicio, mes, estrellas, etiquetas y comentario.
     La «huella» de la cita (hash) va en otra tabla solo para impedir calificar dos veces.
   · El panel (permiso «dash») ve promedios y comentarios de un barbero solo cuando junta MIN_ANON o más,
     para que no se pueda adivinar quién fue.
   ===================================================================== */
import { addD, ahoraLocal, fail, json, sha256, str } from '../comun.js';
import { filaCita } from '../datos.js';
import { frenar, ipDe } from './seguridad.js';

export const ETIQUETAS_CALIF = ['corte', 'trato', 'puntualidad', 'limpieza', 'ambiente'];
export const DIAS_PARA_CALIFICAR = 7, MIN_ANON = 3;
const huella = c => sha256('calificacion:' + c.id + ':' + c.creada);
export const yaCalificada = async (env, c) => !!await env.DB.prepare('SELECT 1 FROM calif_hechas WHERE h = ?').bind(await huella(c)).first();
export const plazoCalificar = (env, c) => c.estado === 'atendida' && c.fecha >= addD(ahoraLocal(env).fecha, -DIAS_PARA_CALIFICAR);

/* POST /publico/cita/:codigo/calificar {estrellas, etiquetas, comentario} */
export async function rutasCalificacionPublica({ req, env, path, m, body }) {
  const x = path.match(/^\/publico\/cita\/([A-Za-z0-9]{6})\/calificar$/);
  if (!x || m !== 'POST') return;
  await frenar(env, 'RL_RES', 'cal:' + ipDe(req), [10, 60 * 60e3]);
  const r = await env.DB.prepare('SELECT * FROM citas WHERE codigo = ?').bind(x[1].toUpperCase()).first();
  if (!r) fail(404, 'No encontramos una cita con ese código');
  const c = filaCita(r), b = await body(), estrellas = Math.round(+b.estrellas);
  if (!plazoCalificar(env, c)) fail(400, 'Esta cita ya no se puede calificar');
  if (!(estrellas >= 1 && estrellas <= 5)) fail(400, 'Elige de 1 a 5 estrellas');
  const etiquetas = [...new Set((Array.isArray(b.etiquetas) ? b.etiquetas : []).filter(e => ETIQUETAS_CALIF.includes(e)))];
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO calif_hechas(h) VALUES(?)').bind(await huella(c)),
      env.DB.prepare('INSERT INTO calificaciones(id, barbero_id, servicio_id, mes, estrellas, etiquetas, comentario) VALUES(?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), c.barberoId || '', c.servicioId || '', c.fecha.slice(0, 7), estrellas, JSON.stringify(etiquetas), str(b.comentario, 300)),
    ]);
  } catch (e) { if (/UNIQUE/i.test(String(e?.message))) fail(409, 'Ya calificaste esta cita. ¡Gracias!'); throw e }
  return json({ ok: true });
}

/* GET /calificaciones → resumen para el panel */
export async function rutasCalificaciones({ env, path, m, exigir }) {
  if (path !== '/calificaciones' || m !== 'GET') return;
  exigir('dash');
  const filas = (await env.DB.prepare('SELECT barbero_id, mes, estrellas, etiquetas, comentario FROM calificaciones ORDER BY mes DESC, id').all()).results;
  const resumen = l => {
    const n = l.length, etiquetas = {}, dist = [0, 0, 0, 0, 0];
    l.forEach(f => { dist[f.estrellas - 1]++; JSON.parse(f.etiquetas || '[]').forEach(e => etiquetas[e] = (etiquetas[e] || 0) + 1) });
    if (n < MIN_ANON) return { n, oculto: true, faltan: MIN_ANON - n };
    return { n, promedio: Math.round(l.reduce((a, f) => a + f.estrellas, 0) / n * 10) / 10, dist, etiquetas,
      comentarios: l.filter(f => f.comentario).slice(0, 100).map(f => ({ mes: f.mes, estrellas: f.estrellas, comentario: f.comentario })) };
  };
  const porBarbero = {};
  filas.forEach(f => (porBarbero[f.barbero_id] = porBarbero[f.barbero_id] || []).push(f));
  const general = resumen(filas);
  delete general.comentarios; // los comentarios se ven dentro de cada barbero (con su propio mínimo)
  return json({ minimo: MIN_ANON, general, barberos: Object.entries(porBarbero).map(([id, l]) => ({ id, ...resumen(l) })) });
}
