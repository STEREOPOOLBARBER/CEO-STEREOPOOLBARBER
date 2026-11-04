import { DurableObject } from 'cloudflare:workers';
import { fail } from '../comun.js';
import { leerKV } from '../datos.js';

/* ---------- tiempo real ----------
   Un Durable Object («Avisos») mantiene abierto un WebSocket con cada panel conectado.
   Cuando algo cambia (reserva, Yape, reprogramación, edición…), el Worker le avisa y él reenvía a todos
   un aviso sin datos: {"tipo":"cambio"}. Cada panel vuelve a pedir lo suyo a /api/panel con sus permisos,
   así el aviso nunca filtra información. Usa «hibernación»: si no hay mensajes, el objeto duerme y no cuesta. */
export class Avisos extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // El «ping» de los paneles se contesta solo, sin despertar al objeto.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/conectar') {
      const [cliente, servidor] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(servidor);
      return new Response(null, { status: 101, webSocket: cliente });
    }
    if (u.pathname === '/aviso' && req.method === 'POST') {
      const msg = await req.text(); let n = 0;
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); n++ } catch { } }
      return new Response(String(n));
    }
    if (u.pathname === '/conectados') return new Response(String(this.ctx.getWebSockets().length));
    return new Response('No encontrado', { status: 404 });
  }
  async webSocketMessage() { }
  async webSocketClose(ws, code) { try { ws.close(code, 'chau') } catch { } }
  async webSocketError(ws) { try { ws.close(1011, 'error') } catch { } }
}
const avisos = env => env.AVISOS.get(env.AVISOS.idFromName('barberia'));
// Avisa a todos los paneles abiertos que algo cambió (no lleva datos de clientes).
export async function avisar(env, tipo = 'cambio') {
  if (!env.AVISOS) return;
  try { await avisos(env).fetch('https://avisos/aviso', { method: 'POST', body: JSON.stringify({ tipo, t: Date.now() }) }) } catch (e) { console.error('avisos', e) }
}
export const versionActual = async env => String((await leerKV(env, ['ver'])).ver || 0);

/* Ruta del panel (requiere sesión): abre el WebSocket. */
export async function rutasTiempoReal(c) {
  const { req, env, path, m } = c;
  if (path === '/tiempo-real' && m === 'GET') {
    if (req.headers.get('Upgrade') !== 'websocket') fail(426, 'Se necesita WebSocket');
    if (!env.AVISOS) fail(503, 'Tiempo real no disponible');
    // Solo desde la propia página (evita que otro sitio abra el WebSocket con la sesión del usuario).
    const o = req.headers.get('Origin'); let ok = false; try { ok = !!o && new URL(o).host === new URL(req.url).host } catch { }
    if (!ok) fail(403, 'Origen no permitido');
    return avisos(env).fetch(new Request('https://avisos/conectar', req));
  }
  if (path === '/tiempo-real/estado' && m === 'GET') {
    c.exigir('config');
    if (!env.AVISOS) return new Response(JSON.stringify({ activo: false }), { headers: { 'Content-Type': 'application/json' } });
    const n = await (await avisos(env).fetch('https://avisos/conectados')).text();
    return new Response(JSON.stringify({ activo: true, conectados: +n }), { headers: { 'Content-Type': 'application/json' } });
  }
}
