import { actualizarCliente, cursorDe, leerCursor, rehacerClientes, telDe } from './clientes.js';
import { PERMS, ROLES, addD, bloquesDe, bloquesOk, ahoraLocal, codigo, fail, json, norm, str, uid } from '../comun.js';
import { bumpStmt, citaPorId, sinDatosDeMas, datos, expirar, filaCita, guardarCita, insertarCita, kvStmt, leerKV } from '../datos.js';
import { auditar, identDe, personaDe, pinPermitido, quienEs } from './auth.js';
import { filtrosCitas, MONTO, ordenCitas } from './filtros.js';
import { contarPapelera, moverAPapelera } from './papelera.js';

/* ---------- vistas según permisos ---------- */
// El equipo completo (con correos) solo lo ve quien configura; el PIN solo existe en pruebas locales.
export function vistaPanel(d, citas, s, env) {
  const sinPin = p => { if (pinPermitido(env)) return p; const { pin, ...x } = p; return x };
  return { cfg: d.cfg, barberos: d.barberos.map(({ pin, email, ...b }) => s.perm.config ? { ...b, email } : b), servicios: d.servicios, equipo: s.perm.config ? d.equipo.map(sinPin) : [], yo: { ...identDe(personaDe(d, s.pid)), perm: s.perm, bloqueo: s.bloqueo || 0 }, citas: enmascarar(s, citas) };
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
export async function visitasPorCliente(env, s, tels) {
  if (!s.perm.verTel) return {};
  if (s.perm.verTodas) {
    const m = {}, ts = [...new Set(tels)].filter(Boolean);
    for (let i = 0; i < ts.length; i += 90) { const p = ts.slice(i, i + 90), r = await env.DB.prepare(`SELECT tel, visitas FROM clientes WHERE visitas > 0 AND tel IN (${p.map(() => '?').join(',')})`).bind(...p).all(); for (const y of r.results) m[y.tel] = y.visitas }
    return m;
  }
  const r = await env.DB.prepare(`SELECT json_extract(data, '$.cliente.tel') AS t, COUNT(*) AS n FROM citas WHERE estado = 'atendida'${s.perm.verTodas ? '' : ' AND barbero_id = ?'} GROUP BY t`).bind(...(s.perm.verTodas ? [] : [s.barberoId])).all();
  const m = {}; for (const x of r.results) { const k = String(x.t || '').replace(/\D/g, '').slice(-9); if (k) m[k] = (m[k] || 0) + x.n }
  return m;
}
/* Lista de citas con filtros (worker/modulos/filtros.js), orden y páginas.
   Sin texto: paginación por cursor (la clave del orden + id): no se repiten ni saltan citas si alguien agenda mientras se pagina.
   Con texto: páginas por offset; en el orden por hora salen primero las próximas (de la más cercana a la más lejana) y luego las pasadas. */
export async function buscarCitas(env, s, q) {
  const hoy = ahoraLocal(env).fecha, { donde, a, txt } = filtrosCitas(s, q), o = ordenCitas(s, q.orden);
  const lim = Math.min(500, Math.max(1, +q.limit || 50)), off = Math.max(0, +q.offset || 0);
  const proximas = txt.length >= 2 && o === ordenCitas(s, 'hora');
  const sel = o.k.map((e, i) => `${e} AS _k${i}`).join(', '), dir = o.desc ? ' DESC' : '';
  const orden = proximas ? ' ORDER BY (fecha < ?), CASE WHEN fecha >= ? THEN fecha || hora END ASC, fecha DESC, hora DESC, id' : ' ORDER BY ' + o.k.map(e => e + dir).join(', ');
  const cur = txt.length < 2 && q.cursor ? leerCursor(q.cursor) : null, conCursor = Array.isArray(cur) && cur.length === o.k.length;
  const cw = conCursor ? ` AND (${o.k.join(', ')}) ${o.desc ? '<' : '>'} (${o.k.map(() => '?').join(', ')})` : '';
  const [tot, r] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM citas' + donde).bind(...a).first(),
    env.DB.prepare(`SELECT *, ${sel} FROM citas${donde}${cw}${orden} LIMIT ? OFFSET ?`).bind(...a, ...(conCursor ? cur : []), ...(proximas ? [hoy, hoy] : []), lim, conCursor ? 0 : off).all(),
  ]);
  const u = r.results.at(-1);
  return { total: tot.n, items: enmascarar(s, r.results.map(filaCita)), offset: off, limit: lim, siguiente: txt.length < 2 && r.results.length === lim ? cursorDe(o.k.map((_, i) => u['_k' + i])) : null };
}
/* Números de las etiquetas: cuántas citas (y cuánto suman) hay por estado con los mismos filtros.
   «Yape por validar» se cuenta en todos los días: es trabajo pendiente que no debe esconderse. */
export async function conteoCitas(env, s, q) {
  const f = filtrosCitas(s, q, { sinEstado: true }), p = filtrosCitas(s, q, { sinEstado: true, sinPeriodo: true });
  const [r, pv] = await Promise.all([
    env.DB.prepare(`SELECT estado, COUNT(*) AS n, SUM(${MONTO}) AS m FROM citas${f.donde} GROUP BY estado`).bind(...f.a).all(),
    env.DB.prepare(`SELECT COUNT(*) AS n, SUM(${MONTO}) AS m FROM citas${p.donde} AND estado IN ('por_validar', 'pendiente_pago')`).bind(...p.a).first(),
  ]);
  const m = x => s.perm.verMontos ? Math.round((x || 0) * 100) / 100 : null;
  return { estados: Object.fromEntries(r.results.map(x => [x.estado, { n: x.n, m: m(x.m) }])), porValidar: { n: pv.n, m: m(pv.m) } };
}

/* La cita lleva la duración de su servicio (bloques); la de 1 hora no guarda nada. */
const conBloques = (c, d) => { const bl = bloquesDe(d, c.servicioId); if (bl.length > 1) c.bloques = bl; else delete c.bloques };
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
    const [r, pri] = await Promise.all([
      env.DB.prepare(`SELECT * FROM citas WHERE ((fecha BETWEEN ? AND ?) OR estado = 'por_validar')${sb} ORDER BY fecha, hora`).bind(desde, hasta, ...ab).all(),
      env.DB.prepare(`SELECT MIN(fecha) AS f FROM citas WHERE 1 = 1${sb}`).bind(...ab).first(),
    ]);
    const vis = await visitasPorCliente(env, s, r.results.map(x => x.tel)), wa = (await leerKV(env, ['whatsappApi'])).whatsappApi || {};
    const papelera = await contarPapelera(env, s);
    return json({ ...vistaPanel(d, r.results.map(filaCita), s, env), papelera, v: ver, ventana: { desde, hasta }, visitas: vis, primeraFecha: pri?.f || null, wa: { ok: !!wa.conectado?.ok, diaAntes: !!wa.auto?.diaAntes } });
  }
  if (path === '/citas/conteo' && m === 'GET') return json(await conteoCitas(env, s, Object.fromEntries(new URL(req.url).searchParams)));
  if (path === '/citas/buscar' && m === 'GET') {
    return json(await buscarCitas(env, s, Object.fromEntries(new URL(req.url).searchParams)));
  }
  if (path === '/config' && m === 'PUT') {
    exigir('config'); const b = await body();
    if (!b.cfg || typeof b.cfg !== 'object' || !Array.isArray(b.equipo) || !Array.isArray(b.servicios)) fail(400, 'Datos no válidos');
    const equipo = validarEquipo(b.equipo, d.equipo, s, env), { adminPin, permBarbero, ...cfg } = b.cfg;
    { const cambios = Object.keys({ ...d.cfg, ...cfg }).filter(k => JSON.stringify(d.cfg[k]) !== JSON.stringify(cfg[k]));
      const lista = (a, z, t) => { const ids = new Set(a.map(x => x.id)), nz = new Set(z.map(x => x.id)); return [...z.filter(x => !ids.has(x.id)).map(x => '+' + t + ' ' + x.nombre), ...a.filter(x => !nz.has(x.id)).map(x => '−' + t + ' ' + x.nombre), ...z.filter(x => ids.has(x.id) && JSON.stringify(x) !== JSON.stringify(a.find(y => y.id === x.id))).map(x => '✎' + t + ' ' + x.nombre)] };
      const det = [cambios.length ? 'config: ' + cambios.join(', ') : '', ...lista(d.equipo, equipo, 'persona'), ...lista(d.servicios, b.servicios, 'servicio')].filter(Boolean).join(' · ');
      if (det) await auditar(env, quienEs(s), 'Configuración', '', det) }
    const servicios = b.servicios.map(x => { const { bloques, ...y } = x || {}; return bloquesOk(bloques) && bloques.length > 1 ? { ...y, bloques } : y }); // duración: solo si es válida
    await env.DB.batch([kvStmt(env, 'cfg', cfg), kvStmt(env, 'equipo', equipo), kvStmt(env, 'servicios', servicios), bumpStmt(env)]);
    return json({ ok: true });
  }
  if (path === '/citas' && m === 'POST') {
    exigir('crear'); const b = await body();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) fail(400, 'Fecha no válida');
    const { id, codigo: _c, creada, ...resto } = b;
    const c = { ...resto, id: uid(), codigo: codigo(), creada: Date.now(), estado: b.estado || 'confirmada', creadoPor: s.pid };
    sinDatosDeMas(c); conBloques(c, d);
    if (!s.perm.verTodas) c.barberoId = s.barberoId;
    const nueva = await insertarCita(env, c);
    await auditar(env, quienEs(s), 'Creó cita', c.codigo, `${c.cliente?.nombre || ''} · ${c.fecha} ${c.hora} · ${c.estado}`);
    return json(nueva);
  }
  if ((x = path.match(/^\/citas\/([\w-]+)$/)) && (m === 'PATCH' || m === 'DELETE')) {
    const c = await citaPorId(env, x[1]); if (!c) fail(404, 'La cita ya no existe'); propia(c);
    if (m === 'DELETE') { exigir('cancelar'); await moverAPapelera(env, c, s); return json({ ok: true, papelera: true }) } // se puede recuperar 7 días
    const { id, codigo: _c, creada, ...patch } = await body();
    if (['cancelada', 'no_vino'].includes(patch.estado)) exigir('cancelar');
    else if ('adelantoOk' in patch) { if (!s.perm.yape && !s.perm.crear) fail(403, 'No tienes permiso para validar pagos') }
    else exigir('crear');
    if (!s.perm.verTodas && patch.barberoId && patch.barberoId !== s.barberoId) fail(403, 'No puedes pasar la cita a otro barbero');
    const antes = { ...c };
    Object.assign(c, sinDatosDeMas(patch), { upd: Date.now() });
    if ('servicioId' in patch && patch.servicioId !== antes.servicioId) conBloques(c, d); // cambió el servicio: cambia la duración
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
        sinDatosDeMas(raw);
        const ex = raw.codigo && await env.DB.prepare('SELECT * FROM citas WHERE codigo = ?').bind(raw.codigo).first();
        if (ex) { const c = { ...filaCita(ex), ...raw, id: ex.id, upd: Date.now() }; await guardarCita(env, c); u++ }
        else { await insertarCita(env, { estado: 'confirmada', ...raw, id: uid(), creada: raw.creada || Date.now(), codigo: raw.codigo || codigo() }); n++ }
      } catch { err++ }
    }
    if (n || u) await rehacerClientes(env);
    return json({ n, u, err });
  }
}

/* El equipo que manda el panel: se limpia y se valida en el servidor (la única verdad de quién entra y qué puede hacer). */
export function validarEquipo(lista, anterior, s, env) {
  const ids = new Set(), correos = new Set(), dia = n => Number.isInteger(n) && n >= 0 && n <= 6;
  const equipo = lista.map(p => {
    const id = str(p?.id, 40), rol = ROLES.includes(p?.rol) ? p.rol : 'personal', email = norm(p?.email || '');
    if (!/^[\w-]{1,40}$/.test(id) || ids.has(id)) fail(400, 'Hay una persona repetida o sin identificación');
    if (!str(p.nombre, 60)) fail(400, 'Cada persona necesita un nombre');
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || correos.has(email))) fail(400, `El correo ${email} no es válido o ya lo usa otra persona`);
    ids.add(id); if (email) correos.add(email);
    const x = { id, nombre: str(p.nombre, 60), rol, permisos: Object.fromEntries(PERMS.map(k => [k, rol !== 'dueno' && !!p.permisos?.[k]])), atiende: !!p.atiende, activo: p.activo !== false, email,
      foto: /^f_[\w-]+$/.test(p.foto || '') ? p.foto : '', color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '', esp: str(p.esp, 80), dias: Array.isArray(p.dias) ? p.dias.filter(dia) : [], comision: Math.min(100, Math.max(0, +p.comision || 0)) };
    // Servicios que hace (vacío = todos). Se usa para mostrar solo a los barberos que pueden atender lo que pidió el cliente.
    if (Array.isArray(p.servicios) && p.servicios.length) x.servicios = [...new Set(p.servicios.map(v => str(v, 40)).filter(Boolean))].slice(0, 60);
    if (pinPermitido(env) && /^\d{4,6}$/.test(p.pin || '')) x.pin = p.pin;
    return x;
  });
  // Solo un dueño toca a los dueños (agregar, quitar o cambiar), y siempre queda al menos uno activo.
  const duenos = l => JSON.stringify(l.filter(p => p.rol === 'dueno').map(({ pin, ...p }) => p));
  if (s.rol !== 'dueno' && duenos(anterior) !== duenos(equipo)) fail(403, 'Solo el dueño puede cambiar a los dueños');
  if (!equipo.some(p => p.rol === 'dueno' && p.activo)) fail(400, 'Debe quedar al menos un dueño activo');
  return equipo;
}
