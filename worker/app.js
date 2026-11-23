/* =====================================================================
   APP INSTALABLE (PWA) · el service worker del panel con la versión del despliegue.
   Cloudflare da un id nuevo en cada despliegue (binding CF_VERSION = version_metadata): el navegador ve un
   sw.js distinto, baja la versión nueva en segundo plano y el panel avisa «Nueva versión».
   Interruptor de emergencia: con la variable SW_APAGADO=true se entrega un service worker que se borra solo.
   ===================================================================== */
const APAGADO = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) await caches.delete(k); await self.registration.unregister(); for (const c of await self.clients.matchAll()) c.navigate(c.url) })()));`;
import { pinPermitido } from './modulos/auth.js';

export const versionApp = env => env.CF_VERSION?.id || 'local';
export async function swPanel(req, env) {
  // ?v= simula un despliegue nuevo, solo en pruebas locales (ALLOW_PIN).
  const v = (pinPermitido(env) && new URL(req.url).searchParams.get('v')) || versionApp(env);
  const cuerpo = env.SW_APAGADO === 'true' ? APAGADO : (await (await env.ASSETS.fetch(new URL('/sw.js', req.url))).text()).replace('__VERSION__', v.replace(/[^\w.-]/g, '').slice(0, 64));
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
}
