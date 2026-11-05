# Top Tier HR – Recruiting Bot (Florence, KY)

Bot de SMS que filtra candidatos automáticamente las 24 horas, guarda a los que califican y te avisa al celular. También incluye herramientas para outreach por email y un plan diario para los grupos de Facebook.

```
recruiting_bot/
├── app.py                 Webhook de Twilio: recibe cada SMS y responde (Flask)
├── bot.py                 La conversación de filtro (3 preguntas + nombre/email)
├── interpreter.py         Claude interpreta las respuestas (inglés/español); respaldo con palabras clave
├── messages.py            TODOS los textos del bot, en inglés y español (edita aquí)
├── db.py                  Base de datos: SQLite (por defecto) o Supabase
├── sms_sender.py          Envío de SMS por Twilio y alertas para Gary
├── followup.py            Seguimiento a quienes dejaron de contestar
├── run_cron.py            Lo que corre cada 6 horas (seguimientos + resumen para Gary)
├── export_leads.py        Exporta calificados a CSV (para tu página o SignNow Bulk Invite)
├── sourcing/build_email_outreach.py   Lista de EMAIL (no SMS) para Smartlead, con opt-out
├── posting/facebook_plan.py           Plan diario de grupos de Facebook (manual, sin bots)
├── sql/sms_leads.sql      Tablas para Supabase (si usas Supabase)
├── tests/test_bot.py      Pruebas sin internet
├── .env.example           Plantilla de llaves y configuración
└── requirements.txt
```

## Cómo funciona la conversación

1. El candidato escribe al número del bot (por ejemplo, "JOBS").
2. El bot saluda y hace 3 preguntas: levantar hasta 30 lb (con o sin adaptaciones razonables), cómo llegar a Florence y si puede empezar esta semana.
3. Si responde "sí" a las 3, le pide nombre y email (si no los mandó ya). Lo guarda como **qualified** y:
   - le manda tu `APPLY_LINK` si lo configuraste, o le dice que le enviarás la aplicación por email;
   - **te manda un SMS de alerta** con su nombre, teléfono y email para que envíes el paquete de SignNow.
4. Si responde "no", recibe un mensaje amable, queda guardado como **not_now** para futuras vacantes y no se le vuelve a escribir.
5. Si escribe **STOP**, queda dado de baja y no recibe nada más.
6. Si pide hablar con una persona, te llega una alerta.

Claude entiende respuestas como "sí tengo carro", "yeah but I start Monday" o errores de escritura. Si falta la llave de Claude o la API falla, el bot usa reglas de palabras clave y sigue funcionando.

---

## Paso 1. El número de teléfono (léelo antes de empezar)

Twilio **no puede leer los SMS de tu celular personal** (614) 732-3986. Tienes dos caminos:

| Opción | Qué pasa | Recomendación |
|---|---|---|
| **A. Número nuevo de Twilio** (código 859, del norte de Kentucky) | El bot contesta en ese número; tu (614) queda personal | ✅ **Recomendada.** Pon el número nuevo en los anuncios nuevos |
| B. Portar tu (614) a Twilio | Tu celular deja de recibir mensajes normales en ese número | ❌ No recomendada |

**Registro A2P 10DLC (obligatorio en EE. UU.):** para enviar SMS desde un número de Twilio a celulares de EE. UU. tienes que registrar la marca y la campaña. Se hace en Twilio Console → Messaging → Regulatory Compliance. Puede tardar **varios días**. Pídele a Top Tier HR los datos legales de la empresa (nombre legal, EIN, dirección). Mientras se aprueba, usa **WhatsApp Business** con su respuesta automática, que funciona hoy mismo.

## Paso 2. Instalar (en tu computadora, para probar)

```bash
cd automation/recruiting_bot
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # luego abre .env y llénalo
python -m unittest discover -s tests -v   # deben pasar las 7 pruebas
```

## Paso 3. Llenar el archivo `.env`

Abre `.env` con un editor de texto. **Nunca subas este archivo a GitHub ni pegues las llaves en un chat.** El `.gitignore` ya lo excluye.

| Variable | Dónde la consigues |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio Console, en la página principal |
| `TWILIO_FROM_NUMBER` | El número que compraste en Twilio, formato `+1859...` |
| `PUBLIC_BASE_URL` | La dirección de tu servidor (Paso 5) |
| `GARY_NOTIFY_PHONE` | Tu celular para recibir alertas, por ejemplo `+16147323986` |
| `APPLY_LINK` | Opcional: link de firma del grupo de SignNow, si la agencia lo permite |
| `DB_BACKEND` | `sqlite` (simple) o `supabase` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API. Solo si usas Supabase |
| `AGENCY_MAILING_ADDRESS` | La dirección postal real de la agencia (obligatoria para enviar emails) |

Si usas Supabase, ejecuta una vez `sql/sms_leads.sql` en Supabase → SQL Editor.

## Paso 4. Probar sin enviar nada

En `.env` pon `DRY_RUN=1` y deja `TWILIO_AUTH_TOKEN` vacío. Luego:

```bash
python app.py
# en otra terminal, simula a un candidato:
curl -X POST localhost:5000/sms -d "From=+18595550100" -d "Body=JOBS"
curl -X POST localhost:5000/sms -d "From=+18595550100" -d "Body=yes"
```

## Paso 5. Ponerlo en internet (Render.com, unos 15 minutos)

1. Sube el repositorio a GitHub (ya está en la rama `feature/recruiting-module`).
2. En **render.com** → New → **Web Service** → conecta el repo y elige **Root Directory** `automation/recruiting_bot`.
3. Build command: `pip install -r requirements.txt`. Start command: `gunicorn -w 1 -b 0.0.0.0:$PORT app:app`.
4. En **Environment**, agrega las mismas variables de tu `.env`, con `DRY_RUN=0`.
5. Con SQLite, los datos se borran en cada despliegue del plan gratis. **En producción usa `DB_BACKEND=supabase`.**
6. En Twilio Console → Phone Numbers → tu número → **Messaging** → "A message comes in": Webhook `https://TU-APP.onrender.com/sms`, método **POST**.
7. Pon esa misma URL base en `PUBLIC_BASE_URL`. El bot rechaza cualquier petición que no venga firmada por Twilio.

## Paso 6. El cron cada 6 horas

En un servidor Linux o Mac:
```bash
crontab -e
0 */6 * * *  cd /ruta/a/recruiting_bot && ./venv/bin/python run_cron.py >> data/cron.log 2>&1
```
En Render, crea un **Cron Job** con el comando `python run_cron.py` y el horario `0 */6 * * *`.

Qué hace en cada corrida:
- Manda un recordatorio a quien empezó el filtro y dejó de contestar, como **máximo 2 veces** y **solo entre 9 AM y 8 PM** hora del este.
- Te manda un resumen por SMS (cuántos calificados, en proceso, dados de baja).

## Herramientas extra

**Exportar calificados:** `python export_leads.py` → `data/qualified_leads.csv`. Tiene las columnas email, first_name, last_name y phone, listas para SignNow Bulk Invite.

**Email outreach (Prospeo, Crustdata o cualquier export):**
```bash
python sourcing/build_email_outreach.py contactos.csv
```
Filtra por puesto (warehouse, picker, packer…), por ciudades a unas 30 millas de Florence y quita duplicados y bajas (`data/suppression.csv`). Crea `data/outreach_smartlead.csv` con el asunto y el texto, que incluyen tu dirección postal y la opción de darse de baja. Impórtalo en Smartlead y envía **máximo 50 al día**.

**Grupos de Facebook:**
```bash
python posting/facebook_plan.py
```
La primera vez crea `posting/groups.csv`. Llénalo con tus grupos (nombre, URL, notas). Cada día genera `data/facebook_plan_FECHA.csv` con 12 grupos y una de las 3 versiones del anuncio, rotando. Tú publicas a mano.

## Lo que este sistema NO hace, a propósito

- **No manda SMS masivos a números comprados o "scrapeados".** Sin consentimiento previo, eso viola la ley TCPA ($500–$1,500 de multa por mensaje). El bot solo contesta a quien te escribió primero, y los recordatorios van solo a ellos.
- **No publica en Craigslist automáticamente.** Craigslist no tiene una API pública para eso y prohíbe los bots. **Ashby** es un ATS: solo sirve si la agencia ya lo usa, y publica en su propio portal de empleos, no en Craigslist ni en Facebook.
- **No usa bots en Facebook**, porque te pueden bloquear la cuenta y la página.
- **No pide número de Seguro Social ni datos bancarios por SMS.** Eso va solo en SignNow.

## Costos aproximados (verifícalos en cada sitio)

- **Twilio:** número local de unos $1–2 al mes, más un costo por cada SMS y una tarifa de registro 10DLC.
- **Claude:** cada respuesta interpretada cuesta una fracción de centavo con `effort: low`.
- **Render:** tiene plan gratis (se duerme si no lo usas; el primer SMS puede tardar unos segundos). **Supabase:** también tiene plan gratis.
