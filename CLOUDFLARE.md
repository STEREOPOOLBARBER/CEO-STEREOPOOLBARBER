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
