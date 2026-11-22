-- Migration: 20261123000001_initial_schema.sql
-- Description: Core tables for PGOS dynamic data layer (Projects, Issues, HQ Decisions, Releases, Sync Runs)
-- Invariant: Statement-by-statement DDL, deterministic keys, canonical Linear references.

-- 1. Projects mirror table
CREATE TABLE IF NOT EXISTS public.pgos_projects (
    id UUID PRIMARY KEY,
    linear_id TEXT UNIQUE,
    name TEXT NOT NULL,
    summary TEXT,
    url TEXT,
    color TEXT,
    status_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 2. Issues mirror table
CREATE TABLE IF NOT EXISTS public.pgos_issues (
    id UUID PRIMARY KEY,
    identifier TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    status_name TEXT NOT NULL,
    status_type TEXT NOT NULL,
    priority_value INTEGER NOT NULL DEFAULT 0,
    due_date TIMESTAMPTZ,
    url TEXT,
    project_id UUID REFERENCES public.pgos_projects(id) ON DELETE SET NULL,
    project_linear_id TEXT,
    assignee_id TEXT,
    assignee_name TEXT,
    labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 3. HQ Decisions table
CREATE TABLE IF NOT EXISTS public.pgos_hq_decisions (
    id TEXT PRIMARY KEY,
    heading TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT,
    effective_date TEXT,
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Releases table
CREATE TABLE IF NOT EXISTS public.pgos_releases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_id UUID REFERENCES public.pgos_projects(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    released_at TIMESTAMPTZ,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Sync audit runs table
CREATE TABLE IF NOT EXISTS public.pgos_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    projects_count INTEGER NOT NULL DEFAULT 0,
    issues_count INTEGER NOT NULL DEFAULT 0,
    diff_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    source TEXT NOT NULL DEFAULT 'linear'
);

-- 6. Essential indexes for query performance
CREATE INDEX IF NOT EXISTS idx_pgos_issues_project_id ON public.pgos_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_pgos_issues_status_type ON public.pgos_issues(status_type);
CREATE INDEX IF NOT EXISTS idx_pgos_issues_updated_at ON public.pgos_issues(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pgos_issues_identifier ON public.pgos_issues(identifier);
CREATE INDEX IF NOT EXISTS idx_pgos_projects_linear_id ON public.pgos_projects(linear_id);
CREATE INDEX IF NOT EXISTS idx_pgos_sync_runs_started_at ON public.pgos_sync_runs(started_at DESC);
