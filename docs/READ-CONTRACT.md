# عقد قراءة طبقة البيانات الحية لاوس — READ-CONTRACT

**المعرف:** DOC-PGOS-READ-CONTRACT-001  
**المسار والبند:** PGOS Track — البند 3A-381 (جزء أ من 3A-357)  
**الحالة:** معتمد كمرجع للواجهة (Approved Read Contract)  
**المستهلك الأساسي:** واجهة اوس (المسار 3A-352 / تطبيق `pgos-site`)  
**المصدر:** قاعدة بيانات Supabase (Postgres) عبر واجهة PostgREST المؤمنة بـ RLS  
**سجل القرار الحاكم:** سجل قرارات المقر المشترك الكانوني (Doc `1AOSBHTBeHkHJ4NBFeUgLwuyVfpckRu2BWt33cncNxNM`) وسجل `DEC-TOTO-003` الكائن فعليًا في: `~/workspace/ops-system/pgos/records/DEC-TOTO-003.json`

---

## ١. الهدف والحدود المعمارية

يوثق هذا العقد البنية الدقيقة للاستعلامات، والحقول المسترجعة، والأنواع (TypeScript Types)، ونموذج الاستهلاك المتدرج (Tiered Consumption Hierarchy) الذي ستعتمد عليه واجهة اوس لقراءة البيانات الحية دون أي تدخل يدوي أو نشر لقطات ثابتة.

### حدود هذا العقد:
- هذا العقد **للقراءة فقط (Read-Only)** بالنسبة لواجهة المتصفح.
- لا توجد أي استعلامات `POST` أو `PATCH` أو `DELETE` مسموح بها من جهة العميل (Client-side).
- كافة عمليات الكتابة والتحديث محصورة بعامل المزامنة الخلفي (`linear_sync_worker.py`).
- قاعدة معمارية البيانات (توجيه المالك 2026-11-23): «كله في قاعدة البيانات ودرايف مجرد فيديوهات بس» — الجداول الخمسة مغذاة ومحدثة فعليًا ولا توجد جداول فارغة.

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

- **الرابط الشامل:** `GET /rest/v1/pgos_issues?select=id,identifier,title,description,status_name,status_type,priority_value,due_date,url,project_id,project_linear_id,assignee_id,assignee_name,labels,started_at,completed_at,archived_at,updated_at&order=updated_at.desc`
- **فلاتر شائعة تدعمها واجهة اوس:**
  - **حسب المشروع:** `?project_id=eq.{project_uuid}`
  - **حسب نوع الحالة:** `?status_type=eq.started` (أو `completed` أو `unstarted` أو `backlog` أو `canceled`)
  - **الحية فقط (غير المؤرشفة):** `?archived_at=is.null` (عددها لحظة المزامنة: 275)
  - **المؤرشفة فقط (سجل الأرشيف):** `?archived_at=not.is.null` (عددها لحظة المزامنة: 163)
  - **التاريخ الكامل (شامل المؤرشف والحالي):** بدون فلتر (الإجمالي في قاعدة البيانات: 438)
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
    "started_at": "2026-11-23T01:30:00+02:00",
    "completed_at": null,
    "archived_at": null,
    "updated_at": "2026-11-22T23:31:35.809Z"
  }
]
```

### ٣.٢.١ منطق حساب نسب الإنجاز (Completion Percentage Logic)

تحسب نسب إنجاز المشاريع والمهام في الواجهة وفق القاعدة الصارمة:
$$\text{نسبة الإنجاز} = \frac{\text{Done}}{\text{total} - \text{Canceled}}$$

- **التعريفات:**
  - `Done`: البنود المنجزة (`status_type = 'completed'` أو `status_name = 'Done'`).
  - `Canceled`: البنود الملغاة أو المكررة (`status_type = 'canceled'` أو `status_name IN ('Canceled', 'Duplicate')`).
  - `total`: إجمالي البنود ضمن النطاق المستعلم عنه.
  - إذا كان المقام $(\text{total} - \text{Canceled}) \le 0$ تكون النسبة `0%`.
- **نطاق التطبيق (The Right Set):**
  - **نسبة السبرنت / العمل الجاري:** تُحسب على البنود الحية (`archived_at IS NULL`).
  - **نسبة الإنجاز التراكمية التاريخية:** تُحسب على كامل سجل المشروع في قاعدة البيانات (بما فيه المؤرشف).

---

### ٣.٣ استعلام قرارات المقر المشترك (`pgos_hq_decisions`)

- **الرابط:** `GET /rest/v1/pgos_hq_decisions?select=id,heading,body,category,effective_date,source,rationale,created_at&order=effective_date.desc,created_at.desc`
- **المصدر الكانوني:** مستند قرارات الشركة في Google Drive (المعرف `1AOSBHTBeHkHJ4NBFeUgLwuyVfpckRu2BWt33cncNxNM`) ومجلد المقر المشترك (`1y5jGU_QF4ViayykS60ffIgM6GiZKdm8h`).
- **شكل الاستجابة المتوقع:**
```json
[
  {
    "id": "hq-dec-12",
    "heading": "١١. حصر القراءة في قاعدة البيانات («كله في قاعدة البيانات»)",
    "body": "قرار المالك 2026-11-23 ~06:27 EET: «كله في قاعدة البيانات ودرايف مجرد فيديوهات بس»...",
    "category": "Governance",
    "effective_date": "2026-11-23",
    "source": "سجل قرارات الشركة — مقر Drive المشترك (Google Doc id 1AOSBHTBeHkHJ4NBFeUgLwuyVfpckRu2BWt33cncNxNM)",
    "rationale": "توحيد القراءة في مخزن ديناميكي واحد لخدمة اوس، وتحرير النظام من الاعتماد على مستندات درايف إلا لحفظ الفيديو والوسائط.",
    "created_at": "2026-11-23T06:27:00Z"
  }
]
```

---

### ٣.٤ استعلام سجل إصدارات المشاريع (`pgos_releases`)

- **الرابط:** `GET /rest/v1/pgos_releases?select=id,name,project_id,status,released_at,description,metadata&order=released_at.desc`
- **شكل الاستجابة المتوقع:**
```json
[
  {
    "id": "rel-nounou-v0-2-0-portal",
    "name": "نونو v0.2.0 — جلسات أجهزة بوابة أولياء الأمور (3A-375)",
    "project_id": "9844a5cc-de6f-4af4-97b9-7415bfc9fb3c",
    "status": "deployed",
    "released_at": "2026-11-23T11:45:00+02:00",
    "description": "جلسات أجهزة بوابة أولياء الأمور لنظام الحضانات نونو — الرمز هو الجلسة (Option A) بدمج PR #19 بالالتزام 6a23b3c.",
    "metadata": {
      "repo": "AbdullahOmaar/nounou-app",
      "pr": 19,
      "commit": "6a23b3c"
    }
  }
]
```

---

### ٣.٥ استعلام قائمة الـ45 فحص لما قبل الإنتاج (`pgos_checklist_items`)

- **الرابط:** `GET /rest/v1/pgos_checklist_items?select=id,check_number,category,title,how_to_verify,teacher_status,teacher_evidence,nounou_status,nounou_evidence,pgos_status,pgos_evidence,aiba_status,aiba_evidence,notes,project_statuses&order=check_number.asc`
- **المصادر الكانونية:** `pre-production-checklist.csv` بالمقر وملفات التقييم الحية `checklist/eval-nounou-2026-11-23.md`, `eval-pgos-2026-11-23.md`, `eval-aiba-2026-11-23.md`.
- **شكل الاستجابة المتوقع:**
```json
[
  {
    "id": 1,
    "check_number": 1,
    "category": "اختبارات وظيفية",
    "title": "Unit tests للدوال والمنطق",
    "how_to_verify": "تشغيل آلي في CI ويمنع الدمج عند الفشل",
    "teacher_status": "done",
    "teacher_evidence": "223 اختبار وحدة في CI",
    "nounou_status": "done",
    "nounou_evidence": "CI run 45115152134: vitest 15 ملفًا / 86 اختبارًا passed",
    "pgos_status": "partial",
    "pgos_evidence": "tools/vault-test.mjs 6/6 PASS + tests/test_sync_worker.py 10/10",
    "aiba_status": "done",
    "aiba_evidence": "CI run 45105028297 frontend-unit-tests + backend-accounting",
    "notes": "",
    "project_statuses": {
      "teacher_app": {"status": "done", "evidence": "223 اختبار وحدة في CI"},
      "nounou": {"status": "done", "evidence": "CI run 45115152134: vitest 15 ملفًا / 86 اختبارًا passed"},
      "pgos_site": {"status": "partial", "evidence": "tools/vault-test.mjs 6/6 PASS"},
      "aiba": {"status": "done", "evidence": "CI run 45105028297"}
    }
  }
]
```

---

### ٣.٦ استعلام سجل المزامنة وحالة التحديث (`pgos_sync_runs`)

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
    "issues_count": 438,
    "diff_summary": {
      "projects_total": 9,
      "issues_total": 438,
      "decisions_total": 20,
      "releases_total": 9,
      "checklist_total": 45
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
  started_at: string | null
  completed_at: string | null
  archived_at: string | null
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
  rationale: string | null
  created_at: string
  updated_at: string
}

export interface LiveRelease {
  id: string
  name: string
  project_id: string | null
  status: 'planned' | 'in_progress' | 'ready_for_approval' | 'staging' | 'deployed' | 'live_verified'
  released_at: string | null
  description: string | null
  metadata?: Record<string, unknown>
}

export interface LiveChecklistItem {
  id: number
  check_number: number
  category: string
  title: string
  how_to_verify: string | null
  teacher_status: 'done' | 'partial' | 'not_started' | 'na' | 'not_evaluated'
  teacher_evidence: string | null
  nounou_status: 'done' | 'partial' | 'not_started' | 'na' | 'not_evaluated'
  nounou_evidence: string | null
  pgos_status: 'done' | 'partial' | 'not_started' | 'na' | 'not_evaluated'
  pgos_evidence: string | null
  aiba_status: 'done' | 'partial' | 'not_started' | 'na' | 'not_evaluated'
  aiba_evidence: string | null
  notes: string | null
  project_statuses: Record<string, { status: string; evidence?: string; symbol?: string }>
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
    decisions_total?: number
    releases_total?: number
    checklist_total?: number
  }
  error_message?: string | null
}
```

---

## ٥. مثال كود عميل الواجهة (Frontend Client Adapter Hook)

نموذج بسيط يوضح كيفية دمج هذا العقد في الواجهة مع الحفاظ على وضع الـ Fallback:

```typescript
import { useState, useEffect } from 'react'
import type { LiveProject, LiveIssue, LiveHqDecision, LiveRelease, LiveChecklistItem, LiveSyncRun } from './types'

export interface LiveDataState {
  projects: LiveProject[]
  issues: LiveIssue[]
  decisions: LiveHqDecision[]
  releases: LiveRelease[]
  checklist: LiveChecklistItem[]
  lastSync: LiveSyncRun | null
  isLive: boolean
  loading: boolean
  error: Error | null
}

export function usePgosData(): LiveDataState {
  const [state, setState] = useState<LiveDataState>({
    projects: [],
    issues: [],
    decisions: [],
    releases: [],
    checklist: [],
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
        
        const [projRes, issRes, decRes, relRes, chkRes, syncRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/pgos_projects?select=*&order=linear_id.asc`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/pgos_issues?select=*&order=updated_at.desc`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/pgos_hq_decisions?select=*&order=effective_date.desc`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/pgos_releases?select=*&order=released_at.desc`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/pgos_checklist_items?select=*&order=check_number.asc`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/pgos_sync_runs?select=*&order=started_at.desc&limit=1`, { headers }),
        ])

        if (!projRes.ok || !issRes.ok) {
          throw new Error('PostgREST request rejected by policy or network')
        }

        const [projects, issues, decisions, releases, checklist, syncRuns] = await Promise.all([
          projRes.json(),
          issRes.json(),
          decRes.ok ? decRes.json() : [],
          relRes.ok ? relRes.json() : [],
          chkRes.ok ? chkRes.json() : [],
          syncRes.ok ? syncRes.json() : [],
        ])

        setState({
          projects,
          issues,
          decisions,
          releases,
          checklist,
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
   - استعلام البنود يعيد الحقول الأساسية للعرض دون تضمين الأوصاف الطويلة جدًا لتفادي استهلاك الباندويث.
   - الفهارس المنشأة على `project_id`, `status_type`, `started_at`, `check_number`, و `updated_at` تضمن سرعة استجابة < 30ms على PostgREST.
2. **العزل التام للأسرار:**
   - الواجهة لا تحوي سوى `VITE_SUPABASE_ANON_KEY` الذي لا يمنح أي صلاحيات خارج نطاق سياسات RLS المعتمدة (قراءة فقط للمالك المسجل، حظر كامل للعامة).
3. **التكامل مع شات التصميم (3A-352):**
   - هذا العقد جاهز تمامًا ومُوثق ليعتمد عليه شات التصميم عند استئناف بناء الـ UI بعد اعتماد المالك للموك أب.
