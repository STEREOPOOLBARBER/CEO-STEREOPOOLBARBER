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
- `index.html` — panel (dueño, barberos, personal): solo HTML y estilos. Su JS está en `js/panel/` por pantalla (`base`, `agenda`, `filtros`, `escaner`, `clientes`, `calificaciones`, `promos`, `compartir`, `dashboard`, `config`, `equipo`, `voz`, `acceso`, `app`, `avisos`, `inicio`), después de `js/voz.js`, cargados en ese orden como scripts clásicos (comparten el ámbito global). Modo nube (`/api`) o local (localStorage, solo demo).
- `js/reservar.js`, `js/estado.js` — JS del formulario y de la página de estado.
- `js/voz.js` (guion de voz, frases originales, piezas de fecha y hora; lo usan las 3 páginas) · `js/escena.js` + `css/escena.css` (pantalla «Toca para entrar», narrador y reproductor de la voz grabada; reservar y estado) · `img/` (narrador y logo Stereo).
- `js/eventos.js` — **despachador de eventos** y registro `ACC` de acciones (generado a partir de los antiguos `onclick`).
- **CSP estricta: prohibido el JavaScript en línea** (`script-src 'self'`, `script-src-attr 'none'`). Nunca escribir `onclick="…"`, `onchange="…"` ni `<script>` dentro del HTML. Para un botón nuevo: `data-on-click="nombreAccion"` (también `data-on-change`, `data-on-input`, `data-on-keydown`) y, junto al código de esa pantalla, `ACC.nombreAccion = function (event) { … }` (`this` = el elemento). Los datos van en `data-p0`, `data-p1`… (`this.dataset.p0`). Si `test/csp.ui.mjs` encuentra una acción sin registrar o una violación de CSP, falla.
- `reservar.html` — formulario público de reservas (con el narrador «Tío Stereo»). `reservar.html?c=…` y `estado.html?c=…` → 301 a `/cita/CODIGO` (Worker, `worker/app.js rutaCita`).
- `estado.html` + `js/estado.js` — **app del cliente «Mi cita»**, servida en `/cita/CODIGO` (sin código: `/cita`, con «Mis citas» del aparato en `brb_misCitas`). Fondo blanco, **sin emojis** (íconos de `img/iconos.svg` con `ic()`; el globo del narrador se limpia con `sinEmojis`), colores de la marca. Manifiesto por cita `/cita/CODIGO/app.webmanifest` (`id '/cita/'`, `start_url` = su cita; no consulta la base). Su service worker (`/cita/sw.js`) solo muestra avisos, sin caché. Narrador, QR antes de la cita, confirmar, reprogramar, botón «Descargar» (`beforeinstallprompt` o pasos de iPhone); ya atendida: fotos, calificación anónima y reseña de Google. Todo link al estado usa `/cita/CODIGO` (`estadoUrl`, `reservar.js`, `whatsapp.js`).
- `worker/` — API (Cloudflare Worker), **monolito modular**:
  - `index.js` — solo entrada: seguridad común (límite público, mismo origen), migraciones, enrutador por módulos, cron.
  - `comun.js` — constantes, utilidades, hora de Lima y reglas de agenda (`slotsDia`, `trabaja`, `reglaReprog`). Sin dependencias.
  - `datos.js` — D1: **migraciones versionadas** (`MIGRACIONES`), kv, citas (insertar/guardar/expirar), fotos y audios en R2.
  - `modulos/filtros.js` — filtros y órdenes de la agenda (los usan `/citas/buscar` y `/citas/conteo`).
  - `modulos/push.js` — avisos al celular (Web Push sin librerías: VAPID ES256 + cifrado RFC 8291). Ver «Avisos al celular».
  - `modulos/promos.js` — promociones: kv `promos` (máx. 12), `GET/PUT /promos` (permiso `config`), `promosPublicas` (en `/publico`), `promoPara` (precio al reservar), `POST /publico/promos/visto` (contadores `promo:<id>:v|c`, sin avisar a los paneles).
  - `modulos/calificaciones.js` — calificación anónima (`POST /publico/cita/:c/calificar`, migración v6) y resumen del panel (`GET /calificaciones`).
  - `modulos/publico.js` (formulario, estado, reprogramar) · `modulos/auth.js` (Google, puerta, perfiles, clave, huella, accesos) · `modulos/citas.js` (panel, búsqueda paginada, configuración, citas) · `modulos/clientes.js` (ficha de cliente, cursor, búsqueda sin acentos) · `modulos/config.js` (links, fotos, exportar/importar) · `modulos/dni.js` · `modulos/seguridad.js` (límites, Turnstile, ficha) · `modulos/monitoreo.js` · `modulos/respaldos.js`.
  - `vista-previa.js` (tarjetas de WhatsApp) · `webauthn.js` (huella sin librerías).
  - `modulos/tiempo-real.js` — Durable Object `Avisos` (binding `AVISOS`, SQLite, hibernación): WebSocket `/api/tiempo-real` con los paneles. Tras cada escritura exitosa (no GET, salvo auth/ficha) el Worker llama `avisar(env)` y todos reciben `{"tipo":"cambio"}` **sin datos**; cada panel vuelve a pedir `/api/panel` con sus permisos. El panel cae a consulta cada 20 s si no hay conexión y se reconecta solo.
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
- **Equipo (una sola verdad):** kv `equipo` = lista única de personas `{id, nombre, rol, permisos, atiende, activo, email, foto, color, esp, dias, comision}` (migración v7 juntó los antiguos `barberos` + `usuarios`). `rol: 'dueno'` tiene todo; el resto, sus `permisos`. `atiende` = sale en agenda/formulario/caja; `d.barberos` se deriva (`datos()`), nunca se guarda. Solo un dueño cambia dueños y siempre queda uno activo (`validarEquipo`).
- **Entrada al panel:** Google abre la «puerta» del aparato (`brb_g`). **Dueño** (`OWNER_EMAILS`): `/auth/google` abre la puerta **y entra directo** como dueño (`duenoDe`; sesión `via:'google'`, válida mientras la puerta exista y el correo siga en `OWNER_EMAILS`) y responde `ofrecerHuella`. El correo de una persona solo abre su perfil → **SU clave o huella** (sujeto `p_<id>`). **Huella / Face ID** (passkey, sin escribir nada): `/auth/huella` ya no exige Google antes; si el aparato no estaba autorizado para esa persona, abre su puerta (90 días). Se registra con la invitación del dueño o uno mismo con `/acceso/mi-huella[/opciones]` hasta 30 min después de entrar (`HUELLA_FRESCA_SEG` solo pruebas). `test/huella.ui.mjs` usa el autenticador virtual de Chromium. No hay clave de arranque: la primera clave la crea uno mismo (`/auth/clave/crear`, si su Google abrió el aparato o si es el dueño en el aparato del dueño) o se la pone el dueño. Permisos siempre en el Worker (`permisos()`; el panel los recibe en `/panel → yo.perm`).
- **Accesos (fase 2):** la clave que pone el dueño a otro es **temporal** (`claves.temporal`, migración v8): `/auth/clave` responde `{cambiar:true}` y la persona crea la suya con `/auth/clave/cambiar` (también «🔑 Mi clave» con la sesión abierta). «¿Olvidaste tu clave?» → `/auth/clave/recuperar` con su propio Google (o el del dueño para su perfil). Dueño: `/acceso/:s/desbloquear`, `/acceso/:s/baja` (desactiva, quita correo, clave, huellas, sesiones y puertas), `/acceso/aparatos` (puertas abiertas; quitar una cierra sus sesiones: cada sesión guarda `pu` = su aparato). Aparato ajeno (no es de la persona: `comp`) → bloqueo por inactividad de `BLOQUEO_MIN` (15) en panel y Worker; `BLOQUEO_SEG` solo para pruebas.
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

## Datos personales (Ley 29733)
- `privacidad.html` + `js/privacidad.js`: aviso de privacidad armado con `cfg` (`privTitular`, `privRuc`, `privCorreo`, `retencionMeses`, `capturasDias`). El formulario exige `consentimiento: true` (el Worker rechaza sin él) y guarda `cita.consentimiento = {ts, aviso, version}`. Si el aviso cambia de fondo, subir la versión en los dos lugares.
- Derechos del cliente (solo permiso `config`): `GET /api/clientes/:tel/datos` (acceso) y `POST /api/clientes/:tel/anonimizar` con `confirmar: 'ANONIMIZAR'` (borra nombre, celular, DNI, distrito, notas, fotos y capturas en R2, links y su nombre en la bitácora; conserva fecha/servicio/monto/estado).
- Retención en el cron (`retencion()`), **apagada por defecto**: `retencionMeses` (anonimiza inactivos sin notas) y `capturasDias` (borra capturas de Yape). Caché de DNI se borra a los 30 días.
- Respaldos en R2 **cifrados** AES-256-GCM (`cifrar`/`descifrar` en `modulos/respaldos.js`; clave = secreto `RESPALDO_CLAVE` o una aleatoria en `kv.claveRespaldo`). La descarga del panel los entrega descifrados.

## WhatsApp
- **Manual (siempre disponible):** ⏰ en la agenda (citas de mañana y próximas 3 h) → abre WhatsApp con `waRecuerda` y el link de estado; guarda `cita.recordado`.
- **Automático (API oficial de Meta, `modulos/whatsapp.js`):** configuración en `kv.whatsappApi` (token y app secret **cifrados**, o secretos `WHATSAPP_TOKEN`/`WHATSAPP_APP_SECRET`). Envío solo con **plantillas** (`recordatorio_cita` 6 variables, `cita_confirmada` 5). Cron: día anterior (desde la hora elegida), 2 h antes, confirmación al validar Yape de reservas web; una vez por cita (`cita.wa.<tipo>`), tabla `wa_mensajes` (migración v3). Webhook `/api/whatsapp/webhook` (verify token + firma `X-Hub-Signature-256`): estados (entregado/leído) y respuestas «sí/voy» → `cita.asistencia`.
- **Confirmar asistencia:** `POST /api/publico/cita/:codigo/confirmar` (botón en `/cita/CODIGO`) → `cita.asistencia = {ts, via}`; en la agenda «👍 Confirmó que viene».
- Pruebas con Meta simulado: `WHATSAPP_API_URL` (`test/whatsapp.e2e.mjs`).

## Promociones
- Una promo = un **servicio con precio especial** entre `desde` y `hasta`, opcionalmente solo ciertos `dias` (0=domingo). `{id:'pr_…', titulo, texto, foto, servicioId, precio, desde, hasta, dias, activo, orden}`. Se validan en `validarPromos` (precio menor al normal, fechas, servicio existente).
- **El precio lo pone el Worker** en `reservar()` con `promoPara(d, servicio, fecha)` (la más barata que valga ese día; no en reservas con link personal). La cita guarda `promo = {id, titulo, precioNormal}`; la agenda muestra la etiqueta 🏷️.
- Cliente: fila deslizable en `/cita/CODIGO` (`promosHTML`, «Vuelve con una promo» si ya fue atendido) → «Reservar» lleva a `reservar.html?promo=ID` (servicio elegido, días marcados «Promo», precio rebajado). `js/reservar.js` repite la regla solo para mostrar (`promoEl`): **si cambias la regla, cámbiala en los dos lados**.
- Fotos de promos activas son públicas (`fotosPublicas`). Panel: ☰ → 🏷️ Promociones (`js/panel/promos.js`), con vistas, toques, citas y monto atendido.

## Avisos al celular (Web Push)
- `worker/modulos/push.js`. Claves VAPID: secreto `VAPID_PRIVADA` (JWK) o se crean solas en `kv.vapid`. Tabla `suscripciones` (migración v9): `tipo` `cita` (ref = id de cita) o `panel` (ref = id de persona, `pu` = su aparato). Solo se envía a servicios de avisos conocidos (FCM, Mozilla, Apple, Windows): nada de direcciones arbitrarias. 404/410 → se borra.
- **Equipo** (inmediato, `ctx.waitUntil`): `avisarEquipo(env, cita, 'reserva'|'yape'|'asistencia'|'reprog')` desde `publico.js` y el webhook de WhatsApp. Le llega al dueño, a quien tiene `verTodas` y al barbero de la cita (`yape`: además con permiso `yape`). Nunca celular ni DNI. Aparato quitado o baja → se borran sus suscripciones; al cerrar sesión el panel las apaga (`pushQuitarAparato`).
- **Cliente** (cron `pushAuto`): compara la cita con `suscripciones.estado` y manda un aviso por vuelta: `confirmada`, `cambio`, `horas2` (≤ 2 h), `dia` (día anterior desde `PUSH_HORA_DIA`, 18:00), `calificar`. Si el propio cliente reprograma, `pushBaseCita` evita avisarle su propio cambio. Se borran 7 días después de la cita o si se anonimiza.
- Navegador: `sw.js` (panel) y `sw-cita.js` (servido en `/cita/sw.js`, alcance `/cita/`, sin caché) tienen el mismo bloque `push`/`notificationclick` (abre solo direcciones propias). Permiso solo al tocar «Activar». iPhone: solo con la app instalada.
- Pruebas: servicio simulado en 127.0.0.1:8795 con `PUSH_PERMITIR_LOCAL=true` (solo con `ALLOW_PIN`); `test/push.e2e.mjs` descifra cada aviso y verifica la firma.

## Reporte semanal de caja
- `modulos/reportes.js`: semana lunes–domingo (Lima). Cron: los lunes desde las 8 a. m. guarda el de la semana anterior en `reportes` (migración v4) y avisa en la 🔔 (`/api/alertas` con `accion: 'reporte'`). Montos con la misma regla que la Caja (`ingreso()`), comisiones si `modComision`, comparación con la semana previa. Solo `verMontos` + `verTodas`. `GET /api/reportes/:fecha` (en curso = al momento, sin guardar), `POST …/rehacer` (config).
- Panel: 📊 en el menú, en la Caja y en la 🔔; WhatsApp (resumen de texto) y Excel (4 hojas).

## Narrador y voz
- **Solo voz grabada** (nunca `speechSynthesis`): sin grabación, solo el globo. El panel convierte todo a **WAV** (`aWav` en `js/panel/voz.js`) y el Worker solo acepta WAV (`leerAudio`).
- `js/voz.js`: `GUION` de cada momento = trozos grabados (claves `momento`, `momento_2`…) + huecos `{fecha}` / `{hora}`. Piezas: `f_hoy`, `f_manana`, `f_el`, `f_dow_0..6`, `f_d_1..31`, `f_m_1..12`, `h_HH:MM` (una por turno de `slotsDia`). `VOZ.claves(momento,{fecha,hora,hoy})` da el orden. Si cambias el guion, cuida la compatibilidad de las claves ya grabadas.
- `js/escena.js`: el primer toque («Toca para entrar») desbloquea Web Audio (y `navigator.audioSession.type='playback'` en iPhone) y encadena las piezas; sin Web Audio usa un `<audio>`. `Escena.estado()` sirve para pruebas.

## Después del corte (/cita/CODIGO)
- QR con `/cita/CODIGO` mientras la cita está por validar o confirmada; el 📷 del panel (`js/panel/escaner.js`: BarcodeDetector o `vendor/jsqr.min.js` con SRI) abre la cita (`codigoDeQR` entiende `/cita/X`, `?c=X` y el código solo).
- Atendida: fotos por `GET /publico/cita/:c/foto/(antes|despues)`; calificación anónima (sin nombre/celular/código, solo el mes; huella aparte en `calif_hechas`; 7 días; una vez); el panel la muestra por barbero con 3 o más. Reseña (`cfg.resenaUrl`) **a todos** (Google prohíbe pedirla solo a los contentos).

## Filtros de la agenda
- Una sola vista `S.vista` (`js/panel/filtros.js`): periodo (`dia` | `mes` | `rango`), etiqueta, texto, filtros (`barb`, `serv`, `pago`, `origen`, `cli`, `wa` y los propios de una etiqueta: `captura`, `foto`, `tipo`) y `orden`. `VISTA_DEF()` es lo predeterminado y «Limpiar» vuelve a eso.
- El día elegido se filtra en el navegador (`filtroLocal`); el mes, el rango, el texto y el filtro de cliente van al servidor (`paramsVista` → `worker/modulos/filtros.js`). **Si se cambia una regla, cambiarla en los dos lados**: `test/filtros.ui.mjs` compara navegador y servidor.
- `/citas/buscar` pagina por cursor con cualquier orden (la clave del orden + id); `/citas/conteo` da `{estados, porValidar}` («Yape por validar» cuenta todos los días). Pago y monto solo con `verMontos`; cliente solo con `dash`.

## App instalable (PWA) y tamaño de app
- **Panel = app instalable:** `manifest.webmanifest` (íconos en `img/app/`, hechos del logo), `sw.js` (plantilla) servido por el Worker (`worker/app.js`) con `__VERSION__` = id del despliegue (binding `CF_VERSION` = `version_metadata`). Caché por versión con la «cáscara» que lee del propio `index.html` (no hay lista a mano); **`/api/` nunca se guarda**; navegación del panel = copia de su versión (HTML y JS siempre de la misma versión). Versión nueva → espera → aviso «Hay una versión nueva» (`js/panel/app.js`) o se aplica sola al pasar a segundo plano sin cambios sin guardar. Interruptor de emergencia: variable `SW_APAGADO=true` (entrega un SW que se borra). En pruebas `/sw.js?v=` simula un despliegue.
- **Tamaño:** una columna de **480 px** centrada en celular, laptop y PC (como la app de Total Tools): `body{max-width:var(--col)}`; los elementos fijos (hojas, barra de guardar, avisos, campana) se alinean a la columna con `--lado`. Botones nunca tapados: `env(safe-area-inset-*)`, `dvh`, `interactive-widget=resizes-content`, inputs de 16 px en iPhone.

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
