#!/usr/bin/env python3
"""تغذية خطوة «سجل الاختبار في اوس» (testing_registry) في دورة الحياة من وحدة الاختبار.

أمر مالك 2026-11-28 ~12:48: حالة خطوة الاختبار في نظام دورة الحياة تتغذى من وحدة
الاختبار نفسها (pgos_test_*) — لا إدخال يدوي منفصل. يشتغل كخطوة أخيرة غير قاتلة
في دورة المزامنة (زي env_check): بيحسب لكل مشروع من جداوله الحية — كيسز مكتوبة /
منفذة / تشغيلات / آخر تشغيلة / نسبة نجاح / عيوب مفتوحة — وبيحدّث صف الخطوة.
قاعدة الحالة: done لو المشروع عنده كيسز مكتوبة وتشغيلة واحدة على الأقل مسجلة.
قناة الكتابة: Management API SQL (نفس قناة المزامنة).
"""
import os
import sys

sys.path.insert(0, os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin"))
from supabase_api import call  # noqa: E402

REF = "qkwdyqocazwhojpyifbv"

STATS_SQL = """
select p.project_ref, p.project_name,
  (select count(*) from public.pgos_test_cases c where c.project_ref = p.project_ref and c.case_state = 'written') as written,
  (select count(distinct r.case_id) from public.pgos_test_results r join public.pgos_test_runs u on u.id = r.run_id where u.project_ref = p.project_ref) as executed,
  (select count(*) from public.pgos_test_runs u where u.project_ref = p.project_ref) as runs,
  (select to_char(max(u.run_at) at time zone 'Africa/Cairo', 'YYYY-MM-DD') from public.pgos_test_runs u where u.project_ref = p.project_ref) as last_run,
  (select count(*) from public.pgos_test_results r join public.pgos_test_runs u on u.id = r.run_id where u.project_ref = p.project_ref and r.result = 'pass') as pass,
  (select count(*) from public.pgos_test_results r join public.pgos_test_runs u on u.id = r.run_id where u.project_ref = p.project_ref and r.result in ('pass','fail','partial','blocked')) as decided,
  (select count(*) from public.pgos_defects d where d.project_ref = p.project_ref and d.status = 'open') as open_defects
from (select distinct project_ref, project_name from public.pgos_project_lifecycle) p
order by p.project_ref
"""


def q(sql):
    return call("POST", f"/v1/projects/{REF}/database/query", {"query": sql})


def esc(s):
    return str(s).replace("'", "''")


def main():
    rows = q(STATS_SQL)
    updated = 0
    for r in rows:
        written = int(r["written"] or 0)
        if written == 0:
            continue  # بيحتفظ بالملحوظة الافتراضية: لا كيسز مزروعة بعد
        executed = int(r["executed"] or 0)
        runs = int(r["runs"] or 0)
        decided = int(r["decided"] or 0)
        passed = int(r["pass"] or 0)
        defects = int(r["open_defects"] or 0)
        last = str(r["last_run"])[:10] if r["last_run"] else "—"
        status = "done" if runs > 0 else "pending"
        note = (f"وحدة الاختبار: {written} كيس مكتوبة · {executed} منفذة · "
                f"{runs} تشغيلة (آخرها {last})")
        if decided:
            note += f" · نجاح {round(100.0 * passed / decided)}%"
        note += f" · {defects} عيب مفتوح — تتغذى آليًا من وحدة الاختبار"
        q("update public.pgos_project_lifecycle set status = '" + status +
          "', note = '" + esc(note) + "', updated_at = now() "
          "where step_key = 'testing_registry' and project_ref = '" +
          esc(r["project_ref"]) + "'")
        updated += 1
        print(f"{r['project_ref']}: {status} — {note}")
    print(f"TESTING FEED OK — updated {updated} project rows")


if __name__ == "__main__":
    main()
