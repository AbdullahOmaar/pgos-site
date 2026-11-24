/*
 * طبقة بيانات المقر الافتراضي — منفصلة تمامًا عن العرض.
 * الشكل مطابق لمخطط الداتابيز المخطط لاوس (pgos_departments / pgos_employees):
 * المشهد ثلاثي الأبعاد بيتبني من البيانات دي بس، ومفيش أي اسم أو هيكل
 * محروق في مكوّنات العرض — أي تعديل هنا (إضافة/حذف/نقل/تغيير حالة)
 * لازم ينعكس في المشهد من غير لمس كود العرض.
 */

export type EmployeeStatus = 'working' | 'idle' | 'offline'

export interface Department {
  id: string
  name: string
  /** لون تمييز الغرفة (شريط الإضاءة + شارة الاسم) */
  color: string
}

export interface Employee {
  id: string
  name: string
  role: string
  department_id: string
  /** رقم المكتب جوه قسمه — ترتيب الجلوس في الغرفة */
  desk: number
  status: EmployeeStatus
  tools: string[]
  current_task?: string
  tasks_open?: number
  projects?: number
  rating?: number
}

export interface OfficeData {
  departments: Department[]
  employees: Employee[]
}

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  working: 'شغال الآن',
  idle: 'خامل — الطابور فاضي',
  offline: 'غير متصل',
}
