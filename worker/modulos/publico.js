import { ACTIVOS, DEF, addD, ahoraLocal, codigo, fail, json, minutosHasta, reglaReprog, slotsDia, str, toMin, trabaja, uid } from '../comun.js';
import { audiosPublicos, citaPorId, datos, expirar, filaCita, fotosPublicas, guardarCita, guardarFoto, insertarCita } from '../datos.js';
import { auditar, sesion } from './auth.js';
import { consultarDni } from './dni.js';
import { anotarSeg, fichaValida, frenar, ipDe, limitar, nuevaFicha, turnstileOk } from './seguridad.js';

export function vistaPublica(d) {
  const { adminPin, permBarbero, ...cfg } = d.cfg;
  return {
    cfg,
    barberos: d.barberos.filter(b => b.activo !== false).map(({ pin, comision, email, ...b }) => b),
    servicios: d.servicios.filter(s => s.activo !== false),
  };
}

/* ---------- reserva pública ---------- */
export async function reservar(req, env, b) {
  await frenar(env, 'RL_RES', 'r:' + ipDe(req));
  await limitar(env, 'r:' + ipDe(req), 15, 60 * 60e3);
  if (!await turnstileOk(env, b.turnstile, ipDe(req))) { await anotarSeg(env, 'robot'); fail(400, 'No pudimos verificar que no eres un robot. Inténtalo de nuevo.') }
  const cliente = { nombre: str(b.cliente?.nombre, 80), tel: String(b.cliente?.tel || '').replace(/\D/g, '').slice(-9), dni: String(b.cliente?.dni || '').replace(/\D/g, ''), ciudad: str(b.cliente?.ciudad, 60) };
  if (cliente.nombre.length < 3) fail(400, 'Escribe tu nombre completo');
  if (!/^9\d{8}$/.test(cliente.tel)) fail(400, 'Escribe un WhatsApp válido (9 dígitos, empieza con 9)');
  if (cliente.dni && cliente.dni.length !== 8) fail(400, 'El DNI debe tener 8 dígitos (o déjalo vacío)');
  if (cliente.ciudad.length < 2) fail(400, 'Escribe tu ciudad o distrito');
  // Ley 29733: sin consentimiento informado no se guardan los datos. Se deja constancia de cuándo y de qué versión del aviso.
  if (b.consentimiento !== true) fail(400, 'Marca la casilla de aceptación para continuar');

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
    const c = { id: uid(), codigo: codigo(), creada: Date.now(), ...base, barberoId: barb.id, consentimiento: { ts: Date.now(), aviso: 'privacidad.html', version: 1 } };
    const extra = link ? [env.DB.prepare('UPDATE links SET data = ? WHERE id = ?').bind(JSON.stringify({ ...link, estado: 'usado', citaId: c.id, usado: Date.now() }), link.id)] : [];
    try { await insertarCita(env, c, extra); await auditar(env, 'Cliente', 'Reservó', c.codigo, `${c.cliente?.nombre || ''} · ${c.fecha} ${c.hora}`); return json({ id: c.id, codigo: c.codigo, expira: c.expira, barberoId: c.barberoId, estado: c.estado }) }
    catch (e) { if (e.status !== 409) throw e }
  }
  fail(409, 'Ese horario se acaba de ocupar 😕');
}


/* Rutas públicas: formulario, estado de cita, reprogramar, fotos y audios públicos. */
export async function rutasPublicas(c) {
  const { req, env, path, m, body, d, s, exigir, propia } = c;
  let x;
  if (path === '/publico' && m === 'GET') {
    await expirar(env);
    const d = await datos(env), hoy = ahoraLocal(env).fecha;
    const r = await env.DB.prepare(`SELECT barbero_id AS b, fecha AS f, hora AS h FROM citas WHERE fecha >= ? AND hora <> '' AND estado IN (${ACTIVOS.map(() => '?').join(',')})`).bind(addD(hoy, -1), ...ACTIVOS).all();
    return json({ ...vistaPublica(d), ocupados: r.results, ts: env.TURNSTILE_SITEKEY || '' });
  }
  if ((x = path.match(/^\/publico\/dni\/(\d{8})$/)) && m === 'GET') {
    await frenar(env, 'RL_DNI', ipDe(req), [10, 60e3]);
    if (!await fichaValida(env, req.headers.get('X-Ficha'))) { await anotarSeg(env, 'sin_ficha'); fail(403, 'Recarga la página para consultar tu DNI.') }
    return json(await consultarDni(env, x[1]));
  }
  if (path === '/publico/ficha' && m === 'POST') {
    await frenar(env, 'RL_RES', 'f:' + ipDe(req), [10, 60e3]);
    if (!await turnstileOk(env, (await body()).turnstile, ipDe(req))) { await anotarSeg(env, 'robot'); fail(403, 'No pudimos verificar que no eres un robot. Inténtalo de nuevo.') }
    return json(await nuevaFicha(env));
  }
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
    const cfg = { ...DEF, ...d.cfg }, rg = reglaReprog(env, cfg, c);
    return json({ barberoId: c.barberoId, reprog: c.reprog || 0, puedeReprog: rg.ok, tolerancia: +cfg.tolerancia || 0, horasReprog: +cfg.horasReprog || 24, codigo: c.codigo, estado: c.estado, fecha: c.fecha, hora: c.hora, servicio: c.servicioNombre || '', precio: +c.precio || 0, adelanto: +c.adelanto || 0, adelantoOk: !!c.adelantoOk, barbero: b?.nombre || '', cliente: { nombre: c.cliente?.nombre || '', tel: '••• ••• ' + String(c.cliente?.tel || '').slice(-3) }, sinComprobante: c.estado === 'por_validar' && !c.yapeCaptura && !!c.expira, expira: c.expira ?? null });
  }
  if ((x = path.match(/^\/publico\/cita\/([A-Za-z0-9]{6})\/reprogramar$/)) && m === 'POST') {
    await frenar(env, 'RL_RES', 'rp:' + ipDe(req));
    await limitar(env, 'rp:' + ipDe(req), 10, 60 * 60e3);
    await expirar(env);
    const r = await env.DB.prepare('SELECT * FROM citas WHERE codigo = ?').bind(x[1].toUpperCase()).first();
    if (!r) fail(404, 'No encontramos una cita con ese código');
    const c = filaCita(r), d = await datos(env), cfg = { ...DEF, ...d.cfg }, b = await body();
    const rg = reglaReprog(env, cfg, c); if (!rg.ok) fail(403, rg.motivo);
    const fecha = String(b.fecha || ''), hora = String(b.hora || ''), ahora = ahoraLocal(env);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fail(400, 'Fecha no válida');
    if (fecha === c.fecha && hora === c.hora) fail(400, 'Elige un día u hora distinto al actual');
    const ini = addD(ahora.fecha, +cfg.anticipacion || 0), fin = addD(ini, Math.max(1, +cfg.ventana || 14) - 1);
    if (fecha < ini || fecha > fin) fail(400, 'Esa fecha no está disponible');
    if (!slotsDia(cfg).includes(hora)) fail(400, 'Horario no válido');
    if (minutosHasta(env, fecha, hora) <= 10) fail(400, 'Esa hora ya pasó, elige otra');
    if (!trabaja(cfg, d.barberos.find(y => y.id === c.barberoId), fecha)) fail(400, 'Tu barbero no atiende ese día');
    const antes = { fecha: c.fecha, hora: c.hora };
    Object.assign(c, { fecha, hora, reprog: (c.reprog || 0) + 1, reprogDe: antes, reprogTs: Date.now(), upd: Date.now() });
    await guardarCita(env, c);
    await auditar(env, 'Cliente', 'Reprogramó', c.codigo, `${c.cliente?.nombre || ''} · ${antes.fecha} ${antes.hora} → ${fecha} ${hora}`);
    return json({ ok: true, fecha, hora });
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

  if ((x = path.match(/^\/audio\/(a_[\w-]+)$/)) && m === 'GET') {
    const d = await datos(env);
    if (!audiosPublicos(d).has(x[1]) && !await sesion(req, env, d)) fail(401, 'Inicia sesión para oír este audio');
    if (!env.FOTOS) fail(503, 'Falta conectar el almacén de fotos (R2)');
    const o = await env.FOTOS.get(x[1]); if (!o) fail(404, 'Audio no encontrado');
    return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'audio/wav', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  }

}
