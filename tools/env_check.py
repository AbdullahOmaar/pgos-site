#!/usr/bin/env python3
"""فحص بيئات اوس الفعلي (سجل البيئات الموحّد — تكليف مالك 2026-11-28).

يقرأ صفوف pgos_environments اللي ليها لينك، يفحص كل لينك فعليًا (HTTP)،
ويحدّث status/http_code/checked_at في القاعدة. النسخة: كشف آلي أفضل-جهد من
بندل الصفحة (نمط «الإصدار X.Y.Z» أو "version":"X.Y.Z") — لو ما اتكشفتش،
النسخة المسجلة بتفضل زي ما هي (مفيش تخمين ومفيش تصفير).
قناة الكتابة: Management API SQL (نفس قناة المزامنة).
"""
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin"))
from supabase_api import call  # noqa: E402

REF = "qkwdyqocazwhojpyifbv"
UA = {"User-Agent": "pgos-env-check/1.0"}


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read(2_000_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read(65536).decode("utf-8", "replace")
        except Exception:
            return e.code, ""
    except Exception:
        return None, ""


def detect_version(html, base_url):
    """كشف النسخة من أول بندل JS — أفضل جهد، None لو مش مؤكدة."""
    m = re.search(r'(?:src|href)="([^"]*index-[^"]+\.js)"', html)
    if not m:
        m = re.search(r'(?:src|href)="([^"]+\.js)"', html)
    if not m:
        return None
    bundle_url = m.group(1)
    if bundle_url.startswith("/"):
        bundle_url = base_url.rstrip("/") + bundle_url
    elif not bundle_url.startswith("http"):
        bundle_url = base_url.rstrip("/") + "/" + bundle_url
    code, js = http_get(bundle_url, timeout=30)
    if code != 200 or not js:
        return None
    v = re.search(r"الإصدار\s+(\d+\.\d+\.\d+)", js)
    if v:
        return v.group(1)
    v = re.search(r'"version"\s*:\s*"(\d+\.\d+\.\d+)"', js)
    if v:
        return v.group(1)
    return None


def main():
    rows = call("POST", f"/v1/projects/{REF}/database/query", {"query":
        "select id, url from public.pgos_environments where url is not null order by sort_order"})
    checked = 0
    for r in rows:
        url = r["url"]
        code, html = http_get(url)
        status = "working" if (code is not None and 200 <= code < 400) else "stopped"
        version = detect_version(html, url) if status == "working" else None
        code_sql = str(code) if code is not None else "null"
        ver_sql = f", version = '{version}'" if version else ""
        call("POST", f"/v1/projects/{REF}/database/query", {"query":
            f"update public.pgos_environments set status = '{status}', "
            f"http_code = {code_sql}, checked_at = now(), updated_at = now(){ver_sql} "
            f"where id = '{r['id']}'"})
        checked += 1
        print(f"  {url} -> {code} ({status})" + (f" version={version}" if version else ""))
    print(f"ENV CHECK DONE: {checked} links checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
