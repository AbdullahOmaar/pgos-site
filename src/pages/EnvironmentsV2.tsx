import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge } from '../components/v2/widgets'
import { fmtDate } from '../lib/data'
import { useOsData } from '../lib/live/provider'
import type { LiveEnvironment } from '../lib/live/types'

/*
 * صفحة «سجل البيئات» — مصدر وحيد: جدول pgos_environments (مهاجرة 20261128000008)
 * عبر useOsData (لقطة تحمل environments + قراءة حية متسامحة).
 * الحالة (status/http_code/checked_at) من فحص فعلي كل ٣٠ دقيقة — بتتعرض زي ما هي.
 * قراءة فقط تمامًا؛ أي قيمة null = «—»، ومفيش أي قيمة ثابتة أو مخترعة.
 */
const STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'muted' }> = {
  working: { label: 'شغال', tone: 'ok' },
  stopped: { label: 'موقوف', tone: 'bad' },
  unknown: { label: 'غير معروف', tone: 'muted' },
}

function Dash({ v }: { v: string | null | undefined }) {
  return v ? <span>{v}</span> : <span className="text-muted">—</span>
}

function EnvRow({ e }: { e: LiveEnvironment }) {
  const st = STATUS[e.status] ?? STATUS.unknown
  return (
    <Card>
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{e.env_label}</span>
        <Chip tone={st.tone}>{st.label}{e.http_code ? ` · HTTP ${e.http_code}` : ''}</Chip>
        {e.checked_at ? <span className="text-[11px] text-muted">آخر فحص: {fmtDate(e.checked_at)}</span> : null}
      </p>
      <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-y-1 text-[13px]">
        <dt className="text-muted">الرابط</dt>
        <dd className="min-w-0">
          {e.url ? (
            <a href={e.url} target="_blank" rel="noreferrer" className="break-all font-semibold text-accent" dir="ltr">{e.url}</a>
          ) : <Dash v={null} />}
        </dd>
        <dt className="text-muted">الاستضافة</dt>
        <dd><Dash v={e.hosting} /></dd>
        <dt className="text-muted">النسخة</dt>
        <dd><Dash v={e.version} /></dd>
        <dt className="text-muted">آخر نشر</dt>
        <dd>{e.last_deploy_at ? fmtDate(e.last_deploy_at) : <Dash v={null} />}</dd>
        <dt className="text-muted">Git تطوير</dt>
        <dd className="min-w-0">
          {e.repo_dev ? (
            <a href={e.repo_dev} target="_blank" rel="noreferrer" className="break-all font-semibold text-accent" dir="ltr">{e.repo_dev.replace('https://github.com/', '')}</a>
          ) : <Dash v={null} />}
        </dd>
        <dt className="text-muted">Git شركة</dt>
        <dd className="min-w-0">
          {e.repo_company ? (
            <a href={e.repo_company} target="_blank" rel="noreferrer" className="break-all font-semibold text-accent" dir="ltr">{e.repo_company.replace('https://github.com/', '')}</a>
          ) : <Dash v={null} />}
        </dd>
      </dl>
      {e.note ? (
        <p className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-relaxed">📌 {e.note}</p>
      ) : null}
    </Card>
  )
}

export default function EnvironmentsV2() {
  const state = useOsData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data
  const envs = d.environments
  const groups = new Map<string, { name: string; rows: LiveEnvironment[] }>()
  for (const e of envs ?? []) {
    const g = groups.get(e.project_ref) ?? { name: e.project_name, rows: [] }
    g.rows.push(e)
    groups.set(e.project_ref, g)
  }

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">سجل البيئات</h1>
        <p className="mt-1 text-sm text-muted">
          كل بيئات مشاريع الشركة من سجل اوس الموحّد — الحالة من فحص فعلي كل ٣٠ دقيقة، ووقت آخر فحص مكتوب على كل بيئة.
        </p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      {envs === null ? (
        <EmptyState text="سجل البيئات غير متاح من مصدر البيانات الحالي — بييجي من قاعدة اوس (لقطة محدّثة أو قراءة حية بجلسة المالك). لا تُعرض أي بيئات بديلة أو قيم ثابتة." />
      ) : envs.length === 0 ? (
        <EmptyState text="سجل البيئات متصل ولسه فاضي — مفيش بيئات مسجلة لحد دلوقتي." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([ref, g]) => (
            <section key={ref}>
              <h2 className="mb-2 flex flex-wrap items-center gap-2 text-[15px] font-bold">
                {g.name}
                <Chip tone="muted">{ref}</Chip>
                <span className="text-xs font-normal text-muted">{g.rows.length} بيئة</span>
              </h2>
              <div className="space-y-3">
                {g.rows.map((e) => (
                  <EnvRow key={`${e.project_ref}-${e.env_key}`} e={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
