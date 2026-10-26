// Prueba de clave y huella (llaves de acceso) con un "celular" simulado.
// Requiere: wrangler dev con --var ALLOW_PIN:true y los datos de prueba de api.e2e.mjs (dueño PIN 5821, barberos b1 y b2).
import crypto from 'node:crypto';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const URLB = new URL(BASE), RPID = URLB.hostname, ORIGEN = URLB.origin;
const b64u = b => Buffer.from(b).toString('base64url');
const dec = s => new Uint8Array(Buffer.from(s, 'base64url'));
const sha = b => new Uint8Array(crypto.createHash('sha256').update(b).digest());
let ok = 0, bad = 0;
const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
async function call(m, p, b, cookie) {
  const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), Origin: ORIGEN }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

/* --- codificador CBOR mínimo para fabricar lo que enviaría el celular --- */
function cb(v) {
  const head = (mt, n) => n < 24 ? [mt << 5 | n] : n < 256 ? [mt << 5 | 24, n] : [mt << 5 | 25, n >> 8, n & 255];
  if (typeof v === 'number') return Buffer.from(v >= 0 ? head(0, v) : head(1, -1 - v));
  if (typeof v === 'string') { const b = Buffer.from(v); return Buffer.concat([Buffer.from(head(3, b.length)), b]) }
  if (v instanceof Uint8Array || Buffer.isBuffer(v)) return Buffer.concat([Buffer.from(head(2, v.length)), Buffer.from(v)]);
  if (v instanceof Map) return Buffer.concat([Buffer.from(head(5, v.size)), ...[...v].flatMap(([k, x]) => [cb(k), cb(x)])]);
  throw new Error('cbor');
}
const derDeRaw = raw => { const t = x => { let i = 0; while (i < x.length - 1 && x[i] === 0) i++; x = x.slice(i); return x[0] & 0x80 ? Buffer.concat([Buffer.from([0]), x]) : x }; const r = t(raw.slice(0, 32)), s = t(raw.slice(32)); const body = Buffer.concat([Buffer.from([2, r.length]), r, Buffer.from([2, s.length]), s]); return Buffer.concat([Buffer.from([0x30, body.length]), body]) };

class Celular {
  async iniciar() { this.par = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); this.jwk = await crypto.webcrypto.subtle.exportKey('jwk', this.par.publicKey); this.id = crypto.randomBytes(32); this.cnt = 0; return this }
  async crear(opts, o = {}) {
    const cd = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: opts.challenge, origin: o.origen || ORIGEN }));
    const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, dec(this.jwk.x)], [-3, dec(this.jwk.y)]]);
    const cnt = Buffer.alloc(4);
    const auth = Buffer.concat([sha(Buffer.from(o.rpId || RPID)), Buffer.from([o.flags ?? 0x45]), cnt, Buffer.alloc(16), Buffer.from([0, this.id.length]), this.id, cb(cose)]);
    return { id: b64u(this.id), rawId: b64u(this.id), type: 'public-key', response: { clientDataJSON: b64u(cd), attestationObject: b64u(cb(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', auth]]))) } };
  }
  async firmar(challenge, o = {}) {
    this.cnt = o.cnt ?? this.cnt + 1;
    const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: o.challenge ?? challenge, origin: o.origen || ORIGEN }));
    const c = Buffer.alloc(4); c.writeUInt32BE(this.cnt);
    const auth = Buffer.concat([sha(Buffer.from(o.rpId || RPID)), Buffer.from([o.flags ?? 0x05]), c]);
    const raw = Buffer.from(await crypto.webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, o.llave || this.par.privateKey, Buffer.concat([auth, sha(cd)])));
    return { id: b64u(this.id), rawId: b64u(this.id), type: 'public-key', response: { clientDataJSON: b64u(cd), authenticatorData: b64u(auth), signature: b64u(derDeRaw(raw)), userHandle: null } };
  }
}
const entrarHuella = async (cel, o = {}) => { const r = await call('GET', '/auth/huella/reto'); const cred = await cel.firmar(r.j.challenge, o); return call('POST', '/auth/huella', { challenge: o.challengeEnviado ?? r.j.challenge, credential: cred }) };

/* ---------------- dueño ---------------- */
const adm = await call('POST', '/auth/login', { pin: '5821' });
check('dueño entra (PIN solo para pruebas)', adm.s === 200);

/* ---------------- CLAVE ---------------- */
let r = await call('PUT', '/acceso/b_b2/clave', { clave: 'ClaveBrayan1' }, adm.cookie);
check('el admin le pone clave a un barbero', r.s === 200, JSON.stringify(r));
r = await call('PUT', '/acceso/b_b2/clave', { clave: '123456' }, adm.cookie); check('clave muy fácil → 400', r.s === 400);
r = await call('PUT', '/acceso/b_b2/clave', { clave: 'abc' }, adm.cookie); check('clave muy corta → 400', r.s === 400);
r = await call('PUT', '/acceso/b_zzz/clave', { clave: 'ClaveLarga99' }, adm.cookie); check('persona que no existe → 404', r.s === 404);
r = await call('GET', '/auth/personal'); check('la pantalla de ingreso lista quién tiene clave (solo nombres)', r.j.length === 1 && r.j[0].nombre === 'Brayan' && Object.keys(r.j[0]).sort().join() === 'nombre,sujeto', JSON.stringify(r.j));
r = await call('GET', '/auth/config'); check('config avisa que hay claves', r.j.clave === true);

let ses = await call('POST', '/auth/clave', { sujeto: 'b_b2', clave: 'ClaveBrayan1' });
check('el barbero entra con su clave', ses.s === 200 && ses.j.rol === 'barbero' && ses.j.barberoId === 'b2' && /brb_s=/.test(ses.cookie), JSON.stringify(ses));
const panelB = await call('GET', '/panel', null, ses.cookie);
check('y ve solo lo suyo (sin PIN ni correos ni config)', panelB.s === 200 && !JSON.stringify(panelB.j).match(/"pin"|adminPin|"email"/));
r = await call('GET', '/acceso', null, ses.cookie); check('el barbero NO puede ver la administración de accesos', r.s === 403);
r = await call('PUT', '/acceso/b_b2/clave', { clave: 'MiNuevaClave9' }, ses.cookie); check('el barbero NO puede cambiarse la clave', r.s === 403);
r = await call('POST', '/acceso/b_b2/invitacion', {}, ses.cookie); check('el barbero NO puede crearse invitaciones', r.s === 403);
r = await call('POST', '/auth/clave', { sujeto: 'b_b2', clave: 'otra-cosa' }); check('clave incorrecta → 403', r.s === 403);
r = await call('POST', '/auth/clave', { sujeto: 'b_b1', clave: 'ClaveBrayan1' }); check('la clave de uno no abre a otro', r.s === 403);

await call('PUT', '/acceso/b_b2/clave', { clave: 'ClaveNueva77' }, adm.cookie);
r = await call('GET', '/panel', null, ses.cookie); check('si el admin cambia la clave, la sesión anterior se cierra', r.s === 401);
r = await call('POST', '/auth/clave', { sujeto: 'b_b2', clave: 'ClaveBrayan1' }); check('la clave vieja ya no sirve', r.s === 403);
ses = await call('POST', '/auth/clave', { sujeto: 'b_b2', clave: 'ClaveNueva77' }); check('la nueva sí', ses.s === 200);
await call('DELETE', '/acceso/b_b2/clave', null, adm.cookie);
r = await call('GET', '/panel', null, ses.cookie); check('si el admin quita la clave, se cierra su sesión', r.s === 401);

// bloqueo por intentos (solo para b1, para no bloquear a b2)
await call('PUT', '/acceso/b_b1/clave', { clave: 'ClaveJhon2026' }, adm.cookie);
const cods = []; for (let i = 0; i < 8; i++) cods.push((await call('POST', '/auth/clave', { sujeto: 'b_b1', clave: 'mala-' + i })).s);
check('tras varios intentos fallidos se bloquea (429)', cods.includes(429) && cods.slice(0, 5).every(c => c === 403), cods.join());
r = await call('POST', '/auth/clave', { sujeto: 'b_b1', clave: 'ClaveJhon2026' }); check('bloqueado: ni con la clave buena entra', r.s === 429, String(r.s));
await call('DELETE', '/acceso/b_b1/clave', null, adm.cookie);

/* ---------------- HUELLA ---------------- */
r = await call('POST', '/acceso/b_zzz/invitacion', {}, adm.cookie); check('invitación para alguien que no existe → 404', r.s === 404);
const inv = await call('POST', '/acceso/b_b1/invitacion', {}, adm.cookie);
check('el admin crea la invitación de huella', inv.s === 200 && /^[A-Z2-9]{10}$/.test(inv.j.codigo), JSON.stringify(inv));
r = await call('POST', '/passkey/opciones', { codigo: 'ABCDEFGHJK' }); check('código inventado → 404', r.s === 404);
const cel = await new Celular().iniciar();
const op = await call('POST', '/passkey/opciones', { codigo: inv.j.codigo.toLowerCase() });
check('el barbero abre su link y recibe las opciones', op.s === 200 && op.j.nombre === 'Jhon' && op.j.publicKey.rp.id === RPID && op.j.publicKey.authenticatorSelection.userVerification === 'required' && op.j.publicKey.authenticatorSelection.residentKey === 'required', JSON.stringify(op.j).slice(0, 200));

// ataques al registro
let mal = await call('POST', '/passkey/registrar', { codigo: inv.j.codigo, challenge: op.j.publicKey.challenge, credential: await cel.crear(op.j.publicKey, { origen: 'https://sitio-falso.example' }) });
check('registro desde otro sitio → rechazado', mal.s === 400, JSON.stringify(mal.j));
const op2 = await call('POST', '/passkey/opciones', { codigo: inv.j.codigo });
mal = await call('POST', '/passkey/registrar', { codigo: inv.j.codigo, challenge: op2.j.publicKey.challenge, credential: await cel.crear(op2.j.publicKey, { rpId: 'otro.example' }) });
check('registro para otro dominio (rpId) → rechazado', mal.s === 400);
const op3 = await call('POST', '/passkey/opciones', { codigo: inv.j.codigo });
mal = await call('POST', '/passkey/registrar', { codigo: inv.j.codigo, challenge: op3.j.publicKey.challenge, credential: await cel.crear(op3.j.publicKey, { flags: 0x41 }) });
check('registro sin verificación biométrica (UV) → rechazado', mal.s === 400);
const op4 = await call('POST', '/passkey/opciones', { codigo: inv.j.codigo });
const reg = await call('POST', '/passkey/registrar', { codigo: inv.j.codigo, challenge: op4.j.publicKey.challenge, credential: await cel.crear(op4.j.publicKey), etiqueta: 'Celular de Jhon' });
check('registro correcto → huella activada', reg.s === 200 && reg.j.ok, JSON.stringify(reg));
r = await call('POST', '/passkey/opciones', { codigo: inv.j.codigo }); check('la invitación es de un solo uso', r.s === 404);
r = await call('POST', '/passkey/registrar', { codigo: inv.j.codigo, challenge: op4.j.publicKey.challenge, credential: await cel.crear(op4.j.publicKey) }); check('repetir el registro → rechazado', r.s === 404);

r = await call('GET', '/acceso', null, adm.cookie);
check('el admin ve la huella registrada', r.j.huellas.length === 1 && r.j.huellas[0].sujeto === 'b_b1' && r.j.huellas[0].etiqueta === 'Celular de Jhon', JSON.stringify(r.j));
r = await call('GET', '/auth/config'); check('config avisa que hay huellas', r.j.huella === true);

// ingreso con huella
let h = await entrarHuella(cel);
check('el barbero entra con su huella (sin escribir nada)', h.s === 200 && h.j.rol === 'barbero' && h.j.barberoId === 'b1' && /brb_s=/.test(h.cookie), JSON.stringify(h));
const sh = h.cookie;
r = await call('GET', '/panel', null, sh); check('la sesión por huella abre su panel', r.s === 200);
r = await call('GET', '/acceso', null, sh); check('con huella tampoco puede administrar accesos', r.s === 403);

// ataques al ingreso
const reto1 = await call('GET', '/auth/huella/reto'); const cred1 = await cel.firmar(reto1.j.challenge);
r = await call('POST', '/auth/huella', { challenge: reto1.j.challenge, credential: cred1 }); check('firma con contador nuevo → entra', r.s === 200);
r = await call('POST', '/auth/huella', { challenge: reto1.j.challenge, credential: cred1 }); check('repetir la misma firma (replay) → rechazado', r.s === 400, String(r.s));
r = await entrarHuella(cel, { cnt: 1 }); check('contador que no sube (llave clonada) → rechazado', r.s === 403, JSON.stringify(r.j));
r = await entrarHuella(cel, { origen: 'https://sitio-falso.example' }); check('firma pensada para otro sitio → rechazado', r.s === 403);
r = await entrarHuella(cel, { rpId: 'otro.example' }); check('firma para otro dominio → rechazado', r.s === 403);
r = await entrarHuella(cel, { flags: 0x01 }); check('sin verificación de huella (UV) → rechazado', r.s === 403);
const intruso = await new Celular().iniciar(); intruso.id = cel.id;
r = await entrarHuella(intruso); check('otra llave con el mismo identificador → firma no coincide', r.s === 403);
const cualquiera = await new Celular().iniciar(); r = await entrarHuella(cualquiera); check('huella que nunca se registró → rechazado', r.s === 403);
r = await entrarHuella(cel, { challengeEnviado: 'inventado' }); check('reto que el servidor no emitió → rechazado', r.s === 400);

// el admin revoca
const lista = await call('GET', '/acceso', null, adm.cookie);
r = await call('DELETE', '/acceso/huella/' + lista.j.huellas[0].id, null, adm.cookie); check('el admin quita la huella', r.s === 200);
r = await call('GET', '/panel', null, sh); check('al quitarla, su sesión se cierra', r.s === 401);
r = await entrarHuella(cel); check('y ya no puede entrar con esa huella', r.s === 403);

// si el barbero se desactiva, pierde todo acceso
await call('PUT', '/acceso/b_b2/clave', { clave: 'ClaveBrayan1' }, adm.cookie);
const s2 = await call('POST', '/auth/clave', { sujeto: 'b_b2', clave: 'ClaveBrayan1' });
const pn = (await call('GET', '/panel', null, adm.cookie)).j;
await call('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos.map(b => b.id === 'b2' ? { ...b, activo: false } : b), servicios: pn.servicios, usuarios: pn.usuarios }, adm.cookie);
r = await call('GET', '/panel', null, s2.cookie); check('si se desactiva al barbero, se cierra su sesión', r.s === 401);
r = await call('POST', '/auth/clave', { sujeto: 'b_b2', clave: 'ClaveBrayan1' }); check('y no puede entrar aunque tenga clave', r.s === 403);
await call('PUT', '/config', { cfg: pn.cfg, barberos: pn.barberos, servicios: pn.servicios, usuarios: pn.usuarios }, adm.cookie);
await call('DELETE', '/acceso/b_b2/clave', null, adm.cookie);

// el registro de accesos anota todo
r = await call('GET', '/accesos', null, adm.cookie);
check('el registro de accesos anota clave y huella (éxitos y fallos)', r.j.some(x => x.via === 'clave' && !x.ok) && r.j.some(x => x.via === 'huella' && x.ok) && r.j.some(x => x.via === 'huella' && !x.ok), JSON.stringify(r.j.slice(0, 3)));
check('y nunca guarda claves ni firmas', !JSON.stringify(r.j).match(/ClaveBrayan|ClaveNueva|ClaveJhon|signature/));

console.log(`\n${ok} OK · ${bad} fallos`); process.exit(bad ? 1 : 0);
