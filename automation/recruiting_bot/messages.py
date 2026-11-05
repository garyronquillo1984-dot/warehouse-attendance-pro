"""All text the bot sends, in English and Spanish. Edit wording here only.

Facts used here come from the client's orders: Packing, Florence KY, $17/hr,
day shifts (5x8 Tue-Sat 7:00-3:30, or 4x10 7:00-5:30 with 3 days off).
"""

QUESTIONS = ["lift", "transport", "start"]

TEXT = {
    "en": {
        "intro": (
            "Hi! This is Gary with Top Tier HR about the Warehouse Packing jobs in "
            "Florence, KY ($17/hr, full-time, day shift). 3 quick questions. Reply STOP to opt out."
        ),
        "lift": "1/3: Can you lift up to 30 lbs, with or without reasonable accommodation? (Yes/No)",
        "transport": "2/3: Do you have a way to get to work in Florence, KY? (Yes/No)",
        "start": "3/3: Can you start this week? (Yes/No)",
        "contact": "Great, you're a match! Please reply with your full name and email so I can send your application.",
        "contact_missing": "Thanks! I still need your {missing}. Please reply with it.",
        "qualified_link": "Thanks {name}! Start your application here: {link} . Gary will call you shortly.",
        "qualified_email": "Thanks {name}! Gary will email your application to {email} shortly and call you to confirm your start.",
        "not_now": (
            "Thanks for your interest! These openings require {reason}, so this one isn't a fit right now. "
            "We'll keep your info for future openings. Reply STOP to opt out."
        ),
        "reason_lift": "lifting up to 30 lbs",
        "reason_transport": "getting to Florence, KY",
        "reason_start": "a start this week",
        "unclear": "Sorry, I didn't catch that. Please reply Yes or No.",
        "human": "No problem, Gary will reach out to you personally soon.",
        "done": "Thanks! Gary already has your info and will be in touch. Questions? Call (614) 732-3986.",
        "nudge": "Hi, Gary from Top Tier HR following up about the Warehouse Packing job in Florence, KY ($17/hr). {question} Reply STOP to opt out.",
    },
    "es": {
        "intro": (
            "¡Hola! Soy Gary de Top Tier HR, sobre los trabajos de empaque en Florence, KY "
            "($17/hr, tiempo completo, turno de día). Son 3 preguntas rápidas. Responde STOP para no recibir más mensajes."
        ),
        "lift": "1/3: ¿Puedes levantar hasta 30 libras, con o sin adaptaciones razonables? (Sí/No)",
        "transport": "2/3: ¿Tienes cómo llegar al trabajo en Florence, KY? (Sí/No)",
        "start": "3/3: ¿Puedes empezar esta semana? (Sí/No)",
        "contact": "¡Excelente, calificas! Respóndeme con tu nombre completo y tu correo para enviarte la aplicación.",
        "contact_missing": "¡Gracias! Me falta tu {missing}. Respóndeme con ese dato.",
        "qualified_link": "¡Gracias {name}! Empieza tu aplicación aquí: {link} . Gary te llamará pronto.",
        "qualified_email": "¡Gracias {name}! Gary enviará tu aplicación a {email} en breve y te llamará para confirmar tu inicio.",
        "not_now": (
            "¡Gracias por tu interés! Estos puestos requieren {reason}, así que por ahora no aplica. "
            "Guardaremos tus datos para futuras vacantes. Responde STOP para no recibir más mensajes."
        ),
        "reason_lift": "levantar hasta 30 libras",
        "reason_transport": "poder llegar a Florence, KY",
        "reason_start": "empezar esta semana",
        "unclear": "Perdón, no entendí. Responde Sí o No, por favor.",
        "human": "Claro, Gary se comunicará contigo personalmente pronto.",
        "done": "¡Gracias! Gary ya tiene tus datos y te contactará. ¿Preguntas? Llama al (614) 732-3986.",
        "nudge": "Hola, soy Gary de Top Tier HR. Te escribo sobre el trabajo de empaque en Florence, KY ($17/hr). {question} Responde STOP para no recibir más mensajes.",
    },
}

MISSING = {
    "en": {"name": "full name", "email": "email", "both": "full name and email"},
    "es": {"name": "nombre completo", "email": "correo", "both": "nombre completo y correo"},
}


def t(lang, key, **kw):
    lang = lang if lang in TEXT else "en"
    return TEXT[lang][key].format(**kw)
