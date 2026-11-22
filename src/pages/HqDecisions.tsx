import { fmtDate, useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
} from '../components/ui'

export default function HqDecisions() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const hq = state.data.hq_decisions

  return (
    <div>
      <PageTitle
        title="قرارات المقر — سجل قرارات الشركة"
        sub="مقر Drive المشترك هو المصدر الكانوني الواحد لقرارات الشركة ومواثيقها (مصالحة D-1) — ما هنا لقطة نصية منه للقراءة فقط."
      />

      {!hq.available || hq.blocks.length === 0 ? (
        <EmptyState text="لقطة قرارات المقر غير متاحة في هذه النسخة من البيانات (الملف غائب أو فارغ وقت التوليد) — لا تُعرض قرارات بديلة أو مخمّنة. المرجع الكانوني يبقى مستند «سجل قرارات الشركة» في مقر Drive نفسه." />
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Chip tone="warn">لقطة — ليست المصدر</Chip>
              <span>
                وقت اللقطة: <strong>{fmtDate(hq.snapshot_at)}</strong>
              </span>
            </div>
            {hq.source ? (
              <p className="mt-2 text-sm text-muted">المصدر: {hq.source}</p>
            ) : null}
            <p className="mt-2 text-sm font-semibold text-bad">
              ⚠️ {hq.extraction_note} — أي تعارض بين هذه اللقطة والمستند يُحسم لصالح
              المستند.
            </p>
            <p className="mt-1 text-xs text-muted">
              عدد كتل القرارات في اللقطة: {hq.blocks.length} — تُعرض كما وردت في النص
              المستخرج، دون إعادة صياغة.
            </p>
          </Card>

          <div className="space-y-3">
            {hq.blocks.map((b, i) => (
              <Card key={i}>
                <h2 className="mb-2 font-bold">— {b.heading} —</h2>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{b.body}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
