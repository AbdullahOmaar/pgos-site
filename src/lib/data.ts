import { useEffect, useState } from 'react'
import type { SiteData } from '../types'

/* جلب ملف البيانات الثابت المولّد — العميل الوحيد للبيانات في الموقع.
   كاش على مستوى الوحدة: كل الصفحات تتشارك طلبًا واحدًا. */

let cache: Promise<SiteData> | null = null

function fetchSiteData(): Promise<SiteData> {
  if (!cache) {
    cache = fetch('/data/site-data.json', { headers: { Accept: 'application/json' } }).then(
      (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<SiteData>
      },
    )
    cache.catch(() => {
      cache = null // فشل الجلب لا يُخزَّن — إعادة المحاولة ممكنة
    })
  }
  return cache
}

/**
 * حقن بيانات مفكوكة التشفير (وضع النشر المشفر — انظر VaultGate/unlock).
 * بوابة الخزنة تستدعيها بعد فك اللقطة بنجاح، فتقرأ كل الصفحات البيانات
 * من الكاش الجاهز بدل جلب /data/site-data.json.
 */
export function primeSiteData(data: SiteData): void {
  cache = Promise.resolve(data)
}

export type DataState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: SiteData }

export function useSiteData(): DataState {
  const [state, setState] = useState<DataState>({ phase: 'loading' })

  useEffect(() => {
    let alive = true
    fetchSiteData()
      .then((data) => {
        if (alive) setState({ phase: 'ready', data })
      })
      .catch(() => {
        if (alive)
          setState({
            phase: 'error',
            /* رسالة ثابتة مهذبة — الخطأ الخام لا يعدي لطبقة العرض أبدًا (قاعدة 2026-11-26) */
            message: 'تعذّر جلب البيانات',
          })
      })
    return () => {
      alive = false
    }
  }, [])

  return state
}

/* ---------- مساعدات قراءة حقول سجلات PGOS (حقولها متغيرة حسب النوع) ---------- */

export function txt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

export function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
}

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  })
}

export function fmtDay(iso: string | undefined | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ar-EG', { dateStyle: 'medium', timeZone: 'Africa/Cairo' })
}
