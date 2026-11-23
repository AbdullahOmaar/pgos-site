#!/usr/bin/env python3
"""اختبارات تحقق عامل المزامنة والمخطط — PGOS Sync Worker & Schema Tests
البند: 3A-381 (جزء أ من 3A-357)
"""

import glob
import json
import os
import sqlite3
import sys
import tempfile
import unittest

# Ensure tools directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools")))
from linear_sync_worker import (
    LocalSqliteTarget,
    LinearSyncCoordinator,
    LinearSource,
    normalize_project,
    normalize_issue,
    load_hq_decisions,
    build_project_releases,
    load_checklist_items,
    SQLITE_SCHEMA
)


class TestLinearSyncWorker(unittest.TestCase):

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test_pgos.db")
        self.target = LocalSqliteTarget(self.db_path)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_schema_creation_and_indexes(self):
        """التحقق من إنشاء كافة الجداول والفهارس في قاعدة البيانات."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            expected_tables = [
                "pgos_projects",
                "pgos_issues",
                "pgos_hq_decisions",
                "pgos_releases",
                "pgos_checklist_items",
                "pgos_sync_runs"
            ]
            for exp in expected_tables:
                self.assertIn(exp, tables, f"Missing table: {exp}")

            # Verify rationale column exists in pgos_hq_decisions
            dec_cols = [c[1] for c in cursor.execute("PRAGMA table_info(pgos_hq_decisions)").fetchall()]
            self.assertIn("rationale", dec_cols, "pgos_hq_decisions must include rationale column")

            # Verify started_at column exists in pgos_issues
            iss_cols = [c[1] for c in cursor.execute("PRAGMA table_info(pgos_issues)").fetchall()]
            self.assertIn("started_at", iss_cols, "pgos_issues must include started_at column")

            # Verify indexes
            indexes = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()]
            self.assertIn("idx_issues_project_id", indexes)
            self.assertIn("idx_issues_status_type", indexes)
            self.assertIn("idx_issues_started_at", indexes)
            self.assertIn("idx_checklist_category", indexes)
            self.assertIn("idx_checklist_check_number", indexes)

    def test_normalize_project(self):
        """التحقق من توحيد حقول المشروع."""
        raw = {
            "id": "P-3A-9",
            "uuid": "505d0430-3603-4dca-b8ac-e9a6d0f1c24b",
            "name": "Wedora — دعوات الأفراح",
            "summary": "دعوات رقمية",
            "color": "#f2c94c",
            "status": {"name": "In Progress"}
        }
        norm = normalize_project(raw)
        self.assertEqual(norm["id"], "505d0430-3603-4dca-b8ac-e9a6d0f1c24b")
        self.assertEqual(norm["linear_id"], "P-3A-9")
        self.assertEqual(norm["name"], "Wedora — دعوات الأفراح")
        self.assertEqual(norm["status_name"], "In Progress")

    def test_normalize_issue_with_started_and_completed_timestamps(self):
        """التحقق من توحيد حقول البند وطوابع الاستلام startedAt والتسليم completedAt."""
        raw = {
            "id": "3A-381",
            "uuid": "af4104d4-fe62-452b-8880-07fa8727a02a",
            "title": "اوس الديناميكي",
            "status": "In Progress",
            "priority": {"value": 2},
            "projectId": "505d0430-3603-4dca-b8ac-e9a6d0f1c24b",
            "assignee": {"id": "usr-1", "name": "abdo"},
            "labels": ["Phase 1", "antigravity"],
            "startedAt": "2026-11-23T01:30:00+02:00",
            "completedAt": "2026-11-23T02:00:00+02:00"
        }
        proj_map = {"505d0430-3603-4dca-b8ac-e9a6d0f1c24b": "505d0430-3603-4dca-b8ac-e9a6d0f1c24b"}
        norm = normalize_issue(raw, proj_map)
        self.assertEqual(norm["id"], "af4104d4-fe62-452b-8880-07fa8727a02a")
        self.assertEqual(norm["identifier"], "3A-381")
        self.assertEqual(norm["status_type"], "started")
        self.assertEqual(norm["priority_value"], 2)
        self.assertEqual(norm["assignee_name"], "abdo")
        self.assertEqual(norm["started_at"], "2026-11-23T01:30:00+02:00")
        self.assertEqual(norm["completed_at"], "2026-11-23T02:00:00+02:00")
        self.assertIn("Phase 1", json.loads(norm["labels"]))

    def test_load_hq_decisions_structure_and_rationale(self):
        """التحقق من تحميل قرارات المقر بتواريخها وأسبابها ورابط مستند المقر الكانوني."""
        decisions = load_hq_decisions()
        self.assertGreaterEqual(len(decisions), 14, "Should load at least 14 canonical decisions")
        doc_id = "1AOSBHTBeHkHJ4NBFeUgLwuyVfpckRu2BWt33cncNxNM"
        for dec in decisions:
            self.assertTrue(dec["id"], "Decision id must not be empty")
            self.assertTrue(dec["heading"], "Decision heading must not be empty")
            self.assertTrue(dec["body"], "Decision body must not be empty")
            self.assertTrue(dec["category"], "Decision category must not be empty")
            self.assertTrue(dec["effective_date"], "Decision effective_date must not be empty")
            self.assertTrue(dec["source"], "Decision source must not be empty")
            self.assertTrue(dec["rationale"], "Decision rationale must not be empty")
            self.assertIn(doc_id, dec["source"], f"Decision {dec['id']} source must reference canonical Doc ID")

    def test_build_project_releases_structure(self):
        """التحقق من سجل إصدارات المشاريع ومطابقة معرفاتها."""
        mock_projects = [
            {"id": "uuid-teacher", "linear_id": "P-3A-5", "name": "تطبيق المدرس — Teacher App"},
            {"id": "uuid-pgos", "linear_id": "P-3A-4", "name": "PGOS — Project Governance OS v0.1.0"},
            {"id": "uuid-nounou", "linear_id": "P-3A-8", "name": "نونو — Nounou"},
            {"id": "uuid-aiba", "linear_id": "P-3A-6", "name": "AI Business Assistant"},
            {"id": "uuid-wedora", "linear_id": "P-3A-9", "name": "Wedora — دعوات الأفراح"}
        ]
        releases = build_project_releases(mock_projects)
        self.assertGreaterEqual(len(releases), 8, "Expected at least 8 project releases")
        for rel in releases:
            self.assertTrue(rel["id"].startswith("rel-"))
            self.assertTrue(rel["name"])
            self.assertTrue(rel["status"])
            self.assertTrue(rel["released_at"])
            self.assertTrue(rel["description"])
            meta = json.loads(rel["metadata"])
            self.assertIsInstance(meta, dict)

    def test_load_checklist_items_45_checks_and_evaluations(self):
        """التحقق من تحميل قائمة الـ45 فحص لما قبل الإنتاج مع التقييمات الحية لكافة المشاريع."""
        items = load_checklist_items()
        self.assertEqual(len(items), 45, "Checklist must contain exactly 45 items")
        check_numbers = [it["check_number"] for it in items]
        self.assertEqual(check_numbers, list(range(1, 46)), "Check numbers must be exactly 1 to 45 sequential")

        allowed_statuses = {"done", "partial", "not_started", "na", "not_evaluated"}
        for it in items:
            self.assertTrue(it["category"], "Category cannot be empty")
            self.assertTrue(it["title"], "Title cannot be empty")
            self.assertIn(it["teacher_status"], allowed_statuses)
            self.assertIn(it["pgos_status"], allowed_statuses)
            self.assertIn(it["nounou_status"], allowed_statuses)
            self.assertIn(it["aiba_status"], allowed_statuses)
            
            p_statuses = json.loads(it["project_statuses"])
            self.assertIn("teacher_app", p_statuses)
            self.assertIn("pgos_site", p_statuses)
            self.assertIn("nounou", p_statuses)
            self.assertIn("aiba", p_statuses)

        # Check that evaluations from markdown files actually populated real statuses
        nounou_statuses = {it["nounou_status"] for it in items}
        self.assertTrue("done" in nounou_statuses or "partial" in nounou_statuses, "Nounou must have real evaluated statuses")

        pgos_statuses = {it["pgos_status"] for it in items}
        self.assertTrue("partial" in pgos_statuses, "PGOS must have partial status from eval-pgos")

        aiba_statuses = {it["aiba_status"] for it in items}
        self.assertTrue("partial" in aiba_statuses, "AIBA must have partial status from eval-aiba")

    def test_idempotent_upsert_runs_all_entities(self):
        """التحقق من حتمية المزامنة عبر كافة الكيانات (المشاريع، المهام، القرارات، الإصدارات، الفحوصات)."""
        raw_projects = [
            {"id": "P-3A-1", "uuid": "u-p1", "name": "Project 1", "statusName": "Active"}
        ]
        raw_issues = [
            {"id": "3A-1", "uuid": "u-i1", "title": "Task 1", "statusName": "Todo", "projectId": "u-p1", "startedAt": "2026-11-23T01:00:00Z"},
            {"id": "3A-2", "uuid": "u-i2", "title": "Task 2", "statusName": "Done", "projectId": "u-p1", "completedAt": "2026-11-23T02:00:00Z"}
        ]

        class MockLinearSource:
            def fetch_projects(self):
                return raw_projects
            def fetch_all_issues(self):
                return raw_issues

        coordinator = LinearSyncCoordinator(MockLinearSource(), self.target)

        # First cycle (Inserts)
        res1 = coordinator.run_cycle()
        self.assertTrue(res1["ok"])
        self.assertEqual(res1["diff"]["projects_inserted"], 1)
        self.assertEqual(res1["diff"]["issues_inserted"], 2)
        self.assertGreater(res1["diff"]["decisions_inserted"], 0)
        self.assertGreater(res1["diff"]["releases_inserted"], 0)
        self.assertEqual(res1["diff"]["checklist_inserted"], 45)

        counts1 = self.target.get_counts()
        self.assertEqual(counts1["projects"], 1)
        self.assertEqual(counts1["issues"], 2)
        self.assertGreaterEqual(counts1["decisions"], 14)
        self.assertGreaterEqual(counts1["releases"], 8)
        self.assertEqual(counts1["checklist_items"], 45)

        # Second cycle (Updates, exactly 0 new rows inserted across all tables)
        res2 = coordinator.run_cycle()
        self.assertTrue(res2["ok"])
        self.assertEqual(res2["diff"]["projects_inserted"], 0)
        self.assertEqual(res2["diff"]["projects_updated"], 1)
        self.assertEqual(res2["diff"]["issues_inserted"], 0)
        self.assertEqual(res2["diff"]["issues_updated"], 2)
        self.assertEqual(res2["diff"]["decisions_inserted"], 0)
        self.assertEqual(res2["diff"]["releases_inserted"], 0)
        self.assertEqual(res2["diff"]["checklist_inserted"], 0)

        counts2 = self.target.get_counts()
        self.assertEqual(counts2["projects"], counts1["projects"], "Projects count must not change")
        self.assertEqual(counts2["issues"], counts1["issues"], "Issues count must not change")
        self.assertEqual(counts2["decisions"], counts1["decisions"], "Decisions count must not change")
        self.assertEqual(counts2["releases"], counts1["releases"], "Releases count must not change")
        self.assertEqual(counts2["checklist_items"], 45, "Checklist count must remain 45")

    def test_sql_migrations_syntax_and_structure(self):
        """التحقق من ملفات الهجرات SQL وصحة عباراتها بما فيها هجرة الفحوصات والقرارات وطوابع البدء."""
        migrations_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations"))
        files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))
        self.assertGreaterEqual(len(files), 3, "Expected at least 3 migration files")

        for fpath in files:
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
                self.assertTrue(len(content.strip()) > 50)
                if "000001" in fpath:
                    self.assertIn("CREATE TABLE IF NOT EXISTS public.pgos_projects", content)
                    self.assertIn("CREATE TABLE IF NOT EXISTS public.pgos_issues", content)
                elif "000002" in fpath:
                    self.assertIn("ENABLE ROW LEVEL SECURITY", content)
                    self.assertIn("REVOKE ALL", content)
                    self.assertIn("CREATE POLICY", content)
                elif "000003" in fpath:
                    self.assertIn("ALTER TABLE public.pgos_hq_decisions ADD COLUMN IF NOT EXISTS rationale", content)
                    self.assertIn("ALTER TABLE public.pgos_issues ADD COLUMN IF NOT EXISTS started_at", content)
                    self.assertIn("CREATE TABLE IF NOT EXISTS public.pgos_checklist_items", content)
                    self.assertIn("ALTER TABLE public.pgos_checklist_items ENABLE ROW LEVEL SECURITY", content)
                    self.assertIn("REVOKE ALL ON TABLE public.pgos_checklist_items FROM anon, public", content)

    def test_zero_secrets_leakage(self):
        """التحقق من عدم تسرب أي أسرار أو مفاتيح في السجلات وسجل المزامنة."""
        sensitive_patterns = ["sbp_", "eyJ", "service_role", "anon_key"]
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            rows = cursor.execute("SELECT diff_summary, error_message FROM pgos_sync_runs").fetchall()
            for row in rows:
                dumped = str(row)
                for pattern in sensitive_patterns:
                    self.assertNotIn(pattern, dumped, f"Sensitive pattern {pattern} found in sync log!")


if __name__ == "__main__":
    unittest.main()
