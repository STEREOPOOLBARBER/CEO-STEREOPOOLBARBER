/* Aviso de privacidad (Ley N.° 29733, Perú). Se arma con los datos que el negocio pone en ⚙️ Config → Privacidad. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
(async function () {
  let c = {};
  try { c = (await (await fetch('/api/publico')).json()).cfg || {} } catch (e) { }
  const neg = c.nombre || 'la barbería', tit = c.privTitular || neg, wa = String(c.whatsapp || '').replace(/\D/g, '');
  const meses = +c.retencionMeses || 0, dias = +c.capturasDias || 0;
  const s = document.documentElement.style; if (c.acento) s.setProperty('--blue', c.acento); if (c.acento2) s.setProperty('--pur', c.acento2);
  $('#hero').innerHTML = `<div class="logo">${c.logoImg ? `<img src="/api/fotos/${esc(c.logoImg)}" style="width:100%;height:100%;object-fit:cover" alt="">` : '💈'}</div><div><h1>Aviso de privacidad</h1><p>${esc(neg)}</p></div>`;
  document.title = 'Aviso de privacidad · ' + neg;
  $('#app').innerHTML = `<div class="card">
  <p>En <b>${esc(neg)}</b> cuidamos tus datos personales conforme a la <b>Ley N.° 29733, Ley de Protección de Datos Personales</b>, y su reglamento.</p>
  <h3>1. Responsable</h3>
  <p><b>${esc(tit)}</b>${c.privRuc ? ` · RUC/DNI ${esc(c.privRuc)}` : ''}${c.direccion ? `<br>📍 ${esc(c.direccion)}` : ''}${wa ? `<br>💬 WhatsApp: ${esc(c.whatsapp)}` : ''}${c.privCorreo ? `<br>✉️ ${esc(c.privCorreo)}` : ''}</p>
  <h3>2. Qué datos usamos</h3>
  <ul><li>Nombre, celular (WhatsApp) y distrito.</li><li>DNI, si lo escribes (es opcional).</li><li>Lo que nos cuentes de tu corte y, si la subes, una foto de referencia.</li><li>La captura de tu pago por Yape, cuando se pide adelanto.</li><li>El historial de tus citas (fechas, servicios, montos y asistencia).</li></ul>
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
  <p>Al marcar la casilla de aceptación al reservar, autorizas este uso de tus datos. Guardamos la fecha de tu aceptación.</p>
  <p style="color:var(--mu);font-size:12px;margin-top:16px">Versión 1</p></div>
  <p style="text-align:center;margin:18px 0"><a class="btn" href="reservar.html" style="text-decoration:none;display:inline-flex">← Volver a reservar</a></p>`;
})();
