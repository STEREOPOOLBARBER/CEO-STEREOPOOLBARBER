/* =====================================================================
   Filtros de la agenda (servidor). Una sola definición para la lista (/citas/buscar)
   y para los números de las etiquetas (/citas/conteo).
   El panel aplica la misma regla en el navegador (js/panel/filtros.js) para el día que ya tiene en memoria;
   test/filtros.ui.mjs comprueba que ambos lados den lo mismo.
   Columnas generadas (migración v5): servicio_id, origen ('web' | 'panel' | 'walkin') y pago ('yape_ok' | 'yape_pend' | 'sin' | 'gratis').
   ===================================================================== */
import { sinAcentos } from './clientes.js';

const J = k => `json_extract(data, '$.${k}')`;
const SI = e => `IFNULL(${e}, 0) NOT IN (0, '')`; // «verdadero» igual que en JavaScript
export const MONTO = `(CASE WHEN ${SI(J('gratis'))} THEN 0 ELSE IFNULL(CAST(${J('precio')} AS REAL), 0) END)`;
const RECORDADA = `(${SI(J('recordado'))} OR ${J('wa.recordatorio.id')} IS NOT NULL OR ${J('wa.dosHoras.id')} IS NOT NULL)`;

const ID = /^[\w-]{1,40}$/, FECHA = /^\d{4}-\d{2}-\d{2}$/;
const lista = (v, re, max = 20) => String(v || '').split(',').filter(x => re.test(x)).slice(0, max);
const marcas = (w, a, col, vals) => { if (vals.length) { w.push(`${col} IN (${vals.map(() => '?').join(',')})`); a.push(...vals) } };

// Cada opción tiene su condición SQL fija (sin texto del usuario dentro).
const OPC = {
  pago: { yape_ok: `pago = 'yape_ok'`, yape_pend: `pago = 'yape_pend'`, sin: `pago = 'sin'`, gratis: `pago = 'gratis'` },
  origen: { web: `origen = 'web'`, panel: `origen = 'panel'`, walkin: `origen = 'walkin'` },
  wa: { confirmo: `${J('asistencia')} IS NOT NULL`, recordado: `${J('asistencia')} IS NULL AND ${RECORDADA}`, sin_recordar: `${J('asistencia')} IS NULL AND NOT ${RECORDADA}` },
  cliente: {
    nuevo: `tel <> '' AND NOT EXISTS (SELECT 1 FROM citas p WHERE p.tel = citas.tel AND p.estado = 'atendida' AND p.fecha < citas.fecha)`,
    frecuente: `tel IN (SELECT tel FROM clientes WHERE visitas >= 3)`,
    notas: `tel IN (SELECT tel FROM clientes WHERE notas <> '' OR prefs <> '')`,
  },
  captura: { con: SI(J('yapeCaptura')), sin: `NOT ${SI(J('yapeCaptura'))}` },
  foto: { sin_despues: `NOT ${SI(J('fotoDespues'))}` },
};
// Quién puede usar cada filtro (el mismo permiso que hace falta para ver ese dato en el panel).
const PERMISO = { pago: 'verMontos', cliente: 'dash' };

/* Condiciones WHERE a partir de los parámetros. Opciones: sinPeriodo (ignora desde/hasta) y sinEstado. */
export function filtrosCitas(s, q, { sinPeriodo = false, sinEstado = false } = {}) {
  const w = [], a = [];
  if (!s.perm.verTodas) { w.push('barbero_id = ?'); a.push(s.barberoId) }
  else marcas(w, a, 'barbero_id', lista(q.barbero, ID));
  if (!sinPeriodo) {
    if (FECHA.test(q.desde || '')) { w.push('fecha >= ?'); a.push(q.desde) }
    if (FECHA.test(q.hasta || '')) { w.push('fecha <= ?'); a.push(q.hasta) }
  }
  if (!sinEstado) marcas(w, a, 'estado', lista(q.estado, /^[a-z_]{3,20}$/, 8));
  marcas(w, a, 'servicio_id', lista(q.servicio, ID, 40));
  for (const [k, ops] of Object.entries(OPC)) {
    const v = q[k];
    if (v && ops[v] && (!PERMISO[k] || s.perm[PERMISO[k]])) w.push(ops[v]);
  }
  const txt = String(q.q || '').trim().toLowerCase().slice(0, 60);
  if (txt.length >= 2) {
    const esc = t => '%' + t.replace(/[\\%_]/g, m => '\\' + m) + '%', like = esc(txt), sa = esc(sinAcentos(txt));
    // Sin acentos: «jose» encuentra «José» (vía la ficha de clientes, que guarda el nombre normalizado).
    if (s.perm.verTel) { w.push(`(lower(data) LIKE ? ESCAPE '\\' OR lower(codigo) LIKE ? ESCAPE '\\' OR tel IN (SELECT tel FROM clientes WHERE buscar LIKE ? ESCAPE '\\'))`); a.push(like, like, sa) }
    else { w.push(`(lower(${J('cliente.nombre')}) LIKE ? ESCAPE '\\' OR lower(codigo) LIKE ? ESCAPE '\\' OR tel IN (SELECT tel FROM clientes WHERE nombre_n LIKE ? ESCAPE '\\'))`); a.push(like, like, sa) }
  }
  return { donde: w.length ? ' WHERE ' + w.join(' AND ') : ' WHERE 1 = 1', a, txt };
}

/* Órdenes: columnas de la clave (todas en la misma dirección, para paginar por cursor). */
const ORDENES = {
  hora: { k: ['fecha', 'hora', 'id'] },
  hora_desc: { k: ['fecha', 'hora', 'id'], desc: true },
  nombre: { k: [`lower(IFNULL(${J('cliente.nombre')}, ''))`, 'fecha', 'hora', 'id'] },
  monto: { k: [`-${MONTO}`, 'fecha', 'hora', 'id'], permiso: 'verMontos' },
  creada: { k: ['creada', 'id'] },
  vence: { k: ['IFNULL(expira, 9e15)', 'fecha', 'hora', 'id'] },
  silla: { k: [`IFNULL(${J('enSillaTs')}, 9e15)`, 'id'] },
};
export function ordenCitas(s, nombre) {
  const o = ORDENES[nombre];
  return o && (!o.permiso || s.perm[o.permiso]) ? o : ORDENES.hora;
}
