#!/usr/bin/env python3
"""استيراد حزمة نقل اوس إلى مشروع Supabase جديد: مهاجرات 1–3 ← إصلاح المنح ← البيانات ← عدّ تحقق.
الاستخدام: import_to_new_project.py <new_project_ref> <data.sql>
ملحوظة: ملف البيانات الكبير بيتبعت على دفعات (كل دفعة = كتلة INSERTs) لأن واجهة الاستعلام ليها حد حجم."""
import importlib.util
import sys

NEW_REF = sys.argv[1]
DATA_SQL = sys.argv[2]
BASE = "/home/hatch/workspace/pgos-site"

spec = importlib.util.spec_from_file_location(
    "sapi", "/home/hatch/workspace/custom-connectors/custom.supabase/bin/supabase_api.py")
sapi = importlib.util.module_from_spec(spec)
sys.argv = ["supabase_api.py"]
try:
    spec.loader.exec_module(sapi)
except SystemExit:
    pass


def q(sql):
    return sapi.call("POST", f"/v1/projects/{NEW_REF}/database/query", {"query": sql})


MIGRATIONS = ["20261123000001_initial_schema.sql",
              "20261123000002_rls_security_policies.sql",
              "20261123000003_decisions_releases_and_checklist.sql",
              "20261125000004_m2_core_org_office_notifications.sql",
              "20261125000005_m2_rest_devices_sprints_production.sql",
              "20261125000006_g1_owner_bound_rls.sql",
              "20261127000007_notifications_time_entries.sql",
              "20261128000008_environments_registry.sql",
              "20261128000009_environments_accounts.sql",
              "20261128000010_project_lifecycle.sql",
              "20261128000011_project_health.sql",
              "20261128000012_testing_unit.sql",
              "20261128000013_testers.sql"]

for mig in MIGRATIONS:
    with open(f"{BASE}/supabase/migrations/{mig}") as f:
        q(f.read())
    print("migration applied:", mig)

# إصلاح M1a على الجداول الستة الأصلية بس (مهاجرات M2 منحها سليمة أصلًا):
# authenticated يبقى SELECT-only (المهاجرات 1–3 بتسيب المنح الافتراضية الزائدة)
for t in ["pgos_projects", "pgos_issues", "pgos_hq_decisions", "pgos_releases",
          "pgos_checklist_items", "pgos_sync_runs"]:
    q(f"REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.{t} FROM authenticated;")
print("grants fix applied (authenticated = SELECT-only)")

# البيانات على دفعات: كل سطر INSERT مستقل؛ نجمع لحد ~400KB وتبعت
with open(DATA_SQL) as f:
    content = f.read()
stmts = [s for s in content.splitlines() if s.startswith("INSERT INTO")]
batch, size, sent = [], 0, 0
for s in stmts:
    batch.append(s)
    size += len(s)
    if size > 400_000:
        q("\n".join(batch))
        sent += len(batch)
        batch, size = [], 0
if batch:
    q("\n".join(batch))
    sent += len(batch)
print("data statements applied:", sent)

rows = q("SELECT (SELECT COUNT(*) FROM pgos_projects) AS projects, (SELECT COUNT(*) FROM pgos_issues) AS issues, "
         "(SELECT COUNT(*) FROM pgos_hq_decisions) AS decisions, (SELECT COUNT(*) FROM pgos_releases) AS releases, "
         "(SELECT COUNT(*) FROM pgos_checklist_items) AS checklist, (SELECT COUNT(*) FROM pgos_sync_runs) AS sync_runs")
print("NEW PROJECT COUNTS:", rows)
print("IMPORT DONE")
