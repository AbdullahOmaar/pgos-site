#!/bin/bash
# دورة مزامنة اوس الدائمة: Linear ← حمولة ← تدريج محلي ← دفع SQL للقاعدة الحية (teacher-app/pgos_)
# قناة الكتابة: Management API SQL (مفاتيح PostgREST القديمة موقوفة من 3A-695).
# الخروج: 0 عند النجاح مع سطر عدّادات؛ غير صفر عند فشل أي خطوة.
set -euo pipefail
REF="qkwdyqocazwhojpyifbv"
cd /home/hatch/workspace/pgos-site
python3 /home/hatch/workspace/ops-system/linear-sync/ui-352-scratch/fetch_payload.py
python3 tools/linear_sync_worker.py --once --use-local-payload > /tmp/pgos_sync_worker.log 2>&1
python3 tools/push_staging_to_supabase.py "$REF" > /tmp/pgos_sync_push.log 2>&1
tail -1 /tmp/pgos_sync_worker.log
echo "SYNC CYCLE OK"
python3 tools/env_check.py > /tmp/pgos_env_check.log 2>&1 || echo "ENV CHECK FAILED (non-fatal) — see /tmp/pgos_env_check.log"
python3 tools/testing_feed.py > /tmp/pgos_testing_feed.log 2>&1 || echo "TESTING FEED FAILED (non-fatal) — see /tmp/pgos_testing_feed.log"
