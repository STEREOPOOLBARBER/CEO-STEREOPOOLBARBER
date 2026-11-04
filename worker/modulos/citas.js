import { addD, ahoraLocal, codigo, fail, json, str, uid } from '../comun.js';
import { bumpStmt, citaPorId, datos, expirar, filaCita, guardarCita, insertarCita, kvStmt, leerKV } from '../datos.js';
import { auditar, pinPermitido, quienEs } from './auth.js';

/* ---------- vistas según permisos ---------- */
export function vistaPanel(d, citas, s) {
  const cfg = { ...d.cfg }, esConfig = s.perm.config;
  let barberos = d.barberos, usuarios = d.usuarios;
  if (!esConfig) {
    delete cfg.adminPin;
    barberos = barberos.map(({ pin, email, ...b }) => b);
    usuarios = usuarios.filter(u => u.id === s.uid).map(({ pin, email, ...u }) => u);
  }
  return { cfg, barberos, servicios: d.servicios, usuarios, citas: enmascarar(s, citas) };
}
// Lo que cada persona puede ver de las citas: solo las suyas si no ve todas, y el teléfono oculto si no tiene permiso.
export function enmascarar(s, citas) {
  if (!s.perm.verTodas) citas = citas.filter(c => c.barberoId === s.barberoId);
  if (!s.perm.verTel) citas = citas.map(c => c.cliente?.tel ? { ...c, cliente: { ...c.cliente, tel: '••• ••• ' + String(c.cliente.tel).slice(-3), dni: undefined } } : c);
  return citas;
}
/* El panel no descarga toda la historia: solo una ventana de días alrededor de hoy (y los Yape pendientes).
   Lo demás se pide por rango, búsqueda o páginas con /citas/buscar. */
export const VENTANA_ATRAS = 35, VENTANA_ADELANTE = 120;
export async function visitasPorCliente(env, s) {
  if (!s.perm.verTel) return {};
  const r = await env.DB.prepare(`SELECT json_extract(data, '$.cliente.tel') AS t, COUNT(*) AS n FROM citas WHERE estado = 'atendida'${s.perm.verTodas ? '' : ' AND barbero_id = ?'} GROUP BY t`).bind(...(s.perm.verTodas ? [] : [s.barberoId])).all();
  const m = {}; for (const x of r.results) { const k = String(x.t || '').replace(/\D/g, '').slice(-9); if (k) m[k] = (m[k] || 0) + x.n }
  return m;
}
export async function buscarCitas(env, s, q) {
  const w = [], a = [], hoy = ahoraLocal(env).fecha;
  if (!s.perm.verTodas) { w.push('barbero_id = ?'); a.push(s.barberoId) }
  else if (q.barbero) { w.push('barbero_id = ?'); a.push(str(q.barbero, 40)) }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.desde || '')) { w.push('fecha >= ?'); a.push(q.desde) }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.hasta || '')) { w.push('fecha <= ?'); a.push(q.hasta) }
  const est = String(q.estado || '').split(',').filter(e => /^[a-z_]{3,20}$/.test(e)).slice(0, 8);
  if (est.length) { w.push(`estado IN (${est.map(() => '?').join(',')})`); a.push(...est) }
  const txt = String(q.q || '').trim().toLowerCase().slice(0, 60);
  if (txt.length >= 2) {
    const like = '%' + txt.replace(/[\\%_]/g, m => '\\' + m) + '%';
    if (s.perm.verTel) { w.push(`(lower(data) LIKE ? ESCAPE '\\' OR lower(codigo) LIKE ? ESCAPE '\\')`); a.push(like, like) }
    else { w.push(`(lower(json_extract(data, '$.cliente.nombre')) LIKE ? ESCAPE '\\' OR lower(codigo) LIKE ? ESCAPE '\\')`); a.push(like, like) }
  }
  const donde = w.length ? ' WHERE ' + w.join(' AND ') : '';
  const lim = Math.min(500, Math.max(1, +q.limit || 50)), off = Math.max(0, +q.offset || 0);
  // Con búsqueda: primero las próximas (de la más cercana a la más lejana) y luego las pasadas (de la más reciente a la más antigua).
  const orden = txt.length >= 2 ? ` ORDER BY (fecha < ?) , CASE WHEN fecha >= ? THEN fecha || hora END ASC, fecha DESC, hora DESC` : ' ORDER BY fecha, hora';
  const ordArgs = txt.length >= 2 ? [hoy, hoy] : [];
  const [tot, r] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM citas' + donde).bind(...a).first(),
    env.DB.prepare('SELECT * FROM citas' + donde + orden + ' LIMIT ? OFFSET ?').bind(...a, ...ordArgs, lim, off).all(),
  ]);
  return { total: tot.n, items: enmascarar(s, r.results.map(filaCita)), offset: off, limit: lim };
}

/* Agenda: panel, búsqueda paginada, configuración del negocio, crear/editar/eliminar e importar citas. */
export async function rutasCitas(c) {
  const { req, env, path, m, body, d, s, exigir, propia } = c;
  let x;
  if (path === '/panel' && m === 'GET') {
    await expirar(env);
    const ver = String((await leerKV(env, ['ver'])).ver || 0);
    if (new URL(req.url).searchParams.get('v') === ver) return json({ same: true, v: ver });
    const h = ahoraLocal(env).fecha, desde = addD(h, -VENTANA_ATRAS), hasta = addD(h, VENTANA_ADELANTE);
    const sb = s.perm.verTodas ? '' : ' AND barbero_id = ?', ab = s.perm.verTodas ? [] : [s.barberoId];
    const [r, vis] = await Promise.all([
      env.DB.prepare(`SELECT * FROM citas WHERE ((fecha BETWEEN ? AND ?) OR estado = 'por_validar')${sb} ORDER BY fecha, hora`).bind(desde, hasta, ...ab).all(),
      visitasPorCliente(env, s),
    ]);
    return json({ ...vistaPanel(d, r.results.map(filaCita), s), v: ver, ventana: { desde, hasta }, visitas: vis });
  }
  if (path === '/citas/buscar' && m === 'GET') {
    return json(await buscarCitas(env, s, Object.fromEntries(new URL(req.url).searchParams)));
  }
  if (path === '/config' && m === 'PUT') {
    exigir('config'); const b = await body();
    if (!b.cfg || typeof b.cfg !== 'object' || !Array.isArray(b.barberos) || !Array.isArray(b.servicios)) fail(400, 'Datos no válidos');
    if (!pinPermitido(env)) { delete b.cfg.adminPin; b.barberos = b.barberos.map(({ pin, ...x }) => x); if (Array.isArray(b.usuarios)) b.usuarios = b.usuarios.map(({ pin, ...x }) => x) }
    { const ant = d.cfg, cambios = Object.keys({ ...ant, ...b.cfg }).filter(k => k !== 'adminPin' && JSON.stringify(ant[k]) !== JSON.stringify(b.cfg[k]));
      const lista = (a, z, t) => { const ids = new Set(a.map(x => x.id)), nz = new Set(z.map(x => x.id)); return [...z.filter(x => !ids.has(x.id)).map(x => '+' + t + ' ' + x.nombre), ...a.filter(x => !nz.has(x.id)).map(x => '−' + t + ' ' + x.nombre), ...z.filter(x => ids.has(x.id) && JSON.stringify(a.find(y => y.id === x.id)) !== JSON.stringify(x)).map(x => '✎' + t + ' ' + x.nombre)] };
      const det = [cambios.length ? 'config: ' + cambios.join(', ') : '', ...lista(d.barberos, b.barberos, 'barbero'), ...lista(d.servicios, b.servicios, 'servicio'), ...(Array.isArray(b.usuarios) ? lista(d.usuarios, b.usuarios, 'usuario') : [])].filter(Boolean).join(' · ');
      if (det) await auditar(env, quienEs(s), 'Configuración', '', det) }
    await env.DB.batch([kvStmt(env, 'cfg', b.cfg), kvStmt(env, 'barberos', b.barberos), kvStmt(env, 'servicios', b.servicios), ...(Array.isArray(b.usuarios) ? [kvStmt(env, 'usuarios', b.usuarios)] : []), bumpStmt(env)]);
    return json({ ok: true });
  }
  if (path === '/citas' && m === 'POST') {
    exigir('crear'); const b = await body();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) fail(400, 'Fecha no válida');
    const { id, codigo: _c, creada, ...resto } = b;
    const c = { ...resto, id: uid(), codigo: codigo(), creada: Date.now(), estado: b.estado || 'confirmada', creadoPor: s.uid || s.barberoId || 'dueno' };
    if (!s.perm.verTodas) c.barberoId = s.barberoId;
    const nueva = await insertarCita(env, c);
    await auditar(env, quienEs(s), 'Creó cita', c.codigo, `${c.cliente?.nombre || ''} · ${c.fecha} ${c.hora} · ${c.estado}`);
    return json(nueva);
  }
  if ((x = path.match(/^\/citas\/([\w-]+)$/)) && (m === 'PATCH' || m === 'DELETE')) {
    const c = await citaPorId(env, x[1]); if (!c) fail(404, 'La cita ya no existe'); propia(c);
    if (m === 'DELETE') { exigir('cancelar'); await env.DB.batch([env.DB.prepare('DELETE FROM citas WHERE id = ?').bind(c.id), bumpStmt(env)]); await auditar(env, quienEs(s), 'Eliminó cita', c.codigo, `${c.cliente?.nombre || ''} · ${c.fecha} ${c.hora}`); return json({ ok: true }) }
    const { id, codigo: _c, creada, ...patch } = await body();
    if (['cancelada', 'no_vino'].includes(patch.estado)) exigir('cancelar');
    else if ('adelantoOk' in patch) { if (!s.perm.yape && !s.perm.crear) fail(403, 'No tienes permiso para validar pagos') }
    else exigir('crear');
    if (!s.perm.verTodas && patch.barberoId && patch.barberoId !== s.barberoId) fail(403, 'No puedes pasar la cita a otro barbero');
    const antes = { ...c };
    Object.assign(c, patch, { upd: Date.now() });
    if (patch.estado && patch.estado !== 'por_validar') c.expira = null;
    await guardarCita(env, c);
    { const camp = { estado: 'estado', fecha: 'fecha', hora: 'hora', barberoId: 'barbero', servicioNombre: 'servicio', precio: 'precio', adelantoOk: 'Yape validado' };
      const det = Object.entries(camp).filter(([k]) => k in patch && JSON.stringify(antes[k]) !== JSON.stringify(c[k])).map(([k, t]) => `${t}: ${antes[k] ?? '—'} → ${c[k]}`);
      if (patch.cliente && JSON.stringify(antes.cliente) !== JSON.stringify(c.cliente)) det.push('datos del cliente');
      if (['fotoAntes', 'fotoDespues'].some(k => k in patch && patch[k] !== antes[k])) det.push('fotos');
      if (det.length) await auditar(env, quienEs(s), patch.adelantoOk && !antes.adelantoOk ? 'Validó Yape' : patch.estado && patch.estado !== antes.estado ? 'Cambió estado' : 'Editó cita', c.codigo, `${c.cliente?.nombre || ''} · ${det.join(' · ')}`) }
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
}
