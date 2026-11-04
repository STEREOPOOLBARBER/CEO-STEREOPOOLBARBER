

export const ACTIVOS = ['por_validar', 'confirmada', 'en_silla', 'atendida'];
export const DUR = 60;
export const PERMS = ['verTodas', 'verTel', 'verMontos', 'crear', 'cancelar', 'yape', 'links', 'dash', 'excel', 'config'];
export const ALLP = Object.fromEntries(PERMS.map(k => [k, true]));
export const ROL_BARBERO = { verTel: true, crear: true, links: true };
export const SES_MS = 14 * 864e5;
// Prefijo __Host-: el navegador solo la acepta con Secure, Path=/ y sin Domain (no la puede pisar un subdominio).
export const COOKIE = '__Host-brb_s', COOKIE_P = '__Host-brb_g', VIEJA = { [COOKIE]: 'brb_s', [COOKIE_P]: 'brb_g' };
export const MAX_FOTO = 3 * 1024 * 1024;
export const MAX_AUDIO = 2.5 * 1024 * 1024;
export const DEF = { dias: [1, 2, 3, 4, 5, 6], apertura: '09:00', cierre: '20:00', refIni: '13:00', refFin: '14:00', anticipacion: 0, ventana: 14, modAdelanto: true, yapeNum: '', adelanto: 10, holdMin: 20, bloqueos: [], tolerancia: 10, horasReprog: 24, retencionMeses: 0, capturasDias: 0, maxReprog: 1, politicaTxt: '', dniTopeDia: 300 };

/* ---------- utilidades ---------- */
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status } }
export const fail = (status, msg) => { throw new HttpError(status, msg) };
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
export const uid = () => Date.now().toString(36) + rnd(6).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
export const codigo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
export const pad = n => String(n).padStart(2, '0');
export const toMin = h => { if (!h || !/^\d{1,2}:\d{2}$/.test(h)) return null; const [a, b] = h.split(':').map(Number); return a * 60 + b };
export const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const pYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) };
export const addD = (s, n) => { const d = pYmd(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) };
export const norm = e => String(e || '').trim().toLowerCase();
export const str = (v, max) => String(v ?? '').trim().slice(0, max);
export function rnd(n = 32) { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
export async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('') }
export function ahoraLocal(env) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: env.TZ || 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}

/* ---------- reglas de agenda (mismas que el formulario) ---------- */
// Minutos desde ahora (hora de Lima) hasta una fecha y hora de la agenda.
export const minutosHasta = (env, fecha, hora) => { const a = ahoraLocal(env); return Math.round((pYmd(fecha) - pYmd(a.fecha)) / 60e3) + toMin(hora || '00:00') - a.min };
// ¿Puede el cliente reprogramar esta cita? Solo si falta al menos `horasReprog` y no agotó sus cambios.
export function reglaReprog(env, cfg, c) {
  const h = +cfg.horasReprog || 24, max = cfg.maxReprog === 0 || cfg.maxReprog === '0' ? 0 : (+cfg.maxReprog || 1);
  if (!['por_validar', 'confirmada'].includes(c.estado)) return { ok: false, motivo: 'Esta cita ya no se puede reprogramar' };
  if ((c.reprog || 0) >= max) return { ok: false, motivo: max ? `Ya reprogramaste ${max === 1 ? 'una vez' : max + ' veces'}. Escríbenos por WhatsApp.` : 'Las citas no se reprograman en línea. Escríbenos por WhatsApp.' };
  if (minutosHasta(env, c.fecha, c.hora) < h * 60) return { ok: false, motivo: `Solo se puede reprogramar hasta ${h} horas antes de tu cita.` };
  return { ok: true, horas: h };
}

export function slotsDia(cfg) {
  const out = [], fin = toMin(cfg.cierre), ri = toMin(cfg.refIni), rf = toMin(cfg.refFin); let t = toMin(cfg.apertura), g = 0;
  if (t == null || fin == null) return out;
  while (t + DUR <= fin && g++ < 60) { if (ri != null && rf != null && rf > ri && t < rf && t + DUR > ri) { t = rf; continue } out.push(fromMin(t)); t += DUR }
  return out;
}
export const bloqueado = (cfg, f, bid) => (cfg.bloqueos || []).some(b => b.fecha === f && (!b.barberoId || b.barberoId === bid));
export const trabaja = (cfg, b, f) => { const d = pYmd(f).getUTCDay(); return b && b.activo !== false && (cfg.dias || []).includes(d) && (b.dias || []).includes(d) && !bloqueado(cfg, f, b.id) };
