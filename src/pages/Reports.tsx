import { fmtDate, useSiteData } from '../lib/data'
import type { LedgerEntry } from '../types'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  StatusChip,
} from '../components/ui'

function EntryLine({ e }: { e: LedgerEntry }) {
  return (
    <li className="py-1.5 text-sm">
      <span className="font-semibold">{e.id}</span> <Chip tone="muted">{e.type}</Chip>{' '}
      <span className="text-muted">{fmtDate(e.ts)}</span>
      {e.backfilled ? <Chip tone="warn">backfilled — وقت تقريبي</Chip> : null}
      <p className="mt-0.5">{e.title}</p>
      {e.summary ? <p className="text-muted">{e.summary}</p> : null}
    </li>
  )
}

export default function Reports() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data

  const genDate = new Date(d.meta.generated_at)
  const genDay = d.meta.generated_at.slice(0, 10)
  const weekStart = new Date(genDate.getTime() - 7 * 24 * 3600 * 1000)

  const issues = d.linear.issues
  const byStatus = new Map<string, number>()
  for (const i of issues) {
    const s = i.statusName ?? 'غير معروف'
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1)
  }
  const doneCount = byStatus.get('Done') ?? 0
  const inProgress = issues.filter((i) => i.statusName === 'In Progress')
  const openCount = issues.length - (byStatus.get('Done') ?? 0) - (byStatus.get('Canceled') ?? 0)

  const entries = d.ledger.entries // الأحدث أولًا كما في الملف المولّد
  const todayEntries = entries.filter((e) => e.ts.slice(0, 10) === genDay)
  const weekEntries = entries.filter((e) => new Date(e.ts) >= weekStart)
  const weekByType = new Map<string, number>()
  for (const e of weekEntries) weekByType.set(e.type, (weekByType.get(e.type) ?? 0) + 1)
  const weekAchievements = weekEntries.filter((e) => e.type === 'achievement')
  const weekDecisions = weekEntries.filter((e) => e.type === 'decision')
  const latestAchievements = entries.filter((e) => e.type === 'achievement').slice(0, 5)

  return (
    <div>
      <PageTitle
        title="التقارير — ساعة / يوم / أسبوع"
        sub="نفس أقسام قوالب «توتو» الرسمية، محسوبة من بيانات هذا الملف المولّد فقط."
      />

      <Card className="mb-4">
        <h2 className="mb-1 font-bold">مصدر البيانات الواحد</h2>
        <p className="text-sm leading-relaxed">
          كما تعلن قوالب <code dir="ltr">ops-system/templates</code> نفسها: مصدر البيانات
          الواحد هو <strong>سجل الشركة</strong> (company-ledger) للتقارير اليومية
          والأسبوعية، و<strong>+ لقطة Linear</strong> لتقرير الساعة. أي إنجاز يُذكر هنا له
          قيد في السجل، وأي قيد ناقص الرباعية يظهر في قسم الفجوات لا يُخفى — وأي رقم في
          هذه الصفحة محسوب من بيانات الملف المولّد بتاريخ {fmtDate(d.meta.generated_at)}،
          لا من ذاكرة أي وكيل.
        </p>
      </Card>

      {/* ⏱️ تقرير الساعة */}
      <Card className="mb-4">
        <h2 className="mb-2 font-bold">⏱️ إجماليات الساعة</h2>
        <ul className="space-y-1.5 text-sm">
          <li>
            <strong>Linear:</strong> الكل {issues.length} · Done {doneCount} · In Progress{' '}
            {inProgress.length} · مفتوح {openCount}
          </li>
          <li>
            <strong>حالة البنود:</strong>{' '}
            {[...byStatus.entries()].map(([s, n]) => (
              <span key={s} className="me-2 inline-flex items-center gap-1">
                <StatusChip status={s} /> <strong>{n}</strong>
              </span>
            ))}
          </li>
          <li>
            <strong>حارس الاكتمال:</strong>{' '}
            {d.guard.alerts.length === 0 ? (
              <Chip tone="ok">لا فجوات مؤكدة</Chip>
            ) : (
              <span className="text-bad">
                🚨 {d.guard.alerts.length} تنبيهات فجوات مسجلة (آخر تشغيل:{' '}
                {fmtDate(d.guard.state.last_run)})
              </span>
            )}
          </li>
          <li>
            <strong>سلامة سجل الشركة:</strong>{' '}
            {d.ledger.chain_verified ? (
              <Chip tone="ok">السلسلة سليمة ✔ — {d.ledger.count} قيدًا</Chip>
            ) : (
              <Chip tone="bad">غير مؤكدة</Chip>
            )}
          </li>
        </ul>
        <h3 className="mt-3 mb-1 font-bold">شغال دلوقتي (In Progress)</h3>
        {inProgress.length === 0 ? (
          <EmptyState text="لا بنود In Progress في آخر لقطة" />
        ) : (
          <ul className="divide-y divide-border">
            {inProgress.map((i) => (
              <li key={i.uuid} className="py-1.5 text-sm">
                <Chip tone="info">{i.identifier}</Chip> {i.title}
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-3 mb-1 font-bold">أحدث إنجازات مسجلة (قيود achievement)</h3>
        {latestAchievements.length === 0 ? (
          <EmptyState text="لا قيود إنجاز في السجل بعد" />
        ) : (
          <ul className="divide-y divide-border">
            {latestAchievements.map((e) => (
              <EntryLine key={e.id} e={e} />
            ))}
          </ul>
        )}
      </Card>

      {/* 📋 محضر اليوم */}
      <Card className="mb-4">
        <h2 className="mb-2 font-bold">📋 محضر اليوم — {genDay}</h2>
        <p className="mb-2 text-xs text-muted">
          «اليوم» هنا = تاريخ توليد البيانات ({fmtDate(d.meta.generated_at)})، والقيود
          المعروضة هي قيود السجل المؤرخة بنفس اليوم فقط.
        </p>
        {todayEntries.length === 0 ? (
          <EmptyState text="لا قيود في سجل الشركة بتاريخ يوم التوليد هذا — لا يُخترع محضر من فراغ" />
        ) : (
          <ul className="divide-y divide-border">
            {todayEntries.map((e) => (
              <EntryLine key={e.id} e={e} />
            ))}
          </ul>
        )}
      </Card>

      {/* 🗓️ التقرير الأسبوعي */}
      <Card>
        <h2 className="mb-2 font-bold">🗓️ حصاد آخر ٧ أيام</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Chip tone="info">قيود الأسبوع: {weekEntries.length}</Chip>
          <Chip tone="ok">إنجازات: {weekAchievements.length}</Chip>
          <Chip tone="muted">قرارات (قيود decision): {weekDecisions.length}</Chip>
          {[...weekByType.entries()]
            .filter(([t]) => t !== 'achievement' && t !== 'decision')
            .map(([t, n]) => (
              <Chip key={t} tone="muted">
                {t}: {n}
              </Chip>
            ))}
        </div>
        <h3 className="mt-3 mb-1 font-bold">إنجازات الأسبوع</h3>
        {weekAchievements.length === 0 ? (
          <EmptyState text="لا قيود إنجاز في آخر ٧ أيام" />
        ) : (
          <ul className="divide-y divide-border">
            {weekAchievements.map((e) => (
              <EntryLine key={e.id} e={e} />
            ))}
          </ul>
        )}
        <h3 className="mt-3 mb-1 font-bold">قرارات الأسبوع (من قيود السجل)</h3>
        {weekDecisions.length === 0 ? (
          <EmptyState text="لا قيود قرار في آخر ٧ أيام — قرارات المقر النصية في صفحة «قرارات المقر»" />
        ) : (
          <ul className="divide-y divide-border">
            {weekDecisions.map((e) => (
              <EntryLine key={e.id} e={e} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">
          صحة النظام: سجل الشركة {d.ledger.count} قيدًا والسلسلة{' '}
          {d.ledger.chain_verified ? 'سليمة ✔' : 'غير مؤكدة'} · فجوات اكتمال مسجلة عند
          الحارس: {d.guard.alerts.length}.
        </p>
        <p className="mt-1 text-xs text-muted">
          ملحوظة أمانة: أقسام القوالب التي تحتاج بيانات غير موجودة في اللقطة (مثل «آخر
          كوميت» أو «مستني المالك») لا تُعرض هنا بدلًا من اختراعها.
        </p>
      </Card>
    </div>
  )
}
