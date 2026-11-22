import type { ReactNode } from 'react'
import { strList, txt } from '../lib/data'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-4">
      <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </header>
  )
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16 text-muted" role="status">
      <span className="animate-pulse">جارٍ تحميل البيانات…</span>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-bad/40 bg-bad/10 p-4 text-bad" role="alert">
      <p className="font-bold">تعذّر تحميل بيانات الموقع</p>
      <p className="mt-1 text-sm">
        ملف البيانات الثابت (/data/site-data.json) غير متاح ({message}). لا تُعرض أي بيانات
        بديلة أو مخمّنة — شغّل خط التوليد (npm run data) ثم أعد المحاولة.
      </p>
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      {text}
    </div>
  )
}

/* شارة حالة ملوّنة — الحالات تُعرض كما هي من مصدرها ولا تُدمج أبدًا */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted'

const TONE_CLASSES: Record<Tone, string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/20 text-[#9a6206] dark:text-warn',
  bad: 'bg-bad/15 text-bad',
  info: 'bg-accent/15 text-accent',
  muted: 'bg-soft text-muted',
}

export function statusTone(status: string | undefined): Tone {
  switch ((status ?? '').toUpperCase()) {
    case 'APPROVED':
    case 'PASS':
    case 'ACTIVE':
    case 'DONE':
    case 'COMPLETED':
    case 'MITIGATED':
    case 'DEPLOYED':
    case 'LIVE_VERIFIED':
    case 'CLOSED':
    case 'RESOLVED':
    case 'CONTAINED':
      return 'ok'
    case 'PROPOSED':
    case 'UNDER_REVIEW':
    case 'DEFERRED':
    case 'NOT_RUN':
    case 'STALE':
    case 'UNKNOWN':
    case 'ACCEPTED':
    case 'NOT_READY':
    case 'READY_FOR_APPROVAL':
    case 'IN PROGRESS':
    case 'STARTED':
      return 'warn'
    case 'FAIL':
    case 'FAILED':
    case 'REJECTED':
    case 'OPEN':
    case 'REVOKED':
    case 'ROLLED_BACK':
    case 'BLOCKED':
      return 'bad'
    case 'IN_PROGRESS':
    case 'DEPLOYING':
    case 'INVESTIGATING':
      return 'info'
    default:
      return 'muted'
  }
}

export function Chip({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: Tone
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}

export function StatusChip({ status }: { status: string | undefined }) {
  if (!status) return null
  return <Chip tone={statusTone(status)}>{status}</Chip>
}

/** قائمة مفتاح/قيمة لعرض حقول سجل بشكل مقروء */
export function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** عرض قيمة حقل خام من سجل PGOS (نص/قائمة/كائن) بشكل صادق ومقروء */
export function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted">—</span>
  }
  if (typeof value === 'boolean') return <span>{value ? 'نعم ✔' : 'لا ✘'}</span>
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value)
    if (/^https?:\/\//.test(s)) {
      return (
        <a className="text-accent underline break-all" href={s} target="_blank" rel="noreferrer">
          {s}
        </a>
      )
    }
    return <span className="whitespace-pre-wrap">{s}</span>
  }
  if (Array.isArray(value)) {
    const items = strList(value)
    if (items.length === 0) return <span className="text-muted">—</span>
    // مصفوفة كائنات (مثل معايير القبول) تُعرض كقائمة نصية بصيغتها
    const isObj = typeof value[0] === 'object'
    return (
      <ul className="list-disc space-y-1 ps-5">
        {value.map((item, i) => (
          <li key={i} className="whitespace-pre-wrap">
            {isObj ? txt(item) : items[i]}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <pre className="overflow-x-auto rounded-lg bg-soft p-2 text-xs whitespace-pre-wrap">
      {JSON.stringify(value, null, 1)}
    </pre>
  )
}

export function TextList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted">—</span>
  return (
    <ul className="list-disc space-y-1 ps-5">
      {items.map((item, i) => (
        <li key={i} className="whitespace-pre-wrap">
          {item}
        </li>
      ))}
    </ul>
  )
}
