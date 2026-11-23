-- Migration: 20261123000003_decisions_releases_and_checklist.sql
-- Description: Add checklist items table, expand decisions schema with rationale, add started_at to issues, and apply strict RLS policies.
-- Invariant: Statement-by-statement DDL, deterministic keys, canonical project references.

-- 1. Ensure rationale column exists on pgos_hq_decisions
ALTER TABLE public.pgos_hq_decisions ADD COLUMN IF NOT EXISTS rationale TEXT;

-- 2. Ensure started_at column exists on pgos_issues (tracking work pickup time)
ALTER TABLE public.pgos_issues ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_issues_started_at ON public.pgos_issues(started_at);

-- 3. Pre-production 45-Checklist table
CREATE TABLE IF NOT EXISTS public.pgos_checklist_items (
    id INTEGER PRIMARY KEY,
    check_number INTEGER UNIQUE NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    how_to_verify TEXT,
    teacher_status TEXT NOT NULL DEFAULT 'not_evaluated',
    teacher_evidence TEXT,
    nounou_status TEXT NOT NULL DEFAULT 'not_evaluated',
    nounou_evidence TEXT,
    pgos_status TEXT NOT NULL DEFAULT 'not_evaluated',
    pgos_evidence TEXT,
    aiba_status TEXT NOT NULL DEFAULT 'not_evaluated',
    aiba_evidence TEXT,
    notes TEXT,
    project_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Indexes for checklist performance
CREATE INDEX IF NOT EXISTS idx_checklist_category ON public.pgos_checklist_items(category);
CREATE INDEX IF NOT EXISTS idx_checklist_check_number ON public.pgos_checklist_items(check_number);
CREATE INDEX IF NOT EXISTS idx_checklist_teacher_status ON public.pgos_checklist_items(teacher_status);
CREATE INDEX IF NOT EXISTS idx_checklist_pgos_status ON public.pgos_checklist_items(pgos_status);

-- 5. Enable RLS on pgos_checklist_items
ALTER TABLE public.pgos_checklist_items ENABLE ROW LEVEL SECURITY;

-- 6. Revoke public/anon access
REVOKE ALL ON TABLE public.pgos_checklist_items FROM anon, public;

-- 7. Grant read-only access to authenticated owner role
GRANT SELECT ON TABLE public.pgos_checklist_items TO authenticated;

-- 8. Grant full administrative privileges to service_role (sync worker)
GRANT ALL ON TABLE public.pgos_checklist_items TO service_role;

-- 9. Explicit read policy for authenticated users
DROP POLICY IF EXISTS "Allow authenticated owner read checklist" ON public.pgos_checklist_items;
CREATE POLICY "Allow authenticated owner read checklist"
    ON public.pgos_checklist_items
    FOR SELECT
    TO authenticated
    USING (true);

-- 10. Explicit write policy for service_role
DROP POLICY IF EXISTS "Allow service role manage checklist" ON public.pgos_checklist_items;
CREATE POLICY "Allow service role manage checklist"
    ON public.pgos_checklist_items
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
