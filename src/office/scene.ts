import * as THREE from 'three'
import type { OfficeLayout, RoomLayout } from './layout'
import type { Employee } from './types'

/*
 * باني المشهد — بيحوّل التخطيط المحسوب من البيانات لمشهد Three.js.
 * لا يعرف أي اسم قسم أو موظف بعينه: كل حاجة بتيجي من التخطيط/السجلات.
 * الألوان من عقد البراند: نيلي #3B3FA3 · سماوي #00D2FF · كهرماني #FFA726 · كحلي #0A2342.
 */

export interface BuiltOffice {
  group: THREE.Group
  pickables: THREE.Object3D[]
  anchors: Map<string, THREE.Object3D>
  tick: (elapsed: number) => void
  dispose: () => void
}

/* ---------- أدوات مساعدة ---------- */

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  draw(g)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** شاشة كمبيوتر فيها داشبورد وهمي — سماوي على كحلي */
function makeScreenTexture(): THREE.Texture {
  return canvasTexture(256, 160, (g) => {
    g.fillStyle = '#07263f'
    g.fillRect(0, 0, 256, 160)
    g.fillStyle = '#00d2ff'
    g.fillRect(0, 0, 256, 14)
    g.fillStyle = 'rgba(0,210,255,.25)'
    g.fillRect(12, 26, 70, 46)
    g.fillRect(92, 26, 70, 46)
    // أعمدة بيانية
    const bars = [26, 44, 34, 58, 48, 70, 62]
    g.fillStyle = '#00d2ff'
    bars.forEach((b, i) => g.fillRect(14 + i * 20, 140 - b, 12, b))
    // خط بياني
    g.strokeStyle = '#ffa726'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(170, 120)
    g.lineTo(195, 95)
    g.lineTo(215, 108)
    g.lineTo(242, 70)
    g.stroke()
    g.fillStyle = 'rgba(255,255,255,.75)'
    for (let i = 0; i < 4; i++) g.fillRect(172, 28 + i * 12, 68, 5)
  })
}

/** سبورة بيضاء برسوم وملاحظات لاصقة */
function makeBoardTexture(): THREE.Texture {
  return canvasTexture(256, 160, (g) => {
    g.fillStyle = '#f4f6fb'
    g.fillRect(0, 0, 256, 160)
    g.strokeStyle = '#3b3fa3'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(18, 118)
    g.lineTo(66, 84)
    g.lineTo(104, 100)
    g.lineTo(150, 48)
    g.stroke()
    g.strokeStyle = '#9db2ce'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(18, 132)
    g.lineTo(150, 132)
    g.moveTo(18, 30)
    g.lineTo(18, 132)
    g.stroke()
    const notes = ['#ffa726', '#00d2ff', '#ff7bac', '#34d399']
    notes.forEach((c, i) => {
      g.fillStyle = c
      g.fillRect(178 + (i % 2) * 34, 26 + Math.floor(i / 2) * 38, 26, 26)
    })
    g.fillStyle = '#5b6080'
    for (let i = 0; i < 3; i++) g.fillRect(178, 116 + i * 12, 62, 5)
  })
}

function makeZzzTexture(): THREE.Texture {
  return canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128)
    g.fillStyle = '#dcefff'
    g.shadowColor = '#00d2ff'
    g.shadowBlur = 10
    g.font = '700 62px sans-serif'
    g.fillText('Z', 8, 66)
    g.font = '700 40px sans-serif'
    g.fillText('Z', 58, 96)
    g.font = '700 26px sans-serif'
    g.fillText('Z', 92, 118)
  })
}

function makeGlowTexture(): THREE.Texture {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62)
    grad.addColorStop(0, 'rgba(255,255,255,.9)')
    grad.addColorStop(0.4, 'rgba(255,255,255,.28)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  })
}

/** شارة اسم عائمة (نص عربي على كبسولة كحلية) */
function makeLabelSprite(text: string, accent: string): THREE.Sprite {
  const pad = 30
  const font = '700 52px "IBM Plex Sans Arabic", sans-serif'
  const meas = document.createElement('canvas').getContext('2d')!
  meas.font = font
  const tw = Math.ceil(meas.measureText(text).width)
  const w = tw + pad * 2
  const h = 84
  const tex = canvasTexture(w, h, (g) => {
    g.font = font
    const r = 40
    g.beginPath()
    g.roundRect(3, 3, w - 6, h - 6, r)
    g.fillStyle = 'rgba(10,35,66,.88)'
    g.fill()
    g.lineWidth = 5
    g.strokeStyle = accent
    g.stroke()
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2 + 4)
  })
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(mat)
  const scale = 0.011
  sprite.scale.set(w * scale, h * scale, 1)
  return sprite
}

/* ---------- خامات وأشكال مشتركة ---------- */

const NAVY = 0x0a2342
const FRAME = 0x16294d
const CYAN = 0x00d2ff
const AMBER = 0xffa726
const WOOD = 0x9a7448
const WOOD_DARK = 0x77572f

const SHIRT_COLORS = [0x3b3fa3, 0x0e7490, 0xb45309, 0x7c2d4e, 0x475569, 0x4d7c0f, 0x6d28d9, 0x0f766e]
const SKIN_COLORS = [0xf2c9a0, 0xe0ac82, 0xc68863, 0x9c6644, 0xf7d7b5]
const HAIR_COLORS = [0x1f2937, 0x3f2d20, 0x111827, 0x5b3a1e]

interface Shared {
  box: THREE.BoxGeometry
  screenTex: THREE.Texture
  boardTex: THREE.Texture
  zzzTex: THREE.Texture
  glowTex: THREE.Texture
  glassMat: THREE.MeshStandardMaterial
  frameMat: THREE.MeshStandardMaterial
  navyMat: THREE.MeshStandardMaterial
  woodMat: THREE.MeshStandardMaterial
  woodDarkMat: THREE.MeshStandardMaterial
  darkScreenMat: THREE.MeshStandardMaterial
  chairMat: THREE.MeshStandardMaterial
  metalMat: THREE.MeshStandardMaterial
}

function makeShared(): Shared {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    screenTex: makeScreenTexture(),
    boardTex: makeBoardTexture(),
    zzzTex: makeZzzTexture(),
    glowTex: makeGlowTexture(),
    glassMat: new THREE.MeshStandardMaterial({
      color: 0xa8d8f0,
      transparent: true,
      opacity: 0.13,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    frameMat: new THREE.MeshStandardMaterial({ color: FRAME, roughness: 0.5, metalness: 0.55 }),
    navyMat: new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.6, metalness: 0.3 }),
    woodMat: new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.75 }),
    woodDarkMat: new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.8 }),
    darkScreenMat: new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.35, metalness: 0.4 }),
    chairMat: new THREE.MeshStandardMaterial({ color: 0x27324e, roughness: 0.85 }),
    metalMat: new THREE.MeshStandardMaterial({ color: 0x8d99ae, roughness: 0.3, metalness: 0.85 }),
  }
}

function box(
  sh: Shared,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(sh.box, mat)
  m.scale.set(sx, sy, sz)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/* ---------- نبتة زينة ---------- */
function makePlant(rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group()
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.12, 0.3, 10),
    new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.9 }),
  )
  pot.position.y = 0.15
  pot.castShadow = true
  g.add(pot)
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 })
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55 + rand() * 0.3, 6), leafMat)
    const a = (i / 5) * Math.PI * 2
    leaf.position.set(Math.cos(a) * 0.09, 0.55, Math.sin(a) * 0.09)
    leaf.rotation.set(Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45)
    leaf.castShadow = true
    g.add(leaf)
  }
  g.scale.setScalar(scale)
  return g
}

/* ---------- مجسّم موظف مبسّط ---------- */
interface Figure {
  group: THREE.Group
  upper: THREE.Group
}

function makeFigure(seedKey: string, standing = false): Figure {
  const rand = rng(hashSeed(seedKey))
  const shirt = new THREE.MeshStandardMaterial({
    color: SHIRT_COLORS[Math.floor(rand() * SHIRT_COLORS.length)],
    roughness: 0.85,
  })
  const skin = new THREE.MeshStandardMaterial({
    color: SKIN_COLORS[Math.floor(rand() * SKIN_COLORS.length)],
    roughness: 0.65,
  })
  const hair = new THREE.MeshStandardMaterial({
    color: HAIR_COLORS[Math.floor(rand() * HAIR_COLORS.length)],
    roughness: 0.9,
  })
  const group = new THREE.Group()
  const upper = new THREE.Group()

  if (standing) {
    const legGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.52, 8)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x232a3d, roughness: 0.9 })
    for (const dx of [-0.09, 0.09]) {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(dx, 0.26, 0)
      leg.castShadow = true
      group.add(leg)
    }
    upper.position.y = 0.52
  } else {
    upper.position.y = 0.46
  }

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.3, 4, 10), shirt)
  torso.position.y = 0.3
  torso.castShadow = true
  upper.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14), skin)
  head.position.y = 0.68
  head.castShadow = true
  upper.add(head)
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 12), hair)
  hairCap.scale.set(1, 0.68, 1)
  hairCap.position.set(0, 0.745, 0.018)
  upper.add(hairCap)

  if (!standing) {
    const armGeo = new THREE.CapsuleGeometry(0.045, 0.26, 3, 8)
    for (const dx of [-0.21, 0.21]) {
      const arm = new THREE.Mesh(armGeo, shirt)
      arm.position.set(dx, 0.34, -0.16)
      arm.rotation.x = -1.05
      arm.castShadow = true
      upper.add(arm)
    }
  }
  group.add(upper)
  return { group, upper }
}

/* ---------- محطة عمل (مكتب + شاشات + كرسي + موظف) ---------- */
interface Animator {
  kind: 'working' | 'idle-zzz' | 'screen'
  obj: THREE.Object3D
  phase: number
  baseY: number
  mat?: THREE.MeshStandardMaterial
  spriteMat?: THREE.SpriteMaterial
}

function makeDesk(
  sh: Shared,
  employee: Employee,
  animators: Animator[],
): { group: THREE.Group; pick: THREE.Object3D[] } {
  const g = new THREE.Group()
  const pick: THREE.Object3D[] = []
  const rand = rng(hashSeed(employee.id))
  const phase = rand() * Math.PI * 2
  const status = employee.status

  // سطح المكتب وأرجله
  g.add(box(sh, sh.woodMat, 1.7, 0.06, 0.85, 0, 0.74, 0))
  g.add(box(sh, sh.woodDarkMat, 0.06, 0.72, 0.8, -0.8, 0.37, 0))
  g.add(box(sh, sh.woodDarkMat, 0.06, 0.72, 0.8, 0.8, 0.37, 0))
  g.add(box(sh, sh.woodDarkMat, 0.5, 0.34, 0.7, 0.52, 0.53, 0)) // وحدة أدراج
  // لوحة مفاتيح
  g.add(box(sh, sh.darkScreenMat, 0.46, 0.025, 0.17, 0, 0.785, 0.08))

  // شاشتان
  for (const dx of [-0.34, 0.34]) {
    const stand = box(sh, sh.darkScreenMat, 0.07, 0.3, 0.07, dx, 0.92, -0.26)
    g.add(stand)
    const frame = box(sh, sh.darkScreenMat, 0.66, 0.42, 0.035, dx, 1.16, -0.26)
    frame.rotation.y = dx < 0 ? 0.14 : -0.14
    g.add(frame)
    let screenMat: THREE.MeshStandardMaterial
    if (status === 'working') {
      screenMat = new THREE.MeshStandardMaterial({
        map: sh.screenTex,
        emissive: 0xffffff,
        emissiveMap: sh.screenTex,
        emissiveIntensity: 1.1,
        roughness: 0.4,
      })
      animators.push({ kind: 'screen', obj: frame, phase, baseY: 0, mat: screenMat })
    } else {
      screenMat = sh.darkScreenMat
    }
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), screenMat)
    screen.position.set(dx, 1.16, -0.24)
    screen.rotation.y = dx < 0 ? 0.14 : -0.14
    g.add(screen)
  }

  // لمبة مكتب كهرمانية — منورة للشغال بس
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.03, 10), sh.metalMat)
  lampBase.position.set(-0.68, 0.785, -0.18)
  g.add(lampBase)
  const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6), sh.metalMat)
  lampArm.position.set(-0.68, 0.98, -0.18)
  lampArm.rotation.z = 0.5
  g.add(lampArm)
  const lampHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.085, 0.12, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x8a5a17,
      emissive: status === 'working' ? AMBER : 0x000000,
      emissiveIntensity: status === 'working' ? 1.6 : 0,
      roughness: 0.4,
      metalness: 0.6,
      side: THREE.DoubleSide,
    }),
  )
  lampHead.position.set(-0.57, 1.16, -0.18)
  lampHead.rotation.z = 0.7
  g.add(lampHead)
  if (status === 'working') {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sh.glowTex,
        color: AMBER,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    glow.scale.set(0.55, 0.55, 1)
    glow.position.set(-0.55, 1.13, -0.16)
    g.add(glow)
  }

  // كرسي
  const chair = new THREE.Group()
  chair.position.set(0, 0, 0.52)
  if (status === 'offline') chair.rotation.y = 0.7
  chair.add(box(sh, sh.chairMat, 0.52, 0.07, 0.5, 0, 0.46, 0))
  chair.add(box(sh, sh.chairMat, 0.52, 0.6, 0.07, 0, 0.78, 0.26))
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), sh.metalMat)
  post.position.y = 0.22
  chair.add(post)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.035, 12), sh.darkScreenMat)
  base.position.y = 0.02
  chair.add(base)
  g.add(chair)

  // الموظف نفسه (مش موجود لو غير متصل)
  if (status !== 'offline') {
    const fig = makeFigure(employee.id)
    fig.group.position.set(0, 0, 0.52)
    if (status === 'idle') {
      // نايم على المكتب: انحناء لقدام وراس على السطح
      fig.upper.rotation.x = -0.62
      fig.upper.position.z = -0.16
      const zzz = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: sh.zzzTex, transparent: true, opacity: 0, depthWrite: false }),
      )
      zzz.scale.set(0.6, 0.6, 1)
      zzz.position.set(0.25, 1.25, -0.1)
      g.add(zzz)
      animators.push({ kind: 'idle-zzz', obj: zzz, phase: rand(), baseY: 1.25, spriteMat: zzz.material as THREE.SpriteMaterial })
    } else {
      fig.upper.rotation.x = -0.07
      animators.push({ kind: 'working', obj: fig.upper, phase, baseY: fig.upper.position.y })
    }
    fig.group.traverse((o) => {
      o.userData.employeeId = employee.id
      pick.push(o)
    })
    g.add(fig.group)
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.userData.employeeId = employee.id
      pick.push(o)
    }
  })
  return { group: g, pick }
}

/* ---------- غرفة قسم ---------- */
function makeRoom(
  sh: Shared,
  room: RoomLayout,
  animators: Animator[],
  pickables: THREE.Object3D[],
  anchors: Map<string, THREE.Object3D>,
): THREE.Group {
  const g = new THREE.Group()
  g.position.set(room.cx, 0, room.cz)
  g.rotation.y = room.rotationY
  const { width: w, depth: d } = room
  const rand = rng(hashSeed(room.department.id))
  const accent = new THREE.Color(room.department.color)

  // أرضية خشبية دافئة مموّجة بلون القسم
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xc9a06b, roughness: 0.8 })
  floorMat.color.lerp(accent, 0.12)
  const floor = box(sh, floorMat, w, 0.12, d, 0, 0.06, 0)
  g.add(floor)

  // إطار وهيكل زجاجي
  const H = 2.65
  for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) {
    g.add(box(sh, sh.frameMat, 0.15, H, 0.15, px, H / 2, pz))
  }
  g.add(box(sh, sh.frameMat, w + 0.15, 0.16, 0.16, 0, H, -d / 2))
  g.add(box(sh, sh.frameMat, w + 0.15, 0.16, 0.16, 0, H, d / 2))
  g.add(box(sh, sh.frameMat, 0.16, 0.16, d + 0.15, -w / 2, H, 0))
  g.add(box(sh, sh.frameMat, 0.16, 0.16, d + 0.15, w / 2, H, 0))
  // شريط إضاءة بلون القسم على العارضة الأمامية
  const strip = new THREE.Mesh(
    sh.box,
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.8 }),
  )
  strip.scale.set(w, 0.045, 0.045)
  strip.position.set(0, H - 0.14, d / 2 + 0.09)
  g.add(strip)

  // زجاج: خلفي + جانبين + أمامي
  const back = new THREE.Mesh(sh.box, sh.glassMat)
  back.scale.set(w, H, 0.03)
  back.position.set(0, H / 2, -d / 2)
  g.add(back)
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(sh.box, sh.glassMat)
    side.scale.set(0.03, H, d)
    side.position.set(s * (w / 2), H / 2, 0)
    g.add(side)
  }
  const front = new THREE.Mesh(sh.box, sh.glassMat)
  front.scale.set(w, H, 0.03)
  front.position.set(0, H / 2, d / 2)
  g.add(front)

  // سبورة على الحيطة الخلفية
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(2.2, w * 0.45), 1.25),
    new THREE.MeshStandardMaterial({ map: sh.boardTex, roughness: 0.6 }),
  )
  board.position.set(-w / 4, 1.62, -d / 2 + 0.05)
  g.add(board)
  g.add(box(sh, sh.woodDarkMat, Math.min(2.3, w * 0.47), 1.35, 0.04, -w / 4, 1.62, -d / 2 + 0.02))

  // مكتبة صغيرة على جنب لبعض الغرف
  if (rand() > 0.35) {
    const shelf = new THREE.Group()
    shelf.position.set(w / 2 - 0.35, 0, -d / 2 + 0.55)
    shelf.add(box(sh, sh.woodDarkMat, 0.5, 1.7, 0.9, 0, 0.85, 0))
    const bookColors = [0x3b3fa3, 0xb45309, 0x0e7490, 0x7c2d4e, 0x4d7c0f]
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      for (let b = 0; b < 4; b++) {
        if (rand() < 0.25) continue
        const book = box(
          sh,
          new THREE.MeshStandardMaterial({ color: bookColors[Math.floor(rand() * bookColors.length)], roughness: 0.85 }),
          0.07, 0.34, 0.2,
          -0.14 + (b % 2) * 0.16, 0.45 + sIdx * 0.48, -0.24 + Math.floor(b / 2) * 0.3,
        )
        shelf.add(book)
      }
    }
    g.add(shelf)
  }

  // لمبة سقف متدلية
  const lampCount = w > 7 ? 2 : 1
  for (let i = 0; i < lampCount; i++) {
    const lx = lampCount === 1 ? 0 : (i === 0 ? -w / 4 : w / 4)
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.55, 6), sh.frameMat)
    cord.position.set(lx, H - 0.28, 0)
    g.add(cord)
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xffca7a, emissive: AMBER, emissiveIntensity: 2.4 }),
    )
    bulb.position.set(lx, H - 0.62, 0)
    g.add(bulb)
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sh.glowTex, color: AMBER, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    glow.scale.set(0.95, 0.95, 1)
    glow.position.copy(bulb.position)
    g.add(glow)
  }

  // نباتات في الأركان الأمامية
  for (const s of [-1, 1]) {
    const plant = makePlant(rand, 0.95 + rand() * 0.4)
    plant.position.set(s * (w / 2 - 0.45), 0.1, d / 2 - 0.45)
    g.add(plant)
  }

  // شارة اسم القسم فوق المدخل
  const label = makeLabelSprite(room.department.name, room.department.color)
  label.position.set(0, H + 0.55, d / 2 + 0.2)
  g.add(label)

  // محطات العمل من التخطيط
  for (const desk of room.desks) {
    const built = makeDesk(sh, desk.employee, animators)
    built.group.position.set(desk.x, 0.12, desk.z)
    g.add(built.group)
    pickables.push(...built.pick)
    anchors.set(desk.employee.id, built.group)
  }
  return g
}

/* ---------- الساحة المركزية ---------- */
function makePlaza(sh: Shared, layout: OfficeLayout): THREE.Group {
  const g = new THREE.Group()
  const R = layout.plazaRadius
  const rand = rng(hashSeed('plaza'))

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 0.12, 56),
    new THREE.MeshStandardMaterial({ color: 0xd6dce8, roughness: 0.35, metalness: 0.08 }),
  )
  disc.position.y = 0.06
  disc.receiveShadow = true
  g.add(disc)
  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.035, 8, 72),
    new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.6 }),
  )
  trim.rotation.x = Math.PI / 2
  trim.position.y = 0.12
  g.add(trim)

  // مكتب استقبال منحني + موظفة استقبال
  const reception = new THREE.Group()
  const counter = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 0.98, 28, 1, false, -Math.PI / 3, (Math.PI * 2) / 3),
    sh.metalMat,
  )
  counter.position.y = 0.49
  counter.castShadow = true
  reception.add(counter)
  const counterGlow = new THREE.Mesh(
    new THREE.TorusGeometry(1.71, 0.025, 8, 40, (Math.PI * 2) / 3),
    new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 2 }),
  )
  counterGlow.rotation.x = Math.PI / 2
  counterGlow.rotation.z = Math.PI / 6
  counterGlow.position.y = 0.3
  reception.add(counterGlow)
  const host = makeFigure('reception-host', true)
  host.group.position.set(0, 0.1, -0.55)
  host.group.rotation.y = Math.PI
  reception.add(host.group)
  g.add(reception)

  // كنبتان وقعدة جانبية
  for (const a of [Math.PI * 0.78, Math.PI * 1.22]) {
    const sofa = new THREE.Group()
    const sx = Math.cos(a) * (R - 1.7)
    const sz = Math.sin(a) * (R - 1.7)
    sofa.position.set(sx, 0.1, sz)
    sofa.rotation.y = Math.atan2(-sx, -sz)
    sofa.add(box(sh, sh.navyMat, 1.9, 0.42, 0.8, 0, 0.25, 0))
    sofa.add(box(sh, sh.navyMat, 1.9, 0.55, 0.2, 0, 0.6, -0.32))
    sofa.add(box(sh, sh.navyMat, 0.2, 0.3, 0.8, -0.88, 0.5, 0))
    sofa.add(box(sh, sh.navyMat, 0.2, 0.3, 0.8, 0.88, 0.5, 0))
    const cushion = new THREE.MeshStandardMaterial({ color: 0xe8dcc3, roughness: 0.9 })
    sofa.add(box(sh, cushion, 0.5, 0.34, 0.1, -0.4, 0.62, -0.24))
    sofa.add(box(sh, cushion, 0.5, 0.34, 0.1, 0.4, 0.62, -0.24))
    g.add(sofa)
    const table = box(sh, sh.woodMat, 0.9, 0.06, 0.5, Math.cos(a) * (R - 3.1), 0.42, Math.sin(a) * (R - 3.1))
    g.add(table)
  }

  // موظفان واقفان بيتكلموا جنب الاستقبال (حياة في الساحة — زينة مش بيانات)
  const talker1 = makeFigure('plaza-talker-1', true)
  talker1.group.position.set(2.6, 0.1, 1.7)
  talker1.group.rotation.y = -2.2
  g.add(talker1.group)
  const talker2 = makeFigure('plaza-talker-2', true)
  talker2.group.position.set(3.3, 0.1, 2.5)
  talker2.group.rotation.y = 0.9
  g.add(talker2.group)

  // نباتات حوالين الساحة
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.35
    const plant = makePlant(rand, 1.25 + rand() * 0.5)
    plant.position.set(Math.cos(a) * (R - 0.8), 0.1, Math.sin(a) * (R - 0.8))
    g.add(plant)
  }
  return g
}

/* ---------- الدالة الرئيسية ---------- */
export function buildOfficeScene(layout: OfficeLayout): BuiltOffice {
  const sh = makeShared()
  const group = new THREE.Group()
  const pickables: THREE.Object3D[] = []
  const anchors = new Map<string, THREE.Object3D>()
  const animators: Animator[] = []

  // منصة المقر كلها + شريط إضاءة سماوي على الحواف (بصمة الجولة ٢)
  const platform = box(
    sh,
    new THREE.MeshStandardMaterial({ color: 0x0d2148, roughness: 0.45, metalness: 0.35 }),
    layout.extent * 2, 0.5, layout.extent * 2, 0, -0.26, 0,
  )
  platform.castShadow = false
  group.add(platform)
  const edgeMat = new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 2.2 })
  const e = layout.extent
  for (const [sx, sz, x, z] of [
    [e * 2, 0.07, 0, -e + 0.05],
    [e * 2, 0.07, 0, e - 0.05],
    [0.07, e * 2, -e + 0.05, 0],
    [0.07, e * 2, e - 0.05, 0],
  ] as const) {
    const edge = new THREE.Mesh(sh.box, edgeMat)
    edge.scale.set(sx, 0.05, sz)
    edge.position.set(x, 0.01, z)
    group.add(edge)
  }
  // أرضية داكنة بين المنصة والغرف
  const ground = box(
    sh,
    new THREE.MeshStandardMaterial({ color: 0x12294f, roughness: 0.35, metalness: 0.4 }),
    layout.extent * 2 - 0.4, 0.06, layout.extent * 2 - 0.4, 0, 0.0, 0,
  )
  ground.castShadow = false
  group.add(ground)

  group.add(makePlaza(sh, layout))
  for (const room of layout.rooms) {
    group.add(makeRoom(sh, room, animators, pickables, anchors))
  }

  const tick = (t: number) => {
    for (const a of animators) {
      if (a.kind === 'working') {
        a.obj.position.y = a.baseY + Math.sin(t * 2.1 + a.phase) * 0.022
        a.obj.rotation.z = Math.sin(t * 1.3 + a.phase) * 0.02
      } else if (a.kind === 'idle-zzz' && a.spriteMat) {
        const p = (t * 0.45 + a.phase) % 1
        a.obj.position.y = a.baseY + p * 0.85
        const s = 0.5 + p * 0.5
        a.obj.scale.set(s, s, 1)
        a.spriteMat.opacity = Math.sin(p * Math.PI) * 0.95
      } else if (a.kind === 'screen' && a.mat) {
        a.mat.emissiveIntensity = 1.05 + Math.sin(t * 2.6 + a.phase) * 0.18
      }
    }
  }

  const dispose = () => {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        o.geometry?.dispose()
        const mat = o.material as THREE.Material | THREE.Material[]
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      }
    })
    sh.screenTex.dispose()
    sh.boardTex.dispose()
    sh.zzzTex.dispose()
    sh.glowTex.dispose()
  }

  return { group, pickables, anchors, tick, dispose }
}
