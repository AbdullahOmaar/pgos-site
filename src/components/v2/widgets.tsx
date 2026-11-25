import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export function ProgressBar({ pct, color }: { pct: number; color?: string | null }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color ?? 'var(--primary)' }} />
    </div>
  )
}

export function StatCard({ label, value, sub, to }: { label: string; value: ReactNode; sub?: string; to?: string }) {
  const inner = (
    <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[28px] leading-8 font-bold text-primary">{value}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  )
  return to ? (<Link to={to} className="block active:scale-[0.99]">{inner}</Link>) : inner
}

/** سطر زمن البند (3A-427 نسخة أولى): بدء/إغلاق/مدة تقويمية — بيختفي لو مفيش started_at مسجل */
export function IssueTimeLine({ startedAt, completedAt }: { startedAt: string | null; completedAt: string | null }) {
  if (!startedAt) return null
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' })
  const start = Date.parse(startedAt)
  const end = completedAt ? Date.parse(completedAt) : Date.now()
  const ms = Number.isNaN(start) || Number.isNaN(end) || end < start ? null : end - start
  const dur = (v: number) => {
    const minutes = Math.floor(v / 60000)
    if (minutes < 60) return `${minutes} د`
    const hours = Math.floor(minutes / 60)
    if (hours < 48) return `${hours} س`
    return `${Math.floor(hours / 24)} يوم`
  }
  return (
    <span>
      ⏱ بدأ {fmt(startedAt)}
      {completedAt ? <> · أُغلق {fmt(completedAt)}</> : <> · لسه شغال</>}
      {ms !== null ? <> · مدة تقويمية {dur(ms)}</> : null}
    </span>
  )
}

export function SectionTitle({ children, to, linkLabel }: { children: ReactNode; to?: string; linkLabel?: string }) {
  return (
    <div className="mt-6 mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold">{children}</h2>
      {to ? (<Link to={to} className="shrink-0 text-sm font-semibold text-accent">{linkLabel ?? 'الكل ←'}</Link>) : null}
    </div>
  )
}

export function FreshnessBadge({ source, generatedAt }: { source: string; generatedAt: string | null }) {
  const label = source === 'live' ? 'بيانات حية' : source === 'snapshot' ? 'لقطة خزنة' : 'المصدر غير متاح'
  const tone = source === 'live' ? 'bg-ok/15 text-ok' : 'bg-warn/20 text-[#9a6206] dark:text-warn'
  const when = generatedAt ? new Date(generatedAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }) : '—'
  return (
    <p className={`inline-flex flex-wrap items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      <span>{label}</span><span className="font-normal opacity-80">آخر تحديث: {when}</span>
    </p>
  )
}
