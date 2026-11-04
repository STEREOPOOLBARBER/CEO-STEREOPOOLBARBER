import { DEF, addD, ahoraLocal, fail, json, str, uid } from '../comun.js';
import { leerKV } from '../datos.js';
import { auditar, quienEs } from './auth.js';
import { descifrar, respaldar } from './respaldos.js';
import { anotarSeg } from './seguridad.js';

/* Monitoreo: seguridad, avisos, bitácora, respaldos y diagnóstico. */
export async function rutasMonitoreo(c) {
  const { req, env, path, m, body, d, s, exigir, propia } = c;
  let x;
  if (path === '/seguridad' && m === 'GET') {
    exigir('config'); await anotarSeg(env, '_', true);
    const hoy = ahoraLocal(env).fecha, desde = addD(hoy, -13), tsDesde = Date.parse(desde + 'T05:00:00Z');
    const [cont, acc, web, resp] = await Promise.all([
      env.DB.prepare("SELECT k, n FROM contadores WHERE (k >= ? AND k LIKE 'seg:%') OR (k >= ? AND k LIKE 'dni:%')").bind('seg:' + desde, 'dni:' + desde).all(),
      env.DB.prepare("SELECT date(ts / 1000 - 18000, 'unixepoch') AS f, SUM(ok = 0) AS fallos, SUM(ok = 1) AS ok FROM accesos WHERE ts >= ? GROUP BY f").bind(tsDesde).all(),
      env.DB.prepare("SELECT date(creada / 1000 - 18000, 'unixepoch') AS f, COUNT(*) AS n FROM citas WHERE creada >= ? AND json_extract(data, '$.origen') IN ('web', 'link') GROUP BY f").bind(tsDesde).all(),
      leerKV(env, ['ultimoRespaldo']),
    ]);
    const dias = {}; for (let f = desde; f <= hoy; f = addD(f, 1)) dias[f] = { dni: 0, reservas: 0, ingresos: 0, ingresosFallidos: 0, bloqueos: {} };
    for (const x of cont.results) { const [t, f, tipo] = x.k.split(':'); if (!dias[f]) continue; if (t === 'dni') dias[f].dni = x.n; else if (tipo !== '_') dias[f].bloqueos[tipo] = x.n }
    for (const x of acc.results) if (dias[x.f]) { dias[x.f].ingresos = x.ok; dias[x.f].ingresosFallidos = x.fallos }
    for (const x of web.results) if (dias[x.f]) dias[x.f].reservas = x.n;
    return json({ dias, ultimoRespaldo: resp.ultimoRespaldo || null, topeDni: +({ ...DEF, ...d.cfg }).dniTopeDia || 0, turnstile: !!env.TURNSTILE_SECRET, shalom: !!env.SHALOM_API_KEY });
  }
  // Avisos para el dueño (la campana): saldo de DNI, ataques, respaldo atrasado, intentos de ingreso fallidos.
  if (path === '/alertas' && m === 'GET') {
    if (!s.perm.config) return json([]);
    const hoy = ahoraLocal(env).fecha, tope = +({ ...DEF, ...d.cfg }).dniTopeDia || 0;
    const [cont, acc, resp] = await Promise.all([
      env.DB.prepare("SELECT k, n FROM contadores WHERE k = ? OR k LIKE ?").bind('dni:' + hoy, 'seg:' + hoy + ':%').all(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM accesos WHERE ok = 0 AND ts > ?').bind(Date.now() - 864e5).first(),
      leerKV(env, ['ultimoRespaldo']),
    ]);
    const out = [], dni = cont.results.find(x => x.k === 'dni:' + hoy)?.n || 0, bloq = cont.results.filter(x => x.k.startsWith('seg:') && !x.k.endsWith(':_')).reduce((a, x) => a + x.n, 0);
    if (tope && dni >= tope * .8) out.push({ k: 'dni_' + hoy + (dni >= tope ? '_full' : ''), i: '🪪', t: dni >= tope ? 'Se acabaron las consultas de DNI de hoy' : `Consultas de DNI al ${Math.round(dni / tope * 100)}%`, s: `${dni} de ${tope}. Puedes subir el tope en ⚙️ Config → Seguridad.` });
    if (bloq >= 50) out.push({ k: 'seg_' + hoy + '_' + (bloq >= 500 ? 500 : bloq >= 200 ? 200 : 50), i: '🛡️', t: `${bloq} solicitudes bloqueadas hoy`, s: 'Alguien está intentando abusar del formulario o de la API. Ya está frenado; revisa ⚙️ Config → Seguridad.' });
    if (acc.n >= 10) out.push({ k: 'acc_' + hoy + '_' + (acc.n >= 50 ? 50 : 10), i: '🔐', t: `${acc.n} intentos de ingreso fallidos en 24 h`, s: 'Revisa el registro de accesos en ⚙️ Config → Seguridad.' });
    const rep = await env.DB.prepare('SELECT semana, datos, creado FROM reportes ORDER BY semana DESC LIMIT 1').first();
    if (rep && rep.creado > Date.now() - 3 * 864e5) { const j = JSON.parse(rep.datos), dif = j.anterior?.ingresos ? Math.round((j.ingresos - j.anterior.ingresos) / j.anterior.ingresos * 100) : null; out.push({ k: 'rep_' + rep.semana, i: '📊', t: 'Tu reporte semanal está listo', s: `Semana del ${rep.semana.slice(8)}/${rep.semana.slice(5, 7)}: S/ ${j.ingresos} · ${j.atendidos} cortes${dif !== null ? ` · ${dif >= 0 ? '↑' : '↓'} ${Math.abs(dif)}% vs. semana anterior` : ''}`, accion: 'reporte', semana: rep.semana }) }
    const u = resp.ultimoRespaldo; if (!u || u.fecha < addD(hoy, -2)) out.push({ k: 'resp_' + hoy, i: '💾', t: u ? 'El respaldo automático está atrasado' : 'Aún no hay respaldo automático', s: u ? `Último: ${u.fecha}. Crea uno en ⚙️ Config → Seguridad.` : 'Se crea solo cada madrugada; también puedes crearlo ahora en ⚙️ Config → Seguridad.' });
    return json(out);
  }
  if (path === '/auditoria' && m === 'GET') {
    exigir('config'); const q = new URL(req.url).searchParams, lim = Math.min(100, Math.max(1, +q.get('limit') || 50)), off = Math.max(0, +q.get('offset') || 0), obj = str(q.get('objeto') || '', 80);
    const w = obj ? ' WHERE objeto = ?' : '', a = obj ? [obj] : [];
    const [t, r] = await Promise.all([env.DB.prepare('SELECT COUNT(*) AS n FROM auditoria' + w).bind(...a).first(), env.DB.prepare('SELECT * FROM auditoria' + w + ' ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?').bind(...a, lim, off).all()]);
    return json({ total: t.n, items: r.results });
  }
  if (path === '/respaldos' && m === 'GET') {
    exigir('excel'); if (!env.FOTOS) fail(503, 'Falta conectar el almacén de fotos (R2)');
    const l = await env.FOTOS.list({ prefix: 'respaldos/', include: ['customMetadata'] });
    return json(l.objects.map(o => ({ fecha: o.key.slice(10, 20), bytes: o.size, citas: +(o.customMetadata?.citas || 0), cifrado: !!o.customMetadata?.cifrado })).sort((a, b) => b.fecha.localeCompare(a.fecha)));
  }
  if (path === '/respaldos' && m === 'POST') { exigir('config'); const r = await respaldar(env); await auditar(env, quienEs(s), 'Creó respaldo', r.fecha, `${r.citas} citas`); return json(r) }
  if ((x = path.match(/^\/respaldos\/(\d{4}-\d{2}-\d{2})$/)) && m === 'GET') {
    exigir('excel'); const o = await env.FOTOS?.get(`respaldos/${x[1]}.json`); if (!o) fail(404, 'Ese respaldo no existe');
    const plano = await descifrar(env, await o.arrayBuffer());
    return new Response(plano, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="respaldo-${x[1]}.json"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (path === '/diagnostico' && m === 'GET') {
    exigir('config');
    const out = { db: { ok: false }, fotos: { ok: false } };
    try {
      const n = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM citas) AS citas, (SELECT COUNT(*) FROM links) AS links').first();
      out.db = { ok: true, ...n, migraciones: (await env.DB.prepare('SELECT v FROM _migraciones ORDER BY v').all()).results.map(r => r.v) };
    } catch (e) { out.db = { ok: false, error: String(e.message || e) } }
    try {
      if (!env.FOTOS) throw new Error('No está conectado el almacén FOTOS');
      const k = '_diag_' + uid();
      await env.FOTOS.put(k, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'application/octet-stream' } });
      const o = await env.FOTOS.get(k); const ok = !!o && (await o.arrayBuffer()).byteLength === 3;
      await env.FOTOS.delete(k);
      out.fotos = ok ? { ok: true } : { ok: false, error: 'No se pudo leer lo guardado' };
    } catch (e) { out.fotos = { ok: false, error: String(e.message || e) } }
    return json(out);
  }

}
