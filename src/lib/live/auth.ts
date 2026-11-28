/*
 * جلسة القراءة الموثّقة (G1 — قرار مدير 2026-11-25 على P3):
 * الدخول بحساب المالك الحالي في teacher-app (abdullahomarrefaat@gmail.com) —
 * لا حساب جديد ولا كلمة مرور جديدة. الجلسة تعيش في localStorage على جهاز المالك فقط،
 * والمحوّل الحي يرسل توكن الجلسة بدل مفتاح anon؛ بلا جلسة تسقط القراءة على اللقطة.
 * بعد دخول ناجح تُعاد تحميل الصفحة عمدًا (سلوك v1) ليعيد المزوّد محاولة الحي بالجلسة الجديدة.
 */

export interface LiveSession {
  access_token: string
  refresh_token: string
  expires_at: number // epoch seconds
  email: string
}

const KEY = 'pgos-live-session-v1'

function env(name: string): string | undefined {
  return import.meta.env[name] as string | undefined
}

export function liveAuthConfigured(): boolean {
  return Boolean(env('VITE_SUPABASE_URL') && env('VITE_SUPABASE_ANON_KEY'))
}

export function getSession(): LiveSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as LiveSession
    if (!s.access_token || !s.refresh_token || !s.expires_at) return null
    return s
  } catch {
    return null
  }
}

function saveSession(s: LiveSession): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearSession(): void {
  localStorage.removeItem(KEY)
}

function sessionValid(s: LiveSession): boolean {
  return s.expires_at * 1000 > Date.now() + 60_000
}

async function tokenRequest(body: Record<string, string>): Promise<LiveSession> {
  const base = env('VITE_SUPABASE_URL')
  const key = env('VITE_SUPABASE_ANON_KEY')
  if (!base || !key) throw new Error('live-not-configured')
  const res = await fetch(`${base}/auth/v1/token?grant_type=${body.grant_type}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `auth HTTP ${res.status}`
    try {
      const j = (await res.json()) as { error_description?: string; msg?: string }
      msg = j.error_description ?? j.msg ?? msg
    } catch {
      /* keep status message */
    }
    throw new Error(msg)
  }
  const j = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    user?: { email?: string }
  }
  const session: LiveSession = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
    email: j.user?.email ?? '',
  }
  saveSession(session)
  return session
}

export async function signIn(email: string, password: string): Promise<LiveSession> {
  return tokenRequest({ grant_type: 'password', email: email.trim(), password })
}

/** يجدّد الجلسة إن انتهت؛ يرجع null (ويمسح الجلسة) إن تعذّر التجديد — المتصل يسقط على اللقطة. */
export async function ensureFreshSession(): Promise<LiveSession | null> {
  const s = getSession()
  if (!s) return null
  if (sessionValid(s)) return s
  try {
    return await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh_token })
  } catch {
    clearSession()
    return null
  }
}

/** ترويسات PostgREST: توكن الجلسة إن وُجد، وإلا مفتاح anon (سيفشل بـ401 فيسقط على اللقطة). */
export function authHeaders(): { apikey: string; Authorization: string } {
  const key = (env('VITE_SUPABASE_ANON_KEY') ?? '') as string
  const s = getSession()
  return { apikey: key, Authorization: `Bearer ${s?.access_token ?? key}` }
}
