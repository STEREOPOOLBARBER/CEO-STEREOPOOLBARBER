# Despliegue en Cloudflare

La app es un **Cloudflare Worker** que sirve `index.html` (panel) y `reservar.html`
(formulario) y atiende la API en `/api/*` (`worker/index.js`).

| Pieza | Servicio | Nombre |
|---|---|---|
| Base de datos | D1 | `stereo-barber-db` |
| Fotos | R2 | `stereo-barber-fotos` |
| Antibots | Turnstile | (opcional) |
| Login | Google (+ PIN de respaldo) | ID de cliente OAuth |

Las tablas se crean solas en la primera petición. Cada 5 minutos una tarea
programada vence las reservas que no pagaron.

## Primer uso

Al abrir la app por primera vez, el Worker crea las tablas y carga datos de ejemplo
(5 barberos y 6 servicios). **No hay PIN: se entra solo con Google.** El dueño se define con
`OWNER_EMAILS`; barberos y personal entran con el correo que se les ponga en ⚙️ Config.

Variables (Settings → Variables and Secrets):

| Nombre | Tipo | Valor |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Text | `xxxx.apps.googleusercontent.com` (activa el botón de Google) |
| `OWNER_EMAILS` | Text | Gmail(s) del dueño, separados por coma |
| `ALLOW_PIN` | Text | No lo pongas. `true` enciende el PIN y existe solo para pruebas locales |
| `TURNSTILE_SITEKEY` | Text | Clave pública de Turnstile (antibots del formulario) |
| `TURNSTILE_SECRET` | Secret | Clave secreta de Turnstile |

## Seguridad del acceso

- Google se verifica en el Worker: firma, emisor, aplicación (`aud`), vencimiento y correo verificado.
- Cada intento usa un **nonce de un solo uso** emitido por el servidor: un token robado no sirve dos veces.
- Solo entran los correos autorizados (dueño por variable; barberos y usuarios por su correo en ⚙️ Config). Quitar el correo cierra la sesión al instante.
- Sesión en cookie `HttpOnly; Secure; SameSite=Lax` (14 días); las peticiones de otro origen se rechazan.
- Límite de intentos por IP y **registro de accesos** (⚙️ Config → Seguridad → 📜).
- Los PIN y correos solo los ve quien tiene permiso de Config.

## Desarrollo local

```bash
npm install
npx wrangler dev          # http://localhost:8787
npm test                  # API (permisos, reservas, fotos); arrancar wrangler dev con --var ALLOW_PIN:true y datos sembrados
npm run test:google       # login con Google; ver instrucciones al inicio de test/google.e2e.mjs
```

## Multiusuario: clave y huella por barbero

Solo el administrador (permiso `config`) configura el acceso de cada persona, en **⚙️ Config → Barberos / Usuarios → ✏️ → 🔐 Acceso propio**
(la persona debe estar guardada antes: toca «Guardar configuración»).

- **Clave**: el admin la escribe o la genera (🎲) y se la pasa al barbero. Se guarda con PBKDF2-SHA256; cambiarla o quitarla cierra sus sesiones. 6 intentos fallidos por persona → bloqueo de 15 min.
- **Huella / Face ID** (passkeys): el admin toca «👆 Invitar a activar huella» y envía el link (un solo uso, 24 h). El barbero lo abre en **Safari/Chrome** (no dentro de WhatsApp) y toca «Activar huella». Hasta 5 dispositivos por persona; el admin puede quitarlos. La huella nunca sale del celular: el servidor solo guarda la llave pública.
- Las llaves quedan atadas al dominio (hostname). Si cambias de dominio, hay que volver a invitar.
- Google sigue siendo el acceso del dueño. Pruebas: `npm run test:acceso` (API) y `test/acceso.ui.mjs` (pantalla, con Playwright).

### Entrada simple
1. **Dueño:** «Entrar con Google» con tu correo (el de `OWNER_EMAILS`) → **entras directo**, sin clave. Enseguida te pregunta «¿Entrar la próxima vez con tu huella o Face ID?» → Sí.
2. **Las veces siguientes:** abre la app y toca **«👆 Entrar con huella / Face ID»**. Nada que escribir. También se activa en otro aparato desde ☰ Menú → «👆 Huella / Face ID» (justo después de entrar).
3. **Barberos (sin Google):** en ⚙️ Config → Equipo → la persona → **🔐 Acceso**: le pones su **clave** (queda fija; marca «Que la cambie al entrar» si prefieres que ponga una suya) y tocas **«📲 Activar su celular (QR)»**. Él escanea el QR con la cámara de su celular (o le mandas el link por WhatsApp), toca «Entrar», pone su clave y acepta activar su huella o Face ID. El QR sirve una sola vez y por 24 horas.
   - La clave solo funciona en celulares que tú activaste. Si cambia de celular, le haces otro QR. Si alguien tiene correo en Equipo, también puede entrar con su Google.
4. **Pantalla de entrada:** en un aparato nuevo sale «Soy el dueño» + Google, y para el equipo «pide al dueño que active tu celular con un QR». En el celular de un barbero ya activado sale «Hola, Jhon» con su huella / Face ID y su clave (y «No soy Jhon»). Abajo, «¿Problemas para entrar?» con los pasos.
5. Si quitas un aparato (⚙️ Config → Aparatos) o sacas un correo de `OWNER_EMAILS`, esa entrada se cierra al instante. Recomendado: activa la **Verificación en 2 pasos** de tu cuenta de Google.
Pruebas: `test/google.e2e.mjs`, `test/perfiles.ui.mjs` y `test/huella.ui.mjs` (con GOOGLE_CLIENT_ID de prueba); `acceso.e2e`/`acceso.ui` corren con `--var GOOGLE_CLIENT_ID:` vacío.

### Vista previa de los links (WhatsApp)
El Worker agrega título, descripción y **logo** (el de ⚙️ Config → Marca) a `reservar.html` e `index.html` (etiquetas Open Graph). Cada tipo de link tiene su texto: reserva, «Tu cita en …» (`?c=`) y «Activa tu huella» (`?huella=`). Nunca incluye datos del cliente. WhatsApp guarda la vista previa en caché: si cambias el logo, un link ya enviado puede tardar en actualizarse (links nuevos salen bien).

### Consulta de DNI (RENIEC vía Shalom API)
Al escribir los 8 dígitos del DNI, el formulario de reserva y el panel buscan el nombre y lo rellenan (editable). La consulta la hace el Worker; solo se devuelve el **nombre**.
- Secreto obligatorio: Workers → Settings → Variables and Secrets → **Secret** `SHALOM_API_KEY` (nunca en el código ni en GitHub).
- Formulario público: máx. 12 consultas / 15 min por IP. Panel: requiere sesión. Resultados en caché 30 días (tabla `dnis`).
- ⚙️ Config → Seguridad → **🪪 Probar consulta de DNI** muestra la respuesta cruda del servicio para verificar los campos.
- Pruebas: `npm run test:dni` (con RENIEC simulado; ver cabecera del archivo).

### Pegar mensajes de WhatsApp (Nueva cita)
La caja verde de **Nueva cita** acepta (1) el mensaje de un cliente (rellena DNI, teléfono y nombre) o (2) una agenda completa tipo «Jesús / Domingo 9 am André…». En el caso 2 muestra una vista previa y solo crea las citas al tocar **Crear**. Reglas de servicio: sin palabra clave → corte + asesoría; «barba» → corte + barba; «facial» → facial + corte; «semi» → semiondulación + corte; «platinado» → platinado. Prueba: `test/agenda.ui.mjs`.

### Política y reprogramación
⚙️ Config → **📜 Política**: minutos de tolerancia, hasta cuántas horas antes se puede reprogramar (24 por defecto), cuántas veces (1 por defecto, o «No permitir») y un texto libre. En «Ver estado de cita» el cliente ve la política y el botón **📅 Reprogramar mi cita** solo si faltan al menos esas horas; el servidor vuelve a comprobarlo (`POST /api/publico/cita/:codigo/reprogramar`). Mismo barbero, solo días/horas libres. El panel marca la cita «🔁 Reprogramada (antes …)» y avisa. Prueba: `npm run test:reprog`.

### App del cliente «Mi cita» (`/cita/CODIGO`)
El link que recibe el cliente ahora es **`tudominio/cita/CODIGO`** (WhatsApp, QR, formulario y panel ya lo usan; los links viejos `estado.html?c=` y `reservar.html?c=` pasan solos a la dirección nueva).
- Fondo blanco, sin emojis, con los colores de ⚙️ Config → Marca. Muestra el estado con sus pasos, cuenta regresiva, «Confirmo que voy», «Cambiar día u hora» (si faltan ≥ 24 h), QR para mostrar al llegar, detalles, mapa, política y abajo WhatsApp y Actualizar.
- Botón **Descargar**: en Android instala la app; en iPhone explica los 3 toques (Safari → Compartir → Agregar a inicio). El ícono abre **directo su cita** (cada cita tiene su manifiesto: `/cita/CODIGO/app.webmanifest`). Instalada, no sale «Toca para entrar».
- El celular recuerda las citas que abrió («Mis citas» en `/cita`): solo código y fecha.
- No hay que hacer nada en Cloudflare: se publica sola con el push.

### Avisos al celular
- **Tú y tus barberos:** ☰ Menú → **🔔 Avisos en este celular** → Activar (y «Enviarme un aviso de prueba»). Llegan: nueva reserva, comprobante de Yape, cliente confirmó que viene y reprogramó. El barbero recibe solo los de sus citas. Al cerrar sesión o quitar el aparato, se apagan.
- **Clientes:** en su app «Mi cita» tocan **Activar**. Reciben: cita confirmada, cambio de fecha u hora, recordatorio el día anterior (desde las 6 p. m.) y 2 horas antes, y «¿cómo te atendimos?».
- **iPhone:** solo funcionan con la app instalada en la pantalla de inicio (regla de Apple). Android y PC: siempre.
- **No hay que configurar nada en Cloudflare:** la clave de firma se crea sola. (Opcional: secreto `VAPID_PRIVADA` si algún día quieres fijarla tú.) Los recordatorios de WhatsApp siguen igual, como respaldo.

### Formulario de reservas (nuevo orden) y datos
- Pasos: **Servicio → Tus datos → Día y hora → Barbero → Adelanto**. En «Día y hora» solo salen horas con algún barbero libre que haga ese servicio; en «Barbero», solo los libres a esa hora (y «El primero disponible» si hay varios).
- En ⚙️ Config → Equipo → cada barbero: **«Servicios que hace»** (todos marcados por defecto).
- Ya no se piden **distrito** ni **foto de referencia** (lo que había guardado se borró). No hay casilla: junto al botón dice «Al tocar Reservar aceptas el aviso de privacidad». El aviso se abre encima y al cerrarlo sigues donde estabas.
- La pantalla de carga entra sola; el Tío Stereo aparece y habla con el primer toque. Para el nuevo orden hay 3 frases nuevas por grabar (⚙️ Config → Voz): «Al elegir servicio (pide sus datos)», «Al poner sus datos» y «Si elige el primero disponible».
- 🔔 Notificaciones: **📋 Copiar** copia todo lo del cliente.

### Duración de cada servicio (y horas de espera)
- ⚙️ Config → **Servicios** → ✏️ → **Duración**: 1 a 6 horas. Con 2 o más, cada hora intermedia se toca para marcarla **«⏳ Espera (libre)»** (por ejemplo, mientras el producto hace efecto). La primera y la última siempre son de trabajo.
- El link de reservas solo ofrece horas donde entra todo el servicio (sin pisar el refrigerio ni pasar del cierre). Las horas de espera quedan **libres para otro cliente**.
- En la agenda la cita dice «9:00 a. m. – 12:00 p. m. · ⏳ espera 10:00 a. m.»; el cliente lo ve en «Mi cita».
- Nada se pisa: ni el formulario, ni el panel, ni dos clientes reservando a la vez. Los servicios que no toques siguen de 1 hora.
- **Refrigerio vacío = se atiende todo el día.**

### Agenda: cancelar, papelera y flechas
- En cada cita activa, **«🚫 Cancelar»** (etiqueta): la cita pasa a CANCELADA y su horario queda libre.
- **🗑️ Papelera:** en una cita cancelada, el 🗑️ la mueve a la papelera. El botón 🗑️ de herramientas (con el número) la abre: **Recuperar** (vuelve a la agenda; si su horario ya lo tomó otra, vuelve como cancelada) o **Eliminar ya**. A los **7 días** se borra sola, con sus fotos.
- **▲ ▼** al costado del ⚡: saltan de tarjeta en tarjeta. Al bajar en la lista, quedan flotando abajo a la derecha.

### Promociones
En el panel: **☰ Menú → 🏷️ Promociones → Nueva promoción**. Eliges el servicio, el precio promo (menor al normal), desde/hasta y, si quieres, solo ciertos días (ej.: martes y miércoles). Puedes pausarla, ordenarla o borrarla.
- El cliente la ve en su app «Mi cita» y en el formulario (servicio con precio tachado y días marcados «Promo»). Al reservar ese servicio un día válido, **el sistema pone el precio promo solo**; en la agenda la cita sale con la etiqueta 🏷️.
- Cada promo muestra cuántas veces la vieron, cuántos tocaron «Reservar», cuántas citas salieron y cuánto dejaron.
- No hay que configurar nada en Cloudflare.

### Rendimiento: el panel ya no descarga toda la historia (Fase 1)
- `GET /api/panel` trae solo la **ventana** de citas: 35 días atrás → 120 días adelante (más los Yape pendientes) y un conteo de visitas por cliente para la fidelidad.
- `GET /api/citas/buscar?desde&hasta&estado&barbero&q&limit&offset` filtra y pagina **en la base de datos** (máx. 500 por página; la búsqueda del panel pide de 30 en 30 con «Ver más»). Respeta permisos: el barbero solo ve lo suyo y sin teléfono si no tiene permiso.
- La agenda pide sola los días/semanas/meses fuera de la ventana; Clientes, Dashboard y Excel piden la historia completa solo cuando se abren.
- Índices: `citas(fecha)`, `citas(estado, expira)`, `citas(barbero_id, fecha, hora)`.
- Pruebas: `npm run test:paginacion` y `test/paginacion.ui.mjs` (siembran ~6300 citas; una se llama «Zacarías Antiguo»).

### Seguridad del link de reserva y de la API de DNI (Fase 2)
- **Límites de Cloudflare** (`ratelimits` en `wrangler.jsonc`, no tocan la base de datos): `RL_PUB` 120/min por IP para todo lo público, `RL_DNI` 10/min por IP para DNI, `RL_RES` 6/min para reservar, reprogramar y pedir ficha. Se suman a los límites por hora que ya existían.
- **Ficha del formulario**: la consulta pública de DNI exige el encabezado `X-Ficha` (token firmado HMAC de 30 min) que entrega `POST /api/publico/ficha`; si Turnstile está activo, la ficha solo se entrega tras pasarlo. Desde la consola, sin ficha → 403.
- **Tope diario de consultas a RENIEC** (⚙️ Config → Seguridad, 300 por defecto; 0 = sin tope). Las consultas en memoria (30 días) no cuentan.
- **Turnstile** (opcional pero recomendado): crear el widget en Cloudflare → Turnstile, y en el Worker agregar `TURNSTILE_SITEKEY` (Text) y `TURNSTILE_SECRET` (Secret). Protege reservar y la ficha de DNI.
- **Encabezados**: CSP, HSTS, X-Frame-Options, COOP y Permissions-Policy (micrófono y ubicación solo para la propia página: los usa Config).
- Pruebas: `npm run test:dni`, `npm run test:turnstile` (con verificador simulado).

### Monitoreo y respaldos (Fase 4)
- **⚙️ Config → Seguridad → 🛡️ Monitoreo y respaldos**: últimos 14 días de reservas web, consultas DNI, bloqueos (por tipo) e ingresos fallidos; estado de Turnstile, DNI y respaldo.
- Los bloqueos se cuentan en memoria y se escriben como mucho una vez por minuto (tabla `contadores`, se limpia a los 60 días), así un ataque no llena la base de datos.
- **Avisos en la 🔔** (solo el dueño): DNI al 80 %/agotado, 50+ bloqueos en el día, 10+ ingresos fallidos en 24 h, respaldo atrasado.
- **Respaldo automático diario** (cron, desde las 3 a. m. de Lima) en R2 `respaldos/AAAA-MM-DD.json`, privado; se guardan 30 días. Se descarga desde el panel y se restaura con «♻️ Restaurar respaldo». Botón «Crear respaldo ahora».
- **D1 Time Travel**: Cloudflare además guarda puntos de restauración de la base de datos. Para volver a un momento anterior: `npx wrangler d1 time-travel restore stereo-barber-db --timestamp=2026-11-04T08:00:00Z` (consulta antes con `npx wrangler d1 time-travel info stereo-barber-db`).
- Errores del Worker: Workers & Pages → ceo-stereopoolbarber → **Observability** (logs activados en `wrangler.jsonc`).
- Prueba: `npm run test:monitoreo` (arranque con `--test-scheduled --var RESPALDO_MIN:0`).

### Desarrollo y producción (Fase 1 de la arquitectura)
- `npm test` corre las 14 suites, cada una con un servidor limpio (`test/correr.mjs`). GitHub Actions las corre en cada push (`.github/workflows/pruebas.yml`).
- Rama `desarrollo` → Worker **ceo-stereopoolbarber-staging** (base y fotos propias). Rama `main` → producción. Detalles y reglas en `CLAUDE.md`.
- Configurar el staging en Cloudflare (una sola vez): Workers & Pages → **Create** → **Import a repository** → este repo → nombre `ceo-stereopoolbarber-staging` → en **Build settings**: rama de producción `desarrollo` y *Deploy command* `npx wrangler deploy --env staging`. Agregar al Worker de staging las variables `OWNER_EMAILS`, `SHALOM_API_KEY` (opcional) y Turnstile (o dejarlo sin Turnstile). En Google Cloud agregar el origen `https://ceo-stereopoolbarber-staging.stereophysique15.workers.dev`.
- En el Worker de **producción** → Settings → Builds: desactivar **«Builds for non-production branches»**, para que la rama `desarrollo` no use la base de datos real.

### Blindaje base (Fase 2 de la arquitectura)
- **Bitácora** (tabla `auditoria`, 180 días): quién creó, editó, cambió de estado, validó Yape, eliminó, reprogramó (cliente) o reservó; cambios de configuración, claves, invitaciones, respaldos y restauraciones. Nunca guarda claves. Panel: 🛡️ Monitoreo → «📝 Bitácora», y en cada cita «📝 Historial de cambios». API: `GET /api/auditoria?objeto=CODIGO`.
- **Cookies `__Host-brb_s` / `__Host-brb_g`** (no las puede pisar ningún subdominio). Las de nombre viejo se aceptan durante la transición.
- **Sesión nueva en cada ingreso**: al entrar a un perfil se cierra la sesión anterior del mismo navegador.
- **Librerías sin CDN**: `vendor/qrcode.min.js` y `vendor/xlsx.full.min.js` guardadas en el proyecto, cargadas con `integrity` (SRI). La CSP ya no permite scripts de cdnjs.

### Monolito modular (Fase 3 de la arquitectura)
El servidor dejó de ser un solo archivo de 1 100 líneas: ahora son módulos por área de la barbería (`worker/modulos/`: público, acceso, citas, configuración, DNI, seguridad, monitoreo, respaldos) con un enrutador central. Mismo comportamiento (las 15 suites de pruebas pasan igual).
La estructura de la base de datos ahora es **versionada** (`MIGRACIONES` en `worker/datos.js`, tabla `_migraciones`): cada cambio futuro se aplica una sola vez y en orden. «🔍 Probar nube» muestra las versiones aplicadas.

### Datos de la barbería (Fase 4)
- **Ficha de cliente** en su propia tabla: visitas, gastado, faltas, cliente desde, última visita, próxima cita, DNI y celular, más **preferencias de corte** y **notas** que escribe la barbería. Se actualiza sola con cada cita. 👥 Clientes → toca un cliente.
- **Clientes** ya no descarga toda la historia: lista desde la base de datos con orden (recientes, más visitas, más gasto, A–Z, por recuperar), búsqueda **sin tildes** y «Ver más» por cursor. Desde la ficha: WhatsApp, copiar celular y **➕ Cita** con los datos ya llenos.
- **Dashboard** pide solo el periodo elegido; retención y «por recuperar» salen de las fichas.
- Migración **v2** (`citas.tel` + tabla `clientes`), se aplica sola y arma las fichas de todas las citas existentes. Botón «🔄 Reconstruir fichas de clientes» en 🛡️ Monitoreo.

### Panel modular + CSP estricta (Fase 5)
- El JavaScript salió del HTML: `js/panel/*.js` (por pantalla), `js/reservar.js`, `js/estado.js`. Ya no hay ningún `onclick` en línea: los botones usan `data-on-click` y un despachador único (`js/eventos.js`).
- La política de seguridad prohíbe ejecutar scripts en línea (`script-src 'self'` y `script-src-attr 'none'`): aunque alguien lograra meter texto con código en una cita o un nombre, el navegador no lo ejecuta.
- `js/` se sirve con `Cache-Control: no-cache` (los cambios se ven al recargar). Prueba de recorrido: `test/csp.ui.mjs`.

### Tiempo real (Fase 6)
- Durable Object **Avisos** (`wrangler.jsonc`: `durable_objects` + `migrations` con `new_sqlite_classes`, disponible en el plan gratis) mantiene un WebSocket con cada panel abierto (`/api/tiempo-real`, solo con sesión y desde la propia página).
- Cuando algo se guarda (reserva, Yape, reprogramación, edición, cancelación, una reserva que vence), los paneles se actualizan **en menos de 1 segundo**. El aviso no lleva datos: cada panel vuelve a pedir lo suyo con sus permisos.
- Punto junto a la 🔔: **verde** = en vivo; **gris** = sin conexión (se actualiza cada 20 s y se reconecta solo). Con conexión, la consulta periódica baja a cada 2 minutos (menos consultas a la base de datos).
- Prueba: `test/tiemporeal.ui.mjs`.

### Datos personales · Ley 29733 (Fase 7)
- **Aviso de privacidad** público en `/privacidad.html` (enlazado en el formulario, junto al DNI y al pie de reservar/estado). Se llena con ⚙️ Config → **🔏 Privacidad y datos personales** (responsable, RUC/DNI, correo).
- **Consentimiento obligatorio** al reservar, con constancia (fecha y versión del aviso) en cada cita.
- **Derechos del cliente**: en su ficha → 🔏 Datos personales → **📄 Descargar sus datos** o **🗑️ Anonimizar** (escribiendo ANONIMIZAR). Queda en la bitácora sin su nombre.
- **Retención** (apagada por defecto): anonimizar clientes inactivos tras 12/24/36 meses y borrar capturas de Yape tras 90/180/365 días.
- **Respaldos cifrados** (AES-256). Recomendado: crear el secreto `RESPALDO_CLAVE` (texto largo al azar) en Settings → Variables and secrets. Si se cambia esa clave, los respaldos anteriores ya no se pueden abrir (descárgalos antes).

### WhatsApp: recordatorios y confirmación de asistencia
- **⏰ Recordatorios** (agenda): citas de mañana y de las próximas 3 horas; 💬 abre WhatsApp con el mensaje y el link de la cita. La 🔔 avisa desde las 5 p. m. si faltan recordar.
- **El cliente confirma** desde el link de su cita («✅ Confirmo que voy») o respondiendo «sí» por WhatsApp → en la agenda: **👍 Confirmó que viene**.
- **🤖 WhatsApp automático** (⚙️ Config): listo para conectar un **número nuevo** con la API oficial de Meta (guía de 9 pasos en la misma pantalla, con las plantillas para copiar). Recordatorio el día antes, 2 h antes y «cita confirmada» al validar el Yape. Meta cobra cada mensaje de plantilla.

### Reporte semanal de caja
- Cada **lunes desde las 8 a. m.** se arma solo el reporte de la semana anterior (lunes a domingo) y llega a la 🔔. También desde ☰ Menú → **📊 Reporte semanal de caja** o desde la Caja.
- Incluye ingresos (↑↓ vs. semana anterior), cortes, ticket, % no vino, por barbero con **comisión** y lo que queda al local, por día, servicios top, Yape, reservas web, clientes nuevos, confirmaciones y por recuperar. Botones **💬 WhatsApp** y **📥 Excel**.
- El reporte guardado es la «foto» del lunes; si corriges citas viejas, usa **rehacer**.

### Filtros de la agenda
- **⚙️ junto al buscador → Búsqueda avanzada:** fecha (Hoy, Mañana, Esta semana, Este mes o Desde/Hasta), barbero, servicio, pago, origen, cliente (nuevo, frecuente, con notas), WhatsApp y orden. Se eligen y se toca **🔍 Aplicar filtros**; afuera aparecen como pastillas con ✕ y **✕ Limpiar** vuelve a lo de siempre (Hoy · Todos · por hora).
- **Días:** al elegir un día, las etiquetas cuentan y muestran solo ese día. **📆 Mes** (o tocar otra vez el día elegido) muestra todo el mes agrupado por día, con ‹ › para cambiar de mes y **Ver más** de 30 en 30. «Yape por validar» siempre cuenta todos los días.
- **Doble toque en una etiqueta:** su orden y sus filtros (p. ej. Yape por validar → más antiguo / por vencer / con o sin captura; Confirmada → confirmó que viene; Atendido → mayor monto / sin foto después; Cancelada → canceladas o expiradas). Cada etiqueta recuerda su orden en ese celular.
- El barbero ve el ⚙️ sin barbero, pago ni cliente; el servidor lo vuelve a comprobar.
- Técnico: `GET /api/citas/buscar` (filtros, `orden`, cursor) y `GET /api/citas/conteo` (números por estado). Migración v5 agrega `servicio_id`, `origen` y `pago` indexados. No hay que hacer nada en Cloudflare.

### Narrador: solo tu voz, «Toca para entrar» y después del corte
- **Voz:** ya no existe la voz de robot. Habla solo lo que grabes en ⚙️ Config → 🗣️ Narrador. Botones **🎬 Frases** y **📅 Fechas y horas** (guion guiado). Las horas salen de tu horario: si lo cambias, el panel avisa cuáles faltan.
- **Entrada:** el link de reserva y el estado de la cita abren con tu logo y **«Toca para entrar»**; ese toque habilita el sonido en todos los celulares (en iPhone suena aunque esté en silencio, desde iOS 17), el logo se derrite y el Tío Stereo saluda.
- **Estado de la cita:** el Tío Stereo dice el estado con la fecha y hora. Antes de la cita sale un **QR**: en el panel, el **📷** junto al buscador lo lee y abre la cita.
- **Ya atendido:** el cliente ve su **antes y después**, **califica en anónimo** (estrellas, etiquetas, comentario) y ve el botón de **reseña en Google** (pega tu link en ⚙️ Config → 📝 Formulario). Ves el resultado en ☰ Menú → **⭐ Calificaciones** (cada barbero aparece al juntar 3).
- En Cloudflare no hay nada que hacer (la base de datos se actualiza sola).

### Equipo y entrada al panel (una sola regla)
- ⚙️ Config → **👥 Equipo**: una sola lista de personas (antes «Barberos» y «Usuarios» por separado). Cada una con su rol, sus permisos, **«✂️ Atiende clientes»** (sale en la agenda, el formulario y la caja), su correo de Google y su acceso (clave o huella).
- **Para entrar:** el dueño, con su Google directo (o su huella / Face ID); el equipo, con su Google y después **su propia clave** o su huella.
- **Dueño:** ya no existe la clave 1111. La primera vez, en «¿Quién eres?» → Dueño → **crea tu clave**. El perfil Dueño solo aparece en un aparato abierto con tu Google de dueño.
- **Barbero con su propio celular:** pon su correo en el Equipo; la primera vez él crea su clave. **En la tablet del local:** tú le pones una clave en Equipo → su nombre → Acceso propio.
- Si alguien aparece repetido (por ejemplo Leandro como barbero y como usuario ligados), se juntó solo al actualizar. Si quedan dos con el mismo nombre sin estar ligados, sale un aviso en el Equipo para que elijas cuál queda.
- **Importante:** al actualizar se cierran todas las sesiones abiertas (cambió el formato de acceso): todos vuelven a entrar una vez.

### Accesos: olvidos, bajas y aparatos
- **Barbero olvidó su clave:** Equipo → su nombre → «Dar clave temporal». Al entrar con ella, el sistema le pide **crear la suya** (tú nunca la sabrás).
- **¿Olvidaste tu clave?** (botón en «¿Quién eres?»): la persona crea una nueva y confirma con **su Google**. Sirve también para ti (dueño).
- **🔑 Mi clave** (☰ Menú): cada uno cambia la suya; se cierran sus otras sesiones.
- **Bloqueado por intentos:** Equipo → su nombre → «🔓 Desbloquear».
- **Ya no trabaja aquí:** Equipo → su nombre → «🚫 Dar de baja»: deja de entrar al instante en todos sus aparatos; sus citas quedan.
- **Celular o tablet perdido:** ⚙️ Config → 🔐 Seguridad → **📱 Aparatos autorizados** → «Quitar».
- **Tablet del local:** si un barbero entra en un aparato que no es suyo, se cierra solo tras **15 minutos sin uso**.

### App del panel (instalable)
- El panel ahora es una **app**: en Android o PC, ☰ Menú → **📲 Instalar la app**; en iPhone, el mismo botón muestra los pasos (Safari → Compartir → Agregar a inicio).
- **Se actualiza sola:** cuando subimos cambios, sale «Hay una versión nueva → Actualizar», o se aplica al volver a abrir la app. Nunca corta lo que estás haciendo.
- Se ve **igual en celular, laptop y PC** (una columna como la app de Total Tools) y los botones no quedan tapados por la barra del iPhone ni por el teclado.
- Emergencia (si algo de la app fallara): en Cloudflare → Variables, poner `SW_APAGADO` = `true` y volver a desplegar; la app vuelve a funcionar como página normal.
