import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import VersionLine from './VersionLine'

/*
 * روابط التنقل الرئيسية — بتشاور على الواجهة الجديدة (/os/* و/dashboard) أينما
 * وُجد مقابل جديد (تشخيص 2026-11-26: الروابط القديمة كانت بتودّي المالك لسجلات
 * الحوكمة القديمة فشاف «بروجكتين بس» بدل الـ9 الحقيقيين).
 * الصفحات القديمة نفسها routes شغالة ومتاحة بروابطها — التغيير في التنقل بس.
 */
const LINKS = [
  { to: '/', label: 'المقر الافتراضي', icon: '🏢' },
  { to: '/dashboard', label: 'نظرة عامة', icon: '🏠' },
  { to: '/os/projects', label: 'المشاريع', icon: '🗂️' },
  { to: '/os/notifications', label: 'الإشعارات', icon: '🔔' },
  { to: '/os/org', label: 'التنظيم والفريق', icon: '👥' },
  { to: '/os/kickoff', label: 'بداية مشروع', icon: '🚀' },
  { to: '/os/team', label: 'فريق الـAI', icon: '🤖' },
  { to: '/os/environments', label: 'البيئات', icon: '🌐' },
  { to: '/os/decisions', label: 'القرارات', icon: '⚖️' },
  { to: '/work-orders', label: 'أوامر الشغل', icon: '📋' },
  { to: '/risks', label: 'المخاطر', icon: '⚠️' },
  { to: '/evidence', label: 'الأدلة والإصدارات', icon: '🧾' },
  { to: '/ledger', label: 'سجل الشركة', icon: '⛓️' },
  { to: '/completeness', label: 'الاكتمال', icon: '✅' },
  { to: '/validation', label: 'حالة التحقق', icon: '🔍' },
  { to: '/os/preprod', label: 'فحص ما قبل الإنتاج', icon: '🧪' },
  { to: '/os/tasks', label: 'التاسكات', icon: '📌' },
  { to: '/os/decisions', label: 'قرارات المقر', icon: '🏛️' },
  { to: '/reports', label: 'التقارير', icon: '📰' },
  { to: '/authority', label: 'السلطة والأدوار', icon: '🧭' },
  { to: '/adoption', label: 'التبنّي والفجوات', icon: '📐' },
  { to: '/ask', label: 'اسأل الشركة', icon: '💬' },
]

function linkClasses({ isActive }: { isActive: boolean }) {
  return `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
    isActive ? 'bg-primary text-white' : 'text-muted hover:bg-soft hover:text-text'
  }`
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pgos-theme')
      if (saved) return saved === 'dark'
    } catch {
      /* تجاهل — الوضع الافتراضي من النظام */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try {
      localStorage.setItem('pgos-theme', dark ? 'dark' : 'light')
    } catch {
      /* تجاهل */
    }
  }, [dark])

  return (
    <div className="min-h-dvh">
      {/* ترويسة */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #3B3FA3, #0A2342)', color: '#00D2FF' }}
            aria-hidden
          >
            P
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">PGOS — نظام إدارة الشركة</p>
            <p className="truncate text-xs text-muted">
              3A Automation · مرآة قراءة فقط من المصادر الكانونية
            </p>
            {/* سطر الإصدار ووقت النشر — قاعدة مالك ملزمة 2026-11-25، من بيانات البناء */}
            <VersionLine className="truncate text-xs font-bold text-primary" />
          </div>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm"
            aria-label="تبديل الثيم الفاتح/الداكن"
          >
            {dark ? '☀️ فاتح' : '🌙 داكن'}
          </button>
        </div>
        {/* تنقّل علوي للموبايل */}
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden" aria-label="التنقل الرئيسي">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className={linkClasses}>
              <span aria-hidden>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-4">
        {/* تنقّل جانبي للشاشات الكبيرة */}
        <aside className="sticky top-24 hidden h-fit w-52 shrink-0 lg:block">
          <nav className="flex flex-col gap-1" aria-label="التنقل الرئيسي">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} className={linkClasses}>
                <span aria-hidden>{l.icon}</span>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <p className="mt-4 px-3 text-xs leading-relaxed text-muted">
            الموقع يعرض ولا يكتب: أي قيد أو قرار أو تحديث يتم في أدواته الأصلية (السجل،
            Linear، مقر Drive) ويظهر هنا بعد التوليد التالي.
          </p>
        </aside>

        <main className="min-w-0 flex-1 pb-10">{children}</main>
      </div>
    </div>
  )
}
