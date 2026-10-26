# 6. Diseño de la base de datos

PostgreSQL (Supabase), en el mismo proyecto que Warehouse Attendance Pro. Migraciones:

| Archivo | Contenido |
|---|---|
| `supabase/migrations/20261026120000_recruiting_schema.sql` | Tablas, permisos, seguridad por filas (RLS), automatizaciones (triggers), auditoría |
| `supabase/migrations/20261026120100_recruiting_functions.sql` | Funciones: valores por defecto, formulario público, contratación, resultados, exportaciones, datos de ejemplo |
| `supabase/migrations/20261026120200_recruiting_retention_purge.sql` | Borrado automático por antigüedad (diario, pg_cron). Contiene DELETE: se aplica desde el SQL Editor |

## Tablas

| Tabla | Para qué | Campos clave |
|---|---|---|
| `candidates` | Base de candidatos | id único (UUID), nombre, apellido, teléfono (10 dígitos), correo, ciudad, código postal, idioma, fuente + detalle, responsable interno, fecha de registro, experiencia, equipos, turnos, disponible desde, puestos de interés, **etapa**, motivo de cierre, fecha de recontacto, vacante, entrevista, primer día, **empleado vinculado**, último contacto, próxima acción + fecha, **consentimientos** (general, SMS, WhatsApp, correo, fecha, método), verificación de otra agencia, observaciones, posible duplicado, `is_sample` |
| `candidate_events` | Historial: llamadas, mensajes, notas, cambios de etapa | tipo, resultado, resumen, etapa de/a, autor, fecha |
| `recruitment_tasks` | Tareas y recordatorios | tipo, título, fecha, asignado a, hecha, clave automática |
| `job_openings` | Vacantes autorizadas | puesto, turno, personas, estado, **autorizada por / fecha**, pago y horario **verificados**, requisitos reales, fechas |
| `recruitment_sources` | Canales | tipo, enlace, contacto, nota de costo, **gasto mensual real**, verificada |
| `intake_forms` | Formularios públicos / QR | código aleatorio, fuente, evento, activo, contador |
| `recruitment_activities` | Calendario de 90 días | tipo, estado, fechas, lugar, responsable, organización, costos, meta, materiales, permisos, enlace de verificación, resultados |
| `partner_agencies` | Agencias del sitio | nombre, representante, contacto laboral, cobertura |
| `coordination_entries` | Registro de coordinación | tipo (reunión, solicitud del cliente, escalamiento…), resumen operativo, decisiones, seguimiento, estado |
| `message_templates` | Plantillas EN/ES | código, idioma, canal, texto |
| `recruitment_settings` | Ajustes por empresa | nombre público, contacto de privacidad, metas, alertas, meses de conservación, nombres de etapas, etapas ocultas |

Datos sensibles: **no hay columnas** para SSN, identificación, banco, fecha de nacimiento, salud, estatus migratorio ni características protegidas.

## Controles de acceso (por rol, aplicados por la base de datos)
| Rol | Candidatos | Configuración (fuentes, plantillas, calendario, agencias) | Exportar | Eliminar candidato | Contratar (vincular al roster) |
|---|---|---|---|---|---|
| Owner / Admin | Toda la empresa | Leer y editar | Sí (queda registrado) | Sí | Sí |
| Supervisor | Solo almacenes asignados (leer, crear, avanzar etapas, registrar contactos) | Solo leer | No | No | No |
| Visitante anónimo | Solo enviar el formulario público | — | — | — | — |
| Otra empresa | Nada | Nada | Nada | Nada | Nada |

Todo esto está probado en `tests/recruiting.test.mjs` (74 comprobaciones).

## Integridad y automatizaciones (triggers)
- Teléfono y correo normalizados; nombres sin espacios sobrantes.
- **Posible duplicado** marcado al crear o cambiar teléfono/correo.
- Al retirar el consentimiento general, se apagan todos los canales.
- **Historial de etapas** escrito por el servidor (no se puede falsificar desde el navegador).
- **Tareas automáticas:** primer contacto (al registrarse), preselección (al estar “Interesado”), entrevista (en la fecha de la cita), confirmar primer día (día anterior) y verificar asistencia (ese día), seguimiento a 7/30/60 días (al empezar a trabajar), recontacto (fecha elegida al cerrar). Se cierran solas cuando el candidato avanza.
- Un contacto “contestó/respondió” mueve a **Contactado** y actualiza el último contacto.
- Al **vincular** un candidato con el roster de empleados, su **primera asistencia** registrada lo mueve a **“Se presentó a trabajar”**.

## Registro de cambios (auditoría)
`audit_log`, solo lectura para Owner/Admin. Para candidatos guarda **quién cambió qué campos y la etapa, nunca los valores personales**, así un registro borrado no deja datos personales en el historial. Cada **exportación** queda registrada (quién, qué, cuántas filas).

## Conservación y eliminación
- Borrado automático diario de candidatos **sin actividad** por más de *N* meses (por defecto 12; configurable para igualar la política de la agencia). Las personas que empezaron a trabajar se conservan con el expediente del empleado.
- Eliminación individual (duplicados o solicitud de la persona): ficha del candidato → *Delete*. Borra perfil, historial y tareas.

## Copias de seguridad
Supabase hace copias diarias automáticas en planes de pago (confirmar el plan actual del proyecto). Además: exportación CSV/Excel controlada por Owner/Admin. Recomendación: una exportación mensual cifrada guardada en el almacenamiento aprobado por la agencia, **solo si la política lo permite**.
