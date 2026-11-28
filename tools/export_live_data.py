#!/usr/bin/env python3
"""تصدير كامل لبيانات جداول pgos_ الحية من مشروع Supabase إلى ملف SQL (INSERTs).
الاستخدام: export_live_data.py <project_ref> <out.sql>
يُعاد تشغيله لحظة النقل الفعلي عشان التصدير يبقى طازج. يطبع عدّادات فقط."""
import importlib.util
import json
import sys

REF = sys.argv[1]
OUT = sys.argv[2]

spec = importlib.util.spec_from_file_location(
    "sapi", "/home/hatch/workspace/custom-connectors/custom.supabase/bin/supabase_api.py")
sapi = importlib.util.module_from_spec(spec)
sys.argv = ["supabase_api.py"]
try:
    spec.loader.exec_module(sapi)
except SystemExit:
    pass

JSONB = {"pgos_projects": {"metadata"}, "pgos_issues": {"labels", "raw_data"},
         "pgos_releases": {"metadata"}, "pgos_checklist_items": {"project_statuses", "raw_data"},
         "pgos_sync_runs": {"diff_summary"}, "pgos_employees": {"tools"},
         "pgos_org_departments": {"projects"}, "pgos_sprints": {"points", "projects"},
         "pgos_records": {"metadata"}, "pgos_ledger": {"entry"},
         "pgos_issue_events": {"before_state", "after_state"}, "pgos_settings": {"value"}}
# ترتيب آمن للعلاقات (الآباء قبل الأبناء)
TABLES = ["pgos_projects", "pgos_issues", "pgos_hq_decisions", "pgos_releases",
          "pgos_checklist_items", "pgos_sync_runs", "pgos_departments", "pgos_office_rooms",
          "pgos_employees", "pgos_org_departments", "pgos_org_employees",
          "pgos_notification_types", "pgos_notification_prefs",
          "pgos_notifications", "pgos_notification_reads", "pgos_devices",
          "pgos_sprints", "pgos_sprint_items", "pgos_production_registry",
          "pgos_guard_alerts", "pgos_records", "pgos_ledger", "pgos_issue_events",
          "pgos_time_entries", "pgos_settings", "pgos_environments",
          "pgos_lifecycle_steps", "pgos_project_lifecycle",
          "pgos_project_health",
          "pgos_test_cases", "pgos_test_runs", "pgos_test_results", "pgos_defects", "pgos_testers"]
PAGE = 100


def lit(table, col, v):
    if v is None:
        return "NULL"
    if col in JSONB.get(table, set()):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def q(sql):
    return sapi.call("POST", f"/v1/projects/{REF}/database/query", {"query": sql})


lines = ["-- تصدير بيانات pgos_ الحية — يتولد من export_live_data.py ولا يتحرر يدويًا",
         "BEGIN;"]
for t in TABLES:
    total = 0
    offset = 0
    cols = None
    while True:
        rows = q(f"SELECT * FROM {t} ORDER BY 1 LIMIT {PAGE} OFFSET {offset}")
        if not rows:
            break
        if cols is None:
            cols = list(rows[0].keys())
        for r in rows:
            cells = ", ".join(lit(t, c, r[c]) for c in cols)
            lines.append(f"INSERT INTO {t} ({', '.join(cols)}) VALUES ({cells}) "
                         f"ON CONFLICT DO NOTHING;")
            total += 1
        offset += PAGE
    print(f"{t}: {total}")
lines.append("COMMIT;")
with open(OUT, "w") as f:
    f.write("\n".join(lines) + "\n")
print("EXPORT DONE ->", OUT)
