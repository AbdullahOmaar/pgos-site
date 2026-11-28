import { STATUS_LABELS, type Department, type Employee, type EmployeeStatus } from '../office/types'
import { Chip } from './ui'

/*
 * بطاقة الموظف — بتتفتح بالضغط على الموظف في المشهد (bottom sheet على الموبايل).
 * كل اللي فيها جاي من سجل الموظف في طبقة البيانات، وتتحدث فورًا مع أي تعديل.
 */

const STATUS_DOT: Record<EmployeeStatus, string> = {
  working: 'bg-ok',
  idle: 'bg-warn',
  offline: 'bg-muted',
}

interface Props {
  employee: Employee
  department: Department | undefined
  onClose: () => void
  onCycleStatus: (id: string) => void
}

export default function EmployeeCard({ employee: e, department, onClose, onCycleStatus }: Props) {
  const initials = e.name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join(' ')
  return (
    <div className="pointer-events-auto w-full rounded-2xl border border-border bg-card/97 p-3 shadow-2xl backdrop-blur sm:p-4">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white sm:h-12 sm:w-12 sm:text-base"
          style={{ background: 'linear-gradient(135deg, #3B3FA3, #0A2342)' }}
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{e.name}</p>
          <p className="truncate text-sm text-muted">
            {e.role}
            {department ? ` · ${department.name}` : ''}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[e.status]}`} />
            {STATUS_LABELS[e.status]}
            <span className="text-muted">· مكتب {e.desk}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-soft text-base font-bold transition active:scale-95"
          aria-label="إغلاق البطاقة"
        >
          ✕
        </button>
      </div>

      {e.current_task ? (
        <p className="mt-2 rounded-xl bg-soft px-3 py-1.5 text-sm sm:mt-3 sm:py-2">
          <span className="font-semibold">المهمة الحالية: </span>
          {e.current_task}
        </p>
      ) : null}

      {(e.tasks_open !== undefined || e.projects !== undefined || e.rating !== undefined) && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center sm:mt-3">
          <div className="rounded-xl bg-soft px-2 py-1.5 sm:py-2">
            <p className="text-base leading-none font-bold text-primary sm:text-lg">{e.tasks_open ?? '—'}</p>
            <p className="mt-1 text-[11px] text-muted">مهام مفتوحة</p>
          </div>
          <div className="rounded-xl bg-soft px-2 py-1.5 sm:py-2">
            <p className="text-base leading-none font-bold text-primary sm:text-lg">{e.projects ?? '—'}</p>
            <p className="mt-1 text-[11px] text-muted">مشاريع</p>
          </div>
          <div className="rounded-xl bg-soft px-2 py-1.5 sm:py-2">
            <p className="text-base leading-none font-bold text-primary sm:text-lg">{e.rating ?? '—'}</p>
            <p className="mt-1 text-[11px] text-muted">التقييم</p>
          </div>
        </div>
      )}

      {/* الأدوات بتتخفى على الموبايل علشان البطاقة تفضل صغيرة ومضغوطة */}
      {e.tools.length > 0 && (
        <div className="mt-3 hidden flex-wrap items-center gap-1.5 sm:flex">
          <span className="text-xs text-muted">الأدوات:</span>
          {e.tools.map((t) => (
            <Chip key={t} tone="info">
              {t}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2 sm:mt-4">
        <button
          type="button"
          onClick={() => onCycleStatus(e.id)}
          className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition active:scale-[0.98] sm:py-2.5"
        >
          بدّل الحالة
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2 text-sm font-semibold text-primary ring-1 ring-primary transition active:scale-[0.98] sm:py-2.5"
        >
          إغلاق
        </button>
      </div>
    </div>
  )
}
