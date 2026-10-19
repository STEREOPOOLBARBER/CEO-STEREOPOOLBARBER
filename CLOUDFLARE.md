# Despliegue en Cloudflare

La app es un **Cloudflare Worker** que sirve `index.html` (panel) y `reservar.html`
(formulario) y atiende la API en `/api/*` (`worker/index.js`).

| Pieza | Servicio | Nombre |
|---|---|---|
| Base de datos | D1 | `stereo-barber-db` |
| Fotos | R2 | `stereo-barber-fotos` |
| Antibots | Turnstile | (opcional) |
| Login | PIN | (sin servicios externos) |

Las tablas se crean solas en la primera petición. Cada 5 minutos una tarea
programada vence las reservas que no pagaron.

## Primer uso

Al abrir la app por primera vez, el Worker crea las tablas y carga datos de ejemplo
(5 barberos y 6 servicios). **PIN del dueño: `1234`**, y los barberos `1111`, `2222`,
`3333`, `4444` y `5555`. Cámbialos en ⚙️ Config → Seguridad y Usuarios.

Variables opcionales (Settings → Variables and Secrets):

| Nombre | Tipo | Valor |
|---|---|---|
| `TURNSTILE_SITEKEY` | Text | Clave pública de Turnstile (antibots del formulario) |
| `TURNSTILE_SECRET` | Secret | Clave secreta de Turnstile |

## Desarrollo local

```bash
npm install
npx wrangler dev          # http://localhost:8787
npm test                  # prueba la API contra wrangler dev (con datos sembrados)
```
