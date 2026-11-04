import { addD, ahoraLocal, json } from '../comun.js';
import { datos, filaCita, kvStmt, leerKV } from '../datos.js';

/* ---------- respaldos automáticos en R2 (privados: solo el panel con permiso los descarga) ---------- */
export const RESP_DIAS = 30;
export async function respaldar(env) {
  if (!env.FOTOS) throw new Error('Falta conectar el almacén de fotos (R2)');
  const [d, c, l] = await Promise.all([datos(env), env.DB.prepare('SELECT * FROM citas').all(), env.DB.prepare('SELECT data FROM links').all()]);
  const fecha = ahoraLocal(env).fecha, cuerpo = JSON.stringify({ v: 4, fecha: new Date().toISOString(), ...d, citas: c.results.map(filaCita), links: l.results.map(r => JSON.parse(r.data)) });
  await env.FOTOS.put(`respaldos/${fecha}.json`, cuerpo, { httpMetadata: { contentType: 'application/json' }, customMetadata: { citas: String(c.results.length) } });
  await env.DB.batch([kvStmt(env, 'ultimoRespaldo', { fecha, ts: Date.now(), citas: c.results.length, bytes: cuerpo.length })]);
  // borrar los que pasaron los 30 días
  const viejos = (await env.FOTOS.list({ prefix: 'respaldos/' })).objects.filter(o => o.key.slice(10, 20) < addD(fecha, -RESP_DIAS)).map(o => o.key);
  if (viejos.length) await env.FOTOS.delete(viejos);
  return { fecha, citas: c.results.length, bytes: cuerpo.length };
}
export async function respaldoDiario(env) {
  const a = ahoraLocal(env), u = (await leerKV(env, ['ultimoRespaldo'])).ultimoRespaldo;
  if (a.min >= (env.RESPALDO_MIN ?? 3 * 60) && u?.fecha !== a.fecha) await respaldar(env);
}
