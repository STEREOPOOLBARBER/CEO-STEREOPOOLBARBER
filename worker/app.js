/* =====================================================================
   APP INSTALABLE (PWA) · el service worker del panel con la versión del despliegue.
   Cloudflare da un id nuevo en cada despliegue (binding CF_VERSION = version_metadata): el navegador ve un
   sw.js distinto, baja la versión nueva en segundo plano y el panel avisa «Nueva versión».
   Interruptor de emergencia: con la variable SW_APAGADO=true se entrega un service worker que se borra solo.
   ===================================================================== */
const APAGADO = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) await caches.delete(k); await self.registration.unregister(); for (const c of await self.clients.matchAll()) c.navigate(c.url) })()));`;
import { pinPermitido } from './modulos/auth.js';
import { conVistaPrevia } from './vista-previa.js';
import { datos, asegurarSchema } from './datos.js';

export const versionApp = env => env.CF_VERSION?.id || 'local';
export async function swPanel(req, env) {
  // ?v= simula un despliegue nuevo, solo en pruebas locales (ALLOW_PIN).
  const v = (pinPermitido(env) && new URL(req.url).searchParams.get('v')) || versionApp(env);
  const cuerpo = env.SW_APAGADO === 'true' ? APAGADO : (await (await env.ASSETS.fetch(new URL('/sw.js', req.url))).text()).replace('__VERSION__', v.replace(/[^\w.-]/g, '').slice(0, 64));
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
}

/* ---------- APP DEL CLIENTE «Mi cita» ----------
   /cita/CODIGO = la página de estado (estado.html) con un manifiesto propio: al «Agregar a inicio»
   el ícono abre directo ESA cita. No se consulta la base aquí (el código solo se repite en el manifiesto),
   así esta dirección no sirve para adivinar códigos: los datos llegan por /api/publico/cita/:codigo con su límite.
   Los links antiguos estado.html?c=… y reservar.html?c=… pasan a /cita/CODIGO (301). */
const COD = /^[A-Z0-9]{6}$/;
export async function rutaCita(req, env, url) {
  const p = url.pathname, c = (url.searchParams.get('c') || '').trim().toUpperCase();
  if (p === '/cita/sw.js') { // avisos al celular del cliente (alcance /cita/)
    const r = await env.ASSETS.fetch(new URL('/sw-cita.js', url));
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (/^\/(estado|reservar)(\.html)?$/.test(p) && COD.test(c)) return Response.redirect(url.origin + '/cita/' + c, 301);
  const m = p.match(/^\/cita(?:\/([A-Za-z0-9]{6}))?(\/app\.webmanifest)?\/?$/);
  if (!m) return null;
  const cod = (m[1] || '').toUpperCase();
  if (m[2]) return cod ? manifiestoCita(env, url, cod) : null;
  const pagina = new Request(new URL('/estado', url), req);
  return conVistaPrevia(pagina, env, url, cod ? `<link rel="manifest" href="/cita/${cod}/app.webmanifest">` : '');
}
async function manifiestoCita(env, url, cod) {
  let nombre = 'Barbería';
  try { await asegurarSchema(env); nombre = (await datos(env)).cfg.nombre || nombre } catch { }
  const m = {
    id: '/cita/', name: `${nombre} · Mi cita`, short_name: 'Mi cita', description: `Tu cita en ${nombre}`, lang: 'es-PE', dir: 'ltr',
    start_url: '/cita/' + cod, scope: '/cita/', display: 'standalone', orientation: 'portrait', theme_color: '#ffffff', background_color: '#ffffff',
    icons: [{ src: '/img/app/icono-192.png', sizes: '192x192', type: 'image/png' }, { src: '/img/app/icono-512.png', sizes: '512x512', type: 'image/png' }, { src: '/img/app/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
  };
  return new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
