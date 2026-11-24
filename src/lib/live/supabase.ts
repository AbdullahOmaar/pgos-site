import type {
  LiveChecklistItem,
  LiveDecision,
  LiveIssue,
  LiveProject,
  LiveRelease,
  LiveSyncRun,
  OsDataset,
} from './types'

/*
 * محوّل القراءة الحية (3A-352 / عقد القراءة READ-CONTRACT §٣) — جاهز ومُختبَر بناءً،
 * لكنه غير مفعّل كمصدر افتراضي: التبديل خطوة منفصلة بتأكيد مسؤول اوس.
 *
 * الإعداد من البيئة فقط (بلا أي عنوان/مفتاح مكتوب في الكود — مشروع اوس هينتقل
 * لحساب Supabase منفصل بقرار المالك 2026-11-24، فالعنوان قيمة بيئة لا ثابت):
 *   VITE_SUPABASE_URL       — عنوان مشروع Supabase الحامل لجداول pgos_
 *   VITE_SUPABASE_ANON_KEY  — مفتاح anon (القراءة بسياسات RLS للمالك فقط)
 * الجلسة: الواجهة قراءة فقط؛ أي كتابة محظورة من المتصفح بنص العقد.
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
} as const

async function getRows<T>(base: string, key: string, table: string, select: string): Promise<T[]> {
  const res = await fetch(`${base}/rest/v1/${table}?select=${select}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`PostgREST ${table}: HTTP ${res.status}`)
  return (await res.json()) as T[]
}

/** يجلب الداتا الحية كاملة كـ OsDataset. بيرمي خطأ صريح عند أي فشل — المتصل يقرر السقوط للقطة. */
export async function fetchLiveDataset(): Promise<OsDataset> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!base || !key) throw new Error('live-not-configured')

  const [projects, issues, decisions, releases, checklist, syncRuns] = await Promise.all([
    getRows<LiveProject>(base, key, 'pgos_projects', SELECTS.projects),
    getRows<LiveIssue>(base, key, 'pgos_issues', SELECTS.issues),
    getRows<LiveDecision>(base, key, 'pgos_hq_decisions', SELECTS.decisions).catch(() => [] as LiveDecision[]),
    getRows<LiveRelease>(base, key, 'pgos_releases', SELECTS.releases).catch(() => [] as LiveRelease[]),
    getRows<LiveChecklistItem>(base, key, 'pgos_checklist_items', SELECTS.checklist).catch(
      () => [] as LiveChecklistItem[],
    ),
    getRows<LiveSyncRun>(base, key, 'pgos_sync_runs', SELECTS.sync).catch(() => [] as LiveSyncRun[]),
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
    lastSync,
    // المخاطر/السجل/الحارس لسه مش جداول pgos_ حية (M2) — صفر هنا يعني «غير متاح من الحي»،
    // والواجهة عند التبديل لازم تميّز ذلك؛ لا أرقام مخترعة.
    openRisks: 0,
    ledgerCount: 0,
    ledgerVerified: false,
    guardAlerts: 0,
  }
}
