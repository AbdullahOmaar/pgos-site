#!/usr/bin/env python3
"""بذرة M2 الأساسية: طاقم المكتب (من seed.ts) + سجل التنظيم (من os_org.json) + أنواع الإشعارات (من inject_os.py).
الاستخدام: seed_m2_core.py <project_ref> — upserts آمنة لإعادة التشغيل. يطبع عدّادات فقط."""
import ast
import importlib.util
import json
import sys

REF = sys.argv[1]
SCRATCH = "/home/hatch/workspace/ops-system/linear-sync/ui-352-scratch"

spec = importlib.util.spec_from_file_location(
    "sapi", "/home/hatch/workspace/custom-connectors/custom.supabase/bin/supabase_api.py")
sapi = importlib.util.module_from_spec(spec)
sys.argv = ["supabase_api.py"]
try:
    spec.loader.exec_module(sapi)
except SystemExit:
    pass


def q(sql):
    return sapi.call("POST", f"/v1/projects/{REF}/database/query", {"query": sql})


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, dict)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def upsert(table, cols, rows, conflict):
    for r in rows:
        cells = ", ".join(lit(r.get(c)) for c in cols)
        updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != conflict)
        q(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({cells}) "
          f"ON CONFLICT ({conflict}) DO UPDATE SET {updates}, updated_at = now()")
    print(table, len(rows))


# --- طاقم المكتب الافتراضي (نقل حرفي من src/office/seed.ts على فرع feature/virtual-office) ---
OFFICE_DEPTS = [
    ("dept-ops", "الإدارة والعمليات", "#FFA726"),
    ("dept-product", "تطوير المنتجات", "#00D2FF"),
    ("dept-qa", "الجودة والمراجعة", "#34D399"),
    ("dept-rnd", "البحث والتطوير", "#B388FF"),
    ("dept-marketing", "التسويق والسوشيال", "#FF7BAC"),
    ("dept-support", "الدعم والمتابعة", "#FFD54F"),
]
OFFICE_EMPS = [
    ("emp-01", "ليان حسن", "منسقة عمليات", "dept-ops", 1, "working", ["Slack", "Linear"], "تقرير حالة الشركة الأسبوعي", 4, 2, 4.8),
    ("emp-02", "عمر فاروق", "مسؤول متابعة المهام", "dept-ops", 2, "working", ["Linear"], "توزيع مهام اليوم على المسارات", 7, 3, 4.6),
    ("emp-03", "سلمى نبيل", "مسؤولة السجل والقيود", "dept-ops", 3, "idle", ["Drive", "Slack"], None, 0, 1, 4.9),
    ("emp-04", "كريم وائل", "منسق اجتماعات", "dept-ops", 4, "offline", ["Calendar"], None, 2, 1, 4.4),
    ("emp-05", "يوسف عادل", "مطور واجهات", "dept-product", 1, "working", ["GitHub", "Vercel"], "واجهة المقر الافتراضي — المشهد", 5, 2, 4.7),
    ("emp-06", "مريم سامح", "مطورة خلفية", "dept-product", 2, "working", ["GitHub", "Supabase"], "طبقة البيانات الديناميكية", 6, 2, 4.8),
    ("emp-07", "آدم رضا", "مطور تطبيقات", "dept-product", 3, "working", ["GitHub"], "إصلاحات دفعة الواجهة", 3, 1, 4.5),
    ("emp-08", "حبيبة طارق", "مهندسة بيانات", "dept-product", 4, "idle", ["Supabase"], None, 0, 2, 4.6),
    ("emp-09", "زياد منير", "مطور تكاملات", "dept-product", 5, "working", ["GitHub", "Slack"], "ربط إشعارات سلاك", 4, 1, 4.3),
    ("emp-10", "نور الدين علي", "مراجع كود", "dept-qa", 1, "working", ["GitHub"], "مراجعة طلبات الدمج المفتوحة", 8, 4, 4.9),
    ("emp-11", "فرح إسلام", "مهندسة اختبارات", "dept-qa", 2, "working", ["GitHub", "Linear"], "فحص الـ45 نقطة — مستر", 5, 2, 4.7),
    ("emp-12", "بلال حسان", "مراجع تصميم قواعد بيانات", "dept-qa", 3, "idle", ["Supabase"], None, 0, 1, 4.5),
    ("emp-13", "رنا خليل", "باحثة أدوات ذكاء اصطناعي", "dept-rnd", 1, "working", ["Linear", "Drive"], "دورة بحث — وكلاء الخلفية", 6, 3, 4.8),
    ("emp-14", "سامر نديم", "باحث منتجات", "dept-rnd", 2, "working", ["Drive"], "مقارنة منصات إدارة الحضانات", 3, 2, 4.4),
    ("emp-15", "دينا عماد", "محللة تجارب", "dept-rnd", 3, "offline", ["Linear"], None, 1, 1, 4.2),
    ("emp-16", "هشام رامي", "باحث تقني", "dept-rnd", 4, "working", ["GitHub", "Drive"], "تقييم محركات العرض ثلاثي الأبعاد", 4, 2, 4.6),
    ("emp-17", "تالا سمير", "صانعة محتوى", "dept-marketing", 1, "working", ["Instagram", "Drive"], "سكربت فيديو إطلاق مستر", 5, 2, 4.7),
    ("emp-18", "جنى وليد", "مصممة سوشيال", "dept-marketing", 2, "idle", ["Drive"], None, 0, 1, 4.5),
    ("emp-19", "مالك شريف", "مسؤول حملات", "dept-marketing", 3, "working", ["Instagram", "Slack"], "خطة محتوى الأسبوع", 4, 3, 4.3),
    ("emp-20", "ريم أشرف", "مسؤولة دعم العملاء", "dept-support", 1, "working", ["Slack", "WhatsApp"], "الرد على استفسارات المدرسين", 9, 2, 4.9),
    ("emp-21", "طارق زياد", "مسؤول متابعة التنبيهات", "dept-support", 2, "working", ["Slack"], "مراقبة تنبيهات النظام", 3, 1, 4.4),
    ("emp-22", "هنا محمود", "منسقة نجاح العملاء", "dept-support", 3, "idle", ["WhatsApp", "Drive"], None, 0, 2, 4.6),
]

upsert("pgos_departments", ["id", "name", "color", "sort_order"],
       [{"id": d[0], "name": d[1], "color": d[2], "sort_order": i} for i, d in enumerate(OFFICE_DEPTS)], "id")
upsert("pgos_office_rooms", ["id", "department_id", "name", "sort_order"],
       [{"id": "room-" + d[0], "department_id": d[0], "name": d[1], "sort_order": i} for i, d in enumerate(OFFICE_DEPTS)], "id")
upsert("pgos_employees",
       ["id", "name", "role", "department_id", "desk", "status", "tools", "current_task", "tasks_open", "projects", "rating"],
       [{"id": e[0], "name": e[1], "role": e[2], "department_id": e[3], "desk": e[4], "status": e[5],
         "tools": e[6], "current_task": e[7], "tasks_open": e[8], "projects": e[9], "rating": e[10]} for e in OFFICE_EMPS], "id")

# --- سجل التنظيم الحقيقي ---
org = json.load(open(f"{SCRATCH}/os_org.json"))
upsert("pgos_org_departments", ["id", "name", "color", "description", "projects", "sort_order"],
       [{"id": d["id"], "name": d["name"], "color": d.get("color"), "description": d.get("desc"),
         "projects": d.get("projects", []), "sort_order": i} for i, d in enumerate(org["departments"])], "id")
upsert("pgos_org_employees",
       ["id", "name", "initial", "color", "dept_name", "role", "status", "group_name", "project_ref", "sort_order"],
       [{"id": e["id"], "name": e["name"], "initial": e.get("initial"), "color": e.get("color"),
         "dept_name": e.get("dept"), "role": e.get("role"), "status": e.get("status"),
         "group_name": e.get("group"), "project_ref": e.get("project"), "sort_order": i}
        for i, e in enumerate(org["employees"])], "id")

# --- أنواع الإشعارات من سجل inject_os.py (استخراج آمن بـAST) ---
tree = ast.parse(open(f"{SCRATCH}/inject_os.py").read())
types = None
for node in ast.walk(tree):
    if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "NOTIFICATION_TYPES":
        types = ast.literal_eval(node.value)
assert types, "NOTIFICATION_TYPES not found"
upsert("pgos_notification_types", ["id", "label", "description", "default_on", "active", "sort_order"],
       [{"id": t["id"], "label": t["label"], "description": t.get("desc"),
         "default_on": t.get("defaultOn", False), "active": t.get("active", False), "sort_order": i}
        for i, t in enumerate(types)], "id")

print("SEED DONE")
