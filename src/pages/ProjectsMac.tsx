import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Chip, EmptyState, ErrorState, FieldValue, Kv, LoadingState, PageTitle, StatusChip, TextList } from '../components/ui'
import { FreshnessBadge, ProgressBar } from '../components/v2/widgets'
import { fmtDay, strList, txt } from '../lib/data'
import { useOsData } from '../lib/live/provider'
import { completionPct, PHASES, phaseIssues, projectIssues } from '../lib/live/metrics'
import type { LiveProject, OsDataset } from '../lib/live/types'
import ProjectsV2 from './ProjectsV2'

/*
 * صفحة «المشاريع ومواثيقها» (P2-19) — تصميم الماك الأصلي (Projects.tsx) منقول على
 * توصيلة البيانات الحالية useOsData() فقط: المشاريع الحقيقية التسعة من
 * OsDataset.projects، وتفاصيل الميثاق/الحوكمة تُدمج من سجلات records عند التطابق:
 *   ١) رابط Linear الكانوني في canonical_sources.linear == رابط المشروع، أو
 *   ٢) تطابق اسم لاتيني (Teacher App ↔ تطبيق المدرس — Teacher App).
 * اللي ملوش سجل بيظهر بكارته المتاحة + سطر «سجل ميثاق: غير متاح» صريح — والغياب
 * مش صفر وهمي. سجل بلا مقابل بيظهر في قسم لوحده بنفس التصميم. قراءة فقط بالكامل،
 * وأي فشل تحميل = ErrorState المهذبة (قاعدة المالك 2026-11-26).
 */

type Charter = Record<string, unknown>

function latinTokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3)
}

function charterMatchesProject(charter: Charter, p: LiveProject): boolean {
  const sources = (charter.canonical_sources ?? {}) as Record<string, unknown>
  const linearSrc = typeof sources.linear === 'string' ? sources.linear : null
  if (linearSrc && p.url && linearSrc === p.url) return true
  const cName = txt(charter.name)
  if (!cName) return false
  const cTokens = latinTokens(cName)
  const pTokens = new Set(latinTokens(p.name))
  // تطابق اسم: كل رموز اسم السجل اللاتينية موجودة في اسم المشروع أو العكس جزئيًا بقوة
  return cTokens.length > 0 && cTokens.every((t) => pTokens.has(t))
}

function CharterBlock({ charter }: { charter: Charter }) {
  const owner = (charter.owner ?? {}) as { id?: string; verified?: boolean }
  const sources = (charter.canonical_sources ?? {}) as Record<string, unknown>
  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">الميثاق — سجل الحوكمة</h3>
        <StatusChip status={txt(charter.status)} />
        <Chip tone="info">{txt(charter.id)}</Chip>
        <Chip tone="muted">مراجعة {txt(charter.revision)}</Chip>
      </div>
      <dl className="mt-2">
        <Kv label="المشكلة">
          <span className="whitespace-pre-wrap">{txt(charter.problem)}</span>
        </Kv>
        <Kv label="المالك المساءل">
          {owner.id ?? '—'}{' '}
          {owner.verified ? <Chip tone="ok">هوية موثقة</Chip> : <Chip tone="warn">هوية غير موثقة</Chip>}
        </Kv>
        <Kv label="طبقة المخاطر">
          <Chip tone={txt(charter.risk_tier) === 'HIGH' ? 'bad' : 'warn'}>{txt(charter.risk_tier)}</Chip>
        </Kv>
        <Kv label="تصنيف البيانات">
          <span className="flex flex-wrap gap-1">
            {strList(charter.data_classes).map((c) => (
              <Chip key={c} tone="muted">{c}</Chip>
            ))}
          </span>
        </Kv>
        <Kv label="النتائج المتوقعة"><TextList items={strList(charter.outcomes)} /></Kv>
        <Kv label="داخل النطاق"><TextList items={strList(charter.scope)} /></Kv>
        <Kv label="لا-أهداف صريحة"><TextList items={strList(charter.non_goals)} /></Kv>
        <Kv label="تاريخ الإنشاء">{fmtDay(txt(charter.created_at))}</Kv>
        <Kv label="تاريخ المراجعة">{fmtDay(txt(charter.review_date))}</Kv>
      </dl>
      {Object.keys(sources).length > 0 ? (
        <>
          <h4 className="mt-3 mb-1 font-bold">المصادر الكانونية</h4>
          <dl>
            {Object.entries(sources).map(([k, v]) => (
              <Kv key={k} label={k}>
                <FieldValue value={v} />
              </Kv>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  )
}

function ProjectMacCard({ d, p, charter }: { d: OsDataset; p: LiveProject; charter: Charter | null }) {
  const issues = projectIssues(d.issues, p.id)
  const live = issues.filter((i) => !i.archived_at)
  const pct = completionPct(issues)
  const done = issues.filter((i) => i.status_type === 'completed').length
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color ?? '#95a2b3' }} aria-hidden />
        <h2 className="text-lg font-bold">{p.name}</h2>
        <StatusChip status={p.status_name ?? undefined} />
        {p.linear_id ? <Chip tone="info">{p.linear_id}</Chip> : null}
        <Chip tone="muted">إنجاز {pct}%</Chip>
      </div>
      {p.summary ? <p className="mt-1 text-sm text-muted">{p.summary}</p> : null}
      <div className="mt-3">
        <ProgressBar pct={pct} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>{live.length} بند حي · {done} منجز</span>
          {PHASES.map((ph) => {
            const pi = phaseIssues(issues, ph)
            if (pi.length === 0) return null
            return <span key={ph}>{ph}: {completionPct(pi)}% ({pi.length})</span>
          })}
          <Link to={`/os/tasks?project=${p.id}`} className="font-semibold text-accent">بنود المشروع ←</Link>
          {p.url ? (
            <a href={p.url} target="_blank" rel="noreferrer" className="font-semibold text-accent">المشروع في Linear ↗</a>
          ) : null}
        </div>
      </div>
      <dl className="mt-2">
        <Kv label="أُنشئ">{fmtDay(p.created_at)}</Kv>
        <Kv label="آخر تحديث">{fmtDay(p.updated_at)}</Kv>
      </dl>
      {charter ? (
        <CharterBlock charter={charter} />
      ) : (
        <p className="mt-3 border-t border-dashed border-border pt-3 text-xs text-muted">
          سجل ميثاق/حوكمة: <b>غير متاح</b> لهذا المشروع في البيانات الحالية — الكارت ده بيعرض بيانات المشروع المتاحة بس.
        </p>
      )}
    </Card>
  )
}

export default function ProjectsMac() {
  const state = useOsData()
  const [view, setView] = useState<'charters' | 'detail'>('charters')

  const matching = useMemo(() => {
    if (state.phase !== 'ready') return null
    const d = state.data
    const charters = d.projectCharters ?? []
    const byProject = new Map<string, Charter>()
    const used = new Set<Charter>()
    for (const p of d.projects) {
      const hit = charters.find((c) => !used.has(c) && charterMatchesProject(c, p))
      if (hit) {
        byProject.set(p.id, hit)
        used.add(hit)
      }
    }
    return { byProject, unmatched: charters.filter((c) => !used.has(c)) }
  }, [state])

  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  if (view === 'detail') {
    return (
      <div dir="rtl">
        <div className="mb-3 flex gap-2" role="tablist" aria-label="طريقة العرض">
          <ViewTabs view={view} setView={setView} />
        </div>
        <ProjectsV2 />
      </div>
    )
  }
  const d = state.data
  const m = matching!

  return (
    <div dir="rtl">
      <PageTitle
        title="المشاريع ومواثيقها"
        sub="المشاريع الحقيقية من بيانات اوس الحالية، وميثاق كل مشروع مدموج من سجل حوكمتها عند التطابق — واللي ملوش سجل بيبان «غير متاح» بصراحة"
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ViewTabs view={view} setView={setView} />
        <FreshnessBadge source={d.source} generatedAt={d.generatedAt} />
      </div>
      {d.projectCharters === null ? (
        <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
          سجلات المواثيق <b>غير متاحة من القراءة الحية</b> — بتظهر مع لقطة الخزنة. كروت المشاريع نفسها من المصدر الحالي عادي.
        </p>
      ) : null}
      {d.projects.length === 0 ? (
        <EmptyState text="لا مشاريع في البيانات الحالية" />
      ) : (
        <div className="space-y-4">
          {d.projects.map((p) => (
            <ProjectMacCard key={p.id} d={d} p={p} charter={m.byProject.get(p.id) ?? null} />
          ))}
        </div>
      )}
      {m.unmatched.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-base font-bold">سجلات مواثيق بلا مقابل في قائمة المشاريع الحالية</h2>
          <p className="mt-1 text-xs text-muted">
            سجلات حوكمة مسجلة، لكن قاعدة المطابقة (رابط Linear الكانوني أو الاسم) ملقتش ليها مشروع مقابل — بتظهر
            لوحدها زي ما هي بدل ما تتدمج غلط.
          </p>
          <div className="mt-3 space-y-4">
            {m.unmatched.map((c, idx) => (
              <Card key={txt(c.id) || idx}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{txt(c.name)}</h3>
                </div>
                <CharterBlock charter={c} />
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ViewTabs({ view, setView }: { view: 'charters' | 'detail'; setView: (v: 'charters' | 'detail') => void }) {
  return (
    <>
      <button type="button" role="tab" aria-selected={view === 'charters'} onClick={() => setView('charters')}
        className={`min-h-11 rounded-full px-4 text-sm font-bold ${view === 'charters' ? 'bg-primary text-white' : 'border border-border bg-card text-muted'}`}>
        📜 المواثيق
      </button>
      <button type="button" role="tab" aria-selected={view === 'detail'} onClick={() => setView('detail')}
        className={`min-h-11 rounded-full px-4 text-sm font-bold ${view === 'detail' ? 'bg-primary text-white' : 'border border-border bg-card text-muted'}`}>
        📋 العرض التفصيلي
      </button>
    </>
  )
}
