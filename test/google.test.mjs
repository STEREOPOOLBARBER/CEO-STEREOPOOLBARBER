// Verificación del ID token de Google con claves RSA generadas para la prueba.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarGoogle } from '../worker/index.js';

const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const fetcher = async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Cache-Control': 'max-age=60' } });
const CID = 'cid.apps.googleusercontent.com';
async function token(claims, kid = 'k1') {
  const h = enc({ alg: 'RS256', kid }), p = enc({ iss: 'https://accounts.google.com', aud: CID, exp: Date.now() / 1000 + 600, email: 'a@b.com', email_verified: true, ...claims });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}

test('acepta un token válido', async () => { assert.equal((await verificarGoogle(await token({}), CID, fetcher)).email, 'a@b.com') });
test('rechaza otro client_id', async () => { await assert.rejects(verificarGoogle(await token({ aud: 'otro' }), CID, fetcher)) });
test('rechaza token vencido', async () => { await assert.rejects(verificarGoogle(await token({ exp: Date.now() / 1000 - 3600 }), CID, fetcher)) });
test('rechaza correo sin verificar', async () => { await assert.rejects(verificarGoogle(await token({ email_verified: false }), CID, fetcher)) });
test('rechaza emisor falso', async () => { await assert.rejects(verificarGoogle(await token({ iss: 'https://evil.com' }), CID, fetcher)) });
test('rechaza firma alterada', async () => {
  const t = (await token({})).split('.'); t[1] = enc({ iss: 'accounts.google.com', aud: CID, exp: Date.now() / 1000 + 600, email: 'dueno@x.com', email_verified: true });
  await assert.rejects(verificarGoogle(t.join('.'), CID, fetcher));
});
