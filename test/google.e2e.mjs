// Prueba del login con Google de punta a punta. Simula a Google con claves propias.
// Arranque previo:
//   npx wrangler dev --port 8787 --var GOOGLE_CLIENT_ID:cid.apps.googleusercontent.com \
//     --var OWNER_EMAILS:dueno@gmail.com --var GOOGLE_CERTS_URL:http://127.0.0.1:8799/certs
import http from 'node:http';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const CID = 'cid.apps.googleusercontent.com';
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const par = async () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const real = await par(), falsa = await par();
const jwk = { ...(await crypto.subtle.exportKey('jwk', real.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const srv = http.createServer((_q, r) => { r.setHeader('Content-Type', 'application/json'); r.setHeader('Cache-Control', 'max-age=60'); r.end(JSON.stringify({ keys: [jwk] })) }).listen(8799);

async function token(claims, par = real) {
  const h = enc({ alg: 'RS256', kid: 'k1' }), p = enc({ iss: 'https://accounts.google.com', aud: CID, iat: Date.now() / 1000, exp: Date.now() / 1000 + 600, email_verified: true, ...claims });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}
async function call(m, p, b, cookie) {
  const r = await fetch(BASE + '/api' + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  return { s: r.status, j, cookie: (r.headers.get('set-cookie') || '').split(';')[0], raw: r.headers.get('set-cookie') || '' };
}
let ok = 0, bad = 0;
const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const nonce = async () => (await call('GET', '/auth/nonce')).j.nonce;
const entrar = async (claims, par) => call('POST', '/auth/google', { credential: await token({ nonce: await nonce(), ...claims }, par) });

let r = await call('GET', '/auth/config');
check('config expone el ID de cliente (público)', r.j.google === CID, JSON.stringify(r.j));
check('el PIN está apagado', r.j.pin === false, JSON.stringify(r.j));
for (const pin of ['1234', '1111', '0000']) { const x = await call('POST', '/auth/login', { pin }); check(`entrar con PIN ${pin} → 403`, x.s === 403, JSON.stringify(x.j)) }

r = await entrar({ email: 'dueno@gmail.com' });
check('Google abre solo la puerta del dispositivo (aún sin panel)', r.s === 200 && r.j.puerta === true && /brb_g=/.test(r.cookie) && !/brb_s=/.test(r.raw), JSON.stringify(r));
check('cookie HttpOnly + Secure + SameSite', /HttpOnly/i.test(r.raw) && /Secure/i.test(r.raw) && /SameSite=Lax/i.test(r.raw), r.raw);
const puertaD = r.cookie;
r = await call('GET', '/panel', null, puertaD);
check('la puerta sola no abre el panel', r.s === 401);
r = await call('GET', '/auth/perfiles');
check('sin Google no se ven perfiles', r.j.puerta === false);
r = await call('POST', '/auth/clave', { sujeto: 'admin', clave: '1111' });
check('clave del dueño sin pasar por Google → 403', r.s === 403, JSON.stringify(r));
r = await call('GET', '/auth/perfiles', null, puertaD);
check('dueño ve su perfil y los barberos', r.j.puerta && r.j.perfiles.some(x => x.sujeto === 'admin') && r.j.perfiles.some(x => x.sujeto === 'b_b1'), JSON.stringify(r.j).slice(0, 200));
check('los perfiles no traen correos ni PIN', !JSON.stringify(r.j.perfiles).match(/gmail|"pin"|email/));
r = await call('POST', '/auth/clave', { sujeto: 'admin', clave: '0000' }, puertaD);
check('clave del dueño incorrecta → 403', r.s === 403);
r = await call('POST', '/auth/clave', { sujeto: 'admin', clave: '1111' }, puertaD);
check('dueño elige su perfil con la clave de arranque', r.s === 200 && r.j.rol === 'dueno' && /brb_s=/.test(r.cookie), JSON.stringify(r));
const dueno = r.cookie;
r = await call('GET', '/panel', null, dueno);
check('la sesión de Google abre el panel', r.s === 200 && Array.isArray(r.j.citas));

const tokRepetido = await token({ nonce: await nonce(), email: 'dueno@gmail.com' });
r = await call('POST', '/auth/google', { credential: tokRepetido });
check('primer uso del token OK', r.s === 200);
r = await call('POST', '/auth/google', { credential: tokRepetido });
check('mismo token otra vez (replay) → rechazado', r.s === 400, JSON.stringify(r.j));

r = await call('POST', '/auth/google', { credential: await token({ nonce: 'inventado', email: 'dueno@gmail.com' }) });
check('nonce que el servidor no emitió → rechazado', r.s === 400);
r = await call('POST', '/auth/google', { credential: await token({ email: 'dueno@gmail.com' }) });
check('token sin nonce → rechazado', r.s === 400);
r = await entrar({ email: 'dueno@gmail.com' }, falsa);
check('firma de otra clave (falsificado) → rechazado', r.s === 400);
r = await entrar({ email: 'dueno@gmail.com', aud: 'otra-app.apps.googleusercontent.com' });
check('token de otra aplicación → rechazado', r.s === 400);
r = await entrar({ email: 'dueno@gmail.com', exp: Date.now() / 1000 - 3600 });
check('token vencido → rechazado', r.s === 400);
r = await entrar({ email: 'dueno@gmail.com', email_verified: false });
check('correo sin verificar → rechazado', r.s === 400);
r = await entrar({ email: 'dueno@gmail.com', iss: 'https://evil.example' });
check('emisor falso → rechazado', r.s === 400);
r = await entrar({ email: 'intruso@gmail.com' });
check('correo no autorizado → 403', r.s === 403, JSON.stringify(r));
r = await call('GET', '/panel', null, r.cookie);
check('y no recibe sesión', r.s === 401);

// El dueño autoriza a un barbero por correo
const panel = (await call('GET', '/panel', null, dueno)).j;
check('los datos del panel no traen ningún PIN', !JSON.stringify(panel).match(/"pin"|adminPin/), JSON.stringify(panel).slice(0, 200));
// aunque un panel viejo intente guardar PIN, el servidor los descarta
const barberos = panel.barberos.map(b => b.id === 'b1' ? { ...b, email: 'Jhon@Gmail.com', pin: '4826' } : b);
r = await call('PUT', '/config', { cfg: { ...panel.cfg, adminPin: '1234' }, barberos, servicios: panel.servicios, usuarios: panel.usuarios }, dueno);
check('dueño autoriza el correo de un barbero', r.s === 200);
check('el servidor descarta PIN enviados al guardar', !JSON.stringify((await call('GET', '/panel', null, dueno)).j).match(/"pin"|adminPin/));
r = await entrar({ email: 'jhon@gmail.com' });
check('el correo del barbero abre la puerta (sin importar mayúsculas)', r.s === 200 && r.j.puerta === true, JSON.stringify(r));
const puertaB = r.cookie;
r = await call('GET', '/auth/perfiles', null, puertaB);
check('el barbero solo ve su propio perfil', r.j.perfiles.length === 1 && r.j.perfiles[0].sujeto === 'b_b1' && r.j.perfiles[0].directo === true, JSON.stringify(r.j));
r = await call('POST', '/auth/clave', { sujeto: 'admin', clave: '1111' }, puertaB);
check('el barbero no puede elegir el perfil del dueño', r.s === 403);
r = await call('POST', '/auth/perfil/directo', { sujeto: 'b_b2' }, puertaB);
check('ni el de otro barbero', r.s === 403);
r = await call('POST', '/auth/perfil/directo', { sujeto: 'b_b1' }, puertaB);
check('entra a su perfil', r.s === 200 && r.j.rol === 'barbero' && r.j.barberoId === 'b1', JSON.stringify(r));
const barb = r.cookie;
r = await call('GET', '/panel', null, barb);
check('barbero no ve PIN ni correos', r.s === 200 && !JSON.stringify(r.j).match(/"pin"|gmail/i), JSON.stringify(r.j).slice(0, 200));
r = await call('GET', '/accesos', null, barb);
check('barbero no puede ver el registro de accesos', r.s === 403);
r = await call('PUT', '/config', { cfg: {}, barberos: [], servicios: [] }, barb);
check('barbero no puede cambiar la configuración', r.s === 403);

// Si se le quita el correo, pierde el acceso al instante
const b2 = panel.barberos.map(b => b.id === 'b1' ? { ...b, email: '' } : b);
await call('PUT', '/config', { cfg: panel.cfg, barberos: b2, servicios: panel.servicios, usuarios: panel.usuarios }, dueno);
r = await call('GET', '/panel', null, barb);
check('quitar el correo cierra su sesión de inmediato', r.s === 401);

r = await call('GET', '/accesos', null, dueno);
const fallos = r.j.filter(x => !x.ok), exitos = r.j.filter(x => x.ok);
check('el registro guarda éxitos y fallos', r.s === 200 && fallos.length >= 8 && exitos.length >= 3, `${fallos.length} fallos / ${exitos.length} éxitos`);
check('el registro anota el motivo', fallos.some(x => /no autorizado/.test(x.motivo)) && fallos.some(x => /nonce/.test(x.motivo)));
check('el registro no guarda tokens', !JSON.stringify(r.j).includes('eyJ'));

r = await call('PUT', '/acceso/admin/clave', { clave: '1111' }, dueno);
check('el dueño no puede dejar una clave floja', r.s === 400);
r = await call('PUT', '/acceso/admin/clave', { clave: '7342' }, dueno);
check('el dueño cambia su clave', r.s === 200);
r = await call('POST', '/auth/clave', { sujeto: 'admin', clave: '1111' }, puertaD);
check('la clave de arranque deja de valer', r.s === 403);
r = await call('POST', '/auth/clave', { sujeto: 'admin', clave: '7342' }, puertaD);
check('la nueva clave entra', r.s === 200);
r = await call('POST', '/auth/logout', {}, dueno);
r = await call('GET', '/panel', null, dueno);
check('cerrar sesión invalida la cookie', r.s === 401);

let limite = 0; for (let i = 0; i < 25; i++) { const x = await call('POST', '/auth/google', { credential: 'x.y.z' }); if (x.s === 429) { limite = x.s; break } }
check('demasiados intentos → 429', limite === 429);

console.log(`\n${ok} OK · ${bad} fallos`); srv.close(); process.exit(bad ? 1 : 0);
