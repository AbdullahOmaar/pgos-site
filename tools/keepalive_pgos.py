#!/usr/bin/env python3
"""نبضة منع تجميد مشروع teacher-app (نطاق pgos_) — قراءة REST واحدة بمفتاح anon العام.
المخرجات: OK 200 | PAUSED 540 | ERROR <code>. كود الخروج 0 عند النجاح فقط."""
import sys, urllib.request, urllib.error
URL = "https://qkwdyqocazwhojpyifbv.supabase.co/rest/v1/pgos_projects?select=id&limit=1"
ANON = "sb_publishable_-rNKD15el6L0-RwNObUgxA_AdXOv6Zp"
req = urllib.request.Request(URL, headers={"apikey": ANON, "Authorization": "Bearer " + ANON})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("OK", r.status); sys.exit(0)
except urllib.error.HTTPError as e:
    # 42501 (رفض صلاحية anon على جداول pgos_) يعني القاعدة ردّت واشتغلت = صاحية.
    if e.code == 540:
        print("PAUSED 540"); sys.exit(1)
    body = b""
    try: body = e.read()
    except Exception: pass
    if e.code in (401, 403) and b"42501" in body:
        print("OK awake (42501 anon-blocked by design)"); sys.exit(0)
    print("ERROR", e.code); sys.exit(1)
except Exception as e:
    print("ERROR", type(e).__name__, str(e)[:120]); sys.exit(1)
