# 5. Formulario de registro de candidatos

## Versión digital (pública, bilingüe)
- Se crea en *Recruiting → Sources & QR → Create form*. Cada formulario tiene su enlace `https://<tu-app>/apply/<código>`, su **QR**, folleto imprimible y tarjeta de contacto.
- Funciona en cualquier teléfono, sin cuenta. Idioma EN/ES con un botón (se guarda como idioma preferido del candidato).
- Al enviar: pantalla de confirmación con **número de referencia** y aviso de que registrarse no garantiza empleo. *(La confirmación por SMS/correo no se envía sola: no hay integración de mensajería activa; ver documento 12.)*

### Campos
| Campo | Obligatorio | Por qué |
|---|---|---|
| Nombre, apellido | Sí | Identificar a la persona |
| Teléfono celular **o** correo | Uno de los dos | Contactarla |
| Ciudad, código postal | No | Distancia al sitio / duplicados |
| Turnos que puede trabajar | No | Asignación |
| Desde cuándo puede empezar | No | Disponibilidad |
| Puestos de interés | No | Asignación |
| Experiencia en almacén (opciones) | No | Requisitos del puesto |
| Equipos que sabe usar | No | Requisitos del puesto |
| Nota de experiencia laboral (300 caracteres) | No | Contexto laboral |
| **Consentimiento de contacto** | Sí | Base para contactarla |
| Consentimiento por canal: SMS, WhatsApp, correo | No | Solo se usa el canal aceptado |

**No se piden y no existen en la base de datos:** número de Seguro Social, documentos de identidad, datos bancarios, fecha de nacimiento/edad, información médica o de discapacidad, estatus migratorio, raza, religión, estado civil, fotos. El formulario advierte que no se incluyan.

### Protecciones
- Campo oculto anti-bots (honeypot): los bots reciben una respuesta normal y no se guarda nada.
- Límite de 60 registros por hora por formulario y 300 por hora por empresa.
- La misma persona dos veces en 24 h → mismo número de referencia, un solo registro.
- Opciones desconocidas se descartan; teléfono normalizado a 10 dígitos.
- Se puede **cerrar** un formulario (después de un evento) sin borrar los registros.
- Detección automática de **posibles duplicados** (mismo teléfono, correo, o nombre + código postal) en toda la empresa.

## Versión en papel (para ferias o personas sin teléfono)
Imprime esta hoja. Luego captura cada hoja en *Candidates → Add candidate* con método de consentimiento **“Paper form”** y destruye el papel según la política de la agencia.

```
PREINSCRIPCIÓN / PRE-REGISTRATION — Trabajos de almacén / Warehouse jobs — Florence, KY
Registrarse no garantiza empleo. / Registering does not guarantee a job.

Nombre / First name: ____________________   Apellido / Last name: ____________________
Teléfono / Phone: (____) ____-______        Correo / Email: _________________________
Ciudad / City: __________________           Código postal / ZIP: _______
Idioma preferido / Preferred language:  [ ] English  [ ] Español
Turnos / Shifts:  [ ] 1º día/day  [ ] 2º tarde/evening  [ ] 3º noche/night  [ ] Fin de semana/weekend  [ ] Flexible
Puede empezar / Can start on: ___/___/______
Interés / Interest: [ ] Picking [ ] Packing/Empaque [ ] Sorting/Clasificación [ ] Material handling [ ] Otro/Other
Experiencia / Experience: ______________________________________________
Equipos / Equipment: [ ] Escáner RF  [ ] Patín manual/pallet jack  [ ] Patín eléctrico  [ ] Montacargas certificado/forklift

[ ] Acepto que me contacten sobre oportunidades de empleo. / I agree to be contacted about job opportunities.
    Por / By:  [ ] Mensaje de texto/Text  [ ] WhatsApp  [ ] Correo/Email
Firma / Signature: ______________________   Fecha / Date: ___/___/______
NO escriba número de Seguro Social, identificación, datos bancarios, fecha de nacimiento ni información médica.
DO NOT write your SSN, ID numbers, bank details, date of birth or health information.
```
