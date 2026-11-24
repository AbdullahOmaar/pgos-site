import { Link } from 'react-router-dom'
import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge, ProgressBar, SectionTitle, StatCard } from '../components/v2/widgets'
import { fmtDate } from '../lib/data'
import { completionPct, phaseIssues, projectIssues, PHASES } from '../lib/live/metrics'
import { useOsData } from '../lib/live/provider'

/*
 * الصفحة الأولى من واجهة اوس الجديدة (3A-352) — لوحة القيادة.
 * عربية أولًا، موبايل أولًا (هدف لمس ≥44px، شبكة عمودين على الموبايل).
 * كل رقم محسوب من عقد البيانات (READ-CONTRACT) عبر طبقة provider واحدة — بلا بيانات مخترعة.
 */
export default function Dashboard() {
  const state = useOsData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data

  const liveIssues = d.issues.filter((i) => !i.archived_at)
  const overall = completionPct(liveIssues)
  const inProgress = liveIssues.filter((i) => i.status_type === 'started').length
  const recent = [...liveIssues].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6)
  const hasLabels = liveIssues.some((i) => i.labels.length > 0)

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">لوحة قيادة اوس</h1>
        <p className="mt-1 text-sm text-muted">حالة الشركة في شاشة واحدة — المشاريع، الشغل الجاري، وآخر القرارات.</p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      {/* مؤشر الإنجاز العام */}
      <Card className="mb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted">إنجاز البنود الحية (منجز ÷ الكل بلا الملغي)</p>
            <p className="mt-1 text-4xl font-bold text-primary">{overall}٪</p>
          </div>
          <p className="text-left text-xs leading-5 text-muted">{liveIssues.length} بند حي<br />{inProgress} قيد التنفيذ الآن</p>
        </div>
        <div className="mt-3"><ProgressBar pct={overall} /></div>
        {hasLabels ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {PHASES.map((ph) => {
              const items = phaseIssues(d.issues, ph)
              const pct = completionPct(items)
              return (
                <div key={ph} className="rounded-xl bg-soft p-3">
                  <p className="text-xs font-semibold text-muted">{ph === 'Phase 1' ? 'المرحلة الأولى' : 'المرحلة الثانية'}</p>
                  <p className="mt-0.5 text-lg font-bold">{pct}٪ <span className="text-xs font-normal text-muted">({items.length} بند)</span></p>
                  <div className="mt-2"><ProgressBar pct={pct} /></div>
                </div>
              )
            })}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="مشاريع" value={d.projects.length} to="/projects" />
        <StatCard label="مخاطر مفتوحة" value={d.openRisks} to="/risks" />
        <StatCard label="قيود سجل الشركة" value={d.ledgerCount} sub={d.ledgerVerified ? 'السلسلة سليمة ✔' : 'حالة السلسلة غير مؤكدة'} to="/ledger" />
        <StatCard label="تنبيهات الحارس" value={d.guardAlerts} sub={d.guardAlerts === 0 ? 'لا فجوات مؤكدة' : 'فجوات تحتاج متابعة'} to="/completeness" />
      </div>

      <SectionTitle to="/projects">المشاريع ونسبها</SectionTitle>
      {d.projects.length === 0 ? <EmptyState text="لا مشاريع في مصدر البيانات الحالي" /> : (
        <div className="space-y-3">
          {d.projects.map((p) => {
            const items = projectIssues(d.issues, p.id)
            const pct = completionPct(items)
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{p.name}</p>
                    {p.summary ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{p.summary}</p> : null}
                  </div>
                  <span className="shrink-0 text-lg font-bold text-primary">{pct}٪</span>
                </div>
                <div className="mt-3"><ProgressBar pct={pct} color={p.color} /></div>
                <p className="mt-2 text-xs text-muted">{items.length} بند حي{p.status_name ? ` · الحالة: ${p.status_name}` : ''}</p>
              </Card>
            )
          })}
        </div>
      )}

      <SectionTitle to="/tasks">آخر حركة على البنود</SectionTitle>
      {recent.length === 0 ? <EmptyState text="لا بنود محدثة في مصدر البيانات الحالي" /> : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {recent.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <p className="text-sm"><span className="font-bold">{i.identifier}</span> <Chip tone="muted">{i.status_name}</Chip></p>
                <p className="mt-1 text-sm">{i.title}</p>
                <p className="mt-0.5 text-xs text-muted">{fmtDate(i.updated_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SectionTitle to="/hq-decisions">أحدث قرارات المقر</SectionTitle>
      {d.decisions.length === 0 ? <EmptyState text="لا قرارات في مصدر البيانات الحالي" /> : (
        <div className="space-y-3">
          {d.decisions.slice(0, 3).map((dec) => (
            <Card key={dec.id}>
              <p className="font-bold">{dec.heading}</p>
              <p className="mt-1 line-clamp-3 text-sm text-muted">{dec.body}</p>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        الواجهة الجديدة قيد البناء على فرع منفصل — باقي الأقسام الحالية من القائمة العلوية. <Link to="/overview" className="font-semibold text-accent">النظرة العامة القديمة ←</Link>
      </p>
    </div>
  )
}
