import { fmtDate, useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
} from '../components/ui'

const LEG_LABELS: Record<string, string> = {
  whatsapp: 'ملخص واتساب',
  linear: 'بند Linear مكتمل',
  dashboard: 'حضور في لوحة المتابعة',
  ledger: 'قيد في سجل الشركة',
}

export default function Completeness() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const g = state.data.guard
  const cache = Object.entries(g.state.linear_cache ?? {})

  return (
    <div>
      <PageTitle
        title="حالة الاكتمال — قاعدة الرباعية"
        sub="قرار DEC-TOTO-002: لا إنجاز يُحتسب «تم» إلا بأدلته الأربعة معًا — بند Linear ‏Done + حضور في اللوحة + ملخص واتساب مسجل + قيد في سجل الشركة. الحارس الآلي يفحص ويُنبّه مرة واحدة لكل فجوة."
      />

      <Card className="mb-4">
        <dl className="text-sm">
          <div className="grid grid-cols-[9rem_1fr] gap-2 py-1">
            <dt className="text-muted">آخر تشغيل للحارس</dt>
            <dd className="font-semibold">{fmtDate(g.state.last_run)}</dd>
          </div>
          <div className="grid grid-cols-[9rem_1fr] gap-2 py-1">
            <dt className="text-muted">تنبيهات صادرة</dt>
            <dd>
              {g.alerts.length === 0 ? (
                <Chip tone="ok">لا تنبيهات — لا فجوات مؤكدة</Chip>
              ) : (
                <Chip tone="warn">{g.alerts.length} تنبيهًا مسجلًا</Chip>
              )}
            </dd>
          </div>
          <div className="grid grid-cols-[9rem_1fr] gap-2 py-1">
            <dt className="text-muted">بصمات مُنبَّه عنها</dt>
            <dd className="break-words">
              {(g.state.alerted ?? []).length > 0
                ? (g.state.alerted ?? []).join(' · ')
                : '—'}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          فترة سماح ٤٥ دقيقة للقيود الجديدة قبل احتساب أي فجوة، وحمولة لوحة أقدم من ٣ ساعات
          تُعد «تعذّر تحقق» لا «فجوة» — كما في منطق الحارس نفسه، بلا إنذارات كاذبة.
        </p>
      </Card>

      <h2 className="mb-2 text-lg font-bold">الفجوات المؤكدة (تنبيهات الحارس)</h2>
      {g.alerts.length === 0 ? (
        <EmptyState text="لا توجد فجوات مؤكدة في آخر حالة للحارس" />
      ) : (
        <div className="space-y-3">
          {g.alerts.map((a, i) => (
            <Card key={i}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{a.entry}</span>
                <span className="text-sm text-muted">{fmtDate(a.ts)}</span>
              </div>
              <p className="mt-1 font-semibold">{a.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-sm">
                <span className="text-muted">الحلقات الناقصة:</span>
                {a.missing.map((m) => (
                  <Chip key={m} tone="bad">
                    {LEG_LABELS[m] ?? m}
                  </Chip>
                ))}
              </p>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-6 mb-2 text-lg font-bold">حالات Linear عند آخر فحص (كاش الحارس)</h2>
      {cache.length === 0 ? (
        <EmptyState text="لا توجد حالات مخزنة في كاش الحارس" />
      ) : (
        <Card>
          <ul className="divide-y divide-border text-sm">
            {cache.map(([id, v]) => (
              <li key={id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-bold">{id}</span>
                <Chip tone={v.status === 'Done' ? 'ok' : 'warn'}>{v.status}</Chip>
                <span className="text-muted">فُحصت: {fmtDate(v.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
