# Sistema de reclutamiento — Winit Kentucky (Florence, KY)

Paquete de trabajo del Onsite Representative en el warehouse de Win.It America Inc.
(7050 New Buffington Rd., Florence, KY 41042). Tiene dos partes:

1. **Aplicación web** (módulo **Recruiting** dentro de Warehouse Attendance Pro), bilingüe EN/ES, con base de datos protegida.
2. **Documentos** (esta carpeta), en el orden que pediste.

| # | Entregable | Archivo | Dónde vive en la app |
|---|---|---|---|
| 1 | Plan ejecutivo de reclutamiento | [01-plan-ejecutivo.md](01-plan-ejecutivo.md) | — |
| 2 | Mapa de fuentes y contactos verificados | [02-mapa-de-fuentes.md](02-mapa-de-fuentes.md) | Recruiting → Sources & QR |
| 3 | Calendario de 90 días | [03-calendario-90-dias.md](03-calendario-90-dias.md) | Recruiting → Calendar → “Load suggested 90-day plan” |
| 4 | Plantillas de anuncios EN/ES | [04-anuncios-en-es.md](04-anuncios-en-es.md) | Recruiting → Messages |
| 5 | Formulario de registro | [05-formulario-de-registro.md](05-formulario-de-registro.md) | Enlace público `/apply/<código>` + QR |
| 6 | Diseño de la base de datos | [06-base-de-datos.md](06-base-de-datos.md) | `supabase/migrations/20261026*` |
| 7 | Pipeline de selección y contratación | [07-pipeline.md](07-pipeline.md) | Recruiting → Pipeline |
| 8 | Dashboard interactivo | [08-dashboard.md](08-dashboard.md) | Recruiting → Dashboard |
| 9 | Plantillas de mensajes y seguimiento | [09-mensajes-y-seguimiento.md](09-mensajes-y-seguimiento.md) | Ficha del candidato → “Prepare a message” |
| 10 | Reporte diario y semanal | [10-reportes.md](10-reportes.md) | Recruiting → Reports |
| 11 | Protocolo de coordinación entre agencias | [11-protocolo-agencias.md](11-protocolo-agencias.md) | Recruiting → Agencies |
| 12 | Manual de uso, arquitectura y plan de 30 días | [12-manual-e-implementacion.md](12-manual-e-implementacion.md) | — |

## Lo primero: datos que debes confirmar con tu supervisor

Nada de esto está inventado en la app ni en los textos. Hasta que lo confirmes, la app lo deja vacío o “por confirmar”.

**Cliente y vacantes**
1. Vacantes autorizadas hoy: puesto, número de personas, turno, fecha objetivo, quién las autorizó (para registrarlas en *Openings*).
2. Requisitos reales de cada puesto (lo que el cliente exige, por escrito).
3. Pago, horario, bonos, beneficios y fecha de inicio que **sí** se pueden publicar, y quién los aprueba.
4. Reglas del sitio para reclutar: ¿se puede poner un QR en la entrada o la sala de descanso? ¿se puede entrevistar en el sitio? ¿con quién del cliente coordino?
5. Una oferta de empleo vista en Internet describe el sitio de Florence como “no climatizado” y con productos de Shein, Temu y TikTok. **No está confirmado por el cliente**: pregunta qué se puede decir del ambiente de trabajo.

**Tu empleador (la agencia)**
6. Enlace de la **solicitud oficial** y pasos del proceso de contratación (entrevista, documentos, verificaciones autorizadas).
7. ¿Puedes usar el nombre y el logo de la agencia en folletos y redes? ¿Hay página de Facebook/Instagram oficial donde publicar?
8. Programa de referidos: ¿existe?, ¿quién puede referir?, ¿hay incentivo aprobado?
9. Presupuesto para anuncios pagados (Indeed patrocinado, Facebook) y quién aprueba el gasto.
10. Política de conservación de datos de candidatos (cuántos meses) y quién atiende solicitudes de eliminación (para *Settings → retention months* y *privacy contact*).
11. Reglas para mensajes de texto/WhatsApp (herramienta aprobada, horario, texto de baja “STOP”).
12. ¿Hay ATS o sistema oficial de la agencia? Esta app es el registro de trabajo diario; el sistema oficial de contratación sigue siendo el de la agencia.

**Las otras agencias**
13. Nombres de las agencias y representantes en el sitio, qué puestos/turnos cubre cada una.
14. ¿Hay reunión de coordinación existente? ¿Quién del cliente la dirige?
15. Regla del cliente si un candidato ya trabajó o está en proceso con otra agencia.

## Estado técnico (honesto)

| Componente | Estado |
|---|---|
| Base de datos, seguridad por filas, automatizaciones | Escritas como migraciones y **probadas localmente** (74 pruebas nuevas + 167 existentes, todas pasan). **Aún no aplicadas** al proyecto Supabase real. |
| Pantallas de la app | Construidas y probadas en un navegador real contra una copia local de Supabase. **Aún no desplegadas.** |
| Envío de SMS / WhatsApp / correo | **No hay integración activa.** La app prepara el mensaje y abre tu app de Mensajes/WhatsApp/correo; tú lo envías. Ver documento 12 para una integración futura (Twilio, etc.). |
| Publicación en redes / Indeed | **No automatizada.** Textos listos para copiar y publicar desde las cuentas autorizadas. |
