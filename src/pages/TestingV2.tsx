import { useEffect, useMemo, useState } from 'react'
import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge } from '../components/v2/widgets'
import { fmtDate } from '../lib/data'
import { useOsData } from '../lib/live/provider'
import type { LiveTestDefect, LiveTestRun } from '../lib/live/types'

/*
 * صفحة «وحدة الاختبار» — مصدر وحيد: جداول pgos_test_* (مهاجرة 20261128000012)
 * عبر useOsData: كيسز بمعرّفات ثابتة ومصدر موثّق في مرجع الاختبار + تشغيلات +
 * نتيجة كل كيس في كل تشغيلة + عيوب مرتبطة بالكيسز.
 * تعريفات ثابتة (لا إعادة تعريف): «منفذة» = كيس لها نتيجة مسجلة في تشغيلة واحدة
 * على الأقل · نسبة النجاح = ناجح ÷ (ناجح + فاشل + جزئي + موقوف) — «متخطّى» بره
 * المقام لأنه لم يُقَس أصلًا. قراءة فقط تمامًا؛ غياب البيانات = «غير متاح» صريحة.
 */
const RESULT: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' | 'muted' }> = {
  pass: { label: 'ناجح', tone: 'ok' },
  fail: { label: 'فاشل', tone: 'bad' },
  partial: { label: 'جزئي', tone: 'warn' },
  blocked: { label: 'موقوف', tone: 'warn' },
  skipped: { label: 'متخطّى', tone: 'muted' },
}
const DECIDED = ['pass', 'fail', 'partial', 'blocked']

const KIND: Record<string, string> = {
  automated: 'آلي CI',
  automated_local: 'آلي محلي',
  manual: 'يدوي',
  governance: 'حوكمة',
}

const SEVERITY: Record<string, { label: string; tone: 'bad' | 'warn' | 'muted' }> = {
  critical: { label: 'حرج', tone: 'bad' },
  high: { label: 'عالٍ', tone: 'bad' },
  medium: { label: 'متوسط', tone: 'warn' },
  low: { label: 'منخفض', tone: 'muted' },
}

const DEFECT_STATUS: Record<string, string> = {
  open: 'مفتوح',
  fixed: 'اتصلح',
  retested: 'أُعيد اختباره',
  accepted_risk: 'مخاطرة مقبولة',
}

function Bar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export default function TestingV2() {
  const state = useOsData()
  const [selected, setSelected] = useState<string | null>(null)

  const data = state.phase === 'ready' ? state.data : null
  const projects = useMemo(() => {
    if (!data) return []
    const seen = new Map<string, string>()
    for (const s of data.lifecycle?.states ?? []) if (!seen.has(s.project_ref)) seen.set(s.project_ref, s.project_name)
    for (const c of data.testing?.cases ?? []) if (!seen.has(c.project_ref)) seen.set(c.project_ref, c.project_name)
    return [...seen.entries()].map(([ref, name]) => ({ ref, name }))
  }, [data])

  useEffect(() => {
    if (projects.length === 0) return
    const m = window.location.hash.match(/^#project-(.+)$/)
    const hit = m ? projects.find((p) => p.ref === m[1]) : undefined
    setSelected((cur) => {
      if (cur) return cur
      if (hit) return hit.ref
      // الافتراضي: أكتر مشروع فيه كيسز مكتوبة
      const counts = new Map<string, number>()
      for (const c of data?.testing?.cases ?? []) if (c.case_state === 'written') counts.set(c.project_ref, (counts.get(c.project_ref) ?? 0) + 1)
      let best = projects[0].ref
      let bestN = -1
      for (const p of projects) { const n = counts.get(p.ref) ?? 0; if (n > bestN) { bestN = n; best = p.ref } }
      return best
    })
  }, [projects, data])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data
  const t = d.testing

  const current = selected ?? projects[0]?.ref ?? null
  const cases = (t?.cases ?? []).filter((c) => c.project_ref === current)
  const written = cases.filter((c) => c.case_state === 'written')
  const gapRows = cases.filter((c) => c.case_state === 'gap')
  const runs = (t?.runs ?? []).filter((r) => r.project_ref === current)
    .sort((a, b) => (a.run_at < b.run_at ? 1 : -1))
  const runIds = new Set(runs.map((r) => r.id))
  const results = (t?.results ?? []).filter((r) => runIds.has(r.run_id))
  const executedIds = new Set(results.map((r) => r.case_id))
  const decided = results.filter((r) => DECIDED.includes(r.result))
  const passCount = results.filter((r) => r.result === 'pass').length
  const passRate = decided.length ? Math.round((passCount / decided.length) * 100) : null
  const coverage = written.length ? Math.round((written.filter((c) => executedIds.has(c.id)).length / written.length) * 100) : null
  const defects = (t?.defects ?? []).filter((x) => x.project_ref === current)
    .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1))
  const openDefects = defects.filter((x) => x.status === 'open')

  const runBreakdown = (run: LiveTestRun) => {
    const rs = results.filter((r) => r.run_id === run.id)
    const by: Record<string, number> = {}
    for (const r of rs) by[r.result] = (by[r.result] ?? 0) + 1
    return { total: rs.length, by }
  }

  // حسابات عادية بعد بوابات التحميل/الخطأ (لا hooks تحت إرجاع شرطي — درس خطأ React #310)
  const moduleMap = new Map<string, { written: number; executed: number }>()
  for (const c of written) {
    const m = moduleMap.get(c.module) ?? { written: 0, executed: 0 }
    m.written += 1
    if (executedIds.has(c.id)) m.executed += 1
    moduleMap.set(c.module, m)
  }
  const modules = [...moduleMap.entries()].sort((a, b) => b[1].written - a[1].written)

  const kindMap = new Map<string, number>()
  for (const c of written) kindMap.set(c.kind, (kindMap.get(c.kind) ?? 0) + 1)
  const kindCounts = [...kindMap.entries()]

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">وحدة الاختبار</h1>
        <p className="mt-1 text-sm text-muted">
          سجل الشركة المنظّم للاختبار: كل كيس بمعرّف ثابت ومصدرها في مرجع الاختبار، وكل تشغيلة بنتيجتها، وكل عيب مرتبط بكيسه — من قاعدة اوس بس.
        </p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      {t === null ? (
        <EmptyState text="بيانات وحدة الاختبار غير متاحة من مصدر البيانات الحالي — بتيجي من قاعدة اوس (لقطة محدّثة أو قراءة حية بجلسة المالك). لا تُعرض أي أرقام بديلة أو قيم ثابتة." />
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {projects.map((p) => {
              const n = (t.cases ?? []).filter((c) => c.project_ref === p.ref && c.case_state === 'written').length
              return (
                <button
                  key={p.ref}
                  type="button"
                  onClick={() => setSelected(p.ref)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                    current === p.ref ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-muted'
                  }`}
                >
                  {p.name.split(' — ')[0]} · {n}
                </button>
              )
            })}
          </div>

          {current && written.length === 0 ? (
            <EmptyState text="لا كيسز مزروعة بعد لهذا المشروع في وحدة الاختبار — الزرع بيتم من مرجع اختبار المشروع بمعرّفات ثابتة لكل موديول." />
          ) : current ? (
            <div className="space-y-4">
              <Card>
                <p className="mb-2 text-sm font-bold">{projects.find((p) => p.ref === current)?.name}</p>
                <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                  <div><p className="text-xl font-bold">{written.length}</p><p className="text-[11px] text-muted">كيس مكتوبة</p></div>
                  <div><p className="text-xl font-bold">{executedIds.size}</p><p className="text-[11px] text-muted">منفذة (لها نتيجة)</p></div>
                  <div><p className="text-xl font-bold">{passRate == null ? '—' : `${passRate}%`}</p><p className="text-[11px] text-muted">نسبة النجاح</p></div>
                  <div><p className="text-xl font-bold">{openDefects.length}</p><p className="text-[11px] text-muted">عيب مفتوح</p></div>
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline justify-between text-xs text-muted">
                    <span>تغطية التنفيذ (منفذة ÷ مكتوبة)</span>
                    <span className="font-bold text-ink">{coverage == null ? '—' : `${coverage}%`}</span>
                  </div>
                  <Bar value={coverage ?? 0} />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  الأنواع: {kindCounts.map(([k, n]) => `${KIND[k] ?? k} ${n}`).join(' · ')}
                  {gapRows.length ? ` · + ${gapRows.length} صف فجوات موثّقة (كيسز معروفة لسه ما اتكتبتش)` : ''}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  نسبة النجاح = ناجح ÷ (ناجح + فاشل + جزئي + موقوف) عبر كل النتائج المسجلة — «متخطّى» بره المقام لأنه لم يُقَس أصلًا.
                </p>
              </Card>

              <Card>
                <p className="mb-2 text-sm font-bold">التشغيلات ({runs.length})</p>
                {runs.length === 0 ? (
                  <p className="text-[13px] text-muted">لا تشغيلات مسجلة بعد لهذا المشروع.</p>
                ) : (
                  <div className="space-y-3">
                    {runs.map((run, i) => {
                      const b = runBreakdown(run)
                      return (
                        <div key={run.id} className="rounded-xl border border-line px-3 py-2">
                          <p className="flex flex-wrap items-center gap-2 text-[13px]">
                            {i === 0 ? <Chip tone="ok">آخر تشغيلة</Chip> : null}
                            <span className="font-bold">{run.label}</span>
                          </p>
                          <p className="mt-1 text-[11px] text-muted">
                            {fmtDate(run.run_at)} · {run.environment} · المنفّذ: {run.executor}
                            {run.build_ref ? ` · البناء: ${run.build_ref}` : ''}
                          </p>
                          <p className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(b.by).map(([res, n]) => (
                              <Chip key={res} tone={RESULT[res]?.tone ?? 'muted'}>{RESULT[res]?.label ?? res} {n}</Chip>
                            ))}
                            <span className="text-[11px] text-muted">إجمالي النتائج: {b.total}</span>
                          </p>
                          {run.note ? <p className="mt-1 text-[11px] leading-relaxed text-muted">{run.note}</p> : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              <Card>
                <p className="mb-2 text-sm font-bold">التغطية بالموديول</p>
                <div className="space-y-2">
                  {modules.map(([mod, m]) => {
                    const pctv = m.written ? Math.round((m.executed / m.written) * 100) : 0
                    return (
                      <div key={mod}>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="font-semibold">{mod}</span>
                          <span className="text-muted">{m.executed}/{m.written} · {pctv}%</span>
                        </div>
                        <Bar value={pctv} />
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card>
                <p className="mb-2 text-sm font-bold">العيوب ({defects.length} — مفتوح {openDefects.length})</p>
                {defects.length === 0 ? (
                  <p className="text-[13px] text-muted">لا عيوب مسجلة لهذا المشروع.</p>
                ) : (
                  <div className="space-y-2">
                    {defects.map((x: LiveTestDefect) => (
                      <div key={x.id} className="rounded-xl border border-line px-3 py-2">
                        <p className="flex flex-wrap items-center gap-2 text-[13px]">
                          <Chip tone={SEVERITY[x.severity]?.tone ?? 'muted'}>{SEVERITY[x.severity]?.label ?? x.severity}</Chip>
                          <Chip tone={x.status === 'open' ? 'warn' : 'muted'}>{DEFECT_STATUS[x.status] ?? x.status}</Chip>
                          <span className="font-bold">{x.id}</span>
                          {x.case_id ? <span className="text-[11px] text-muted">كيس: {x.case_id}</span> : null}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed">{x.title}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          فُتح {fmtDate(x.opened_at)} · المصدر: {x.source}
                          {x.evidence_url ? <> · <a className="text-accent underline" href={x.evidence_url} target="_blank" rel="noreferrer">الدليل</a></> : null}
                        </p>
                        {x.note ? <p className="mt-1 text-[11px] leading-relaxed text-muted">{x.note}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
