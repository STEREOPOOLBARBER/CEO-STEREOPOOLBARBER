import { asegurarSchema, datos, fotosPublicas } from './datos.js';
import { titulo } from './modulos/dni.js';

/* Vista previa de los links (WhatsApp, Telegram, etc.): título, descripción y logo del negocio.
   Solo usa datos públicos; nunca incluye nombres de clientes ni códigos. */
export const esc = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export async function conVistaPrevia(req, env, url) {
  const r = await env.ASSETS.fetch(req);
  const tipo = r.headers.get('Content-Type') || '';
  if (req.method !== 'GET' || r.status !== 200 || !tipo.includes('text/html') || !env.DB) return r;
  let d; try { await asegurarSchema(env); d = await datos(env) } catch { return r }
  const nombre = d.cfg.nombre || 'Barbería', q = url.searchParams, panel = /\/index(\.html)?$|\/$/.test(url.pathname);
  let titulo, desc;
  if (panel) {
    titulo = q.get('huella') ? `Activa tu huella · ${nombre}` : `${nombre} · Panel`;
    desc = q.get('huella') ? 'Toca para activar tu huella o Face ID y entrar sin escribir clave.' : 'Agenda, citas y clientes de la barbería.';
  } else if (q.get('c') || /\/estado(\.html)?$/.test(url.pathname)) {
    titulo = `Tu cita en ${nombre}`; desc = 'Mira el estado de tu cita y cómo llegar a la barbería 💈';
  } else {
    titulo = `${nombre} · Reserva tu cita`; desc = 'Elige tu corte, tu barbero y tu horario en 1 minuto. Reserva online 💈✂️';
  }
  const logo = typeof d.cfg.logoImg === 'string' && fotosPublicas(d).has(d.cfg.logoImg) ? `${url.origin}/api/fotos/${d.cfg.logoImg}` : `${url.origin}/logo.jpg`;
  const tags = [['og:type', 'website'], ['og:site_name', nombre], ['og:title', titulo], ['og:description', desc], ['og:url', url.origin + url.pathname + (q.get('huella') || q.get('c') ? '' : url.search)], ['og:locale', 'es_PE'],
    ...(logo ? [['og:image', logo], ['og:image:alt', `Logo de ${nombre}`], ['twitter:card', 'summary']] : [['twitter:card', 'summary']]), ['twitter:title', titulo], ['twitter:description', desc], ['description', desc]]
    .map(([k, v]) => `<meta ${k.startsWith('og:') ? 'property' : 'name'}="${k}" content="${esc(v)}">`).join('');
  const res = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(titulo) } })
    .on('head', { element(e) { e.append(tags, { html: true }) } })
    .transform(r);
  const h = new Headers(res.headers); h.set('Cache-Control', 'public, max-age=300');
  return new Response(res.body, { status: res.status, headers: h });
}
