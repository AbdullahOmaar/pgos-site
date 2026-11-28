import type { Department, Employee, OfficeData } from './types'

/*
 * محرك التخطيط — دالة صافية: بيانات ← مواقع.
 * الغرف بتترتب في حلقة حوالين ساحة مركزية، وحجم كل غرفة بيتحسب من عدد
 * موظفي قسمها. إضافة قسم جديد بتكبّر الحلقة وكل الغرف بتعيد ترتيب نفسها،
 * وإضافة موظف بتكبّر غرفة قسمه — من غير أي تدخل في كود العرض.
 */

export interface DeskLayout {
  employee: Employee
  /** إحداثيات محلية جوه الغرفة (الأمام = +z باتجاه الساحة) */
  x: number
  z: number
}

export interface RoomLayout {
  department: Department
  /** مركز الغرفة في إحداثيات العالم */
  cx: number
  cz: number
  /** دوران الغرفة بحيث وشّها (+z المحلي) يبص على الساحة */
  rotationY: number
  width: number
  depth: number
  desks: DeskLayout[]
}

export interface OfficeLayout {
  rooms: RoomLayout[]
  plazaRadius: number
  ringRadius: number
  /** نصف قطر المنصة الكلية (لضبط الكاميرا والأرضية) */
  extent: number
}

/* مقاسات وحدة المكتب (متر افتراضي) — اتوسّعت في جولة دمج الشخصيات:
 * محطة Kenney + شخصية حقيقية ١٫٨م محتاجين عمق وعرض أكبر من الدمى القديمة */
const DESK_CELL_W = 2.2
const DESK_CELL_D = 2.05
const ROOM_PAD_X = 0.9
const ROOM_FRONT_PAD = 1.0
const ROOM_BACK_PAD = 0.8
const ROOM_GAP_ARC = 1.4
const MIN_PLAZA_RADIUS = 5.2

function roomFootprint(count: number): { width: number; depth: number; cols: number; rows: number } {
  const n = Math.max(count, 1)
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.35)))
  const rows = Math.max(1, Math.ceil(n / cols))
  return {
    cols,
    rows,
    width: cols * DESK_CELL_W + ROOM_PAD_X * 2,
    depth: rows * DESK_CELL_D + ROOM_FRONT_PAD + ROOM_BACK_PAD,
  }
}

export function computeLayout(data: OfficeData): OfficeLayout {
  const byDept = new Map<string, Employee[]>()
  for (const d of data.departments) byDept.set(d.id, [])
  for (const e of data.employees) {
    const list = byDept.get(e.department_id)
    if (list) list.push(e)
  }
  for (const list of byDept.values()) list.sort((a, b) => a.desk - b.desk)

  const specs = data.departments.map((department) => {
    const employees = byDept.get(department.id) ?? []
    const fp = roomFootprint(employees.length)
    return { department, employees, ...fp }
  })

  const maxDepth = Math.max(...specs.map((s) => s.depth), 3)
  /* نصف قطر الحلقة: بنكبّره لحد ما مجموع العروض الزاوية للغرف يلائم ٢π */
  let ring = MIN_PLAZA_RADIUS + 2.4 + maxDepth / 2
  for (let i = 0; i < 24; i++) {
    const total = specs.reduce(
      (sum, s) => sum + 2 * Math.atan((s.width / 2 + ROOM_GAP_ARC / 2) / ring),
      0,
    )
    if (total <= Math.PI * 2 - 0.04) break
    ring += 1.6
  }

  let angle = -Math.PI / 2
  const rooms: RoomLayout[] = specs.map((s) => {
    const half = Math.atan((s.width / 2 + ROOM_GAP_ARC / 2) / ring)
    const centerAngle = angle + half
    angle += half * 2
    const cx = ring * Math.cos(centerAngle)
    const cz = ring * Math.sin(centerAngle)
    const rotationY = Math.atan2(-cx, -cz)
    const desks: DeskLayout[] = s.employees.map((employee, i) => {
      const col = i % s.cols
      const row = Math.floor(i / s.cols)
      return {
        employee,
        x: (col - (s.cols - 1) / 2) * DESK_CELL_W,
        z: -s.depth / 2 + ROOM_FRONT_PAD + row * DESK_CELL_D + DESK_CELL_D / 2,
      }
    })
    return { department: s.department, cx, cz, rotationY, width: s.width, depth: s.depth, desks }
  })

  const plazaRadius = Math.max(MIN_PLAZA_RADIUS, ring - maxDepth / 2 - 2.3)
  const extent = ring + Math.max(...specs.map((s) => Math.max(s.width, s.depth)), 3) / 2 + 1.6
  return { rooms, plazaRadius, ringRadius: ring, extent }
}
