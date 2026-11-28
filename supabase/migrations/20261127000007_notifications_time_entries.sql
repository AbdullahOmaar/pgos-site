-- APPLIED 2026-11-27 ~20:4x EET بأمر مدير صريح (أولوية المالك القصوى: إقفال فيز ٢ اوس) — تجاوز موثق لبوابة التجميد في المسودة.
-- المصدر: تصميما 3A-426 و3A-427 المعتمدان (مراجعة عدّت 2026-11-25).
-- المصدر: تصميما 3A-426 (NOTIFICATIONS-INAPP-DESIGN-2026-11-25.md) و3A-427 (TASK-TIME-DESIGN-2026-11-25.md) المعتمدان.
-- ملحوظة G1: كل جدول pgos_ جديد لازم يشيل سياسة قراءة المالك صراحةً (مفيش ALTER DEFAULT PRIVILEGES شامل).

-- ===== 3A-426: إشعارات داخل التطبيق =====
create table if not exists public.pgos_notifications (
  id uuid primary key default gen_random_uuid(),
  type_id text not null references public.pgos_notification_types(id),
  title text not null,
  body text,
  entity_type text,
  entity_id text,
  route text,
  severity text not null default 'info' check (severity in ('info','warn','critical')),
  created_at timestamptz not null default now(),
  source text not null default 'manual'
);
create index if not exists pgos_notifications_dedupe_idx
  on public.pgos_notifications (type_id, entity_type, entity_id, created_at desc);
create index if not exists pgos_notifications_created_idx
  on public.pgos_notifications (created_at desc);

-- حالة القراءة لكل جهاز (مش حالة عالمية — مقصود وموثق في التصميم)
create table if not exists public.pgos_notification_reads (
  device_id text not null,
  notification_id uuid not null references public.pgos_notifications(id),
  read_at timestamptz not null default now(),
  primary key (device_id, notification_id)
);

-- ===== 3A-427: زمن المهام =====
create table if not exists public.pgos_time_entries (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.pgos_issues(id),
  actor text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes int generated always as (
    case when ended_at is null then null
         else (extract(epoch from (ended_at - started_at))::int / 60) end
  ) stored,
  origin text not null default 'timer' check (origin in ('timer','manual')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);
-- قيد جارٍ واحد بس لكل (مهمة + فاعل)
create unique index if not exists pgos_time_entries_one_running_idx
  on public.pgos_time_entries (issue_id, actor) where ended_at is null;
create index if not exists pgos_time_entries_issue_idx
  on public.pgos_time_entries (issue_id, started_at desc);

-- ===== صلاحيات + RLS (نمط G1 — migration 000006) =====
alter table public.pgos_notifications enable row level security;
alter table public.pgos_notification_reads enable row level security;
alter table public.pgos_time_entries enable row level security;

drop policy if exists owner_read_pgos_notifications on public.pgos_notifications;
create policy owner_read_pgos_notifications on public.pgos_notifications
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
drop policy if exists owner_read_pgos_notification_reads on public.pgos_notification_reads;
create policy owner_read_pgos_notification_reads on public.pgos_notification_reads
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
drop policy if exists owner_read_pgos_time_entries on public.pgos_time_entries;
create policy owner_read_pgos_time_entries on public.pgos_time_entries
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());

revoke all on public.pgos_notifications from anon, authenticated;
revoke all on public.pgos_notification_reads from anon, authenticated;
revoke all on public.pgos_time_entries from anon, authenticated;
grant select on public.pgos_notifications to authenticated;
grant select on public.pgos_notification_reads to authenticated;
grant select on public.pgos_time_entries to authenticated;
-- الكتابة (توليد الإشعارات / قيود الزمن / تعليم المقروء) = قناة كتابة بقرار أمني منفصل — لا تُمنح هنا.
