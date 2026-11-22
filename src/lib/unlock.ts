// طبقة فتح اللقطة المشفرة — مكيّفة من pgos-app/src/lib/snapshot.ts.
// الفرق عن المصدر: بياناتنا SiteData (من ../types) ومسار الحزمة /data/.
// القاعدة: لا تُخزَّن أي بيانات لقطة في localStorage/sessionStorage أبدًا —
// البيانات المفكوكة تعيش في ذاكرة الصفحة فقط (كاش data.ts عبر primeSiteData).
import {
  loadDeviceKeyPair,
  unwrapSnapshot,
  VaultError,
  type VaultBundle,
} from './vault.mjs'
import type { SiteData } from '../types'

export type UnlockResult =
  | { status: 'plain' } // لا حزمة مشفرة منشورة — وضع التطوير المحلي
  | { status: 'ok'; data: SiteData }
  | { status: 'no-key' }
  | { status: 'no-wrap' }
  | { status: 'error'; message: string }

function isVaultBundle(x: unknown): x is VaultBundle {
  if (typeof x !== 'object' || x === null) return false
  const b = x as Partial<VaultBundle>
  return (
    b.v === 1 &&
    typeof b.alg === 'string' &&
    typeof b.payload === 'object' &&
    b.payload !== null &&
    typeof (b.payload as { ct?: unknown }).ct === 'string' &&
    Array.isArray(b.wraps)
  )
}

let bundlePromise: Promise<VaultBundle | null> | null = null

/**
 * يجلب حزمة اللقطة المشفرة من نفس الأصل. يعيد null إن لم توجد حزمة صالحة
 * (404، أو إعادة توجيه SPA رجّعت HTML بدل JSON) — أي وضع التطوير المحلي.
 */
export function fetchBundle(): Promise<VaultBundle | null> {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const res = await fetch('/data/snapshot.enc.json', { cache: 'no-store' })
      if (!res.ok) return null
      const parsed: unknown = await res.json().catch(() => null)
      return isVaultBundle(parsed) ? parsed : null
    })()
    bundlePromise.catch(() => {
      bundlePromise = null // فشل الجلب لا يُخزَّن — إعادة المحاولة ممكنة
    })
  }
  return bundlePromise
}

/**
 * يفتح اللقطة بمفتاح الجهاز المحفوظ محليًا.
 * الحالات: plain (لا حزمة) | no-key (لا مفتاح على الجهاز) |
 * no-wrap (المفتاح موجود لكن اللقطة غير مغلّفة له بعد) | error | ok.
 */
export async function unlock(): Promise<UnlockResult> {
  let bundle: VaultBundle | null
  try {
    bundle = await fetchBundle()
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'تعذّر جلب اللقطة المشفرة',
    }
  }
  if (!bundle) return { status: 'plain' }

  let keyPair: CryptoKeyPair | null
  try {
    keyPair = await loadDeviceKeyPair()
  } catch {
    return { status: 'no-key' }
  }
  if (!keyPair) return { status: 'no-key' }

  try {
    const plain = await unwrapSnapshot(bundle, keyPair)
    const data = JSON.parse(new TextDecoder().decode(plain)) as SiteData
    return { status: 'ok', data }
  } catch (err) {
    if (err instanceof VaultError && err.code === 'NO_WRAP') {
      return { status: 'no-wrap' }
    }
    const message =
      err instanceof VaultError
        ? `فشل فك التشفير (${err.code})`
        : err instanceof Error
          ? err.message
          : 'حدث خطأ غير متوقع أثناء فتح اللقطة'
    return { status: 'error', message }
  }
}
