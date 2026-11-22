#!/usr/bin/env python3
"""محوّل جدول «فحص ما قبل الإنتاج» — من CSV المقر إلى سجل النظام المنظم.

المدخل (قراءة فقط):
  - ops-system/preprod-checklist.csv — لقطة منزّلة من مقر Drive المشترك
    (ملف «جدول فحص ما قبل الإنتاج — مرجع حوكمة الشركة.csv»،
    id 1V8dd-UtIcSnPwGMWxBUALlIu6J3UYC9s، لقطة 2026-11-22T03:34:15+02:00)

المخرج:
  - ops-system/checklist/preprod-checklist.json — سجل النظام المنظم.
    من لحظة إنشائه هو النسخة التي يقرأها مولّد الموقع، والتحديث يتم
    بتعديل هذا السجل عبر النظام ثم إعادة توليد الموقع؛ ملف المقر يبقى
    المرجع الأصلي الذي اشتُق منه السجل.

أمانة بنيوية — مشكلتان في ملف CSV الأصلي موثّقتان في meta.column_issue
ولا تُجمَّلان هنا ولا في العرض:
  ١) عمود «نونو» يحمل حرفيًا «|» أو «| |» في كل الصفوف — ليس حالة تقييم،
     فيُسجَّل نونو not_evaluated في كل فحص.
  ٢) عمود «موقع PGOS» يحمل نصوص أدلة تخص تطبيق المدرس (مثل «223 اختبار
     وحدة»، «CSP مُفعّلة حية») — ليست حالات لموقع PGOS إطلاقًا. لذلك:
     النص يُحفظ كما هو في raw_pgos_column (حفظ أمين للمصدر)، ويُعرض في
     السجل كدليل (evidence) تحت تطبيق المدرس لأنه يخصّه فعليًا، وحالة
     موقع PGOS تُسجَّل not_evaluated في كل فحص — لا تُشتق أي حالة
     للموقع من هذا العمود أبدًا.

Python stdlib فقط. التشغيل:
  python3 tools/build_checklist_register.py
"""
import csv
import json
import os
import sys
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo

    CAIRO = ZoneInfo("Africa/Cairo")
except Exception:  # بيئات بلا tzdata — القاهرة UTC+2 في نوفمبر
    CAIRO = timezone(timedelta(hours=2))

OPS = os.path.join(os.path.expanduser("~"), "workspace", "ops-system")
CSV_PATH = os.path.join(OPS, "preprod-checklist.csv")
OUT_PATH = os.path.join(OPS, "checklist", "preprod-checklist.json")

SOURCE_FILE_ID = "1V8dd-UtIcSnPwGMWxBUALlIu6J3UYC9s"
SNAPSHOT_AT = "2026-11-22T03:34:15+02:00"

# رموز حالة عمود «تطبيق المدرس» في ملف المقر → حالات السجل المنظمة
TEACHER_STATUS = {
    "✅": "done",
    "◐": "partial",
    "⬜": "not_started",
    "—": "na",
}

COLUMN_ISSUE = (
    "مشكلتان بنيويتان في ملف CSV الأصلي بالمقر، موثّقتان كما هما ولا تُجمَّلان: "
    "(١) عمود «نونو» يحمل حرفيًا «|» أو «| |» في كل الصفوف — ليس تقييمًا، "
    "فسُجّل نونو «لم يُقيّم بعد» (not_evaluated) في كل الفحوصات. "
    "(٢) عمود «موقع PGOS» يحمل نصوص أدلة تخص تطبيق المدرس (مثل «223 اختبار وحدة» "
    "و«CSP مُفعّلة حية») — ليست حالات لموقع PGOS؛ حُفظ النص كما ورد في "
    "raw_pgos_column وعُرض كدليل تحت تطبيق المدرس، وسُجّل موقع PGOS "
    "«لم يُقيّم بعد» (not_evaluated) في كل الفحوصات حتى يُقيَّم فعليًا."
)

DESIGN_NOTE = (
    "هذا الملف هو سجل النظام الأصلي لجدول فحص ما قبل الإنتاج من هنا ورايح: "
    "التحديث يتم بتعديل هذا السجل عبر النظام (تغيير حالة/دليل فحص) ثم إعادة "
    "توليد موقع PGOS (npm run data) فيظهر التحديث في صفحة «فحص ما قبل الإنتاج». "
    "ملف CSV في مقر Drive يبقى المرجع الأصلي الذي اشتُق منه السجل، وأي تحديث "
    "قادم من المقر يُدمج في هذا السجل بوعي — لا بمزامنة صامتة."
)


def main() -> int:
    if not os.path.exists(CSV_PATH):
        print(f"مصدر مفقود: {CSV_PATH}", file=sys.stderr)
        return 1

    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    checks = []
    categories = []
    teacher_counts = {"done": 0, "partial": 0, "not_started": 0, "na": 0}
    warnings = []
    for row in rows:
        try:
            cid = int((row.get("رقم") or "").strip())
        except ValueError:
            warnings.append(f"صف بلا رقم صحيح — تُخطّى: {row!r}")
            continue
        category = (row.get("الفئة") or "").strip()
        if category and category not in categories:
            categories.append(category)
        symbol = (row.get("تطبيق المدرس") or "").strip()
        status = TEACHER_STATUS.get(symbol)
        if status is None:
            warnings.append(
                f"فحص {cid}: رمز حالة غير معروف في عمود تطبيق المدرس "
                f"{symbol!r} — سُجّل not_evaluated")
            status = "not_evaluated"
        else:
            teacher_counts[status] += 1
        # نص عمود «موقع PGOS» كما ورد حرفيًا — أدلة تخص تطبيق المدرس فعليًا
        raw_pgos = (row.get("موقع PGOS") or "").strip()
        nounou_raw = (row.get("نونو") or "").strip()
        if nounou_raw not in ("|", "| |", ""):
            warnings.append(
                f"فحص {cid}: عمود نونو يحمل قيمة غير متوقعة {nounou_raw!r} "
                "— سُجّل not_evaluated رغم ذلك (لا تخمين)")
        checks.append({
            "id": cid,
            "category": category,
            "item": (row.get("عنصر الفحص") or "").strip(),
            "how": (row.get("كيف يتحقق منه") or "").strip(),
            "apps": {
                "teacher": {
                    "status": status,
                    "symbol": symbol,
                    # النص من عمود «موقع PGOS» في الأصل — أدلة تطبيق المدرس
                    "evidence": raw_pgos,
                },
                "nounou": {"status": "not_evaluated"},
                "pgos": {"status": "not_evaluated"},
            },
            "raw_pgos_column": raw_pgos,
            "notes_column": (row.get("ملاحظات") or "").strip(),
        })

    register = {
        "meta": {
            "title": "جدول فحص ما قبل الإنتاج — مرجع حوكمة الشركة",
            "source": "مقر Drive — جدول فحص ما قبل الإنتاج (CSV)",
            "source_file_id": SOURCE_FILE_ID,
            "snapshot_at": SNAPSHOT_AT,
            "register_built_at": datetime.now(CAIRO).isoformat(timespec="seconds"),
            "design_note": DESIGN_NOTE,
            "column_issue": COLUMN_ISSUE,
            "counts": {
                "total": len(checks),
                "categories": len(categories),
                "teacher": teacher_counts,
                "nounou_not_evaluated": len(checks),
                "pgos_not_evaluated": len(checks),
            },
        },
        "categories": categories,
        "checks": checks,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    tmp = OUT_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(register, f, ensure_ascii=False, indent=1)
    os.replace(tmp, OUT_PATH)  # كتابة ذرّية

    print(f"✔ كُتب {OUT_PATH}")
    print(f"  فحوصات: {len(checks)} · فئات: {len(categories)}")
    print(f"  تطبيق المدرس: منجز {teacher_counts['done']} · جزئي "
          f"{teacher_counts['partial']} · لم يبدأ {teacher_counts['not_started']} "
          f"· لا ينطبق {teacher_counts['na']}")
    print(f"  نونو: لم يُقيّم بعد {len(checks)} · موقع PGOS: لم يُقيّم بعد {len(checks)}")
    for w in warnings:
        print(f"  ⚠️ {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
