# Stereo Barber Pool · guía del repositorio

Sistema de reservas de una barbería en Puente Piedra (Lima, Perú). El dueño no es programador: habla en español, revisa desde el celular y aprueba cada fase antes de ejecutarla.

## Reglas de la casa
- **Idioma:** todo en español (código, comentarios, mensajes, commits, respuestas). Nombres de funciones cortos en español, como el código existente.
- **Hora:** siempre la de Lima (`America/Lima`, UTC-5, sin horario de verano). En el Worker usar `ahoraLocal(env)`; nunca la hora del servidor.
- **Nunca subir claves** (Shalom, Turnstile, Google secret, PIN) al repositorio ni pegarlas en mensajes. Van como *Secret* en Cloudflare.
- **Probar antes de subir:** `npm test` debe quedar todo en verde. Si una prueba falla, se arregla la causa; nunca se borra ni se salta la prueba.
- **Primero el plan, luego el OK del dueño**, en fases. Explicar en palabras simples qué cambió y qué debe hacer él en Cloudflare.
- No inventar resultados: decir qué se probó en local y qué solo se podrá ver en producción (Google real, Turnstile real, RENIEC real, celulares reales).

## Ramas y entornos
| Rama | Worker | Base de datos / fotos | Para qué |
|---|---|---|---|
| `desarrollo` | `ceo-stereopoolbarber-staging` (`--env staging`) | `stereo-barber-db-staging` / `stereo-barber-fotos-staging` | Probar cambios con datos de prueba |
| `main` | `ceo-stereopoolbarber` (producción) | `stereo-barber-db` / `stereo-barber-fotos` | Clientes reales |

**Por ahora (decisión del dueño): se trabaja directo en `main`** hasta que el sistema se use todos los días. El staging ya está creado y configurado (Worker `ceo-stereopoolbarber-staging`, rama `desarrollo`, `OWNER_EMAILS` puesto) para activarlo más adelante; solo le falta agregar su origen en Google Cloud. Mientras tanto, `npm test` en verde antes de cada push a `main` es obligatorio.

Flujo futuro: trabajar en `desarrollo` → `npm test` → push → el dueño prueba en staging → se pasa a `main` (merge) → Cloudflare despliega producción. GitHub Actions (`.github/workflows/pruebas.yml`) corre las pruebas en cada push.

## Estructura
- `index.html` — panel (dueño, barberos, personal): solo HTML y estilos. Su JS está en `js/panel/` por pantalla (`base`, `agenda`, `clientes`, `compartir`, `dashboard`, `config`, `acceso`, `inicio`), cargados en ese orden como scripts clásicos (comparten el ámbito global). Modo nube (`/api`) o local (localStorage, solo demo).
- `js/reservar.js`, `js/estado.js` — JS del formulario y de la página de estado.
- `js/eventos.js` — **despachador de eventos** y registro `ACC` de acciones (generado a partir de los antiguos `onclick`).
- **CSP estricta: prohibido el JavaScript en línea** (`script-src 'self'`, `script-src-attr 'none'`). Nunca escribir `onclick="…"`, `onchange="…"` ni `<script>` dentro del HTML. Para un botón nuevo: `data-on-click="nombreAccion"` (también `data-on-change`, `data-on-input`, `data-on-keydown`) y, junto al código de esa pantalla, `ACC.nombreAccion = function (event) { … }` (`this` = el elemento). Los datos van en `data-p0`, `data-p1`… (`this.dataset.p0`). Si `test/csp.ui.mjs` encuentra una acción sin registrar o una violación de CSP, falla.
- `reservar.html` — formulario público de reservas (con el narrador «Tío Stereo»).
- `estado.html` — página pública para ver el estado de una cita (`?c=CODIGO`) y reprogramarla.
- `worker/` — API (Cloudflare Worker), **monolito modular**:
  - `index.js` — solo entrada: seguridad común (límite público, mismo origen), migraciones, enrutador por módulos, cron.
  - `comun.js` — constantes, utilidades, hora de Lima y reglas de agenda (`slotsDia`, `trabaja`, `reglaReprog`). Sin dependencias.
  - `datos.js` — D1: **migraciones versionadas** (`MIGRACIONES`), kv, citas (insertar/guardar/expirar), fotos y audios en R2.
  - `modulos/publico.js` (formulario, estado, reprogramar) · `modulos/auth.js` (Google, puerta, perfiles, clave, huella, accesos) · `modulos/citas.js` (panel, búsqueda paginada, configuración, citas) · `modulos/clientes.js` (ficha de cliente, cursor, búsqueda sin acentos) · `modulos/config.js` (links, fotos, exportar/importar) · `modulos/dni.js` · `modulos/seguridad.js` (límites, Turnstile, ficha) · `modulos/monitoreo.js` · `modulos/respaldos.js`.
  - `vista-previa.js` (tarjetas de WhatsApp) · `webauthn.js` (huella sin librerías).
  - Cada módulo exporta `rutasX(c)`: devuelve una respuesta si la ruta es suya, o nada para que siga el siguiente.
- **Cambiar la base de datos:** agregar una versión nueva al final de `MIGRACIONES` en `worker/datos.js` (nunca editar una ya publicada). Se aplica sola al arrancar y queda en la tabla `_migraciones`.
- `wrangler.jsonc` — bindings: D1 `DB`, R2 `FOTOS`, límites `RL_PUB`/`RL_DNI`/`RL_RES`, cron cada 5 min. `keep_vars: true`.
- `_headers` — CSP y encabezados de seguridad de los archivos estáticos.
- `CLOUDFLARE.md` — manual de despliegue y de cada función (para el dueño). Los `.md` no se publican (`.assetsignore`).
- `test/` — pruebas de punta a punta. `test/correr.mjs` levanta un `wrangler dev` limpio por suite con sus variables y datos.

## Flujo del negocio (lo que el código debe respetar)
- **Cita:** `por_validar` (espera Yape, con `expira`) → `confirmada` → `en_silla` → `atendida`; o `no_vino`, `cancelada`, `expirada`. Índice único `ux_citas_turno` impide dos citas activas del mismo barbero a la misma hora.
- **Turnos de 60 min** entre apertura y cierre, sin el refrigerio (`slotsDia`). Días y bloqueos por barbero (`trabaja`).
- **Adelanto por Yape:** el cliente sube la captura; el dueño o quien tenga permiso `yape` valida.
- **Política:** el cliente puede reprogramar solo si faltan ≥ `horasReprog` (24 h) y no pasó `maxReprog`; el servidor lo vuelve a comprobar.
- **Entrada al panel:** Google abre la «puerta» del dispositivo (`brb_g`), luego se elige perfil: dueño con clave (arranque 1111) y barberos/personal con clave o huella. Permisos por rol (`permisos()`), siempre validados en el Worker.
- **Datos personales** (DNI, celular): el barbero sin permiso `verTel` los ve ocultos; DNI se consulta a RENIEC vía Shalom solo desde el Worker, devolviendo solo el nombre.

## Seguridad que no se debe romper
- Toda decisión (horarios, precios, permisos, Turnstile, 24 h) se toma en el Worker; el navegador solo muestra.
- Sesiones en D1 (cookie `brb_s` HttpOnly/Secure/SameSite=Lax), revalidadas en cada petición. POST/PUT/PATCH/DELETE exigen mismo origen.
- DNI público: límite `RL_DNI` (10/min/IP) + ficha firmada `X-Ficha` (Turnstile) + tope diario (`dniTopeDia`). Caché 30 días en `dnis`.
- Fotos `f_*` públicas solo si están en la configuración; respaldos en R2 `respaldos/` solo con sesión.
- Consultas SQL siempre con `?` (bind). Escapar todo texto en HTML con `esc()`.

## Datos de la barbería
- **Ficha de cliente** (tabla `clientes`, clave = últimos 9 dígitos del celular; columna generada `citas.tel` indexada). Se recalcula sola en cada alta/edición/borrado de cita (`actualizarCliente`), con SQL por conjuntos (pocas consultas). `notas` y `prefs` las escribe la barbería y nunca se pisan. `POST /api/clientes/rehacer` la reconstruye entera.
- **Paginación por cursor** (keyset) en `/api/citas/buscar` (sin texto) y `/api/clientes`: `siguiente` → `cursor`. Con texto, la búsqueda de citas usa páginas de 30.
- **Búsqueda sin acentos**: `nombre_n` y `buscar` guardan el texto sin tildes (se calcula en JS con `sinAcentos`).

## Rendimiento
- `GET /api/panel` trae solo la ventana de citas (35 días atrás, 120 adelante, más Yape pendientes). Lo demás: `GET /api/citas/buscar` (filtros y páginas en D1). Clientes usa la ficha del servidor; el Dashboard pide solo el periodo elegido (`traerRango`) más retención y «por recuperar» desde `clientes`; solo el Excel de citas baja toda la historia.

## Comandos
```bash
npm test                      # todas las suites (≈3 min), cada una con servidor limpio
npm test -- dni acceso        # solo las que contengan esos nombres
npx wrangler dev              # servidor local en http://localhost:8787
npx wrangler deploy --dry-run # validar configuración sin desplegar
```
Las pruebas de pantalla usan Playwright; si no está en el proyecto, definir `PW_PATH` con la ruta a un Playwright instalado.
