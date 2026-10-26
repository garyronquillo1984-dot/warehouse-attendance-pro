# 12. Manual de uso, arquitectura y plan de implementación de 30 días

## A. Arquitectura y qué se puede hacer en cada entorno

| Necesidad | Solución elegida | Por qué |
|---|---|---|
| Base de datos persistente y protegida | **Supabase (PostgreSQL)** ya usado por Warehouse Attendance Pro, con seguridad por filas | Multiusuario real, permisos por rol en la base de datos, copias de seguridad del proveedor |
| Autenticación y roles | Supabase Auth existente (Owner, Admin, Supervisor; verificación en dos pasos disponible) | Ya probado en la app |
| Interfaz | React (la misma app), módulo *Recruiting*, inglés/español, adaptada a teléfono | Un solo lugar para reclutamiento y asistencia |
| Primer día y retención | Vinculando candidato ↔ empleado ↔ registros de asistencia | Mide asistencia **real**, no reportada |
| Formulario público + QR | Página `/apply/<código>` sin cuenta, función del servidor con límites | Captación diaria sin trabajo manual |
| Hosting | Cloudflare Workers (archivos estáticos), igual que la app actual | Ya configurado (`wrangler.jsonc`) |

**¿Por qué no Claude Artifacts para esto?** Una página de Artifact es buena para mostrar un documento o una demo, pero no es lugar para una base de candidatos: el almacenamiento del navegador vive solo en un dispositivo, se puede borrar, no tiene permisos por rol ni auditoría, y no es apropiado para datos personales de terceros. Por eso el sistema real está en Supabase con seguridad por filas.

### Dependencias externas (no activas hoy)
| Función | Depende de | Alternativa funcional incluida |
|---|---|---|
| Enviar SMS automáticamente (confirmaciones, recordatorios) | Proveedor de SMS (p. ej. Twilio), registro de remitente comercial en EE. UU. (A2P 10DLC — confirmar requisitos y costos con el proveedor), aprobación de la agencia | La app prepara el mensaje y abre la app de Mensajes con el texto; tú lo envías |
| WhatsApp automático | WhatsApp Business Platform (Meta) + plantillas aprobadas por Meta | Enlace wa.me con el mensaje listo, solo con consentimiento |
| Correo automático | Proveedor de correo transaccional + dominio verificado | Enlace mailto con el mensaje listo |
| Publicar en Facebook/Indeed | Cuentas y permisos de la agencia | Textos listos para copiar (doc. 4) |
| Recordatorios por notificación | Notificaciones push o correo | Tareas automáticas en *Tasks* y en el panel |
| Datos del ATS oficial de la agencia | API/permiso del ATS | Exportación CSV/Excel controlada |

Costos: el proyecto Supabase y Cloudflare ya existen; **confirmar el plan actual** en supabase.com/pricing y en la cuenta de Cloudflare. Los proveedores de mensajería cobran por mensaje y por registro de número: pedir cotización antes de activar.

## B. Puesta en marcha técnica (pendiente de tu aprobación)
1. Revisar y fusionar la rama `feature/recruiting-module`.
2. Aplicar a Supabase, en orden: `20261026120000_recruiting_schema.sql`, `20261026120100_recruiting_functions.sql`; y desde el **SQL Editor** `20261026120200_recruiting_retention_purge.sql` (contiene DELETE).
3. Desplegar la app (`npm run build` → Cloudflare, como siempre).
4. En la app: *Recruiting → Settings*: nombre público, contacto de privacidad, meses de conservación según la política de la agencia.
5. Crear el primer formulario y probarlo desde un teléfono.

Pruebas: `npm run test:db` (241 comprobaciones de seguridad y automatización) y `tests/e2e/run_recruiting.sh` (prueba en navegador real).

## C. Manual de uso diario (10 minutos de lectura)

**Entrar:** menú lateral → *Recruiting*. Botón **EN/ES** arriba a la derecha.

1. **Panel (Dashboard)** — empieza aquí. Arriba: registros de hoy, personas contactadas hoy, tareas de hoy, seguimientos vencidos. Alertas rojas = vacantes con pocos candidatos listos.
2. **Tareas** — trabajar de arriba abajo: *Vencidas* → *Hoy*. Marca cada una al terminar. Se crean solas cuando los candidatos avanzan.
3. **Candidatos** — buscar, filtrar, *Add candidate*. Etiquetas: *Possible duplicate*, *Agency hold*, *Sample*.
4. **Ficha del candidato**
   - *Pipeline stage*: mover de etapa (al cerrar, elegir motivo y fecha de recontacto).
   - *Log a contact*: registrar cada llamada/mensaje con resultado. “Contestó” mueve a *Contactado*.
   - *Prepare a message*: plantilla en su idioma → copiar o abrir Mensajes/WhatsApp/Email.
   - *Add to the employee roster* (Owner/Admin, cuando esté **Aprobado**): número de gafete, turno, fecha → aparece en *Attendance*; su primera asistencia lo pasa a *Se presentó*.
   - *Delete*: duplicados o solicitud de la persona.
5. **Pipeline** — vista de tablero por fases. Cambiar etapa desde la tarjeta.
6. **Vacantes (Openings)** — registrar solo vacantes autorizadas, con quién y cuándo las autorizó.
7. **Calendario** — plan de 90 días; marcar *Confirmado* solo con fuente; anotar costos y resultados.
8. **Fuentes y QR** — un formulario por canal/evento; *QR, flyer and card* para imprimir; gasto mensual real por fuente.
9. **Agencias** — protocolo, agenda semanal (copiar), registro de reuniones/solicitudes/escalamientos.
10. **Mensajes** — plantillas EN/ES (Owner/Admin edita).
11. **Reportes** — diario y semanal: copiar y enviar.
12. **Ajustes** — metas, alertas, conservación, nombres de etapas.

**Para practicar:** en el panel vacío, *Load labelled sample data* (24 candidatos ficticios “Sample …”). Quitarlos con *Remove sample data* antes de reportar.

## D. Plan de implementación de 30 días

### Semana 1 (26 oct – 1 nov): aprender y establecer la línea base
- Reunión con el contacto del cliente y con tu supervisor: responder las preguntas del documento 00.
- Presentarte con las otras agencias; registrar agencias y primera reunión en *Agencies*.
- Registrar las **vacantes autorizadas** con requisitos reales.
- Conocer el proceso oficial de la agencia (solicitud, documentos, verificaciones) y ajustar nombres de etapas en *Settings*.
- Línea base: cuántas vacantes, cuántas personas faltan, tiempo actual de cobertura, asistencia al primer día actual (si el cliente o la agencia la tienen).
- **Entregable:** respuestas confirmadas + vacantes en la app.

### Semana 2 (2 – 8 nov): poner el sistema a trabajar
- Crear formularios por canal; imprimir folletos QR para lugares autorizados.
- Publicación de Facebook EN/ES aprobada; Focus Talent si la agencia lo autoriza.
- Contacto diario a cada registro nuevo; usar las plantillas.
- **Entregable:** primeros registros con fuente; reporte diario todos los días.

### Semana 3 (9 – 15 nov): fuentes comunitarias
- Esperanza Latino Center, Gateway, Brighton Center, Life Learning Center, biblioteca, KCC Florence.
- Primera jornada de entrevistas **si se autoriza** (formulario propio del evento).
- Medir por canal: registros → contactados → preseleccionados.
- **Entregable:** contactos institucionales registrados en el calendario con resultados.

### Semana 4 (16 – 22 nov): analizar y ajustar
- Tabla de fuentes: conservar los canales con más **inicios** y mejor asistencia; ajustar o pausar los demás.
- Revisar no-shows: ¿faltó confirmación? ¿transporte? ¿turno? Ajustar la cadencia de mensajes.
- Ajustar metas en *Settings* con la línea base real.
- **Entregable:** reporte semanal + 3 recomendaciones con datos para el supervisor.

## E. Mejora continua (cada viernes)
1. ¿Qué canal trajo personas que **cumplen requisitos, responden y se presentan**?
2. ¿Dónde se pierde la gente en el embudo? (contacto, preselección, documentos, primer día)
3. Un cambio concreto para la próxima semana (texto del anuncio, horario de llamadas, canal, confirmación del primer día).
4. Si una campaña no funciona en 2 semanas con datos suficientes: cambiar mensaje o canal, no solo aumentar volumen.
