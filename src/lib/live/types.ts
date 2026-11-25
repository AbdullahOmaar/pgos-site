/* أنواع عقد القراءة الحي — مصدرها docs/READ-CONTRACT.md §4 و docs/DB-DESIGN-RFC-2026-11-23.md
   الواجهة الجديدة (3A-352) تستهلك هذه الأنواع فقط؛ أي مصدر بيانات لازم يطابقها. */

import type { OfficeData } from '../../office/types'

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

export type ChecklistStatus = 'done' | 'partial' | 'not_started' | 'na' | 'not_evaluated' | string

export interface LiveChecklistItem {
  id: number
  check_number: number
  category: string
  title: string
  how_to_verify: string | null
  project_statuses: Record<string, { status: string; evidence?: string }>
}

/* جداول M2 (مهاجرة 000004) — تنظيم الشركة الحقيقي، منفصل تمامًا عن طاقم المكتب الافتراضي */
export interface LiveOrgDepartment {
  id: string
  name: string
  color: string | null
  description: string | null
  projects: string[]
  sort_order: number
}

export interface LiveOrgEmployee {
  id: string
  name: string
  initial: string | null
  color: string | null
  dept_name: string | null
  role: string | null
  status: string | null
  group_name: string | null
  project_ref: string | null
}

export interface LiveNotificationType {
  id: string
  label: string
  description: string | null
  default_on: boolean
  active: boolean
}

export type DataSourceKind = 'live' | 'snapshot' | 'unavailable'

export interface OsDataset {
  source: DataSourceKind
  generatedAt: string | null
  projects: LiveProject[]
  issues: LiveIssue[]
  decisions: LiveDecision[]
  releases: LiveRelease[]
  checklist: LiveChecklistItem[]
  orgDepartments: LiveOrgDepartment[]
  orgEmployees: LiveOrgEmployee[]
  notificationTypes: LiveNotificationType[]
  notificationPrefsCount: number
  lastSync: LiveSyncRun | null
  /* null = «غير متاح من الحي» — لازم الواجهة تميّزه عن الصفر الفعلي، مش تعرضه صفر.
     - openRisks: جدول pgos_records بلا حالة مخاطر (المخاطر في اللقطة منسّقة يدويًا) → null على الحي لحد نمذجتها.
     - ledgerVerified: التحقق من سلسلة الهاش دالة خط الأنابيب القانونية؛ المحوّل ما يعيدش تنفيذها → null.
     - ledgerCount / guardAlerts: أرقام حقيقية من الحي (عدد صفوف السجل / تنبيهات status=open). */
  openRisks: number | null
  ledgerCount: number | null
  ledgerVerified: boolean | null
  guardAlerts: number | null
  /* بيانات المقر الافتراضي (P2-09) من جداول pgos_departments/pgos_employees —
     null = غير متاحة من هذا المصدر، فتسقط صفحة المقر على البذرة كملاذ أخير. */
  office: OfficeData | null
}
