#!/usr/bin/env python3
"""خط توليد بيانات موقع PGOS — يقرأ المصادر الكانونية في ops-system ويُخرج
ملف JSON ثابتًا واحدًا: public/data/site-data.json (موقع قراءة فقط).

المصادر (قراءة فقط — لا يُكتب في أي مصدر أبدًا):
  - ops-system/pgos/records/*.json        سجلات حوكمة PGOS (٩ أنواع)
  - ops-system/ledger/company-ledger.jsonl سجل الشركة (سلسلة تجزئة SHA-256)
  - ops-system/linear-sync/payload.json    حمولة Linear (مشاريع + بنود)
  - ops-system/linear-sync/pgos-payload.json حمولة Linear لمشروع PGOS (اختيارية)
  - ops-system/guard/state.json            حالة حارس الاكتمال
  - ops-system/guard/alerts.jsonl          تنبيهات الحارس (فجوات الرباعية)
  - ops-system/hq-decisions-snapshot.txt   لقطة نصية من سجل قرارات المقر (اختيارية)
  - ops-system/checklist/preprod-checklist.json سجل فحص ما قبل الإنتاج المنظم
    (اختياري — اشتُق من CSV المقر بمحوّل tools/build_checklist_register.py،
    وهو من لحظة إنشائه سجل النظام الأصلي للجدول: التحديث بتعديله ثم التوليد)
  - tools/governance_ref.json              مرجع الحوكمة المُلخّص يدويًا (محلي)

قواعد صارمة:
  - سلسلة الليدجر تُعاد حسابها بنفس خوارزمية ledger.py حرفيًا
    (hash = sha256(prev_hash + canonical_json_without_hash)، البداية GENESIS).
    أي كسر في السلسلة = خروج بكود غير صفري وعدم كتابة أي إخراج —
    تبقى آخر نسخة صالحة كما هي (قاعدة «مفيش نشر فوق سجل مكسور»).
  - التحقق البنيوي للسجلات هنا «internal_validation» — فحص داخلي بكود
    موقع PGOS نفسه، وليس فاليديتور PGOS الأصلي، ويُسمّى باسمه في البيانات.
  - Python stdlib فقط.

وضعان للتشغيل:
  - الوضع العادي (الافتراضي): يقرأ المصادر الحقيقية كما هو موثق أعلاه.
    بصمات SHA-256 ومسارات المصادر الداخلية لا تخرج في site-data.json
    المُخدَّم — تُحفظ في ملف تدقيق محلي فقط: build-meta.local.json في جذر
    المشروع (خارج public/ ومغطّى بـ .gitignore). الملف المُخدَّم يحمل
    عدّادات المصادر وأختام حداثتها فقط.
  - الوضع المُنقّى (--sanitize): لا يقرأ أي مصدر حقيقي إطلاقًا، ويُنتج
    site-data.json ببيانات مصنّعة موسومة «تجريبي — DEMO» في كل نص ظاهر
    (سجلات/بنود/مشاريع وهمية الصياغة، وأقسام فارغة صادقة للباقي).
    الغرض: نشر إثبات بوابة الحافة (Deployment Protection) واختبار الواجهة
    على رابط عام من دون تسريب أي بيان شركة حقيقي واحد — ثم يُعاد التوليد
    بالوضع العادي للنشر الحقيقي خلف البوابة المُثبتة. الوضع المُنقّى لا
    يلمس build-meta.local.json (يبقى تدقيق آخر توليد حقيقي كما هو).
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo

    CAIRO = ZoneInfo("Africa/Cairo")
except Exception:  # بيئات بلا tzdata — القاهرة UTC+2 في نوفمبر (نفس ledger.py)
    CAIRO = timezone(timedelta(hours=2))

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_ROOT = os.path.dirname(HERE)
OPS = os.path.join(os.path.expanduser("~"), "workspace", "ops-system")
OUT = os.path.join(SITE_ROOT, "public", "data", "site-data.json")
# ملف تدقيق محلي (بصمات + مسارات المصادر) — خارج public/ ولا يُخدَّم أبدًا
BUILD_META = os.path.join(SITE_ROOT, "build-meta.local.json")

GENESIS = "GENESIS-TOTO-3A-AUTOMATION"  # نفس قيمة ledger.py

# عتبات القدم بالثواني (من وثيقة المعمارية §٤.٢)
STALE_THRESHOLDS = {
    "ledger": 24 * 3600,
    "pgos-records": 7 * 24 * 3600,
    "linear-payload": 3 * 3600,
    "linear-payload-pgos": 3 * 3600,
    "hq-decisions": 24 * 3600,
    "guard": 2 * 3600,
    "preprod-checklist": 7 * 24 * 3600,
}

RECORD_GROUPS = {
    "Project": "projects",
    "Decision": "decisions",
    "WorkOrder": "work_orders",
    "Risk": "risks",
    "Evidence": "evidence",
    "Release": "releases",
    "ChangeRequest": "changes",
    "Handoff": "handoffs",
    "Incident": "incidents",
}

# الحقول الإلزامية لكل نوع — من جدول الأنواع في docs/PGOS-STUDY.md (§٢)
REQUIRED = {
    "Project": ["id", "name", "revision", "status", "owner", "problem",
                "outcomes", "scope", "non_goals", "risk_tier", "data_classes",
                "canonical_sources"],
    "WorkOrder": ["id", "project_id", "revision", "title", "status", "objective",
                  "scope", "non_goals", "owner_id", "assignee", "permission",
                  "acceptance_criteria", "verification_plan", "risk_tier"],
    "Decision": ["id", "project_id", "revision", "title", "status", "context",
                 "options", "decision", "rationale", "owner_id", "approver_ids"],
    "Risk": ["id", "project_id", "title", "description", "likelihood", "impact",
             "inherent_score", "mitigations", "owner_id", "status"],
    "Evidence": ["id", "project_id", "work_order_id", "criterion_ids",
                 "exact_revision", "environment", "scope", "procedure", "result",
                 "producer_id", "timestamp"],
    "Release": ["id", "project_id", "work_order_ids", "status", "exact_revision",
                "environment", "checks", "rollback_plan", "release_authority_id"],
    "ChangeRequest": ["id", "project_id", "revision", "status", "trigger", "reason",
                      "current_state", "proposed_state", "scope_impact",
                      "timeline_impact", "budget_impact", "technical_impact",
                      "data_impact", "security_impact", "privacy_impact",
                      "migration_plan", "compatibility_plan", "rollback_plan",
                      "test_evidence_impact", "risk_classification",
                      "required_approvers"],
    "Handoff": ["id", "project_id", "work_order_id", "revision", "status",
                "from_identity", "to_identity", "scope_summary", "acceptance_status",
                "branch", "base_sha", "head_sha", "changed_files", "tests",
                "review_ci_runtime_evidence", "not_run_checks", "blockers",
                "remaining_work", "next_action", "created_at"],
    "Incident": ["id", "project_id", "revision", "severity", "status", "start_at",
                 "detected_at", "affected_scope", "affected_data", "detection",
                 "impact", "containment", "recovery", "owner_id"],
}

ID_RE = re.compile(r"^[A-Z][A-Z0-9-]{2,63}$")
PERMISSION_LEVELS = {"A0", "A1", "A2", "A3", "A4"}
EVIDENCE_RESULTS = {"PASS", "FAIL", "NOT_RUN", "STALE", "UNKNOWN"}
RELEASE_STATUSES = {"NOT_READY", "READY_FOR_APPROVAL", "APPROVED", "DEPLOYING",
                    "DEPLOYED", "LIVE_VERIFIED", "ROLLED_BACK", "FAILED"}

# الأفعال عالية الأثر — قائمة الفاليديتور الحرفية HIGH_IMPACT_ACTIONS
# (docs/PGOS-STUDY.md §١.٥): أي فعل منها يتطلب مستوى A4 + approval_ref حقيقيًا.
HIGH_IMPACT_ACTIONS = {
    "merge_to_default", "production_deploy", "production_write",
    "destructive_migration", "sensitive_data_export", "financial_side_effect",
    "legal_side_effect", "paid_provisioning", "external_communication",
}
# مراجع اعتماد شكلية لا تُحتسب «حقيقية» عند A4/الأفعال عالية الأثر
PLACEHOLDER_APPROVAL_REFS = {"NOT_REQUIRED_FOR_A1"}

# قائمة الحقول المسموح بنشرها لكل نوع سجل (allowlist) — من قوالب PGOS كما
# هي موثقة في docs/PGOS-STUDY.md (§٢: الإلزامية + الإضافات/الاختيارية
# المذكورة) + الحقول المشتركة (record_type/id/project_id/revision/status/
# title/approval_ref). أي حقل خارجها يُحذف من الإخراج المنشور ويُسجَّل
# كملحوظة في نتيجة تحقق السجل (لا يُسقِط السجل). القائمة على مستوى الحقل
# الأعلى فقط — محتويات الكائنات المتداخلة (owner/permission/canonical_sources)
# تمر كما هي لأن الفاليديتور يفحص مفاتيحها المطلوبة أصلًا.
FIELD_ALLOWLIST = {
    "Project": {"record_type", "id", "name", "revision", "status", "owner",
                "problem", "outcomes", "scope", "non_goals", "risk_tier",
                "data_classes", "canonical_sources", "created_at", "review_date",
                "success_metrics", "governance_profile_version",
                "approved_deviations"},
    "WorkOrder": {"record_type", "id", "project_id", "revision", "title",
                  "status", "objective", "scope", "non_goals", "owner_id",
                  "assignee", "permission", "approval_ref",
                  "acceptance_criteria", "verification_plan", "risk_tier"},
    "Decision": {"record_type", "id", "project_id", "revision", "title",
                 "status", "context", "options", "decision", "rationale",
                 "owner_id", "approver_ids", "effective_at", "consequences",
                 "risk_refs", "review_date", "supersedes"},
    "Risk": {"record_type", "id", "project_id", "title", "description",
             "likelihood", "impact", "inherent_score", "mitigations",
             "owner_id", "status", "residual_score"},
    # notes في Evidence: إضافة محلية موثقة (قرار مسار 3A-316، 2026-11-22) — سجلاتنا
    # تستخدمها فعليًا لتوثيق تفاصيل الأدلة (مثل فجوات الحارس في EVD-TOTO-001)
    "Evidence": {"record_type", "id", "project_id", "work_order_id",
                 "criterion_ids", "exact_revision", "environment", "scope",
                 "procedure", "result", "producer_id", "timestamp",
                 "source_url", "reviewer_id", "invalidation_triggers", "notes"},
    "Release": {"record_type", "id", "project_id", "work_order_ids", "status",
                "exact_revision", "environment", "checks", "rollback_plan",
                "release_authority_id", "approval_ref", "deployment_receipt",
                "live_verification"},
    "ChangeRequest": {"record_type", "id", "project_id", "revision", "title",
                      "status", "trigger", "reason", "current_state",
                      "proposed_state", "scope_impact", "timeline_impact",
                      "budget_impact", "technical_impact", "data_impact",
                      "security_impact", "privacy_impact", "migration_plan",
                      "compatibility_plan", "rollback_plan",
                      "test_evidence_impact", "risk_classification",
                      "required_approvers", "decision_ref", "effective_version",
                      "expires_at", "follow_up"},
    "Handoff": {"record_type", "id", "project_id", "work_order_id", "revision",
                "status", "from_identity", "to_identity", "scope_summary",
                "acceptance_status", "notion_url", "linear_url", "github_url",
                "branch", "base_sha", "head_sha", "changed_files", "tests",
                "review_ci_runtime_evidence", "not_run_checks", "blockers",
                "remaining_work", "next_action", "created_at"},
    "Incident": {"record_type", "id", "project_id", "revision", "severity",
                 "status", "start_at", "detected_at", "contained_at",
                 "resolved_at", "affected_scope", "affected_data", "detection",
                 "impact", "containment", "recovery", "root_cause", "owner_id",
                 "evidence_refs", "follow_up_actions"},
}


def now_cairo() -> datetime:
    return datetime.now(CAIRO)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def stamp(source: str, path: str) -> dict:
    """بصمة مصدر + ختم حداثته."""
    mtime = datetime.fromtimestamp(os.path.getmtime(path), CAIRO)
    age = max(0, int((now_cairo() - mtime).total_seconds()))
    threshold = STALE_THRESHOLDS.get(source)
    return {
        "source": source,
        "ref": os.path.relpath(path, os.path.expanduser("~")),
        "sha256": sha256_file(path),
        "modified_at": mtime.isoformat(timespec="seconds"),
        "age_seconds": age,
        "stale": bool(threshold is not None and age > threshold),
    }


def canonical(entry: dict) -> str:
    """نفس canonical في ledger.py حرفيًا."""
    return json.dumps(entry, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def entry_hash(prev_hash: str, entry: dict) -> str:
    """نفس entry_hash في ledger.py حرفيًا."""
    payload = {k: v for k, v in entry.items() if k != "hash"}
    return hashlib.sha256((prev_hash + canonical(payload)).encode("utf-8")).hexdigest()


def read_ledger(path: str):
    """يقرأ الليدجر ويتحقق من السلسلة. يعيد (entries, problems)."""
    entries, problems = [], []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as e:
                problems.append(f"سطر {i} تالف JSON: {e}")
    if problems:
        return entries, problems
    prev = GENESIS
    for i, e in enumerate(entries, 1):
        expected_id = f"L-{i:04d}"
        if e.get("id") != expected_id:
            problems.append(f"القيد {i}: المعرف {e.get('id')} ≠ المتوقع {expected_id}")
        if e.get("prev_hash") != prev:
            problems.append(f"القيد {e.get('id')}: prev_hash لا يطابق نهاية السلسلة")
        if entry_hash(prev, e) != e.get("hash"):
            problems.append(f"القيد {e.get('id')}: hash غير مطابق لمحتواه")
        prev = e.get("hash", prev)
    return entries, problems


def is_empty(v) -> bool:
    return v is None or v == "" or v == [] or v == {}


def parse_iso(value):
    """يحوّل نص ISO-8601 إلى datetime واعٍ للمنطقة الزمنية، أو None."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=CAIRO)
    return dt


def validate_records(records: list, now: datetime = None) -> list:
    """فحصنا الداخلي (internal_validation): حقول إلزامية + قواعد نوع + روابط عابرة.

    هذا ليس فاليديتور PGOS الأصلي — إعادة تنفيذ محلية لقواعده كما هي موثقة
    في docs/PGOS-STUDY.md، وتُسمّى باسمها في كل مكان.
    كل نتيجة تحمل problems (تُسقِط السجل) وnotes (ملحوظات لا تُسقِطه —
    مثل الحقول المحذوفة بقائمة السماح).
    """
    if now is None:
        now = now_cairo()
    by_id = {}
    for r in records:
        if isinstance(r, dict):
            by_id.setdefault(r.get("id"), []).append(r)
    project_ids = {r.get("id") for r in records
                   if isinstance(r, dict) and r.get("record_type") == "Project"}
    work_orders = {r.get("id"): r for r in records
                   if isinstance(r, dict) and r.get("record_type") == "WorkOrder"}
    decision_ids = {r.get("id") for r in records
                    if isinstance(r, dict) and r.get("record_type") == "Decision"}

    results = []
    for r in records:
        problems = []
        if not isinstance(r, dict):
            results.append({"id": None, "record_type": None, "ok": False,
                            "problems": ["سجل ليس كائن JSON (قائمة/قيمة مفردة) — "
                                         "لا يُعرض ولا يُحتسب"],
                            "notes": []})
            continue
        rtype = r.get("record_type")
        rid = r.get("id")
        if rtype not in REQUIRED:
            problems.append(f"نوع سجل غير معروف: {rtype!r} — لا يُعرض في أي قسم")
            results.append({"id": rid, "record_type": rtype, "ok": False,
                            "problems": problems, "notes": []})
            continue
        for field in REQUIRED[rtype]:
            if field not in r or is_empty(r.get(field)):
                problems.append(f"حقل إلزامي مفقود أو فارغ: {field}")
        if not isinstance(rid, str) or not ID_RE.match(rid or ""):
            problems.append(f"صيغة id غير مطابقة للنمط: {rid!r}")
        # revision إلزامي فقط للأنواع التي يدرجه جدول PGOS في حقولها الإلزامية
        # (Evidence وRelease وRisk لا يحمل قالبها revision — كما في سجلاتنا الفعلية)
        if "revision" in REQUIRED[rtype]:
            rev = r.get("revision")
            if not isinstance(rev, int) or isinstance(rev, bool) or rev <= 0:
                problems.append(f"revision ليس عددًا صحيحًا موجبًا: {rev!r}")
        if len(by_id.get(rid, [])) > 1:
            problems.append(f"id مكرر في المجموعة: {rid}")

        # قواعد خاصة بكل نوع
        if rtype == "Project":
            owner = r.get("owner") or {}
            if not owner.get("id"):
                problems.append("owner.id مفقود")
            if not isinstance(owner.get("verified"), bool):
                problems.append("owner.verified ليس قيمة منطقية")
            cs = r.get("canonical_sources") or {}
            for key in ("notion", "linear", "github", "runtime"):
                if is_empty(cs.get(key)):
                    problems.append(f"canonical_sources.{key} مفقود أو فارغ")
        elif rtype == "WorkOrder":
            assignee = r.get("assignee") or {}
            if not assignee.get("id"):
                problems.append("assignee.id مفقود")
            if not isinstance(assignee.get("verified"), bool):
                problems.append("assignee.verified ليس قيمة منطقية")
            perm = r.get("permission") or {}
            if perm.get("level") not in PERMISSION_LEVELS:
                problems.append(f"permission.level خارج A0–A4: {perm.get('level')!r}")
            for key in ("actions", "resources", "environment", "expires_at"):
                if is_empty(perm.get(key)):
                    problems.append(f"permission.{key} مفقود أو فارغ")
            # انتهاء صلاحية أمر الشغل — لأي أمر شغل، أيًّا كان مستواه
            # (قاعدة الفاليديتور الأصلي: expires_at ISO-8601 وغير منتهٍ وقت الفحص)
            exp_raw = perm.get("expires_at")
            if not is_empty(exp_raw):
                exp = parse_iso(exp_raw)
                if exp is None:
                    problems.append(
                        f"permission.expires_at ليست بصيغة ISO-8601: {exp_raw!r}")
                elif exp <= now:
                    problems.append(
                        f"permission.expires_at منتهٍ وقت التوليد: {exp_raw}")
            # قاعدة PGOS المركزية (§١.٥/§٣.١): الأفعال عالية الأثر تتطلب
            # A4 + approval_ref حقيقيًا (لا المرجع الشكلي NOT_REQUIRED_FOR_A1)،
            # وأي مستوى A4 بذاته يتطلب مرجع اعتماد حقيقيًا.
            actions = perm.get("actions") or []
            if isinstance(actions, list):
                hi = sorted({a for a in actions if a in HIGH_IMPACT_ACTIONS})
            else:
                hi = []
            eff_ref = perm.get("approval_ref") or r.get("approval_ref")
            ref_is_real = (not is_empty(eff_ref)
                           and eff_ref not in PLACEHOLDER_APPROVAL_REFS)
            if hi and perm.get("level") != "A4":
                problems.append(
                    f"أفعال عالية الأثر {hi} تتطلب permission.level = A4 "
                    f"(الحالي: {perm.get('level')!r})")
            if hi and not ref_is_real:
                problems.append(
                    "أفعال عالية الأثر تتطلب approval_ref حقيقيًا خاصًا بالفعل "
                    "(موجود لا شكليًا)")
            if perm.get("level") == "A4" and not ref_is_real:
                problems.append(
                    "مستوى A4 يتطلب approval_ref حقيقيًا (لا فارغًا ولا شكليًا "
                    "مثل NOT_REQUIRED_FOR_A1)")
            for i, c in enumerate(r.get("acceptance_criteria") or []):
                for key in ("id", "given", "when", "then", "evidence_required"):
                    if is_empty(c.get(key)):
                        problems.append(f"acceptance_criteria[{i}].{key} مفقود أو فارغ")
            if r.get("status") == "APPROVED":
                if is_empty(r.get("approval_ref")) and is_empty(perm.get("approval_ref")):
                    problems.append("حالة APPROVED بلا approval_ref (سجل أو صلاحية)")
                if assignee.get("verified") is not True:
                    problems.append("حالة APPROVED تتطلب assignee.verified = true")
        elif rtype == "Decision":
            if r.get("status") == "APPROVED":
                if is_empty(r.get("decision")):
                    problems.append("حالة APPROVED تتطلب decision غير فارغ")
                if is_empty(r.get("approver_ids")):
                    problems.append("حالة APPROVED تتطلب معتمِدًا واحدًا على الأقل")
        elif rtype == "Risk":
            like, imp = r.get("likelihood"), r.get("impact")
            for name, v in (("likelihood", like), ("impact", imp)):
                if not isinstance(v, int) or isinstance(v, bool) or not (1 <= v <= 5):
                    problems.append(f"{name} خارج النطاق ١–٥: {v!r}")
            if isinstance(like, int) and isinstance(imp, int) and r.get("inherent_score") != like * imp:
                problems.append(
                    f"inherent_score ({r.get('inherent_score')}) ≠ likelihood×impact ({like * imp})")
            res = r.get("residual_score")
            if res is not None and (not isinstance(res, int) or not (1 <= res <= 25)):
                problems.append(f"residual_score خارج النطاق ١–٢٥: {res!r}")
        elif rtype == "Evidence":
            if r.get("result") not in EVIDENCE_RESULTS:
                problems.append(f"result خارج القيم المسموحة: {r.get('result')!r}")
        elif rtype == "Release":
            if r.get("status") not in RELEASE_STATUSES:
                problems.append(f"status خارج حالات الإصدار: {r.get('status')!r}")
            if r.get("status") == "LIVE_VERIFIED":
                for key in ("deployment_receipt", "live_verification"):
                    if is_empty(r.get(key)):
                        problems.append(f"LIVE_VERIFIED يتطلب {key}")

        # روابط عابرة
        if rtype != "Project":
            pid = r.get("project_id")
            if pid and pid not in project_ids:
                problems.append(f"project_id لا يحلّ إلى مشروع موجود: {pid}")
        if rtype in ("Evidence", "Handoff"):
            wo = r.get("work_order_id")
            if wo:
                if wo not in work_orders:
                    problems.append(f"work_order_id لا يحلّ إلى أمر شغل موجود: {wo}")
                elif work_orders[wo].get("project_id") != r.get("project_id"):
                    problems.append(f"work_order_id {wo} من مشروع مختلف")
        if rtype == "Release":
            for wo in r.get("work_order_ids") or []:
                if wo not in work_orders:
                    problems.append(f"work_order_ids يحوي أمر شغل غير موجود: {wo}")
        if rtype == "ChangeRequest":
            ref = r.get("decision_ref")
            if ref and ref not in decision_ids:
                problems.append(f"decision_ref لا يحلّ إلى قرار موجود: {ref}")

        results.append({"id": rid, "record_type": rtype,
                        "ok": not problems, "problems": problems, "notes": []})
    return results


def filter_records(records: list):
    """يُخضع السجلات لقائمة الحقول المسموح بنشرها (FIELD_ALLOWLIST).

    يعيد (سجلات مُرشّحة بالترتيب نفسه, ملحوظات الحذف لكل سجل بالفهرس نفسه).
    الأنواع غير المعروفة تمر كما هي (لا تُعرض أصلًا — تُمسك في التحقق).
    """
    filtered, notes_by_index = [], {}
    for idx, r in enumerate(records):
        if not isinstance(r, dict):
            filtered.append(r)
            continue
        allowed = FIELD_ALLOWLIST.get(r.get("record_type"))
        if allowed is None:
            filtered.append(r)
            continue
        dropped = [k for k in r if k not in allowed]
        if dropped:
            notes_by_index[idx] = [
                f"حقل محذوف من الإخراج المنشور (خارج قائمة السماح لنوع "
                f"{r.get('record_type')}): {k}" for k in sorted(dropped)]
            filtered.append({k: v for k, v in r.items() if k in allowed})
        else:
            filtered.append(r)
    return filtered, notes_by_index


HQ_EXTRACTION_NOTE = "استخراج آلي من نص حر — المرجع الكانوني هو مستند المقر نفسه"


def read_hq_decisions(path: str) -> dict:
    """يقرأ لقطة قرارات المقر النصية ويقسّمها لكتل عند عناوين «— … —».

    اللقطة اختيارية: غيابها أو فراغها = قسم فارغ صادق (available=False)،
    لا انهيار. أول سطرين في الملف ميتا (SNAPSHOT_AT / SOURCE) لا يدخلان الكتل.
    """
    empty = {"available": False, "snapshot_at": None, "source": None,
             "extraction_note": HQ_EXTRACTION_NOTE, "blocks": []}
    if not os.path.exists(path):
        return empty
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if not text.strip():
        return empty
    snapshot_at, source, body_lines = None, None, []
    for line in text.splitlines():
        if line.startswith("SNAPSHOT_AT:"):
            snapshot_at = line.split(":", 1)[1].strip() or None
        elif line.startswith("SOURCE:"):
            source = line.split(":", 1)[1].strip() or None
        else:
            body_lines.append(line)
    blocks, heading, buf = [], None, []

    def flush():
        if heading is not None:
            blocks.append({"heading": heading,
                           "body": "\n".join(buf).strip()})

    for line in body_lines:
        s = line.strip()
        if len(s) > 2 and s.startswith("—") and s.endswith("—"):
            flush()
            heading = s.strip("—").strip()
            buf = []
        elif heading is not None:
            buf.append(line)
    flush()
    return {"available": bool(blocks), "snapshot_at": snapshot_at,
            "source": source, "extraction_note": HQ_EXTRACTION_NOTE,
            "blocks": blocks}


def build_sanitized_data() -> dict:
    """بيانات مصنّعة بالكامل للوضع المُنقّى (--sanitize).

    لا يقرأ أي مصدر حقيقي: كل نص ظاهر موسوم «تجريبي — DEMO»، والأقسام التي
    لا معنى لتمثيلها فارغة بصدق. السجلات التجريبية تمر بنفس التحقق الداخلي
    وقائمة السماح — فتُثبت الواجهة وخط الأنابيب من دون بيان حقيقي واحد.
    """
    gen_at = now_cairo().isoformat(timespec="seconds")
    demo_records = [
        {"record_type": "Project", "id": "PRJ-DEMO-001",
         "name": "مشروع تجريبي — DEMO", "revision": 1, "status": "ACTIVE",
         "owner": {"id": "demo-owner", "verified": False},
         "problem": "بيانات مصنّعة لعرض الواجهة فقط — ليست بيانات شركة حقيقية",
         "outcomes": ["نتيجة تجريبية — DEMO"], "scope": ["نطاق تجريبي — DEMO"],
         "non_goals": ["ليست بيانات حقيقية"], "risk_tier": "LOW",
         "data_classes": ["PUBLIC"],
         "canonical_sources": {"notion": "NOT_APPLICABLE",
                               "linear": "NOT_APPLICABLE",
                               "github": "NOT_APPLICABLE", "runtime": "DEMO"},
         "created_at": "2026-01-01T00:00:00+02:00", "review_date": "2026-12-31"},
        {"record_type": "Decision", "id": "DEC-DEMO-001",
         "project_id": "PRJ-DEMO-001", "revision": 1,
         "title": "قرار تجريبي — DEMO", "status": "PROPOSED",
         "context": "سياق تجريبي — DEMO", "options": ["خيار تجريبي — DEMO"],
         "decision": "قرار تجريبي — DEMO", "rationale": "مبرر تجريبي — DEMO",
         "owner_id": "demo-owner", "approver_ids": ["demo-approver"],
         "effective_at": None},
        {"record_type": "WorkOrder", "id": "WO-DEMO-001",
         "project_id": "PRJ-DEMO-001", "revision": 1,
         "title": "أمر شغل تجريبي — DEMO", "status": "DRAFT",
         "objective": "هدف تجريبي — DEMO", "scope": ["نطاق تجريبي — DEMO"],
         "non_goals": ["ليست بيانات حقيقية"], "owner_id": "demo-owner",
         "assignee": {"id": "demo-agent", "verified": False},
         "permission": {"level": "A1", "actions": ["read_project_docs"],
                        "resources": ["docs/**"], "environment": "local-demo",
                        "expires_at": "2099-01-01T00:00:00+02:00",
                        "approval_ref": "NOT_REQUIRED_FOR_A1"},
         "acceptance_criteria": [
             {"id": "AC-DEMO-1", "given": "تجريبي", "when": "تجريبي",
              "then": "تجريبي", "evidence_required": "DEMO"}],
         "verification_plan": "خطة تحقق تجريبية — DEMO", "risk_tier": "LOW"},
        {"record_type": "Risk", "id": "RSK-DEMO-001",
         "project_id": "PRJ-DEMO-001", "title": "خطر تجريبي — DEMO",
         "description": "وصف خطر تجريبي — DEMO", "likelihood": 1, "impact": 1,
         "inherent_score": 1, "mitigations": ["تخفيف تجريبي — DEMO"],
         "owner_id": "demo-owner", "status": "OPEN"},
        {"record_type": "Evidence", "id": "EVD-DEMO-001",
         "project_id": "PRJ-DEMO-001", "work_order_id": "WO-DEMO-001",
         "criterion_ids": ["AC-DEMO-1"], "exact_revision": "demo-revision",
         "environment": "demo", "scope": "نطاق دليل تجريبي — DEMO",
         "procedure": "إجراء تجريبي — DEMO", "result": "NOT_RUN",
         "producer_id": "demo-producer", "timestamp": gen_at},
    ]
    validation = validate_records(demo_records)
    filtered, dropped_notes = filter_records(demo_records)
    for idx, notes in dropped_notes.items():
        validation[idx]["notes"].extend(notes)
    val_ok = sum(1 for v in validation if v["ok"])
    grouped = {group: [] for group in RECORD_GROUPS.values()}
    for r in filtered:
        group = RECORD_GROUPS.get(r.get("record_type"))
        if group:
            grouped[group].append(r)
    return {
        "meta": {
            "generated_at": gen_at,
            "generator": "pgos-site/tools/generate_data.py --sanitize",
            "sanitized": True,
            "source_files_count": 0,
            "sources_freshness": [],
        },
        "records": grouped,
        "ledger": {"chain_verified": False, "count": 0, "last_id": None,
                   "entries": []},
        "linear": {
            "projects": [{"uuid": "demo-project",
                          "name": "مشروع تجريبي — DEMO", "color": "#95a2b3",
                          "statusName": "DEMO",
                          "sourceFile": "وضع مُنقّى — بيانات مصنّعة"}],
            "issues": [{"uuid": "demo-issue", "identifier": "DEMO-1",
                        "title": "بند تجريبي — DEMO (ليس بندًا حقيقيًا)",
                        "description": "بيانات مصنّعة لإثبات البوابة فقط",
                        "statusName": "Demo", "statusType": "demo",
                        "priorityValue": 0, "dueDate": None, "url": "",
                        "projectUuid": "demo-project", "updatedAt": gen_at}],
        },
        "hq_decisions": {"available": False, "snapshot_at": None,
                         "source": None,
                         "extraction_note": HQ_EXTRACTION_NOTE, "blocks": []},
        "preprod_checklist": {"available": False, "meta": None,
                              "categories": [], "checks": []},
        "governance_ref": {"available": False},
        "guard": {"state": {}, "alerts": []},
        "internal_validation": {
            "kind": "internal_validation",
            "label": "تحقق داخلي بموقع PGOS — ليس فاليديتور PGOS الأصلي",
            "summary": {"total": len(validation), "ok": val_ok,
                        "failed": len(validation) - val_ok},
            "results": validation,
        },
    }


# مصدر المكتب الافتراضي (P2-09): بيانات المشهد من قاعدة اوس نفسها (جداول
# pgos_departments/pgos_employees) عبر قناة SQL — لا من بذرة محلية. مصدر
# اختياري: أي فشل يخليه غائبًا فتسقط الواجهة على البذرة كملاذ أخير فقط.
PGOS_REF = "qkwdyqocazwhojpyifbv"  # teacher-app — مستضيف pgos_ الحالي (المسار ب يعيد التوجيه)


def fetch_office():
    try:
        sys.path.insert(0, os.path.expanduser(
            "~/workspace/custom-connectors/custom.supabase/bin"))
        from supabase_api import call
        q = (
            "select json_build_object("
            "'departments', (select json_agg(row_to_json(d) order by d.sort_order) from "
            "(select id, name, color, sort_order from public.pgos_departments) d), "
            "'employees', (select json_agg(row_to_json(e) order by e.desk) from "
            "(select id, name, role, department_id, desk, status, tools, "
            "current_task, tasks_open, projects, rating from public.pgos_employees) e)"
            ") as office"
        )
        rows = call("POST", f"/v1/projects/{PGOS_REF}/database/query", {"query": q})
        office = rows[0]["office"]
        for d in office["departments"]:
            d.pop("sort_order", None)  # عمود ترتيب داخلي — مش من شكل المشهد
        print(f"  مكتب افتراضي من القاعدة: {len(office['departments'])} قسم / "
              f"{len(office['employees'])} موظف")
        return office
    except Exception as exc:  # مصدر اختياري — لا يقتل التوليد أبدًا
        print(f"  تنبيه: تعذّرت قراءة المكتب من القاعدة ({exc}) — اللقطة بلا مكتب")
        return None


def main() -> int:
    records_dir = os.path.join(OPS, "pgos", "records")
    ledger_path = os.path.join(OPS, "ledger", "company-ledger.jsonl")
    payload_path = os.path.join(OPS, "linear-sync", "payload.json")
    pgos_payload_path = os.path.join(OPS, "linear-sync", "pgos-payload.json")
    hq_snapshot_path = os.path.join(OPS, "hq-decisions-snapshot.txt")
    checklist_path = os.path.join(OPS, "checklist", "preprod-checklist.json")
    gov_ref_path = os.path.join(HERE, "governance_ref.json")
    guard_state_path = os.path.join(OPS, "guard", "state.json")
    guard_alerts_path = os.path.join(OPS, "guard", "alerts.jsonl")

    for p in (records_dir, ledger_path, payload_path, guard_state_path):
        if not os.path.exists(p):
            print(f"مصدر مفقود: {p}", file=sys.stderr)
            return 1

    # ١) الليدجر + التحقق من السلسلة أولًا — أي كسر يوقف كل شيء
    entries, problems = read_ledger(ledger_path)
    if problems:
        print("⛔ سلسلة سجل الشركة مكسورة — أُوقف التوليد ولم يُكتب أي إخراج:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    # ٢) سجلات PGOS
    records, fingerprints = [], {}
    stamps = []
    record_files = sorted(
        os.path.join(records_dir, f) for f in os.listdir(records_dir) if f.endswith(".json"))
    latest_rec_mtime = 0.0
    for path in record_files:
        try:
            with open(path, encoding="utf-8") as f:
                records.append(json.load(f))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            # ملف سجل تالف = إيقاف نظيف برسالة واضحة، لا traceback ولا إخراج جزئي
            print(f"⛔ ملف سجل PGOS تالف — أُوقف التوليد ولم يُكتب أي إخراج:\n"
                  f"  - {os.path.basename(path)}: {e}", file=sys.stderr)
            return 1
        fingerprints[os.path.relpath(path, OPS)] = sha256_file(path)
        latest_rec_mtime = max(latest_rec_mtime, os.path.getmtime(path))
    # التجميع في الأقسام يحدث لاحقًا (قسم ٥) على السجلات المُرشّحة بقائمة
    # السماح — والسجل مجهول النوع لا يدخل أي قسم أصلًا (يُمسك في التحقق).
    rec_stamp = {
        "source": "pgos-records",
        "ref": os.path.relpath(records_dir, os.path.expanduser("~")),
        "files": len(record_files),
        "modified_at": datetime.fromtimestamp(latest_rec_mtime, CAIRO).isoformat(timespec="seconds"),
        "age_seconds": max(0, int((now_cairo() - datetime.fromtimestamp(latest_rec_mtime, CAIRO)).total_seconds())),
        "stale": False,
    }
    rec_stamp["stale"] = rec_stamp["age_seconds"] > STALE_THRESHOLDS["pgos-records"]
    stamps.append(rec_stamp)

    # ٣) بقية المصادر وبصماتها
    fingerprints[os.path.relpath(ledger_path, OPS)] = sha256_file(ledger_path)
    fingerprints[os.path.relpath(payload_path, OPS)] = sha256_file(payload_path)
    fingerprints[os.path.relpath(guard_state_path, OPS)] = sha256_file(guard_state_path)
    stamps.append(stamp("ledger", ledger_path))
    stamps.append(stamp("linear-payload", payload_path))
    stamps.append(stamp("guard", guard_state_path))
    if os.path.exists(guard_alerts_path):
        fingerprints[os.path.relpath(guard_alerts_path, OPS)] = sha256_file(guard_alerts_path)

    # ٣.ب) حمولة Linear — دمج الحمولة الرئيسية مع حمولة مشروع PGOS (إن وُجدت)
    # كل مشروع يُوسم بملف مصدره، والدمج بلا تكرار (بـ uuid).
    with open(payload_path, encoding="utf-8") as f:
        linear_main = json.load(f)
    lin_projects, lin_issues = [], []
    seen_projects, seen_issues = set(), set()

    def merge_payload(payload: dict, source_ref: str):
        for p in payload.get("projects", []):
            p = dict(p)
            p["sourceFile"] = source_ref
            if p.get("uuid") not in seen_projects:
                seen_projects.add(p.get("uuid"))
                lin_projects.append(p)
        for i in payload.get("issues", []):
            if i.get("uuid") not in seen_issues:
                seen_issues.add(i.get("uuid"))
                lin_issues.append(i)

    merge_payload(linear_main, "linear-sync/payload.json")
    if os.path.exists(pgos_payload_path):
        fingerprints[os.path.relpath(pgos_payload_path, OPS)] = sha256_file(pgos_payload_path)
        stamps.append(stamp("linear-payload-pgos", pgos_payload_path))
        with open(pgos_payload_path, encoding="utf-8") as f:
            merge_payload(json.load(f), "linear-sync/pgos-payload.json")
    linear = {"projects": lin_projects, "issues": lin_issues}

    # ٣.ج) لقطة قرارات المقر (اختيارية) + مرجع الحوكمة المحلي
    hq_decisions = read_hq_decisions(hq_snapshot_path)
    if os.path.exists(hq_snapshot_path):
        fingerprints[os.path.relpath(hq_snapshot_path, OPS)] = sha256_file(hq_snapshot_path)
        stamps.append(stamp("hq-decisions", hq_snapshot_path))
    # ٣.د) سجل فحص ما قبل الإنتاج المنظم (اختياري — غيابه قسم فارغ صادق)
    preprod_checklist = {"available": False, "meta": None,
                         "categories": [], "checks": []}
    if os.path.exists(checklist_path):
        fingerprints[os.path.relpath(checklist_path, OPS)] = sha256_file(checklist_path)
        stamps.append(stamp("preprod-checklist", checklist_path))
        with open(checklist_path, encoding="utf-8") as f:
            preprod_checklist = dict(json.load(f))
        preprod_checklist["available"] = True

    governance_ref = {"available": False}
    if os.path.exists(gov_ref_path):
        with open(gov_ref_path, encoding="utf-8") as f:
            governance_ref = dict(json.load(f))
        governance_ref["available"] = True
    with open(guard_state_path, encoding="utf-8") as f:
        guard_state = json.load(f)
    alerts = []
    if os.path.exists(guard_alerts_path):
        with open(guard_alerts_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    alerts.append(json.loads(line))

    # ٤) قيود الليدجر للعرض — بلا البصمات الخام (نتيجة التحقق فقط)
    display_entries = []
    for e in reversed(entries):  # الأحدث أولًا
        item = {k: e[k] for k in ("id", "ts", "type", "project", "title")
                if k in e}
        for k in ("summary", "refs", "legs", "backfilled"):
            if k in e:
                item[k] = e[k]
        display_entries.append(item)

    # ٥) التحقق الداخلي + ترشيح الحقول بقائمة السماح قبل التجميع/الإخراج
    validation = validate_records(records)
    filtered_records, dropped_notes = filter_records(records)
    for idx, notes in dropped_notes.items():
        validation[idx]["notes"].extend(notes)
    val_ok = sum(1 for v in validation if v["ok"])
    grouped = {group: [] for group in RECORD_GROUPS.values()}
    for r in filtered_records:
        if not isinstance(r, dict):
            continue
        group = RECORD_GROUPS.get(r.get("record_type"))
        if group:
            grouped[group].append(r)

    # أختام الحداثة المُخدَّمة: عدّادات وأوقات فقط — بلا بصمات ولا مسارات
    # داخلية (البصمات والمسارات في build-meta.local.json المحلي فقط).
    served_stamps = [
        {k: v for k, v in s.items() if k not in ("ref", "sha256")}
        for s in stamps
    ]

    office = fetch_office()

    data = {
        "meta": {
            "generated_at": now_cairo().isoformat(timespec="seconds"),
            "generator": "pgos-site/tools/generate_data.py",
            "sanitized": False,
            "source_files_count": len(fingerprints),
            "sources_freshness": served_stamps,
        },
        "records": grouped,
        "ledger": {
            "chain_verified": True,
            "count": len(entries),
            "last_id": entries[-1]["id"] if entries else None,
            "entries": display_entries,
        },
        "linear": {
            "projects": linear.get("projects", []),
            "issues": linear.get("issues", []),
        },
        "hq_decisions": hq_decisions,
        "preprod_checklist": preprod_checklist,
        "governance_ref": governance_ref,
        "guard": {
            "state": guard_state,
            "alerts": alerts,
        },
        "office": office,
        "internal_validation": {
            "kind": "internal_validation",
            "label": "تحقق داخلي بموقع PGOS — ليس فاليديتور PGOS الأصلي",
            "summary": {"total": len(validation), "ok": val_ok,
                        "failed": len(validation) - val_ok},
            "results": validation,
        },
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, OUT)  # كتابة ذرّية: لا نصف ملف أبدًا

    # ملف التدقيق المحلي: البصمات الكاملة + أختام بمساراتها — خارج public/
    build_meta = {
        "generated_at": data["meta"]["generated_at"],
        "generator": "pgos-site/tools/generate_data.py",
        "note": "تدقيق محلي فقط — لا يُخدَّم مع الموقع ولا يدخل أي نشر",
        "fingerprints": fingerprints,
        "sources_freshness": stamps,
    }
    btmp = BUILD_META + ".tmp"
    with open(btmp, "w", encoding="utf-8") as f:
        json.dump(build_meta, f, ensure_ascii=False, indent=1)
    os.replace(btmp, BUILD_META)

    print(f"✔ كُتب {os.path.relpath(OUT, SITE_ROOT)}")
    print(f"  ملف التدقيق المحلي: {os.path.basename(BUILD_META)} "
          f"({len(fingerprints)} بصمة مصدر — لا يُخدَّم)")
    print(f"  سجلات PGOS: {len(records)} "
          f"(مشاريع {len(grouped['projects'])} · قرارات {len(grouped['decisions'])} · "
          f"أوامر شغل {len(grouped['work_orders'])} · مخاطر {len(grouped['risks'])} · "
          f"أدلة {len(grouped['evidence'])} · إصدارات {len(grouped['releases'])} · "
          f"تغييرات {len(grouped['changes'])} · تسليمات {len(grouped['handoffs'])} · "
          f"حوادث {len(grouped['incidents'])})")
    print(f"  قيود الليدجر: {len(entries)} — السلسلة سليمة ✔ (آخر قيد {data['ledger']['last_id']})")
    print(f"  بنود Linear: {len(data['linear']['issues'])} في {len(data['linear']['projects'])} مشاريع")
    print(f"  كتل قرارات المقر: {len(hq_decisions['blocks'])} "
          f"(لقطة {hq_decisions['snapshot_at'] or 'غير مؤرخة'})")
    print(f"  فحوصات ما قبل الإنتاج: {len(preprod_checklist['checks'])} "
          f"({'متاح' if preprod_checklist.get('available') else 'غير متاح'})")
    print(f"  مرجع الحوكمة: {'متاح' if governance_ref.get('available') else 'غير متاح'}")
    print(f"  تنبيهات الحارس: {len(alerts)}")
    print(f"  internal_validation: {val_ok}/{len(validation)} سليم")
    for v in validation:
        if not v["ok"]:
            print(f"    ✗ {v['id']}: {'; '.join(v['problems'])}")
    return 0


def main_sanitized() -> int:
    """الوضع المُنقّى: يكتب site-data.json مصنّعًا فقط — بلا أي مصدر حقيقي،
    ولا يلمس build-meta.local.json (تدقيق آخر توليد حقيقي يبقى كما هو)."""
    data = build_sanitized_data()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, OUT)
    v = data["internal_validation"]["summary"]
    print(f"✔ كُتب {os.path.relpath(OUT, SITE_ROOT)} — وضع مُنقّى (--sanitize)")
    print("  بيانات مصنّعة موسومة DEMO فقط — لم يُقرأ أي مصدر حقيقي")
    print(f"  سجلات تجريبية: {v['total']} · internal_validation: "
          f"{v['ok']}/{v['total']} سليم")
    return 0


if __name__ == "__main__":
    if "--sanitize" in sys.argv[1:]:
        sys.exit(main_sanitized())
    sys.exit(main())
