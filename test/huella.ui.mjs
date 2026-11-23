// Prueba de pantalla de la entrada simple del dueño (fase 1):
// Google del dueño → entra directo → «¿Entrar la próxima vez con tu huella o Face ID?» → Sí →
// al volver (sin Google ni clave, cookies borradas) «Entrar con huella / Face ID» abre el panel.
// La huella la pone el autenticador virtual de Chromium (WebAuthn por CDP): firma de verdad, sin cuerpo.
// Requiere wrangler dev con GOOGLE_CLIENT_ID, OWNER_EMAILS=dueno@gmail.com y GOOGLE_CERTS_URL=http://127.0.0.1:8799/certs
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8787', CID = 'cid.apps.googleusercontent.com';
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const srv = http.createServer((_q, r) => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ keys: [jwk] })) }).listen(8799);
let ok = 0, bad = 0; const check = (n, c, x = '') => { c ? ok++ : bad++; console.log(`${c ? '✅' : '❌'} ${n} ${c ? '' : x}`) };
const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 420, height: 900 } });
const P = await ctx.newPage(), errores = [];
P.on('pageerror', e => { if (!/gis|google/i.test(e.message)) errores.push(e.message) }); P.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text()) && !/accounts\.google/.test(m.text())) errores.push(m.text()) });
const cdp = await ctx.newCDPSession(P); await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const tokenGoogle = async email => {
  const nonce = await P.evaluate(async () => (await (await fetch('/api/auth/nonce')).json()).nonce);
  const h = enc({ alg: 'RS256', kid: 'k1' }), pl = enc({ iss: 'https://accounts.google.com', aud: CID, iat: Date.now() / 1000, exp: Date.now() / 1000 + 600, email_verified: true, nonce, email });
  return `${h}.${pl}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(`${h}.${pl}`))).toString('base64url')}`;
};

await P.goto(BASE + '/index.html'); await P.waitForSelector('#lgHint:has-text("Dueño")');
check('la entrada explica: el dueño entra con su Google', /dueño:.*google/i.test(await P.locator('#lgHint').innerText()));
check('sin huellas registradas aún, no aparece «Entrar con huella»', !(await P.locator('#hTop').isVisible()));
// El botón de Google real no carga en pruebas: se llama a lo mismo que llama él, con un token firmado como Google.
const cred = await tokenGoogle('dueno@gmail.com');
await P.evaluate(c => loginGoogle({ credential: c }), cred);
await P.waitForSelector('#login', { state: 'hidden' });
check('el dueño entra directo con su Google (sin elegir perfil ni clave)', await P.evaluate(() => S.ses?.rol) === 'dueno');
await P.waitForSelector('[data-on-click="miHuellaActivar"]');
check('enseguida le ofrece entrar la próxima vez con huella o Face ID', /huella o tu cara/i.test(await P.locator('#mbody').innerText()));
await P.click('[data-on-click="miHuellaActivar"]'); await P.waitForSelector('text=Listo: la próxima vez', { timeout: 8000 });
check('la huella quedó guardada en este aparato', await P.evaluate(() => !!lsGet('huellaAqui', '')));

// Otro día: sin sesión, sin puerta de Google (cookies borradas). Solo la huella.
await P.evaluate(() => API.logout()); await P.evaluate(() => localStorage.removeItem('brb_ses')); await ctx.clearCookies();
await P.reload(); await P.waitForSelector('#hTop', { state: 'visible' });
check('al volver, «Entrar con huella / Face ID» sale primero (botón principal)', await P.locator('#hTop').evaluate(b => b.classList.contains('p')));
await P.click('#hTop'); await P.waitForSelector('#login', { state: 'hidden', timeout: 8000 });
check('entra solo con la huella: sin Google y sin clave', await P.evaluate(() => S.ses?.rol) === 'dueno');
check('en su aparato no tiene bloqueo automático', await P.evaluate(async () => (await (await fetch('/api/panel')).json()).yo?.bloqueo) === 0);
check('en ☰ Menú está «Huella / Face ID» para activarla en otro aparato', await P.evaluate(() => { abrirMenu(); return !!document.querySelector('[data-on-click="miHuella"]') }));
check('sin errores ni violaciones de CSP', !errores.length, errores.join(' | '));
console.log(`\n${ok} OK · ${bad} fallos`); srv.close(); await br.close(); process.exit(bad ? 1 : 0);
