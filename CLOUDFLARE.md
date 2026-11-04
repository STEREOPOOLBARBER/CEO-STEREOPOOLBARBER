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

### Entrada en dos pasos (Google → perfil)
1. El dispositivo entra con **Google** (correo autorizado). Eso solo "abre la puerta": todavía no hay panel.
2. Aparece **¿Quién eres?** con los perfiles. El **Dueño** entra con su clave (de arranque **1111** hasta que la cambie en ⚙️ Config → Seguridad → 🔑 Mi clave y huella). Cada barbero/usuario entra con su **clave** o **huella**; los permisos son los que asignó el admin.
3. Un correo que no es del dueño solo ve su propio perfil (y entra directo si no tiene clave ni huella). Un barbero sin correo queda autorizado en su celular al activar su huella (90 días).
Pruebas: `test/google.e2e.mjs` y `test/perfiles.ui.mjs` (con GOOGLE_CLIENT_ID de prueba); `acceso.e2e`/`acceso.ui` corren con `--var GOOGLE_CLIENT_ID:` vacío.

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

### Página de estado de cita (`estado.html`)
Página solo para consultar la cita: `estado.html?c=CODIGO` (o escribir el código). Muestra estado, cuenta regresiva, datos, política, mapa, botón de WhatsApp y **Reprogramar** (si faltan ≥ 24 h). Los mensajes de WhatsApp (`{seguimiento}`) ya apuntan aquí; los links viejos `reservar.html?c=` siguen funcionando. Tiene su propia vista previa en WhatsApp («Tu cita en …»).

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
