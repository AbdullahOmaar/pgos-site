-- خطوات دورة حياة المشروع (توسيع مالك 2026-11-28 ~03:32): اوس مرجع واحد لكل مشروع.
-- جدولان: قالب الخطوات الموحّد + حالة كل خطوة لكل مشروع (done/pending/na).
-- القاعدة هي مصدر العرض الوحيد؛ اللي مش موجود عند مشروع بيتسجل وبيتعرض — مش بيتساب فاضي.
-- G1: سياسة قراءة مالك صريحة + SELECT فقط للمصادق، وanon ممنوع.

create table if not exists public.pgos_lifecycle_steps (
  step_key text primary key,
  section text not null,
  title text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pgos_project_lifecycle (
  id uuid primary key default gen_random_uuid(),
  project_ref text not null,
  project_name text not null,
  step_key text not null references public.pgos_lifecycle_steps(step_key),
  status text not null default 'pending' check (status in ('done','pending','na')),
  note text,
  updated_at timestamptz not null default now(),
  unique (project_ref, step_key)
);

alter table public.pgos_lifecycle_steps enable row level security;
alter table public.pgos_project_lifecycle enable row level security;
drop policy if exists owner_read_pgos_lifecycle_steps on public.pgos_lifecycle_steps;
drop policy if exists owner_read_pgos_project_lifecycle on public.pgos_project_lifecycle;
create policy owner_read_pgos_lifecycle_steps on public.pgos_lifecycle_steps
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
create policy owner_read_pgos_project_lifecycle on public.pgos_project_lifecycle
  for select to authenticated using (auth.uid() = public.pgos_owner_uid());
revoke all on public.pgos_lifecycle_steps from anon, authenticated;
revoke all on public.pgos_project_lifecycle from anon, authenticated;
grant select on public.pgos_lifecycle_steps to authenticated;
grant select on public.pgos_project_lifecycle to authenticated;

-- ===== قالب الخطوات الموحّد (26 خطوة في 8 أقسام) =====
insert into public.pgos_lifecycle_steps (step_key, section, title, description, sort_order) values
  ('accounts_created','أ — التأسيس والحسابات','إنشاء حسابات المشروع','حسابات القاعدة وGit والاستضافة وإيميل التطبيق — كل حساب مسجل على إيميل مين في سجل البيئات',1),
  ('environments_registered','أ — التأسيس والحسابات','تسجيل البيئات في اوس','كل بيئات المشروع (برودكشن/تطوير/API) مسجلة في pgos_environments بحالة مفحوصة فعليًا',2),
  ('repo_active','ب — التطوير','ريبو تطوير نشط','الريبو شغال ومدفوع للبعيد والشغل بيتم على دفعات',3),
  ('reference_package','ب — التطوير','حزمة المرجع الخماسية','المرجع التجاري + سجل الفيتشرز + خريطة الموديولات + مرجع الاختبارات + سجل الإصدارات — حية ومحدثة مع كل فيتشر',4),
  ('version_line','ب — التطوير','سطر الإصدار الظاهر','«الإصدار X — نُشر [وقت]» من بيانات البناء داخل التطبيق وعلى السبلاش',5),
  ('clean_code','ب — التطوير','الكود النظيف','مبادئ Clean Code على الكود الجديد + تقسيم الملفات العملاقة على مراحل بصفر تغيير سلوك',6),
  ('qa_review','ج — بوابات QA','مراجعة QA قبل الدمج/النشر','مراجعة مستقلة + CI أخضر قبل أي دمج أو نشر',7),
  ('authz_tests','ج — بوابات QA','حزمة اختبارات الصلاحيات','فحص صلاحيات على كل نقطة/دالة + حزمة اختبارات صلاحيات خضراء بالكامل',8),
  ('visual_375','ج — بوابات QA','فحص 375px موثق','لقطة وتحقق على عرض موبايل حقيقي لكل واجهة جديدة',9),
  ('no_raw_errors','ج — بوابات QA','لا أخطاء خام','أي فيتشر نايم يعرض «قريبًا» مهذبة — خطأ خام = رفض QA',10),
  ('freeze_branch','د — التجميد','برانش تجميد الفيز','release/phase-<n> مقطوع من كوميت إقفال الفيز فقط ومقفول',11),
  ('phase_copy_company','د — التجميد','نسخة الفيز على حساب الشركة','نسخة الفيز النهائية محفوظة على حسابات الشركة (Git/Drive)',12),
  ('prod_db','هـ — إعداد البرودكشن','قاعدة برودكشن مستقلة','مشروع Supabase مستقل للمشروع على الحساب المحسوم — مش جوه قاعدة مشروع تاني',13),
  ('prod_hosting','هـ — إعداد البرودكشن','استضافة برودكشن مفعّلة','مشروع الاستضافة جاهز وحدود خطته محسومة',14),
  ('prod_domain','هـ — إعداد البرودكشن','دومين وعناوين البرودكشن','العنوان الرسمي محسوم ومسجل في سجل البيئات',15),
  ('prod_channels','هـ — إعداد البرودكشن','إيميلات وقنوات الإرسال','قنوات الإيميل/واتساب/الإشعارات جاهزة بحدود إرسالها',16),
  ('prod_secrets','هـ — إعداد البرودكشن','أسرار برودكشن منفصلة','مفاتيح وأسرار البرودكشن منفصلة تمامًا عن التطوير',17),
  ('e2e_acceptance','و — اختبارات قبل الإطلاق','قبول end-to-end حي','سيناريوهات القبول الدائمة منفذة حية وموثقة قبل الإطلاق',18),
  ('backup_rehearsed','و — اختبارات قبل الإطلاق','النسخ الاحتياطي متجرب','تصدير/استرداد فعلي متجرب — مش خطة على ورق',19),
  ('launch_from_freeze','ز — الإطلاق','الإطلاق من برانش التجميد','نشر الإنتاج من release/phase-<n> فقط بعد بوابة QA نهاية الفيز',20),
  ('post_launch_verify','ز — الإطلاق','تحقق حي بعد الإطلاق','فحص حي موثق للنسخة المنشورة (لينك + نسخة + وظائف أساسية)',21),
  ('scenario_domain','ح — ما بعد البرودكشن','سيناريو تبديل الدومين','خطوات نقل العنوان الرسمي موثقة وقابلة للتنفيذ',22),
  ('scenario_hosting_move','ح — ما بعد البرودكشن','سيناريو نقل الاستضافة','خطة نقل لمزود تاني (مثل Cloudflare Pages) موثقة ومتجربة أو جاهزة',23),
  ('scenario_account_recovery','ح — ما بعد البرودكشن','سيناريو فقدان حساب والاسترداد','استرداد كامل من النسخ لو حساب اتقفل أو ضاع — موثق',24),
  ('scenario_next_phases','ح — ما بعد البرودكشن','تحديثات الفيزات الجاية','فيزات لاحقة بتمشي بنفس دورة (QA ← تجميد ← إطلاق) وموثقة',25),
  ('scenario_shutdown','ح — ما بعد البرودكشن','سيناريو إطفاء/أرشفة مشروع','إطفاء منظم + أرشفة نسخة أخيرة + توثيق السبب',26)
on conflict (step_key) do nothing;

-- ===== أول مشروع متملى بالكامل: اوس نفسه (P-3A-4) — حقائق متحقق منها 2026-11-28 =====
insert into public.pgos_project_lifecycle (project_ref, project_name, step_key, status, note) values
  ('P-3A-4','اوس — مقر الشركة','accounts_created','pending','الحسابات شغالة على حساب المالك الشخصي؛ حساب الشركة (Supabase org «3A Automation») اتعمل ومشروع pgos المخصص موجود — النقل مركون على قبول الدعوة'),
  ('P-3A-4','اوس — مقر الشركة','environments_registered','done','سجل البيئات حي من 2026-11-28 — 8 صفوف بفحص فعلي كل 30 دقيقة'),
  ('P-3A-4','اوس — مقر الشركة','repo_active','done','feature/os-ui-overhaul مدفوع للبعيد لحد ffe1789 (2026-11-28)'),
  ('P-3A-4','اوس — مقر الشركة','reference_package','pending','قالب الشركة جاهز في ops-system؛ نسخة اوس الحية جزء من إقفال فيز ٢ (بوابة الخروج)'),
  ('P-3A-4','اوس — مقر الشركة','version_line','done','منذ v0.2 — حقن آلي من package.json + وقت البناء، ظاهر في التطبيق والسبلاش'),
  ('P-3A-4','اوس — مقر الشركة','clean_code','pending','القاعدة مطبقة على الكود الجديد؛ تقسيم الملفات العملاقة (مولّد البيانات) مجدول في فيز ٢'),
  ('P-3A-4','اوس — مقر الشركة','qa_review','pending','مراجعة مسؤول المسار قائمة لكل دفعة؛ بوابة QA نهاية الفيز لسه (مخططة مع إقفال كل فيز)'),
  ('P-3A-4','اوس — مقر الشركة','authz_tests','pending','تحقق RLS يدوي موثق (مالك = كامل / غير مالك = صفر / anon = 401)؛ الحزمة الآلية الكاملة ضمن بوابة فيز ٢'),
  ('P-3A-4','اوس — مقر الشركة','visual_375','done','لقطات 375px موثقة لكل نشر ولكل صفحة جديدة (آخرها سجل البيئات v0.6.0)'),
  ('P-3A-4','اوس — مقر الشركة','no_raw_errors','done','تدقيق 2026-11-26 + إصلاح 8f3ec24 — الفيتشرات النايمة بحالات مهذبة'),
  ('P-3A-4','اوس — مقر الشركة','freeze_branch','pending','مخطط 2026-11-30 مع إقفال فيز ١ (release/phase-1 من كوميت الإقفال)'),
  ('P-3A-4','اوس — مقر الشركة','phase_copy_company','pending','بيتم مع التجميد — لسه ما حصلش لأي فيز لاوس'),
  ('P-3A-4','اوس — مقر الشركة','prod_db','pending','Path A الحالي: جداول pgos_ جوه teacher-app؛ المشروع المخصص جاهز والنقل واقف على قبول دعوة المنظمة'),
  ('P-3A-4','اوس — مقر الشركة','prod_hosting','pending','Vercel محظور حاليًا على مستوى الفريق (fair use — قرار الترقية عند المالك)'),
  ('P-3A-4','اوس — مقر الشركة','prod_domain','done','pgos-taupe.vercel.app هو عنوان الإنتاج المسجل'),
  ('P-3A-4','اوس — مقر الشركة','prod_channels','na','اوس بلا قنوات إرسال خارجية — التنبيهات جوه التطبيق وسلاك بس'),
  ('P-3A-4','اوس — مقر الشركة','prod_secrets','pending','الفصل الكامل بيتم مع نقل حساب الشركة؛ حاليًا مفاتيح النشر على مسار التطوير'),
  ('P-3A-4','اوس — مقر الشركة','e2e_acceptance','pending','فحوص حية جزئية موثقة مع كل نشر؛ قبول نهاية فيز ٢ مخطط 2026-12-11'),
  ('P-3A-4','اوس — مقر الشركة','backup_rehearsed','done','تصدير كامل متجرب ومتكرر — آخره 2026-11-28 (25 جدول، 577 بند) + استرداد التصدير موثق في خطة النقل'),
  ('P-3A-4','اوس — مقر الشركة','launch_from_freeze','pending','إنتاج 2.0 مخطط 2026-12-12 من release/phase-2 بعد بوابة QA'),
  ('P-3A-4','اوس — مقر الشركة','post_launch_verify','pending','بيتنفذ موثقًا مع كل نشر جزئي؛ إطلاق البرودكشن الرسمي لسه'),
  ('P-3A-4','اوس — مقر الشركة','scenario_domain','pending','لسه ما اتوثقش كسيناريو مستقل'),
  ('P-3A-4','اوس — مقر الشركة','scenario_hosting_move','pending','مسار Cloudflare Pages اتجرب فعليًا لمستر الليلة؛ توثيقه كسيناريو اوس لسه'),
  ('P-3A-4','اوس — مقر الشركة','scenario_account_recovery','pending','النسخ موجودة (تصدير قاعدة + Git كامل)؛ وثيقة السيناريو لسه'),
  ('P-3A-4','اوس — مقر الشركة','scenario_next_phases','done','نظام الفيزات + بوابة خروج فيز ٢ موثقان (PHASES.md + قواعد المالك 2026-11-27)'),
  ('P-3A-4','اوس — مقر الشركة','scenario_shutdown','pending','لسه ما اتوثقش')
on conflict (project_ref, step_key) do nothing;

-- ===== باقي المشاريع: صفوف مسجلة ومعروضة من دلوقتي — التقييم بيتملى على قالب خطة نقل مستر عند وصولها =====
insert into public.pgos_project_lifecycle (project_ref, project_name, step_key, status, note)
select p.ref, p.name, s.step_key, 'pending', 'لسه ما اتقيّمتش — بتتملى على قالب خطة نقل برودكشن مستر أول ما توصل لمسؤول اوس'
from (values ('P-3A-5','مستر — تطبيق المدرسين'), ('P-3A-8','نونو — نظام الحضانة'),
             ('P-3A-6','مساعد الأعمال — AIBA'), ('P-3A-9','Wedora — دعوات الأفراح')) as p(ref, name)
cross join public.pgos_lifecycle_steps s
on conflict (project_ref, step_key) do nothing;
