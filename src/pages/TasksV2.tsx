import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge, IssueTimeLine } from '../components/v2/widgets'
import { fmtDate } from '../lib/data'
import { useOsData } from '../lib/live/provider'

const STATUS_FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'started', label: 'قيد التنفيذ' },
  { key: 'completed', label: 'منجز' },
  { key: 'unstarted', label: 'لم يبدأ' },
  { key: 'backlog', label: 'مؤجل' },
  { key: 'canceled', label: 'ملغي' },
] as const

/* الصفحة الثالثة (3A-352) — المهام: بحث + فلتر مشروع/حالة، والحالات كما هي من المصدر. */
export default function TasksV2() {
  const state = useOsData()
  const [params] = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [projectId, setProjectId] = useState<string>(params.get('project') ?? 'all')
  const [showArchived, setShowArchived] = useState(false)

  const filtered = useMemo(() => {
    if (state.phase !== 'ready') return []
    const q = query.trim()
    return state.data.issues.filter((i) => {
      if (!showArchived && i.archived_at) return false
      if (status !== 'all' && i.status_type !== status) return false
      if (projectId !== 'all' && i.project_id !== projectId) return false
      if (q && !i.title.includes(q) && !i.identifier.toLowerCase().includes(q.toLowerCase())) return false
      return true
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [state, query, status, projectId, showArchived])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data
  const shown = filtered.slice(0, 100)

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">المهام</h1>
        <p className="mt-1 text-sm text-muted">{filtered.length} بند مطابق — تُعرض أول ١٠٠ نتيجة، صفِّ أكتر للوصول للباقي.</p>
        <p className="mt-1 text-xs text-muted">زمن البند (3A-427): مدة تقويمية من «بدأ» لـ«أُغلق» من الحقول المتزامنة — مش زمن شغل بمؤقّت، ومفيش مقارنة بتقدير في النسخة الأولى (مصدر التقدير لسه مش محسوم).</p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      <div className="mb-3 grid gap-2">
        <label className="sr-only" htmlFor="task-search">بحث في المهام</label>
        <input id="task-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بعنوان أو رقم بند (3A-…)…" className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <label className="sr-only" htmlFor="task-project">المشروع</label>
          <select id="task-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="min-h-11 rounded-xl border border-border bg-card px-2 text-sm">
            <option value="all">كل المشاريع</option>
            {d.projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-5 w-5" />
            إظهار المؤرشف
          </label>
        </div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="فلتر الحالة">
        {STATUS_FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={status === f.key} onClick={() => setStatus(f.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${status === f.key ? 'bg-primary text-white' : 'border border-border bg-card text-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? <EmptyState text="لا بنود مطابقة للفلاتر الحالية" /> : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {shown.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <p className="text-sm"><span className="font-bold">{i.identifier}</span> <Chip tone="muted">{i.status_name}</Chip>
                  {i.archived_at ? <> <Chip tone="warn">مؤرشف</Chip></> : null}</p>
                <p className="mt-1 text-sm">{i.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {d.projects.find((p) => p.id === i.project_id)?.name ?? '—'} · {fmtDate(i.updated_at)}
                  {i.url ? <> · <a href={i.url} target="_blank" rel="noreferrer" className="font-semibold text-accent">المصدر ↗</a></> : null}
                </p>
                {i.started_at ? (
                  <p className="mt-0.5 text-xs text-muted"><IssueTimeLine startedAt={i.started_at} completedAt={i.completed_at} /></p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
