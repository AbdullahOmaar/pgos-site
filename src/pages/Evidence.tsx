import { fmtDate, strList, txt, useSiteData } from '../lib/data'
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
} from '../components/ui'

export default function Evidence() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const evidence = state.data.records.evidence
  const releases = state.data.records.releases

  return (
    <div>
      <PageTitle
        title="الأدلة والإصدارات"
        sub="الدليل مرتبط بمعيار قبول ومراجعة دقيقة (exact revision) وبيئة — نتيجة الدليل كما سجّلها منتِجه، والحالات لا تُدمج: PASS ليست LIVE_VERIFIED"
      />

      <h2 className="mb-2 text-lg font-bold">الأدلة (Evidence)</h2>
      {evidence.length === 0 ? (
        <EmptyState text="لا توجد سجلات أدلة بعد" />
      ) : (
        <div className="space-y-4">
          {evidence.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{e.id}</h3>
                <StatusChip status={txt(e.result)} />
                <Chip tone="muted">{txt(e.work_order_id)}</Chip>
                <Chip tone="muted">{txt(e.project_id)}</Chip>
              </div>
              <dl className="mt-2">
                <Kv label="المعايير">
                  <span className="flex flex-wrap gap-1">
                    {strList(e.criterion_ids).map((c) => (
                      <Chip key={c} tone="info">
                        {c}
                      </Chip>
                    ))}
                  </span>
                </Kv>
                <Kv label="المراجعة الدقيقة">{txt(e.exact_revision)}</Kv>
                <Kv label="البيئة">{txt(e.environment)}</Kv>
                <Kv label="النطاق">
                  <span className="whitespace-pre-wrap">{txt(e.scope)}</span>
                </Kv>
                <Kv label="الإجراء">
                  <span className="whitespace-pre-wrap">{txt(e.procedure)}</span>
                </Kv>
                <Kv label="المنتِج">{txt(e.producer_id)}</Kv>
                <Kv label="الوقت">{fmtDate(txt(e.timestamp))}</Kv>
                {e.notes ? (
                  <Kv label="ملحوظات">
                    <span className="whitespace-pre-wrap">{txt(e.notes)}</span>
                  </Kv>
                ) : null}
              </dl>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-6 mb-2 text-lg font-bold">الإصدارات (Release)</h2>
      {releases.length === 0 ? (
        <EmptyState text="لا توجد سجلات إصدارات بعد — القسم جاهز لعرضها فور إنشائها بصيغة PGOS" />
      ) : (
        <div className="space-y-4">
          {releases.map((rel) => (
            <Card key={rel.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{rel.id}</h3>
                <StatusChip status={txt(rel.status)} />
                <Chip tone="muted">{txt(rel.project_id)}</Chip>
              </div>
              <dl className="mt-2">
                <Kv label="المراجعة الدقيقة">{txt(rel.exact_revision)}</Kv>
                <Kv label="البيئة">{txt(rel.environment)}</Kv>
                <Kv label="أوامر الشغل">
                  <TextList items={strList(rel.work_order_ids)} />
                </Kv>
                <Kv label="خطة التراجع">
                  <span className="whitespace-pre-wrap">{txt(rel.rollback_plan)}</span>
                </Kv>
                <Kv label="سلطة الإصدار">{txt(rel.release_authority_id)}</Kv>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
