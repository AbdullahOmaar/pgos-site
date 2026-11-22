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

interface Criterion {
  id?: string
  given?: string
  when?: string
  then?: string
  evidence_required?: string
}

export default function WorkOrders() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const orders = state.data.records.work_orders

  return (
    <div>
      <PageTitle
        title="أوامر الشغل"
        sub="أمر الشغل هو وحدة التصريح بالتنفيذ في PGOS: هدف ونطاق ومنحة صلاحية ومعايير قبول — الاعتماد لا يعني الإسناد، والإسناد لا يعني القبول"
      />
      {orders.length === 0 ? (
        <EmptyState text="لا توجد أوامر شغل بعد" />
      ) : (
        <div className="space-y-4">
          {orders.map((wo) => {
            const assignee = (wo.assignee ?? {}) as { id?: string; verified?: boolean }
            const perm = (wo.permission ?? {}) as Record<string, unknown>
            const approvalRef = (wo.approval_ref as string) ?? (perm.approval_ref as string)
            const criteria = (Array.isArray(wo.acceptance_criteria)
              ? wo.acceptance_criteria
              : []) as Criterion[]
            const status = txt(wo.status)
            return (
              <Card key={wo.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{txt(wo.title)}</h2>
                  <StatusChip status={status} />
                  <Chip tone="info">{wo.id}</Chip>
                  <Chip tone="muted">{txt(wo.project_id)}</Chip>
                </div>

                {status === 'APPROVED' && !approvalRef ? (
                  <p className="mt-2 rounded-xl bg-bad/10 p-2 text-sm font-semibold text-bad">
                    ⚠ حالة APPROVED بلا approval_ref ظاهر في السجل — تُعرض كادعاء اعتماد لا
                    كاعتماد موثق حتى يظهر مرجعه.
                  </p>
                ) : null}

                <dl className="mt-2">
                  <Kv label="الهدف">
                    <span className="whitespace-pre-wrap">{txt(wo.objective)}</span>
                  </Kv>
                  {approvalRef ? (
                    <Kv label="مرجع الاعتماد">
                      <Chip tone="ok">{approvalRef}</Chip>
                    </Kv>
                  ) : null}
                  <Kv label="النطاق">
                    <TextList items={strList(wo.scope)} />
                  </Kv>
                  <Kv label="لا-أهداف">
                    <TextList items={strList(wo.non_goals)} />
                  </Kv>
                  <Kv label="المالك">{txt(wo.owner_id)}</Kv>
                  <Kv label="المُسند إليه">
                    {assignee.id ?? '—'}{' '}
                    {assignee.verified ? (
                      <Chip tone="ok">هوية موثقة</Chip>
                    ) : (
                      <Chip tone="warn">هوية غير موثقة</Chip>
                    )}
                  </Kv>
                  <Kv label="مستوى الصلاحية">
                    <Chip tone="info">{txt(perm.level)}</Chip>
                  </Kv>
                  <Kv label="أفعال مسموحة">
                    <TextList items={strList(perm.actions)} />
                  </Kv>
                  <Kv label="موارد">
                    <TextList items={strList(perm.resources)} />
                  </Kv>
                  <Kv label="البيئة">{txt(perm.environment)}</Kv>
                  <Kv label="انتهاء الصلاحية">{fmtDate(txt(perm.expires_at))}</Kv>
                  <Kv label="طبقة المخاطر">{txt(wo.risk_tier)}</Kv>
                  <Kv label="خطة التحقق">
                    <span className="whitespace-pre-wrap">{txt(wo.verification_plan)}</span>
                  </Kv>
                </dl>

                <h3 className="mt-3 mb-1 font-bold">معايير القبول</h3>
                {criteria.length === 0 ? (
                  <EmptyState text="لا معايير قبول في السجل" />
                ) : (
                  <ul className="space-y-2">
                    {criteria.map((c, i) => (
                      <li key={c.id ?? i} className="rounded-xl bg-soft p-3 text-sm">
                        <span className="font-bold">{c.id ?? `AC-${i + 1}`}</span>
                        <span className="block">
                          <b>بفرض:</b> {c.given ?? '—'} · <b>عند:</b> {c.when ?? '—'} ·{' '}
                          <b>إذن:</b> {c.then ?? '—'}
                        </span>
                        <span className="block text-muted">
                          الدليل المطلوب: {c.evidence_required ?? '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
