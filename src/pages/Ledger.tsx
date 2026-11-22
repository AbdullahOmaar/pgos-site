import { fmtDate, txt, useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
} from '../components/ui'

const TYPE_LABELS: Record<string, string> = {
  achievement: 'إنجاز',
  decision: 'قرار',
  report: 'تقرير',
  project_state: 'حالة مشروع',
  system: 'نظام',
  correction: 'تصحيح',
  milestone: 'محطة',
}

export default function Ledger() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const ledger = state.data.ledger

  return (
    <div>
      <PageTitle
        title="سجل الشركة الموحّد"
        sub="سجل append-only: لا قيد يُعدَّل ولا يُحذف أبدًا، والتصحيح قيد جديد يراجع الأصل. تُعرض هنا نتيجة تحقق السلسلة وعدد القيود — لا البصمات الخام."
      />

      <Card className="mb-4">
        {ledger.chain_verified ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Chip tone="ok">سلسلة التجزئة سليمة ✔</Chip>
            <span>
              أُعيد حساب كل بصمة (SHA-256) وقت توليد هذه البيانات: {ledger.count} قيدًا من
              L-0001 إلى {ledger.last_id}، كل قيد مربوط بسابقه. لو كانت السلسلة مكسورة لما
              وُجدت هذه الصفحة أصلًا — التوليد يقف ولا ينشر فوق سجل مكسور.
            </span>
          </p>
        ) : (
          <p className="text-sm font-bold text-bad">
            ⚠ حالة السلسلة في هذه النسخة غير مؤكدة — لا تعتمد على هذه البيانات.
          </p>
        )}
      </Card>

      {ledger.entries.length === 0 ? (
        <EmptyState text="السجل فارغ" />
      ) : (
        <ol className="space-y-3">
          {ledger.entries.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{e.id}</span>
                  <Chip tone="info">{TYPE_LABELS[e.type] ?? e.type}</Chip>
                  <Chip tone="muted">{e.project}</Chip>
                  <span className="text-sm text-muted">{fmtDate(e.ts)}</span>
                  {e.backfilled ? (
                    <Chip tone="warn">مُعاد بناؤه — وقته تقريبي</Chip>
                  ) : null}
                </div>
                <h3 className="mt-1 font-bold">{e.title}</h3>
                {e.summary ? (
                  <p className="mt-1 text-sm whitespace-pre-wrap">{e.summary}</p>
                ) : null}
                {e.refs ? (
                  <p className="mt-2 text-sm text-muted">
                    مراجع:{' '}
                    {Object.entries(e.refs).map(([k, v]) => `${k}: ${txt(v)}`).join(' · ')}
                  </p>
                ) : null}
                {e.legs ? (
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-muted">حلقات الاكتمال:</span>
                    {Object.entries(e.legs).map(([k, v]) => (
                      <Chip key={k} tone={v ? 'ok' : 'bad'}>
                        {k}: {v ? txt(v) === 'true' ? 'مسجلة' : txt(v) : 'ناقصة'}
                      </Chip>
                    ))}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
