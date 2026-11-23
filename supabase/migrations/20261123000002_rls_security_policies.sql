-- Migration: 20261123000002_rls_security_policies.sql
-- Description: Strict Row Level Security (RLS) enforcement
-- Invariant: Zero public access (anon role blocked completely), authenticated owner read-only, service-role worker write-only.

-- 1. Enable Row Level Security (RLS) across all PGOS tables
ALTER TABLE public.pgos_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgos_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgos_hq_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgos_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgos_sync_runs ENABLE ROW LEVEL SECURITY;

-- 2. Revoke all default privileges from public and anonymous roles
REVOKE ALL ON TABLE public.pgos_projects FROM anon, public;
REVOKE ALL ON TABLE public.pgos_issues FROM anon, public;
REVOKE ALL ON TABLE public.pgos_hq_decisions FROM anon, public;
REVOKE ALL ON TABLE public.pgos_releases FROM anon, public;
REVOKE ALL ON TABLE public.pgos_sync_runs FROM anon, public;

-- 3. Grant SELECT privileges only to authenticated users (owner session)
GRANT SELECT ON TABLE public.pgos_projects TO authenticated;
GRANT SELECT ON TABLE public.pgos_issues TO authenticated;
GRANT SELECT ON TABLE public.pgos_hq_decisions TO authenticated;
GRANT SELECT ON TABLE public.pgos_releases TO authenticated;
GRANT SELECT ON TABLE public.pgos_sync_runs TO authenticated;

-- 4. Grant full management privileges to service_role (used strictly by background sync worker)
GRANT ALL ON TABLE public.pgos_projects TO service_role;
GRANT ALL ON TABLE public.pgos_issues TO service_role;
GRANT ALL ON TABLE public.pgos_hq_decisions TO service_role;
GRANT ALL ON TABLE public.pgos_releases TO service_role;
GRANT ALL ON TABLE public.pgos_sync_runs TO service_role;

-- 5. Define SELECT policies for authenticated users
CREATE POLICY "owner_read_pgos_projects"
    ON public.pgos_projects
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "owner_read_pgos_issues"
    ON public.pgos_issues
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "owner_read_pgos_hq_decisions"
    ON public.pgos_hq_decisions
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "owner_read_pgos_releases"
    ON public.pgos_releases
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "owner_read_pgos_sync_runs"
    ON public.pgos_sync_runs
    FOR SELECT
    TO authenticated
    USING (true);

-- 6. No INSERT, UPDATE, or DELETE policies exist for authenticated or anon.
-- Any direct write attempt from client applications will be automatically rejected by Postgres RLS.
