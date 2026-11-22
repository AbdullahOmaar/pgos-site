import { useMemo, useState } from 'react'
import { fmtDate, fmtDay, useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  StatusChip,
} from '../components/ui'

/* أولويات Linear: 0=بلا، 1=عاجلة، 2=عالية، 3=متوسطة، 4=منخفضة */
const PRIORITY_LABELS: Record<number, string> = {
  1: 'عاجلة',
  2: 'عالية',
  3: 'متوسطة',
  4: 'منخفضة',
}

export default function Tasks() {
  const state = useSiteData()
  const [project, setProject] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [query, setQuery] = useState('')

  const data = state.phase === 'ready' ? state.data : null

  const scoped = useMemo(() => {
    if (!data) return []
    return project === 'all'
      ? data.linear.issues
      : data.linear.issues.filter((i) => i.projectUuid === project)
  }, [data, project])

  const statuses = useMemo(() => {
    const set = new Map<string, number>()
    for (const i of scoped) {
      const s = i.statusName ?? 'غير معروف'
      set.set(s, (set.get(s) ?? 0) + 1)
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1])
  }, [scoped])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scoped.filter((i) => {
      if (status !== 'all' && (i.statusName ?? 'غير معروف') !== status) return false
      if (!q) return true
      return (
        i.title.toLowerCase().includes(q) ||
        i.identifier.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [scoped, status, query])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data

  const projectName = (uuid?: string) =>
    d.linear.projects.find((p) => p.uuid === uuid)?.name ?? '—'

  return (
    <div>
      <PageTitle
        title="التاسكات والمشاريع — Linear"
        sub="Linear هو بيت التاسكات الوحيد؛ هذه مرآة قراءة من لقطات الحمولة المزامنة (كل مشروع موسوم بملف مصدره). التعديل يتم في Linear نفسه."
      />

      {/* تبويبات المشاريع */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setProject('all')
            setStatus('all')
          }}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
            project === 'all' ? 'bg-primary text-white' : 'bg-soft text-muted'
          }`}
        >
          الكل ({d.linear.issues.length})
        </button>
        {d.linear.projects.map((p) => {
          const n = d.linear.issues.filter((i) => i.projectUuid === p.uuid).length
          return (
            <button
              key={p.uuid}
              type="button"
              onClick={() => {
                setProject(p.uuid)
                setStatus('all')
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                project === p.uuid ? 'bg-primary text-white' : 'bg-soft text-muted'
              }`}
            >
              <span
                className="me-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                style={{ background: p.color ?? '#95a2b3' }}
                aria-hidden
              />
              {p.name} ({n})
            </button>
          )
        })}
      </div>

      {/* وسوم مصادر المشاريع */}
      <p className="mb-3 text-xs text-muted">
        مصادر اللقطات:{' '}
        {d.linear.projects
          .map((p) => `${p.name} ← ${p.sourceFile ?? 'غير موسوم'}`)
          .join(' · ')}
      </p>

      {/* بحث + فلتر حالة */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث برقم البند (3A-…) أو كلمة من العنوان/الوصف…"
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm sm:flex-1"
          aria-label="بحث في البنود"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
          aria-label="فلترة حسب الحالة"
        >
          <option value="all">كل الحالات ({scoped.length})</option>
          {statuses.map(([s, n]) => (
            <option key={s} value={s}>
              {s} ({n})
            </option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-sm text-muted">
        المعروض: <span className="font-bold text-text">{filtered.length}</span> بندًا
        {project !== 'all' ? ` في «${projectName(project)}»` : ' في كل المشاريع'}
        {status !== 'all' ? ` بحالة «${status}»` : ''}
        {query.trim() ? ` يطابق «${query.trim()}»` : ''}
      </p>

      {filtered.length === 0 ? (
        <EmptyState text="لا بنود مطابقة للفلاتر الحالية في هذه اللقطة" />
      ) : (
        <ul className="space-y-2">
          {filtered.map((i) => (
            <li key={i.uuid}>
              <Card className="p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Chip tone="info">{i.identifier}</Chip>
                  <StatusChip status={i.statusName} />
                  {i.priorityValue && PRIORITY_LABELS[i.priorityValue] ? (
                    <Chip tone={i.priorityValue <= 2 ? 'warn' : 'muted'}>
                      أولوية: {PRIORITY_LABELS[i.priorityValue]}
                    </Chip>
                  ) : null}
                  <span className="text-xs text-muted">{projectName(i.projectUuid)}</span>
                </div>
                <p className="mt-1.5 font-semibold">{i.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {i.dueDate ? <span>الاستحقاق: {fmtDay(i.dueDate)}</span> : null}
                  {i.updatedAt ? <span>آخر تحديث: {fmtDate(i.updatedAt)}</span> : null}
                  {i.url ? (
                    /^https?:\/\//.test(i.url) ? (
                      <a
                        className="font-semibold text-accent underline"
                        href={i.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        فتح في Linear ←
                      </a>
                    ) : (
                      /* مخطط غير http(s): يُعرض كنص بلا href (نفس نمط FieldValue) */
                      <span className="break-all">{i.url}</span>
                    )
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
