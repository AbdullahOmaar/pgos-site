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

/*
 * زمن البند في النسخة الأولى من 3A-427 — من الحقول المتزامنة الموجودة بس
 * (started_at/completed_at). دي مدة تقويمية بين البدء والإغلاق، مش زمن شغل
 * بمؤقّت (جدول قيود الزمن خطوة منفصلة ببوابة) — والتسمية في الواجهة بتوضح ده.
 * مفيش أي مقارنة بتقدير: مصدر التقدير (G9) لسه مش محسوم، برّه النسخة الأولى.
 */
export function issueElapsedMs(issue: LiveIssue, nowMs: number): number | null {
  if (!issue.started_at) return null
  const start = Date.parse(issue.started_at)
  if (Number.isNaN(start)) return null
  const end = issue.completed_at ? Date.parse(issue.completed_at) : nowMs
  if (Number.isNaN(end) || end < start) return null
  return end - start
}

export function fmtDurationAr(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes} د`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} س ${minutes % 60 ? `${minutes % 60} د` : ''}`.trim()
  const days = Math.floor(hours / 24)
  return `${days} يوم ${hours % 24 ? `${hours % 24} س` : ''}`.trim()
}
