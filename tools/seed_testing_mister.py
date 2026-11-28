#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
زرع وحدة الاختبار لمستر من مرجع الاختبار الموحّد (2026-11-28).
المصدر: ~/workspace/your_files/mister-reference/REFERENCE-TESTING-UNIFIED-2026-11-28.md
الناتج: ملفات SQL في tools/seed_out/ (cases/runs/results/defects) — تُطبق عبر supabase_api.py query.
قابل لإعادة التشغيل (ON CONFLICT DO UPDATE). التحقق الإلزامي: مصالحة الـ292 = 46/5/9/4/228.
"""
import os, re, sys, json

SRC = os.path.expanduser("~/workspace/your_files/mister-reference/REFERENCE-TESTING-UNIFIED-2026-11-28.md")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_out")
os.makedirs(OUT, exist_ok=True)

PROJECT_REF = "P-3A-5"
PROJECT_NAME = "مستر — تطبيق المدرسين"
REPORT_URL = "https://drive.google.com/file/d/12M6sb4zXkLUg2WRyU_AKNsI0ICRq2E3B/view"

lines = open(SRC, encoding="utf-8").read().splitlines()

def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def cells_of(line):
    parts = [c.strip() for c in line.strip().strip("|").split("|")]
    return parts

# ---------- 1) الـ292: جدول كامل سطرًا بسطر ----------
start = next(i for i, l in enumerate(lines) if "الجدول الكامل" in l and "292" in l)
ft_rows = []
for l in lines[start:]:
    if l.startswith("## ") and ft_rows:
        break
    if not l.startswith("|"):
        continue
    c = cells_of(l)
    if len(c) >= 6 and c[0].isdigit():
        if len(c) > 6:
            c = c[:5] + ["|".join(c[5:])]
        ft_rows.append(c)
assert len(ft_rows) == 292, f"FT rows={len(ft_rows)}"
assert [int(r[0]) for r in ft_rows] == list(range(1, 293)), "FT numbering not sequential"

def map_result(cov):
    t = cov.strip()
    if "جزئي" in t:
        return "partial"
    if "فشل" in t:
        return "fail"
    if "محتاج تأكيد" in t or "يحتاج تأكيد" in t:
        return "blocked"
    if "مغطى حي" in t or "مغطّى حي" in t:
        return "pass"
    if "فجوة" in t:
        return None
    return "UNKNOWN:" + t

from collections import Counter
cov_counts = Counter(map_result(r[4]) for r in ft_rows)
unknown = {k: v for k, v in cov_counts.items() if k and k.startswith("UNKNOWN")}
print("FT coverage mapping:", dict(cov_counts))
if unknown:
    print("UNKNOWN coverage values:", unknown)
    sys.exit(1)
expect = {"pass": 46, "partial": 5, "fail": 9, "blocked": 4, None: 228}
got = {k: cov_counts.get(k, 0) for k in expect}
assert got == expect, f"reconciliation failed: got {got} expect {expect}"
print("FT reconciliation OK: 46 pass / 5 partial / 9 fail / 4 blocked / 228 not-executed")

cases = []   # (id, module, title, kind, state, source, note, sort)
results_ind = []  # (case_id, result, note)
for r in ft_rows:
    n = int(r[0])
    cid = f"MR-FT-{n:03d}"
    note = r[5] if r[5] and r[5] != "—" else None
    cases.append((cid, r[1], r[2], "manual", "written",
                  f"مرجع الاختبار الموحّد §٥(ب) #{n} — خطة الفول تست اليدوية (سند)",
                  note, 1000 + n))
    res = map_result(r[4])
    if res:
        results_ind.append((cid, res, r[4]))

# ---------- 2) جدول الـ45 ----------
gstart = next(i for i, l in enumerate(lines) if l.startswith("## ") and "جدول الـ45" in l)
gov_rows = []
for l in lines[gstart:]:
    if l.startswith("## ") and gov_rows:
        break
    if not l.startswith("|"):
        continue
    c = cells_of(l)
    if len(c) >= 6 and c[0].isdigit():
        if len(c) > 6:
            c = c[:5] + ["|".join(c[5:])]
        gov_rows.append(c)
assert len(gov_rows) == 45, f"GOV rows={len(gov_rows)}"
for r in gov_rows:
    n = int(r[0])
    cid = f"MR-GOV-{n:02d}"
    note = f"حالة محدّثة 2026-11-28: {r[4]} (مسجّل 2026-11-23: {r[3]}) — {r[5]}"
    cases.append((cid, r[1], r[2], "governance", "written",
                  f"مرجع الاختبار الموحّد §٥(ج) #{n} — جدول فحص ما قبل الإنتاج (QA)",
                  note, 2000 + n))
print("GOV OK: 45")

# ---------- 3) سيناريوهات القبول الدائمة (8) ----------
acc = [
    "حساب جديد + دخول فوري بلا بريد/كود",
    "«نسيت كلمة السر» يصل بإيميل عربي نظيف",
    "النسخة القديمة لا تعرض خطأً خامًا أبدًا",
    "خط أساس الديمو 18 نقطة حرفيًا بعد كل دفعة",
    "الإنتاج 200 + بصمة الحزمة تطابق البناء المقصود",
    "صفحة المساعد في حالتها المطفأة تعرض البطاقة المصممة",
    "/api/health يرد سليمًا",
    "لا أخطاء خام — كل سطح غير مُطلق بحالة مصممة",
]
for i, t in enumerate(acc, 1):
    cases.append((f"MR-ACC-{i:02d}", "سيناريوهات القبول الدائمة", t, "manual", "written",
                  f"REFERENCE-TESTING §7.{i} (مرجع الاختبار الموحّد §٢-L3)",
                  "قائمة مالك تراكمية — تُنفَّذ كلها عند كل نشر", 3000 + i))

# ---------- 4) إجراءات §6.21 اليدوية (حزمة واحدة — أسماؤها موزعة في المرجع) ----------
cases.append(("MR-PROC-621", "إجراءات يدوية §6.21",
              "الإجراءات اليدوية الثمانية في §6.21 (قبول بريد الاسترداد من صندوق المالك · فحص النسخة القديمة · خط أساس الديمو بعد كل دفعة · التحقق الحي من دومين الإنتاج · وغيرها)",
              "manual", "written",
              "REFERENCE-TESTING §6.21 (مرجع الاختبار الموحّد §٢-L3)",
              "أحد الإجراءات مجدول لم يُنفَّذ بعد (موثّق في المرجع)", 4001))

# ---------- 5) حزم الكتالوج الآلي §6.1–§6.20 (من خريطة التغطية أ) ----------
auto = [
    ("6.1", "مكوّنات الواجهة المشتركة (components)", "12 ملفًا / 82 حالة", "automated"),
    ("6.2", "المصادقة والدخول (auth)", "1 ملف / 25 حالة", "automated"),
    ("6.3", "الحضور (attendance)", "4 ملفات / 31 حالة", "automated"),
    ("6.4", "الطلاب والمجموعات والحجز والجدول", "5 ملفات / 47 حالة", "automated"),
    ("6.5", "الامتحانات والدرجات والواجبات", "3 ملفات / 21 حالة", "automated"),
    ("6.6", "المال (الفواتير والخزينة والدفتر)", "4 ملفات / 50 حالة", "automated"),
    ("6.7", "الرئيسية والتحليلات والمعرّضون والإشعارات", "4 ملفات / 51 حالة", "automated"),
    ("6.8", "المساعد الذكي (assistant)", "1 ملف / 16 حالة", "automated"),
    ("6.9", "البوابات (portal)", "2 ملف / 36 حالة", "automated"),
    ("6.10", "الإعدادات (settings)", "4 ملفات / 31 حالة", "automated"),
    ("6.11", "أدمن المنصة (platform-admin)", "5 ملفات / 51 حالة", "automated"),
    ("6.12", "المكتبة المشتركة والترجمة (lib + i18n)", "13 ملفًا / 143 تشغيلة", "automated"),
    ("6.13", "عقود الدوال الحدّية (contract tests)", "1 ملف / 30 سيناريو (~85 فحصًا)", "automated"),
    ("6.14", "حدود المعدّل (rate-limit checks)", "1 ملف / 12 فحصًا", "automated"),
    ("6.15", "حقن الأعطال (fault injection)", "1 ملف / 9 سيناريوهات", "automated"),
    ("6.16", "التفويض الحي authz (20 قسمًا)", "1 ملف / 127 فحصًا", "automated_local"),
    ("6.17", "حذف الحساب — مجموعة حية مستقلة", "1 ملف / 14 فحصًا", "automated_local"),
    ("6.18", "اعتراض البريد (Mailpit)", "1 ملف / 6 فحوص", "automated"),
    ("6.19", "E2E الدخانية (متصفح حقيقي)", "1 ملف / 8 تدفقات", "automated"),
    ("6.20", "حرّاس وتدقيقات آلية مساندة", "8 أدوات (i18n + حزمة + a11y + أداء/أوفلاين + بصري 31 شاشة + طفرات + linear_verify)", "automated"),
]
for i, (sec, mod, cnt, kind) in enumerate(auto, 1):
    cases.append((f"MR-AUTO-{i:02d}", f"كتالوج آلي §{sec} — {mod}",
                  f"حزمة §{sec}: {cnt} — كما هو موثّق في سجل التغطية §6.23",
                  kind, "written",
                  f"REFERENCE-TESTING §{sec} + §6.23 (مرجع الاختبار الموحّد §٤)",
                  "حزمة آلية واحدة في السجل — حالاتها الفردية داخل ملفات الاختبار نفسها", 5000 + i))

# ---------- 6) فجوات الكتالوج §6.22 ----------
cases.append(("MR-GAP-622", "فجوات الكتالوج §6.22",
              "15 بندًا «لسه ما اتكتبتش» بأسمائها في مرجع الاختبار الموحّد §٧(ج): عقدا send-push وreceipt-extract · صفحة السنتر /centre · أداء الامتحان من جهة الطالب · محتوى بوابة الطالب · معالج استيراد الطلاب · تعليم الواجب · قناة تأكيد واتساب 0060 · الدخول برقم الهاتف OTP · اشتراك دفع الويب · توليد ملفات التصدير · سجل النشاط · مخرجات الطباعة · بطاقات الإعدادات الجديدة · تدفق المساعد · تبديل السناتر",
              "manual", "gap",
              "REFERENCE-TESTING §6.22 (مرجع الاختبار الموحّد §٧(ج))",
              "فجوة موثّقة — تُفصَّل لكيسز مستقلة عند كتابتها", 6001))

# ---------- 7) العيوب ----------
DEF_SRC = "تقرير التنفيذ المستقل 2026-11-28 (مرجع الاختبار الموحّد §٧ب)"
defects = [
    ("MR-D1", "MR-GOV-29", "حارس الدفع الزايد/المكرر واجهة فقط — القاعدة تقبله من الـAPI", "medium", DEF_SRC, "جدول الـ45 #29"),
    ("MR-D4", "MR-GOV-29", "درجات بلا سقف: score > max_score مقبول (999 ← 4995%)", "medium", DEF_SRC, "جدول الـ45 #29"),
    ("MR-D5", "MR-GOV-29", "pass_score > max_score مقبول", "low", DEF_SRC, "درجة في المرجع: منخفض-متوسط · جدول الـ45 #29"),
    ("MR-D6", "MR-GOV-29", "رقم موبايل بلا تحقق صيغة (طالب/مدرس)", "low", DEF_SRC, "جدول الـ45 #29"),
    ("MR-D7", "MR-GOV-41", "لا قفل مؤقت بعد محاولات دخول فاشلة (F2 مفتوح)", "medium", DEF_SRC, "درجة في المرجع: متوسط-منخفض · جدول الـ45 #41 جزئيًا"),
    ("MR-D8", None, "بوابة ولي الأمر تكراش في الواجهة («حصلت مشكلة غير متوقعة») — الـRPC سليم والعيب في العرض", "high", DEF_SRC, "حاجب إطلاق حتى الإصلاح أو قرار موثّق (بوابة ٩-١١)"),
    ("MR-D2", None, "الدالة pgos_owner_uid() قابلة للنداء من anon (3A-932) — على قاعدة الديمو المختلطة", "low", "تدقيق RLS حي 2026-11-28 + بند 3A-932", "إقفالها: revoke + حالة اختبار (بوابة ٩-١٢)"),
    ("MR-D3", "MR-ACC-05", "سطر الإصدار على سطح النشر الحالي 1.0.0 بصيغة ناقصة + /api/health غائب على نشر Cloudflare", "medium", DEF_SRC, "عيب بوابة — يُقفل على بيئة البرودكشن (بوابتا ٩-٥ و٩-٨)"),
]

# ---------- 8) التشغيلات + نتائج CI ----------
runs = [
    ("MR-RUN-CI-46112007667", "تشغيلة CI على main — دمج #89", "CI (GitHub Actions)", "GitHub Actions",
     "2026-11-28", "run 46112007667", "9/10 وظائف خضراء — الفشل الوحيد visual-regression (معلوماتية، حمراء على main نفسها)"),
    ("MR-RUN-IND-20261128", "تنفيذ الاختبارات المستقلة — مطابقة الـ292 + 55 فحصًا حيًّا + تدقيق RLS كامل",
     "الديمو (Cloudflare pages.dev + أسطح Vercel)", "شات المراجعة المستقلة",
     "2026-11-28", None, "التقرير على Drive — التاريخ موثّق والساعة غير موثّقة"),
]
ci_results = []
for i, (sec, mod, cnt, kind) in enumerate(auto, 1):
    cid = f"MR-AUTO-{i:02d}"
    if kind == "automated_local":
        ci_results.append((cid, "skipped", "تتخطى نفسها في CI (تحتاج بيانات اعتماد محلية) — تعمل محليًا فقط"))
    elif sec == "6.20":
        ci_results.append((cid, "fail", "visual-regression حمراء على main (معلوماتية) — باقي الأدوات كما هو موثّق لكل أداة"))
    else:
        ci_results.append((cid, "pass", "وظيفة CI خضراء في التشغيلة 46112007667"))

# ---------- الإخراج ----------
def emit_cases():
    out = []
    for (cid, mod, title, kind, state, source, note, so) in cases:
        out.append(
            "insert into public.pgos_test_cases (id, project_ref, project_name, module, title, kind, case_state, source, note, sort_order) values "
            f"({esc(cid)}, {esc(PROJECT_REF)}, {esc(PROJECT_NAME)}, {esc(mod)}, {esc(title)}, {esc(kind)}, {esc(state)}, {esc(source)}, {esc(note)}, {so}) "
            "on conflict (id) do update set module=excluded.module, title=excluded.title, kind=excluded.kind, case_state=excluded.case_state, source=excluded.source, note=excluded.note, sort_order=excluded.sort_order, updated_at=now();")
    return out

def emit_runs():
    out = []
    for (rid, label, env, exe, day, bref, note) in runs:
        out.append(
            "insert into public.pgos_test_runs (id, project_ref, project_name, label, environment, executor, run_at, build_ref, note) values "
            f"({esc(rid)}, {esc(PROJECT_REF)}, {esc(PROJECT_NAME)}, {esc(label)}, {esc(env)}, {esc(exe)}, {esc(day + 'T00:00:00+02:00')}, {esc(bref)}, {esc(note)}) "
            "on conflict (id) do update set label=excluded.label, environment=excluded.environment, executor=excluded.executor, run_at=excluded.run_at, build_ref=excluded.build_ref, note=excluded.note, updated_at=now();")
    return out

def emit_results(run_id, rows, evidence=None):
    out = []
    for (cid, res, note) in rows:
        out.append(
            "insert into public.pgos_test_results (run_id, case_id, result, evidence_url, note) values "
            f"({esc(run_id)}, {esc(cid)}, {esc(res)}, {esc(evidence)}, {esc(note)}) "
            "on conflict (run_id, case_id) do update set result=excluded.result, evidence_url=excluded.evidence_url, note=excluded.note;")
    return out

def emit_defects():
    out = []
    for (did, cid, title, sev, src, note) in defects:
        out.append(
            "insert into public.pgos_defects (id, project_ref, project_name, case_id, title, severity, status, source, opened_at, note) values "
            f"({esc(did)}, {esc(PROJECT_REF)}, {esc(PROJECT_NAME)}, {esc(cid)}, {esc(title)}, {esc(sev)}, 'open', {esc(src)}, '2026-11-28', {esc(note)}) "
            "on conflict (id) do update set case_id=excluded.case_id, title=excluded.title, severity=excluded.severity, source=excluded.source, note=excluded.note, updated_at=now();")
    return out

case_sql = emit_cases()
chunks = [case_sql[i:i + 130] for i in range(0, len(case_sql), 130)]
for i, ch in enumerate(chunks, 1):
    open(os.path.join(OUT, f"seed_cases_{i}.sql"), "w", encoding="utf-8").write("\n".join(ch) + "\n")
open(os.path.join(OUT, "seed_runs.sql"), "w", encoding="utf-8").write("\n".join(emit_runs()) + "\n")
open(os.path.join(OUT, "seed_results_ind.sql"), "w", encoding="utf-8").write("\n".join(emit_results("MR-RUN-IND-20261128", results_ind, REPORT_URL)) + "\n")
open(os.path.join(OUT, "seed_results_ci.sql"), "w", encoding="utf-8").write("\n".join(emit_results("MR-RUN-CI-46112007667", ci_results)) + "\n")
open(os.path.join(OUT, "seed_defects.sql"), "w", encoding="utf-8").write("\n".join(emit_defects()) + "\n")
print(f"cases={len(cases)} runs={len(runs)} results_ind={len(results_ind)} results_ci={len(ci_results)} defects={len(defects)}")
print("SQL files in", OUT)

# ---------- 9) جولة سند باسمه (إضافة مالك 2026-11-28: كل نتيجة باسم منفّذها) ----------
# نتائج سند الموثقة في عمود «نتيجة سند» بجدول المطابقة: عّدى 17 + فشل 8 + محتاج تأكيد 4
# (ماتجربش 9 و«—» 254 = لا نتيجة مسجلة). تُزرع كتشغيلة مستقلة باسمه (tester_id=sanad).
def map_sanad(v):
    t = v.strip()
    if "فشل" in t:
        return "fail"
    if "تأكيد" in t:
        return "blocked"
    if "عّدى" in t or "عدّى" in t or "عدى" in t:
        return "pass"
    return None

sanad_results = []
for r in ft_rows:
    res = map_sanad(r[3])
    if res:
        sanad_results.append((f"MR-FT-{int(r[0]):03d}", res, f"نتيجة سند الموثقة: {r[3]}"))
from collections import Counter as _C
_sc = _C(x[1] for x in sanad_results)
assert _sc == {"pass": 17, "fail": 8, "blocked": 4}, f"Sanad reconciliation failed: {dict(_sc)}"
print("Sanad run OK: 17 pass / 8 fail / 4 blocked = 29")

_run_sql = (
    "insert into public.pgos_test_runs (id, project_ref, project_name, label, environment, executor, tester_id, run_at, build_ref, note) values "
    f"('MR-RUN-SANAD-20261128', {esc(PROJECT_REF)}, {esc(PROJECT_NAME)}, "
    "'جولة سند — خطة الفول تست اليدوية (نتائجه الموثقة في جدول مطابقة المرجع الموحّد)', "
    "'الديمو', 'سند', 'sanad', '2026-11-28T00:00:00+02:00', null, "
    "'أول تشغيلة بشرية مسجلة باسم منفّذها في الوحدة — النتائج من عمود سند في مطابقة المرجع الموحّد §٥(ب)') "
    "on conflict (id) do update set label=excluded.label, tester_id=excluded.tester_id, note=excluded.note, updated_at=now();"
)
open(os.path.join(OUT, "seed_run_sanad.sql"), "w", encoding="utf-8").write(_run_sql + "\n")

_res_sql = []
for (cid, res, note) in sanad_results:
    _res_sql.append(
        "insert into public.pgos_test_results (run_id, case_id, result, tester_id, note) values "
        f"('MR-RUN-SANAD-20261128', {esc(cid)}, {esc(res)}, 'sanad', {esc(note)}) "
        "on conflict (run_id, case_id) do update set result=excluded.result, tester_id=excluded.tester_id, note=excluded.note;")
open(os.path.join(OUT, "seed_results_sanad.sql"), "w", encoding="utf-8").write("\n".join(_res_sql) + "\n")
print("Sanad SQL emitted")
