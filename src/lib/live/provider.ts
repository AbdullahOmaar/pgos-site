import { useEffect, useState } from 'react'
import type { SiteData } from '../../types'
import { useSiteData } from '../data'
import type { LiveIssue, LiveProject, OsDataset } from './types'

/*
 * طبقة بيانات واحدة قابلة للتبديل (تكليف 3A-352):
 * - الواجهة تستهلك OsDataset فقط عبر useOsData().
 * - المصدر الحالي: لقطة الخزنة عبر useSiteData القائم (المستوى ٢ في عقد القراءة) — يُحوَّل هنا فقط.
 * - عند اكتمال M0: يُفعَّل مصدر Supabase الحي (المستوى ١) داخل هذا الملف وحده،
 *   بنفس استعلامات READ-CONTRACT §٣، من غير أي تغيير في الصفحات.
 * - ممنوع بيانات وهمية: غياب المصدر = حالة unavailable صريحة في الواجهة.
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
    lastSync: null,
    openRisks: d.records.risks.filter((x) => String(x.status).toUpperCase() === 'OPEN').length,
    ledgerCount: d.ledger.count,
    ledgerVerified: d.ledger.chain_verified,
    guardAlerts: d.guard.alerts.length,
  }
}

export type OsDataState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: OsDataset }

export function useOsData(): OsDataState {
  const snap = useSiteData()
  const [state, setState] = useState<OsDataState>({ phase: 'loading' })
  useEffect(() => {
    if (snap.phase === 'loading') setState({ phase: 'loading' })
    else if (snap.phase === 'error') setState({ phase: 'error', message: snap.message })
    else setState({ phase: 'ready', data: fromSnapshot(snap.data) })
  }, [snap])
  return state
}
