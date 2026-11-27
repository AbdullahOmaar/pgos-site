import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge } from '../components/v2/widgets'
import { useOsData } from '../lib/live/provider'
import type { LiveOrgEmployee, OsDataset } from '../lib/live/types'

/*
 * صفحة «فريق الـAI» (3A-379 — مقترح أ المعتمد بقرار المدير 2026-11-27، بعد نموذج
 * تفاعلي اتعرض على المالك 2026-11-26): وجه فريق الشركة الحقيقي من سجل التنظيم
 * pgos_org_* (٥ أقسام / ١٠ أعضاء) عبر useOsData (لقطة + حي).
 * ⚠️ ممنوع الخلط مع طاقم المكتب الافتراضي (pgos_employees — شخصيات المشهد).
 * الحالات معروضة بنص السجل حرفيًا: معلنة في السجل، مش قياس حي — والسطر ده ظاهر.
 * قراءة فقط بالكامل: لا محادثة ولا إسناد ولا تشغيل/إيقاف (خارج نطاق النسخة الأولى).
 */
export default function TeamV2() {
  const state = useOsData()
  const [filter, setFilter] = useState<string>('all')
  const [selected, setSelected] = useState<LiveOrgEmployee | null>(null)

  /* رابط عميق لبطاقة عضو: ‎#member-<id>‎ بيفتح ورقة تفاصيله */
  useEffect(() => {
    if (state.phase !== 'ready') return
    const m = window.location.hash.match(/^#member-(.+)$/)
    if (m) {
      const hit = state.data.orgEmployees.find((e) => e.id === m[1])
      if (hit) setSelected(hit)
    }
  }, [state])

  const groups = useMemo(() => {
    if (state.phase !== 'ready') return []
    const d = state.data
    const names = [...new Set(d.orgEmployees.map((e) => e.dept_name ?? 'بلا قسم مسجل'))]
    const ordered = d.orgDepartments.map((x) => x.name).filter((n) => names.includes(n))
      .concat(names.filter((n) => !d.orgDepartments.some((x) => x.name === n)))
    return ordered
      .filter((name) => filter === 'all' || d.orgDepartments.find((x) => x.name === name)?.id === filter)
      .map((name) => ({
        name,
        dept: d.orgDepartments.find((x) => x.name === name) ?? null,
        members: d.orgEmployees.filter((e) => (e.dept_name ?? 'بلا قسم مسجل') === name),
      }))
  }, [state, filter])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">فريق الـAI</h1>
        <p className="mt-1 text-sm text-muted">
          {d.orgEmployees.length} أعضاء · {d.orgDepartments.length} أقسام — الوكلاء الحقيقيون اللي بيشغّلوا 3A Automation
        </p>
        <p className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-relaxed">
          ℹ️ الحالات المعروضة <b>معلنة في سجل الفريق</b> وبتتحدث مع بلاغات الشغل — مش قياس حي لحظي.
        </p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      {d.orgEmployees.length === 0 ? (
        <EmptyState text="سجل الفريق غير متاح من المصدر الحالي — لا تُعرض بيانات بديلة. (طاقم المكتب الافتراضي طاقم مختلف وممنوع خلطه بفريق الشركة.)" />
      ) : (
        <>
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="فلترة بالأقسام">
            <button type="button" onClick={() => setFilter('all')}
              className={`min-h-11 shrink-0 rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap ${filter === 'all' ? 'bg-primary text-white' : 'border border-border bg-card text-muted'}`}>
              الكل
            </button>
            {d.orgDepartments.map((dept) => (
              <button key={dept.id} type="button" onClick={() => setFilter(filter === dept.id ? 'all' : dept.id)}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap ${filter === dept.id ? 'bg-primary text-white' : 'border border-border bg-card text-muted'}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: dept.color ?? 'var(--primary)' }} aria-hidden />
                {dept.name}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.name}>
                <h2 className="mb-2 flex flex-wrap items-center gap-2 text-[15px] font-bold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.dept?.color ?? '#64748B' }} aria-hidden />
                  {g.name}
                  <span className="text-xs font-normal text-muted">
                    {g.members.length} أعضاء{g.dept?.description ? ` · ${g.dept.description}` : ''}
                  </span>
                </h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {g.members.map((e) => (
                    <button key={e.id} type="button" onClick={() => setSelected(e)}
                      className="rounded-2xl border border-border bg-card p-3.5 text-start shadow-sm"
                      aria-label={`تفاصيل ${e.name}`}>
                      <span className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-white"
                        style={{ background: e.color ?? 'var(--primary)' }} aria-hidden>
                        {e.initial ?? e.name.slice(0, 1)}
                      </span>
                      <p className="mt-2 text-sm font-bold">{e.name}</p>
                      <p className="mt-0.5 min-h-9 text-xs text-muted">{e.role ?? '—'}</p>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {e.status ? <Chip tone="ok">{e.status}</Chip> : null}
                        {e.project_ref ? <Chip tone="info">{projectName(d, e.project_ref)}</Chip> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-5 text-center text-xs text-muted">
            مصدر البيانات: سجل تنظيم الشركة (pgos_org) ·{' '}
            <Link to="/os/org" className="font-semibold text-accent">الهيكل الإداري الكامل ←</Link>
          </p>
        </>
      )}

      {selected ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/45" role="dialog" aria-modal="true" aria-label={`تفاصيل ${selected.name}`}
          onClick={() => setSelected(null)}>
          <div className="w-full max-w-[430px] rounded-t-3xl bg-card p-5 pb-7" onClick={(ev) => ev.stopPropagation()}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold text-white"
              style={{ background: selected.color ?? 'var(--primary)' }} aria-hidden>
              {selected.initial ?? selected.name.slice(0, 1)}
            </span>
            <h2 className="mt-2 text-lg font-bold">{selected.name}</h2>
            <p className="text-sm text-muted">{selected.role ?? '—'}</p>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">القسم</dt><dd className="font-semibold">{selected.dept_name ?? 'بلا قسم مسجل'}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">الحالة (من السجل)</dt><dd className="font-semibold">{selected.status ?? '—'}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">المجموعة</dt><dd className="font-semibold">{selected.group_name ?? '—'}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">المشروع الحالي</dt><dd className="font-semibold">{selected.project_ref ? `${projectName(d, selected.project_ref)} (${selected.project_ref})` : '—'}</dd></div>
            </dl>
            <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs">الحالة معلنة في سجل الفريق — مش قياس حي.</p>
            <button type="button" onClick={() => setSelected(null)}
              className="mt-4 min-h-12 w-full rounded-xl bg-primary text-sm font-bold text-white">
              إغلاق
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function projectName(d: OsDataset, ref: string): string {
  return d.projects.find((p) => p.linear_id === ref)?.name ?? ref
}
