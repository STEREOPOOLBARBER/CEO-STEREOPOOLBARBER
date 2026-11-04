import { rehacerClientes } from './clientes.js';
import { codigo, fail, json } from '../comun.js';
import { INSERT_CITA, bump, filaCita, guardarAudio, guardarFoto, kvStmt, paramsCita } from '../datos.js';
import { auditar, pinPermitido, quienEs } from './auth.js';

/* Links personales, fotos y audios del panel, exportar e importar todo el sistema. */
export async function rutasConfig(c) {
  const { req, env, path, m, body, d, s, exigir, propia } = c;
  let x;
  if (path === '/links' && m === 'GET') {
    exigir('links'); const r = await env.DB.prepare('SELECT data FROM links ORDER BY creado DESC LIMIT 300').all();
    return json(r.results.map(x => JSON.parse(x.data)));
  }
  if (path === '/links' && m === 'POST') {
    exigir('links'); const l = await body();
    if (!l.id || !/^[\w-]{6,80}$/.test(l.token || '')) fail(400, 'Link no válido');
    await env.DB.prepare('INSERT INTO links(id, token, creado, data) VALUES(?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').bind(l.id, l.token, Date.now(), JSON.stringify(l)).run();
    return json(l);
  }
  if ((x = path.match(/^\/links\/([\w-]+)$/)) && m === 'DELETE') {
    exigir('links'); await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(x[1]).run(); return json({ ok: true });
  }
  if (path === '/fotos' && m === 'POST') return json({ key: await guardarFoto(env, (await body()).data) });
  if (path === '/audio' && m === 'POST') { exigir('config'); return json({ key: await guardarAudio(env, (await body()).data) }) }

  /* ----- respaldo completo (migrar desde el modo local) ----- */
  if (path === '/exportar' && m === 'GET') {
    exigir('excel');
    const [c, l] = await Promise.all([env.DB.prepare('SELECT * FROM citas').all(), env.DB.prepare('SELECT data FROM links').all()]);
    return json({ v: 4, fecha: new Date().toISOString(), ...d, citas: c.results.map(filaCita), links: l.results.map(r => JSON.parse(r.data)) });
  }
  if (path === '/importar' && m === 'POST') {
    exigir('config'); const b = await body();
    await auditar(env, quienEs(s), 'Restauró respaldo', '', `${Array.isArray(b.citas) ? b.citas.length : 0} citas`);
    if (!b.cfg || !Array.isArray(b.citas)) fail(400, 'Archivo no válido');
    if (!pinPermitido(env)) { delete b.cfg.adminPin; b.barberos = (b.barberos || []).map(({ pin, ...x }) => x); b.usuarios = (b.usuarios || []).map(({ pin, ...x }) => x) }
    let fotos = 0;
    for (const [k, v] of Object.entries(b.fotos || {})) if (/^f_[\w-]+$/.test(k)) { try { await guardarFoto(env, v, k); fotos++ } catch { } }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM citas'), env.DB.prepare('DELETE FROM links'),
      kvStmt(env, 'cfg', b.cfg), kvStmt(env, 'barberos', b.barberos || []), kvStmt(env, 'servicios', b.servicios || []), kvStmt(env, 'usuarios', b.usuarios || []),
    ]);
    let n = 0, err = 0;
    const citas = b.citas.filter(c => !c.demo && c.id && c.fecha);
    for (let i = 0; i < citas.length; i += 50) {
      const lote = citas.slice(i, i + 50).map(c => env.DB.prepare(INSERT_CITA.replace('INSERT', 'INSERT OR IGNORE')).bind(...paramsCita({ estado: 'confirmada', codigo: codigo(), ...c })));
      const rs = await env.DB.batch(lote); for (const r of rs) r.meta?.changes ? n++ : err++;
    }
    for (const l of (b.links || []).filter(l => l.id && l.token)) await env.DB.prepare('INSERT OR IGNORE INTO links(id, token, creado, data) VALUES(?, ?, ?, ?)').bind(l.id, l.token, l.creado || Date.now(), JSON.stringify(l)).run();
    await bump(env);
    await rehacerClientes(env);
    return json({ citas: n, omitidas: err, fotos });
  }

}
