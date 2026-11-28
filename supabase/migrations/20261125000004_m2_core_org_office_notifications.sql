-- مهاجرة M2 الأساسية (اوس): التنظيم + طاقم المكتب الافتراضي + سجل الإشعارات
-- القرار: شرط المالك الصريح (2026-11-25) — موظفو المكتب الـ22 ومكاتبهم وغرفهم وأقسامهم
-- بيانات قاعدة (قراءة وكتابة)، والـseed الحالي مؤقت للتجربة بس.
-- قرار تصميمي (مسؤول اوس): pgos_departments/pgos_employees = طاقم المكتب الافتراضي
-- (عقد طبقة بيانات المقر في src/office/types.ts)، وسجل التنظيم الحقيقي (وكلاء الشركة)
-- في pgos_org_departments/pgos_org_employees — طاقمان مختلفان، ممنوع خلطهم.
-- المنح صح من أول مرة (درس M1a): anon برّه، authenticated قراءة بس، service_role كامل.

CREATE TABLE IF NOT EXISTS public.pgos_departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_office_rooms (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL REFERENCES public.pgos_departments(id),
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    department_id TEXT REFERENCES public.pgos_departments(id),
    desk INTEGER,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('working', 'idle', 'offline')),
    tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_task TEXT,
    tasks_open INTEGER NOT NULL DEFAULT 0,
    projects INTEGER NOT NULL DEFAULT 0,
    rating NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_org_departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    description TEXT,
    projects JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_org_employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initial TEXT,
    color TEXT,
    dept_name TEXT,
    role TEXT,
    status TEXT,
    group_name TEXT,
    project_ref TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_notification_types (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    default_on BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_notification_prefs (
    device_id TEXT NOT NULL,
    type_id TEXT NOT NULL REFERENCES public.pgos_notification_types(id),
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (device_id, type_id)
);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['pgos_departments','pgos_office_rooms','pgos_employees',
                             'pgos_org_departments','pgos_org_employees',
                             'pgos_notification_types','pgos_notification_prefs']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, public', t);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
        EXECUTE format('DROP POLICY IF EXISTS owner_read_%I ON public.%I', t, t);
        EXECUTE format('CREATE POLICY owner_read_%I ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    END LOOP;
END $$;
