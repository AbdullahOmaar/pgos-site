-- 20261128000011 — مؤشرات صحة المشاريع + نسبة التطور الأسبوعية (3A-357 الجزء ب/ج)
-- أمر مالك 2026-11-22 (بند 3A-357): «نقيس نسبة التطور» — كل مشروع يعرض مرحلته الحالية +
-- نسبة الإنجاز + مؤشر صحة (أخضر/أصفر/أحمر بقواعد بسيطة: وقفة أو تأخير عن خطة المرحلة) +
-- نسبة تطور أسبوعية لكل مشروع وللشركة ككل (تقدم المراحل + إنجاز السبرنت).
-- تطبيق بوابة §4: إضافة سجل (نفس فئة مهاجرات 000008–000010 بأمر مالك مباشر) — جدول قراءة فقط
-- للمالك (owner_read + SELECT فقط)؛ بلا كتابة من المتصفح أبدًا.
-- تعريف نسبة التطور الأسبوعية (dev_rate_pct): بنود المرحلة الحالية المكتملة في آخر 7 أيام ÷
-- إجمالي بنود المرحلة الحالية. خط الأساس قبل 7 أيام (phase_pct_week_ago) يُسجل فقط لو كان
-- مقامه ≥ 10 بنود — مساحة Linear أُعيد بناؤها 21–22 نوفمبر فمعظم البنود أُنشئت داخل الأسبوع
-- والمقارنة على مقام 0–2 بنود غير ممثلة (تُسجل NULL بصراحة).
-- قواعد الصحة البسيطة: أحمر = وقفة (صفر إنجاز مكتمل في آخر 7 أيام)؛ أصفر = شغال بس تحت
-- وتيرة خطة المرحلة (أو المرحلة مش بتتقدم)؛ أخضر = ماشي على الوتيرة أو أحسن.
-- السبرنت الحالي (id 'current'): 22–26 نوفمبر 2026 — نونو + اوس — 8/8 = 100%.

create table if not exists public.pgos_project_health (
  id uuid primary key default gen_random_uuid(),
  project_ref text not null,
  project_name text not null,
  week_start date not null,
  phase_label text,
  phase_pct numeric(5,2),
  phase_pct_week_ago numeric(5,2),
  weekly_delta_pp numeric(5,2),
  dev_rate_pct numeric(5,2),
  completed_week integer not null default 0,
  completed_3d integer not null default 0,
  sprint_done integer,
  sprint_total integer,
  sprint_pct numeric(5,2),
  health text not null check (health in ('green','yellow','red')),
  health_reason text not null,
  computed_at timestamptz not null default now(),
  unique (project_ref, week_start)
);

-- حماية G1: قراءة للمالك فقط + SELECT فقط (نفس نمط 000008/000010)
drop policy if exists owner_read_pgos_project_health on public.pgos_project_health;
create policy owner_read_pgos_project_health on public.pgos_project_health
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
revoke insert, update, delete, truncate, references, trigger on public.pgos_project_health from authenticated;
grant select on public.pgos_project_health to authenticated;

-- أسبوع 23–29 نوفمبر 2026 — محسوب من البيانات الحية 2026-11-28 ~06:1x EET
insert into public.pgos_project_health
  (project_ref, project_name, week_start, phase_label, phase_pct, phase_pct_week_ago, weekly_delta_pp, dev_rate_pct, completed_week, completed_3d, sprint_done, sprint_total, sprint_pct, health, health_reason)
values
  ('P-3A-5','مستر — تطبيق المدرسين','2026-11-23','Phase 2',56.90,null,null,56.90,77,30,null,null,null,'yellow','فيز ٢ 33/58 = 57% — 33 بند اكتملوا الأسبوع ده (57% من نطاق المرحلة) و30 في آخر 3 أيام؛ التجميد 29 نوفمبر ولسه 25 بند مفتوح بوتيرة 33/أسبوع (~5 أيام) — تحت وتيرة خطة المرحلة. خط الأساس قبل أسبوع بندين بس — غير ممثل.'),
  ('P-3A-8','نونو — نظام الحضانة','2026-11-23','Phase 2',42.86,null,null,42.86,34,10,5,5,100.00,'green','فيز ٢ 15/35 = 43% — 15 بند اكتملوا الأسبوع ده (43% من نطاق المرحلة) و10 في آخر 3 أيام؛ السبرنت 5/5؛ بلا تاريخ إقفال موثق — ماشي.'),
  ('P-3A-6','مساعد الأعمال — AIBA','2026-11-23','Phase 2',39.34,0.00,39.34,39.34,61,10,null,null,null,'green','فيز ٢ 24/61 = 39% (من 0% قبل أسبوع على أساس 18 بندًا) — 61 بند اكتملوا الأسبوع ده و10 في آخر 3 أيام؛ بلا تاريخ إقفال موثق — ماشي.'),
  ('P-3A-4','اوس — مقر الشركة','2026-11-23','Phase 1',64.29,null,null,50.00,9,4,3,3,100.00,'yellow','فيز ١ 9/14 = 64% — 7 بنود اكتملت الأسبوع ده (50% من نطاق المرحلة) و4 في آخر 3 أيام؛ السبرنت 3/3؛ الإقفال 30 نوفمبر ولسه 5 بنود بوتيرة ~1/يوم — تحت وتيرة الخطة.'),
  ('P-3A-9','Wedora — دعوات الأفراح','2026-11-23','Phase 1',0.00,null,null,0.00,3,1,null,null,null,'yellow','فيز ١ 0/14 — صفر إنجاز موسوم في الأسبوع رغم اكتمال 3 بنود بلا وسم فيز (1 في آخر 3 أيام) — العمل ماشي بره وسم المرحلة والتأخير عن خطة المرحلة حقيقي.'),
  ('P-3A-7','حاجاتي الشخصية — Personal','2026-11-23','Phase 1',0.00,null,null,0.00,0,0,null,null,null,'red','وقفة — صفر إنجاز مكتمل في آخر 7 أيام؛ البند الرئيسي (Internshala ISP) واقف على إجراء المالك.'),
  ('3a-store','المتجر — 3A Store','2026-11-23','Phase 1',null,null,null,null,0,0,null,null,null,'yellow','مفيش بنود Linear للمتجر — التقييم الكمي غير متاح من بيانات حية؛ آخر تسليم موثق من مساره دفعات 10+11 (27 نوفمبر).'),
  ('COMPANY','الشركة ككل','2026-11-23',null,44.51,null,null,43.41,184,55,8,8,100.00,'yellow','الشركة 81/182 = 44.5% في المراحل الحالية — 79 بند من نطاق المراحل اكتملوا الأسبوع ده (43%) و184 بند إجمالي؛ السبرنت 8/8 = 100%؛ 3 مشاريع صفراء (مستر/اوس/Wedora) ومشروعان خضراوان (نونو/حسو) — تواريخ إقفال 29–30 نوفمبر تحت ضغط الوتيرة.')
on conflict (project_ref, week_start) do nothing;
