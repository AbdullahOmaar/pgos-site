#!/usr/bin/env python3
"""دفع قاعدة التدريج المحلية (pgos_live.db) إلى جداول pgos_ الحية عبر Management API SQL.
قناة الكتابة المعتمدة بعد إيقاف مفاتيح PostgREST القديمة (3A-695): SQL عبر الموصل المسجل.
الاستخدام: push_staging_to_supabase.py <project_ref> [db_path]
يطبع عدّادات فقط — لا بيانات ولا مفاتيح."""
import importlib.util
import json
import sqlite3
import sys

REF = sys.argv[1]
DB = sys.argv[2] if len(sys.argv) > 2 else "/home/hatch/workspace/pgos-site/data/pgos_live.db"

spec = importlib.util.spec_from_file_location(
    "sapi", "/home/hatch/workspace/custom-connectors/custom.supabase/bin/supabase_api.py")
sapi = importlib.util.module_from_spec(spec)
sys.argv = ["supabase_api.py"]
try:
    spec.loader.exec_module(sapi)
except SystemExit:
    pass

# table -> (conflict key, {col: pg type})
TABLES = [
    ("pgos_projects", "id", {"id": "uuid", "metadata": "jsonb",
     "created_at": "timestamptz", "updated_at": "timestamptz"}),
    ("pgos_issues", "identifier", {"id": "uuid", "project_id": "uuid", "labels": "jsonb",
     "raw_data": "jsonb", "due_date": "timestamptz", "completed_at": "timestamptz",
     "updated_at": "timestamptz", "created_at": "timestamptz", "started_at": "timestamptz",
     "archived_at": "timestamptz"}),
    ("pgos_hq_decisions", "id", {"created_at": "timestamptz", "updated_at": "timestamptz"}),
    ("pgos_releases", "id", {"project_id": "uuid", "metadata": "jsonb",
     "released_at": "timestamptz", "created_at": "timestamptz", "updated_at": "timestamptz"}),
    ("pgos_checklist_items", "check_number", {"project_statuses": "jsonb", "raw_data": "jsonb",
     "created_at": "timestamptz", "updated_at": "timestamptz"}),
    ("pgos_sync_runs", "id", {"id": "uuid", "diff_summary": "jsonb",
     "started_at": "timestamptz", "finished_at": "timestamptz"}),
]
BATCH = 25


def lit(value, pgtype):
    if value is None or (isinstance(value, str) and value == "" and pgtype in ("timestamptz", "uuid", "jsonb")):
        return "NULL"
    if pgtype == "jsonb":
        try:
            json.loads(value)
            payload = value
        except Exception:
            payload = json.dumps(str(value), ensure_ascii=False)
        return "'" + payload.replace("'", "''") + "'::jsonb"
    if pgtype == "uuid":
        import uuid as _uuid
        v = str(value)
        try:
            _uuid.UUID(v)
        except Exception:
            v = str(_uuid.uuid5(_uuid.NAMESPACE_URL, "pgos:" + v))
        return "'" + v + "'::uuid"
    if pgtype == "timestamptz":
        return "'" + str(value).replace("'", "''") + "'::" + pgtype
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    for table, conflict_key, types in TABLES:
        cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})")]
        rows = con.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall()
        pushed = 0
        for i in range(0, len(rows), BATCH):
            batch = rows[i:i + BATCH]
            values = []
            for row in batch:
                cells = [lit(v, types.get(c, "text")) for c, v in zip(cols, row)]
                values.append("(" + ", ".join(cells) + ")")
            updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != conflict_key)
            action = "DO NOTHING" if table == "pgos_sync_runs" else f"DO UPDATE SET {updates}"
            sql = (f"INSERT INTO {table} ({', '.join(cols)}) VALUES " + ", ".join(values) +
                   f" ON CONFLICT ({conflict_key}) {action}")
            sapi.call("POST", f"/v1/projects/{REF}/database/query", {"query": sql})
            pushed += len(batch)
        print(f"{table}: pushed {pushed}")

    # إصلاح الروابط من الحمولة: العامل في وضع الحمولة المحلية بيُسقط ربط المشروع
    # (normalize بتاعه بيقرأ شكل MCP الخام لا projectUuid) — هنا بنركّبه من المصدر نفسه.
    payload = json.load(open("/home/hatch/workspace/ops-system/linear-sync/payload.json"))
    proj_linear = {p["uuid"]: p["linearId"] for p in payload["projects"]}
    for uuid_, linear_id in proj_linear.items():
        sapi.call("POST", f"/v1/projects/{REF}/database/query",
                  {"query": f"UPDATE pgos_projects SET linear_id = '{linear_id}' WHERE id = '{uuid_}'::uuid"})
    by_project = {}
    for iss in payload["issues"]:
        pu = iss.get("projectUuid")
        if pu:
            by_project.setdefault(pu, []).append(iss["identifier"])
    linked = 0
    for pu, idents in by_project.items():
        for i in range(0, len(idents), 50):
            batch = idents[i:i + 50]
            in_list = ", ".join("'" + x.replace("'", "''") + "'" for x in batch)
            sapi.call("POST", f"/v1/projects/{REF}/database/query",
                      {"query": f"UPDATE pgos_issues SET project_id = '{pu}'::uuid, "
                                f"project_linear_id = '{proj_linear.get(pu, '')}' "
                                f"WHERE identifier IN ({in_list})"})
            linked += len(batch)
    print(f"linkage: projects {len(proj_linear)}, issues linked {linked}")
    print("PUSH DONE")


if __name__ == "__main__":
    main()
