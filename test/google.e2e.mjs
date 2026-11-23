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
r = await call('POST', '/auth/clave/crear', { sujeto: 'p_dueno', clave: 'MiClaveDueno9' });
check('sin Google no se puede crear ni usar ninguna clave', r.s === 403, JSON.stringify(r));
r = await call('GET', '/auth/perfiles', null, puertaD);
const pd = r.j.perfiles?.find(x => x.sujeto === 'p_dueno');
check('el aparato del dueño ve a todo el equipo, cada persona una vez', r.j.puerta && pd && r.j.perfiles.some(x => x.sujeto === 'p_b1') && !r.j.perfiles.some(x => x.sujeto === 'admin'), JSON.stringify(r.j).slice(0, 200));
check('el dueño aún no tiene clave: le toca crearla (no hay clave de arranque)', pd.clave === false && pd.crear === true);
check('el dueño no puede crear la primera clave de un barbero', r.j.perfiles.find(x => x.sujeto === 'p_b1').crear === false);
check('los perfiles no traen correos ni PIN', !JSON.stringify(r.j.perfiles).match(/gmail|"pin"|email/));
r = await call('POST', '/auth/clave', { sujeto: 'admin', clave: '1111' }, puertaD);
check('la clave 1111 ya no existe', r.s === 403);
r = await call('POST', '/auth/clave/crear', { sujeto: 'p_dueno', clave: '111111' }, puertaD);
check('clave muy fácil → 400', r.s === 400);
r = await call('POST', '/auth/clave/crear', { sujeto: 'p_b1', clave: 'ClaveDeOtro9' }, puertaD);
check('el dueño no puede crear la clave de otro por este camino', r.s === 403);
r = await call('POST', '/auth/clave/crear', { sujeto: 'p_dueno', clave: 'MiClaveDueno9' }, puertaD);
check('el dueño crea su propia clave y entra', r.s === 200 && r.j.rol === 'dueno' && /brb_s=/.test(r.cookie), JSON.stringify(r));
const dueno = r.cookie;
r = await call('POST', '/auth/clave/crear', { sujeto: 'p_dueno', clave: 'OtraClave99' }, puertaD);
check('crear otra vez no pisa la clave (409)', r.s === 409);
r = await call('POST', '/auth/clave', { sujeto: 'p_dueno', clave: 'clave-mala' }, puertaD);
check('clave del dueño incorrecta → 403', r.s === 403);
r = await call('GET', '/panel', null, dueno);
check('su sesión abre el panel', r.s === 200 && Array.isArray(r.j.citas) && r.j.yo?.rol === 'dueno');

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
const equipo = panel.equipo.map(b => b.id === 'b1' ? { ...b, email: 'Jhon@Gmail.com', pin: '4826' } : b);
r = await call('PUT', '/config', { cfg: { ...panel.cfg, adminPin: '1234' }, equipo, servicios: panel.servicios }, dueno);
check('dueño autoriza el correo de un barbero', r.s === 200, JSON.stringify(r.j));
check('el servidor descarta PIN enviados al guardar', !JSON.stringify((await call('GET', '/panel', null, dueno)).j).match(/"pin"|adminPin/));
r = await entrar({ email: 'jhon@gmail.com' });
check('el correo del barbero abre la puerta (sin importar mayúsculas)', r.s === 200 && r.j.puerta === true, JSON.stringify(r));
const puertaB = r.cookie;
r = await call('GET', '/auth/perfiles', null, puertaB);
check('en su aparato el barbero solo ve su propio perfil y crea su clave', r.j.perfiles.length === 1 && r.j.perfiles[0].sujeto === 'p_b1' && r.j.perfiles[0].crear === true, JSON.stringify(r.j));
r = await call('POST', '/auth/clave', { sujeto: 'p_dueno', clave: 'MiClaveDueno9' }, puertaB);
check('el barbero no puede elegir el perfil del dueño (ni sabiendo su clave)', r.s === 403);
r = await call('POST', '/auth/clave/crear', { sujeto: 'p_b2', clave: 'ClaveAjena77' }, puertaB);
check('ni crear la clave de otro barbero', r.s === 403);
r = await call('POST', '/auth/clave/crear', { sujeto: 'p_b1', clave: 'ClaveJhon2026' }, puertaB);
check('crea su clave y entra a su perfil', r.s === 200 && r.j.rol === 'barbero' && r.j.barberoId === 'b1', JSON.stringify(r));
const barb = r.cookie;
r = await call('GET', '/panel', null, barb);
check('barbero no ve PIN ni correos ni el equipo', r.s === 200 && !JSON.stringify(r.j).match(/"pin"|gmail/i) && r.j.equipo.length === 0, JSON.stringify(r.j).slice(0, 200));
r = await call('GET', '/accesos', null, barb);
check('barbero no puede ver el registro de accesos', r.s === 403);
r = await call('PUT', '/config', { cfg: {}, equipo: [], servicios: [] }, barb);
check('barbero no puede cambiar la configuración', r.s === 403);
r = await call('PUT', '/acceso/p_dueno/clave', { clave: 'Robada12345' }, barb);
check('ni la clave del dueño', r.s === 403);

// Quitarle el correo cierra la puerta de su aparato; desactivarlo cierra también su sesión
await call('PUT', '/config', { cfg: panel.cfg, equipo: equipo.map(b => b.id === 'b1' ? { ...b, email: '' } : b), servicios: panel.servicios }, dueno);
r = await call('GET', '/auth/perfiles', null, puertaB);
check('sin correo, su aparato ya no puede elegir perfil', r.j.puerta === false);
await call('PUT', '/config', { cfg: panel.cfg, equipo: equipo.map(b => b.id === 'b1' ? { ...b, activo: false } : b), servicios: panel.servicios }, dueno);
r = await call('GET', '/panel', null, barb);
check('desactivarlo cierra su sesión de inmediato', r.s === 401);
r = await call('PUT', '/config', { cfg: panel.cfg, equipo: equipo.map(b => b.rol === 'dueno' ? { ...b, activo: false } : b), servicios: panel.servicios }, dueno);
check('no se puede dejar sin dueño activo', r.s === 400, JSON.stringify(r.j));

r = await call('GET', '/accesos', null, dueno);
const fallos = r.j.filter(x => !x.ok), exitos = r.j.filter(x => x.ok);
check('el registro guarda éxitos y fallos', r.s === 200 && fallos.length >= 8 && exitos.length >= 3, `${fallos.length} fallos / ${exitos.length} éxitos`);
check('el registro anota el motivo', fallos.some(x => /no autorizado/.test(x.motivo)) && fallos.some(x => /nonce/.test(x.motivo)));
check('el registro no guarda tokens', !JSON.stringify(r.j).includes('eyJ'));

r = await call('PUT', '/acceso/p_dueno/clave', { clave: '111111' }, dueno);
check('el dueño no puede dejar una clave floja', r.s === 400);
r = await call('PUT', '/acceso/p_dueno/clave', { clave: 'NuevaDueno77' }, dueno);
check('el dueño cambia su clave', r.s === 200);
r = await call('GET', '/panel', null, dueno);
check('cambiar la clave cierra las sesiones abiertas con la anterior', r.s === 401);
r = await call('POST', '/auth/clave', { sujeto: 'p_dueno', clave: 'MiClaveDueno9' }, puertaD);
check('la clave anterior deja de valer', r.s === 403);
r = await call('POST', '/auth/clave', { sujeto: 'p_dueno', clave: 'NuevaDueno77' }, puertaD);
check('la nueva clave entra', r.s === 200);
const dueno2 = r.cookie;
// ---- Fase 2: clave temporal, aparato compartido con bloqueo, recuperar con Google, aparatos y dar de baja
const pnD = (await call('GET', '/panel', null, dueno2)).j;
await call('PUT', '/config', { cfg: pnD.cfg, equipo: pnD.equipo.map(b => b.id === 'b1' ? { ...b, email: 'jhon@gmail.com', activo: true } : b), servicios: pnD.servicios }, dueno2);
r = await call('PUT', '/acceso/p_b2/clave', { clave: 'TemporalB2x' }, dueno2);
check('el dueño da una clave temporal', r.s === 200 && r.j.temporal === true, JSON.stringify(r.j));
r = await call('POST', '/auth/clave', { sujeto: 'p_b2', clave: 'TemporalB2x' }, puertaD);
check('en la tablet del local, la temporal pide crear la propia', r.j.cambiar === true && !/brb_s=/.test(r.cookie));
r = await call('POST', '/auth/clave/cambiar', { sujeto: 'p_b2', actual: 'TemporalB2x', nueva: 'BrayanTablet7' }, puertaD);
check('el barbero crea la suya; en un aparato ajeno queda con bloqueo automático', r.s === 200 && r.j.bloqueo === 15, JSON.stringify(r.j));
const tablet = r.cookie;
check('en su propio aparato el dueño no tiene bloqueo', (await call('GET', '/panel', null, dueno2)).j.yo?.bloqueo === 0);
check('la sesión de la tablet funciona', (await call('GET', '/panel', null, tablet)).s === 200);
const recuperar = async (email, sujeto, pc) => call('POST', '/auth/clave/recuperar', { sujeto, nueva: 'Recuperada55', credential: await token({ nonce: await nonce(), email }) }, pc);
r = await recuperar('jhon@gmail.com', 'p_dueno', puertaD); check('el Google de otra persona no recupera la clave del dueño', r.s === 403);
r = await recuperar('dueno@gmail.com', 'p_dueno', puertaD); check('el dueño olvidó su clave: la recupera confirmando con su Google', r.s === 200 && r.j.rol === 'dueno', JSON.stringify(r.j));
const duenoR = r.cookie;
check('su clave anterior deja de valer', (await call('POST', '/auth/clave', { sujeto: 'p_dueno', clave: 'NuevaDueno77' }, puertaD)).s === 403);
r = await entrar({ email: 'jhon@gmail.com' }); const puertaJ = r.cookie;
r = await recuperar('jhon@gmail.com', 'p_b1', puertaJ); check('un barbero recupera la suya con su propio Google', r.s === 200 && r.j.barberoId === 'b1', JSON.stringify(r.j));
const jhon = r.cookie;
r = await call('GET', '/acceso/aparatos', null, duenoR);
const apJ = r.j.find(a => a.quien === 'jhon@gmail.com');
check('el dueño ve los aparatos autorizados (quién y qué aparato)', r.s === 200 && apJ && r.j.some(a => a.quien === 'dueno@gmail.com'), JSON.stringify(r.j).slice(0, 300));
check('los aparatos solo los ve quien configura', (await call('GET', '/acceso/aparatos', null, jhon)).s === 403);
r = await call('DELETE', '/acceso/aparatos/' + apJ.id, null, duenoR);
check('quitar un aparato cierra su sesión al instante', r.s === 200 && (await call('GET', '/panel', null, jhon)).s === 401);
check('y ese aparato ya no puede elegir perfil', (await call('GET', '/auth/perfiles', null, puertaJ)).j.puerta === false);
r = await call('POST', '/acceso/p_dueno/baja', {}, duenoR); check('nadie se da de baja a sí mismo', r.s === 400);
r = await call('POST', '/acceso/p_b2/baja', {}, duenoR); check('dar de baja a un barbero', r.s === 200);
check('su sesión se cierra al instante', (await call('GET', '/panel', null, tablet)).s === 401);
const pnB = (await call('GET', '/panel', null, duenoR)).j;
check('queda desactivado y sin correo, sin clave (sus citas se conservan)', pnB.equipo.find(p => p.id === 'b2')?.activo === false && !(await call('GET', '/acceso', null, duenoR)).j.claves.includes('p_b2'));
await call('PUT', '/acceso/p_b3/clave', { clave: 'TemporalB3x' }, duenoR);
r = await call('POST', '/auth/clave/cambiar', { sujeto: 'p_b3', actual: 'TemporalB3x', nueva: 'PieroTablet7' }, puertaD); const piero = r.cookie;
await new Promise(ok => setTimeout(ok, 5500));
check('en un aparato ajeno, tras el tiempo sin uso la sesión se cierra sola', (await call('GET', '/panel', null, piero)).s === 401);
check('en su propio aparato no se cierra', (await call('GET', '/panel', null, duenoR)).s === 200);

r = await call('POST', '/auth/logout', {}, duenoR);
r = await call('GET', '/panel', null, duenoR);
check('cerrar sesión invalida la cookie', r.s === 401);

let limite = 0; for (let i = 0; i < 25; i++) { const x = await call('POST', '/auth/google', { credential: 'x.y.z' }); if (x.s === 429) { limite = x.s; break } }
check('demasiados intentos → 429', limite === 429);

console.log(`\n${ok} OK · ${bad} fallos`); srv.close(); process.exit(bad ? 1 : 0);
