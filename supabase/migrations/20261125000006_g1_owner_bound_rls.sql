-- 20261125000006_g1_owner_bound_rls.sql
-- G1 (RFC §3.7 + DB-DESIGN-RFC G1): ربط سياسات RLS بهوية المالك — قرار مدير 2026-11-25 على P3.
-- هوية المالك = حسابه الحالي في teacher-app (abdullahomarrefaat@gmail.com)
--   auth.users id 13fb7434-3bcb-4be7-a106-0c4431e799e1 (متحقق حيًا من auth.users 2026-11-25).
-- لا حساب جديد ولا كلمة مرور جديدة: المالك يدخل بحسابه الحالي.
-- القاعدة: أي حساب مصادق غير المالك يرى صفر صفوف (fail-closed: لو الهوية null فلا أحد يرى شيئًا).
-- ملاحظة: ALTER DEFAULT PRIVILEGES متعمدًا خارج هذه المهاجرة — لا يمكن قصره على جداول pgos_
--   وكان سيغيّر وضع جداول مستر المستقبلية في نفس السكيما. الجداول الجديدة من pgos_ لازم تحمل
--   سياسة owner_read_ صراحةً (يتحقق منها في التحقق الخماسي).

-- 1) ثبّت هوية المالك في الإعدادات
UPDATE public.pgos_settings
SET value = '"13fb7434-3bcb-4be7-a106-0c4431e799e1"'::jsonb, updated_at = now()
WHERE key = 'owner_auth_uid';

-- 2) دالة مساعدة تقرأ الهوية داخل السياسات (SECURITY DEFINER: تقرأ الإعدادات دون التفات لـRLS)
CREATE OR REPLACE FUNCTION public.pgos_owner_uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT (value #>> '{}')::uuid FROM public.pgos_settings WHERE key = 'owner_auth_uid' $$;
REVOKE ALL ON FUNCTION public.pgos_owner_uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pgos_owner_uid() TO authenticated, anon;

-- 3) استبدال سياسات القراءة على كل جداول pgos_ الـ22
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pgos_projects','pgos_issues','pgos_hq_decisions','pgos_releases','pgos_checklist_items',
    'pgos_sync_runs','pgos_departments','pgos_office_rooms','pgos_employees',
    'pgos_org_departments','pgos_org_employees','pgos_notification_types','pgos_notification_prefs',
    'pgos_devices','pgos_sprints','pgos_sprint_items','pgos_production_registry',
    'pgos_guard_alerts','pgos_records','pgos_ledger','pgos_issue_events','pgos_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'owner_read_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = public.pgos_owner_uid())',
      'owner_read_' || t, t
    );
  END LOOP;
  -- اسم سياسة قديم مختلف في pgos_checklist_items — إسقاطه صراحةً (سياسة service_role تُترك كما هي)
  DROP POLICY IF EXISTS "Allow authenticated owner read checklist" ON public.pgos_checklist_items;
END $$;

-- 4) سحب المنح الزائدة من authenticated على كل الجداول (انحراف مكتشف أثناء G1:
--    مهاجرتا 000004/000005 تركا المنح الافتراضية الكاملة على 16 جدولًا؛ RLS كان يحجب
--    الكتابة بغياب سياسات كتابة، لكن المنح الزائدة خطر كامن — SELECT-only مثل الستة الأصلية بعد M1a)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pgos_projects','pgos_issues','pgos_hq_decisions','pgos_releases','pgos_checklist_items',
    'pgos_sync_runs','pgos_departments','pgos_office_rooms','pgos_employees',
    'pgos_org_departments','pgos_org_employees','pgos_notification_types','pgos_notification_prefs',
    'pgos_devices','pgos_sprints','pgos_sprint_items','pgos_production_registry',
    'pgos_guard_alerts','pgos_records','pgos_ledger','pgos_issue_events','pgos_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
  END LOOP;
END $$;
