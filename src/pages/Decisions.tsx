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

export default function Decisions() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const decisions = state.data.records.decisions
  const changes = state.data.records.changes

  return (
    <div>
      <PageTitle
        title="القرارات والتغييرات"
        sub="سجلات Decision بصيغة PGOS. ملحوظة صدق: كلمة APPROVED في سجل هي ادعاء ما لم يُتحقق من مرجع الاعتماد في نظام الاعتماد الكانوني (سجل قرارات المقر في Drive) — والموقع يعرض السجل كما هو بمعتمِديه ومراجعه الظاهرة."
      />
      {decisions.length === 0 ? (
        <EmptyState text="لا توجد سجلات قرارات بعد" />
      ) : (
        <div className="space-y-4">
          {decisions.map((dec) => (
            <Card key={dec.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{txt(dec.title)}</h2>
                <StatusChip status={txt(dec.status)} />
                <Chip tone="info">{dec.id}</Chip>
                <Chip tone="muted">{txt(dec.project_id)}</Chip>
              </div>
              <dl className="mt-2">
                <Kv label="السياق">
                  <span className="whitespace-pre-wrap">{txt(dec.context)}</span>
                </Kv>
                <Kv label="الخيارات">
                  <TextList items={strList(dec.options)} />
                </Kv>
                <Kv label="القرار">
                  <span className="font-semibold whitespace-pre-wrap">{txt(dec.decision)}</span>
                </Kv>
                <Kv label="المبرر">
                  <span className="whitespace-pre-wrap">{txt(dec.rationale)}</span>
                </Kv>
                <Kv label="المالك">{txt(dec.owner_id)}</Kv>
                <Kv label="المعتمِدون">
                  <TextList items={strList(dec.approver_ids)} />
                </Kv>
                <Kv label="نافذ من">{fmtDate(txt(dec.effective_at))}</Kv>
                {dec.supersedes ? (
                  <Kv label="يحل محل">{txt(dec.supersedes)}</Kv>
                ) : null}
              </dl>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-6 mb-2 text-lg font-bold">طلبات التغيير (ChangeRequest)</h2>
      {changes.length === 0 ? (
        <EmptyState text="لا توجد سجلات طلبات تغيير بعد — القسم جاهز لعرضها فور إنشائها بصيغة PGOS" />
      ) : (
        <div className="space-y-4">
          {changes.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{txt(c.title ?? c.id)}</h3>
                <StatusChip status={txt(c.status)} />
                <Chip tone="info">{c.id}</Chip>
              </div>
              <dl className="mt-2">
                <Kv label="المحفّز">{txt(c.trigger)}</Kv>
                <Kv label="السبب">{txt(c.reason)}</Kv>
                <Kv label="الحالة المقترحة">{txt(c.proposed_state)}</Kv>
                <Kv label="تصنيف المخاطر">{txt(c.risk_classification)}</Kv>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
