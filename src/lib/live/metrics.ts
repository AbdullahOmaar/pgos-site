import type { LiveIssue } from './types'

/* نسبة الإنجاز حسب عقد القراءة §٣.٢.١: Done / (total − Canceled). لا تُخمَّن ولا تُقرَّب لغير أقرب صحيح. */
export function completionPct(issues: LiveIssue[]): number {
  const done = issues.filter((i) => i.status_type === 'completed' || i.status_name === 'Done').length
  const canceled = issues.filter(
    (i) => i.status_type === 'canceled' || i.status_name === 'Canceled' || i.status_name === 'Duplicate',
  ).length
  const denom = issues.length - canceled
  if (denom <= 0) return 0
  return Math.round((done / denom) * 100)
}

export function projectIssues(issues: LiveIssue[], projectId: string): LiveIssue[] {
  return issues.filter((i) => i.project_id === projectId && !i.archived_at)
}

export function phaseIssues(issues: LiveIssue[], phase: string): LiveIssue[] {
  return issues.filter((i) => !i.archived_at && i.labels.includes(phase))
}

export const PHASES = ['Phase 1', 'Phase 2'] as const
