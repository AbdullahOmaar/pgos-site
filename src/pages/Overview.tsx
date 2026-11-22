import { Link } from 'react-router-dom'
import { fmtDate, useSiteData } from '../lib/data'
import { Card, Chip, EmptyState, ErrorState, LoadingState, PageTitle, StatusChip } from '../components/ui'

const SOURCE_LABELS: Record<string, string> = {
  'pgos-records': 'سجلات PGOS',
  ledger: 'سجل الشركة',
  'linear-payload': 'حمولة Linear',
  'linear-payload-pgos': 'حمولة Linear — مشروع PGOS',
  'hq-decisions': 'لقطة قرارات المقر',
  guard: 'حارس الاكتمال',
  'preprod-checklist': 'سجل فحص ما قبل الإنتاج',
}

function Stat({ label, value, to }: { label: string; value: number | string; to: string }) {
  return (
    <Link to={to} className="block">
      <Card className="h-full transition-transform hover:-translate-y-0.5">
        <p className="text-2xl font-bold text-primary">{value}</p>
        <p className="mt-1 text-sm text-muted">{label}</p>
      </Card>
    </Link>
  )
}

export default function Overview() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data
  const r = d.records

  const issuesByStatus = new Map<string, number>()
  for (const i of d.linear.issues) {
    const s = i.statusName ?? 'غير معروف'
    issuesByStatus.set(s, (issuesByStatus.get(s) ?? 0) + 1)
  }
  const openRisks = r.risks.filter((x) => String(x.status).toUpperCase() === 'OPEN').length
  const latestEntries = d.ledger.entries.slice(0, 5)

  return (
    <div>
      <PageTitle
        title="نظرة عامة — حالة الشركة في شاشة"
        sub={`آخر توليد للبيانات: ${fmtDate(d.meta.generated_at)} · البيانات صورة موثقة من مصادرها، لا بث حي`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="مشاريع مسجلة (PGOS)" value={r.projects.length} to="/projects" />
        <Stat label="قرارات مسجلة" value={r.decisions.length} to="/decisions" />
        <Stat label="أوامر شغل" value={r.work_orders.length} to="/work-orders" />
        <Stat
          label={`مخاطر (${openRisks} مفتوحة)`}
          value={r.risks.length}
          to="/risks"
        />
        <Stat label="قيود سجل الشركة" value={d.ledger.count} to="/ledger" />
        <Stat label="بنود Linear (آخر لقطة)" value={d.linear.issues.length} to="/tasks" />
        {d.preprod_checklist.available ? (
          <Stat
            label={`فحوصات ما قبل الإنتاج (المدرس: ${
              d.preprod_checklist.checks.filter((c) => c.apps.teacher.status === 'done')
                .length
            } منجز)`}
            value={d.preprod_checklist.checks.length}
            to="/preprod"
          />
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">سلامة سجل الشركة</h2>
          {d.ledger.chain_verified ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Chip tone="ok">السلسلة سليمة ✔</Chip>
              <span>
                {d.ledger.count} قيدًا — آخرها {d.ledger.last_id}. أُعيد حساب سلسلة التجزئة
                كاملة وقت التوليد؛ أي كسر كان سيوقف التوليد أصلًا.
              </span>
            </p>
          ) : (
            <p className="text-sm text-bad">حالة السلسلة غير مؤكدة في هذه النسخة.</p>
          )}
          <h3 className="mt-4 mb-2 font-bold">أحدث القيود</h3>
          {latestEntries.length === 0 ? (
            <EmptyState text="لا توجد قيود بعد" />
          ) : (
            <ul className="divide-y divide-border">
              {latestEntries.map((e) => (
                <li key={e.id} className="py-2 text-sm">
                  <span className="font-semibold">{e.id}</span>{' '}
                  <Chip tone="muted">{e.type}</Chip>{' '}
                  <span className="text-muted">{fmtDate(e.ts)}</span>
                  <p className="mt-0.5">{e.title}</p>
                </li>
              ))}
            </ul>
          )}
          <Link to="/ledger" className="mt-2 inline-block text-sm font-semibold text-accent">
            كل السجل ←
          </Link>
        </Card>

        <Card>
          <h2 className="mb-2 font-bold">فجوات الاكتمال (حارس الرباعية)</h2>
          <p className="text-sm text-muted">
            آخر تشغيل للحارس: {fmtDate(d.guard.state.last_run)} · تنبيهات مسجلة:{' '}
            {d.guard.alerts.length}
          </p>
          {d.guard.alerts.length === 0 ? (
            <p className="mt-2 text-sm">
              <Chip tone="ok">لا فجوات مؤكدة</Chip>
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {d.guard.alerts.map((a, i) => (
                <li key={i} className="rounded-xl bg-warn/10 p-2 text-sm">
                  <span className="font-semibold">{a.entry}</span> — {a.title}
                  <span className="block text-bad">
                    الحلقات الناقصة: {a.missing.join('، ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/completeness" className="mt-2 inline-block text-sm font-semibold text-accent">
            تفاصيل الاكتمال ←
          </Link>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 font-bold">حالة بنود Linear (آخر لقطة مزامنة)</h2>
        <div className="flex flex-wrap gap-2">
          {[...issuesByStatus.entries()].map(([s, n]) => (
            <span key={s} className="inline-flex items-center gap-2 text-sm">
              <StatusChip status={s} />
              <span className="font-bold">{n}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          المشاريع في اللقطة: {d.linear.projects.map((p) => p.name).join(' · ') || '—'}
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-2 font-bold">حداثة المصادر</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-muted">
                <th className="py-1 text-start font-semibold">المصدر</th>
                <th className="py-1 text-start font-semibold">آخر تعديل</th>
                <th className="py-1 text-start font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {d.meta.sources_freshness.map((s) => (
                <tr key={s.source} className="border-t border-border">
                  <td className="py-1.5">{SOURCE_LABELS[s.source] ?? s.source}</td>
                  <td className="py-1.5">{fmtDate(s.modified_at)}</td>
                  <td className="py-1.5">
                    {s.stale ? (
                      <Chip tone="warn">قديم — تجاوز عتبة الحداثة</Chip>
                    ) : (
                      <Chip tone="ok">ضمن الحداثة</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          بصمات SHA-256 لكل ملف مصدر محفوظة في ملف تدقيق محلي عند المولّد
          (build-meta.local.json) — لا تُخدَّم مع الموقع ولا تخرج في بيانات الواجهة؛
          المعروض هنا عدّادات المصادر وأختام حداثتها فقط.
        </p>
      </Card>
    </div>
  )
}
