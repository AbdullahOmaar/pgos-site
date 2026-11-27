import { useEffect } from 'react'
import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge, SectionTitle } from '../components/v2/widgets'
import { LAST_VISIT_KEY } from '../components/v2/NotificationBell'
import { fmtDate } from '../lib/data'
import { useOsData } from '../lib/live/provider'
import type { OsDataset } from '../lib/live/types'

/*
 * مركز إشعارات 3A-426 (عرض فقط بالكامل):
 * - المصدر الأساسي دلوقتي: جدول pgos_notifications الحي (مهاجرة 20261127000007،
 *   قراءة مالك فقط) + حالة القراءة من pgos_notification_reads (قيد على أي جهاز =
 *   «اتقرأ»). الجدول مش في اللقطة — غيابه = null وبيتقال صراحة.
 * - تنبيهات الحارس مصدر مكمّل ظاهر دايمًا تحت (لقطة: guard.alerts / حي:
 *   pgos_guard_alerts) لحد ما الجدول يتملي — مفيش مصدر بيختفي ولا بيانات وهمية.
 * - سجل أنواع الإشعارات الأربعة قراءة فقط. لا كتابة من المتصفح أبدًا: لا تعليم
 *   كمقروء ولا تعديل تفضيلات من الواجهة.
 */
const SEVERITY: Record<string, { label: string; tone: 'bad' | 'warn' | 'info' }> = {
  critical: { label: 'حرج', tone: 'bad' },
  warn: { label: 'تنبيه', tone: 'warn' },
  warning: { label: 'تنبيه', tone: 'warn' },
  info: { label: 'معلومة', tone: 'info' },
}
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
          إشعارات اوس من جدول الإشعارات الحي + تنبيهات حارس الاكتمال كمصدر مكمّل + سجل الأنواع —
          عرض فقط: مفيش تعليم كمقروء ولا تعديل تفضيلات من الواجهة (الواجهة قراءة فقط بالكامل).
        </p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      <SectionTitle>إشعارات اوس{d.notifications ? ` (${d.notifications.length})` : ''}</SectionTitle>
      {d.notifications === null ? (
        <EmptyState text="جدول إشعارات التطبيق (pgos_notifications) بييجي من القراءة الحية بس ومش موجود في لقطة الخزنة — أول ما القراءة الحية تشتغل بجلسة المالك هيظهر هنا. تنبيهات الحارس تحت هي المتاحة من المصدر الحالي." />
      ) : d.notifications.length === 0 ? (
        <EmptyState text="الجدول الحي متصل ولسه فاضي — مفيش إشعارات مسجلة فيه لحد دلوقتي. تنبيهات الحارس تحت شغالة كمصدر مكمّل." />
      ) : (
        <div className="space-y-3">
          {d.notifications.map((n) => {
            const sev = n.severity ? SEVERITY[n.severity] : undefined
            return (
              <Card key={n.id}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{n.title}</span>
                  {sev ? <Chip tone={sev.tone}>{sev.label}</Chip> : null}
                  {n.read ? <Chip tone="muted">اتقرأ</Chip> : <Chip tone="info">جديد</Chip>}
                  {n.type_id ? <Chip tone="muted">{typeLabel(d, n.type_id)}</Chip> : null}
                </p>
                {n.body ? <p className="mt-1 text-sm text-muted">{n.body}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{fmtDate(n.created_at)}</span>
                  {n.source ? <span>المصدر: {n.source}</span> : null}
                  {n.route ? (
                    <a href={n.route} className="font-semibold text-accent">افتح في اوس ←</a>
                  ) : null}
                </p>
              </Card>
            )
          })}
        </div>
      )}

      <SectionTitle>تنبيهات الحارس — مصدر مكمّل ({alerts.length})</SectionTitle>
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

function typeLabel(d: OsDataset, typeId: string): string {
  return d.notificationTypes.find((x) => x.id === typeId)?.label ?? typeId
}
