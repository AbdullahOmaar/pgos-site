import { strList, txt, useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Kv,
  LoadingState,
  PageTitle,
  StatusChip,
  TextList,
  type Tone,
} from '../components/ui'

function scoreTone(score: number): Tone {
  if (score >= 15) return 'bad'
  if (score >= 8) return 'warn'
  return 'ok'
}

function cellClass(score: number): string {
  if (score >= 15) return 'bg-bad/25'
  if (score >= 10) return 'bg-warn/40'
  if (score >= 5) return 'bg-warn/20'
  return 'bg-ok/15'
}

export default function Risks() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const risks = state.data.records.risks

  // خريطة حرارة: احتمال (صفوف) × أثر (أعمدة)
  const heat = new Map<string, number>()
  for (const r of risks) {
    const key = `${Number(r.likelihood)}x${Number(r.impact)}`
    heat.set(key, (heat.get(key) ?? 0) + 1)
  }

  return (
    <div>
      <PageTitle
        title="المخاطر"
        sub="درجة الخطر الأصيلة = الاحتمال × الأثر (١–٥ لكل منهما)، كما هي محسوبة في سجل PGOS نفسه"
      />

      <Card className="mb-4">
        <h2 className="mb-2 font-bold">خريطة الحرارة (احتمال × أثر)</h2>
        <div className="overflow-x-auto">
          <table className="border-separate" style={{ borderSpacing: 4 }}>
            <thead>
              <tr>
                <th className="p-1 text-xs text-muted">احتمال ↓ / أثر ←</th>
                {[1, 2, 3, 4, 5].map((i) => (
                  <th key={i} className="p-1 text-xs text-muted">
                    {i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map((l) => (
                <tr key={l}>
                  <th className="p-1 text-xs text-muted">{l}</th>
                  {[1, 2, 3, 4, 5].map((i) => {
                    const n = heat.get(`${l}x${i}`) ?? 0
                    return (
                      <td
                        key={i}
                        className={`h-10 w-10 rounded-lg text-center align-middle text-sm font-bold ${cellClass(l * i)}`}
                        title={`احتمال ${l} × أثر ${i} = ${l * i}`}
                      >
                        {n > 0 ? n : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">الأرقام داخل الخلايا = عدد المخاطر المسجلة عند هذا التقاطع.</p>
      </Card>

      {risks.length === 0 ? (
        <EmptyState text="لا توجد سجلات مخاطر بعد" />
      ) : (
        <div className="space-y-4">
          {risks.map((r) => {
            const score = Number(r.inherent_score)
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{txt(r.title)}</h2>
                  <StatusChip status={txt(r.status)} />
                  <Chip tone="info">{r.id}</Chip>
                  <Chip tone={scoreTone(score)}>الدرجة الأصيلة {score}</Chip>
                  {typeof r.residual_score === 'number' ? (
                    <Chip tone={scoreTone(r.residual_score)}>
                      الدرجة المتبقية {r.residual_score}
                    </Chip>
                  ) : null}
                </div>
                <dl className="mt-2">
                  <Kv label="الوصف">
                    <span className="whitespace-pre-wrap">{txt(r.description)}</span>
                  </Kv>
                  <Kv label="الاحتمال × الأثر">
                    {txt(r.likelihood)} × {txt(r.impact)}
                  </Kv>
                  <Kv label="المشروع">{txt(r.project_id)}</Kv>
                  <Kv label="المالك">{txt(r.owner_id)}</Kv>
                  <Kv label="التخفيفات">
                    <TextList items={strList(r.mitigations)} />
                  </Kv>
                </dl>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
