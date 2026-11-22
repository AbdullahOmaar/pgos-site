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
        """التحقق من إنشاء الجداول والفهارس في قاعدة البيانات."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            expected = ["pgos_projects", "pgos_issues", "pgos_hq_decisions", "pgos_releases", "pgos_sync_runs"]
            for exp in expected:
                self.assertIn(exp, tables, f"Missing table: {exp}")

            indexes = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()]
            self.assertIn("idx_issues_project_id", indexes)
            self.assertIn("idx_issues_status_type", indexes)

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

    def test_normalize_issue(self):
        """التحقق من توحيد حقول البند وحالاته."""
        raw = {
            "id": "3A-381",
            "uuid": "af4104d4-fe62-452b-8880-07fa8727a02a",
            "title": "اوس الديناميكي",
            "status": "In Progress",
            "priority": {"value": 2},
            "projectId": "505d0430-3603-4dca-b8ac-e9a6d0f1c24b",
            "assignee": {"id": "usr-1", "name": "abdo"},
            "labels": ["Phase 1", "antigravity"]
        }
        proj_map = {"505d0430-3603-4dca-b8ac-e9a6d0f1c24b": "505d0430-3603-4dca-b8ac-e9a6d0f1c24b"}
        norm = normalize_issue(raw, proj_map)
        self.assertEqual(norm["id"], "af4104d4-fe62-452b-8880-07fa8727a02a")
        self.assertEqual(norm["identifier"], "3A-381")
        self.assertEqual(norm["status_type"], "started")
        self.assertEqual(norm["priority_value"], 2)
        self.assertEqual(norm["assignee_name"], "abdo")
        self.assertIn("Phase 1", json.loads(norm["labels"]))

    def test_idempotent_upsert_runs(self):
        """التحقق من حتمية المزامنة (تشغيل مرتين لا يُنتج تكرارًا)."""
        raw_projects = [
            {"id": "P-3A-1", "uuid": "u-p1", "name": "Project 1", "statusName": "Active"}
        ]
        raw_issues = [
            {"id": "3A-1", "uuid": "u-i1", "title": "Task 1", "statusName": "Todo", "projectId": "u-p1"},
            {"id": "3A-2", "uuid": "u-i2", "title": "Task 2", "statusName": "Done", "projectId": "u-p1"}
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
        counts1 = self.target.get_counts()
        self.assertEqual(counts1["projects"], 1)
        self.assertEqual(counts1["issues"], 2)

        # Second cycle (Updates, 0 new rows)
        res2 = coordinator.run_cycle()
        self.assertTrue(res2["ok"])
        self.assertEqual(res2["diff"]["projects_inserted"], 0)
        self.assertEqual(res2["diff"]["projects_updated"], 1)
        self.assertEqual(res2["diff"]["issues_inserted"], 0)
        self.assertEqual(res2["diff"]["issues_updated"], 2)
        counts2 = self.target.get_counts()
        self.assertEqual(counts2["projects"], 1, "Count must remain exactly 1 (no duplicates)")
        self.assertEqual(counts2["issues"], 2, "Count must remain exactly 2 (no duplicates)")

    def test_sql_migrations_syntax_and_structure(self):
        """التحقق من ملفات الهجرات SQL وصحة عباراتها."""
        migrations_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations"))
        files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))
        self.assertGreaterEqual(len(files), 2, "Expected at least 2 migration files")

        for fpath in files:
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
                # Verify non-empty and contains expected DDL statements
                self.assertTrue(len(content.strip()) > 50)
                if "000001" in fpath:
                    self.assertIn("CREATE TABLE IF NOT EXISTS public.pgos_projects", content)
                    self.assertIn("CREATE TABLE IF NOT EXISTS public.pgos_issues", content)
                elif "000002" in fpath:
                    self.assertIn("ENABLE ROW LEVEL SECURITY", content)
                    self.assertIn("REVOKE ALL", content)
                    self.assertIn("CREATE POLICY", content)

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
