import { useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
} from '../components/ui'

export default function Validation() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const v = state.data.internal_validation

  return (
    <div>
      <PageTitle
        title="حالة التحقق من سجلات PGOS"
        sub="نتائج الفحص البنيوي والروابط العابرة على سجلات الحوكمة كما خرجت من خط توليد هذا الموقع"
      />

      <div className="mb-4 rounded-2xl border border-warn/50 bg-warn/10 p-4 text-sm">
        <p className="font-bold">⚠ تنبيه تسمية صريح</p>
        <p className="mt-1">
          هذا <b>تحقق داخلي (internal_validation)</b> نفّذه كود موقع PGOS نفسه وقت توليد
          البيانات — إعادة تنفيذ محلية لقواعد الحقول الإلزامية والروابط العابرة كما هي موثقة
          في دراسة PGOS. هو <b>ليس</b> فاليديتور PGOS الأصلي (validate_records.py /
          extended_records.py) ولم يُشغَّل هنا؛ تشغيل كود الريبو الأصلي ما زال معلّقًا على
          موافقة المالك الصريحة (قيد AC-3 في WO-TOTO-001). لا يُدّعى أي PASS رسمي باسم
          PGOS من هذه الصفحة.
        </p>
      </div>

      <Card className="mb-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold">الملخص:</span>
          <Chip tone={v.summary.failed === 0 ? 'ok' : 'bad'}>
            {v.summary.ok} / {v.summary.total} سليم
          </Chip>
          {v.summary.failed > 0 ? (
            <Chip tone="bad">{v.summary.failed} به مشاكل</Chip>
          ) : null}
          <span className="text-muted">
            يشمل: الحقول الإلزامية لكل نوع + صيغة المعرّف والمراجعة + قواعد الحالات
            (APPROVED/الدرجات/النطاقات) + الروابط العابرة (المشروع، أمر الشغل، القرار) +
            قاعدة الأفعال عالية الأثر (تتطلب A4 ومرجع اعتماد حقيقيًا) + انتهاء صلاحية
            أوامر الشغل. الحقول خارج قائمة السماح تُحذف من الإخراج المنشور وتظهر
            كملحوظات على السجل لا كمشاكل.
          </span>
        </p>
      </Card>

      {v.results.length === 0 ? (
        <EmptyState text="لا توجد نتائج تحقق" />
      ) : (
        <div className="space-y-3">
          {v.results.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{r.id}</span>
                <Chip tone="muted">{r.record_type}</Chip>
                {r.ok ? (
                  <Chip tone="ok">سليم ✔</Chip>
                ) : (
                  <Chip tone="bad">مشاكل ✗</Chip>
                )}
              </div>
              {r.problems.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-bad">
                  {r.problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  كل الحقول الإلزامية موجودة والروابط العابرة سليمة.
                </p>
              )}
              {(r.notes ?? []).length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted">
                  {(r.notes ?? []).map((n, i) => (
                    <li key={i}>ملحوظة: {n}</li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
