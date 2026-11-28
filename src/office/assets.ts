import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js'

/*
 * أصول المقر ثلاثية الأبعاد — شخصيات Quaternius UBC (ترخيص Quaternius:
 * استخدام تجاري داخل منتج، بلا إعادة توزيع للأصول الخام) + أثاث Kenney
 * Furniture Kit (CC0). بتتحمل مرة واحدة وبتتخزن، والمشهد بيستنسخ منها.
 *
 * الملابس مرسومة على تكسشر الجسم نفسه (paint_clothes.py في مجلد التصميم):
 * ٦ نسخ لكل جسم بقمصان وبنطلونات وألوان بشرة متنوعة — فمفيش قطع قماش
 * مركبة على الجسم ولا رقع جلد باينة في مناطق الملابس.
 */

const BASE = '/office-assets'

export interface OfficeAssets {
  male: THREE.Group
  female: THREE.Group
  hairShort: THREE.Group
  hairLong: THREE.Group
  maleVariants: THREE.Texture[]
  femaleVariants: THREE.Texture[]
  kenney: Record<KenneyName, THREE.Group>
  lampLit: THREE.Material
  lampOff: THREE.Material
}

type KenneyName =
  | 'desk' | 'chair' | 'screen' | 'keyboard' | 'mouse'
  | 'lamp' | 'plant' | 'bookcase' | 'pottedPlant'

const KENNEY_FILES: Record<KenneyName, string> = {
  desk: 'desk.glb',
  chair: 'chairDesk.glb',
  screen: 'computerScreen.glb',
  keyboard: 'computerKeyboard.glb',
  mouse: 'computerMouse.glb',
  lamp: 'lampSquareTable.glb',
  plant: 'plantSmall1.glb',
  bookcase: 'bookcaseOpenLow.glb',
  pottedPlant: 'pottedPlant.glb',
}

/** مقاس موحّد لقطع Kenney في عالمنا (نفس معايرة الإثبات العملي) */
const KENNEY_SCALE: Record<KenneyName, number> = {
  desk: 2, chair: 2, screen: 1.6, keyboard: 2, mouse: 2,
  lamp: 2, plant: 2, bookcase: 2.4, pottedPlant: 2,
}

/*
 * إعادة تلوين Kenney لهوية 3A — الخامات ألوان سادة باسمها في الملف:
 * قماش الكرسي الوردي (carpet) ← نيلي البراند، والخشب الفاتح الباهت
 * ← خشب دافئ أعمق، والمعدن المتوسط ← رمادي مزرقّ هادي.
 */
const KENNEY_RECOLOR: Record<string, { color: number; roughness?: number }> = {
  carpet: { color: 0x3b3fa3, roughness: 0.92 },
  wood: { color: 0xbb8c5c },
  woodDark: { color: 0x8a6844 },
  metalMedium: { color: 0x5d7183 },
}

function prepareKenney(scene: THREE.Group, name: KenneyName): THREE.Group {
  const inner = scene
  inner.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true
      c.receiveShadow = true
      const wasArray = Array.isArray(c.material)
      const mats = wasArray ? (c.material as THREE.Material[]) : [c.material as THREE.Material]
      const next = mats.map((m) => {
        const std = m as THREE.MeshStandardMaterial
        const rule = KENNEY_RECOLOR[std.name]
        if (!rule) return m
        const cloned = std.clone()
        cloned.color.set(rule.color)
        if (rule.roughness !== undefined) cloned.roughness = rule.roughness
        return cloned
      })
      c.material = wasArray ? next : next[0]
    }
  })
  // توسيط أفقي + قاعدة على الأرض + تكبير موحّد (معايرة الإثبات)
  const b = new THREE.Box3().setFromObject(inner)
  const center = b.getCenter(new THREE.Vector3())
  inner.position.set(-center.x, -b.min.y, -center.z)
  const outer = new THREE.Group()
  outer.add(inner)
  outer.scale.setScalar(KENNEY_SCALE[name])
  outer.userData.size = new THREE.Vector3(
    (b.max.x - b.min.x) * KENNEY_SCALE[name],
    (b.max.y - b.min.y) * KENNEY_SCALE[name],
    (b.max.z - b.min.z) * KENNEY_SCALE[name],
  )
  return outer
}

/* ---------- أدوات الهيكل العظمي (تقنية الإثبات العملي — مثبتة) ---------- */

function findBones(root: THREE.Object3D): Map<string, THREE.Object3D & { userData: Record<string, unknown> }> {
  const map = new Map()
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) map.set(o.name.toLowerCase(), o)
  })
  return map
}

function bone(map: Map<string, THREE.Object3D>, ...patterns: string[]) {
  for (const p of patterns) {
    for (const [name, b] of map) if (name.includes(p)) return b
  }
  return null
}

const D = Math.PI / 180
const _e = new THREE.Euler()
const _q = new THREE.Quaternion()
/** دوران نسبي فوق وضع الراحة الأصلي للعظمة (ممنوع الكتابة فوق راحة هيكل UE) */
export function rotBone(b: THREE.Object3D | null, x = 0, y = 0, z = 0) {
  if (!b) return
  const ud = b.userData as { restQ?: THREE.Quaternion }
  if (!ud.restQ) ud.restQ = b.quaternion.clone()
  _e.set(x * D, y * D, z * D)
  _q.setFromEuler(_e)
  b.quaternion.copy(ud.restQ).multiply(_q)
}

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _pq = new THREE.Quaternion()
const _wq = new THREE.Quaternion()
const _dq = new THREE.Quaternion()
/** توجيه عظمة نحو اتجاه مستهدف في إطار الشخصية المحلي (قدّام +Z، فوق +Y) */
function aimBone(
  root: THREE.Object3D,
  group: THREE.Object3D,
  namePatterns: string[],
  childPatterns: string[] | null,
  dirLocal: THREE.Vector3,
) {
  const m = findBones(root)
  const b = bone(m, ...namePatterns)
  if (!b) return
  const child = childPatterns
    ? bone(m, ...childPatterns)
    : b.children.find((c) => (c as THREE.Bone).isBone)
  if (!child) return
  group.updateMatrixWorld(true)
  b.getWorldPosition(_v1)
  child.getWorldPosition(_v2)
  const cur = _v2.sub(_v1).normalize().clone()
  const target = dirLocal.clone().normalize()
  group.getWorldQuaternion(_pq)
  target.applyQuaternion(_pq)
  _dq.setFromUnitVectors(cur, target)
  b.parent!.getWorldQuaternion(_pq)
  b.getWorldQuaternion(_wq)
  const newWorld = _dq.clone().multiply(_wq)
  b.quaternion.copy(_pq.invert().multiply(newWorld))
  group.updateMatrixWorld(true)
}

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

interface BobTarget {
  bone: THREE.Object3D
  baseX: number
  amp: number
  speed: number
}

export interface CharacterRig {
  group: THREE.Group
  /** حركة تنفس/كتابة خفيفة للشغالين — بتتنادى من حلقة المشهد */
  animate?: (t: number) => void
}

export interface CharacterOpts {
  body: 'male' | 'female'
  /** رقم نسخة الملابس/البشرة (0..5) */
  variant: number
  hairColor: number
  mode: 'work' | 'idle' | 'stand'
  /** ذراع مرفوعة — بيشرح (لشخصيات الساحة الواقفة) */
  present?: boolean
  /** ارتفاع الحوض المستهدف عند الجلوس (بوحدات وليّ الشخصية) */
  seatY?: number
}

const HAIR_MATS = ['mi_hair']
function isHairMaterial(m: THREE.Material) {
  const n = (m.name ?? '').toLowerCase()
  return HAIR_MATS.some((p) => n.includes(p))
}
function isBodyMaterial(m: THREE.Material) {
  return (m.name ?? '').toLowerCase().includes('superhero')
}

/** وضعية الجلوس: أرجل ودراعات بتتوجه هندسيًا، وعمود وراس بدورانات نسبية */
function poseSeated(parts: THREE.Object3D[], group: THREE.Group, mode: 'work' | 'idle', bob: BobTarget[]) {
  const body = parts[0]
  const work = mode === 'work'
  for (const s of ['l', 'r']) {
    aimBone(body, group, [`thigh_${s}`], [`calf_${s}`], V3(0, -0.1, 1))
    aimBone(body, group, [`calf_${s}`], [`foot_${s}`], V3(0, -1, 0.1))
    aimBone(body, group, [`foot_${s}`], [`ball_${s}`], V3(0, -0.12, 1))
  }
  for (const s of ['l', 'r']) {
    const out = s === 'l' ? 0.16 : -0.16
    aimBone(body, group, [`upperarm_${s}`], [`lowerarm_${s}`],
      work ? V3(out, -0.82, 0.52) : V3(out * 1.4, -0.5, 0.85))
    aimBone(body, group, [`lowerarm_${s}`], [`hand_${s}`],
      work ? V3(-out * 0.35, -0.02, 1) : V3(-out * 0.3, -0.3, 1))
  }
  const angles = work
    ? { s1: 6, s2: 5, s3: 4, neck: -3, head: 8 }
    : { s1: 26, s2: 22, s3: 16, neck: 8, head: 24 }
  for (const root of parts) {
    const m = findBones(root)
    rotBone(bone(m, 'spine_01', 'spine1'), angles.s1, 0, 0)
    rotBone(bone(m, 'spine_02', 'spine2'), angles.s2, 0, 0)
    rotBone(bone(m, 'spine_03', 'spine3'), angles.s3, 0, 0)
    rotBone(bone(m, 'neck_01', 'neck'), angles.neck, 0, 0)
    rotBone(bone(m, 'head'), angles.head, 0, angles.head === 24 ? 5 : 0)
  }
  if (work) {
    const m = findBones(body)
    const s2 = bone(m, 'spine_02', 'spine2')
    const head = bone(m, 'head')
    if (s2) bob.push({ bone: s2, baseX: angles.s2, amp: 1.1, speed: 2.05 })
    if (head) bob.push({ bone: head, baseX: angles.head, amp: 0.9, speed: 1.55 })
  }
}

/** وضعية الوقوف: دراعات نازلة جنب الجسم بدل وضع الراحة المفتوح */
function poseStanding(parts: THREE.Object3D[], group: THREE.Group, present: boolean) {
  const body = parts[0]
  for (const s of ['l', 'r']) {
    const out = s === 'l' ? 0.24 : -0.24
    if (present && s === 'r') {
      // ذراع يمنى مرفوعة لقدام — بيشرح
      aimBone(body, group, [`upperarm_${s}`], [`lowerarm_${s}`], V3(-0.45, 0.3, 0.85))
      aimBone(body, group, [`lowerarm_${s}`], [`hand_${s}`], V3(-0.2, 0.55, 0.75))
    } else {
      aimBone(body, group, [`upperarm_${s}`], [`lowerarm_${s}`], V3(out, -1, 0.07))
      aimBone(body, group, [`lowerarm_${s}`], [`hand_${s}`], V3(out * 0.5, -1, 0.22))
    }
  }
}

/** قعدة الشخصية: بننزّل الحوض من ارتفاع الوقوف لمستوى القعدة المستهدف */
function seatCharacter(group: THREE.Group, parts: THREE.Object3D[], seatY: number) {
  group.updateWorldMatrix(true, true)
  let pelvis: THREE.Object3D | null = null
  for (const root of parts) {
    pelvis = bone(findBones(root), 'pelvis', 'hips')
    if (pelvis) break
  }
  if (!pelvis) return
  const p = new THREE.Vector3()
  pelvis.getWorldPosition(p)
  // بنحوّل فرق العالم لفرق محلي عند وليّ المجموعة (مقياس الوليّ ١ عندنا)
  group.position.y += seatY - p.y
  group.updateMatrixWorld(true)
}

/* ---------- التحميل والتخزين ---------- */

let cache: Promise<OfficeAssets> | null = null

export function loadOfficeAssets(): Promise<OfficeAssets> {
  if (!cache) cache = doLoad()
  return cache
}

async function doLoad(): Promise<OfficeAssets> {
  const loader = new GLTFLoader()
  const texLoader = new THREE.TextureLoader()
  const load = (p: string) => loader.loadAsync(p)
  const loadTex = (p: string) => {
    const t = texLoader.load(p)
    t.colorSpace = THREE.SRGBColorSpace
    t.flipY = false // اتفاق glTF — نفس اتفاق تكسشرز النماذج المحمّلة
    t.anisotropy = 4
    return t
  }

  const [male, female, hairShort, hairLong] = await Promise.all([
    load(`${BASE}/ubc/Superhero_Male_FullBody.gltf`),
    load(`${BASE}/ubc/Superhero_Female_FullBody.gltf`),
    load(`${BASE}/ubc/Hair_SimpleParted.gltf`),
    load(`${BASE}/ubc/Hair_Long.gltf`),
  ])

  const kenneyScenes = await Promise.all(
    (Object.keys(KENNEY_FILES) as KenneyName[]).map(async (name) => {
      const g = await load(`${BASE}/kenney/${KENNEY_FILES[name]}`)
      return [name, prepareKenney(g.scene, name)] as const
    }),
  )
  const kenney = Object.fromEntries(kenneyScenes) as Record<KenneyName, THREE.Group>

  const maleVariants = [0, 1, 2, 3, 4, 5].map((i) => loadTex(`${BASE}/ubc/T_Male_Variant${i}.png`))
  const femaleVariants = [0, 1, 2, 3, 4, 5].map((i) => loadTex(`${BASE}/ubc/T_Female_Variant${i}.png`))

  // خامة لمبة Kenney بنسختين: منورة (شغال) ومطفية — الاسم بيبقى 'lamp'
  let lampLit: THREE.Material = new THREE.MeshStandardMaterial({ color: 0xffe9a8 })
  let lampOff: THREE.Material = lampLit
  kenney.lamp.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      const mats = Array.isArray(c.material) ? c.material : [c.material]
      for (const m of mats) {
        if ((m.name ?? '').toLowerCase() === 'lamp') {
          const lit = (m as THREE.MeshStandardMaterial).clone()
          lit.emissive = new THREE.Color(0xffa726)
          lit.emissiveIntensity = 1.35
          lampLit = lit
          lampOff = m
        }
      }
    }
  })

  return {
    male: male.scene,
    female: female.scene,
    hairShort: hairShort.scene,
    hairLong: hairLong.scene,
    maleVariants,
    femaleVariants,
    kenney,
    lampLit,
    lampOff,
  }
}

/* ---------- مصنع الشخصيات ---------- */

export function createCharacter(assets: OfficeAssets, opts: CharacterOpts): CharacterRig {
  const group = new THREE.Group()
  const bodyTpl = opts.body === 'male' ? assets.male : assets.female
  const hairTpl = opts.body === 'male' ? assets.hairShort : assets.hairLong
  const variants = opts.body === 'male' ? assets.maleVariants : assets.femaleVariants

  const bodyClone = skeletonClone(bodyTpl) as THREE.Group
  const hairClone = skeletonClone(hairTpl) as THREE.Group
  const variantTex = variants[opts.variant % variants.length]

  const dressClone = (root: THREE.Object3D) => {
    const seen = new Map<THREE.Material, THREE.Material>()
    root.traverse((c) => {
      if (!(c instanceof THREE.Mesh)) return
      c.castShadow = true
      c.frustumCulled = false
      const mats = Array.isArray(c.material) ? c.material : [c.material]
      const next = mats.map((m) => {
        if (isBodyMaterial(m)) {
          if (!seen.has(m)) {
            const cloned = (m as THREE.MeshStandardMaterial).clone()
            cloned.map = variantTex
            cloned.needsUpdate = true
            cloned.userData.owned = true // خامة خاصة بالشخصية — بتتفرّغ مع المشهد
            seen.set(m, cloned)
          }
          return seen.get(m)!
        }
        if (isHairMaterial(m)) {
          if (!seen.has(m)) {
            const cloned = (m as THREE.MeshStandardMaterial).clone()
            cloned.color.set(opts.hairColor)
            cloned.userData.owned = true
            seen.set(m, cloned)
          }
          return seen.get(m)!
        }
        return m
      })
      c.material = Array.isArray(c.material) ? next : next[0]
    })
  }
  dressClone(bodyClone)
  dressClone(hairClone)

  group.add(bodyClone)
  group.add(hairClone)
  const parts = [bodyClone, hairClone]

  const bob: BobTarget[] = []
  if (opts.mode === 'stand') {
    poseStanding(parts, group, opts.present ?? false)
  } else {
    poseSeated(parts, group, opts.mode, bob)
    seatCharacter(group, parts, opts.seatY ?? 0.5)
  }

  // تعليم الأصول المشتركة — علشان التفريغ في المشهد ما يمسّش القوالب
  group.traverse((c) => {
    c.userData.sharedAsset = true
  })

  const phase = Math.random() * Math.PI * 2
  return {
    group,
    animate:
      bob.length > 0
        ? (t: number) => {
            for (const b of bob) {
              rotBone(b.bone, b.baseX + Math.sin(t * b.speed + phase) * b.amp, 0, 0)
            }
          }
        : undefined,
  }
}

/** استنساخ قطعة Kenney جاهزة (مشتركة الخامات والهندسة — خفيفة) */
export function cloneKenney(assets: OfficeAssets, name: KenneyName): THREE.Group {
  const c = assets.kenney[name].clone(true) as THREE.Group
  c.traverse((o) => {
    o.userData.sharedAsset = true
  })
  return c
}

/** تبديل خامة لمبة Kenney في نسخة مستنسخة (منورة/مطفية حسب الحالة) */
export function setLampLit(lampGroup: THREE.Object3D, assets: OfficeAssets, lit: boolean) {
  lampGroup.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      const mats = Array.isArray(c.material) ? c.material : [c.material]
      const next = mats.map((m) =>
        (m.name ?? '').toLowerCase() === 'lamp' ? (lit ? assets.lampLit : assets.lampOff) : m,
      )
      c.material = Array.isArray(c.material) ? next : next[0]
    }
  })
}
