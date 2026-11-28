-- 20261128000013 — أدوار «مختبِر» في وحدة الاختبار (إضافة مالك 2026-11-28 ~12:51)
-- اللي بيختبروا فعليًا مش سند بس: زين ومعز بيختبروا وبيبعتوا نتائجهم في الشات زيه
-- بالظبط (زين بعت 3 دفعات ملاحظات اختبار مستر يوم 2026-11-28). الوحدة لازم تدعم
-- مختبِرين مسمّين — بشر ومسارات ونظام آلي — وكل تشغيلة ونتيجة تتسجل باسم منفّذها،
-- عشان أي نتيجة اختبار تتولد جوه اوس من الأول مش تتجمع من الشاتات بعدين.
-- التصميم: سجل pgos_testers + tester_id على التشغيلات (المنفّذ الأساسي) وعلى
-- النتائج نفسها (منفّذ كل نتيجة — جولة واحدة ممكن يشترك فيها أكتر من مختبِر،
-- زي جولة الـ292 على بناء التجميد: سند + مراجع مستقل بالتوازي).
-- حماية G1: قراءة للمالك فقط + SELECT فقط (نفس نمط 000012).

create table if not exists public.pgos_testers (
  id text primary key,
  display_name text not null,
  kind text not null check (kind in ('human','track','system')),
  role text not null check (role in ('tester','reviewer','qa','automated','owner')),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pgos_testers enable row level security;
drop policy if exists owner_read_pgos_testers on public.pgos_testers;
create policy owner_read_pgos_testers on public.pgos_testers
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
revoke insert, update, delete, truncate, references, trigger on public.pgos_testers from authenticated;
grant select on public.pgos_testers to authenticated;

alter table public.pgos_test_runs add column if not exists tester_id text references public.pgos_testers(id);
alter table public.pgos_test_results add column if not exists tester_id text references public.pgos_testers(id);

-- سجل المختبِرين (الموثقين فعليًا لحد 2026-11-28)
insert into public.pgos_testers (id, display_name, kind, role, note) values
  ('sanad', 'سند', 'human', 'tester', 'صاحب خطة الفول تست اليدوية 292 + جولات اختبار حية موثقة'),
  ('zayn', 'زين', 'human', 'tester', 'دفعات ملاحظات اختبار مستر (3 دفعات يوم 2026-11-28) — نتائجها تُسجل باسمه أول ما محتواها يوصل الوحدة'),
  ('moaz', 'معز', 'human', 'tester', 'بيختبر وبيبعت نتايجه في الشات (نقطة مالك 2026-11-28)'),
  ('qa-line', 'خط المراجعة والدمج (QA)', 'track', 'qa', 'مراجعات PR + جدول فحص ما قبل الإنتاج (الـ45)'),
  ('review-chat', 'شات المراجعة المستقلة', 'track', 'reviewer', 'تنفيذ الاختبارات المستقلة 2026-11-28 + تدقيق RLS الحي'),
  ('github-actions', 'GitHub Actions — CI', 'system', 'automated', 'تشغيلات CI الآلية على كل push'),
  ('os-tracks', 'مسارات اوس الداخلية', 'track', 'tester', 'مسارات التنفيذ الداخلية (مسؤول اوس / الواجهة / خطوط المشاريع)')
on conflict (id) do nothing;

-- إسناق التشغيلتين الموجودتين لمنفّذيهما + نتائجهما
update public.pgos_test_runs set tester_id = 'review-chat' where id = 'MR-RUN-IND-20261128';
update public.pgos_test_runs set tester_id = 'github-actions' where id = 'MR-RUN-CI-46112007667';
update public.pgos_test_results r set tester_id = u.tester_id
from public.pgos_test_runs u
where r.run_id = u.id and r.tester_id is null and u.tester_id is not null;
