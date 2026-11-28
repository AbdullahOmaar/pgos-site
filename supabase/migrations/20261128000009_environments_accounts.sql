-- إضافة المالك (2026-11-28 ~01:49): سجل البيئات يوضّح كمان كل حاجة على حساب مين.
-- أعمدة حسابات: Supabase / الاستضافة / الريبو / Drive — أي حساب مش متأكد منه NULL ويظهر «—».

alter table public.pgos_environments add column if not exists account_supabase text;
alter table public.pgos_environments add column if not exists account_hosting text;
alter table public.pgos_environments add column if not exists account_repo text;
alter table public.pgos_environments add column if not exists account_drive text;

-- ===== القيم المتحقق منها (سجل مسؤول اوس) =====
-- قاعدة مستر واوس: مشروع teacher-app على حساب المالك الشخصي (org plarxuqqydupkwfrndkv).
update public.pgos_environments
set account_supabase = 'حساب المالك الشخصي — Supabase (مشروع teacher-app)',
    account_hosting = 'حساب المالك الشخصي — Vercel',
    account_repo = 'تطوير: AbdullahOmaar (شخصي) — Git الشركة: لسه ما اتعملتش مرآة'
where project_ref = 'P-3A-5' and env_key in ('production','dev');

-- نسخة مستر Cloudflare: حساب Cloudflare مش مؤكد عند مسؤول اوس — يفضل فاضي «—».
update public.pgos_environments
set account_supabase = 'حساب المالك الشخصي — Supabase (مشروع teacher-app)',
    account_repo = 'تطوير: AbdullahOmaar (شخصي) — Git الشركة: لسه ما اتعملتش مرآة'
where project_ref = 'P-3A-5' and env_key = 'production-alt';

-- نونو: قاعدة مستقلة على نفس حساب المالك الشخصي (org plarxuqqydupkwfrndkv — مشروع eodzmizxvkwxelrexopl).
update public.pgos_environments
set account_supabase = 'حساب المالك الشخصي — Supabase (مشروع نونو المستقل)',
    account_hosting = 'حساب المالك الشخصي — Vercel'
where project_ref = 'P-3A-8';

-- حسو: قاعدة مستقلة على حساب المالك الشخصي (مشروع roecxpfluxwevbgaxphj — موقوفة حاليًا).
update public.pgos_environments
set account_supabase = 'حساب المالك الشخصي — Supabase (مشروع حسو المستقل — موقوف)',
    account_hosting = 'حساب المالك الشخصي — Vercel'
where project_ref = 'P-3A-6' and env_key = 'production';

-- اوس: الجداول جوه teacher-app على حساب المالك الشخصي؛ المشروع المخصص على حساب الشركة موجود والنقل مركون.
update public.pgos_environments
set account_supabase = 'حساب المالك الشخصي — Supabase (جداول pgos_ جوه teacher-app)؛ المشروع المخصص pgos على حساب الشركة 3aautomation — النقل مركون',
    account_hosting = 'حساب المالك الشخصي — Vercel (فريق thepresidentabdo-9110)',
    account_repo = 'تطوير: AbdullahOmaar (شخصي) — Git الشركة: لسه ما اتعملتش مرآة'
where project_ref = 'P-3A-4';

-- account_drive بيضل NULL للكل («—»): نسخ Drive مش متحققة عند مسؤول اوس لأي مشروع.
