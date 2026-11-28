import { useEffect, useRef, useState } from 'react'
import type { SiteData } from '../../types'
import { useSiteData } from '../data'
import type { LiveIssue, LiveProject, OsDataset } from './types'
import { fetchLiveDataset, liveConfigured } from './supabase'

/*
 * طبقة بيانات واحدة قابلة للتبديل (تكليف 3A-352):
 * - الواجهة تستهلك OsDataset فقط عبر useOsData().
 * - المصدر الافتراضي: Supabase الحي (المستوى ١ في عقد القراءة) إن كان مُهيأً؛
 *   أي فشل في الحي (مفتاح/صلاحيات/شبكة) يسقط بصمت على لقطة الخزنة (المستوى ٢)
 *   — الواجهة لا تتوقف أبدًا، وشارة الحداثة بتقول المصدر الفعلي.
 * - ممنوع بيانات وهمية: غياب المصدر = حالة unavailable صريحة في الواجهة،
 *   والقيم null في OsDataset تعني «غير متاح من الحي» مش صفر (شوف types.ts).
 */

function fromSnapshot(d: SiteData): OsDataset {
  const projects: LiveProject[] = d.linear.projects.map((p) => ({
    id: p.uuid,
    linear_id: p.linearId ?? null,
    name: p.name,
    summary: p.summary ?? null,
    url: p.url ?? null,
    color: p.color ?? null,
    status_name: p.statusName ?? null,
    created_at: d.meta.generated_at,
    updated_at: d.meta.generated_at,
  }))
  const issues: LiveIssue[] = d.linear.issues.map((i) => ({
    id: i.uuid,
    identifier: i.identifier,
    title: i.title,
    status_name: i.statusName ?? 'غير معروف',
    status_type: i.statusType ?? 'unstarted',
    priority_value: i.priorityValue ?? 0,
    due_date: i.dueDate ?? null,
    url: i.url ?? null,
    project_id: i.projectUuid ?? null,
    assignee_name: null,
    labels: [],
    started_at: i.startedAt ?? null,
    completed_at: i.completedAt ?? null,
    archived_at: i.archivedAt ?? null,
    updated_at: i.updatedAt ?? d.meta.generated_at,
  }))
  return {
    source: 'snapshot',
    generatedAt: d.meta.generated_at,
    projects,
    issues,
    decisions: d.hq_decisions.blocks.map((b, idx) => ({
      id: `hq-${idx}`,
      heading: b.heading,
      body: b.body,
      category: null,
      effective_date: d.hq_decisions.snapshot_at,
    })),
    releases: d.records.releases.map((r) => ({
      id: String(r.id),
      name: String((r as Record<string, unknown>).name ?? (r as Record<string, unknown>).title ?? r.id),
      project_id: null,
      status: String((r as Record<string, unknown>).status ?? ''),
      released_at: null,
      description: null,
    })),
    checklist: d.preprod_checklist.checks.map((c) => ({
      id: c.id,
      check_number: c.id,
      category: c.category,
      title: c.item,
      how_to_verify: c.how,
      project_statuses: {
        teacher_app: { status: c.apps.teacher.status, evidence: c.apps.teacher.evidence },
        nounou: { status: c.apps.nounou.status },
        pgos_site: { status: c.apps.pgos.status },
      },
    })),
    // بيانات M2 (تنظيم/إشعارات): اللقطة بتحملها من القاعدة وقت التوليد (نفس
    // مصدر الحي) — غيابها في لقطة قديمة = فاضية بصدق. ممنوع ملؤها من بذرة
    // المكتب الافتراضي (طاقم مختلف).
    orgDepartments: d.org?.departments ?? [],
    orgEmployees: d.org?.employees ?? [],
    notificationTypes: d.org?.notification_types ?? [],
    notificationPrefsCount: d.org?.notification_prefs_count ?? 0,
    lastSync: null,
    openRisks: d.records.risks.filter((x) => String(x.status).toUpperCase() === 'OPEN').length,
    ledgerCount: d.ledger.count,
    ledgerVerified: d.ledger.chain_verified,
    guardAlerts: d.guard.alerts.length,
    guardAlertList: d.guard.alerts.map((a, idx) => ({
      id: `guard-${idx}`,
      title: a.title,
      detail: a.entry,
      status: 'open',
      created_at: a.ts,
      missing: a.missing ?? [],
    })),
    // المقر الافتراضي (P2-09): اللقطة تحمل بياناته من القاعدة وقت التوليد.
    office: d.office ?? null,
    projectCharters: (d.records.projects ?? []) as unknown as Record<string, unknown>[],
    notifications: null,
    timeEntries: null,
    environments: d.environments ?? null,
    lifecycle: d.lifecycle ?? null,
  }
}

/* كاش حي على مستوى الوحدة: كل مستهلكي useOsData (صفحات + جرس الإشعارات)
   بيتشاركوا محاولة جلب واحدة في الجلسة — فشلها لا يُخزّن، فالمحاولة الجاية تقدر تنجح. */
let liveCache: Promise<OsDataset> | null = null
function fetchLiveOnce(): Promise<OsDataset> {
  if (!liveCache) {
    liveCache = fetchLiveDataset()
    liveCache.catch(() => {
      liveCache = null
    })
  }
  return liveCache
}

export type OsDataState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: OsDataset }

export function useOsData(): OsDataState {
  const snap = useSiteData()
  const [state, setState] = useState<OsDataState>({ phase: 'loading' })
  const liveTried = useRef(false)
  const liveWon = useRef(false)
  useEffect(() => {
    // محاولة الحي مرة واحدة؛ الفشل يسقط على اللقطة تحت (نفس الـeffect).
    if (liveConfigured() && !liveTried.current) {
      liveTried.current = true
      let cancelled = false
      fetchLiveOnce()
        .then((data) => {
          if (cancelled) return
          liveWon.current = true
          setState({ phase: 'ready', data })
        })
        .catch(() => {
          if (cancelled) return
          if (snap.phase === 'ready') setState({ phase: 'ready', data: fromSnapshot(snap.data) })
          else if (snap.phase === 'error') setState({ phase: 'error', message: snap.message })
          else setState({ phase: 'loading' })
        })
      return () => {
        cancelled = true
      }
    }
    // الحي كسب خلاص — اللقطة ما ترجعش تغطي عليه لو اتحدثت.
    if (liveWon.current) return
    if (snap.phase === 'loading') setState({ phase: 'loading' })
    else if (snap.phase === 'error') setState({ phase: 'error', message: snap.message })
    else setState({ phase: 'ready', data: fromSnapshot(snap.data) })
  }, [snap])
  return state
}
