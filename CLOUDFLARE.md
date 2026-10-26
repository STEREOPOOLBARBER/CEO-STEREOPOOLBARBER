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
