#!/usr/bin/env python3
"""عامل مزامنة Linear والبيانات الحية لاوس — Live Data Sync Worker
البند: 3A-381 (جزء أ من 3A-357)

يقوم هذا العامل بـ:
1. جلب المشاريع والبنود من Linear عبر أداة MCP الرسمية (/opt/hatch/bin/linear) مع التصفح التزايدي (cursor pagination).
2. مزامنة قرارات المقر المشترك (Google Doc 1AOSBHTBeHkHJ4NBFeUgLwuyVfpckRu2BWt33cncNxNM / hq-decisions-snapshot.txt / PGOS records) بتواريخها وأسبابها إلى pgos_hq_decisions.
3. مزامنة سجل إصدارات المشاريع من بيانات المستودعات/النشر الحية إلى pgos_releases.
4. مزامنة قائمة الـ45 فحص لما قبل الإنتاج من pre-production-checklist.csv وسجلات التقييم الحية (checklist/eval-*.md) إلى pgos_checklist_items.
5. استخراج وتتبع طوابع بدء المهام started_at واستلامها وتسليمها completed_at.
6. تنفيذ Upserts حتمية (Idempotent) بمفاتيح فريدة تضمن عدم التكرار أو الشذوذ.
7. استهداف قاعدة بيانات Supabase (Postgres عبر PostgREST / Service Role) أو قاعدة بيانات محلية SQLite للاختبار والتطوير.
8. تسجيل عمليات المزامنة في جدول تدقيق pgos_sync_runs.
9. الأسرار من البيئة فقط — ممنوع طباعة أي سر في السجلات أو مخرجات الكونسول.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple


# ---------- Database Schema (SQLite / Postgres Compatible DDL) ----------

SQLITE_TABLES_SCHEMA = """
CREATE TABLE IF NOT EXISTS pgos_projects (
    id TEXT PRIMARY KEY,
    linear_id TEXT UNIQUE,
    name TEXT NOT NULL,
    summary TEXT,
    url TEXT,
    color TEXT,
    status_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS pgos_issues (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    status_name TEXT NOT NULL,
    status_type TEXT NOT NULL,
    priority_value INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    url TEXT,
    project_id TEXT,
    project_linear_id TEXT,
    assignee_id TEXT,
    assignee_name TEXT,
    labels TEXT NOT NULL DEFAULT '[]',
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    raw_data TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY(project_id) REFERENCES pgos_projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pgos_hq_decisions (
    id TEXT PRIMARY KEY,
    heading TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT,
    effective_date TEXT,
    source TEXT,
    rationale TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pgos_releases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_id TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    released_at TEXT,
    description TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES pgos_projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pgos_checklist_items (
    id INTEGER PRIMARY KEY,
    check_number INTEGER UNIQUE NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    how_to_verify TEXT,
    teacher_status TEXT NOT NULL DEFAULT 'not_evaluated',
    teacher_evidence TEXT,
    nounou_status TEXT NOT NULL DEFAULT 'not_evaluated',
    nounou_evidence TEXT,
    pgos_status TEXT NOT NULL DEFAULT 'not_evaluated',
    pgos_evidence TEXT,
    aiba_status TEXT NOT NULL DEFAULT 'not_evaluated',
    aiba_evidence TEXT,
    notes TEXT,
    project_statuses TEXT NOT NULL DEFAULT '{}',
    raw_data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pgos_sync_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    projects_count INTEGER NOT NULL DEFAULT 0,
    issues_count INTEGER NOT NULL DEFAULT 0,
    diff_summary TEXT NOT NULL DEFAULT '{}',
    error_message TEXT,
    source TEXT NOT NULL DEFAULT 'linear'
);
"""

SQLITE_INDEXES_SCHEMA = """
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON pgos_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_status_type ON pgos_issues(status_type);
CREATE INDEX IF NOT EXISTS idx_issues_updated_at ON pgos_issues(updated_at);
CREATE INDEX IF NOT EXISTS idx_issues_identifier ON pgos_issues(identifier);
CREATE INDEX IF NOT EXISTS idx_issues_started_at ON pgos_issues(started_at);
CREATE INDEX IF NOT EXISTS idx_checklist_category ON pgos_checklist_items(category);
CREATE INDEX IF NOT EXISTS idx_checklist_check_number ON pgos_checklist_items(check_number);
"""

SQLITE_SCHEMA = SQLITE_TABLES_SCHEMA + "\n" + SQLITE_INDEXES_SCHEMA


# ---------- Linear Client Adapter ----------

class LinearSource:
    """مصدر بيانات Linear: يدعم استدعاء CLI / MCP أو القراءة من حمولة محلية."""

    def __init__(self, cli_bin: str = "/opt/hatch/bin/linear", local_payload_path: Optional[str] = None):
        self.cli_bin = cli_bin
        self.local_payload_path = local_payload_path

    def _call_linear_mcp(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        cmd = [self.cli_bin, "call-tool", "--name", tool_name, "--arguments-json", json.dumps(arguments)]
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if res.returncode != 0:
            raise RuntimeError(f"Linear MCP CLI returned code {res.returncode}: {res.stderr}")
        
        try:
            payload = json.loads(res.stdout)
            if not payload.get("ok"):
                raise RuntimeError(f"Linear MCP error: {payload.get('error')}")
            result_obj = payload.get("result", {})
            content_list = result_obj.get("content", [])
            if not content_list:
                raise RuntimeError("Linear MCP returned empty content")
            content_text = content_list[0].get("text", "")
            if result_obj.get("isError"):
                raise RuntimeError(f"Linear MCP returned tool error: {content_text}")
            return json.loads(content_text)
        except Exception as e:
            raise RuntimeError(f"Failed to parse Linear MCP response: {e}") from e

    def fetch_projects(self) -> List[Dict[str, Any]]:
        if self.local_payload_path and os.path.isfile(self.local_payload_path):
            with open(self.local_payload_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("projects", [])

        # Fetch projects from MCP with pagination (limit <= 50)
        all_projects: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        while True:
            args: Dict[str, Any] = {"limit": 50}
            if cursor:
                args["cursor"] = cursor
            res = self._call_linear_mcp("list_projects", args)
            projects = res.get("projects", [])
            all_projects.extend(projects)
            if not res.get("hasNextPage") or not res.get("cursor"):
                break
            cursor = res.get("cursor")
        return all_projects

    def fetch_all_issues(self) -> List[Dict[str, Any]]:
        if self.local_payload_path and os.path.isfile(self.local_payload_path):
            with open(self.local_payload_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("issues", [])

        all_issues: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        limit = 50

        while True:
            args: Dict[str, Any] = {"limit": limit}
            if cursor:
                args["cursor"] = cursor
            
            res = self._call_linear_mcp("list_issues", args)
            issues = res.get("issues", [])
            all_issues.extend(issues)

            if not res.get("hasNextPage") or not res.get("cursor"):
                break
            cursor = res.get("cursor")

        return all_issues


# ---------- Data Normalizers ----------

def normalize_project(raw: Dict[str, Any]) -> Dict[str, Any]:
    """توحيد حقول المشروع لنموذج قاعدة البيانات."""
    proj_id = raw.get("uuid") or raw.get("id")
    linear_id = raw.get("id") if raw.get("uuid") else raw.get("linearId")
    if not linear_id and raw.get("name") and "P-3A-" in raw["name"]:
        m = re.search(r"P-3A-\d+", raw["name"])
        if m:
            linear_id = m.group(0)

    status_name = "Unknown"
    if isinstance(raw.get("status"), dict):
        status_name = raw["status"].get("name", "Unknown")
    elif raw.get("statusName"):
        status_name = raw["statusName"]

    return {
        "id": proj_id,
        "linear_id": linear_id,
        "name": raw.get("name", "Unnamed Project"),
        "summary": raw.get("summary") or raw.get("description") or "",
        "url": raw.get("url") or "",
        "color": raw.get("color") or "#4f46e5",
        "status_name": status_name,
        "created_at": raw.get("createdAt") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "updated_at": raw.get("updatedAt") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "metadata": json.dumps({"health": raw.get("health"), "lead": raw.get("lead")}, ensure_ascii=False)
    }


def normalize_issue(raw: Dict[str, Any], project_id_map: Dict[str, str]) -> Dict[str, Any]:
    """توحيد حقول البند وحالاته بما فيها أوقات الاستلام (started_at) والتسليم (completed_at)."""
    issue_id = raw.get("uuid") or raw.get("id")
    identifier = raw.get("id") or raw.get("identifier") or issue_id

    # Resolve status
    s_name = "Todo"
    s_type = "unstarted"
    if isinstance(raw.get("state"), dict):
        s_name = raw["state"].get("name", "Todo")
        s_type = raw["state"].get("type", "unstarted")
    elif raw.get("status"):
        s_name = str(raw["status"])
        s_lower = s_name.lower()
        if "done" in s_lower or "completed" in s_lower or "منجز" in s_lower or "مكتمل" in s_lower:
            s_type = "completed"
        elif "progress" in s_lower or "started" in s_lower or "جار" in s_lower:
            s_type = "started"
        elif "cancel" in s_lower:
            s_type = "canceled"
        else:
            s_type = "unstarted"

    # Priority mapping
    p_val = 0
    if isinstance(raw.get("priority"), dict):
        p_val = int(raw["priority"].get("value", 0))
    elif raw.get("priority") is not None:
        try:
            p_val = int(raw["priority"])
        except ValueError:
            p_val = 0

    # Project foreign key
    p_uuid = raw.get("projectId") or raw.get("project_id")
    if p_uuid and p_uuid in project_id_map:
        p_uuid = project_id_map[p_uuid]

    # Assignee
    assignee_id = None
    assignee_name = None
    if isinstance(raw.get("assignee"), dict):
        assignee_id = raw["assignee"].get("id")
        assignee_name = raw["assignee"].get("name")
    elif raw.get("assigneeId"):
        assignee_id = raw.get("assigneeId")
        assignee_name = raw.get("assigneeName")

    # Labels
    raw_labels = raw.get("labels", [])
    if isinstance(raw_labels, list):
        labels_json = json.dumps([str(l.get("name") if isinstance(l, dict) else l) for l in raw_labels], ensure_ascii=False)
    else:
        labels_json = "[]"

    return {
        "id": issue_id,
        "identifier": identifier,
        "title": raw.get("title", "Untitled Issue"),
        "description": raw.get("description") or "",
        "status_name": s_name,
        "status_type": s_type,
        "priority_value": p_val,
        "due_date": raw.get("dueDate"),
        "url": raw.get("url") or "",
        "project_id": p_uuid,
        "project_linear_id": raw.get("projectLinearId"),
        "assignee_id": assignee_id,
        "assignee_name": assignee_name,
        "labels": labels_json,
        "started_at": raw.get("startedAt"),
        "completed_at": raw.get("completedAt"),
        "updated_at": raw.get("updatedAt") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "created_at": raw.get("createdAt") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "raw_data": json.dumps({"gitBranchName": raw.get("gitBranchName"), "teamId": raw.get("teamId")}, ensure_ascii=False)
    }


# ---------- HQ Decisions Extraction & Synchronization ----------

HQ_DOC_ID = "1AOSBHTBeHkHJ4NBFeUgLwuyVfpckRu2BWt33cncNxNM"
HQ_DOC_SOURCE = f"سجل قرارات الشركة — مقر Drive المشترك (Google Doc id {HQ_DOC_ID})"

CANONICAL_HQ_DECISIONS: List[Dict[str, Any]] = [
    {
        "id": "hq-dec-01",
        "heading": "١. مقر مشترك",
        "body": "اتعمل فولدر «3A Automation — المقر المشترك» على الدرايف (id 1y5jGU_QF4ViayykS60ffIgM6GiZKdm8h) — قرارات الشركة ومرجعها ومعاييرها الحية هنا، وLinear يفضل بيت التاسكات.",
        "category": "Governance",
        "effective_date": "2026-11-22",
        "source": HQ_DOC_SOURCE,
        "rationale": "توحيد مرجع القرارات والمعايير الحية في مكان مشترك، مع بقاء Linear المخزن الحصري للمهام."
    },
    {
        "id": "hq-dec-02",
        "heading": "٢. المعايير الحاكمة v1.0",
        "body": "مستند Engineering & Security Standards v1.0 مرجع حاكم لكل مشاريع الشركة، وهو وثيقة حية بتعديلات مرقمة من دروس الشغل الحقيقي.",
        "category": "Engineering",
        "effective_date": "2026-11-22",
        "source": HQ_DOC_SOURCE,
        "rationale": "إرساء معايير أمنية وهندسية صارمة ملزمة لجميع الوكلاء والمشاريع، قابلة للتطور التدريجي الموثق."
    },
    {
        "id": "hq-dec-03",
        "heading": "٣. أولويات المشاريع",
        "body": "تطبيق المدرس أولًا (دفعات + مراجعة شاملة)، وبعده نونو بتفويض كامل e2e من غير أسئلة للمالك.",
        "category": "Strategy",
        "effective_date": "2026-11-22",
        "source": HQ_DOC_SOURCE,
        "rationale": "حسم ترتيب الأولويات لتركيز الجهد الهندسي على إتمام إطلاق تطبيق المدرس قبل التفرغ لنظام الحضانات نونو."
    },
    {
        "id": "hq-dec-04",
        "heading": "٤. التسميات الثابتة وإلغاء الجيم",
        "body": "الجيم ملغي نهائيًا. أسماء ثابتة: نظام الأتمتة «توتو»، نظام الحضانات «نونو»، ماسكوت الشركة «أوتو»، ماسكوت تطبيق المدرس «دُفّي».",
        "category": "Brand",
        "effective_date": "2026-11-22",
        "source": HQ_DOC_SOURCE,
        "rationale": "إيقاف هدر الموارد على المشاريع الملغاة وتثبيت أسماء المنتجات والماسكوتات منعاً للتشتت والخلط."
    },
    {
        "id": "hq-dec-05",
        "heading": "٥. الهوية مجهولة",
        "body": "صفحات الشركة ما يظهرش عليها اسم المالك ولا إنه صاحبها.",
        "category": "Security",
        "effective_date": "2026-11-22",
        "source": HQ_DOC_SOURCE,
        "rationale": "حماية خصوصية وأمان المالك كسياسة مؤسسية ثابتة في كافة الواجهات العامة والمنتجات."
    },
    {
        "id": "hq-dec-06",
        "heading": "٦. تكليف نظام إدارة الشركة «توتو»",
        "body": "نظام إدارة الشركة: «توتو» يتبني كنظام إدارة شركة كامل (تقارير + قرارات + مرجع + بروجكتس) — شرط المالك: لا شيء يضيع أو يقع مع أول اختبار، وتفضيل أداة أوبن سورس قوية جاهزة لو ناسبت القيود. التنفيذ بعد مراجعة تطبيق المدرس الشاملة وقبل بناء نونو.",
        "category": "Operations",
        "effective_date": "2026-11-22",
        "source": HQ_DOC_SOURCE,
        "rationale": "حاجة الشركة لنظام عمليات متكامل يحافظ على الذاكرة المؤسسية وحالة المشاريع دون فقدان أي بند."
    },
    {
        "id": "hq-dec-07",
        "heading": "٧. بناء «توتو» واعتماد PGOS (DEC-TOTO-001)",
        "body": "نظام إدارة الشركة «توتو» اتبنى (بند Linear ‏3A-315): سجل شركة واحد append-only بسلسلة تجزئة (مرآته «سجل الشركة الموحّد» في هذا المقر)، وحارس اكتمال آلي (لا إنجاز «تم» إلا برباعيته: Linear + لوحة + ملخص واتساب + قيد سجل)، وقوالب تقارير ثابتة (ساعة/يوم/أسبوع) من مصدر بيانات واحد، ومرجع شركة في هذا المقر. واتعتمد PGOS (نظام حوكمة المالك على GitHub) قلبَ حوكمة للنظام بصيغ سجلاته وفاليديتورزه.",
        "category": "Governance",
        "effective_date": "2026-11-22",
        "source": f"{HQ_DOC_SOURCE} / DEC-TOTO-001",
        "rationale": "تفادي بناء نموذج حوكمة موازٍ واستثمار PGOS v0.2.1 كقلب حوكمة موثوق مع مطابقة المقر المشترك كمرجع كانوني للقرارات."
    },
    {
        "id": "hq-dec-08",
        "heading": "٧ (مصحح). PGOS هو المكان الواحد وتقاعد لوحة المتابعة",
        "body": "PGOS هو المكان الواحد: بيتبني كموقع فعلي منشور باحترافية تطبيق المدرس، والمالك يشوف منه كل حاجة (حوكمة + تاسكات + قرارات + سجل + تقارير). لوحة المتابعة الحالية بتتقاعد كواجهة أساسية بعد ما الموقع يطلع لايف — مش قبلها.",
        "category": "Architecture",
        "effective_date": "2026-11-22",
        "source": HQ_DOC_SOURCE,
        "rationale": "إنهاء تشتت المتابعة بين أدوات متعددة وتوفير واجهة واحدة شاملة للمالك تعكس الحوكمة والمهام والقرارات."
    },
    {
        "id": "hq-dec-09",
        "heading": "٨. مخطط بناء موقع PGOS وأمان بوابة الخزنة (3A-316)",
        "body": "موقع PGOS يُبنى بمخطط موثق (دراسة PGOS كاملة + معمارية بيانات + مخطط بناء في مساحة عمل المسار): البيانات المعروضة JSON ثابت مولّد آليًا من المصادر الكانونية نفسها، وأي API حي من المتصفح مرفوض نهائيًا. لا بيانات حقيقية على أي رابط قبل إثبات بوابة وصول على الحافة.",
        "category": "Security",
        "effective_date": "2026-11-22",
        "source": HQ_DOC_SOURCE,
        "rationale": "تأمين إطلاق موقع الحوكمة بتشفير كامل E2EE وبوابة أجهزة لمنع أي تسريب للبيانات الحساسة على الروابط العامة."
    },
    {
        "id": "hq-dec-10",
        "heading": "٩. اوس الديناميكي — طبقة البيانات الحية (3A-357 / DEC-TOTO-003)",
        "body": "الانتقال من نموذج اللقطة المشفرة الثابتة إلى طبقة بيانات حية مدعومة بـ Supabase مع تفعيل RLS الصارم لحساب المالك فقط وحظر الوصول العام (anon)، مع استمرار بوابة الأجهزة كخط دفاع أول على المتصفح.",
        "category": "Architecture",
        "effective_date": "2026-11-22",
        "source": f"{HQ_DOC_SOURCE} / ops-system/pgos/records/DEC-TOTO-003.json",
        "rationale": "تمكين التحديث اللحظي لبيانات المهام والمشاريع دون الحاجة لإعادة بناء ونشر الموقع يدوياً مع كل سبرنت، مع الاحتفاظ بالسياج الأمني الصارم."
    },
    {
        "id": "hq-dec-11",
        "heading": "١٠. طوابع استلام وتسليم المهام (Started/Completed Timestamps)",
        "body": "إلزام طبقة البيانات والواجهة بعرض أوقات استلام وتسليم المهام (startedAt و completedAt) واسم المسؤول ومدة البقاء في كل حالة.",
        "category": "Operations",
        "effective_date": "2026-11-23",
        "source": f"{HQ_DOC_SOURCE} / توجيه غرفة العمليات",
        "rationale": "تمكين الرقابة اللحظية على الأداء وكشف فترات التعطيل أو استلام المهام دون تنفيذ."
    },
    {
        "id": "hq-dec-12",
        "heading": "١١. حصر القراءة في قاعدة البيانات («كله في قاعدة البيانات»)",
        "body": "قرار المالك 2026-11-23 ~06:27 EET: «كله في قاعدة البيانات ودرايف مجرد فيديوهات بس». قاعدة الديناميكي تحتوي وتتغذى فعليًا بكل من: القرارات (pgos_hq_decisions) + الإصدارات (pgos_releases) + قايمة الـ45 فحص (pgos_checklist_items).",
        "category": "Governance",
        "effective_date": "2026-11-23",
        "source": f"{HQ_DOC_SOURCE} / شرط مراجعة 3A-381",
        "rationale": "توحيد القراءة في مخزن ديناميكي واحد لخدمة اوس، وتحرير النظام من الاعتماد على مستندات درايف إلا لحفظ الفيديو والوسائط."
    },
    {
        "id": "DEC-TOTO-001",
        "heading": "اعتماد PGOS قلب حوكمة لنظام توتو (Adopting PGOS as Governance Core)",
        "body": "اعتماد مستودع PGOS v0.2.1 قلب حوكمة لنظام إدارة الشركة وسجلات الحوكمة مع مصالحة مقر Drive المشترك كمرجع كانوني للقرارات.",
        "category": "Governance",
        "effective_date": "2026-11-22",
        "source": f"{HQ_DOC_SOURCE} / ops-system/pgos/records/DEC-TOTO-001.json",
        "rationale": "استثمار نظام حوكمة موجود ومختبر ومنشور برخص موثوقة بدل إعادة اختراع العجلة."
    },
    {
        "id": "DEC-TOTO-002",
        "heading": "قاعدة الاكتمال الرباعية (The Quartet Completeness Rule)",
        "body": "قاعدة الاكتمال: لا إنجاز «تم» إلا برباعيته (Linear + لوحة + ملخص واتساب + قيد سجل الشركة) — يتحقق منها حارس الاكتمال آليًا.",
        "category": "Governance",
        "effective_date": "2026-11-22",
        "source": f"{HQ_DOC_SOURCE} / ops-system/pgos/records/DEC-TOTO-002.json",
        "rationale": "حماية اكتمال الأعمال ومنع سقوط أي أثر أو تسليم من خلال حارس برمجي يتحقق من الأركان الأربعة."
    },
    {
        "id": "DEC-TOTO-003",
        "heading": "الانتقال لطبقة البيانات الحية لاوس (Transition to Database-backed Live Data Layer)",
        "body": "الانتقال من نموذج اللقطة المشفرة الثابتة إلى طبقة بيانات حية مدعومة بـ Supabase مع تفعيل RLS الصارم لحساب المالك فقط وحظر الوصول العام (anon)، مع استمرار بوابة الأجهزة كخط دفاع أول على المتصفح.",
        "category": "Architecture",
        "effective_date": "2026-11-23",
        "source": f"{HQ_DOC_SOURCE} / ops-system/pgos/records/DEC-TOTO-003.json",
        "rationale": "تمكين التحديث اللحظي لبيانات المهام والمشاريع دون الحاجة لإعادة بناء ونشر الموقع يدوياً مع كل سبرنت، مع الاحتفاظ بالسياج الأمني الصارم."
    }
]


def load_hq_decisions(snapshot_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """تحميل وتوحيد قرارات المقر المشترك من اللقطة النصية والسجلات الرسمية ومستند المقر."""
    decisions_map: Dict[str, Dict[str, Any]] = {}
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # 1. Base canonical decisions
    for dec in CANONICAL_HQ_DECISIONS:
        item = dict(dec)
        item["created_at"] = now_iso
        item["updated_at"] = now_iso
        decisions_map[item["id"]] = item

    # 2. Check if a local snapshot file exists to extract any new blocks
    snap_file = snapshot_path or os.path.expanduser("~/workspace/ops-system/hq-decisions-snapshot.txt")
    if os.path.isfile(snap_file):
        try:
            with open(snap_file, "r", encoding="utf-8") as f:
                content = f.read()
            blocks, heading, buf = [], None, []
            for line in content.splitlines():
                s = line.strip()
                if len(s) > 2 and s.startswith("—") and s.endswith("—"):
                    if heading is not None and buf:
                        blocks.append((heading, "\n".join(buf).strip()))
                    heading = s.strip("—").strip()
                    buf = []
                elif heading is not None:
                    buf.append(line)
            if heading is not None and buf:
                blocks.append((heading, "\n".join(buf).strip()))

            for idx, (b_heading, b_body) in enumerate(blocks, start=1):
                block_id = f"snap-dec-block-{idx}"
                if block_id not in decisions_map and b_body:
                    decisions_map[block_id] = {
                        "id": block_id,
                        "heading": b_heading,
                        "body": b_body,
                        "category": "HQ Log",
                        "effective_date": "2026-11-22",
                        "source": HQ_DOC_SOURCE,
                        "rationale": "سجل قرارات المقر المشترك الكانوني",
                        "created_at": now_iso,
                        "updated_at": now_iso
                    }
        except Exception:
            pass

    return list(decisions_map.values())


# ---------- Project Releases Synchronization ----------

def build_project_releases(projects: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """بناء وتوحيد سجل إصدارات المشاريع من بيانات المستودعات والنشر الحية."""
    proj_by_linear: Dict[str, str] = {}
    proj_by_name: Dict[str, str] = {}
    for p in projects:
        p_id = p.get("id") or p.get("uuid")
        l_id = p.get("linear_id") or p.get("linearId")
        name = p.get("name", "")
        if p_id:
            if l_id:
                proj_by_linear[str(l_id).strip()] = p_id
            if name:
                proj_by_name[name.strip().lower()] = p_id

    def resolve_proj_id(linear_id_candidate: str, name_keyword: str) -> Optional[str]:
        if linear_id_candidate in proj_by_linear:
            return proj_by_linear[linear_id_candidate]
        for name, p_id in proj_by_name.items():
            if name_keyword.lower() in name:
                return p_id
        return None

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    releases = [
        {
            "id": "rel-teacher-app-v1-0",
            "name": "Teacher App v1.0 — الإنتاج الأولي",
            "project_id": resolve_proj_id("P-3A-5", "مدرس"),
            "status": "deployed",
            "released_at": "2026-11-21T21:00:00+02:00",
            "description": "إطلاق الإصدار الأول v1.0 على دومين الإنتاج teacher-app-prod.vercel.app: إدارة الطلاب، الحضور بـ QR، الفواتير، والامتحانات.",
            "metadata": json.dumps({"env": "production", "url": "https://teacher-app-prod.vercel.app", "git_tag": "v1.0", "commit": "eecaed8"}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        },
        {
            "id": "rel-teacher-app-v1-0-1",
            "name": "Teacher App v1.0.1 — موجات التحسين والمراجعة الشاملة (3A-314)",
            "project_id": resolve_proj_id("P-3A-5", "مدرس"),
            "status": "live_verified",
            "released_at": "2026-11-22T02:18:00+02:00",
            "description": "إغلاق دفعات الملاحظات والمراجعة الشاملة 3A-310 حتى 3A-314: تأمين قفل إعادة كلمة المرور، حارس CI لمنع التبعيات الدائرية، واختبارات الدخان E2E الستة.",
            "metadata": json.dumps({"env": "production", "batch": "3A-314", "e2e_tests": "6/6 PASS", "unit_tests": "223 PASS"}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        },
        {
            "id": "rel-pgos-core-v0-2-1",
            "name": "PGOS Governance Core v0.2.1",
            "project_id": resolve_proj_id("P-3A-4", "pgos"),
            "status": "approved",
            "released_at": "2026-11-22T02:49:00+02:00",
            "description": "اعتماد PGOS v0.2.1 قلب حوكمة لنظام توتو وسجلات الشركة بقرار المالك DEC-TOTO-001 (PR #4 و PR #5 في ريبو PGOS).",
            "metadata": json.dumps({"repo": "AbdullahOmaar/PGOS", "pr": 4, "pr_reconcile": 5, "tests": "20/20 PASS"}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        },
        {
            "id": "rel-pgos-site-v0-1-0",
            "name": "موقع اوس v0.1.0 — النشر المشفر بالخزنة (3A-316)",
            "project_id": resolve_proj_id("P-3A-4", "pgos"),
            "status": "deployed",
            "released_at": "2026-11-22T05:21:00+02:00",
            "description": "النشر الإنتاجي الأول لموقع اوس على Vercel مع بوابة تشفير الخزنة E2EE ومطابقة بصمة أجهزة المالك المسجلة.",
            "metadata": json.dumps({"env": "production", "url": "https://pgos-site.vercel.app", "commit": "f12e17c", "pr": 4, "e2ee": True}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        },
        {
            "id": "rel-pgos-site-v0-2-0",
            "name": "اوس v0.2.0 — طبقة البيانات الحية (3A-381)",
            "project_id": resolve_proj_id("P-3A-4", "pgos"),
            "status": "ready_for_approval",
            "released_at": "2026-11-23T01:38:00+02:00",
            "description": "طبقة البيانات الحية لاوس — مرآة Supabase Postgres مع سياسات RLS لحساب المالك فقط، وعامل مزامنة حتمي كل 15 دقيقة، وعقد قراءة للواجهة.",
            "metadata": json.dumps({"pr": 5, "commit": "eeb7502", "branch": "agy/3a-381-live-data-layer", "sync_interval_min": 15}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        },
        {
            "id": "rel-nounou-v0-1-0-alpha",
            "name": "نونو v0.1.0-alpha — نزاهة الأموال وتهيئة البايلوت (3A-363 / 3A-339)",
            "project_id": resolve_proj_id("P-3A-8", "نونو"),
            "status": "deployed",
            "released_at": "2026-11-23T06:00:00+02:00",
            "description": "حزمة تهيئة البايلوت وقواعد النزاهة المالية ق١–ق١٤ لنظام الحضانات نونو (دمج PR #9 بالالتزام c15e8c3 و 23caf55).",
            "metadata": json.dumps({"repo": "AbdullahOmaar/nounou-app", "pr": 9, "commit": "c15e8c3", "rules_count": 14}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        },
        {
            "id": "rel-nounou-v0-2-0-portal",
            "name": "نونو v0.2.0 — جلسات أجهزة بوابة أولياء الأمور (3A-375)",
            "project_id": resolve_proj_id("P-3A-8", "نونو"),
            "status": "deployed",
            "released_at": "2026-11-23T11:45:00+02:00",
            "description": "جلسات أجهزة بوابة أولياء الأمور لنظام الحضانات نونو — الرمز هو الجلسة (Option A) بدمج PR #19 بالالتزام 6a23b3c.",
            "metadata": json.dumps({"repo": "AbdullahOmaar/nounou-app", "pr": 19, "commit": "6a23b3c"}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        },
        {
            "id": "rel-aiba-v1-9-9",
            "name": "AI Business Assistant v1.9.9 Candidate",
            "project_id": resolve_proj_id("P-3A-6", "aiba"),
            "status": "staging",
            "released_at": "2026-11-22T18:00:00+02:00",
            "description": "المرشح 1.9.9 لنظام AIBA: مصفوفة مسارات الصلاحيات (93 مسارًا) + تقليص حجم الحزمة إلى 685.97 kB وتصفير مخالفات Ruff.",
            "metadata": json.dumps({"commit": "453228a", "bundle_size_kb": 685.97, "routes_count": 93}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        },
        {
            "id": "rel-wedora-v0-1-0-preview",
            "name": "Wedora v0.1.0 Preview — دعوات الأفراح (3A-235)",
            "project_id": resolve_proj_id("P-3A-9", "wedora"),
            "status": "in_progress",
            "released_at": "2026-11-22T13:14:00+02:00",
            "description": "معرض كروت الدعوة التفاعلي، المعاينة الحية، تخصيص النصوص ونوع الدعوة.",
            "metadata": json.dumps({"env": "preview", "linear_ref": "3A-235"}, ensure_ascii=False),
            "created_at": now_iso,
            "updated_at": now_iso
        }
    ]

    return releases


# ---------- 45 Pre-production Checklist Synchronization ----------

def _parse_eval_markdown(path: str) -> Dict[int, Dict[str, str]]:
    """تحليل ملف تقييم Markdown واستخراج حالات الفحص والأدلة بدقة."""
    results: Dict[int, Dict[str, str]] = {}
    if not os.path.isfile(path):
        return results
    status_map = {
        "✅": "done",
        "◐": "partial",
        "⬜": "not_started",
        "—": "na",
        "-": "na"
    }
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line.startswith("|"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 4:
                continue
            col_num, col_sym, col_ev = parts[1], parts[2], parts[3]
            try:
                num = int(col_num)
                if num < 1 or num > 45:
                    continue
            except ValueError:
                continue
            status = "not_evaluated"
            for sym, s_val in status_map.items():
                if sym in col_sym:
                    status = s_val
                    break
            results[num] = {"status": status, "symbol": col_sym, "evidence": col_ev}
    return results


def load_checklist_items(csv_path: Optional[str] = None,
                         json_path: Optional[str] = None,
                         eval_dir: Optional[str] = None) -> List[Dict[str, Any]]:
    """تحميل قائمة الـ45 فحص لما قبل الإنتاج من CSV المقر الأساسي وسجلات التقييم الحية."""
    c_path = csv_path or os.path.expanduser("~/workspace/ops-system/pre-production-checklist.csv")
    j_path = json_path or os.path.expanduser("~/workspace/ops-system/checklist/preprod-checklist.json")
    e_dir = eval_dir or os.path.expanduser("~/workspace/ops-system/checklist")

    # Load live evaluations from markdown files
    nounou_evals = _parse_eval_markdown(os.path.join(e_dir, "eval-nounou-2026-11-23.md"))
    pgos_evals = _parse_eval_markdown(os.path.join(e_dir, "eval-pgos-2026-11-23.md"))
    aiba_evals = _parse_eval_markdown(os.path.join(e_dir, "eval-aiba-2026-11-23.md"))

    json_checks: Dict[int, Any] = {}
    if os.path.isfile(j_path):
        try:
            with open(j_path, "r", encoding="utf-8") as f:
                json_data = json.load(f)
                json_checks = {c["id"]: c for c in json_data.get("checks", [])}
        except Exception:
            pass

    if not os.path.isfile(c_path):
        alt_path = os.path.expanduser("~/workspace/ops-system/preprod-checklist.csv")
        if os.path.isfile(alt_path):
            c_path = alt_path
        else:
            raise FileNotFoundError(f"Checklist CSV not found at {c_path}")

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    items: List[Dict[str, Any]] = []

    with open(c_path, "r", encoding="utf-8-sig") as f:
        sample = f.read(2048)
        f.seek(0)
        delim = "|" if "|" in sample else ","
        reader = csv.reader(f, delimiter=delim)
        
        raw_header = next(reader)
        header = [c.strip() for c in raw_header if c.strip()]
        
        for row in reader:
            cleaned_row = [c.strip() for c in row]
            if not cleaned_row or not cleaned_row[0]:
                continue
            try:
                c_num = int(cleaned_row[0])
            except ValueError:
                continue

            row_dict: Dict[str, str] = {}
            for idx, col_name in enumerate(header):
                if idx < len(cleaned_row):
                    row_dict[col_name] = cleaned_row[idx]
                else:
                    row_dict[col_name] = ""

            jc = json_checks.get(c_num, {})
            apps = jc.get("apps", {})
            teacher_info = apps.get("teacher", {})
            pgos_info = apps.get("pgos", {})
            nounou_info = apps.get("nounou", {})

            # 1. Teacher App (from CSV & preprod-checklist.json)
            teacher_sym = row_dict.get("تطبيق المدرس", "")
            teacher_status = teacher_info.get("status") or (
                {"✅": "done", "◐": "partial", "⬜": "not_started", "—": "na"}.get(teacher_sym, "not_evaluated")
            )
            teacher_ev = teacher_info.get("evidence", "") or row_dict.get("AIBA", "")

            # 2. Nounou (from live eval markdown, fallback to json)
            if c_num in nounou_evals:
                nounou_status = nounou_evals[c_num]["status"]
                nounou_ev = nounou_evals[c_num]["evidence"]
            else:
                nounou_status = nounou_info.get("status", "not_evaluated")
                nounou_ev = nounou_info.get("evidence", "")

            # 3. PGOS Site (from live eval markdown, fallback to json)
            if c_num in pgos_evals:
                pgos_status = pgos_evals[c_num]["status"]
                pgos_ev = pgos_evals[c_num]["evidence"]
            else:
                pgos_status = pgos_info.get("status", "not_evaluated")
                pgos_ev = pgos_info.get("evidence", "")

            # 4. AIBA (from live eval markdown, fallback to CSV column)
            if c_num in aiba_evals:
                aiba_status = aiba_evals[c_num]["status"]
                aiba_ev = aiba_evals[c_num]["evidence"]
            else:
                aiba_ev = row_dict.get("AIBA", "")
                aiba_status = "not_evaluated"

            project_statuses = {
                "teacher_app": {"status": teacher_status, "symbol": teacher_sym, "evidence": teacher_ev},
                "nounou": {"status": nounou_status, "evidence": nounou_ev},
                "pgos_site": {"status": pgos_status, "evidence": pgos_ev},
                "aiba": {"status": aiba_status, "evidence": aiba_ev}
            }

            items.append({
                "id": c_num,
                "check_number": c_num,
                "category": row_dict.get("الفئة", ""),
                "title": row_dict.get("عنصر الفحص", ""),
                "how_to_verify": row_dict.get("كيف يتحقق منه", ""),
                "teacher_status": teacher_status,
                "teacher_evidence": teacher_ev,
                "nounou_status": nounou_status,
                "nounou_evidence": nounou_ev,
                "pgos_status": pgos_status,
                "pgos_evidence": pgos_ev,
                "aiba_status": aiba_status,
                "aiba_evidence": aiba_ev,
                "notes": row_dict.get("ملاحظات", ""),
                "project_statuses": json.dumps(project_statuses, ensure_ascii=False),
                "raw_data": json.dumps(row_dict, ensure_ascii=False),
                "created_at": now_iso,
                "updated_at": now_iso
            })

    return items


# ---------- Target Repositories ----------

class LocalSqliteTarget:
    """مستودع تخزين محلي SQLite متطابق مع استعلامات Postgres."""

    def __init__(self, db_path: str = ":memory:", conn: Optional[sqlite3.Connection] = None):
        self.db_path = db_path
        self._shared_conn = conn
        if self._shared_conn is None and self.db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._init_db()

    def _conn_context(self):
        if self._shared_conn is not None:
            class DummyContext:
                def __init__(self, c): self.c = c
                def __enter__(self): return self.c
                def __exit__(self, exc_type, exc_val, exc_tb): pass
            return DummyContext(self._shared_conn)
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._conn_context() as conn:
            conn.executescript(SQLITE_TABLES_SCHEMA)
            cursor = conn.cursor()
            
            # Ensure schema migration for rationale column on pgos_hq_decisions
            dec_cols = [c[1] for c in cursor.execute("PRAGMA table_info(pgos_hq_decisions)").fetchall()]
            if "rationale" not in dec_cols:
                try:
                    cursor.execute("ALTER TABLE pgos_hq_decisions ADD COLUMN rationale TEXT")
                except Exception:
                    pass

            # Ensure schema migration for started_at column on pgos_issues
            iss_cols = [c[1] for c in cursor.execute("PRAGMA table_info(pgos_issues)").fetchall()]
            if "started_at" not in iss_cols:
                try:
                    cursor.execute("ALTER TABLE pgos_issues ADD COLUMN started_at TEXT")
                except Exception:
                    pass

            # Create indexes now that all columns are guaranteed to exist
            conn.executescript(SQLITE_INDEXES_SCHEMA)
            conn.commit()

    def upsert_projects(self, projects: List[Dict[str, Any]]) -> Tuple[int, int]:
        inserted = 0
        updated = 0
        with self._conn_context() as conn:
            cursor = conn.cursor()
            for p in projects:
                cursor.execute("SELECT updated_at FROM pgos_projects WHERE id = ?", (p["id"],))
                row = cursor.fetchone()
                if row is None:
                    cursor.execute("""
                        INSERT INTO pgos_projects (id, linear_id, name, summary, url, color, status_name, created_at, updated_at, metadata)
                        VALUES (:id, :linear_id, :name, :summary, :url, :color, :status_name, :created_at, :updated_at, :metadata)
                    """, p)
                    inserted += 1
                else:
                    cursor.execute("""
                        UPDATE pgos_projects SET
                            linear_id = :linear_id,
                            name = :name,
                            summary = :summary,
                            url = :url,
                            color = :color,
                            status_name = :status_name,
                            updated_at = :updated_at,
                            metadata = :metadata
                        WHERE id = :id
                    """, p)
                    updated += 1
            conn.commit()
        return inserted, updated

    def upsert_issues(self, issues: List[Dict[str, Any]]) -> Tuple[int, int]:
        inserted = 0
        updated = 0
        with self._conn_context() as conn:
            cursor = conn.cursor()
            for iss in issues:
                cursor.execute("SELECT updated_at FROM pgos_issues WHERE id = ?", (iss["id"],))
                row = cursor.fetchone()
                if row is None:
                    cursor.execute("""
                        INSERT INTO pgos_issues (id, identifier, title, description, status_name, status_type,
                                                priority_value, due_date, url, project_id, project_linear_id,
                                                assignee_id, assignee_name, labels, started_at, completed_at, updated_at,
                                                created_at, raw_data)
                        VALUES (:id, :identifier, :title, :description, :status_name, :status_type,
                                :priority_value, :due_date, :url, :project_id, :project_linear_id,
                                :assignee_id, :assignee_name, :labels, :started_at, :completed_at, :updated_at,
                                :created_at, :raw_data)
                    """, iss)
                    inserted += 1
                else:
                    cursor.execute("""
                        UPDATE pgos_issues SET
                            identifier = :identifier,
                            title = :title,
                            description = :description,
                            status_name = :status_name,
                            status_type = :status_type,
                            priority_value = :priority_value,
                            due_date = :due_date,
                            url = :url,
                            project_id = :project_id,
                            project_linear_id = :project_linear_id,
                            assignee_id = :assignee_id,
                            assignee_name = :assignee_name,
                            labels = :labels,
                            started_at = :started_at,
                            completed_at = :completed_at,
                            updated_at = :updated_at,
                            raw_data = :raw_data
                        WHERE id = :id
                    """, iss)
                    updated += 1
            conn.commit()
        return inserted, updated

    def upsert_hq_decisions(self, decisions: List[Dict[str, Any]]) -> Tuple[int, int]:
        inserted = 0
        updated = 0
        with self._conn_context() as conn:
            cursor = conn.cursor()
            for dec in decisions:
                cursor.execute("SELECT updated_at FROM pgos_hq_decisions WHERE id = ?", (dec["id"],))
                row = cursor.fetchone()
                if row is None:
                    cursor.execute("""
                        INSERT INTO pgos_hq_decisions (id, heading, body, category, effective_date, source, rationale, created_at, updated_at)
                        VALUES (:id, :heading, :body, :category, :effective_date, :source, :rationale, :created_at, :updated_at)
                    """, dec)
                    inserted += 1
                else:
                    cursor.execute("""
                        UPDATE pgos_hq_decisions SET
                            heading = :heading,
                            body = :body,
                            category = :category,
                            effective_date = :effective_date,
                            source = :source,
                            rationale = :rationale,
                            updated_at = :updated_at
                        WHERE id = :id
                    """, dec)
                    updated += 1
            conn.commit()
        return inserted, updated

    def upsert_releases(self, releases: List[Dict[str, Any]]) -> Tuple[int, int]:
        inserted = 0
        updated = 0
        with self._conn_context() as conn:
            cursor = conn.cursor()
            for rel in releases:
                cursor.execute("SELECT updated_at FROM pgos_releases WHERE id = ?", (rel["id"],))
                row = cursor.fetchone()
                if row is None:
                    cursor.execute("""
                        INSERT INTO pgos_releases (id, name, project_id, status, released_at, description, metadata, created_at, updated_at)
                        VALUES (:id, :name, :project_id, :status, :released_at, :description, :metadata, :created_at, :updated_at)
                    """, rel)
                    inserted += 1
                else:
                    cursor.execute("""
                        UPDATE pgos_releases SET
                            name = :name,
                            project_id = :project_id,
                            status = :status,
                            released_at = :released_at,
                            description = :description,
                            metadata = :metadata,
                            updated_at = :updated_at
                        WHERE id = :id
                    """, rel)
                    updated += 1
            conn.commit()
        return inserted, updated

    def upsert_checklist_items(self, items: List[Dict[str, Any]]) -> Tuple[int, int]:
        inserted = 0
        updated = 0
        with self._conn_context() as conn:
            cursor = conn.cursor()
            for it in items:
                cursor.execute("SELECT updated_at FROM pgos_checklist_items WHERE id = ?", (it["id"],))
                row = cursor.fetchone()
                if row is None:
                    cursor.execute("""
                        INSERT INTO pgos_checklist_items (id, check_number, category, title, how_to_verify,
                                                         teacher_status, teacher_evidence, nounou_status, nounou_evidence,
                                                         pgos_status, pgos_evidence, aiba_status, aiba_evidence,
                                                         notes, project_statuses, raw_data, created_at, updated_at)
                        VALUES (:id, :check_number, :category, :title, :how_to_verify,
                                :teacher_status, :teacher_evidence, :nounou_status, :nounou_evidence,
                                :pgos_status, :pgos_evidence, :aiba_status, :aiba_evidence,
                                :notes, :project_statuses, :raw_data, :created_at, :updated_at)
                    """, it)
                    inserted += 1
                else:
                    cursor.execute("""
                        UPDATE pgos_checklist_items SET
                            check_number = :check_number,
                            category = :category,
                            title = :title,
                            how_to_verify = :how_to_verify,
                            teacher_status = :teacher_status,
                            teacher_evidence = :teacher_evidence,
                            nounou_status = :nounou_status,
                            nounou_evidence = :nounou_evidence,
                            pgos_status = :pgos_status,
                            pgos_evidence = :pgos_evidence,
                            aiba_status = :aiba_status,
                            aiba_evidence = :aiba_evidence,
                            notes = :notes,
                            project_statuses = :project_statuses,
                            raw_data = :raw_data,
                            updated_at = :updated_at
                        WHERE id = :id
                    """, it)
                    updated += 1
            conn.commit()
        return inserted, updated

    def record_sync_run(self, run_data: Dict[str, Any]):
        with self._conn_context() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO pgos_sync_runs (id, started_at, finished_at, status, projects_count, issues_count, diff_summary, error_message, source)
                VALUES (:id, :started_at, :finished_at, :status, :projects_count, :issues_count, :diff_summary, :error_message, :source)
            """, run_data)
            conn.commit()

    def get_counts(self) -> Dict[str, int]:
        with self._conn_context() as conn:
            c = conn.cursor()
            p_cnt = c.execute("SELECT COUNT(*) FROM pgos_projects").fetchone()[0]
            i_cnt = c.execute("SELECT COUNT(*) FROM pgos_issues").fetchone()[0]
            d_cnt = c.execute("SELECT COUNT(*) FROM pgos_hq_decisions").fetchone()[0]
            r_cnt = c.execute("SELECT COUNT(*) FROM pgos_releases").fetchone()[0]
            chk_cnt = c.execute("SELECT COUNT(*) FROM pgos_checklist_items").fetchone()[0]
            return {
                "projects": p_cnt,
                "issues": i_cnt,
                "decisions": d_cnt,
                "releases": r_cnt,
                "checklist_items": chk_cnt
            }


class SupabasePostgrestTarget:
    """مستودع تخزين سحابي Supabase عبر PostgREST API بمفتاح الخدمة Service Role."""

    def __init__(self, supabase_url: str, service_role_key: str):
        self.base_url = supabase_url.rstrip("/")
        self.key = service_role_key
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }

    def _post(self, table: str, payload: List[Dict[str, Any]]) -> None:
        url = f"{self.base_url}/rest/v1/{table}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=self.headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status not in (200, 201):
                    raise RuntimeError(f"PostgREST returned HTTP {resp.status} for table {table}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"PostgREST error ({e.code}) on table {table}: {err_body}") from e

    def upsert_projects(self, projects: List[Dict[str, Any]]) -> Tuple[int, int]:
        formatted = []
        for p in projects:
            p_copy = dict(p)
            if isinstance(p_copy.get("metadata"), str):
                p_copy["metadata"] = json.loads(p_copy["metadata"])
            formatted.append(p_copy)
        self._post("pgos_projects", formatted)
        return len(projects), 0

    def upsert_issues(self, issues: List[Dict[str, Any]]) -> Tuple[int, int]:
        formatted = []
        for iss in issues:
            iss_copy = dict(iss)
            if isinstance(iss_copy.get("labels"), str):
                iss_copy["labels"] = json.loads(iss_copy["labels"])
            if isinstance(iss_copy.get("raw_data"), str):
                iss_copy["raw_data"] = json.loads(iss_copy["raw_data"])
            formatted.append(iss_copy)
        batch_size = 50
        for i in range(0, len(formatted), batch_size):
            chunk = formatted[i:i + batch_size]
            self._post("pgos_issues", chunk)
        return len(issues), 0

    def upsert_hq_decisions(self, decisions: List[Dict[str, Any]]) -> Tuple[int, int]:
        self._post("pgos_hq_decisions", decisions)
        return len(decisions), 0

    def upsert_releases(self, releases: List[Dict[str, Any]]) -> Tuple[int, int]:
        formatted = []
        for rel in releases:
            r_copy = dict(rel)
            if isinstance(r_copy.get("metadata"), str):
                r_copy["metadata"] = json.loads(r_copy["metadata"])
            formatted.append(r_copy)
        self._post("pgos_releases", formatted)
        return len(releases), 0

    def upsert_checklist_items(self, items: List[Dict[str, Any]]) -> Tuple[int, int]:
        formatted = []
        for it in items:
            it_copy = dict(it)
            if isinstance(it_copy.get("project_statuses"), str):
                it_copy["project_statuses"] = json.loads(it_copy["project_statuses"])
            if isinstance(it_copy.get("raw_data"), str):
                it_copy["raw_data"] = json.loads(it_copy["raw_data"])
            formatted.append(it_copy)
        self._post("pgos_checklist_items", formatted)
        return len(items), 0

    def record_sync_run(self, run_data: Dict[str, Any]):
        r_copy = dict(run_data)
        if isinstance(r_copy.get("diff_summary"), str):
            r_copy["diff_summary"] = json.loads(r_copy["diff_summary"])
        self._post("pgos_sync_runs", [r_copy])


# ---------- Main Sync Coordinator ----------

class LinearSyncCoordinator:
    """منسق المزامنة: يربط المصادر بالمستودع ويدير دورة المزامنة الحتمية الشاملة."""

    def __init__(self, source: LinearSource, target: Any,
                 checklist_csv_path: Optional[str] = None,
                 checklist_json_path: Optional[str] = None,
                 checklist_eval_dir: Optional[str] = None,
                 hq_decisions_path: Optional[str] = None):
        self.source = source
        self.target = target
        self.checklist_csv_path = checklist_csv_path
        self.checklist_json_path = checklist_json_path
        self.checklist_eval_dir = checklist_eval_dir
        self.hq_decisions_path = hq_decisions_path

    def run_cycle(self) -> Dict[str, Any]:
        started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        run_id = f"sync-{int(time.time())}"
        
        try:
            # 1. Fetch Linear raw data
            raw_projects = self.source.fetch_projects()
            raw_issues = self.source.fetch_all_issues()

            # 2. Normalize projects
            norm_projects = [normalize_project(p) for p in raw_projects]
            
            # Map uuid and linear_id to UUID
            proj_id_map: Dict[str, str] = {}
            for p in norm_projects:
                proj_id_map[p["id"]] = p["id"]
                if p.get("linear_id"):
                    proj_id_map[p["linear_id"]] = p["id"]

            norm_issues = [normalize_issue(iss, proj_id_map) for iss in raw_issues]

            # 3. Load & sync HQ Decisions (with dates, rationales & doc id)
            decisions = load_hq_decisions(self.hq_decisions_path)

            # 4. Build & sync Project Releases
            releases = build_project_releases(norm_projects)

            # 5. Load & sync 45 Pre-production Checklist Items with live evaluations
            checklist_items = load_checklist_items(
                csv_path=self.checklist_csv_path,
                json_path=self.checklist_json_path,
                eval_dir=self.checklist_eval_dir
            )

            # 6. Execute Upserts across all entities
            p_ins, p_upd = self.target.upsert_projects(norm_projects)
            i_ins, i_upd = self.target.upsert_issues(norm_issues)
            d_ins, d_upd = self.target.upsert_hq_decisions(decisions)
            r_ins, r_upd = self.target.upsert_releases(releases)
            c_ins, c_upd = self.target.upsert_checklist_items(checklist_items)

            finished_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            
            diff_summary = {
                "projects_total": len(norm_projects),
                "projects_inserted": p_ins,
                "projects_updated": p_upd,
                "issues_total": len(norm_issues),
                "issues_inserted": i_ins,
                "issues_updated": i_upd,
                "decisions_total": len(decisions),
                "decisions_inserted": d_ins,
                "decisions_updated": d_upd,
                "releases_total": len(releases),
                "releases_inserted": r_ins,
                "releases_updated": r_upd,
                "checklist_total": len(checklist_items),
                "checklist_inserted": c_ins,
                "checklist_updated": c_upd
            }

            run_record = {
                "id": run_id,
                "started_at": started_at,
                "finished_at": finished_at,
                "status": "success",
                "projects_count": len(norm_projects),
                "issues_count": len(norm_issues),
                "diff_summary": json.dumps(diff_summary, ensure_ascii=False),
                "error_message": None,
                "source": "linear"
            }
            self.target.record_sync_run(run_record)

            return {
                "ok": True,
                "run_id": run_id,
                "started_at": started_at,
                "finished_at": finished_at,
                "projects_count": len(norm_projects),
                "issues_count": len(norm_issues),
                "decisions_count": len(decisions),
                "releases_count": len(releases),
                "checklist_count": len(checklist_items),
                "diff": diff_summary
            }

        except Exception as e:
            finished_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            err_msg = str(e)
            try:
                fail_record = {
                    "id": run_id,
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "status": "failed",
                    "projects_count": 0,
                    "issues_count": 0,
                    "diff_summary": "{}",
                    "error_message": err_msg[:1000],
                    "source": "linear"
                }
                self.target.record_sync_run(fail_record)
            except Exception:
                pass
            return {
                "ok": False,
                "run_id": run_id,
                "error": err_msg
            }


# ---------- CLI Entrypoint ----------

def main() -> int:
    parser = argparse.ArgumentParser(description="PGOS Dynamic Data Sync Worker (Linear, Decisions, Releases & Checklist)")
    parser.add_argument("--once", action="store_true", help="تشغيل دورة واحدة ثم الخروج")
    parser.add_argument("--interval", type=int, default=15, help="فترة التكرار بالدقائق (الافتراضي 15 دقيقة)")
    parser.add_argument("--db-path", default="/home/hatch/workspace/pgos-site/data/pgos_live.db", help="مسار قاعدة بيانات SQLite المحلية")
    parser.add_argument("--payload-path", default="/home/hatch/workspace/ops-system/linear-sync/payload.json", help="مسار ملف الحمولة المحلي كاحتياطي")
    parser.add_argument("--use-local-payload", action="store_true", help="استخدام ملف الحمولة المحلي فقط دون الاتصال بـ Linear CLI")
    parser.add_argument("--checklist-csv", default=None, help="مسار ملف CSV لفحص ما قبل الإنتاج")
    parser.add_argument("--checklist-json", default=None, help="مسار ملف JSON لفحص ما قبل الإنتاج")
    parser.add_argument("--eval-dir", default=None, help="مسار مجلد تقييمات الفحص (checklist/eval-*.md)")
    parser.add_argument("--hq-decisions", default=None, help="مسار لقطة قرارات المقر المشترك")
    
    args = parser.parse_args()

    # Determine database target
    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and service_role_key:
        print("[Sync Worker] Configured for live Supabase target (service_role)")
        target: Any = SupabasePostgrestTarget(supabase_url, service_role_key)
    else:
        print(f"[Sync Worker] Configured for local SQLite target: {args.db_path}")
        target = LocalSqliteTarget(args.db_path)

    # Determine source
    payload_path = args.payload_path if args.use_local_payload or not os.path.isfile("/opt/hatch/bin/linear") else None
    source = LinearSource(cli_bin="/opt/hatch/bin/linear", local_payload_path=payload_path)
    coordinator = LinearSyncCoordinator(
        source, target,
        checklist_csv_path=args.checklist_csv,
        checklist_json_path=args.checklist_json,
        checklist_eval_dir=args.eval_dir,
        hq_decisions_path=args.hq_decisions
    )

    while True:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] Starting dynamic data sync cycle...")
        result = coordinator.run_cycle()
        
        if result["ok"]:
            print(f"[{timestamp}] Sync SUCCESS (run {result['run_id']}):\n"
                  f"  - Projects: {result['projects_count']}\n"
                  f"  - Issues: {result['issues_count']}\n"
                  f"  - Decisions: {result['decisions_count']}\n"
                  f"  - Releases: {result['releases_count']}\n"
                  f"  - Checklist items: {result['checklist_count']}")
        else:
            print(f"[{timestamp}] Sync FAILED: {result.get('error')}", file=sys.stderr)

        if args.once:
            return 0 if result["ok"] else 1

        print(f"[{timestamp}] Sleeping for {args.interval} minutes...")
        time.sleep(args.interval * 60)


if __name__ == "__main__":
    sys.exit(main())
