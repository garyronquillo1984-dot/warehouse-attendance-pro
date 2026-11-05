"""Daily manual-posting plan for Facebook groups (no browser automation = no ban risk).

1. List your groups in posting/groups.csv  (columns: group_name,url,notes)
2. python posting/facebook_plan.py          -> data/facebook_plan_YYYY-MM-DD.csv
Each day it rotates 3 ad versions so no group sees the same text twice in a row,
and caps the day at MAX_GROUPS_PER_DAY.
"""
import csv
import os
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_GROUPS_PER_DAY = 12

ADS = [
    """HIRING NOW - START THIS WEEK
Warehouse Packing - Florence, KY | $17/hr | Full-time | Day shift
Option 1: Tue-Sat 7:00 AM-3:30 PM (Sun & Mon off)
Option 2: 4 days x 10 hrs, 7:00 AM-5:30 PM - 3 DAYS OFF every week!
Must lift up to 30 lbs.
Text your name & email to Gary: (614) 732-3986
Hablamos español.""",
    """Want 3 days off every week?
Work 4 days x 10 hrs (7:00 AM-5:30 PM) packing orders at a warehouse in Florence, KY. $17/hr, full-time.
Prefer 5 days? Tue-Sat 7:00 AM-3:30 PM.
Text "JOBS" + your name & email to (614) 732-3986.
¿Buscas trabajo? Escríbenos, hablamos español.""",
    """ESTAMOS CONTRATANDO - Florence, KY
Empaque en almacén | $17/hr | Tiempo completo | Turno de día
- Martes a sábado 7:00-3:30 (libre domingo y lunes)
- 4 días de 10 horas (7:00-5:30) con 3 días libres
Debes poder levantar hasta 30 lb.
Envía tu nombre y correo a Gary: (614) 732-3986
We speak English too!""",
]


def main(groups_path=os.path.join(HERE, "groups.csv"), out_dir="data"):
    if not os.path.exists(groups_path):
        with open(groups_path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["group_name", "url", "notes"])
        raise SystemExit(f"Created {groups_path}. Add one row per Facebook group, then run again.")
    with open(groups_path, newline="", encoding="utf-8") as f:
        groups = [g for g in csv.DictReader(f) if g.get("url")]
    if not groups:
        raise SystemExit(f"{groups_path} has no groups yet.")
    day = date.today().toordinal()
    start = (day * MAX_GROUPS_PER_DAY) % len(groups)
    todays = [groups[(start + i) % len(groups)] for i in range(min(MAX_GROUPS_PER_DAY, len(groups)))]
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"facebook_plan_{date.today().isoformat()}.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["order", "group_name", "url", "ad_version", "text", "notes", "posted (Y/N)"])
        for i, g in enumerate(todays, 1):
            v = (day + i) % len(ADS)
            w.writerow([i, g["group_name"], g["url"], v + 1, ADS[v], g.get("notes", ""), ""])
    print(f"{len(todays)} groups for today -> {out}. Wait 2-3 minutes between posts and read each group's rules.")


if __name__ == "__main__":
    main()
