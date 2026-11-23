/* =====================================================================
   PAPELERA · las citas eliminadas no se borran al instante: pasan aquí 7 días (su horario queda libre).
   · DELETE /citas/:id → moverAPapelera (permiso «cancelar»). La cita sale de la agenda, la ficha del cliente se recalcula.
   · GET /papelera · POST /papelera/:id/recuperar (vuelve; si su horario ya se ocupó, vuelve como «cancelada»)
     · DELETE /papelera/:id (eliminar ya). Permiso «cancelar»; quien no ve todas, solo las suyas.
   · Cron: purgarPapelera borra para siempre las de más de 7 días, con sus fotos y la captura de Yape (R2).
   ===================================================================== */
import { fail, json } from '../comun.js';
import { bumpStmt, insertarCita } from '../datos.js';
import { auditar, pinPermitido, quienEs } from './auth.js';
import { actualizarCliente, telDe } from './clientes.js';

export const DIAS_PAPELERA = 7;
const FOTOS = ['refFoto', 'yapeCaptura', 'fotoAntes', 'fotoDespues'];
const fotosDe = c => FOTOS.map(k => c[k]).filter(k => typeof k === 'string' && /^f_[\w-]+$/.test(k));
const ACTIVOS_TURNO = ['pendiente_pago', 'por_validar', 'confirmada', 'en_silla', 'atendida'];

export async function moverAPapelera(env, c, s) {
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO papelera(id, tel, barbero_id, borrada, quien, data) VALUES(?,?,?,?,?,?)').bind(c.id, telDe(c), c.barberoId || '', Date.now(), quienEs(s), JSON.stringify(c)),
    env.DB.prepare('DELETE FROM citas WHERE id = ?').bind(c.id), bumpStmt(env),
  ]);
  await actualizarCliente(env, telDe(c));
  await auditar(env, quienEs(s), 'Movió a la papelera', c.codigo, `${c.cliente?.nombre || ''} · ${c.fecha} ${c.hora}`);
}
async function borrarDeVerdad(env, filas) {
  if (!filas.length) return 0;
  const fotos = filas.flatMap(f => fotosDe(JSON.parse(f.data)));
  for (let i = 0; i < filas.length; i += 50) await env.DB.batch(filas.slice(i, i + 50).map(f => env.DB.prepare('DELETE FROM papelera WHERE id = ?').bind(f.id)));
  if (env.FOTOS && fotos.length) for (let i = 0; i < fotos.length; i += 100) { try { await env.FOTOS.delete(fotos.slice(i, i + 100)) } catch (e) { console.error('papelera fotos', e) } }
  return filas.length;
}
export async function purgarPapelera(env) {
  const r = await env.DB.prepare('SELECT id, data FROM papelera WHERE borrada < ? LIMIT 200').bind(Date.now() - DIAS_PAPELERA * 864e5).all();
  return borrarDeVerdad(env, r.results);
}
export const contarPapelera = (env, s) => s.perm.cancelar ? env.DB.prepare(`SELECT COUNT(*) AS n FROM papelera${s.perm.verTodas ? '' : ' WHERE barbero_id = ?'}`).bind(...(s.perm.verTodas ? [] : [s.barberoId])).first().then(r => r.n) : 0;

export async function rutasPapelera(c) {
  const { env, path, m, s, exigir, body } = c; let x;
  // Solo pruebas locales (ALLOW_PIN + PAPELERA_PRUEBA): simula que una cita lleva 8 días en la papelera.
  if (path === '/prueba/papelera-vieja' && m === 'POST' && pinPermitido(env) && env.PAPELERA_PRUEBA === 'true') {
    await env.DB.prepare('UPDATE papelera SET borrada = ? WHERE id = ?').bind(Date.now() - 8 * 864e5, String((await body()).id)).run(); return json({ ok: true });
  }
  if (path === '/papelera' && m === 'GET') {
    exigir('cancelar');
    const r = await env.DB.prepare(`SELECT id, borrada, quien, data FROM papelera${s.perm.verTodas ? '' : ' WHERE barbero_id = ?'} ORDER BY borrada DESC LIMIT 300`).bind(...(s.perm.verTodas ? [] : [s.barberoId])).all();
    return json({ dias: DIAS_PAPELERA, items: r.results.map(f => { const d = JSON.parse(f.data); return { id: f.id, codigo: d.codigo, fecha: d.fecha, hora: d.hora, estado: d.estado, barberoId: d.barberoId, servicio: d.servicioNombre || '', precio: s.perm.verMontos ? +d.precio || 0 : undefined, cliente: d.cliente?.nombre || '', borrada: f.borrada, quien: f.quien, vence: f.borrada + DIAS_PAPELERA * 864e5 } }) });
  }
  if ((x = path.match(/^\/papelera\/([\w-]+)(\/recuperar)?$/)) && ((m === 'POST' && x[2]) || (m === 'DELETE' && !x[2]))) {
    exigir('cancelar');
    const f = await env.DB.prepare('SELECT * FROM papelera WHERE id = ?').bind(x[1]).first(); if (!f) fail(404, 'Ya no está en la papelera');
    const cita = JSON.parse(f.data);
    if (!s.perm.verTodas && cita.barberoId !== s.barberoId) fail(403, 'No es tu cita');
    if (m === 'DELETE') { await borrarDeVerdad(env, [f]); await auditar(env, quienEs(s), 'Eliminó para siempre', cita.codigo, `${cita.cliente?.nombre || ''} · ${cita.fecha} ${cita.hora}`); return json({ ok: true }) }
    let ocupado = false;
    try { await insertarCita(env, cita) }
    catch (e) {
      if (e.status !== 409 || !ACTIVOS_TURNO.includes(cita.estado)) throw e;
      ocupado = true; await insertarCita(env, { ...cita, estado: 'cancelada', expira: null, upd: Date.now() }); // su horario ya lo tomó otra cita
    }
    await env.DB.prepare('DELETE FROM papelera WHERE id = ?').bind(f.id).run();
    await auditar(env, quienEs(s), 'Recuperó de la papelera', cita.codigo, ocupado ? 'como cancelada: su horario ya estaba ocupado' : `${cita.fecha} ${cita.hora}`);
    return json({ ok: true, ocupado, id: cita.id, fecha: cita.fecha });
  }
}
