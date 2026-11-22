import { fmtDate, useSiteData } from '../lib/data'
import type { PreprodStatus } from '../types'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  type Tone,
} from '../components/ui'

/* شارات حالة الفحص — الحالات الخمس مميزة ولا تُدمج:
   «لم يُقيّم بعد» حالة قائمة بذاتها، ليست «لم يبدأ» */
const STATUS_VIEW: Record<PreprodStatus, { label: string; tone: Tone }> = {
  done: { label: '✅ منجز', tone: 'ok' },
  partial: { label: '◐ جزئي', tone: 'warn' },
  not_started: { label: '⬜ لم يبدأ', tone: 'muted' },
  na: { label: '— لا ينطبق', tone: 'muted' },
  not_evaluated: { label: '؟ لم يُقيّم بعد', tone: 'info' },
}

function StatusBadge({ status }: { status: PreprodStatus }) {
  const v = STATUS_VIEW[status] ?? STATUS_VIEW.not_evaluated
  return <Chip tone={v.tone}>{v.label}</Chip>
}

export default function Preprod() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data
  const pc = d.preprod_checklist

  if (!pc.available || !pc.meta || pc.checks.length === 0) {
    return (
      <div>
        <PageTitle
          title="فحص ما قبل الإنتاج"
          sub="جدول فحوصات ما قبل الإنتاج — مرجع حوكمة الشركة لكل منتجاتها."
        />
        <EmptyState text="سجل فحص ما قبل الإنتاج غير متاح في هذه النسخة من البيانات (ملف السجل غائب وقت التوليد) — لا تُعرض فحوصات بديلة أو مخمّنة. المرجع الأصلي: جدول «فحص ما قبل الإنتاج» في مقر Drive المشترك." />
      </div>
    )
  }

  const meta = pc.meta
  const freshness = d.meta.sources_freshness.find((s) => s.source === 'preprod-checklist')

  // عدّادات من الفحوصات نفسها (لا من ذاكرة)
  const count = (get: (c: (typeof pc.checks)[number]) => PreprodStatus, s: PreprodStatus) =>
    pc.checks.filter((c) => get(c) === s).length
  const teacher = {
    done: count((c) => c.apps.teacher.status, 'done'),
    partial: count((c) => c.apps.teacher.status, 'partial'),
    not_started: count((c) => c.apps.teacher.status, 'not_started'),
    na: count((c) => c.apps.teacher.status, 'na'),
  }
  const nounouNotEval = count((c) => c.apps.nounou.status, 'not_evaluated')
  const pgosNotEval = count((c) => c.apps.pgos.status, 'not_evaluated')

  const categories =
    pc.categories.length > 0
      ? pc.categories
      : [...new Set(pc.checks.map((c) => c.category))]

  return (
    <div>
      <PageTitle
        title="فحص ما قبل الإنتاج — مرجع حوكمة الشركة"
        sub="جدول الفحوصات الإلزامي قبل إنتاج أي منتج في الشركة: حالة كل فحص لكل تطبيق، كما هي موثقة — بلا تجميل وبلا دمج حالات."
      />

      {/* بانر المصدر والحداثة */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Chip tone="info">سجل النظام — يُحدَّث من جوه النظام</Chip>
          {freshness ? (
            freshness.stale ? (
              <Chip tone="warn">السجل قديم — تجاوز عتبة الحداثة</Chip>
            ) : (
              <Chip tone="ok">السجل ضمن الحداثة</Chip>
            )
          ) : null}
          <span>
            لقطة المصدر الأصلي: <strong>{fmtDate(meta.snapshot_at)}</strong>
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">
          المصدر: {meta.source} (ملف Drive رقم {meta.source_file_id}) · بُني السجل المنظم:{' '}
          {fmtDate(meta.register_built_at)}
          {freshness ? ` · آخر تعديل لملف السجل: ${fmtDate(freshness.modified_at)}` : ''}
        </p>
        <div className="mt-3 rounded-xl bg-soft p-3 text-sm leading-relaxed">
          <p className="font-bold">كيف يُحدَّث الجدول من جوه النظام؟</p>
          <p className="mt-1">{meta.design_note}</p>
          <p className="mt-1 text-muted">
            الخطوات عمليًا: تعديل حالة/دليل الفحص في سجل النظام
            (ops-system/checklist/preprod-checklist.json) ← إعادة توليد الموقع
            (npm run data) ← يظهر التحديث هنا. الموقع نفسه مرآة قراءة فقط ولا يكتب.
          </p>
        </div>
      </Card>

      {/* تنبيه مشكلة العمودين — كما هي بلا تجميل */}
      <Card className="mb-4 border-warn/50">
        <h2 className="mb-1 font-bold text-[#9a6206] dark:text-warn">
          ⚠️ تنبيه أمانة بيانات — مشكلتان في ملف المصدر الأصلي
        </h2>
        <p className="text-sm leading-relaxed">{meta.column_issue}</p>
        <p className="mt-1 text-sm text-muted">
          لذلك تُعرض نصوص ذلك العمود بالأسفل كـ«دليل» تحت تطبيق المدرس (صاحبها الفعلي)،
          وحالة موقع PGOS ونونو هي «لم يُقيّم بعد» في كل الفحوصات حتى يحدث تقييم فعلي
          موثق.
        </p>
      </Card>

      {/* عدّادات لكل تطبيق */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <h2 className="mb-2 font-bold">تطبيق المدرس</h2>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="ok">✅ منجز: {teacher.done}</Chip>
            <Chip tone="warn">◐ جزئي: {teacher.partial}</Chip>
            <Chip tone="muted">⬜ لم يبدأ: {teacher.not_started}</Chip>
            <Chip tone="muted">— لا ينطبق: {teacher.na}</Chip>
          </div>
          <p className="mt-2 text-xs text-muted">
            من أصل {pc.checks.length} فحصًا — حالات حقيقية موثقة من ملف المقر.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">نونو</h2>
          <Chip tone="info">؟ لم يُقيّم بعد: {nounouNotEval}</Chip>
          <p className="mt-2 text-xs text-muted">
            عمود نونو في ملف المقر يحمل «|» فقط — لا يوجد أي تقييم موثق بعد.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">موقع PGOS</h2>
          <Chip tone="info">؟ لم يُقيّم بعد: {pgosNotEval}</Chip>
          <p className="mt-2 text-xs text-muted">
            لم يُقيَّم الموقع على الجدول بعد — وعمود «موقع PGOS» في الملف الأصلي ليس
            تقييمًا له (انظر التنبيه أعلاه).
          </p>
        </Card>
      </div>

      <p className="mb-3 text-sm text-muted">
        {pc.checks.length} فحصًا في {categories.length} فئة — مجمعة بالفئات كما في ملف
        المقر:
      </p>

      {/* الفحوصات مجمعة بالفئات */}
      <div className="space-y-4">
        {categories.map((cat) => {
          const items = pc.checks.filter((c) => c.category === cat)
          if (items.length === 0) return null
          return (
            <Card key={cat}>
              <h2 className="mb-1 font-bold">
                {cat} <span className="text-sm font-semibold text-muted">({items.length})</span>
              </h2>
              <ul className="divide-y divide-border">
                {items.map((c) => (
                  <li key={c.id} className="py-3 text-sm">
                    <p>
                      <span className="font-semibold text-muted">#{c.id}</span>{' '}
                      <span className="font-semibold">{c.item}</span>
                    </p>
                    <p className="mt-0.5 text-muted">كيف يتحقق منه: {c.how}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-muted">المدرس:</span>
                        <StatusBadge status={c.apps.teacher.status} />
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-muted">نونو:</span>
                        <StatusBadge status={c.apps.nounou.status} />
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-muted">موقع PGOS:</span>
                        <StatusBadge status={c.apps.pgos.status} />
                      </span>
                    </div>
                    {c.apps.teacher.evidence ? (
                      <p className="mt-1.5 text-muted">
                        <span className="font-semibold">دليل المدرس</span> (كما ورد في
                        ملف المقر): {c.apps.teacher.evidence}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
