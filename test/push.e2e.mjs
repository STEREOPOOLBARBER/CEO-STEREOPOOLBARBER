// Avisos al celular (worker/modulos/push.js) con un servicio de avisos SIMULADO en 127.0.0.1:8795.
// Se comprueba de verdad: la firma VAPID (ES256) y el cifrado RFC 8291 (la prueba descifra cada aviso con la
// clave del «celular»), a quién le llega cada aviso, que no se repita y que se borre si el celular la rechaza (410).
// Requiere wrangler dev con ALLOW_PIN, PUSH_PERMITIR_LOCAL=true, PUSH_HORA_DIA=00:00 y --test-scheduled.
import http from 'node:http';
import crypto from 'node:crypto';
const B = process.env.BASE || 'http://127.0.0.1:8787';
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const call = async (m, p, b, c) => { const r = await fetch(B + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), Origin: B }, body: b ? JSON.stringify(b) : undefined }); const tx = await r.text(); let j; try { j = JSON.parse(tx) } catch { j = tx } return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] } };
const b64u = b => Buffer.from(b).toString('base64url'), deB64u = s => Buffer.from(s, 'base64url');

// ---- «celulares»: cada uno con su par de claves (como el navegador) y lo que le llegó
const recibidos = [];
const srv = http.createServer((req, res) => { const ch = []; req.on('data', d => ch.push(d)); req.on('end', () => { recibidos.push({ path: req.url, h: req.headers, body: Buffer.concat(ch) }); res.writeHead(req.url.includes('gone') ? 410 : 201); res.end() }) });
await new Promise(r => srv.listen(8795, '127.0.0.1', r));
const celular = nombre => { const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys(); const auth = crypto.randomBytes(16);
  return { nombre, ecdh, auth, sub: { endpoint: `http://127.0.0.1:8795/push/${nombre}`, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } } };
// Descifrado RFC 8291 (lo que hace el navegador al recibir el aviso)
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
function descifrar(cel, body) {
  const sal = body.subarray(0, 16), idlen = body[20], as = body.subarray(21, 21 + idlen), cif = body.subarray(21 + idlen), ua = cel.ecdh.getPublicKey();
  const ecdh = cel.ecdh.computeSecret(as), ikm = hmac(hmac(cel.auth, ecdh), Buffer.concat([Buffer.from('WebPush: info\0'), ua, as, Buffer.from([1])]));
  const prk = hmac(sal, ikm), cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(cif.subarray(-16));
  const p = Buffer.concat([d.update(cif.subarray(0, -16)), d.final()]); return JSON.parse(p.subarray(0, p.lastIndexOf(2)).toString());
}
function vapidOk(h) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.authorization || ''); if (!m) return false;
  const [cab, cuerpo, firma] = m[1].split('.'), pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(deB64u(m[2]).subarray(1, 33)), y: b64u(deB64u(m[2]).subarray(33)) }, format: 'jwk' });
  const p = JSON.parse(deB64u(cuerpo)); return crypto.verify('sha256', Buffer.from(cab + '.' + cuerpo), { key: pub, dsaEncoding: 'ieee-p1363' }, deB64u(firma)) && p.aud === 'http://127.0.0.1:8795' && p.exp > Date.now() / 1000 && /^https?:|^mailto:/.test(p.sub);
}
const espera = async (n, ms = 4000) => { const t = Date.now(); while (recibidos.length < n && Date.now() - t < ms) await new Promise(r => setTimeout(r, 100)) };
const nuevos = async (desde, n) => { await espera(desde + n); await new Promise(r => setTimeout(r, 300)); return recibidos.slice(desde) };
const para = (lista, cel) => lista.filter(x => x.path.endsWith('/' + cel.nombre)).map(x => descifrar(cel, x.body));
const cron = () => fetch(B + '/__scheduled?cron=*/5+*+*+*+*');

const lima = d => new Date(Date.now() - 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), dow = f => new Date(f + 'T12:00:00Z').getUTCDay();
const [d1, d2] = [2, 3, 4, 5, 6, 7].map(lima).filter(f => dow(f) !== 0);
const adm = (await call('POST', '/auth/login', { pin: '5821' })).cookie;
const pn = (await call('GET', '/panel', null, adm)).j;
await call('PUT', '/config', { cfg: pn.cfg, equipo: pn.equipo.map(b => b.id === 'b1' ? { ...b, pin: '7391' } : b.id === 'b2' ? { ...b, pin: '7392' } : b), servicios: pn.servicios }, adm);
const bar1 = (await call('POST', '/auth/login', { pin: '7391' })).cookie, bar2 = (await call('POST', '/auth/login', { pin: '7392' })).cookie;

// ---- clave pública y validaciones
let r = await call('GET', '/publico/push/clave');
check('clave pública VAPID (65 bytes, punto sin comprimir)', r.s === 200 && deB64u(r.j.clave).length === 65 && deB64u(r.j.clave)[0] === 4, JSON.stringify(r.j));
check('la clave no cambia entre llamadas', (await call('GET', '/push/clave', null, adm)).j.clave === r.j.clave);
const dueno = celular('dueno'), b1 = celular('b1'), b2 = celular('b2'), cli = celular('cliente'), muerto = celular('gone');
check('rechaza direcciones que no son de un servicio de avisos', (await call('POST', '/push', { ...dueno.sub, endpoint: 'https://ejemplo.com/robar' }, adm)).s === 400);
check('rechaza claves mal formadas', (await call('POST', '/push', { ...dueno.sub, keys: { p256dh: 'abc', auth: 'x' } }, adm)).s === 400);
check('sin sesión no se activan avisos del panel', (await call('POST', '/push', dueno.sub)).s === 401);
for (const [cel, ck] of [[dueno, adm], [b1, bar1], [b2, bar2]]) check(`${cel.nombre} activa sus avisos`, (await call('POST', '/push', cel.sub, ck)).s === 200);

// ---- equipo: nueva reserva → al dueño y al barbero de la cita, no a otro barbero
let n0 = recibidos.length;
const res = (await call('POST', '/publico/reservas', { servicioId: 's1', barberoId: 'b1', fecha: d1, hora: '10:00', cliente: { nombre: 'Lucho Aviso', tel: '987123456', dni: '', ciudad: 'Lima' }, consentimiento: true })).j;
let ll = await nuevos(n0, 2);
const aD = para(ll, dueno)[0], aB1 = para(ll, b1)[0];
check('nueva reserva: le llega al dueño y al barbero de la cita', aD?.t === 'Nueva reserva' && aB1?.t === 'Nueva reserva' && /Lucho Aviso/.test(aD.b), JSON.stringify(ll.map(x => x.path)));
check('…y no al otro barbero', !para(ll, b2).length);
check('el aviso va firmado (VAPID ES256) y cifrado (aes128gcm)', ll.every(x => vapidOk(x.h) && x.h['content-encoding'] === 'aes128gcm' && +x.h.ttl > 0), JSON.stringify(ll[0]?.h));
check('el aviso no lleva el celular del cliente', !JSON.stringify(aD).includes('987123456'));

// ---- un barbero no puede ser otro, y «probar» llega solo a uno mismo
n0 = recibidos.length; r = await call('POST', '/push/probar', {}, bar2); ll = await nuevos(n0, 1);
check('«probar» le llega solo a quien lo pidió', r.j.enviados === 1 && ll.length === 1 && para(ll, b2)[0]?.t === 'Avisos activados', JSON.stringify(r.j));

// ---- cliente: activa avisos de su cita y el cron le avisa cada cambio una sola vez
check('código inexistente → 404', (await call('POST', '/publico/cita/ZZZZZZ/push', cli.sub)).s === 404);
check('el cliente activa avisos de su cita', (await call('POST', `/publico/cita/${res.codigo}/push`, cli.sub)).s === 200);
check('…y otro celular que luego dejará de existir', (await call('POST', `/publico/cita/${res.codigo}/push`, muerto.sub)).s === 200);
n0 = recibidos.length; await cron(); await new Promise(r => setTimeout(r, 800));
check('sin cambios en la cita, el cron no avisa nada', recibidos.length === n0, recibidos.slice(n0).map(x => x.path).join());
await call('PATCH', '/citas/' + res.id, { estado: 'confirmada', adelantoOk: true }, adm);
n0 = recibidos.length; await cron(); ll = await nuevos(n0, 2);
const conf = para(ll, cli)[0];
check('al validar el Yape: «Tu cita está confirmada» (abre su cita)', /confirmada/i.test(conf?.b || '') && conf.u === '/cita/' + res.codigo && conf.tag === 'cita-' + res.codigo, JSON.stringify(conf));
check('el celular que respondió 410 se borra', ll.some(x => x.path.endsWith('/gone')));
n0 = recibidos.length; await cron(); await new Promise(r => setTimeout(r, 800));
check('no se repite el aviso (y al borrado ya no se le manda)', recibidos.length === n0, recibidos.slice(n0).map(x => x.path).join());

// el cliente reprograma desde su app: él no recibe «cambió», pero el equipo sí se entera
n0 = recibidos.length;
r = await call('POST', `/publico/cita/${res.codigo}/reprogramar`, { fecha: d2, hora: '11:00' });
ll = await nuevos(n0, 2);
check('el cliente reprograma: al dueño y a su barbero les llega «Cita reprogramada»', r.s === 200 && para(ll, dueno)[0]?.t === 'Cita reprogramada' && para(ll, b1)[0]?.t === 'Cita reprogramada', JSON.stringify(r.j) + ll.map(x => x.path));
n0 = recibidos.length; await cron(); await new Promise(r => setTimeout(r, 800));
check('…y a él no se le avisa su propio cambio', !para(recibidos.slice(n0), cli).length);
n0 = recibidos.length; await call('POST', `/publico/cita/${res.codigo}/confirmar`, {}); ll = await nuevos(n0, 2);
check('«Confirmó que viene» le llega al equipo', para(ll, dueno)[0]?.t === 'Confirmó que viene', ll.map(x => x.path).join());

// la barbería cambia la cita a mañana: primero «cambió», en la vuelta siguiente el recordatorio del día anterior
const manana = lima(1);
await call('PATCH', '/citas/' + res.id, { fecha: manana, hora: '20:00' }, adm);
n0 = recibidos.length; await cron(); ll = await nuevos(n0, 1);
check('si la barbería cambia la cita: «Tu cita cambió»', /cambió/.test(para(ll, cli)[0]?.b || ''), JSON.stringify(para(ll, cli)));
n0 = recibidos.length; await cron(); ll = await nuevos(n0, 1);
check('…y luego el recordatorio del día anterior', /te recordamos tu cita mañana/i.test(para(ll, cli)[0]?.b || ''), JSON.stringify(para(ll, cli)));
n0 = recibidos.length; await cron(); await new Promise(r => setTimeout(r, 800));
check('el recordatorio sale una sola vez', recibidos.length === n0);

// atendido: «¿cómo te atendimos?»
await call('PATCH', '/citas/' + res.id, { estado: 'atendida' }, adm);
n0 = recibidos.length; await cron(); ll = await nuevos(n0, 1);
check('ya atendido: le pide calificar', /cómo te atendimos/i.test(para(ll, cli)[0]?.b || ''), JSON.stringify(para(ll, cli)));
check('una cita terminada ya no acepta avisos nuevos', (await call('POST', `/publico/cita/${res.codigo}/push`, celular('tarde').sub)).s === 400);

// ---- apagar
check('el barbero apaga sus avisos', (await call('DELETE', '/push', b1.sub, bar1)).s === 200);
n0 = recibidos.length;
const res2 = (await call('POST', '/publico/reservas', { servicioId: 's1', barberoId: 'b1', fecha: d1, hora: '12:00', cliente: { nombre: 'Otro Cliente', tel: '987123457', ciudad: 'Lima' }, consentimiento: true })).j;
ll = await nuevos(n0, 1);
check('apagado ya no recibe; el dueño sí', !!res2.codigo && para(ll, dueno).length === 1 && !para(ll, b1).length, ll.map(x => x.path).join());
check('la migración v9 (avisos) quedó registrada', (await call('GET', '/diagnostico', null, adm)).j.db?.migraciones?.includes(9));
srv.close(); console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
