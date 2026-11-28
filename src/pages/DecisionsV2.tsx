import { useMemo, useState } from 'react'
import { Card, Chip, EmptyState, ErrorState, LoadingState, StatusChip } from '../components/ui'
import { FreshnessBadge, SectionTitle } from '../components/v2/widgets'
import { fmtDay } from '../lib/data'
import { useOsData } from '../lib/live/provider'

/* الصفحة الرابعة (3A-352) — قرارات المقر + الإصدارات في شاشة واحدة قابلة للبحث. */
export default function DecisionsV2() {
  const state = useOsData()
  const [query, setQuery] = useState('')
  const decisions = useMemo(() => {
    if (state.phase !== 'ready') return []
    const q = query.trim()
    if (!q) return state.data.decisions
    return state.data.decisions.filter((x) => x.heading.includes(q) || x.body.includes(q))
  }, [state, query])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">القرارات والإصدارات</h1>
        <p className="mt-1 text-sm text-muted">قرارات المقر كما وردت من مصدرها، وأحدث إصدارات المشاريع تحتها.</p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      <label className="sr-only" htmlFor="dec-search">بحث في القرارات</label>
      <input id="dec-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في القرارات…" className="mb-4 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm" />

      {decisions.length === 0 ? <EmptyState text="لا قرارات مطابقة في مصدر البيانات الحالي" /> : (
        <div className="space-y-3">
          {decisions.map((dec) => (
            <Card key={dec.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{dec.heading}</p>
                {dec.category ? <Chip tone="muted">{dec.category}</Chip> : null}
                {dec.effective_date ? <span className="text-xs text-muted">{fmtDay(dec.effective_date)}</span> : null}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{dec.body}</p>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>أحدث الإصدارات</SectionTitle>
      {d.releases.length === 0 ? <EmptyState text="لا إصدارات في مصدر البيانات الحالي" /> : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {d.releases.slice(0, 20).map((r) => (
              <li key={r.id} className="px-4 py-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{r.name} <StatusChip status={r.status || undefined} /></p>
                {r.description ? <p className="mt-1 text-sm text-muted">{r.description}</p> : null}
                {r.released_at ? <p className="mt-0.5 text-xs text-muted">{fmtDay(r.released_at)}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
