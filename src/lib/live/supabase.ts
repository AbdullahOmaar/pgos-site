import type {
  LiveChecklistItem,
  LiveDecision,
  LiveIssue,
  LiveNotification,
  LiveNotificationType,
  LiveOrgDepartment,
  LiveOrgEmployee,
  LiveProject,
  LiveRelease,
  LiveSyncRun,
  LiveTimeEntry,
  OsDataset,
} from './types'
import type { Department as OfficeDepartment, Employee as OfficeEmployee, OfficeData } from '../../office/types'
import { authHeaders, ensureFreshSession } from './auth'

interface OfficeDepartmentRow {
  id: string
  name: string
  color: string | null
  sort_order: number
}

interface OfficeEmployeeRow {
  id: string
  name: string
  role: string | null
  department_id: string | null
  desk: number | null
  status: OfficeEmployee['status']
  tools: string[] | null
  current_task: string | null
  tasks_open: number | null
  projects: number | null
  rating: number | null
}

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
  guardAlertsOpen: 'id,kind,message,status,created_at&status=eq.open&order=created_at.desc',
  // مهاجرة 20261127000007 — جلب متسامح منفصل: فشل أي جدول من دول = null (غير متاح)
  // ولا يُسقط القراءة الحية كلها (أعمدة التصميم المعتمد 3A-426/427).
  appNotifications:
    'id,type_id,title,body,entity_type,entity_id,route,severity,created_at,source&order=created_at.desc&limit=100',
  notificationReads: 'notification_id',
  timeEntries:
    'id,issue_id,actor,started_at,ended_at,duration_minutes,origin,note&order=started_at.desc&limit=500',
  ledgerSeq: 'seq',
  // المقر الافتراضي (P2-09): طاقم المشهد من جداوله هو — لا يُخلط بسجل التنظيم.
  officeDepartments: 'id,name,color,sort_order&order=sort_order.asc',
  officeEmployees:
    'id,name,role,department_id,desk,status,tools,current_task,tasks_open,projects,rating&order=desk.asc',
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

  const [projects, issues, decisions, releases, checklist, syncRuns, orgDepartments, orgEmployees, notificationTypes, notificationPrefs, guardAlertsOpen, ledgerRows, officeDepartmentRows, officeEmployeeRows] = await Promise.all([
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
    getRows<{ id: string; kind: string; message: string | null; status: string; created_at: string }>(
      base, 'pgos_guard_alerts', SELECTS.guardAlertsOpen,
    ).catch(() => [] as { id: string; kind: string; message: string | null; status: string; created_at: string }[]),
    getRows<{ seq: number }>(base, 'pgos_ledger', SELECTS.ledgerSeq).catch(
      () => [] as { seq: number }[],
    ),
    getRows<OfficeDepartmentRow>(base, 'pgos_departments', SELECTS.officeDepartments).catch(
      () => [] as OfficeDepartmentRow[],
    ),
    getRows<OfficeEmployeeRow>(base, 'pgos_employees', SELECTS.officeEmployees).catch(
      () => [] as OfficeEmployeeRow[],
    ),
  ])

  // حارس الفراغ (إصلاح عاجل 2026-11-27 — بلاغ المالك «البرنامج فاضي»): جلسة حية
  // صالحة لكنها مش جلسة المالك بترجع 200 + قوائم فاضية من RLS، وفراغ المشاريع
  // والمهام معًا مستحيل في شركة شغالة — فده معناه «الجلسة مش شايفة البيانات»
  // مش «مفيش بيانات»: ارمِ خطأ عشان المزوّد يسقط على لقطة الخزنة (مفتاح الجهاز
  // هو التصديق)، بدل ما الحي الفاضي يكسب ويعرض تطبيق فاضي.
  if (projects.length === 0 && issues.length === 0) throw new Error('live-empty-not-owner')

  // المقر الافتراضي (P2-09): بيانات المشهد من القاعدة — غيابها null فتسقط
  // الصفحة على البذرة كملاذ أخير فقط، لا تُملأ من أي مصدر آخر.
  const office: OfficeData | null =
    officeDepartmentRows.length && officeEmployeeRows.length
      ? {
          departments: officeDepartmentRows.map(
            (d): OfficeDepartment => ({ id: d.id, name: d.name, color: d.color ?? '#64748B' }),
          ),
          employees: officeEmployeeRows.map(
            (e): OfficeEmployee => ({
              id: e.id,
              name: e.name,
              role: e.role ?? '',
              department_id: e.department_id ?? '',
              desk: e.desk ?? 0,
              status: e.status,
              tools: Array.isArray(e.tools) ? e.tools : [],
              ...(e.current_task ? { current_task: e.current_task } : {}),
              ...(e.tasks_open != null ? { tasks_open: e.tasks_open } : {}),
              ...(e.projects != null ? { projects: e.projects } : {}),
              ...(e.rating != null ? { rating: Number(e.rating) } : {}),
            }),
          ),
        }
      : null

  // جداول 20261127000007 بجلب متسامح مستقل (null عند أي فشل — «غير متاح من الحي»)
  const [appNotificationRows, notificationReadRows, timeEntryRows] = await Promise.all([
    getRows<Omit<LiveNotification, 'read'>>(base, 'pgos_notifications', SELECTS.appNotifications).catch(() => null),
    getRows<{ notification_id: string }>(base, 'pgos_notification_reads', SELECTS.notificationReads).catch(() => null),
    getRows<LiveTimeEntry>(base, 'pgos_time_entries', SELECTS.timeEntries).catch(() => null),
  ])
  const readIds = new Set((notificationReadRows ?? []).map((r) => r.notification_id))
  const notifications: LiveNotification[] | null = appNotificationRows
    ? appNotificationRows.map((n) => ({ ...n, read: readIds.has(n.id) }))
    : null
  const timeEntries: LiveTimeEntry[] | null = timeEntryRows

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
    guardAlerts: guardAlertsOpen.filter((a) => a.status === 'open').length,
    guardAlertList: guardAlertsOpen.map((a) => ({
      id: a.id,
      title: a.message ?? a.kind,
      detail: a.kind,
      status: a.status,
      created_at: a.created_at,
      missing: [],
    })),
    ledgerCount: ledgerRows.length,
    // «غير متاح من الحي» (null لا صفر): المخاطر المفتوحة بلا مصدر حي بعد،
    // والتحقق من سلسلة هاش السجل دالة خط الأنابيب — لا يُعاد تنفيذه هنا.
    openRisks: null,
    ledgerVerified: null,
    office,
    // المواثيق مش في عقد القراءة الحي — «غير متاح من الحي» بصدق (null لا قائمة فاضية)
    projectCharters: null,
    notifications,
    timeEntries,
  }
}
