/* =====================================================================
   SERVICE WORKER DEL PANEL (app instalable). Lo entrega el Worker con la versión del despliegue
   (worker/app.js): cada vez que se sube un cambio, el navegador ve un sw.js distinto y prepara la nueva versión.
   · Guarda en el celular solo la «cáscara» del panel (HTML, JS, CSS, íconos), todo de UNA misma versión,
     para que abra rápido y no mezcle archivos viejos con nuevos.
   · NUNCA guarda datos: /api/ siempre va al servidor (con sus permisos).
   · La versión nueva espera: el panel avisa «Nueva versión» y se aplica al tocar o al volver a abrir la app.
   ===================================================================== */
const VERSION = '__VERSION__', CACHE = 'stereo-panel-' + VERSION;
const PANEL = ['/', '/index', '/index.html'];
const esPanel = u => PANEL.includes(u.pathname);
/* Lo que usa el panel se lee del propio index.html (scripts, estilos, íconos): no hay lista que mantener a mano. */
async function cascara() {
  const r = await fetch('/index.html', { cache: 'no-store' }); if (!r.ok) throw new Error('sin panel');
  const html = await r.text(), urls = new Set(['/index.html', '/manifest.webmanifest', '/img/app/icono-192.png']);
  for (const m of html.matchAll(/(?:src|href)="(\/?(?:js|css|vendor|img)\/[^"?#]+)"/g)) urls.add('/' + m[1].replace(/^\//, ''));
  const c = await caches.open(CACHE);
  await c.put('/index.html', new Response(html, { headers: r.headers }));
  await c.addAll([...urls].filter(u => u !== '/index.html').map(u => new Request(u, { cache: 'no-store' })));
}
self.addEventListener('install', e => e.waitUntil(cascara()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('stereo-panel-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', e => { if (e.data === 'actualizar') self.skipWaiting(); if (e.data === 'version') e.source?.postMessage({ version: VERSION }) });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return; // datos: siempre al servidor
  if (e.request.mode === 'navigate') {
    if (!esPanel(u)) return; // el formulario y el estado de la cita no son parte de esta app
    // Panel: la copia de ESTA versión (HTML y JS siempre de la misma versión, abre al instante y sin internet).
    // La versión nueva se baja en segundo plano y se aplica con el aviso «Nueva versión» o al volver a abrir la app.
    e.respondWith(caches.open(CACHE).then(c => c.match('/index.html')).then(r => r || fetch(e.request)));
    return;
  }
  // Archivos de la cáscara: los de esta versión (rápido y consistente); lo demás, a la red.
  e.respondWith(caches.open(CACHE).then(c => c.match(u.pathname)).then(r => r || fetch(e.request)));
});
