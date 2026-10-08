# Tareas escolares — Gael y Edric

Aplicación web que entra a Idukay sola cada hora, lee las tareas de Gael y Edric, las guarda con
historial y las muestra en una pantalla pensada para el teléfono de un padre:
**¿Qué tienen que hacer mis hijos hoy?**

```
Idukay ──► navegador automático en el servidor (login + lectura) ──► base de datos con historial
                         ▲ cada hora (y con “Actualizar ahora”)                    │
                                                                                   ▼
                                                     App web (Hoy · Últimas 2 semanas · Archivo)
```

## Del Artifact a esta app

| Del Artifact original | En esta app |
| --- | --- |
| Diseño, colores Gael/Edric, tipografías, detalle tipo “hoja inferior”, etiqueta 🇺🇸 EN INGLÉS | Reutilizado (`public/styles.css`, `public/app.js`) |
| Prioridades por fecha de entrega | Reutilizado como Pendiente/Próxima/Vencida/Archivo (`src/tasks.js`) |
| Historial de cambios por tarea | Reutilizado; ahora se registra solo en cada sincronización (`task_events`) |
| Datos incrustados a mano desde capturas | **Reemplazado** por lectura automática de Idukay |
| “Completada” confirmada por chat | Solo se muestra “Completada” si Idukay lo dice. Aparte, el padre puede marcar “✔ hecha en casa” (no cambia Idukay) |

Por qué el Artifact no podía hacerlo: corre dentro del navegador de quien lo abre, sin servidor
propio. Por eso no puede guardar secretos, no puede ejecutarse a una hora fija si nadie lo tiene
abierto y el navegador le impide abrir Idukay (CORS). Además, las credenciales quedarían expuestas.

## Arquitectura

Un solo servicio (contenedor Docker) con cinco piezas:

| Pieza | Tecnología | Archivo |
| --- | --- | --- |
| Frontend | HTML + JS sin framework, móvil primero | `public/` |
| Backend / API | Node.js 20+ y Express | `src/server.js` |
| Base de datos | SQLite en un disco persistente (`/data`) | `src/db.js` |
| Automatización del navegador | Playwright + Chromium headless | `src/idukay/scraper.js`, `src/idukay/extract.js` |
| Programador | `node-cron` cada hora en hora de Ecuador, o un cron externo | `src/server.js`, `POST /api/cron/sync` |

**Por qué un contenedor y no Cloudflare o Supabase (que ya usas en otro proyecto):** Chromium
necesita un proceso Linux completo con unos 500 MB de RAM. Cloudflare Workers y las Edge Functions
de Supabase no pueden ejecutarlo. Railway y Fly.io sí pueden, con un disco persistente, por unos
5 USD/mes.

### Cómo lee Idukay

1. **Login**: abre `https://idukay.net/colegios/#/login` y escribe usuario y contraseña. Busca los
   campos por tipo, nombre o placeholder, nunca por coordenadas, y confirma el resultado: login
   correcto, rechazo, CAPTCHA, código MFA o cambio de contraseña obligatorio.
2. **Sesión**: guarda las cookies en `/data`, con permisos 600 y cifradas si defines
   `SESSION_ENCRYPTION_KEY`, para no iniciar sesión cada hora. Si la sesión expiró, vuelve a
   iniciar sesión sola.
3. **Datos**: lee las tareas de dos fuentes y las combina:
   - el **JSON que la propia web de Idukay descarga** (su API interna), que no se rompe si cambia
     el diseño;
   - la **página renderizada**: tarjetas repetidas que contienen fechas, con etiquetas como
     “Entrega:” o “Asignada:”, más el detalle que se abre al tocar cada tarea.
4. Recorre **Gael y Edric** con el selector de estudiante y las pestañas **Vigentes / Anteriores**.
5. **CAPTCHA o MFA**: no intenta evadirlos. La app muestra “Se requiere volver a autenticar Idukay.”

### Reglas de las tareas

- **Sin duplicados**: cada tarea se identifica primero por su id de Idukay y, si no lo hay, por
  estudiante + materia + título + fecha de asignación. Si el profesor cambia la fecha de entrega,
  la tarea se **actualiza** y el cambio queda en su historial.
- **🔴 Pendientes**: vencen hoy o mañana, o no tienen fecha.
- **🟡 Próximas**: vencen después de mañana.
- **🟢 Completadas**: solo cuando Idukay dice entregada, completada o calificada.
- **📁 Archivo**: cuando pasa la fecha de entrega. Nunca se borran. Su estado es *Vencida*, o
  *Completada* si Idukay lo indicó.
- **📅 Últimas 2 semanas**: tareas asignadas o vencidas en los últimos 14 días, agrupadas en Hoy,
  Ayer, Hace N días…
- Si una tarea desaparece de Idukay, se conserva y se marca “ya no aparece en Idukay”.

### Seguridad

- Las credenciales de Idukay solo existen como variables de entorno del servidor. Nunca llegan al
  navegador del usuario, al repositorio, a los logs ni a los mensajes de error.
- Todo log pasa por `redact()`, que oculta usuario, contraseña, cookies, tokens, JWT y query strings.
- La app web pide una **contraseña familiar** (`APP_PASSWORD`, obligatoria en producción). Usa
  cookie `HttpOnly`/`SameSite`/`Secure`, limita los intentos fallidos y aplica cabeceras CSP y
  anti-iframe.
- El endpoint del cron externo exige `Authorization: Bearer $CRON_SECRET`.

## Puesta en marcha

### Paso 1 — Probar contra el Idukay real en tu computadora (recomendado, 10 minutos)

Este es el único paso que no pude hacer por ti: desde mi entorno no hay acceso de red a idukay.net.
Toda la automatización está probada contra un portal simulado (`test/mock-idukay`). Antes de
desplegar conviene confirmar que funciona con la página real:

```bash
cd idukay-tareas
npm install                 # descarga Chromium la primera vez
cp .env.example .env        # y escribe IDUKAY_USERNAME / IDUKAY_PASSWORD en .env
npm run discover            # HEADFUL=true npm run discover para ver el navegador
```

`discover` imprime las tareas que encontró para cada hijo y guarda en `discovery/` capturas,
la estructura de cada pantalla y la lista de endpoints JSON (solo nombres de campos). Si algo no
sale bien, por ejemplo “sección de tareas=false” o tareas sin materia, comparte el archivo
`discovery/api-endpoints.txt` y los `*.outline.txt`, que no contienen contraseñas. Con eso se
ajustan `IDUKAY_TASKS_PATH` o `IDUKAY_SELECTORS` sin tocar código. **No compartas las capturas
`.png` públicamente: muestran datos de tus hijos.**

Para ver la app completa en local: `npm start` y abre http://localhost:3000

### Paso 2 — Desplegar (opción recomendada: Railway)

1. Crea una cuenta en https://railway.com (plan Hobby, ~5 USD/mes).
2. **New Project → Deploy from GitHub repo** → este repositorio. En *Settings → Root Directory*
   pon `idukay-tareas`. Railway detecta el `Dockerfile`.
3. **Add Volume** al servicio, montado en `/data`. Ahí viven la base de datos y la sesión.
4. En **Variables**, añade:

   | Variable | Valor |
   | --- | --- |
   | `IDUKAY_USERNAME` | tu usuario de Idukay |
   | `IDUKAY_PASSWORD` | tu contraseña de Idukay |
   | `APP_PASSWORD` | la contraseña que usará la familia para abrir la app |
   | `SESSION_SECRET` | resultado de `openssl rand -hex 32` |
   | `SESSION_ENCRYPTION_KEY` | otro `openssl rand -hex 32` |
   | `TZ_APP` | `America/Guayaquil` |

5. **Settings → Networking → Generate Domain**. Abre la URL en el teléfono y, desde el menú del
   navegador, elige *“Añadir a pantalla de inicio”*.

El servicio queda encendido y sincroniza a las 06:00, 07:00, 08:00… sin que tu teléfono ni tu
computadora estén abiertos. También sincroniza al arrancar.

### Alternativa: Fly.io

```bash
fly launch --no-deploy --copy-config      # dentro de idukay-tareas/
fly volumes create tareas_data --size 1 --region bog
fly secrets set IDUKAY_USERNAME=... IDUKAY_PASSWORD=... APP_PASSWORD=... \
  SESSION_SECRET=$(openssl rand -hex 32) SESSION_ENCRYPTION_KEY=$(openssl rand -hex 32)
fly deploy
```

`fly.toml` ya deja la máquina siempre encendida (`auto_stop_machines = "off"`) con 1 GB de RAM.

### Hosting sin procesos permanentes (cron externo)

Si la plataforma apaga el servicio cuando no hay visitas, define `SCHEDULER=external` y
`CRON_SECRET`, y programa en un servicio como cron-job.org (gratis) o GitHub Actions una llamada
cada hora:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://TU-APP/api/cron/sync
```

Añade `?wait=1` para que la respuesta espere el resultado. Otra opción es ejecutar
`npm run sync` desde un cron del servidor.

## Uso

- **Hoy**: una tarjeta por hijo con 🔴 Pendientes, 🟡 Próximas y 🟢 Completadas (solo si Idukay
  informa ese dato). Toca una tarea para ver la descripción, las instrucciones, los archivos y su
  historial.
- **🔄 Actualizar ahora**: sincroniza en el momento, sin esperar a la siguiente hora.
- **Indicador**: “Última actualización” y “Próxima actualización”. Si algo falla:
  “⚠️ No se pudo actualizar Idukay.” con la causa (contraseña rechazada, CAPTCHA, sin conexión,
  página cambiada…).
- **Diagnóstico**: las últimas sincronizaciones con su registro, por ejemplo:

  ```
  [06:00] Inicio de sincronización (automática)
  [06:00] Sesión guardada todavía válida
  [06:01] Gael: 5 tareas encontradas
  [06:01] Edric: 4 tareas encontradas
  [06:01] Sincronización completada: 1 nuevas, 2 actualizadas, 6 sin cambios
  ```

### Qué hacer si aparece…

| Mensaje | Qué hacer |
| --- | --- |
| Idukay rechazó el usuario o la contraseña | Actualiza `IDUKAY_PASSWORD` en el hosting y reinicia el servicio |
| Se requiere volver a autenticar Idukay (CAPTCHA / código) | Entra una vez a Idukay desde tu navegador. Si Idukay sigue pidiéndolo en cada login, la automatización no podrá continuar: no se evade |
| La página de Idukay cambió | Ejecuta `npm run discover` en tu computadora y ajusta `IDUKAY_TASKS_PATH` / `IDUKAY_SELECTORS` |
| No se pudo conectar con Idukay | Normalmente es temporal; se reintenta en la siguiente hora |

## Desarrollo

```bash
npm install
npm test        # unitarias + BD + navegador real contra el portal simulado + servidor
```

Las pruebas usan `test/mock-idukay/`, un portal falso **solo para pruebas** que imita el login,
el selector de hijos, las pestañas, el detalle, CAPTCHA y MFA. La app en producción nunca lo usa.

> Uso responsable: la app solo lee tus propios datos de padre, con tu cuenta, una vez por hora.
> Revisa los términos de uso de Idukay o de tu colegio. Si Idukay ofrece una API o exportación
> oficial, sería preferible usarla.
