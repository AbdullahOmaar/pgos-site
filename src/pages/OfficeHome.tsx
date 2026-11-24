import { Suspense, lazy, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

/* تحميل كسول: مكتبة Three.js بتتحمل مع الهوم بس، وباقي الصفحات تفضل خفيفة */
const OfficeScene = lazy(() => import('../components/OfficeScene'))
import EmployeeCard from '../components/EmployeeCard'
import { Card } from '../components/ui'
import { officeSeed } from '../office/seed'
import type { EmployeeStatus, OfficeData } from '../office/types'

/*
 * الصفحة الرئيسية لاوس = المقر الافتراضي.
 * المشهد فوق، وأقسام الموقع التانية توصَل من تحت عادي، والنظرة العامة
 * الكلاسيكية لسه موجودة في /overview.
 * أزرار «جرّب البيانات» بتعدّل طبقة البيانات المحلية بس (نموذج تفاعلي) —
 * وكل تعديل بيبان في المشهد فورًا لأن المشهد بيتبني من البيانات.
 */

const STATUS_CYCLE: Record<EmployeeStatus, EmployeeStatus> = {
  working: 'idle',
  idle: 'offline',
  offline: 'working',
}

const NEW_DEPT_COLORS = ['#4FC3F7', '#AED581', '#FFB74D', '#F06292', '#BA68C8', '#4DB6AC']

const SECTION_LINKS = [
  { to: '/overview', label: 'نظرة عامة', icon: '🏠', hint: 'حالة الشركة في شاشة' },
  { to: '/projects', label: 'المشاريع', icon: '🗂️', hint: 'مشاريع PGOS المسجلة' },
  { to: '/tasks', label: 'التاسكات', icon: '📌', hint: 'بنود آخر لقطة مزامنة' },
  { to: '/decisions', label: 'القرارات', icon: '⚖️', hint: 'القرارات المسجلة' },
  { to: '/ledger', label: 'سجل الشركة', icon: '⛓️', hint: 'القيود وسلسلة التجزئة' },
  { to: '/reports', label: 'التقارير', icon: '📰', hint: 'تقارير المقر' },
]

let uidCounter = 1000

export default function OfficeHome() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<OfficeData>(officeSeed)
  const selectedId = params.get('select')
  const selected = data.employees.find((e) => e.id === selectedId) ?? null
  const selectedDept = selected
    ? data.departments.find((d) => d.id === selected.department_id)
    : undefined

  const stats = useMemo(
    () => ({
      departments: data.departments.length,
      employees: data.employees.length,
      working: data.employees.filter((e) => e.status === 'working').length,
      idle: data.employees.filter((e) => e.status === 'idle').length,
    }),
    [data],
  )

  const select = (id: string | null) => {
    if (id) setParams({ select: id }, { replace: true })
    else setParams({}, { replace: true })
  }

  const cycleStatus = (id: string) =>
    setData((prev) => ({
      ...prev,
      employees: prev.employees.map((e) =>
        e.id === id ? { ...e, status: STATUS_CYCLE[e.status] } : e,
      ),
    }))

  const addEmployee = () =>
    setData((prev) => {
      // بيروح للقسم الأقل زحمة — والمشهد بيكبّر غرفته تلقائيًا
      const counts = prev.departments.map(
        (d) => prev.employees.filter((e) => e.department_id === d.id).length,
      )
      const idx = counts.indexOf(Math.min(...counts))
      const dept = prev.departments[idx]
      const n = ++uidCounter
      const emp = {
        id: `emp-x${n}`,
        name: `موظف جديد ${n - 1000}`,
        role: 'عضو فريق',
        department_id: dept.id,
        desk: counts[idx] + 1,
        status: 'working' as EmployeeStatus,
        tools: ['Slack'],
        current_task: 'مهمة تعريفية أولى',
        tasks_open: 1,
        projects: 1,
        rating: 5,
      }
      return { ...prev, employees: [...prev.employees, emp] }
    })

  const addDepartment = () =>
    setData((prev) => {
      const n = prev.departments.length - 5
      const dept = {
        id: `dept-x${++uidCounter}`,
        name: `قسم جديد ${n}`,
        color: NEW_DEPT_COLORS[(n - 1) % NEW_DEPT_COLORS.length],
      }
      return { ...prev, departments: [...prev.departments, dept] }
    })

  return (
    <div>
      <header className="mb-3">
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
          المقر الافتراضي — 3A Automation
          <span className="rounded-full bg-warn/20 px-2.5 py-0.5 text-xs font-semibold text-[#9a6206] dark:text-warn">
            نموذج تفاعلي — جولة بناء أولى
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          مقر الشركة حيّ قدامك: كل غرفة قسم، وكل مكتب موظف بحالته الحقيقية من البيانات.
          اضغط على أي موظف لعرض بطاقته — الشغال شاشته منورة، والخامل نايم على مكتبه.
        </p>
      </header>

      {/* شريط أرقام حية من البيانات */}
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-soft px-3 py-1.5">
          الأقسام <b className="text-primary">{stats.departments}</b>
        </span>
        <span className="rounded-full bg-soft px-3 py-1.5">
          الموظفون <b className="text-primary">{stats.employees}</b>
        </span>
        <span className="rounded-full bg-soft px-3 py-1.5">
          شغالين الآن <b className="text-ok">{stats.working}</b>
        </span>
        <span className="rounded-full bg-soft px-3 py-1.5">
          خاملين <b className="text-[#9a6206] dark:text-warn">{stats.idle}</b>
        </span>
      </div>

      {/* المشهد */}
      <div
        className="relative overflow-hidden rounded-3xl border border-[#1e3a5f] shadow-xl"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, #173a6e 0%, #0A2342 55%, #061831 100%)',
        }}
      >
        <div className="h-[62dvh] min-h-[380px] sm:h-[68dvh]">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-white/80">
                <span className="animate-pulse">بنبني المقر…</span>
              </div>
            }
          >
            <OfficeScene data={data} selectedId={selectedId} onSelect={select} />
          </Suspense>
        </div>

        {/* مفتاح الحالات */}
        <div className="pointer-events-none absolute top-3 start-3 flex gap-1.5 text-[11px] font-semibold">
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-white backdrop-blur">🟢 شغال</span>
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-white backdrop-blur">💤 خامل — نايم</span>
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-white backdrop-blur">⚪ غير متصل</span>
        </div>

        {/* بطاقة الموظف — bottom sheet فوق المشهد */}
        {selected && (
          <div className="absolute inset-x-3 bottom-3 sm:inset-x-auto sm:w-[22rem]">
            <EmployeeCard
              employee={selected}
              department={selectedDept}
              onClose={() => select(null)}
              onCycleStatus={cycleStatus}
            />
          </div>
        )}
      </div>

      {/* جرّب البيانات — تعديلات محلية تجريبية على طبقة البيانات */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">جرّب البيانات:</span>
        <button
          type="button"
          onClick={addEmployee}
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition active:scale-95"
        >
          + موظف جديد
        </button>
        <button
          type="button"
          onClick={addDepartment}
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition active:scale-95"
        >
          + قسم جديد
        </button>
        <button
          type="button"
          onClick={() => {
            setData(officeSeed)
            select(null)
          }}
          className="rounded-full px-4 py-2 text-sm font-semibold text-primary ring-1 ring-primary transition active:scale-95"
        >
          ↺ رجوع للبيانات الأولية
        </button>
        <span className="text-xs text-muted">
          الموظف بيروح لأقل قسم زحمة وغرفته بتكبر؛ والقسم الجديد بيولّد غرفة والمقر بيعيد ترتيب نفسه.
        </span>
      </div>

      {/* بوابات أقسام الموقع */}
      <h2 className="mt-6 mb-2 font-bold">أقسام نظام إدارة الشركة</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SECTION_LINKS.map((s) => (
          <Link key={s.to} to={s.to} className="block">
            <Card className="h-full transition-transform hover:-translate-y-0.5">
              <p className="text-lg" aria-hidden>
                {s.icon}
              </p>
              <p className="mt-1 font-bold">{s.label}</p>
              <p className="mt-0.5 text-xs text-muted">{s.hint}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
