# Despliegue en Cloudflare

La app es un **Cloudflare Worker** que sirve `index.html` (panel) y `reservar.html`
(formulario) y atiende la API en `/api/*` (`worker/index.js`).

| Pieza | Servicio | Nombre |
|---|---|---|
| Base de datos | D1 | `stereo-barber-db` |
| Fotos | R2 | `stereo-barber-fotos` |
| Antibots | Turnstile | (opcional) |
| Login | Google Identity Services | ID de cliente OAuth |

Las tablas se crean solas en la primera petición. Cada 5 minutos una tarea
programada vence las reservas que no pagaron.

## Variables del Worker

Cloudflare → Workers & Pages → `ceo-stereopoolbarber` → Settings → Variables and Secrets:

| Nombre | Tipo | Valor |
|---|---|---|
| `OWNER_EMAILS` | Text | Correo(s) de Google de los dueños, separados por coma |
| `GOOGLE_CLIENT_ID` | Text | `xxxx.apps.googleusercontent.com` |
| `TURNSTILE_SITEKEY` | Text | Clave pública de Turnstile (opcional) |
| `TURNSTILE_SECRET` | Secret | Clave secreta de Turnstile (opcional) |
| `ALLOW_PIN` | Text | `false` para permitir solo Google |

## Desarrollo local

```bash
npm install
npx wrangler dev          # http://localhost:8787
npm test                  # verificación del token de Google
npm run test:e2e          # prueba la API contra wrangler dev (con datos sembrados)
```
