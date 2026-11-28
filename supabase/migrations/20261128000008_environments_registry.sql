-- سجل البيئات الموحّد (تكليف مالك 2026-11-28 ~01:48 عبر المدير)
-- قاعدة اوس هي مصدر العرض الوحيد (ممنوع قراءة Linear وقت العرض).
-- الحالة (status/http_code/checked_at) من فحص فعلي بسكربت tools/env_check.py — لا قيم ثابتة.
-- أي قيمة مجهولة = NULL وتظهر في الواجهة «—» — ممنوع التخمين.
-- G1: كل جدول pgos_ جديد يشيل سياسة قراءة المالك صراحةً + SELECT فقط للمصادق، وanon ممنوع.

create table if not exists public.pgos_environments (
  id uuid primary key default gen_random_uuid(),
  project_ref text not null,
  project_name text not null,
  env_key text not null check (env_key in ('production','production-alt','api','dev','demo')),
  env_label text not null,
  url text,
  hosting text,
  version text,
  last_deploy_at timestamptz,
  status text not null default 'unknown' check (status in ('working','stopped','unknown')),
  http_code int,
  checked_at timestamptz,
  repo_dev text,
  repo_company text,
  note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_ref, env_key)
);

alter table public.pgos_environments enable row level security;
drop policy if exists owner_read_pgos_environments on public.pgos_environments;
create policy owner_read_pgos_environments on public.pgos_environments
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
revoke all on public.pgos_environments from anon, authenticated;
grant select on public.pgos_environments to authenticated;

-- ===== البذرة — كل قيمة اتحققت فعليًا ليلة 2026-11-28 (~01:5x EET) =====
insert into public.pgos_environments
  (project_ref, project_name, env_key, env_label, url, hosting, version, last_deploy_at, status, http_code, checked_at, repo_dev, repo_company, note, sort_order)
values
  ('P-3A-5','مستر — تطبيق المدرسين','production','برودكشن','https://teacher-app-prod.vercel.app','Vercel',null,null,'stopped',402,now(),
   'https://github.com/AbdullahOmaar/teacher-app',null,'برودكشن Vercel — موقوف 402 (DEPLOYMENT_DISABLED) وقت الفحص',0),
  ('P-3A-5','مستر — تطبيق المدرسين','production-alt','برودكشن — Cloudflare','https://teacher-app-prod.pages.dev','Cloudflare',null,null,'working',200,now(),
   'https://github.com/AbdullahOmaar/teacher-app',null,'نسخة Cloudflare — شغالة وقت الفحص؛ نسختها مش قابلة للكشف الآلي من البندل',1),
  ('P-3A-5','مستر — تطبيق المدرسين','dev','تطوير / معاينة','https://teacher-app-phi.vercel.app','Vercel',null,null,'stopped',500,now(),
   'https://github.com/AbdullahOmaar/teacher-app',null,'نشر معاينة — بيرجع 500 وقت الفحص',2),
  ('P-3A-8','نونو — نظام الحضانة','production','برودكشن','https://nounou-app-psi.vercel.app','Vercel',null,null,'stopped',402,now(),
   null,null,'الممنوع: nounou-app.vercel.app — مش بتاعنا (بيخدم تطبيق غريب؛ اتحقق 2026-11-28)',3),
  ('P-3A-6','مساعد الأعمال — AIBA','production','برودكشن — الويب','https://ai-business-assistant-web.vercel.app','Vercel',null,null,'stopped',402,now(),
   null,null,'نسخة الويب في السجل القديم 1.9.3 وفي ذاكرة المسار 1.17.0 — تعارض غير محسوم، فالنسخة فاضية لحد التأكيد',4),
  ('P-3A-6','مساعد الأعمال — AIBA','api','برودكشن — API',null,null,null,null,'unknown',null,null,
   null,null,'لينك الـAPI مش مؤكد عند مسؤول اوس — مستني التأكيد قبل التسجيل',5),
  ('P-3A-4','اوس — مقر الشركة','production','برودكشن','https://pgos-taupe.vercel.app','Vercel','0.5.1','2026-11-27T20:53:54+02:00','stopped',402,now(),
   'https://github.com/AbdullahOmaar/pgos-site',null,'آخر نشر v0.5.1 (dpl_3QterHkSGtnFW1ockpd7T5XNTSGv) — اللينك كان شغال لحد 22:35 وبقى 402 (DEPLOYMENT_DISABLED على مستوى فريق Vercel)',6),
  ('P-3A-9','Wedora — دعوات الأفراح','production','برودكشن',null,null,null,null,'unknown',null,null,
   null,null,'مفيش لينك إنتاج مسجل عند مسؤول اوس',7)
on conflict (project_ref, env_key) do nothing;
