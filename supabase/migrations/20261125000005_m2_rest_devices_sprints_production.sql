-- مهاجرة M2 الباقية (اوس): الأجهزة + السبرنت + البرودكشن + تنبيهات الحارس + السجلات + أحداث البنود + الإعدادات
-- المصدر: RFC §٣.٢ — الجداول دي بتنقل آخر بيانات تشغيل كانت عايشة في ملفات/إعدادات كود
-- لقاعدة البيانات (G5). المنح بنفس نمط 000004: anon برّه، authenticated قراءة، service_role كامل.
-- ملحوظة: pgos_issue_events بتتبني هنا كجدول، وملؤها مسؤولية تطوير عامل المزامنة (M3/G6).

CREATE TABLE IF NOT EXISTS public.pgos_devices (
    id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    fingerprint TEXT,
    registered_at TIMESTAMPTZ,
    last_open_at TIMESTAMPTZ,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_sprints (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    points JSONB NOT NULL DEFAULT '[]'::jsonb,
    range_text TEXT,
    projects JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_sprint_items (
    sprint_id TEXT NOT NULL REFERENCES public.pgos_sprints(id),
    issue_identifier TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sprint_id, issue_identifier)
);

CREATE TABLE IF NOT EXISTS public.pgos_production_registry (
    project_ref TEXT PRIMARY KEY,
    short TEXT,
    name TEXT NOT NULL,
    url TEXT,
    status TEXT,
    version TEXT,
    screen TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_guard_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.pgos_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    title TEXT,
    body TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGINT NOT NULL,
    prev_hash TEXT,
    entry_hash TEXT,
    entry JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pgos_issue_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_identifier TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pgos_issue_events_issue ON public.pgos_issue_events (issue_identifier, created_at);

CREATE TABLE IF NOT EXISTS public.pgos_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['pgos_devices','pgos_sprints','pgos_sprint_items','pgos_production_registry',
                             'pgos_guard_alerts','pgos_records','pgos_ledger','pgos_issue_events','pgos_settings']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, public', t);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
        EXECUTE format('DROP POLICY IF EXISTS owner_read_%I ON public.%I', t, t);
        EXECUTE format('CREATE POLICY owner_read_%I ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    END LOOP;
END $$;

INSERT INTO public.pgos_settings (key, value) VALUES
    ('schema_version', '"m2"'::jsonb),
    ('owner_auth_uid', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
