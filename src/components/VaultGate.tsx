import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  createAndSaveDeviceKeyPair,
  devicePublicInfo,
  importDevicePrivateKeyJwk,
  loadDeviceKeyPair,
  type DevicePublicInfo,
} from '../lib/vault.mjs'
import { unlock } from '../lib/unlock'
import { primeSiteData } from '../lib/data'

/*
 * بوابة الخزنة — مكيّفة من شاشة التفعيل في pgos-app (src/App.tsx).
 * عند الإقلاع: إن وُجدت لقطة مشفرة منشورة (/data/snapshot.enc.json)
 * تُعرض شاشات التفعيل/فك التشفير قبل أي صفحة، وبعد الفتح تُحقن البيانات
 * المفكوكة في كاش data.ts (primeSiteData) فتعمل الصفحات الـ16 كما هي.
 * إن لم توجد لقطة مشفرة (تطوير محلي) تُعرض الصفحات مباشرة كما اليوم.
 */

type Gate =
  | { kind: 'loading' }
  | { kind: 'open' }
  | { kind: 'no-key' }
  | { kind: 'no-wrap'; info: DevicePublicInfo | null }
  | { kind: 'error'; message: string }

async function currentDeviceInfo(): Promise<DevicePublicInfo | null> {
  try {
    const pair = await loadDeviceKeyPair()
    if (!pair) return null
    return await devicePublicInfo(pair.publicKey)
  } catch {
    return null
  }
}

/** يحسب حالة البوابة من محاولة فتح واحدة — بلا أي setState داخله. */
async function resolveGate(): Promise<Gate> {
  const result = await unlock()
  if (result.status === 'plain' || result.status === 'ok') {
    if (result.status === 'ok') primeSiteData(result.data)
    return { kind: 'open' }
  }
  if (result.status === 'no-key') return { kind: 'no-key' }
  if (result.status === 'no-wrap') {
    return { kind: 'no-wrap', info: await currentDeviceInfo() }
  }
  return { kind: 'error', message: result.message }
}

function ActivationCodeBox({ info }: { info: DevicePublicInfo }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.pub)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* النسخ اليدوي من الصندوق متاح دايمًا */
    }
  }
  return (
    <div className="w-full rounded-2xl border border-border bg-card p-4 text-start shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold">كود تفعيل الجهاز</p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95"
        >
          {copied ? 'اتنسخ ✓' : '📋 نسخ الكود'}
        </button>
      </div>
      <p
        dir="ltr"
        className="rounded-lg bg-soft p-2.5 font-mono text-[11px] leading-relaxed break-all text-muted select-all"
      >
        {info.pub}
      </p>
      <p className="mt-2 text-xs text-muted">
        بصمة الجهاز:{' '}
        <span dir="ltr" className="font-mono font-semibold">
          {info.fp}
        </span>
      </p>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-5 py-10">
      {children}
    </div>
  )
}

export default function VaultGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [createdInfo, setCreatedInfo] = useState<DevicePublicInfo | null>(null)
  const [gateError, setGateError] = useState<string | null>(null)
  const [showRestore, setShowRestore] = useState(false)
  const [jwkText, setJwkText] = useState('')

  useEffect(() => {
    let alive = true
    void resolveGate().then((g) => {
      if (alive) setGate(g)
    })
    return () => {
      alive = false
    }
  }, [])

  const retry = useCallback(() => {
    setGate({ kind: 'loading' })
    void resolveGate().then(setGate)
  }, [])

  const activate = async () => {
    setBusy(true)
    setGateError(null)
    try {
      const pair = await createAndSaveDeviceKeyPair()
      setCreatedInfo(await devicePublicInfo(pair.publicKey))
    } catch {
      setGateError('تعذّر إنشاء مفتاح الجهاز على المتصفح ده — جرّب متصفح أحدث.')
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    setBusy(true)
    setGateError(null)
    try {
      const jwk = JSON.parse(jwkText.trim()) as JsonWebKey
      await importDevicePrivateKeyJwk(jwk)
      setGate({ kind: 'loading' })
      setGate(await resolveGate())
    } catch {
      setGateError('المفتاح اللي لزقته مش صالح — اتأكد إنه JWK كامل وجرّب تاني.')
    } finally {
      setBusy(false)
    }
  }

  if (gate.kind === 'open') return <>{children}</>

  // ----- تحميل -----
  if (gate.kind === 'loading') {
    return (
      <Shell>
        <img src="/otto.png" alt="أوتو" className="h-28 w-28 animate-pulse object-contain" />
        <p className="mt-4 font-bold">PGOS — نظام إدارة شركة 3A Automation</p>
        <p className="mt-1 text-sm text-muted">بنفتح اللقطة المشفرة…</p>
      </Shell>
    )
  }

  // ----- خطأ -----
  if (gate.kind === 'error') {
    return (
      <Shell>
        <img src="/otto.png" alt="أوتو" className="h-24 w-24 object-contain" />
        <div className="mt-5 w-full rounded-2xl border border-bad/40 bg-bad/10 p-4 text-center">
          <p className="font-bold text-bad">حصلت مشكلة في فتح اللقطة</p>
          <p className="mt-1 text-sm leading-relaxed text-bad">{gate.message}</p>
        </div>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-full bg-primary px-5 py-2.5 font-semibold text-white shadow transition active:scale-95"
        >
          ↻ إعادة المحاولة
        </button>
      </Shell>
    )
  }

  // ----- لا مفتاح: التفعيل -----
  if (gate.kind === 'no-key') {
    return (
      <Shell>
        <img
          src="/otto.png"
          alt="أوتو — ماسكوت 3A Automation"
          className="h-28 w-28 object-contain"
        />
        <h1 className="mt-4 text-center text-xl font-bold">
          PGOS — نظام إدارة شركة 3A Automation
        </h1>
        <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted">
          الموقع ده مشفر بمفتاح جهازك: البيانات بتتفك هنا على جهازك بس، ومفيش أي بيانات
          شركة بتتساب مكشوفة على الإنترنت.
        </p>

        {gateError && (
          <p className="mt-4 w-full rounded-xl border border-bad/40 bg-bad/10 px-3 py-2.5 text-center text-sm font-medium text-bad">
            {gateError}
          </p>
        )}

        {!createdInfo ? (
          <button
            type="button"
            onClick={() => void activate()}
            disabled={busy}
            className="mt-6 rounded-full bg-primary px-6 py-3 font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-60"
          >
            📱 {busy ? 'بنجهّز المفتاح…' : 'تفعيل هذا الجهاز'}
          </button>
        ) : (
          <div className="mt-6 flex w-full flex-col items-center gap-3">
            <ActivationCodeBox info={createdInfo} />
            <p className="max-w-sm text-center text-sm leading-relaxed">
              ابعت الكود ده لأي وكيل في الشات — بعد إعادة توليد اللقطة المشفرة
              (npm run data:encrypt) الموقع هيفتح هنا لوحده.
            </p>
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-primary-d px-5 py-2.5 font-semibold text-white transition active:scale-95"
            >
              ↻ تحديث
            </button>
          </div>
        )}

        {/* استعادة بمفتاح JWK */}
        <div className="mt-8 w-full border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowRestore((s) => !s)}
            className="flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-muted"
          >
            🔑 استعادة جهاز بمفتاح JWK {showRestore ? '▴' : '▾'}
          </button>
          {showRestore && (
            <div className="mt-3 space-y-2.5">
              <textarea
                value={jwkText}
                onChange={(e) => setJwkText(e.target.value)}
                placeholder="الصق مفتاح JWK الخاص هنا…"
                rows={4}
                dir="ltr"
                className="w-full rounded-xl border border-border bg-card p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => void restore()}
                disabled={busy || !jwkText.trim()}
                className="w-full rounded-full bg-card py-2.5 font-semibold text-primary ring-1 ring-primary transition active:scale-[0.98] disabled:opacity-50"
              >
                استيراد المفتاح وفتح الموقع
              </button>
            </div>
          )}
        </div>
      </Shell>
    )
  }

  // ----- مفتاح موجود لكن اللقطة مش مغلّفة له -----
  return (
    <Shell>
      <img src="/otto.png" alt="أوتو" className="h-28 w-28 object-contain" />
      <h1 className="mt-4 text-center text-xl font-bold">🔒 الجهاز مفعّل — مستني أول لقطة مغلّفة له</h1>
      <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted">
        مفتاح جهازك جاهز، بس اللقطة الحالية لسه مش مغلّفة لمفتاحك. ابعت الكود لأي وكيل
        في الشات، وبعد إعادة توليد اللقطة المشفرة (npm run data:encrypt) الموقع هيفتح
        هنا لوحده.
      </p>
      {gate.info && (
        <div className="mt-5 w-full">
          <ActivationCodeBox info={gate.info} />
        </div>
      )}
      <button
        type="button"
        onClick={retry}
        className="mt-5 rounded-full bg-primary px-5 py-2.5 font-semibold text-white shadow transition active:scale-95"
      >
        ↻ إعادة المحاولة
      </button>
    </Shell>
  )
}
