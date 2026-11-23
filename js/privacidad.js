/* =====================================================================
   AVISO DE PRIVACIDAD (Ley N.° 29733, Perú). Se arma con los datos de ⚙️ Config → Privacidad.
   · privacidad.html: la página completa (para un link directo), con «Ir a reservar».
   · En el formulario y en «Mi cita» se abre como HOJA encima (Privacidad.abrir): al cerrarla, la persona sigue
     exactamente donde estaba (no pierde lo que escribió).
   Si el aviso cambia de fondo, sube VERSION aquí y en js/reservar.js (se guarda con cada aceptación).
   ===================================================================== */
const Privacidad = (() => {
  const VERSION = 2;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  function html(c = {}) {
    const neg = c.nombre || 'la barbería', tit = c.privTitular || neg, wa = String(c.whatsapp || '').replace(/\D/g, '');
    const meses = +c.retencionMeses || 0, dias = +c.capturasDias || 0;
    return `
  <p>En <b>${esc(neg)}</b> cuidamos tus datos personales conforme a la <b>Ley N.° 29733, Ley de Protección de Datos Personales</b>, y su reglamento.</p>
  <h3>1. Responsable</h3>
  <p><b>${esc(tit)}</b>${c.privRuc ? ` · RUC/DNI ${esc(c.privRuc)}` : ''}${c.direccion ? `<br>📍 ${esc(c.direccion)}` : ''}${wa ? `<br>💬 WhatsApp: ${esc(c.whatsapp)}` : ''}${c.privCorreo ? `<br>✉️ ${esc(c.privCorreo)}` : ''}</p>
  <h3>2. Qué datos usamos</h3>
  <ul><li>Nombre y celular (WhatsApp).</li><li>DNI, si lo escribes (es opcional).</li><li>Lo que nos cuentes de tu corte.</li><li>La captura de tu pago por Yape, cuando se pide adelanto.</li><li>El historial de tus citas (fechas, servicios, montos y asistencia).</li></ul>
  <h3>3. Para qué los usamos</h3>
  <ul><li>Reservar, confirmar, recordar y atender tu cita.</li><li>Validar el adelanto por Yape.</li><li>Escribirte por WhatsApp sobre tu cita.</li><li>Llevar tu historial y tus beneficios de cliente frecuente.</li><li>Si escribes tu DNI: consultar tu nombre en el registro de RENIEC para llenarlo por ti (solo obtenemos el nombre).</li></ul>
  <p>No vendemos ni cedemos tus datos.</p>
  <h3>4. Quién nos ayuda a tratarlos</h3>
  <ul><li><b>Cloudflare</b>: aloja la página, la base de datos y las fotos (con conexión cifrada).</li><li><b>Servicio de consulta de DNI</b> (proveedor autorizado de RENIEC), solo si escribes tu DNI.</li><li><b>WhatsApp</b>, para los mensajes sobre tu cita.</li></ul>
  <p>Algunos de estos servicios pueden guardar datos fuera del Perú; solo los usan para prestarnos el servicio.</p>
  <h3>5. Cuánto tiempo los guardamos</h3>
  <ul><li>Mientras seas cliente de ${esc(neg)}.</li>${meses ? `<li>Si no vienes en <b>${meses} meses</b>, borramos tus datos personales y solo queda el registro contable (fecha y monto), sin tu nombre.</li>` : ''}${dias ? `<li>Las capturas de Yape se borran a los <b>${dias} días</b>.</li>` : ''}<li>Las copias de seguridad están cifradas y se eliminan a los 30 días.</li></ul>
  <h3>6. Tus derechos</h3>
  <p>Puedes pedir en cualquier momento <b>acceder</b> a tus datos, <b>corregirlos</b>, <b>borrarlos</b> u <b>oponerte</b> a su uso (derechos ARCO), y retirar tu consentimiento. Escríbenos ${wa ? `por <b>WhatsApp al ${esc(c.whatsapp)}</b>` : ''}${wa && c.privCorreo ? ' o ' : ''}${c.privCorreo ? `al correo <b>${esc(c.privCorreo)}</b>` : ''}${!wa && !c.privCorreo ? 'en el local' : ''}. Si no quedas conforme, puedes acudir a la <b>Autoridad Nacional de Protección de Datos Personales</b> (Ministerio de Justicia y Derechos Humanos).</p>
  <h3>7. Seguridad</h3>
  <p>Solo el personal autorizado accede a tus datos, cada uno con su propia clave o huella, y queda registro de quién hizo cada cambio. Las conexiones van cifradas.</p>
  <h3>8. Consentimiento</h3>
  <p>Al tocar <b>«Reservar»</b> aceptas este aviso y el uso de tus datos para tu cita. Guardamos la fecha de tu aceptación y la versión del aviso. Si algún día te pedimos algo más (por ejemplo, enviarte promociones), te lo preguntaremos aparte.</p>
  <p style="color:var(--mu);font-size:12px;margin-top:16px">Versión ${VERSION}</p>`;
  }
  /* La hoja: fondo oscuro, aviso con scroll y «Cerrar» (también con Esc o tocando el fondo). */
  function abrir(c) {
    if (document.getElementById('privHoja')) return;
    const previo = document.activeElement, el = document.createElement('div');
    el.id = 'privHoja'; el.className = 'privhoja'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Aviso de privacidad');
    el.innerHTML = `<div class="ph-caja"><div class="ph-cab"><b>Aviso de privacidad</b><button type="button" class="ph-x" aria-label="Cerrar">✕</button></div><div class="ph-txt">${html(c)}</div><button type="button" class="ph-ok">Entendido, volver</button></div>`;
    const cerrar = () => { el.remove(); document.documentElement.classList.remove('sin-scroll'); removeEventListener('keydown', tecla); previo?.focus?.() };
    const tecla = e => { if (e.key === 'Escape') cerrar() };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('.ph-x,.ph-ok')) cerrar() });
    addEventListener('keydown', tecla); document.body.appendChild(el); document.documentElement.classList.add('sin-scroll'); el.querySelector('.ph-ok').focus();
  }
  return { VERSION, html, abrir };
})();

/* Página propia (privacidad.html) */
if (document.body?.dataset.pagina === 'privacidad') (async function () {
  const $ = s => document.querySelector(s);
  let c = {};
  try { c = (await (await fetch('/api/publico')).json()).cfg || {} } catch (e) { }
  const neg = c.nombre || 'la barbería', esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const s = document.documentElement.style; if (c.acento) s.setProperty('--blue', c.acento); if (c.acento2) s.setProperty('--pur', c.acento2);
  $('#hero').innerHTML = `<div class="logo">${c.logoImg ? `<img src="/api/fotos/${esc(c.logoImg)}" style="width:100%;height:100%;object-fit:cover" alt="">` : '💈'}</div><div><h1>Aviso de privacidad</h1><p>${esc(neg)}</p></div>`;
  document.title = 'Aviso de privacidad · ' + neg;
  $('#app').innerHTML = `<div class="card">${Privacidad.html(c)}</div>
  <p style="text-align:center;margin:18px 0"><a class="btn" href="/reservar" style="text-decoration:none;display:inline-flex">Ir a reservar →</a></p>`;
})();
