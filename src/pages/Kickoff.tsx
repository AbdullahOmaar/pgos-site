import { Link } from 'react-router-dom'
import { Card, PageTitle } from '../components/ui'
import { KICKOFF_SECTIONS, KICKOFF_SOURCE_NOTE } from '../lib/kickoff'

/*
 * صفحة «بداية كل مشروع» (P2-20) — مكتبة الشركة الرسمية: حزمة البداية الكانونية
 * معروضة كاملة بأقسامها الستة. قراءة فقط بالكامل: مربعات الاختيار بصرية للعرض
 * بس والحالة لا تُحفظ من المتصفح — تسجيل العدّ بيتم في نسخة مرجع المشروع نفسه
 * (قسم «بداية المشروع» في REFERENCE-INDEX)، والصفحة بتقول كده صراحة.
 * المحتوى من src/lib/kickoff.ts (مبني على النص الكانوني) — تحديث الحزمة = ملف واحد.
 */
export default function Kickoff() {
  const totalItems = KICKOFF_SECTIONS.reduce((n, s) => n + s.items.length, 0)
  return (
    <div dir="rtl">
      <PageTitle
        title="بداية كل مشروع"
        sub="أي مشروع أو تطبيق جديد يبدأ من هنا من الخطوة صفر — حزمة بداية 3A Automation الرسمية"
      />

      <Card className="mb-4">
        <p className="text-sm leading-relaxed">
          دي قايمة البداية الكاملة ({totalItems} بند في {KICKOFF_SECTIONS.length} أقسام). المشروع الجديد
          بيستنسخ حزمة المرجع الخمسة لنسخته هو قبل أي سطر كود، وبيعدّي على القايمة قسمًا بقسم.
        </p>
        <p className="mt-2 rounded-xl bg-soft px-3 py-2 text-xs leading-relaxed">
          ⚠️ <b>التسجيل مش هنا:</b> مربعات الاختيار دي للعرض بس والحالة مش بتتحفظ من المتصفح —
          تسجيل العدّ بيتم في نسخة مرجع المشروع نفسه: قسم «بداية المشروع» في{' '}
          <span dir="ltr" className="font-semibold">REFERENCE-INDEX.md</span> بيتختم بندًا ببند
          (التاريخ + مين نفّذ).
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          الحزمة دي بتكمل وبتوسّع «قالب مرجع التطبيق» و«دليل بدء تطبيق جديد» — الدليل هو ذراعها
          التنفيذي خطوة بخطوة. روابط من اوس ذات صلة:{' '}
          <Link to="/os/projects" className="font-semibold text-accent">المشاريع ومواثيقها</Link>
          {' · '}
          <Link to="/os/preprod" className="font-semibold text-accent">فحص ما قبل الإنتاج</Link>
          {' · '}
          <Link to="/os/decisions" className="font-semibold text-accent">القرارات والإصدارات</Link>
          {' · '}
          <Link to="/os/org" className="font-semibold text-accent">التنظيم والفريق</Link>
        </p>
      </Card>

      <div className="space-y-4">
        {KICKOFF_SECTIONS.map((s) => (
          <Card key={s.key}>
            <h2 className="text-base font-bold">{s.title}</h2>
            {s.intro ? <p className="mt-1 text-sm text-muted">{s.intro}</p> : null}
            <ul className="mt-3 space-y-3">
              {s.items.map((it) => (
                <li key={it.title} className="flex gap-2.5">
                  <input
                    type="checkbox"
                    disabled
                    aria-hidden
                    tabIndex={-1}
                    className="mt-1 h-5 w-5 shrink-0 accent-primary"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{it.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{it.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            {s.recordWhere || s.doneMark ? (
              <div className="mt-3 space-y-1 border-t border-dashed border-border pt-3 text-xs leading-relaxed">
                {s.recordWhere ? (
                  <p><b>بيتسجل فين:</b> {s.recordWhere}</p>
                ) : null}
                {s.doneMark ? (
                  <p><b>علامة الإتمام:</b> {s.doneMark}</p>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">{KICKOFF_SOURCE_NOTE}</p>
    </div>
  )
}
