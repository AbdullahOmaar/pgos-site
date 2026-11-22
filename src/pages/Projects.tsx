import { fmtDay, strList, txt, useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  FieldValue,
  Kv,
  LoadingState,
  PageTitle,
  StatusChip,
  TextList,
} from '../components/ui'

export default function Projects() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const projects = state.data.records.projects

  return (
    <div>
      <PageTitle
        title="المشاريع ومواثيقها"
        sub="سجلات Project بصيغة PGOS كما هي في ملفاتها الكانونية — الميثاق والمخاطر والمصادر"
      />
      {projects.length === 0 ? (
        <EmptyState text="لا توجد سجلات مشاريع بعد" />
      ) : (
        <div className="space-y-4">
          {projects.map((p) => {
            const owner = (p.owner ?? {}) as { id?: string; verified?: boolean }
            const sources = (p.canonical_sources ?? {}) as Record<string, unknown>
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{txt(p.name)}</h2>
                  <StatusChip status={txt(p.status)} />
                  <Chip tone="info">{p.id}</Chip>
                  <Chip tone="muted">مراجعة {txt(p.revision)}</Chip>
                </div>
                <dl className="mt-2">
                  <Kv label="المشكلة">
                    <span className="whitespace-pre-wrap">{txt(p.problem)}</span>
                  </Kv>
                  <Kv label="المالك المساءل">
                    {owner.id ?? '—'}{' '}
                    {owner.verified ? (
                      <Chip tone="ok">هوية موثقة</Chip>
                    ) : (
                      <Chip tone="warn">هوية غير موثقة</Chip>
                    )}
                  </Kv>
                  <Kv label="طبقة المخاطر">
                    <Chip tone={txt(p.risk_tier) === 'HIGH' ? 'bad' : 'warn'}>
                      {txt(p.risk_tier)}
                    </Chip>
                  </Kv>
                  <Kv label="تصنيف البيانات">
                    <span className="flex flex-wrap gap-1">
                      {strList(p.data_classes).map((c) => (
                        <Chip key={c} tone="muted">
                          {c}
                        </Chip>
                      ))}
                    </span>
                  </Kv>
                  <Kv label="النتائج المتوقعة">
                    <TextList items={strList(p.outcomes)} />
                  </Kv>
                  <Kv label="داخل النطاق">
                    <TextList items={strList(p.scope)} />
                  </Kv>
                  <Kv label="لا-أهداف صريحة">
                    <TextList items={strList(p.non_goals)} />
                  </Kv>
                  <Kv label="تاريخ الإنشاء">{fmtDay(txt(p.created_at))}</Kv>
                  <Kv label="تاريخ المراجعة">{fmtDay(txt(p.review_date))}</Kv>
                </dl>
                <h3 className="mt-3 mb-1 font-bold">المصادر الكانونية</h3>
                <dl>
                  {Object.entries(sources).map(([k, v]) => (
                    <Kv key={k} label={k}>
                      <FieldValue value={v} />
                    </Kv>
                  ))}
                </dl>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
