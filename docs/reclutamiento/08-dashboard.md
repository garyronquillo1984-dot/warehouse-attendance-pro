# 8. Dashboard de reclutamiento — definiciones

*Recruiting → Dashboard.* Filtros: **período** (hoy, 7, 30, 90 días o personalizado), **fuente**, **turno**, **puesto**, **etapa actual**.
Cada cifra sale de registros guardados. Si la base está vacía, el panel lo dice y ofrece cargar **datos de ejemplo identificados** (nombres “Sample …”, teléfonos ficticios 555-01xx, correos example.com) con un aviso permanente y un botón para eliminarlos.

| Indicador | Definición exacta |
|---|---|
| Total de candidatos | Candidatos en la base (con los filtros) |
| Nuevos registros del día | Registrados hoy (zona horaria de la empresa) |
| Registrados (período) | Registrados dentro del período: es la **cohorte** del embudo |
| Contactados / Interesados / Preseleccionados / Completaron el proceso / Incorporaciones confirmadas | De la cohorte, cuántos **llegaron alguna vez** a: Contactado / Interesado / Preselección / Aprobado / Primer día confirmado (cerrar a alguien no borra hasta dónde llegó) |
| Entrevistas en el período / próximas | Citas con fecha en el período / desde hoy |
| Autorizados para trabajar ahora | Hoy en: Aprobado, Disponible, Asignado o Primer día confirmado |
| Asistencia al primer día | De las personas con primer día en el período (ya pasado), cuántas tienen asistencia registrada dentro de 3 días o avanzaron a “Se presentó” |
| Retención 7 / 30 / 60 días | Solo contrataciones **vinculadas al roster**. Elegibles: primera asistencia hace ≥ N días. Retenidos: último día trabajado ≥ primer día + N (tolerancia 3 días) o siguen activos con asistencia en la última semana. Sin elegibles: “aún sin datos suficientes” |
| Candidatos por fuente / conversión | Por fuente: registrados → contactados → preseleccionados → aprobados → **iniciaron**; conversión = iniciaron ÷ registrados |
| Costo por candidato / por inicio | Solo si la fuente tiene **gasto mensual real**; gasto prorrateado al período ÷ registrados (o ÷ inicios). Si no hay gasto, “—” |
| Tiempo promedio de cobertura | Vacantes cubiertas en el período: fecha cubierta − fecha de apertura |
| Personas contactadas hoy | Personas distintas con llamada/mensaje/correo/visita registrados hoy (meta configurable) |
| Tareas de hoy / seguimientos vencidos | Tareas abiertas con fecha hoy / anterior a hoy |
| Sin contacto N+ días | Candidatos abiertos (antes de “Se presentó”) cuyo último contacto (o registro) tiene N+ días |
| Alerta de pocos candidatos | Vacante **autorizada** cuyo grupo listo (preseleccionados o autorizados, sin empleo, sin retención por otra agencia, de esa vacante o de ese puesto) es menor que el umbral o que los puestos que faltan |

## Exportación
Owner/Admin: CSV, Excel y PDF. Cada exportación queda registrada en la auditoría; si el registro falla, **no se genera el archivo**. Si hay datos de ejemplo cargados, el archivo lo indica.
