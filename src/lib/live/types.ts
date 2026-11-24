/* أنواع عقد القراءة الحي — مصدرها docs/READ-CONTRACT.md §4 و docs/DB-DESIGN-RFC-2026-11-23.md
   الواجهة الجديدة (3A-352) تستهلك هذه الأنواع فقط؛ أي مصدر بيانات لازم يطابقها. */

export type IssueStatusType = 'completed' | 'started' | 'unstarted' | 'backlog' | 'canceled' | string

export interface LiveProject {
  id: string
  linear_id: string | null
  name: string
  summary: string | null
  url: string | null
  color: string | null
  status_name: string | null
  created_at: string
  updated_at: string
}

export interface LiveIssue {
  id: string
  identifier: string
  title: string
  status_name: string
  status_type: IssueStatusType
  priority_value: number
  due_date: string | null
  url: string | null
  project_id: string | null
  assignee_name: string | null
  labels: string[]
  started_at: string | null
  completed_at: string | null
  archived_at: string | null
  updated_at: string
  estimate_hours?: number | null
}

export interface LiveDecision {
  id: string
  heading: string
  body: string
  category: string | null
  effective_date: string | null
}

export interface LiveRelease {
  id: string
  name: string
  project_id: string | null
  status: string
  released_at: string | null
  description: string | null
}

export interface LiveSyncRun {
  id: string
  started_at: string
  finished_at: string | null
  status: string
  issues_count: number | null
}

export type DataSourceKind = 'live' | 'snapshot' | 'unavailable'

export interface OsDataset {
  source: DataSourceKind
  generatedAt: string | null
  projects: LiveProject[]
  issues: LiveIssue[]
  decisions: LiveDecision[]
  releases: LiveRelease[]
  lastSync: LiveSyncRun | null
  openRisks: number
  ledgerCount: number
  ledgerVerified: boolean
  guardAlerts: number
}
