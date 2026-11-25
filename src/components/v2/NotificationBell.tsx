import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOsData } from '../../lib/live/provider'

export const LAST_VISIT_KEY = 'os-notifications-last-visit'

/*
 * جرس إشعارات 3A-426 (نسخة أولى — عرض فقط):
 * الشارة = عدد تنبيهات الحارس الأحدث من آخر زيارة لهذا الجهاز (localStorage —
 * حالة محلية للمتصفح، لا كتابة لأي خادم/قاعدة، ومتوسمة كده في مركز الإشعارات).
 * ممنوع منعًا باتًا: أي تعليم كمقروء على الخادم أو كتابة تفضيلات (قرار قناة الكتابة مؤجل).
 */
export default function NotificationBell() {
  const state = useOsData()
  const [lastVisit, setLastVisit] = useState<string | null>(null)
  useEffect(() => {
    try {
      setLastVisit(localStorage.getItem(LAST_VISIT_KEY))
    } catch {
      setLastVisit(null)
    }
  }, [])
  if (state.phase !== 'ready') return null
  const alerts = state.data.guardAlertList
  const fresh = lastVisit ? alerts.filter((a) => a.created_at > lastVisit).length : alerts.length
  return (
    <Link
      to="/os/notifications"
      aria-label={`مركز الإشعارات — ${fresh} تنبيه جديد من آخر زيارة`}
      className="relative flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card text-lg"
    >
      <span aria-hidden>🔔</span>
      {fresh > 0 ? (
        <span className="absolute -top-1.5 -start-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-bold text-white">
          {fresh}
        </span>
      ) : null}
    </Link>
  )
}
