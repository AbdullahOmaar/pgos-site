import { useEffect, useMemo, useState } from 'react'
import type { LiveIssue, OsDataset } from '../../lib/live/types'
import { fmtDurationAr } from '../../lib/live/metrics'

/*
 * كانبان المهام (P2-18 — مسترجع من الكانبان الأصلي بنمط مثال المالك «مدار الوكلاء»،
 * بأمر مالك 2026-11-26): أعمدة حالات جنب بعضها بتمرير أفقي، عمود «مراجعة واعتماد»
 * مميز، شريط إحصائيات فيه «بانتظار اعتمادك»، فلاتر مشروع بلمسة واحدة، وكروت بطوابع
 * 📥 استلام / 📤 تسليم وعلم تأخير أحمر. عرض وتنقّل فقط (عقد القراءة فقط) — أزرار
 * الاعتماد مكانها كروت «يحتاجك اليوم»، مش هنا.
 * البيانات: useOsData (لقطة + حي) — لا مصدر جديد.
 * تعيين الأعمدة (من الأصل): completed→منجزة، 'In Review'→مراجعة واعتماد،
 * 'In Progress'→جارية، Todo/Backlog→في الانتظار. الملغاة والمؤرشفة لا تظهر.
 */

type ColKey = 'queue' | 'doing' | 'review' | 'done'

const COLUMNS: { key: ColKey; title: string; hint: string }[] = [
  { key: 'queue', title: 'في الانتظار', hint: 'لسه ما بدأتش' },
  { key: 'doing', title: 'قيد التنفيذ', hint: 'شغالة دلوقتي' },
  { key: 'review', title: 'مراجعة واعتماد', hint: 'مستنية قرارك' },
  { key: 'done', title: 'منجزة', hint: 'أحدث ما خلص' },
]

function colOf(i: LiveIssue): ColKey | null {
  if (i.archived_at || i.status_type === 'canceled') return null
  if (i.status_type === 'completed') return 'done'
  if (i.status_name === 'In Review') return 'review'
  if (i.status_name === 'In Progress') return 'doing'
  if (i.status_name === 'Todo' || i.status_name === 'Backlog') return 'queue'
  return null
}

const DONE_CAP = 12

function fmtTimeAr(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}
function fmtDayTimeAr(iso: string): string {
  return `${new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })} · ${fmtTimeAr(iso)}`
}
function durationBetweenAr(startIso: string, endIso?: string): string {
  const ms = new Date(endIso ?? Date.now()).getTime() - new Date(startIso).getTime()
  return ms > 0 ? fmtDurationAr(ms) : 'دلوقتي'
}
function freshnessAr(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  return ms > 60_000 ? `من ${fmtDurationAr(ms)}` : 'دلوقتي'
}
function hoursAr(h: number): string {
  return fmtDurationAr(h * 3600_000)
}

/** تأخير واضح: شغالة أكثر من ساعتين وآخر حركة من أكثر من ساعة (من الأصل) */
function isDelayed(i: LiveIssue): boolean {
  if (!i.started_at) return false
  const age = Date.now() - new Date(i.started_at).getTime()
  const idle = Date.now() - new Date(i.updated_at).getTime()
  return age > 2 * 3600_000 && idle > 3600_000
}

function LinearLink({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-accent" aria-label="افتح في Linear">
      المصدر ↗
    </a>
  )
}

function Stamps({ i, col }: { i: LiveIssue; col: ColKey }) {
  const start = i.started_at
  if (col === 'queue') {
    return (
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-muted">📭 لسه محدش استلمها</span>
        <LinearLink url={i.url} />
      </div>
    )
  }
  if (col === 'done') {
    return (
      <div className="mt-1.5 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {start ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              📥 استلمها {i.assignee_name ?? '—'} · {fmtTimeAr(start)}
            </span>
          ) : null}
          <LinearLink url={i.url} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {i.completed_at ? (
            <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">
              📤 اتسلّمت {fmtTimeAr(i.completed_at)}
            </span>
          ) : null}
          {start && i.completed_at ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              خدت {durationBetweenAr(start, i.completed_at)}
            </span>
          ) : null}
          {i.estimate_hours ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              التقدير كان {hoursAr(i.estimate_hours)}
            </span>
          ) : null}
        </div>
      </div>
    )
  }
  const delayed = col === 'doing' && isDelayed(i)
  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {start ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${delayed ? 'bg-bad/10 text-bad' : 'bg-primary/10 text-primary'}`}>
            {delayed ? '🚨' : '⏱'} شغالة من {durationBetweenAr(start)}
          </span>
        ) : (
          <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-muted">📥 الاستلام مش متسجل</span>
        )}
        <LinearLink url={i.url} />
      </div>
      <p className={`mt-1 text-[10px] ${delayed ? 'font-semibold text-bad' : 'text-muted'}`}>
        آخر حركة {freshnessAr(i.updated_at)}
        {delayed ? ' — من ساعتها مفيش تحديث' : col === 'doing' ? ' — ماشية عادي' : ''}
      </p>
    </div>
  )
}

function StampRecord({ i }: { i: LiveIssue }) {
  const [open, setOpen] = useState(false)
  const start = i.started_at
  const est = i.estimate_hours ?? null
  const actualMs = start ? new Date(i.completed_at ?? Date.now()).getTime() - new Date(start).getTime() : null
  const rows: [string, string][] = [
    ['المسؤول', i.assignee_name ?? '—'],
    ['الاستلام', start ? fmtDayTimeAr(start) : 'لسه'],
    ['التسليم', i.completed_at ? fmtDayTimeAr(i.completed_at) : 'لسه'],
    [i.completed_at ? 'خدت' : 'بقالها', start ? durationBetweenAr(start, i.completed_at ?? undefined) : '—'],
    ['التقدير', est ? hoursAr(est) : 'مش متسجل'],
  ]
  if (i.completed_at && actualMs !== null && est) {
    const diffH = actualMs / 3600_000 - est
    rows.push([
      'الانحراف',
      Math.abs(diffH) < 0.05 ? 'على التقدير بالظبط' : diffH > 0 ? `أزود من التقدير بـ ${hoursAr(diffH)}` : `أقل من التقدير بـ ${hoursAr(-diffH)}`,
    ])
  }
  rows.push(['آخر حركة', freshnessAr(i.updated_at)])
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-[11px] font-bold text-primary">
        سجل الاستلام والتسليم {open ? '▴' : '▾'}
      </button>
      {open ? (
        <dl className="mt-1 space-y-0.5 rounded-lg bg-soft/60 px-2 py-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 text-[11px]">
              <dt className="w-14 shrink-0 font-bold text-muted">{k}</dt>
              <dd className="min-w-0 flex-1">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

function TaskCard({ d, i, col }: { d: OsDataset; i: LiveIssue; col: ColKey }) {
  const proj = d.projects.find((p) => p.id === i.project_id)
  const urgent = i.priority_value === 1
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
      <p className="line-clamp-3 text-[13px] leading-snug font-semibold">{i.title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {urgent ? <span className="rounded-full bg-bad px-2 py-px text-[11px] font-bold text-white">عاجل</span> : null}
        <span className="rounded-full border border-border px-2 py-px text-[11px] text-muted">{proj?.name ?? '—'}</span>
        <span className="rounded-full border border-border px-2 py-px text-[11px] text-muted">{i.identifier}</span>
      </div>
      <Stamps i={i} col={col} />
      <StampRecord i={i} />
    </div>
  )
}

export default function KanbanBoard({ d }: { d: OsDataset }) {
  /* رابط عميق لعمود: ‎#col-review‎ بيمرّر اللوحة لعمود المراجعة */
  useEffect(() => {
    const m = window.location.hash.match(/^#col-(queue|doing|review|done)$/)
    if (m) document.getElementById(`col-${m[1]}`)?.scrollIntoView({ inline: 'start', block: 'nearest' })
  }, [])
  const [projectId, setProjectId] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [showAllDone, setShowAllDone] = useState(false)

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase()
    return d.issues.filter((i) => {
      if (!colOf(i)) return false
      if (projectId !== 'all' && i.project_id !== projectId) return false
      if (q && !i.title.toLowerCase().includes(q) && !i.identifier.toLowerCase().includes(q)) return false
      return true
    })
  }, [d, projectId, query])

  const cols = useMemo(() => {
    const map: Record<ColKey, LiveIssue[]> = { queue: [], doing: [], review: [], done: [] }
    for (const i of scoped) {
      const c = colOf(i)
      if (c) map[c].push(i)
    }
    const byUpdated = (a: LiveIssue, b: LiveIssue) => b.updated_at.localeCompare(a.updated_at)
    map.queue.sort(byUpdated)
    map.doing.sort(byUpdated)
    map.review.sort(byUpdated)
    map.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return map
  }, [scoped])

  const today = new Date().toDateString()
  const completedToday = d.issues.filter(
    (i) => i.completed_at && new Date(i.completed_at).toDateString() === today,
  ).length

  const kpis = [
    { n: cols.doing.length, t: 'قيد التنفيذ', warn: false },
    { n: cols.queue.length, t: 'في الانتظار', warn: false },
    { n: cols.review.length, t: 'بانتظار اعتمادك', warn: cols.review.length > 0 },
    { n: completedToday, t: 'منجزة اليوم', warn: false },
  ]

  const chipProjects = d.projects
    .map((p) => ({ id: p.id, name: p.name, n: d.issues.filter((i) => i.project_id === p.id && colOf(i)).length }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n)
  const boardTotal = d.issues.filter((i) => colOf(i)).length

  return (
    <div>
      {/* شريط الإحصائيات */}
      <div className="mb-3 grid grid-cols-4 gap-1.5 text-center">
        {kpis.map((k) => (
          <div key={k.t} className={`rounded-xl border px-1 py-2 shadow-sm ${k.warn ? 'border-warn/50 bg-warn/10' : 'border-border bg-card'}`}>
            <p className={`text-lg leading-none font-bold ${k.warn ? 'text-[#9a6206] dark:text-warn' : ''}`}>{k.n}</p>
            <p className="mt-1 text-[10px] leading-tight text-muted">{k.t}</p>
          </div>
        ))}
      </div>

      {/* فلتر المشروع — لمسة واحدة */}
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="فلترة بالمشروع">
        <button
          type="button"
          onClick={() => setProjectId('all')}
          className={`min-h-11 shrink-0 rounded-full px-3 py-2 text-[13px] font-bold whitespace-nowrap ${projectId === 'all' ? 'bg-primary text-white' : 'bg-soft text-muted'}`}
        >
          الكل ({boardTotal})
        </button>
        {chipProjects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProjectId(projectId === p.id ? 'all' : p.id)}
            className={`min-h-11 shrink-0 rounded-full px-3 py-2 text-[13px] font-bold whitespace-nowrap ${projectId === p.id ? 'bg-primary text-white' : 'bg-soft text-muted'}`}
          >
            {p.name} ({p.n})
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث برقم البند (3A-…) أو كلمة من العنوان…"
        className="mb-3 min-h-11 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
        aria-label="بحث في المهام"
      />

      {scoped.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted">لا مهام مطابقة للفلتر الحالي</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="grid min-w-min grid-flow-col gap-2.5" style={{ gridTemplateColumns: 'repeat(4, minmax(228px, 1fr))' }}>
            {COLUMNS.map((col) => {
              const list = cols[col.key]
              const shown = col.key === 'done' && !showAllDone ? list.slice(0, DONE_CAP) : list
              const isReview = col.key === 'review'
              return (
                <section
                  key={col.key}
                  id={`col-${col.key}`}
                  className={`flex flex-col gap-2 rounded-2xl border p-2 ${
                    isReview ? 'border-warn/60 bg-warn/10' : 'border-dashed border-border bg-soft/40'
                  }`}
                  aria-label={col.title}
                >
                  <header className="flex items-baseline justify-between px-1 pt-0.5">
                    <h3 className={`text-sm font-bold ${isReview ? 'text-[#9a6206] dark:text-warn' : ''}`}>{col.title}</h3>
                    <span className="text-xs text-muted">{list.length}</span>
                  </header>
                  <p className="-mt-1 px-1 text-[10px] text-muted">{col.hint}</p>
                  {shown.map((i) => (
                    <TaskCard key={i.id} d={d} i={i} col={col.key} />
                  ))}
                  {list.length === 0 ? <p className="py-4 text-center text-xs text-muted">لا مهام هنا</p> : null}
                  {col.key === 'done' && list.length > DONE_CAP ? (
                    <button
                      type="button"
                      onClick={() => setShowAllDone((s) => !s)}
                      className="min-h-11 rounded-lg border border-border bg-card py-1.5 text-xs font-bold text-primary"
                    >
                      {showAllDone ? 'طيّ القائمة' : `عرض الكل (${list.length})`}
                    </button>
                  ) : null}
                </section>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted">
        اللوحة مرآة قراءة فقط — الاعتماد والتحريك بيتموا في مصدرهم، ورابط «المصدر» في كل كارت بيفتح البند مباشرة.
        طوابع الاستلام والتسليم أوقاتها من المصدر نفسه. البنود الملغاة والمؤرشفة لا تظهر في اللوحة.
      </p>
    </div>
  )
}
