import { useMemo, useState } from 'react'
import { Card, Chip, EmptyState, ErrorState, LoadingState, type Tone } from '../components/ui'
import { FreshnessBadge, ProgressBar } from '../components/v2/widgets'
import { fmtDate, useSiteData } from '../lib/data'
import type { PreprodStatus } from '../types'

const STATUS_VIEW: Record<PreprodStatus, { label: string; tone: Tone }> = {
  done: { label: '✅ منجز', tone: 'ok' },
  partial: { label: '◐ جزئي', tone: 'warn' },
  not_started: { label: '⬜ لم يبدأ', tone: 'muted' },
  na: { label: '— لا ينطبق', tone: 'muted' },
  not_evaluated: { label: '؟ لم يُقيّم بعد', tone: 'info' },
}

function Badge({ status }: { status: PreprodStatus }) {
  const v = STATUS_VIEW[status] ?? STATUS_VIEW.not_evaluated
  return <Chip tone={v.tone}>{v.label}</Chip>
}

const APPS = [
  { key: 'teacher', label: 'المدرس' },
  { key: 'nounou', label: 'نونو' },
  { key: 'pgos', label: 'اوس' },
] as const

/* الصفحة الخامسة (3A-352) — فحص ما قبل الإنتاج: الـ٤٥ فحصًا بحالاتها الخمس بلا دمج،
   فلتر تصنيف + حالة، والدليل يُفتح لكل فحص. «لم يُقيّم» حالة مستقلة دائمًا. */
export default function PreprodV2() {
  const state = useSiteData()
  const [category, setCategory] = useState('all')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const checks = useMemo(() => {
    if (state.phase !== 'ready') return []
    return state.data.preprod_checklist.checks.filter((c) => {
      if (category !== 'all' && c.category !== category) return false
      if (onlyOpen && c.apps.teacher.status === 'done') return false
      return true
    })
  }, [state, category, onlyOpen])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const pc = state.data.preprod_checklist
  if (!pc.available || pc.checks.length === 0) {
    return (
      <div dir="rtl">
        <h1 className="mb-3 text-[22px] font-bold">فحص ما قبل الإنتاج</h1>
        <EmptyState text="سجل الفحص غير متاح في نسخة البيانات الحالية — لا تُعرض فحوصات بديلة أو مخمّنة." />
      </div>
    )
  }

  const teacherDone = pc.checks.filter((c) => c.apps.teacher.status === 'done').length
  const teacherPct = Math.round((teacherDone / pc.checks.length) * 100)

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">فحص ما قبل الإنتاج — الـ٤٥</h1>
        <p className="mt-1 text-sm text-muted">حالة كل فحص لكل منتج كما هي في السجل — «لم يُقيّم بعد» حالة مستقلة، مش «لم يبدأ».</p>
        <div className="mt-3"><FreshnessBadge source="snapshot" generatedAt={state.data.meta.generated_at} /></div>
      </header>

      <Card className="mb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted">المدرس — فحوصات منجزة</p>
            <p className="mt-1 text-3xl font-bold text-primary">{teacherDone} / {pc.checks.length}</p>
          </div>
          <p className="text-lg font-bold">{teacherPct}٪</p>
        </div>
        <div className="mt-3"><ProgressBar pct={teacherPct} /></div>
        <p className="mt-2 text-xs text-muted">آخر توليد: {fmtDate(state.data.meta.generated_at)}</p>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <label className="sr-only" htmlFor="pp-cat">التصنيف</label>
        <select id="pp-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="min-h-11 rounded-xl border border-border bg-card px-2 text-sm">
          <option value="all">كل التصنيفات</option>
          {pc.categories.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="h-5 w-5" />
          غير المنجز عند المدرس بس
        </label>
      </div>

      {checks.length === 0 ? <EmptyState text="لا فحوصات مطابقة للفلاتر الحالية" /> : (
        <div className="space-y-3">
          {checks.map((c) => {
            const open = openId === c.id
            return (
              <Card key={c.id} className="p-0">
                <button type="button" onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open} className="min-h-11 w-full p-4 text-start active:bg-soft/60">
                  <p className="text-sm"><span className="font-bold">#{c.id}</span> <span className="text-xs text-muted">{c.category}</span></p>
                  <p className="mt-1 font-semibold">{c.item}</p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {APPS.map((a) => (
                      <span key={a.key} className="inline-flex items-center gap-1 text-xs">
                        <span className="text-muted">{a.label}:</span><Badge status={c.apps[a.key].status} />
                      </span>
                    ))}
                  </p>
                </button>
                {open ? (
                  <div className="border-t border-border px-4 py-3 text-sm">
                    {c.how ? <p><span className="font-semibold">طريقة التحقق: </span>{c.how}</p> : null}
                    {c.apps.teacher.evidence ? <p className="mt-2"><span className="font-semibold">دليل المدرس: </span><span className="whitespace-pre-wrap">{c.apps.teacher.evidence}</span></p> : null}
                    {c.notes_column ? <p className="mt-2 text-muted">{c.notes_column}</p> : null}
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
