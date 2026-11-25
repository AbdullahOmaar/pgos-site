import type {
  LiveChecklistItem,
  LiveDecision,
  LiveIssue,
  LiveNotificationType,
  LiveOrgDepartment,
  LiveOrgEmployee,
  LiveProject,
  LiveRelease,
  LiveSyncRun,
  OsDataset,
} from './types'
import { authHeaders, ensureFreshSession } from './auth'

/*
 * محوّل القراءة الحية (3A-352 / عقد القراءة READ-CONTRACT §٣) — جاهز ومُختبَر بناءً،
 * لكنه غير مفعّل كمصدر افتراضي: التبديل خطوة منفصلة بتأكيد مسؤول اوس.
 *
 * الإعداد من البيئة فقط (بلا أي عنوان/مفتاح مكتوب في الكود — مشروع اوس هينتقل
 * لحساب Supabase منفصل بقرار المالك 2026-11-24، فالعنوان قيمة بيئة لا ثابت):
 *   VITE_SUPABASE_URL       — عنوان مشروع Supabase الحامل لجداول pgos_
 *   VITE_SUPABASE_ANON_KEY  — مفتاح anon (للتعريف بالعميل + نداءات الدخول فقط)
 * الجلسة: القراءة بتوكن جلسة المالك (G1 — مهاجرة 000006 ربطت RLS بهوية المالك)؛
 * بلا جلسة يرفض PostgREST القراءة ويسقط المزوّد على اللقطة. الواجهة قراءة فقط؛
 * أي كتابة محظورة من المتصفح بنص العقد.
 */

export function liveConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

const SELECTS = {
  projects:
    'id,linear_id,name,summary,url,color,status_name,created_at,updated_at&order=linear_id.asc',
  issues:
    'id,identifier,title,status_name,status_type,priority_value,due_date,url,project_id,assignee_name,labels,started_at,completed_at,archived_at,updated_at&order=updated_at.desc',
  decisions: 'id,heading,body,category,effective_date&order=effective_date.desc',
  releases: 'id,name,project_id,status,released_at,description&order=released_at.desc',
  checklist: 'id,check_number,category,title,how_to_verify,project_statuses&order=check_number.asc',
  sync: 'id,started_at,finished_at,status,issues_count&order=started_at.desc&limit=1',
  orgDepartments: 'id,name,color,description,projects,sort_order&order=sort_order.asc',
  orgEmployees:
    'id,name,initial,color,dept_name,role,status,group_name,project_ref&order=sort_order.asc',
  notificationTypes: 'id,label,description,default_on,active&order=sort_order.asc',
  notificationPrefs: 'device_id,type_id,enabled',
  guardAlertsOpen: 'id&status=eq.open',
  ledgerSeq: 'seq',
} as const

async function getRows<T>(base: string, table: string, select: string): Promise<T[]> {
  // G1: القراءة بتوكن جلسة المالك إن وُجدت؛ بلا جلسة يرسل مفتاح anon فيرفضه RLS بـ401.
  const res = await fetch(`${base}/rest/v1/${table}?select=${select}`, {
    headers: { ...authHeaders(), Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`PostgREST ${table}: HTTP ${res.status}`)
  return (await res.json()) as T[]
}

/** يجلب الداتا الحية كاملة كـ OsDataset. بيرمي خطأ صريح عند أي فشل — المتصل يقرر السقوط للقطة. */
export async function fetchLiveDataset(): Promise<OsDataset> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!base || !key) throw new Error('live-not-configured')
  // G1: جدّد جلسة المالك قبل القراءة؛ الفشل يمسحها ويسقط على مفتاح anon ثم على اللقطة.
  await ensureFreshSession()

  const [projects, issues, decisions, releases, checklist, syncRuns, orgDepartments, orgEmployees, notificationTypes, notificationPrefs, guardAlertsOpen, ledgerRows] = await Promise.all([
    getRows<LiveProject>(base, 'pgos_projects', SELECTS.projects),
    getRows<LiveIssue>(base, 'pgos_issues', SELECTS.issues),
    getRows<LiveDecision>(base, 'pgos_hq_decisions', SELECTS.decisions).catch(() => [] as LiveDecision[]),
    getRows<LiveRelease>(base, 'pgos_releases', SELECTS.releases).catch(() => [] as LiveRelease[]),
    getRows<LiveChecklistItem>(base, 'pgos_checklist_items', SELECTS.checklist).catch(
      () => [] as LiveChecklistItem[],
    ),
    getRows<LiveSyncRun>(base, 'pgos_sync_runs', SELECTS.sync).catch(() => [] as LiveSyncRun[]),
    getRows<LiveOrgDepartment>(base, 'pgos_org_departments', SELECTS.orgDepartments).catch(
      () => [] as LiveOrgDepartment[],
    ),
    getRows<LiveOrgEmployee>(base, 'pgos_org_employees', SELECTS.orgEmployees).catch(
      () => [] as LiveOrgEmployee[],
    ),
    getRows<LiveNotificationType>(base, 'pgos_notification_types', SELECTS.notificationTypes).catch(
      () => [] as LiveNotificationType[],
    ),
    getRows<{ device_id: string }>(base, 'pgos_notification_prefs', SELECTS.notificationPrefs).catch(
      () => [] as { device_id: string }[],
    ),
    getRows<{ id: string }>(base, 'pgos_guard_alerts', SELECTS.guardAlertsOpen).catch(
      () => [] as { id: string }[],
    ),
    getRows<{ seq: number }>(base, 'pgos_ledger', SELECTS.ledgerSeq).catch(
      () => [] as { seq: number }[],
    ),
  ])

  const lastSync = syncRuns[0] ?? null
  return {
    source: 'live',
    generatedAt: lastSync?.finished_at ?? lastSync?.started_at ?? null,
    projects,
    issues: issues.map((i) => ({ ...i, labels: Array.isArray(i.labels) ? i.labels : [] })),
    decisions,
    releases,
    checklist,
    orgDepartments: orgDepartments.map((x) => ({
      ...x,
      projects: Array.isArray(x.projects) ? x.projects : [],
    })),
    orgEmployees,
    notificationTypes,
    notificationPrefsCount: notificationPrefs.length,
    lastSync,
    // أرقام حقيقية من الحي: تنبيهات الحارس المفتوحة + عدد قيود السجل.
    guardAlerts: guardAlertsOpen.length,
    ledgerCount: ledgerRows.length,
    // «غير متاح من الحي» (null لا صفر): المخاطر المفتوحة بلا مصدر حي بعد،
    // والتحقق من سلسلة هاش السجل دالة خط الأنابيب — لا يُعاد تنفيذه هنا.
    openRisks: null,
    ledgerVerified: null,
  }
}
