import { useEffect, useMemo, useState } from 'react'
import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge } from '../components/v2/widgets'
import { fmtDate } from '../lib/data'
import { useOsData } from '../lib/live/provider'
import type { LiveLifecycleState } from '../lib/live/types'

/*
 * صفحة «دورة حياة المشروع» — مصدر وحيد: جدولا pgos_lifecycle_steps (قالب موحّد)
 * وpgos_project_lifecycle (حالة كل خطوة لكل مشروع) عبر useOsData.
 * التقدم = المُنجز ÷ الخطوات المنطبقة (الكل ما عدا «لا تنطبق») — نفس منطق العقد.
 * قراءة فقط تمامًا؛ غياب البيانات = «غير متاح» صريحة؛ مفيش قيم ثابتة.
 */
const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'muted' }> = {
  done: { label: 'اتعملت', tone: 'ok' },
  pending: { label: 'لسه', tone: 'warn' },
  na: { label: 'لا تنطبق', tone: 'muted' },
}

function Progress({ done, applicable }: { done: number; applicable: number }) {
  const pct = applicable > 0 ? Math.round((done / applicable) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-muted">
        <span>المُنجز من الخطوات المنطبقة</span>
        <span className="font-bold text-ink">{done}/{applicable} · {pct}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function LifecycleV2() {
  const state = useOsData()
  const [selected, setSelected] = useState<string | null>(null)

  const data = state.phase === 'ready' ? state.data : null
  const projects = useMemo(() => {
    if (!data?.lifecycle) return []
    const seen = new Map<string, string>()
    for (const s of data.lifecycle.states) if (!seen.has(s.project_ref)) seen.set(s.project_ref, s.project_name)
    return [...seen.entries()].map(([ref, name]) => ({ ref, name }))
  }, [data])

  /* اختيار افتراضي: أول مشروع — ورابط عميق ‎#project-<ref>‎ */
  useEffect(() => {
    if (projects.length === 0) return
    const m = window.location.hash.match(/^#project-(.+)$/)
    const hit = m ? projects.find((p) => p.ref === m[1]) : undefined
    setSelected((cur) => cur ?? (hit?.ref ?? projects[0].ref))
  }, [projects])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data
  const lc = d.lifecycle

  const progressOf = (ref: string) => {
    const rows = (lc?.states ?? []).filter((s) => s.project_ref === ref)
    const done = rows.filter((s) => s.status === 'done').length
    const na = rows.filter((s) => s.status === 'na').length
    return { done, applicable: rows.length - na }
  }

  const current = selected ?? projects[0]?.ref ?? null
  const sections = new Map<string, typeof lc extends null ? never : NonNullable<typeof lc>['steps']>()
  if (lc) {
    for (const step of [...lc.steps].sort((a, b) => a.sort_order - b.sort_order)) {
      const arr = sections.get(step.section) ?? []
      arr.push(step)
      sections.set(step.section, arr)
    }
  }
  const stateOf = (stepKey: string): LiveLifecycleState | undefined =>
    lc?.states.find((s) => s.project_ref === current && s.step_key === stepKey)

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">دورة حياة المشروع</h1>
        <p className="mt-1 text-sm text-muted">
          قالب موحّد من ٢٦ خطوة في ٨ أقسام — من التأسيس لما بعد البرودكشن — وحالة كل خطوة لكل مشروع زي ما هي مسجلة في اوس.
        </p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      {lc === null ? (
        <EmptyState text="بيانات دورة الحياة غير متاحة من مصدر البيانات الحالي — بتيجي من قاعدة اوس (لقطة محدّثة أو قراءة حية بجلسة المالك). لا تُعرض أي خطوات بديلة أو قيم ثابتة." />
      ) : lc.steps.length === 0 ? (
        <EmptyState text="قالب دورة الحياة متصل ولسه فاضي — مفيش خطوات مسجلة لحد دلوقتي." />
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {projects.map((p) => {
              const pr = progressOf(p.ref)
              return (
                <button
                  key={p.ref}
                  type="button"
                  onClick={() => setSelected(p.ref)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                    current === p.ref ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-muted'
                  }`}
                >
                  {p.name.split(' — ')[0]} · {pr.done}/{pr.applicable}
                </button>
              )
            })}
          </div>

          {current ? (
            <Card className="mb-5">
              <p className="mb-2 text-sm font-bold">{projects.find((p) => p.ref === current)?.name}</p>
              <Progress {...progressOf(current)} />
            </Card>
          ) : null}

          <div className="space-y-6">
            {[...sections.entries()].map(([section, steps]) => (
              <section key={section}>
                <h2 className="mb-2 text-[15px] font-bold">{section}</h2>
                <div className="space-y-3">
                  {steps.map((step) => {
                    const st = stateOf(step.step_key)
                    const meta = st ? (STATUS[st.status] ?? STATUS.pending) : null
                    return (
                      <Card key={step.step_key}>
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{step.title}</span>
                          {meta ? <Chip tone={meta.tone}>{meta.label}</Chip> : <Chip tone="muted">بلا حالة مسجلة</Chip>}
                          {st ? <span className="text-[11px] text-muted">آخر تحديث: {fmtDate(st.updated_at)}</span> : null}
                        </p>
                        {step.description ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.description}</p> : null}
                        {st?.note ? (
                          <p className="mt-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-xs leading-relaxed">📝 {st.note}</p>
                        ) : null}
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
