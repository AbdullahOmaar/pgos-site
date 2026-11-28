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

/* تنبيه حارس — اللقطة: من guard.alerts (entry/title/missing/ts)؛ الحي: صف pgos_guard_alerts */
export interface LiveGuardAlert {
  id: string
  title: string
  detail: string | null
  status: string
  created_at: string
  missing: string[]
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
  guardAlertList: LiveGuardAlert[]
  /* بيانات المقر الافتراضي (P2-09) من جداول pgos_departments/pgos_employees —
     null = غير متاحة من هذا المصدر، فتسقط صفحة المقر على البذرة كملاذ أخير. */
  office: OfficeData | null
  /* سجلات مواثيق المشاريع (records.projects) لصفحة «المشاريع ومواثيقها» (P2-19):
     من اللقطة بس — عقد القراءة الحي مفيهوش جداول مواثيق، فالحي = null («غير متاح
     من الحي») واللقطة = القائمة (ممكن تكون فاضية). الدمج مع المشاريع بالمطابقة
     (رابط Linear الكانوني أو الاسم) بيتم في الصفحة، والسجل اللي ملوش مقابل
     بيظهر لوحده بصدق — مفيش اختراع مطابقات. */
  projectCharters: Record<string, unknown>[] | null
  /* جداول مهاجرة 20261127000007 (حية 2026-11-27): إشعارات التطبيق وقيود الزمن.
     null = غير متاحة من هذا المصدر (اللقطة لا تحملها؛ أو فشل جلبها الحي منفصلًا —
     الجلب متسامح: فشل الجدولين دول لا يُسقط القراءة الحية كلها).
     read في الإشعار = له قيد في pgos_notification_reads على أي جهاز للمالك. */
  notifications: LiveNotification[] | null
  timeEntries: LiveTimeEntry[] | null
  /* سجل البيئات (مهاجرة 20261128000008): null = غير متاح من هذا المصدر.
     الحالة من فحص فعلي كل ٣٠ دقيقة (tools/env_check.py) — checked_at كما هو. */
  environments: LiveEnvironment[] | null
  /* دورة حياة المشروع (مهاجرة 20261128000010): null = غير متاح من هذا المصدر */
  lifecycle: { steps: LiveLifecycleStep[]; states: LiveLifecycleState[] } | null
}

export interface LiveLifecycleStep {
  step_key: string
  section: string
  title: string
  description: string | null
  sort_order: number
}

export interface LiveLifecycleState {
  project_ref: string
  project_name: string
  step_key: string
  status: string
  note: string | null
  updated_at: string
}

export interface LiveEnvironment {
  project_ref: string
  project_name: string
  env_key: string
  env_label: string
  url: string | null
  hosting: string | null
  version: string | null
  last_deploy_at: string | null
  status: string
  http_code: number | null
  checked_at: string | null
  repo_dev: string | null
  repo_company: string | null
  account_supabase: string | null
  account_hosting: string | null
  account_repo: string | null
  account_drive: string | null
  note: string | null
  sort_order?: number
}

export interface LiveNotification {
  id: string
  type_id: string | null
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  route: string | null
  severity: string | null
  created_at: string
  source: string | null
  read: boolean
}

export interface LiveTimeEntry {
  id: string
  issue_id: string
  actor: string | null
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  origin: string | null
  note: string | null
}
