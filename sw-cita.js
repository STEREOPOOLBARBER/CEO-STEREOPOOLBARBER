/* =====================================================================
   SERVICE WORKER DE LA APP DEL CLIENTE («Mi cita», alcance /cita/). Lo entrega el Worker en /cita/sw.js.
   Solo muestra los avisos de su cita (confirmada, recordatorios, cambios, calificar). No guarda nada en caché:
   la cita siempre se lee al momento del servidor.
   ===================================================================== */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/* ---------- avisos al celular (Web Push). Igual en sw.js (panel) y sw-cita.js (cliente): si cambias uno, cambia el otro. ---------- */
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {} } catch (_) { m = { b: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(m.t || 'Aviso', { body: m.b || '', tag: m.tag || undefined, renotify: !!m.tag, icon: '/img/app/icono-192.png', lang: 'es-PE', data: { u: m.u || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const x = new URL(e.notification.data?.u || '/', location.origin), destino = x.origin === location.origin ? x.href : location.origin + '/'; // solo dentro de la app
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) if (c.url === destino && 'focus' in c) return c.focus();
    return self.clients.openWindow(destino);
  })());
});
