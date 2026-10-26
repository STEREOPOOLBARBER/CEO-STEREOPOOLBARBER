/* =====================================================================
   Llaves de acceso (WebAuthn): huella, Face ID, Windows Hello.
   La huella NUNCA sale del celular: el servidor solo guarda la llave
   pública y comprueba la firma que hace el celular en cada ingreso.
   Sin librerías externas: solo WebCrypto.
   ===================================================================== */
const enc = new TextEncoder();

export const b64uEnc = b => { const a = new Uint8Array(b); let s = ''; for (const x of a) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
export const b64uDec = s => { s = String(s ?? ''); return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)) };
const sha = async b => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const juntar = (a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r };

/* Decodificador CBOR mínimo (lo que usa WebAuthn: enteros, bytes, texto, listas y mapas). */
export function cbor(bytes) {
  let o = 0;
  const leer = () => {
    const ib = bytes[o++], mt = ib >> 5, ai = ib & 31; let n = ai;
    if (ai === 24) n = bytes[o++];
    else if (ai === 25) { n = (bytes[o] << 8) | bytes[o + 1]; o += 2 }
    else if (ai === 26) { n = ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0; o += 4 }
    else if (ai > 26) throw new Error('cbor no soportado');
    switch (mt) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: { const v = bytes.slice(o, o + n); o += n; return v }
      case 3: { const v = new TextDecoder().decode(bytes.slice(o, o + n)); o += n; return v }
      case 4: { const a = []; for (let i = 0; i < n; i++) a.push(leer()); return a }
      case 5: { const m = new Map(); for (let i = 0; i < n; i++) { const k = leer(); m.set(k, leer()) } return m }
      case 7: return ai === 20 ? false : ai === 21 ? true : null;
      default: throw new Error('cbor no soportado');
    }
  };
  const val = leer();
  return { val, fin: o };
}

function datosCliente(raw, tipo, reto, origen) {
  const j = JSON.parse(new TextDecoder().decode(raw));
  if (j.type !== tipo || j.challenge !== reto || j.origin !== origen || j.crossOrigin === true) throw new Error('Datos del navegador no válidos');
}
const importar = (jwk, alg) => crypto.subtle.importKey('jwk', jwk, alg === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);

// Firma ECDSA en formato DER → 64 bytes (r || s) que entiende WebCrypto.
function derARaw(sig) {
  if (sig.length === 64) return sig;
  if (sig[0] !== 0x30) throw new Error('Firma no válida');
  let o = 2; if (sig[1] & 0x80) o += sig[1] & 0x7f;
  const entero = () => { if (sig[o++] !== 2) throw new Error('Firma no válida'); const l = sig[o++]; let v = sig.slice(o, o + l); o += l; while (v.length > 32 && v[0] === 0) v = v.slice(1); const r = new Uint8Array(32); r.set(v, 32 - v.length); return r };
  const r = entero(), s = entero();
  return juntar(r, s);
}

/* Registro de una huella nueva: devuelve la llave pública a guardar. */
export async function verificarAtestacion(cred, reto, rpId, origen) {
  if (!cred?.response) throw new Error('Datos no válidos');
  datosCliente(b64uDec(cred.response.clientDataJSON), 'webauthn.create', reto, origen);
  const att = cbor(b64uDec(cred.response.attestationObject)).val, auth = att.get('authData');
  if (!(auth instanceof Uint8Array) || auth.length < 55) throw new Error('Datos no válidos');
  if (!igual(auth.slice(0, 32), await sha(enc.encode(rpId)))) throw new Error('La llave es de otro sitio');
  const fl = auth[32]; if (!(fl & 0x01) || !(fl & 0x04) || !(fl & 0x40)) throw new Error('Falta la verificación con huella');
  const cnt = new DataView(auth.buffer, auth.byteOffset + 33, 4).getUint32(0);
  let o = 37 + 16; const largo = (auth[o] << 8) | auth[o + 1]; o += 2;
  const id = auth.slice(o, o + largo); o += largo;
  const clave = cbor(auth.slice(o)).val, alg = clave.get(3);
  const jwk = alg === -7 ? { kty: 'EC', crv: 'P-256', x: b64uEnc(clave.get(-2)), y: b64uEnc(clave.get(-3)) }
    : alg === -257 ? { kty: 'RSA', n: b64uEnc(clave.get(-1)), e: b64uEnc(clave.get(-2)) } : null;
  if (!jwk) throw new Error('Este dispositivo usa un tipo de llave no soportado');
  await importar(jwk, alg);
  if (b64uEnc(id) !== cred.id) throw new Error('Datos no válidos');
  return { id: cred.id, jwk, alg, cnt };
}

/* Ingreso con huella: comprueba la firma con la llave pública guardada. Devuelve el contador nuevo. */
export async function verificarAfirmacion(cred, guardada, reto, rpId, origen) {
  if (!cred?.response) throw new Error('Datos no válidos');
  const cd = b64uDec(cred.response.clientDataJSON);
  datosCliente(cd, 'webauthn.get', reto, origen);
  const auth = b64uDec(cred.response.authenticatorData);
  if (auth.length < 37) throw new Error('Datos no válidos');
  if (!igual(auth.slice(0, 32), await sha(enc.encode(rpId)))) throw new Error('La llave es de otro sitio');
  if (!(auth[32] & 0x01) || !(auth[32] & 0x04)) throw new Error('Falta la verificación con huella');
  const cnt = new DataView(auth.buffer, auth.byteOffset + 33, 4).getUint32(0);
  const datos = juntar(auth, await sha(cd)), firma = b64uDec(cred.response.signature), clave = await importar(JSON.parse(guardada.jwk), guardada.alg);
  const ok = guardada.alg === -7 ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, clave, derARaw(firma), datos) : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, firma, datos);
  if (!ok) throw new Error('La firma no coincide');
  if ((cnt || guardada.cnt) && cnt <= guardada.cnt) throw new Error('Llave duplicada');
  return cnt;
}
