-- 20261128000012 — وحدة الاختبار في اوس (سجل منظّم للكيسز والتشغيلات والنتائج والعيوب)
-- أمر مالك 2026-11-28 ~12:48 EET عبر المدير: الاختبار كان بلا نظام — النتائج بتتفرق في
-- شاتات وتقارير وتعليقات PR، واوس (مرجع الشركة الشامل) مفيهوش وحدة اختبار. القرار:
-- الوحدة تتبني جوه اوس Database-first زي باقي الوحدات — لا نظام خارجي مدفوع.
-- التصميم: 4 جداول —
--   pgos_test_cases: الكيسز (مشروع + موديول + نوع + مصدرها في مرجع الاختبار بمعرّف ثابت)
--   pgos_test_runs: التشغيلات (تاريخ/بيئة/منفّذ/بناء)
--   pgos_test_results: نتيجة كل كيس في كل تشغيلة (ناجح/فاشل/موقوف + جزئي + متخطّى + دليل)
--   pgos_defects: العيوب مرتبطة بالكيسز (مفتوح/اتصلح/أُعيد اختباره/مخاطرة مقبولة)
-- مفردات النتائج: pass/fail/blocked هي طلب المدير؛ partial وskipped اتضافوا لأن البيانات
-- الحقيقية الأولى (مطابقة الـ292 المستقلة + تخطّي authz لنفسها في CI) لا تُمثَّل بصدق من غيرهم.
-- معرّفات الكيسز ثابتة لكل مشروع: <PREFIX>-<FAMILY>-<NNN> (مستر: MR-FT للفول تست اليدوي،
-- MR-GOV لجدول الـ45، MR-ACC للقبول الدائم، MR-AUTO لحزم الكتالوج الآلي، MR-PROC للإجراءات اليدوية).
-- + خطوة دورة حياة جديدة «testing_registry» (قسم ج — بوابات QA، ترتيب 11): حالتها وملحوظتها
-- تتغذيان آليًا من الوحدة عبر tools/testing_feed.py في دورة المزامنة — لا إدخال يدوي منفصل.
-- حماية G1: قراءة للمالك فقط + SELECT فقط على الجداول الأربعة (نفس نمط 000008–000011)؛
-- الكتابة عبر قناة SQL (Management API) فقط.

create table if not exists public.pgos_test_cases (
  id text primary key,
  project_ref text not null,
  project_name text not null,
  module text not null,
  title text not null,
  kind text not null check (kind in ('automated','automated_local','manual','governance')),
  case_state text not null default 'written' check (case_state in ('written','gap')),
  source text not null,
  note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pgos_test_cases_project on public.pgos_test_cases (project_ref, module);

create table if not exists public.pgos_test_runs (
  id text primary key,
  project_ref text not null,
  project_name text not null,
  label text not null,
  environment text not null,
  executor text not null,
  run_at timestamptz not null,
  build_ref text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pgos_test_runs_project on public.pgos_test_runs (project_ref, run_at desc);

create table if not exists public.pgos_test_results (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.pgos_test_runs(id) on delete cascade,
  case_id text not null references public.pgos_test_cases(id) on delete cascade,
  result text not null check (result in ('pass','fail','blocked','partial','skipped')),
  evidence_url text,
  note text,
  created_at timestamptz not null default now(),
  unique (run_id, case_id)
);
create index if not exists idx_pgos_test_results_case on public.pgos_test_results (case_id);

create table if not exists public.pgos_defects (
  id text primary key,
  project_ref text not null,
  project_name text not null,
  case_id text references public.pgos_test_cases(id),
  title text not null,
  severity text not null check (severity in ('critical','high','medium','low')),
  status text not null default 'open' check (status in ('open','fixed','retested','accepted_risk')),
  source text not null,
  evidence_url text,
  opened_at date not null default current_date,
  closed_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pgos_defects_project on public.pgos_defects (project_ref, status);

-- حماية G1: قراءة للمالك فقط + SELECT فقط (نفس نمط 000008/000010/000011)
alter table public.pgos_test_cases enable row level security;
drop policy if exists owner_read_pgos_test_cases on public.pgos_test_cases;
create policy owner_read_pgos_test_cases on public.pgos_test_cases
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
revoke insert, update, delete, truncate, references, trigger on public.pgos_test_cases from authenticated;
grant select on public.pgos_test_cases to authenticated;

alter table public.pgos_test_runs enable row level security;
drop policy if exists owner_read_pgos_test_runs on public.pgos_test_runs;
create policy owner_read_pgos_test_runs on public.pgos_test_runs
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
revoke insert, update, delete, truncate, references, trigger on public.pgos_test_runs from authenticated;
grant select on public.pgos_test_runs to authenticated;

alter table public.pgos_test_results enable row level security;
drop policy if exists owner_read_pgos_test_results on public.pgos_test_results;
create policy owner_read_pgos_test_results on public.pgos_test_results
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
revoke insert, update, delete, truncate, references, trigger on public.pgos_test_results from authenticated;
grant select on public.pgos_test_results to authenticated;

alter table public.pgos_defects enable row level security;
drop policy if exists owner_read_pgos_defects on public.pgos_defects;
create policy owner_read_pgos_defects on public.pgos_defects
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
revoke insert, update, delete, truncate, references, trigger on public.pgos_defects from authenticated;
grant select on public.pgos_defects to authenticated;

-- خطوة دورة الحياة الجديدة: «سجل الاختبار في اوس» — قسم ج، ترتيب 11 (إزاحة ما بعدها)
update public.pgos_lifecycle_steps set sort_order = sort_order + 1 where sort_order >= 11;
insert into public.pgos_lifecycle_steps (step_key, section, title, description, sort_order)
values ('testing_registry', 'ج — بوابات QA', 'سجل الاختبار في اوس',
        'كيسز المشروع وتشغيلاته ونتائجه وعيوبه مسجلة في وحدة اختبار اوس (pgos_test_*) — الحالة والملحوظة تتغذيان آليًا من الوحدة عبر testing_feed في دورة المزامنة، لا إدخال يدوي',
        11)
on conflict (step_key) do nothing;

insert into public.pgos_project_lifecycle (project_ref, project_name, step_key, status, note)
select distinct project_ref, project_name, 'testing_registry', 'pending',
       'لا كيسز مزروعة بعد في وحدة الاختبار — الحالة تتغذى آليًا من الوحدة'
from public.pgos_project_lifecycle
on conflict (project_ref, step_key) do nothing;
