/* أنواع نموذج العرض — مصدرها الوحيد public/data/site-data.json المولّد آليًا */

import type { OfficeData } from './office/types'

export interface SourceFreshness {
  source: string
  files?: number
  modified_at: string
  age_seconds: number
  stale: boolean
}

export interface SiteMeta {
  generated_at: string
  generator: string
  /** هل هذه النسخة مُنقّاة (بيانات DEMO مصنّعة بلا أي مصدر حقيقي)؟ */
  sanitized?: boolean
  /** عدد ملفات المصادر المُدقّقة — البصمات نفسها محلية ولا تُخدَّم */
  source_files_count?: number
  sources_freshness: SourceFreshness[]
}

/** سجل حوكمة PGOS كما هو في ملفه الأصلي — الحقول تختلف حسب record_type */
export type PgosRecord = {
  record_type: string
  id: string
  [key: string]: unknown
}

export interface RecordsByGroup {
  projects: PgosRecord[]
  decisions: PgosRecord[]
  work_orders: PgosRecord[]
  risks: PgosRecord[]
  evidence: PgosRecord[]
  releases: PgosRecord[]
  changes: PgosRecord[]
  handoffs: PgosRecord[]
  incidents: PgosRecord[]
}

export interface LedgerEntry {
  id: string
  ts: string
  type: string
  project: string
  title: string
  summary?: string
  refs?: Record<string, unknown>
  legs?: Record<string, unknown>
  backfilled?: boolean
}

export interface LinearProject {
  linearId?: string
  uuid: string
  name: string
  summary?: string
  url?: string
  color?: string
  statusName?: string
  /** ملف الحمولة الذي جاء منه المشروع (وسم المصدر) */
  sourceFile?: string
}

export interface HqDecisionBlock {
  heading: string
  body: string
}

export interface HqDecisions {
  available: boolean
  snapshot_at: string | null
  source: string | null
  extraction_note: string
  blocks: HqDecisionBlock[]
}

/* ---------- جدول فحص ما قبل الإنتاج (ops-system/checklist/preprod-checklist.json) ---------- */

/** حالة فحص واحدة لتطبيق ما — not_evaluated تعني لم يُقيّم فعليًا بعد، ولا تُدمج مع «لم يبدأ» */
export type PreprodStatus = 'done' | 'partial' | 'not_started' | 'na' | 'not_evaluated'

export interface PreprodAppStatus {
  status: PreprodStatus
  /** رمز الحالة كما ورد في ملف المقر (لتطبيق المدرس) */
  symbol?: string
  /** نص الدليل — لتطبيق المدرس: نص عمود «موقع PGOS» في CSV الأصلي، وهو أدلة المدرس فعليًا */
  evidence?: string
}

export interface PreprodCheck {
  id: number
  category: string
  item: string
  how: string
  apps: {
    teacher: PreprodAppStatus
    nounou: { status: PreprodStatus }
    pgos: { status: PreprodStatus }
  }
  /** نص عمود «موقع PGOS» في CSV الأصلي كما ورد حرفيًا (حفظ أمين للمصدر) */
  raw_pgos_column: string
  notes_column: string
}

export interface PreprodChecklist {
  available: boolean
  meta: {
    title: string
    source: string
    source_file_id: string
    snapshot_at: string
    register_built_at: string
    design_note: string
    column_issue: string
    counts: {
      total: number
      categories: number
      teacher: { done: number; partial: number; not_started: number; na: number }
      nounou_not_evaluated: number
      pgos_not_evaluated: number
    }
  } | null
  categories: string[]
  checks: PreprodCheck[]
}

/* ---------- مرجع الحوكمة (tools/governance_ref.json — ملخّص يدوي موثق المصدر) ---------- */

export interface GovAuthorityRow {
  category: string
  canonical_at_us: string
  canonical_in_pgos: string
  mirrors: string
}

export interface GovPermissionLevel {
  level: string
  defined: boolean
  meaning: string
  approval_ref?: string
}

export interface GovDeviation {
  id: string
  deviation: string
  reason: string
  approver: string
}

export interface GovAdoptionStep {
  n: number
  step: string
  status: 'done' | 'partial' | string
  status_label: string
  detail: string
}

export interface GovGap {
  n: number
  title: string
  source: string
  impact: string
}

export interface GovernanceRef {
  available: boolean
  meta?: {
    title: string
    source_docs: string[]
    note: string
    pgos_version: string
  }
  authority_model?: {
    principle: string
    rows: GovAuthorityRow[]
    selection_rules: string[]
    no_silent_mirroring: string
  }
  principals?: { name: string; detail: string }[]
  owner_channel_rule?: string
  roles?: {
    pgos_roles: { role: string; responsibility: string }[]
    at_us_chain: string
    approval_at_us: string
    assignment_note: string
    exception_dec_pgos_003: string
  }
  permission_levels?: {
    note: string
    levels: GovPermissionLevel[]
    high_impact_actions: string[]
    high_impact_note: string
  }
  deviations?: GovDeviation[]
  adoption_steps?: GovAdoptionStep[]
  gaps?: GovGap[]
  verification_pipeline?: { steps: string[]; status_note: string }
}

export interface LinearIssue {
  uuid: string
  identifier: string
  title: string
  description?: string
  statusName?: string
  statusType?: string
  priorityValue?: number
  dueDate?: string | null
  url?: string
  projectUuid?: string
  startedAt?: string | null
  completedAt?: string | null
  archivedAt?: string | null
  updatedAt?: string
}

export interface GuardAlert {
  ts: string
  entry: string
  title: string
  missing: string[]
}

export interface ValidationResult {
  id: string
  record_type: string
  ok: boolean
  problems: string[]
  /** ملحوظات لا تُسقِط السجل (مثل حقول حُذفت من الإخراج بقائمة السماح) */
  notes?: string[]
}

export interface SiteData {
  meta: SiteMeta
  records: RecordsByGroup
  ledger: {
    chain_verified: boolean
    count: number
    last_id: string | null
    entries: LedgerEntry[]
  }
  linear: {
    projects: LinearProject[]
    issues: LinearIssue[]
  }
  hq_decisions: HqDecisions
  preprod_checklist: PreprodChecklist
  governance_ref: GovernanceRef
  /* بيانات المقر الافتراضي من قاعدة اوس (P2-09) — غائبة لو تعذّرت قراءتها وقت التوليد */
  office?: OfficeData | null
  /* سجل البيئات من قاعدة اوس (مهاجرة 20261128000008) — غائب لو تعذّرت قراءته وقت التوليد */
  environments?: {
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
    note: string | null
    sort_order?: number
  }[] | null
  /* سجل التنظيم والإشعارات من قاعدة اوس — غائب لو تعذّرت قراءته وقت التوليد */
  org?: {
    departments: {
      id: string
      name: string
      color: string | null
      description: string | null
      projects: string[]
      sort_order: number
    }[]
    employees: {
      id: string
      name: string
      initial: string | null
      color: string | null
      dept_name: string | null
      role: string | null
      status: string | null
      group_name: string | null
      project_ref: string | null
    }[]
    notification_types: {
      id: string
      label: string
      description: string | null
      default_on: boolean
      active: boolean
    }[]
    notification_prefs_count: number
  } | null
  guard: {
    state: {
      last_run?: string
      alerted?: string[]
      linear_cache?: Record<string, { status: string; at: string }>
      [key: string]: unknown
    }
    alerts: GuardAlert[]
  }
  internal_validation: {
    kind: string
    label: string
    summary: { total: number; ok: number; failed: number }
    results: ValidationResult[]
  }
}
