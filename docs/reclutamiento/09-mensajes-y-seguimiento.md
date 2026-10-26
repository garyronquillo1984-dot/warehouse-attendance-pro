# 9. Plantillas de mensajes y seguimiento

Todas están cargadas en la app (*Recruiting → Messages*), en inglés y español, editables por Owner/Admin.
En la ficha del candidato, **“Prepare a message”** elige la versión en el idioma del candidato, completa `{first_name}`, tu nombre y teléfono, la vacante y el turno, y avisa si falta algún dato (`{date}`, `{place}`…). Después: **Copiar**, **Abrir en Mensajes**, **WhatsApp** o **Email** — cada botón aparece **solo si hay consentimiento para ese canal**, y al usarlo queda registrado en el historial.

**La app no envía nada sola.** Tú revisas y envías desde tu teléfono o correo de trabajo.

| Código | Cuándo | EN (resumen) | ES (resumen) |
|---|---|---|---|
| `ack_registration` | Confirmación de recepción | We received your registration… does not guarantee a job. Reply STOP | Recibimos tu registro… no garantiza empleo. Responde STOP |
| `first_contact` | Primer contacto | Thanks for your interest… 5 minutes to talk about your availability? | Gracias por tu interés… ¿5 minutos para hablar de tu disponibilidad? |
| `no_answer` | Sin respuesta (después de 1–2 intentos) | If still interested, reply with the best time… reply NO and I won’t contact you again | Si sigues interesado/a, dime la mejor hora… responde NO y no te volveré a contactar |
| `apply_cta` | Pasar a la solicitud oficial | Complete the official application: {apply_link} | Completa la solicitud oficial: {apply_link} |
| `interview_reminder` | Día anterior a la cita | Your appointment is on {date} at {time}, {place}. Reply YES | Tu cita es el {date} a las {time}, en {place}. Responde SÍ |
| `confirm_availability` | Mantener la base al día | Are you still available for {shift}? | ¿Sigues disponible para {shift}? |
| `first_day` | Día anterior al primer día | Your first day is {date} at {time}, {place}… problem getting there? call | Tu primer día es el {date}… ¿problema para llegar? llama |
| `checkin_7` | Día 7 | How is your first week going? | ¿Cómo va tu primera semana? |
| `recontact` | Fecha de recontacto | You asked us to check back… interested? | Nos pediste que te volviéramos a contactar… ¿te interesa? |
| `kept_on_file` | Vacante cubierta | Opening filled; we kept your information (with your permission) | La vacante se cubrió; guardamos tu información (con tu permiso) |
| `reply_interested` | Comentario en redes | Register here: {apply_link}… does not guarantee a job | Regístrate aquí: {apply_link}… no garantiza empleo |
| `facebook_post`, `video_script` | Publicaciones | Ver documento 4 | Ver documento 4 |

## Cadencia de seguimiento recomendada
| Día | Acción |
|---|---|
| 0 (registro) | Tarea automática de primer contacto. Llamar; si no contesta, `first_contact` por el canal autorizado |
| 1 | Segundo intento a otra hora |
| 3 | `no_answer`. Si no hay respuesta en 7 días → cerrar como “No disponible” con recontacto en 30 días (si hay consentimiento) |
| Antes de cada cita | `interview_reminder` (tarea automática ese día) |
| Día −1 del inicio | `first_day` (tarea automática) |
| Día 0 | Verificar asistencia (tarea automática). Si no se presentó: llamar ese día; cerrar como “No se presentó” si corresponde |
| Días 7, 30, 60 | Seguimiento de retención (tareas automáticas), `checkin_7` |

## Reglas
- Contactar solo a personas con consentimiento, en horario razonable (8 am–8 pm hora local, salvo política distinta).
- Respetar inmediatamente “STOP”, “NO” o “no me contacten”: retirar el consentimiento en la ficha (apaga todos los canales).
- Sin mensajes masivos. Sin promesas de contratación, pago u horario no verificados.
