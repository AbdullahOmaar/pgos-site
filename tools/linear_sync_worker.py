#!/usr/bin/env python3
"""عامل مزامنة Linear إلى طبقة البيانات الحية لاوس — Linear Sync Worker
البند: 3A-381 (جزء أ من 3A-357)

يقوم هذا العامل بـ:
1. جلب المشاريع والبنود من Linear عبر أداة MCP الرسمية (/opt/hatch/bin/linear) مع التصفح التزايدي (cursor pagination).
2. تنفيذ Upserts حتمية (Idempotent) بمفاتيح (uuid, updated_at).
3. استهداف قاعدة بيانات Supabase (Postgres عبر PostgREST / Service Role) أو قاعدة بيانات محلية SQLite للاختبار والتطوير.
4. تسجيل عمليات المزامنة في جدول تدقيق pgos_sync_runs.
5. الأسرار من البيئة فقط — ممنوع طباعة أي سر في السجلات أو مخرجات الكونسول.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple


# ---------- Database Schema (SQLite / Postgres Compatible DDL) ----------

SQLITE_SCHEMA = """
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

CREATE INDEX IF NOT EXISTS idx_issues_project_id ON pgos_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_status_type ON pgos_issues(status_type);
CREATE INDEX IF NOT EXISTS idx_issues_updated_at ON pgos_issues(updated_at);
CREATE INDEX IF NOT EXISTS idx_issues_identifier ON pgos_issues(identifier);
"""


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
            raise RuntimeError(f"Linear CLI process error ({res.returncode}): {res.stderr.strip() or res.stdout.strip()}")
        try:
            outer = json.loads(res.stdout)
            if not outer.get("ok"):
                raise RuntimeError(f"Linear MCP returned ok=false: {res.stdout}")
            res_dict = outer.get("result", {})
            if res_dict.get("isError"):
                err_text = res_dict.get("content", [{}])[0].get("text", "Unknown MCP error")
                raise RuntimeError(f"Linear tool '{tool_name}' failed: {err_text}")
            content_text = res_dict["content"][0]["text"]
            return json.loads(content_text)
        except Exception as e:
            raise RuntimeError(f"Failed to parse Linear tool output for {tool_name}: {e}") from e

    def fetch_projects(self) -> List[Dict[str, Any]]:
        if self.local_payload_path and os.path.isfile(self.local_payload_path):
            with open(self.local_payload_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "projects" in data:
                    return data["projects"]

        raw = self._call_linear_mcp("list_projects", {"limit": 50})
        projects = raw.get("projects", [])
        return projects

    def fetch_all_issues(self) -> List[Dict[str, Any]]:
        if self.local_payload_path and os.path.isfile(self.local_payload_path):
            with open(self.local_payload_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "issues" in data:
                    return data["issues"]

        all_issues: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        has_next = True
        page = 1

        while has_next:
            args: Dict[str, Any] = {"limit": 50}
            if cursor:
                args["cursor"] = cursor
            
            raw = self._call_linear_mcp("list_issues", args)
            page_issues = raw.get("issues", [])
            all_issues.extend(page_issues)

            has_next = raw.get("hasNextPage", False)
            cursor = raw.get("cursor")
            page += 1

            if page > 50:  # Circuit breaker (up to 2500 issues)
                break

        return all_issues


# ---------- Data Normalizer ----------

def normalize_project(raw: Dict[str, Any]) -> Dict[str, Any]:
    """توحيد حقول المشروع لنموذج قاعدة البيانات."""
    proj_id = raw.get("uuid") or raw.get("id")
    linear_id = raw.get("id") if raw.get("uuid") else (raw.get("linearId") or raw.get("identifier"))
    status_name = raw.get("statusName")
    if not status_name and isinstance(raw.get("status"), dict):
        status_name = raw["status"].get("name")
    
    return {
        "id": proj_id,
        "linear_id": linear_id,
        "name": raw.get("name", "Untitled Project"),
        "summary": raw.get("summary") or "",
        "url": raw.get("url") or "",
        "color": raw.get("color") or "#4f46e5",
        "status_name": status_name or "Active",
        "created_at": raw.get("createdAt") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "updated_at": raw.get("updatedAt") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "metadata": json.dumps({"lead": raw.get("lead"), "priority": raw.get("priority")}, ensure_ascii=False)
    }


def normalize_issue(raw: Dict[str, Any], project_id_map: Dict[str, str]) -> Dict[str, Any]:
    """توحيد حقول البند لنموذج قاعدة البيانات."""
    issue_id = raw.get("uuid") or raw.get("id")
    identifier = raw.get("identifier") or raw.get("id")
    
    # Priority
    p_val = 0
    if isinstance(raw.get("priority"), dict):
        p_val = raw["priority"].get("value", 0)
    elif isinstance(raw.get("priorityValue"), int):
        p_val = raw["priorityValue"]
        
    # Status
    s_name = raw.get("statusName") or raw.get("status") or "Todo"
    s_type = raw.get("statusType")
    if not s_type:
        s_lower = str(s_name).lower()
        if "done" in s_lower or "complete" in s_lower:
            s_type = "completed"
        elif "in progress" in s_lower or "started" in s_lower or "review" in s_lower:
            s_type = "started"
        elif "backlog" in s_lower or "canceled" in s_lower or "cancelled" in s_lower:
            s_type = "backlog" if "backlog" in s_lower else "canceled"
        else:
            s_type = "unstarted"

    # Project linkage
    p_uuid = raw.get("projectUuid") or raw.get("projectId")
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
        "completed_at": raw.get("completedAt"),
        "updated_at": raw.get("updatedAt") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "created_at": raw.get("createdAt") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "raw_data": json.dumps({"gitBranchName": raw.get("gitBranchName"), "teamId": raw.get("teamId")}, ensure_ascii=False)
    }


# ---------- Target Repositories ----------

class LocalSqliteTarget:
    """مستودع تخزين محلي SQLite متطابق مع استعلامات Postgres."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript(SQLITE_SCHEMA)
            conn.commit()

    def upsert_projects(self, projects: List[Dict[str, Any]]) -> Tuple[int, int]:
        inserted = 0
        updated = 0
        with sqlite3.connect(self.db_path) as conn:
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
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            for iss in issues:
                cursor.execute("SELECT updated_at FROM pgos_issues WHERE id = ?", (iss["id"],))
                row = cursor.fetchone()
                if row is None:
                    cursor.execute("""
                        INSERT INTO pgos_issues (id, identifier, title, description, status_name, status_type,
                                                priority_value, due_date, url, project_id, project_linear_id,
                                                assignee_id, assignee_name, labels, completed_at, updated_at,
                                                created_at, raw_data)
                        VALUES (:id, :identifier, :title, :description, :status_name, :status_type,
                                :priority_value, :due_date, :url, :project_id, :project_linear_id,
                                :assignee_id, :assignee_name, :labels, :completed_at, :updated_at,
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
                            completed_at = :completed_at,
                            updated_at = :updated_at,
                            raw_data = :raw_data
                        WHERE id = :id
                    """, iss)
                    updated += 1
            conn.commit()
        return inserted, updated

    def record_sync_run(self, run_data: Dict[str, Any]):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO pgos_sync_runs (id, started_at, finished_at, status, projects_count, issues_count, diff_summary, error_message, source)
                VALUES (:id, :started_at, :finished_at, :status, :projects_count, :issues_count, :diff_summary, :error_message, :source)
            """, run_data)
            conn.commit()

    def get_counts(self) -> Dict[str, int]:
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            p_cnt = c.execute("SELECT COUNT(*) FROM pgos_projects").fetchone()[0]
            i_cnt = c.execute("SELECT COUNT(*) FROM pgos_issues").fetchone()[0]
            return {"projects": p_cnt, "issues": i_cnt}


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
            p_copy["metadata"] = json.loads(p["metadata"])
            formatted.append(p_copy)
        self._post("pgos_projects", formatted)
        return len(projects), 0

    def upsert_issues(self, issues: List[Dict[str, Any]]) -> Tuple[int, int]:
        formatted = []
        for iss in issues:
            iss_copy = dict(iss)
            iss_copy["labels"] = json.loads(iss["labels"])
            iss_copy["raw_data"] = json.loads(iss["raw_data"])
            formatted.append(iss_copy)
        batch_size = 50
        for i in range(0, len(formatted), batch_size):
            chunk = formatted[i:i + batch_size]
            self._post("pgos_issues", chunk)
        return len(issues), 0

    def record_sync_run(self, run_data: Dict[str, Any]):
        r_copy = dict(run_data)
        if isinstance(r_copy.get("diff_summary"), str):
            r_copy["diff_summary"] = json.loads(r_copy["diff_summary"])
        self._post("pgos_sync_runs", [r_copy])


# ---------- Main Sync Coordinator ----------

class LinearSyncCoordinator:
    """منسق المزامنة: يربط المصدر بالمستودع ويدير دورة المزامنة الحتمية."""

    def __init__(self, source: LinearSource, target: Any):
        self.source = source
        self.target = target

    def run_cycle(self) -> Dict[str, Any]:
        started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        run_id = f"sync-{int(time.time())}"
        
        try:
            # 1. Fetch raw data
            raw_projects = self.source.fetch_projects()
            raw_issues = self.source.fetch_all_issues()

            # 2. Normalize
            norm_projects = [normalize_project(p) for p in raw_projects]
            
            # Map uuid and linear_id to UUID
            proj_id_map: Dict[str, str] = {}
            for p in norm_projects:
                proj_id_map[p["id"]] = p["id"]
                if p.get("linear_id"):
                    proj_id_map[p["linear_id"]] = p["id"]

            norm_issues = [normalize_issue(iss, proj_id_map) for iss in raw_issues]

            # 3. Upsert
            p_ins, p_upd = self.target.upsert_projects(norm_projects)
            i_ins, i_upd = self.target.upsert_issues(norm_issues)

            finished_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            
            diff_summary = {
                "projects_total": len(norm_projects),
                "projects_inserted": p_ins,
                "projects_updated": p_upd,
                "issues_total": len(norm_issues),
                "issues_inserted": i_ins,
                "issues_updated": i_upd
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
    parser = argparse.ArgumentParser(description="PGOS Linear Dynamic Data Sync Worker")
    parser.add_argument("--once", action="store_true", help="تشغيل دورة واحدة ثم الخروج")
    parser.add_argument("--interval", type=int, default=15, help="فترة التكرار بالدقائق (الافتراضي 15 دقيقة)")
    parser.add_argument("--db-path", default="/home/hatch/workspace/pgos-site/data/pgos_live.db", help="مسار قاعدة بيانات SQLite المحلية")
    parser.add_argument("--payload-path", default="/home/hatch/workspace/ops-system/linear-sync/payload.json", help="مسار ملف الحمولة المحلي كاحتياطي")
    parser.add_argument("--use-local-payload", action="store_true", help="استخدام ملف الحمولة المحلي فقط دون الاتصال بـ Linear CLI")
    
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
    coordinator = LinearSyncCoordinator(source, target)

    while True:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] Starting Linear sync cycle...")
        result = coordinator.run_cycle()
        
        if result["ok"]:
            print(f"[{timestamp}] Sync SUCCESS (run {result['run_id']}): "
                  f"{result['projects_count']} projects, {result['issues_count']} issues synced.")
        else:
            print(f"[{timestamp}] Sync FAILED: {result.get('error')}", file=sys.stderr)

        if args.once:
            return 0 if result["ok"] else 1

        print(f"[{timestamp}] Sleeping for {args.interval} minutes...")
        time.sleep(args.interval * 60)


if __name__ == "__main__":
    sys.exit(main())
