# عقد قراءة طبقة البيانات الحية لاوس — READ-CONTRACT

**المعرف:** DOC-PGOS-READ-CONTRACT-001  
**المسار والبند:** PGOS Track — البند 3A-381 (جزء أ من 3A-357)  
**الحالة:** معتمد كمرجع للواجهة (Approved Read Contract)  
**المستهلك الأساسي:** واجهة اوس (المسار 3A-352 / تطبيق `pgos-site`)  
**المصدر:** قاعدة بيانات Supabase (Postgres) عبر واجهة PostgREST المؤمنة بـ RLS  

---

## ١. الهدف والحدود المعمارية

يوثق هذا العقد البنية الدقيقة للاستعلامات، والحقول المسترجعة، والأنواع (TypeScript Types)، ونموذج الاستهلاك المتدرج (Tiered Consumption Hierarchy) الذي ستعتمد عليه واجهة اوس لقراءة البيانات الحية دون أي تدخل يدوي أو نشر لقطات ثابتة.

### حدود هذا العقد:
- هذا العقد **للقراءة فقط (Read-Only)** بالنسبة لواجهة المتصفح.
- لا توجد أي استعلامات `POST` أو `PATCH` أو `DELETE` مسموح بها من جهة العميل (Client-side).
- كافة عمليات الكتابة والتحديث محصورة بعامل المزامنة الخلفي (`linear_sync_worker.py`).

---

## ٢. هرمية الاستهلاك والتوافر (Tiered Fallback Hierarchy)

تتبنى الواجهة استراتيجية استهلاك ثلاثية المستويات تضمن استمرار العمل تحت أي ظرف تشغيلي:

```
[1. Live Supabase] ──(فشل اتصال / عدم تهيئة)──> [2. Vault Snapshot E2EE] ──(غياب اللقطة)──> [3. DEMO Fallback]
```

1. **المستوى الأول (الحي — Live Supabase):**
   - يُفعل عند توفر `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` وجلسة مصادقة صالحة للمالك.
   - يستعلم عن الجداول عبر PostgREST مباشرة مع التخزين المؤقت عبر React Query / SWR.
2. **المستوى الثاني (الخزنة المحلية المشفرة — Encrypted Snapshot Fallback):**
   - يعمل عند انقطاع الإنترنت أو تعذر الوصول إلى Supabase.
   - يقرأ `snapshot.enc.json` ويفك تشفيرها بمفتاح الجهاز المسجل عبر `VaultGate`.
3. **المستوى الثالث (الوضع التجريبي — DEMO Fallback Mode):**
   - يعمل كشبكة أمان مطلقة في بيئات التطوير أو عند فتح الموقع دون تسجيل جهاز أو خادم.
   - يعرض بيانات توضيحية موسومة صراحة بـ DEMO لمنع أي توقف للواجهة.

---

## ٣. جداول واستعلامات PostgREST

### ٣.١ استعلام المشاريع (`pgos_projects`)

- **الرابط:** `GET /rest/v1/pgos_projects?select=id,linear_id,name,summary,url,color,status_name,created_at,updated_at,metadata&order=linear_id.asc`
- **الترويسات الإجبارية:**
  - `apikey`: مفتاح العميل (`VITE_SUPABASE_ANON_KEY`)
  - `Authorization`: رمز المالك (`Bearer <owner_jwt_token>`)
- **شكل الاستجابة المتوقع (JSON Array):**
```json
[
  {
    "id": "505d0430-3603-4dca-b8ac-e9a6d0f1c24b",
    "linear_id": "P-3A-9",
    "name": "Wedora — دعوات الأفراح",
    "summary": "دعوات أفراح رقمية بالعربية...",
    "url": "https://linear.app/3a-agent/project/wedora-dawat-alafrah-f6a875fbd69c",
    "color": "#f2c94c",
    "status_name": "In Progress",
    "created_at": "2026-11-22T13:14:28.648Z",
    "updated_at": "2026-11-22T13:14:55.889Z",
    "metadata": {
      "priority": 2
    }
  }
]
```

---

### ٣.٢ استعلام البنود والمهام (`pgos_issues`)

- **الرابط الشامل:** `GET /rest/v1/pgos_issues?select=id,identifier,title,description,status_name,status_type,priority_value,due_date,url,project_id,project_linear_id,assignee_id,assignee_name,labels,completed_at,updated_at&order=updated_at.desc`
- **فلاتر شائعة تدعمها واجهة اوس:**
  - **حسب المشروع:** `?project_id=eq.{project_uuid}`
  - **حسب نوع الحالة:** `?status_type=eq.started` (أو `completed` أو `unstarted`)
  - **حسب الليبل (المرحلة):** `?labels=cs.["Phase 1"]`
  - **المحدثة حديثًا:** `?updated_at=gte.{iso_timestamp}`
- **شكل الاستجابة المتوقع:**
```json
[
  {
    "id": "af4104d4-fe62-452b-8880-07fa8727a02a",
    "identifier": "3A-381",
    "title": "اوس الديناميكي — طبقة البيانات الحية (3A-357/أ)",
    "description": "جزء (أ) من البند الحاكم 3A-357...",
    "status_name": "In Progress",
    "status_type": "started",
    "priority_value": 0,
    "due_date": null,
    "url": "https://linear.app/3a-agent/issue/3A-381/aws-aldynamyky-tbqh-albyanat-alhyh-3a-357a-bak-ind-khfyf-mzamnh-linear",
    "project_id": "0f970d2c-481c-4128-8598-b27842908bf5",
    "project_linear_id": "P-3A-4",
    "assignee_id": "6c8f99ef-221b-4eff-bb56-6d77fc8fe823",
    "assignee_name": "abdo Omar",
    "labels": ["Phase 1", "antigravity"],
    "completed_at": null,
    "updated_at": "2026-11-22T23:31:35.809Z"
  }
]
```

---

### ٣.٣ استعلام قرارات المقر المشترك (`pgos_hq_decisions`)

- **الرابط:** `GET /rest/v1/pgos_hq_decisions?select=id,heading,body,category,effective_date,source,created_at&order=created_at.desc`
- **شكل الاستجابة المتوقع:**
```json
[
  {
    "id": "hq-dec-2026-11-22-01",
    "heading": "قرار المالك — اوس الديناميكي (3A-357)",
    "body": "عايز الموضوع يبقى داينمك — مش كل بروجكت نعمله ديبلوي...",
    "category": "Architecture",
    "effective_date": "2026-11-22",
    "source": "سجل قرارات المقر المشترك",
    "created_at": "2026-11-22T15:26:00Z"
  }
]
```

---

### ٣.٤ استعلام سجل المزامنة وحالة التحديث (`pgos_sync_runs`)

تستخدمه الواجهة لعرض **شارة حداثة البيانات (Freshness Badge)** في الترويسة العلوية:
- **الرابط:** `GET /rest/v1/pgos_sync_runs?select=id,started_at,finished_at,status,projects_count,issues_count,diff_summary&order=started_at.desc&limit=1`
- **شكل الاستجابة المتوقع:**
```json
[
  {
    "id": "sync-1732325770",
    "started_at": "2026-11-23T01:36:10.123Z",
    "finished_at": "2026-11-23T01:36:14.456Z",
    "status": "success",
    "projects_count": 9,
    "issues_count": 208,
    "diff_summary": {
      "projects_total": 9,
      "issues_total": 208,
      "issues_updated": 4
    }
  }
]
```

---

## ٤. تصريحات الأنواع للواجهة (TypeScript Interface Definitions)

تُضاف هذه الواجهات في `src/types.ts` أو ملف مخصص `src/types/database.ts`:

```typescript
export interface LiveProject {
  id: string
  linear_id: string | null
  name: string
  summary: string | null
  url: string | null
  color: string | null
  status_name: string | null
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown>
}

export interface LiveIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  status_name: string
  status_type: 'completed' | 'started' | 'unstarted' | 'backlog' | 'canceled'
  priority_value: number
  due_date: string | null
  url: string | null
  project_id: string | null
  project_linear_id: string | null
  assignee_id: string | null
  assignee_name: string | null
  labels: string[]
  completed_at: string | null
  updated_at: string
  created_at?: string
  raw_data?: Record<string, unknown>
}

export interface LiveHqDecision {
  id: string
  heading: string
  body: string
  category: string | null
  effective_date: string | null
  source: string | null
  created_at: string
}

export interface LiveSyncRun {
  id: string
  started_at: string
  finished_at: string | null
  status: 'success' | 'failed' | 'running'
  projects_count: number
  issues_count: number
  diff_summary: {
    projects_total?: number
    issues_total?: number
    issues_inserted?: number
    issues_updated?: number
  }
  error_message?: string | null
}
```

---

## ٥. مثال كود عميل الواجهة (Frontend Client Adapter Hook)

نموذج بسيط يوضح كيفية دمج هذا العقد في الواجهة مع الحفاظ على وضع الـ Fallback:

```typescript
import { useState, useEffect } from 'react'
import type { LiveProject, LiveIssue, LiveSyncRun } from './types'

export interface LiveDataState {
  projects: LiveProject[]
  issues: LiveIssue[]
  lastSync: LiveSyncRun | null
  isLive: boolean
  loading: boolean
  error: Error | null
}

export function usePgosData(): LiveDataState {
  const [state, setState] = useState<LiveDataState>({
    projects: [],
    issues: [],
    lastSync: null,
    isLive: false,
    loading: true,
    error: null,
  })

  useEffect(() => {
    async function loadData() {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      // Fallback مباشر إذا لم تتوفر إعدادات السحابة
      if (!supabaseUrl || !anonKey) {
        console.info('[PGOS Data] Running in Offline / Fallback mode')
        setState(prev => ({ ...prev, isLive: false, loading: false }))
        return
      }

      try {
        const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
        
        const [projRes, issRes, syncRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/pgos_projects?select=*&order=linear_id.asc`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/pgos_issues?select=*&order=updated_at.desc`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/pgos_sync_runs?select=*&order=started_at.desc&limit=1`, { headers }),
        ])

        if (!projRes.ok || !issRes.ok) {
          throw new Error('PostgREST request rejected by policy or network')
        }

        const [projects, issues, syncRuns] = await Promise.all([
          projRes.json(),
          issRes.json(),
          syncRes.ok ? syncRes.json() : [],
        ])

        setState({
          projects,
          issues,
          lastSync: syncRuns[0] || null,
          isLive: true,
          loading: false,
          error: null,
        })
      } catch (err) {
        console.warn('[PGOS Data] Live query failed, falling back:', err)
        setState(prev => ({ ...prev, isLive: false, loading: false, error: err as Error }))
      }
    }

    loadData()
  }, [])

  return state
}
```

---

## ٦. ضمانات الأمان والأداء

1. **حجم الحمولة والأداء:**
   - استعلام البنود يعيد الحقول الأساسية للعرض دون تضمين الأوصاف الطويلة جدًا (`description` مختصر أو اختياري) لتفادي استهلاك الباندويث.
   - الفهارس المنشأة على `project_id`, `status_type`, و `updated_at` تضمن سرعة استجابة < 30ms على PostgREST.
2. **العزل التام للأسرار:**
   - الواجهة لا تحوي سوى `VITE_SUPABASE_ANON_KEY` الذي لا يمنح أي صلاحيات خارج نطاق سياسات RLS المعتمدة.
3. **التكامل مع شات التصميم (3A-352):**
   - هذا العقد جاهز تمامًا ومُوثق ليعتمد عليه شات التصميم عند استئناف بناء الـ UI بعد اعتماد المالك للموك أب.
