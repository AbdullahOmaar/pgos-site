import { Link } from 'react-router-dom'
import { useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Kv,
  LoadingState,
  PageTitle,
} from '../components/ui'

export default function Adoption() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const g = state.data.governance_ref

  if (!g.available || !g.deviations || !g.adoption_steps || !g.gaps) {
    return (
      <div>
        <PageTitle title="التبنّي والانحرافات والفجوات" />
        <EmptyState text="مرجع الحوكمة (tools/governance_ref.json) غير متاح في هذه النسخة من البيانات — لا تُعرض محويات بديلة. المرجع الأصلي: ops-system/pgos/ADOPTION-PROFILE.md وdocs/PGOS-STUDY.md." />
      </div>
    )
  }

  return (
    <div>
      <PageTitle
        title="التبنّي والانحرافات والفجوات"
        sub="صفحة الشفافية الحوكمية: ما اعتمدناه، وأين انحرفنا عن PGOS الأصلي ولماذا، وما الذي ما زال ناقصًا — كما هو، دون تجميل."
      />

      <Card className="mb-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Chip tone="warn">حالة PGOS</Chip>
          <span>
            <strong>0.2.1 DRAFT</strong> — معتمد محليًا لنطاق «توتو» فقط بقرار مالك موثق
            (DEC-TOTO-001 + قيد سجل قرارات المقر)، لا اعتمادًا عامًا لكل المشاريع.
          </span>
        </p>
      </Card>

      {/* الانحرافات */}
      <h2 className="mb-2 text-lg font-bold">الانحرافات الصريحة عن PGOS الأصلي</h2>
      <div className="mb-5 space-y-3">
        {g.deviations.map((dv) => (
          <Card key={dv.id}>
            <div className="mb-1 flex items-center gap-2">
              <Chip tone="info">{dv.id}</Chip>
              <h3 className="font-bold">{dv.deviation}</h3>
            </div>
            <dl>
              <Kv label="السبب">
                <span className="text-sm">{dv.reason}</span>
              </Kv>
              <Kv label="المعتمِد">
                <span className="text-sm">{dv.approver}</span>
              </Kv>
            </dl>
          </Card>
        ))}
      </div>

      {/* خطوات التبنّي */}
      <h2 className="mb-2 text-lg font-bold">تسلسل التبنّي من ١٠ خطوات — حالته عندنا</h2>
      <Card className="mb-5">
        <ol className="divide-y divide-border">
          {g.adoption_steps.map((s) => (
            <li key={s.n} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="muted">{s.n}</Chip>
                <span className="font-semibold">{s.step}</span>
                <Chip tone={s.status === 'done' ? 'ok' : 'warn'}>{s.status_label}</Chip>
              </div>
              <p className="mt-1 text-sm text-muted">{s.detail}</p>
            </li>
          ))}
        </ol>
      </Card>

      {/* خط الأنابيب التحققي */}
      {g.verification_pipeline ? (
        <Card className="mb-5">
          <h2 className="mb-2 font-bold">خط الأنابيب التحققي — آلية «مفيش حاجة تقع»</h2>
          <ol className="list-decimal space-y-1 ps-5 text-sm">
            {g.verification_pipeline.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-2 text-sm leading-relaxed text-warn">
            ⚠️ {g.verification_pipeline.status_note}
          </p>
          <Link
            to="/validation"
            className="mt-2 inline-block text-sm font-semibold text-accent"
          >
            صفحة حالة التحقق الداخلي ←
          </Link>
        </Card>
      ) : null}

      {/* الفجوات */}
      <h2 className="mb-2 text-lg font-bold">فجوات اكتمال PGOS وحدوده المعلنة ({g.gaps.length})</h2>
      <div className="space-y-3">
        {g.gaps.map((gap) => (
          <Card key={gap.n}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Chip tone="bad">فجوة {gap.n}</Chip>
              <h3 className="font-bold">{gap.title}</h3>
            </div>
            <dl>
              <Kv label="مصدر الإعلان">
                <span className="text-sm">{gap.source}</span>
              </Kv>
              <Kv label="الأثر عندنا">
                <span className="text-sm">{gap.impact}</span>
              </Kv>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  )
}
