import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge, ProgressBar } from '../components/v2/widgets'
import { fmtDate } from '../lib/data'
import { completionPct, projectIssues } from '../lib/live/metrics'
import { useOsData } from '../lib/live/provider'

/* الصفحة الثانية (3A-352) — المشاريع: بطاقة لكل مشروع بنسبة عقد القراءة،
   وتفاصيل قابلة للفتح ببنود المشروع وحالاتها كما هي من المصدر (بلا دمج حالات). */
export default function ProjectsV2() {
  const state = useOsData()
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (state.phase !== 'ready') return []
    const q = query.trim()
    if (!q) return state.data.projects
    return state.data.projects.filter((p) => p.name.includes(q) || (p.summary ?? '').includes(q))
  }, [state, query])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">المشاريع</h1>
        <p className="mt-1 text-sm text-muted">كل مشروع بنسبته المحسوبة من بنوده الحية — دوس على أي مشروع لعرض بنوده.</p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      <label className="sr-only" htmlFor="proj-search">بحث في المشاريع</label>
      <input
        id="proj-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث باسم مشروع…"
        className="mb-4 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
      />

      {filtered.length === 0 ? <EmptyState text="لا مشاريع مطابقة في مصدر البيانات الحالي" /> : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const items = projectIssues(d.issues, p.id)
            const pct = completionPct(items)
            const done = items.filter((i) => i.status_type === 'completed').length
            const started = items.filter((i) => i.status_type === 'started').length
            const open = openId === p.id
            return (
              <Card key={p.id} className="p-0">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : p.id)}
                  aria-expanded={open}
                  className="min-h-11 w-full p-4 text-start active:bg-soft/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{p.name}</p>
                      {p.summary ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{p.summary}</p> : null}
                    </div>
                    <span className="shrink-0 text-xl font-bold text-primary">{pct}٪</span>
                  </div>
                  <div className="mt-3"><ProgressBar pct={pct} color={p.color} /></div>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{items.length} بند حي</span><span>{done} منجز</span><span>{started} قيد التنفيذ</span>
                    {p.status_name ? <span>الحالة: {p.status_name}</span> : null}
                    <span className="font-semibold text-accent">{open ? 'إخفاء البنود ▴' : 'عرض البنود ▾'}</span>
                  </p>
                </button>
                {open ? (
                  <div className="border-t border-border px-4 py-2">
                    {items.length === 0 ? <p className="py-2 text-sm text-muted">لا بنود حية لهذا المشروع في المصدر الحالي.</p> : (
                      <ul className="divide-y divide-border">
                        {[...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((i) => (
                          <li key={i.id} className="py-2.5 text-sm">
                            <span className="font-bold">{i.identifier}</span>{' '}
                            <Chip tone="muted">{i.status_name}</Chip>{' '}
                            <span className="text-xs text-muted">{fmtDate(i.updated_at)}</span>
                            <p className="mt-0.5">{i.title}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="py-2 text-sm">
                      <Link to={`/os/tasks?project=${encodeURIComponent(p.id)}`} className="font-semibold text-accent">فتح في صفحة المهام ←</Link>
                      {p.url ? <> · <a href={p.url} target="_blank" rel="noreferrer" className="font-semibold text-accent">المشروع في مصدره ↗</a></> : null}
                    </p>
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
