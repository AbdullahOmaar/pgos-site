import { useEffect } from 'react'
import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge, SectionTitle } from '../components/v2/widgets'
import { LAST_VISIT_KEY } from '../components/v2/NotificationBell'
import { fmtDate } from '../lib/data'
import { useOsData } from '../lib/live/provider'

/*
 * مركز إشعارات 3A-426 — النسخة الأولى (عرض فقط بالكامل):
 * المصادر الموجودة بس: تنبيهات الحارس (لقطة: guard.alerts / حي: pgos_guard_alerts)
 * + سجل أنواع الإشعارات الأربعة (قراءة فقط). لا تعليم كمقروء على الخادم،
 * لا تفضيلات قابلة للتعديل — «الجديد» تقريب محلي بآخر زيارة الجهاز ومتوسم كده.
 * جدول pgos_notifications المقترح في التصميم خطوة منفصلة ببوابة — مش موجود هنا.
 */
export default function NotificationsV2() {
  const state = useOsData()

  /* زيارة المركز بتحدّث «آخر زيارة» المحلية — فتتصفر شارة الجرس لهذا الجهاز بس */
  useEffect(() => {
    if (state.phase === 'ready') {
      try {
        localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString())
      } catch {
        /* تجاهل — الشارة بترجع لعدّ الكل */
      }
    }
  }, [state.phase])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data
  const alerts = [...d.guardAlertList].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">مركز الإشعارات</h1>
        <p className="mt-1 text-sm text-muted">
          تنبيهات حارس الاكتمال وسجل أنواع إشعارات اوس — عرض فقط: مفيش تعليم كمقروء ولا تعديل
          تفضيلات من الواجهة (قناة الكتابة قرار أمان منفصل ولسه متأجل).
        </p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      <SectionTitle>تنبيهات الحارس ({alerts.length})</SectionTitle>
      {alerts.length === 0 ? (
        <EmptyState text={d.source === 'live' ? 'لا تنبيهات حارس مسجلة في المصدر الحي حاليًا.' : 'لا تنبيهات حارس في اللقطة الحالية — آخر حالة معروفة: لا فجوات مؤكدة.'} />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Card key={a.id}>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{a.title}</span>
                {a.status === 'open' ? <Chip tone="warn">مفتوح</Chip> : <Chip tone="ok">{a.status}</Chip>}
              </p>
              {a.detail ? <p className="mt-1 text-sm text-muted">القيد: {a.detail}</p> : null}
              {a.missing.length > 0 ? (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {a.missing.map((m) => (<Chip key={m} tone="bad">ناقص: {m}</Chip>))}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted">{fmtDate(a.created_at)}</p>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>سجل أنواع الإشعارات (3A-426)</SectionTitle>
      {d.notificationTypes.length === 0 ? (
        <EmptyState text="سجل الأنواع مش موجود في مصدر البيانات الحالي — بيظهر من القاعدة (لقطة محمّلة من الحي أو المصدر الحي نفسه)." />
      ) : (
        <div className="space-y-3">
          {d.notificationTypes.map((t) => (
            <Card key={t.id}>
              <p className="flex flex-wrap items-center gap-2 font-bold">
                {t.label}
                {t.active ? <Chip tone="ok">فعّال</Chip> : <Chip tone="muted">غير فعّال</Chip>}
                {t.default_on ? <Chip tone="info">شغّال افتراضيًا</Chip> : <Chip tone="muted">مقفول افتراضيًا</Chip>}
              </p>
              {t.description ? <p className="mt-1 text-sm text-muted">{t.description}</p> : null}
            </Card>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-muted">
        تفضيلات الأجهزة المسجلة: {d.notificationPrefsCount} — بتتعرض هنا قراءة فقط، وتغييرها من
        قناة التسجيل المعتمدة لحد ما يتحسم قرار قناة الكتابة.
      </p>
    </div>
  )
}
