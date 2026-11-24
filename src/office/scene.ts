import * as THREE from 'three'
import type { OfficeLayout, RoomLayout } from './layout'
import type { Employee } from './types'

/*
 * باني المشهد — بيحوّل التخطيط المحسوب من البيانات لمشهد Three.js.
 * لا يعرف أي اسم قسم أو موظف بعينه: كل حاجة بتيجي من التخطيط/السجلات.
 * الألوان من عقد البراند: نيلي #3B3FA3 · سماوي #00D2FF · كهرماني #FFA726 · كحلي #0A2342.
 *
 * جولة الجودة البصرية (٢): تكسشرز إجرائية (أرضية خشب دافئ، رخام فاتح،
 * بلاط داكن لامع، شاشات بمحتوى حقيقي متنوع)، مجسمات أغنى بتنوع شعر
 * وسماعات وأوضاع، وإكسسوارات حياة (أكواب/دفاتر/نباتات/ساعة/لوحات)
 * — من غير أي تغيير في السلوك الديناميكي أو طبقة البيانات.
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

/* ---------- تكسشرز إجرائية ---------- */

/** أرضية خشب دافئ — ألواح بعروق خشب */
function makeWoodFloorTexture(): THREE.Texture {
  const tex = canvasTexture(256, 256, (g) => {
    const rows = 4
    const ph = 256 / rows
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : 128
      for (let s = -1; s < 2; s++) {
        const x = s * 128 + off
        const l = 39 + ((r * 7 + s * 13 + 20) % 11)
        g.fillStyle = `hsl(27, 40%, ${l}%)`
        g.fillRect(x, r * ph, 128, ph)
        // عروق خشب
        g.strokeStyle = 'rgba(90, 58, 28, .18)'
        g.lineWidth = 1.4
        for (let i = 0; i < 4; i++) {
          const gy = r * ph + 6 + i * 14 + ((r + s + i) % 5)
          g.beginPath()
          g.moveTo(x + 4, gy)
          g.bezierCurveTo(x + 40, gy + 3, x + 84, gy - 3, x + 124, gy + 1)
          g.stroke()
        }
        g.strokeStyle = 'rgba(255, 226, 178, .10)'
        g.beginPath()
        g.moveTo(x + 4, r * ph + 3)
        g.lineTo(x + 124, r * ph + 3)
        g.stroke()
      }
    }
    // فواصل الألواح
    g.fillStyle = 'rgba(70, 44, 20, .55)'
    for (let r = 0; r <= rows; r++) g.fillRect(0, r * ph - 1, 256, 2)
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : 128
      g.fillRect(off - 1, r * ph, 2, ph)
      g.fillRect(off + 127, r * ph, 2, ph)
    }
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** خشب أثاث — عروق طولية هادية لأسطح المكاتب والمكتبات */
function makeWoodGrainTexture(): THREE.Texture {
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#a87f52'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 46; i++) {
      const x = (i * 37) % 256
      g.strokeStyle = i % 3 === 0 ? 'rgba(120, 82, 44, .20)' : 'rgba(214, 178, 128, .16)'
      g.lineWidth = 1 + (i % 4)
      g.beginPath()
      g.moveTo(x, 0)
      g.bezierCurveTo(x + 6, 80, x - 6, 170, x + 3, 256)
      g.stroke()
    }
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** رخام فاتح دافئ — أرضية الساحة في الرندر المرجعي */
function makeMarbleTexture(): THREE.Texture {
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#eae2cf'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 14; i++) {
      const x = (i * 53) % 256
      const y = (i * 91) % 256
      const grad = g.createRadialGradient(x, y, 4, x, y, 60 + (i % 4) * 18)
      grad.addColorStop(0, 'rgba(198, 190, 168, .28)')
      grad.addColorStop(1, 'rgba(198, 190, 168, 0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 256, 256)
    }
    // عروق رخام
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = i % 2 ? 'rgba(128, 122, 108, .34)' : 'rgba(178, 148, 92, .22)'
      g.lineWidth = 1.3
      const y0 = (i * 47) % 256
      g.beginPath()
      g.moveTo(0, y0)
      g.bezierCurveTo(70, y0 + 22, 150, y0 - 18, 256, y0 + 10)
      g.stroke()
    }
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** بلاط داكن لامع — أرضية المنصة حوالين الغرف */
function makeTileTexture(): THREE.Texture {
  const tex = canvasTexture(256, 256, (g) => {
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const l = 10 + ((tx * 3 + ty * 7) % 4)
        g.fillStyle = `hsl(222, 44%, ${l}%)`
        g.fillRect(tx * 128, ty * 128, 128, 128)
        const sheen = g.createLinearGradient(tx * 128, ty * 128, tx * 128 + 128, ty * 128 + 128)
        sheen.addColorStop(0, 'rgba(140, 190, 255, .028)')
        sheen.addColorStop(0.55, 'rgba(140, 190, 255, 0)')
        sheen.addColorStop(1, 'rgba(0, 210, 255, .018)')
        g.fillStyle = sheen
        g.fillRect(tx * 128, ty * 128, 128, 128)
      }
    }
    g.fillStyle = '#050c1c'
    for (let i = 0; i <= 2; i++) {
      g.fillRect(i * 128 - 1, 0, 2, 256)
      g.fillRect(0, i * 128 - 1, 256, 2)
    }
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/* ----- شاشات بمحتوى حقيقي — ٤ أنواع ----- */

function screenBase(g: CanvasRenderingContext2D, title: string) {
  g.fillStyle = '#081c30'
  g.fillRect(0, 0, 320, 200)
  g.fillStyle = '#0d2c49'
  g.fillRect(0, 0, 320, 22)
  g.fillStyle = '#00d2ff'
  g.beginPath()
  g.arc(12, 11, 4, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,.85)'
  g.fillRect(24, 8, title.length * 7, 6)
  g.fillStyle = 'rgba(255,255,255,.35)'
  g.fillRect(282, 8, 10, 6)
  g.fillRect(298, 8, 10, 6)
}

function makeScreenTextures(): THREE.Texture[] {
  // ١) داشبورد — بطاقات أرقام + منحنى مساحي
  const dash = canvasTexture(320, 200, (g) => {
    screenBase(g, 'Dashboard')
    const cards = ['#00d2ff', '#ffa726', '#34d399']
    cards.forEach((c, i) => {
      const x = 12 + i * 102
      g.fillStyle = 'rgba(255,255,255,.07)'
      g.fillRect(x, 32, 92, 52)
      g.fillStyle = c
      g.fillRect(x + 8, 40, 26, 6)
      g.fillStyle = 'rgba(255,255,255,.92)'
      g.fillRect(x + 8, 54, 40, 12)
      g.fillStyle = 'rgba(255,255,255,.4)'
      g.fillRect(x + 8, 72, 56, 5)
    })
    const grad = g.createLinearGradient(0, 100, 0, 188)
    grad.addColorStop(0, 'rgba(0,210,255,.5)')
    grad.addColorStop(1, 'rgba(0,210,255,.02)')
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(12, 188)
    g.lineTo(12, 150)
    g.lineTo(70, 132)
    g.lineTo(128, 144)
    g.lineTo(186, 112)
    g.lineTo(244, 122)
    g.lineTo(308, 100)
    g.lineTo(308, 188)
    g.closePath()
    g.fill()
    g.strokeStyle = '#00d2ff'
    g.lineWidth = 2.5
    g.beginPath()
    g.moveTo(12, 150)
    g.lineTo(70, 132)
    g.lineTo(128, 144)
    g.lineTo(186, 112)
    g.lineTo(244, 122)
    g.lineTo(308, 100)
    g.stroke()
    g.fillStyle = '#ffa726'
    g.beginPath()
    g.arc(186, 112, 4, 0, Math.PI * 2)
    g.fill()
  })
  // ٢) تحليلات — أعمدة + دائرة نسب
  const analytics = canvasTexture(320, 200, (g) => {
    screenBase(g, 'Analytics')
    const bars = [42, 68, 52, 88, 74, 104, 92]
    bars.forEach((b, i) => {
      g.fillStyle = i % 3 === 2 ? '#ffa726' : '#00d2ff'
      g.fillRect(16 + i * 26, 178 - b, 17, b)
      g.fillStyle = 'rgba(255,255,255,.35)'
      g.fillRect(16 + i * 26, 184, 17, 4)
    })
    // دونات
    const cx = 262
    const cy = 96
    const segs: Array<[string, number, number]> = [
      ['#00d2ff', 0, 2.4],
      ['#ffa726', 2.4, 4.1],
      ['#34d399', 4.1, 5.3],
      ['#3b3fa3', 5.3, Math.PI * 2],
    ]
    for (const [c, a0, a1] of segs) {
      g.strokeStyle = c
      g.lineWidth = 15
      g.beginPath()
      g.arc(cx, cy, 34, a0, a1)
      g.stroke()
    }
    g.fillStyle = 'rgba(255,255,255,.9)'
    g.fillRect(cx - 12, cy - 5, 24, 10)
    g.fillStyle = 'rgba(255,255,255,.45)'
    for (let i = 0; i < 3; i++) g.fillRect(226, 148 + i * 13, 74, 5)
  })
  // ٣) محرر كود — أسطر ملوّنة
  const code = canvasTexture(320, 200, (g) => {
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 320, 200)
    g.fillStyle = '#111c30'
    g.fillRect(0, 0, 320, 22)
    for (const [i, c] of ['#ff5f57', '#febc2e', '#28c840'].entries()) {
      g.fillStyle = c
      g.beginPath()
      g.arc(12 + i * 16, 11, 4.5, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#131f36'
    g.fillRect(0, 22, 30, 178)
    const palette = ['#7dd3fc', '#f0abfc', '#fda4af', '#86efac', '#fcd34d', '#93c5fd']
    let seed = 7
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let line = 0; line < 11; line++) {
      const y = 36 + line * 15
      g.fillStyle = 'rgba(255,255,255,.28)'
      g.fillRect(10, y, 9, 5)
      let x = 40 + (line % 3) * 14
      const segs = 2 + Math.floor(rnd() * 3)
      for (let s = 0; s < segs; s++) {
        const w = 18 + rnd() * 52
        g.fillStyle = palette[Math.floor(rnd() * palette.length)]
        g.fillRect(x, y, Math.min(w, 312 - x), 6)
        x += w + 9
        if (x > 300) break
      }
    }
  })
  // ٤) مكالمة فيديو — شبكة وجوه + شريط سفلي
  const call = canvasTexture(320, 200, (g) => {
    screenBase(g, 'Meeting')
    const faces = ['#3b3fa3', '#0e7490', '#b45309', '#4d7c0f']
    faces.forEach((c, i) => {
      const x = 12 + (i % 2) * 150
      const y = 32 + Math.floor(i / 2) * 66
      g.fillStyle = 'rgba(255,255,255,.06)'
      g.fillRect(x, y, 142, 60)
      g.fillStyle = c
      g.beginPath()
      g.arc(x + 71, y + 26, 13, 0, Math.PI * 2)
      g.fill()
      g.beginPath()
      g.arc(x + 71, y + 48, 16, Math.PI, Math.PI * 2)
      g.fill()
      g.fillStyle = '#ffa726'
      g.fillRect(x + 6, y + 48, 22, 6)
    })
    g.fillStyle = 'rgba(0,210,255,.16)'
    g.fillRect(12, 168, 296, 20)
    g.fillStyle = '#00d2ff'
    for (let i = 0; i < 5; i++) {
      g.beginPath()
      g.arc(120 + i * 22, 178, 5, 0, Math.PI * 2)
      g.fill()
    }
  })
  return [dash, analytics, code, call]
}

/** سبورة بيضاء — رسم بياني + دائرة + قائمة مهام وملاحظات */
function makeBoardTexture(): THREE.Texture {
  return canvasTexture(320, 200, (g) => {
    g.fillStyle = '#f5f7fc'
    g.fillRect(0, 0, 320, 200)
    g.strokeStyle = '#3b3fa3'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(20, 140)
    g.lineTo(70, 104)
    g.lineTo(112, 120)
    g.lineTo(168, 62)
    g.stroke()
    g.strokeStyle = '#9db2ce'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(20, 158)
    g.lineTo(180, 158)
    g.moveTo(20, 34)
    g.lineTo(20, 158)
    g.stroke()
    g.fillStyle = '#ffa726'
    g.beginPath()
    g.arc(168, 62, 5, 0, Math.PI * 2)
    g.fill()
    // دائرة نسب صغيرة
    g.strokeStyle = '#00d2ff'
    g.lineWidth = 9
    g.beginPath()
    g.arc(232, 62, 24, -0.6, 2.6)
    g.stroke()
    g.strokeStyle = '#ffa726'
    g.beginPath()
    g.arc(232, 62, 24, 2.6, 5.7)
    g.stroke()
    // قائمة مهام بعلامات صح
    for (let i = 0; i < 3; i++) {
      const y = 116 + i * 24
      g.strokeStyle = '#34d399'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(204, y + 4)
      g.lineTo(210, y + 10)
      g.lineTo(220, y - 3)
      g.stroke()
      g.fillStyle = '#8b93ad'
      g.fillRect(228, y, 62 - i * 9, 6)
    }
    const notes = ['#ffa726', '#00d2ff', '#ff7bac', '#34d399', '#ffd54f', '#b388ff']
    notes.forEach((c, i) => {
      g.fillStyle = c
      g.fillRect(286, 18 + i * 30, 24, 24)
      g.fillStyle = 'rgba(0,0,0,.18)'
      g.fillRect(290, 26 + i * 30, 16, 3)
      g.fillRect(290, 33 + i * 30, 12, 3)
    })
  })
}

/** ساعة حائط */
function makeClockTexture(): THREE.Texture {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#f7f5ef'
    g.beginPath()
    g.arc(64, 64, 60, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#2b3a55'
    g.lineWidth = 3
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      g.beginPath()
      g.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50)
      g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56)
      g.stroke()
    }
    const hand = (a: number, len: number, w: number, c: string) => {
      g.strokeStyle = c
      g.lineWidth = w
      g.beginPath()
      g.moveTo(64, 64)
      g.lineTo(64 + Math.cos(a) * len, 64 + Math.sin(a) * len)
      g.stroke()
    }
    hand(-2.2, 30, 6, '#2b3a55') // عقرب ساعات ~١٠
    hand(-0.35, 44, 4, '#2b3a55') // عقرب دقائق ~١٠
    hand(1.9, 48, 2, '#ffa726')
    g.fillStyle = '#2b3a55'
    g.beginPath()
    g.arc(64, 64, 5, 0, Math.PI * 2)
    g.fill()
  })
}

/** لوحات فنية مؤطرة — نسختان بألوان البراند */
function makeArtTextures(): THREE.Texture[] {
  const mountains = canvasTexture(192, 144, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 144)
    grad.addColorStop(0, '#bfe6fb')
    grad.addColorStop(1, '#eef7ff')
    g.fillStyle = grad
    g.fillRect(0, 0, 192, 144)
    g.fillStyle = '#ffa726'
    g.beginPath()
    g.arc(148, 36, 15, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#3b3fa3'
    g.beginPath()
    g.moveTo(0, 144)
    g.lineTo(58, 58)
    g.lineTo(116, 144)
    g.closePath()
    g.fill()
    g.fillStyle = '#0a2342'
    g.beginPath()
    g.moveTo(62, 144)
    g.lineTo(128, 74)
    g.lineTo(192, 144)
    g.closePath()
    g.fill()
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(46, 74)
    g.lineTo(58, 58)
    g.lineTo(70, 74)
    g.lineTo(62, 70)
    g.lineTo(58, 76)
    g.lineTo(54, 70)
    g.closePath()
    g.fill()
  })
  const waves = canvasTexture(192, 144, (g) => {
    g.fillStyle = '#eaf6ff'
    g.fillRect(0, 0, 192, 144)
    g.fillStyle = '#ffa726'
    g.beginPath()
    g.arc(40, 34, 14, 0, Math.PI * 2)
    g.fill()
    const layers: Array<[string, number]> = [
      ['#7dd3fc', 74],
      ['#00a8cc', 92],
      ['#3b3fa3', 110],
      ['#0a2342', 128],
    ]
    for (const [c, base] of layers) {
      g.fillStyle = c
      g.beginPath()
      g.moveTo(0, base)
      for (let x = 0; x <= 192; x += 16) {
        g.lineTo(x, base + Math.sin(x / 22 + base) * 7)
      }
      g.lineTo(192, 144)
      g.lineTo(0, 144)
      g.closePath()
      g.fill()
    }
  })
  return [mountains, waves]
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

const SHIRT_COLORS = [
  0x3b3fa3, 0x0e7490, 0xb45309, 0x7c2d4e, 0x475569, 0x4d7c0f, 0x6d28d9, 0x0f766e,
  0xc2410c, 0x1d4ed8, 0x9d174d, 0x365314, 0x854d0e, 0x155e75,
]
const PANTS_COLORS = [0x232a3d, 0x374151, 0x1e3a5f, 0x4a3728, 0x2f3542, 0x513252]
const SKIN_COLORS = [0xf2c9a0, 0xe0ac82, 0xc68863, 0x9c6644, 0xf7d7b5]
const HAIR_COLORS = [0x1f2937, 0x3f2d20, 0x111827, 0x5b3a1e, 0x6e4525]
const MUG_COLORS = [0xf5f0e6, 0xffa726, 0x00a8cc, 0xe11d63, 0x34d399]

interface Shared {
  box: THREE.BoxGeometry
  screenTexs: THREE.Texture[]
  boardTex: THREE.Texture
  clockTex: THREE.Texture
  artTexs: THREE.Texture[]
  woodFloorTex: THREE.Texture
  woodGrainTex: THREE.Texture
  marbleTex: THREE.Texture
  tileTex: THREE.Texture
  zzzTex: THREE.Texture
  glowTex: THREE.Texture
  /** تكسشرز منسوخة لكل غرفة — بتتخلص مع المشهد */
  extraTextures: THREE.Texture[]
  glassMat: THREE.MeshStandardMaterial
  frameMat: THREE.MeshStandardMaterial
  navyMat: THREE.MeshStandardMaterial
  woodMat: THREE.MeshStandardMaterial
  woodDarkMat: THREE.MeshStandardMaterial
  darkScreenMat: THREE.MeshStandardMaterial
  idleScreenMat: THREE.MeshStandardMaterial
  chairMat: THREE.MeshStandardMaterial
  metalMat: THREE.MeshStandardMaterial
  leafMat: THREE.MeshStandardMaterial
  leafLightMat: THREE.MeshStandardMaterial
  potMat: THREE.MeshStandardMaterial
}

function makeShared(): Shared {
  const woodGrainTex = makeWoodGrainTexture()
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    screenTexs: makeScreenTextures(),
    boardTex: makeBoardTexture(),
    clockTex: makeClockTexture(),
    artTexs: makeArtTextures(),
    woodFloorTex: makeWoodFloorTexture(),
    woodGrainTex,
    marbleTex: makeMarbleTexture(),
    tileTex: makeTileTexture(),
    zzzTex: makeZzzTexture(),
    glowTex: makeGlowTexture(),
    extraTextures: [],
    glassMat: new THREE.MeshStandardMaterial({
      color: 0xbfdcf2,
      transparent: true,
      opacity: 0.12,
      roughness: 0.06,
      metalness: 0.25,
      envMapIntensity: 1.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    frameMat: new THREE.MeshStandardMaterial({ color: FRAME, roughness: 0.42, metalness: 0.6, envMapIntensity: 0.9 }),
    navyMat: new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.6, metalness: 0.3 }),
    woodMat: new THREE.MeshStandardMaterial({ map: woodGrainTex, color: 0xd8b98c, roughness: 0.62, envMapIntensity: 0.5 }),
    woodDarkMat: new THREE.MeshStandardMaterial({ map: woodGrainTex, color: 0x9a7a52, roughness: 0.7, envMapIntensity: 0.4 }),
    darkScreenMat: new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.32, metalness: 0.45, envMapIntensity: 1.1 }),
    idleScreenMat: new THREE.MeshStandardMaterial({
      color: 0x0d1826,
      roughness: 0.32,
      metalness: 0.45,
      emissive: 0x10344d,
      emissiveIntensity: 0.55,
      envMapIntensity: 1.1,
    }),
    chairMat: new THREE.MeshStandardMaterial({ color: 0x44598a, roughness: 0.82 }),
    metalMat: new THREE.MeshStandardMaterial({ color: 0x9aa7bd, roughness: 0.28, metalness: 0.9, envMapIntensity: 1.2 }),
    leafMat: new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.75 }),
    leafLightMat: new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 0.75 }),
    potMat: new THREE.MeshStandardMaterial({ color: 0x74604a, roughness: 0.9 }),
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

/** نسخة تكسشر بكرر مختلف — للغرف (بتتسجل للتخلص منها مع المشهد) */
function tiled(sh: Shared, base: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = base.clone()
  t.repeat.set(rx, ry)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  sh.extraTextures.push(t)
  return t
}

/* ---------- نباتات زينة ---------- */

/** نبتة ورقية عادية في قصعة */
function makePlant(sh: Shared, rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group()
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 10), sh.potMat)
  pot.position.y = 0.15
  pot.castShadow = true
  g.add(pot)
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 }))
  soil.position.y = 0.3
  g.add(soil)
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.55 + rand() * 0.35, 6), i % 2 ? sh.leafMat : sh.leafLightMat)
    const a = (i / 6) * Math.PI * 2
    leaf.position.set(Math.cos(a) * 0.09, 0.58, Math.sin(a) * 0.09)
    leaf.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5)
    leaf.castShadow = true
    g.add(leaf)
  }
  g.scale.setScalar(scale)
  return g
}

/** نبتة كبيرة مونستيرا-ish — كتل ورق مسطحة حوالين ساق */
function makeLushPlant(sh: Shared, rand: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group()
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.23, 0.52, 12), sh.potMat)
  pot.position.y = 0.26
  pot.castShadow = true
  g.add(pot)
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.9 }))
  trunk.position.y = 0.8
  g.add(trunk)
  const leafGeo = new THREE.SphereGeometry(0.3, 8, 6)
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(leafGeo, i % 2 ? sh.leafMat : sh.leafLightMat)
    const a = (i / 9) * Math.PI * 2 + rand() * 0.5
    const r = 0.13 + rand() * 0.17
    leaf.scale.set(1.05, 0.19, 0.58)
    leaf.position.set(Math.cos(a) * r, 1.0 + rand() * 0.42, Math.sin(a) * r)
    leaf.rotation.set(rand() * 0.5 - 0.25, a, rand() * 0.4 - 0.2)
    leaf.castShadow = true
    g.add(leaf)
  }
  g.scale.setScalar(scale)
  return g
}

/** نبتة متدلية من العارضة — قصعة وسلاسل ورق نازلة */
function makeHangingPlant(sh: Shared, rand: () => number): THREE.Group {
  const g = new THREE.Group()
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 5), sh.frameMat)
  cord.position.y = -0.17
  g.add(cord)
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.2, 9), sh.potMat)
  pot.position.y = -0.44
  g.add(pot)
  for (let i = 0; i < 6; i++) {
    const len = 0.3 + rand() * 0.4
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, len, 5), i % 2 ? sh.leafMat : sh.leafLightMat)
    const a = (i / 6) * Math.PI * 2
    leaf.position.set(Math.cos(a) * 0.1, -0.52 - len / 2, Math.sin(a) * 0.1)
    leaf.rotation.x = Math.PI + (rand() - 0.5) * 0.35
    leaf.rotation.z = (rand() - 0.5) * 0.35
    g.add(leaf)
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), sh.leafLightMat)
  top.scale.set(1, 0.6, 1)
  top.position.y = -0.36
  g.add(top)
  return g
}

/* ---------- مجسّم موظف غني ---------- */
interface Figure {
  group: THREE.Group
  upper: THREE.Group
}

interface FigureOpts {
  standing?: boolean
  /** ذراع مرفوعة — بيشرح/بيقدم */
  present?: boolean
}

function makeFigure(seedKey: string, opts: FigureOpts = {}): Figure {
  const rand = rng(hashSeed(seedKey))
  const standing = opts.standing ?? false
  const shirtColor = SHIRT_COLORS[Math.floor(rand() * SHIRT_COLORS.length)]
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.88 })
  const shirtDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shirtColor).multiplyScalar(0.72),
    roughness: 0.9,
  })
  const skin = new THREE.MeshStandardMaterial({
    color: SKIN_COLORS[Math.floor(rand() * SKIN_COLORS.length)],
    roughness: 0.6,
  })
  const hair = new THREE.MeshStandardMaterial({
    color: HAIR_COLORS[Math.floor(rand() * HAIR_COLORS.length)],
    roughness: 0.92,
  })
  const pants = new THREE.MeshStandardMaterial({
    color: PANTS_COLORS[Math.floor(rand() * PANTS_COLORS.length)],
    roughness: 0.92,
  })
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x191d27, roughness: 0.6 })
  const group = new THREE.Group()
  const upper = new THREE.Group()
  const hairStyle = Math.floor(rand() * 4)
  const headphones = rand() < 0.34
  const hoodie = rand() < 0.3

  if (standing) {
    const legGeo = new THREE.CylinderGeometry(0.06, 0.052, 0.56, 8)
    for (const dx of [-0.095, 0.095]) {
      const leg = new THREE.Mesh(legGeo, pants)
      leg.position.set(dx, 0.3, 0)
      leg.castShadow = true
      group.add(leg)
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.24), shoeMat)
      shoe.position.set(dx, 0.03, -0.04)
      shoe.castShadow = true
      group.add(shoe)
    }
    upper.position.y = 0.56
  } else {
    // رجلين الجالس: فخذ أفقي + ساق نازلة + حذاء — بيبانوا من الجنب تحت المكتب
    for (const dx of [-0.095, 0.095]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.44), pants)
      thigh.position.set(dx, 0.42, -0.13)
      thigh.castShadow = true
      group.add(thigh)
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), pants)
      shin.position.set(dx, 0.2, -0.32)
      group.add(shin)
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.24), shoeMat)
      shoe.position.set(dx, 0.03, -0.37)
      group.add(shoe)
    }
    upper.position.y = 0.46
  }

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.3, 4, 12), shirt)
  torso.position.y = 0.3
  torso.castShadow = true
  upper.add(torso)
  // جيب/شريط صدر خفيف يكسر رتابة الجذع
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), shirtDark)
  stripe.position.set(0, 0.38, -0.15)
  upper.add(stripe)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 16), skin)
  head.position.y = 0.68
  head.castShadow = true
  upper.add(head)
  // غطاء شعر أساسي
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), hair)
  hairCap.scale.set(1, 0.68, 1)
  hairCap.position.set(0, 0.745, 0.018)
  upper.add(hairCap)
  if (hairStyle === 1) {
    // كعكة شعر خلفية
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), hair)
    bun.position.set(0, 0.8, 0.12)
    upper.add(bun)
  } else if (hairStyle === 2) {
    // شعر طويل نازل ورا
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.38, 0.08), hair)
    back.position.set(0, 0.52, 0.135)
    back.rotation.x = 0.07
    upper.add(back)
  } else if (hairStyle === 3) {
    // شعر مجعّد — كرات صغيرة فوق الغطاء
    for (let i = 0; i < 6; i++) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), hair)
      const a = (i / 6) * Math.PI * 1.5 - 0.6
      curl.position.set(Math.cos(a) * 0.09, 0.83 + Math.sin(a) * 0.03, Math.sin(a) * 0.07)
      upper.add(curl)
    }
  }
  if (hoodie && hairStyle !== 2) {
    // غطاء هودي ورا الرقبة
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), shirtDark)
    hood.scale.set(1.05, 0.55, 0.75)
    hood.position.set(0, 0.5, 0.13)
    upper.add(hood)
  }
  if (headphones) {
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x141a29, roughness: 0.45, metalness: 0.3 })
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.018, 8, 20, Math.PI), bandMat)
    band.position.y = 0.68
    upper.add(band)
    const cupGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.045, 12)
    for (const dx of [-0.152, 0.152]) {
      const cup = new THREE.Mesh(cupGeo, bandMat)
      cup.rotation.z = Math.PI / 2
      cup.position.set(dx, 0.68, 0)
      upper.add(cup)
    }
  }

  const armGeo = new THREE.CapsuleGeometry(0.045, 0.26, 3, 8)
  if (standing) {
    for (const dx of [-0.215, 0.215]) {
      const arm = new THREE.Mesh(armGeo, shirt)
      arm.position.set(dx, 0.3, 0)
      arm.rotation.z = dx < 0 ? 0.14 : -0.14
      arm.castShadow = true
      upper.add(arm)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), skin)
      hand.position.set(dx * 1.12, 0.1, 0)
      upper.add(hand)
    }
    if (opts.present) {
      // ذراع يمنى مرفوعة بيشرح بيها
      const armR = upper.children.find(
        (c) => c instanceof THREE.Mesh && Math.abs(c.position.x - 0.215) < 0.01 && c.geometry === armGeo,
      )
      if (armR) {
        armR.rotation.set(-0.95, 0, -0.35)
        armR.position.set(0.24, 0.42, -0.1)
      }
    }
  } else {
    for (const dx of [-0.21, 0.21]) {
      const arm = new THREE.Mesh(armGeo, shirt)
      arm.position.set(dx, 0.34, -0.16)
      arm.rotation.x = -1.05
      arm.castShadow = true
      upper.add(arm)
      // إيد على المكتب عند الكيبورد
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), skin)
      hand.position.set(dx * 0.95, 0.33, -0.42)
      upper.add(hand)
    }
  }
  group.add(upper)
  return { group, upper }
}

/* ---------- محطة عمل (مكتب + شاشات + كرسي + موظف + إكسسوارات) ---------- */
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
  // لوحة مفاتيح + ماوس
  g.add(box(sh, sh.darkScreenMat, 0.46, 0.025, 0.17, 0, 0.785, 0.08))
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), sh.darkScreenMat)
  mouse.scale.set(1, 0.5, 1.5)
  mouse.position.set(0.33, 0.785, 0.09)
  g.add(mouse)

  // شاشتان — لكل شاشة محتوى مختلف من الأنواع الأربعة
  // إطار الشغال له توهج خلفي خفيف علشان حالة الشغل تبان من أي زاوية مش من وش الشاشة بس
  const frameMat =
    status === 'working'
      ? new THREE.MeshStandardMaterial({
          color: 0x0e1626,
          roughness: 0.35,
          metalness: 0.4,
          emissive: 0x17456e,
          emissiveIntensity: 0.85,
          envMapIntensity: 1.1,
        })
      : sh.darkScreenMat
  const variant = Math.floor(rand() * sh.screenTexs.length)
  for (const [i, dx] of [-0.34, 0.34].entries()) {
    const stand = box(sh, sh.darkScreenMat, 0.07, 0.3, 0.07, dx, 0.92, -0.26)
    g.add(stand)
    const frame = box(sh, frameMat, 0.66, 0.42, 0.035, dx, 1.16, -0.26)
    frame.rotation.y = dx < 0 ? 0.14 : -0.14
    g.add(frame)
    let screenMat: THREE.MeshStandardMaterial
    if (status === 'working') {
      const tex = sh.screenTexs[(variant + i) % sh.screenTexs.length]
      screenMat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 1.15,
        roughness: 0.4,
      })
      animators.push({ kind: 'screen', obj: frame, phase: phase + i, baseY: 0, mat: screenMat })
    } else if (status === 'idle') {
      screenMat = sh.idleScreenMat
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

  /* إكسسوارات مكتب — حياة صغيرة بتتوزع بالبذرة (مش كل مكتب زي التاني) */
  const noShadow = (m: THREE.Object3D) => {
    m.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false
    })
    return m
  }
  if (rand() < 0.75) {
    // كوب قهوة
    const mug = new THREE.Group()
    const cupMat = new THREE.MeshStandardMaterial({ color: MUG_COLORS[Math.floor(rand() * MUG_COLORS.length)], roughness: 0.5 })
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.095, 12), cupMat)
    cup.position.y = 0.048
    mug.add(cup)
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.037, 12), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.3 }))
    coffee.rotation.x = -Math.PI / 2
    coffee.position.y = 0.096
    mug.add(coffee)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12), cupMat)
    handle.position.set(0.048, 0.05, 0)
    mug.add(handle)
    mug.position.set(0.52 + rand() * 0.14, 0.77, 0.14 + rand() * 0.1)
    g.add(noShadow(mug))
  }
  if (rand() < 0.65) {
    // دفتر مفتوح
    const book = box(sh, new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.9 }), 0.3, 0.018, 0.22, -0.12 + rand() * 0.2, 0.78, 0.24)
    book.rotation.y = (rand() - 0.5) * 0.7
    g.add(noShadow(book))
  }
  if (rand() < 0.55) {
    // كوباية أقلام
    const cupG = new THREE.Group()
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.1, 10), sh.navyMat)
    holder.position.y = 0.05
    cupG.add(holder)
    const penColors = [0xffa726, 0x00d2ff, 0xe11d63]
    for (let i = 0; i < 3; i++) {
      const pen = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.17, 5),
        new THREE.MeshStandardMaterial({ color: penColors[i], roughness: 0.5 }),
      )
      pen.position.set((i - 1) * 0.016, 0.13, (i % 2) * 0.014)
      pen.rotation.z = (i - 1) * 0.16
      cupG.add(pen)
    }
    cupG.position.set(0.64, 0.77, -0.02)
    g.add(noShadow(cupG))
  }
  if (rand() < 0.45) {
    // نبتة مكتب صغيرة
    const plant = makePlant(sh, rand, 0.55)
    plant.position.set(-0.42, 0.77, 0.02)
    g.add(plant)
  }
  if (rand() < 0.5) {
    // ورق شغل
    const papers = box(sh, new THREE.MeshStandardMaterial({ color: 0xeef1f6, roughness: 0.95 }), 0.24, 0.008, 0.32, 0.18 - rand() * 0.3, 0.775, 0.26)
    papers.rotation.y = (rand() - 0.5) * 0.5
    g.add(noShadow(papers))
  }
  if (rand() < 0.5) {
    // برج كمبيوتر تحت المكتب بإضاءة سماوية
    const tower = new THREE.Group()
    tower.add(box(sh, sh.darkScreenMat, 0.18, 0.44, 0.42, 0, 0.22, 0))
    const led = new THREE.Mesh(
      sh.box,
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.8 }),
    )
    led.scale.set(0.02, 0.3, 0.02)
    led.position.set(0.095, 0.24, -0.12)
    tower.add(led)
    tower.position.set(-0.58, 0, 0)
    g.add(tower)
  }

  // كرسي بمساند
  const chair = new THREE.Group()
  chair.position.set(0, 0, 0.52)
  if (status === 'offline') chair.rotation.y = 0.7
  chair.add(box(sh, sh.chairMat, 0.52, 0.07, 0.5, 0, 0.46, 0))
  chair.add(box(sh, sh.chairMat, 0.52, 0.6, 0.07, 0, 0.78, 0.26))
  for (const dx of [-0.29, 0.29]) {
    chair.add(box(sh, sh.chairMat, 0.05, 0.16, 0.05, dx, 0.55, 0.02))
    chair.add(box(sh, sh.chairMat, 0.06, 0.045, 0.34, dx, 0.64, 0.02))
  }
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

  // أرضية خشب دافئ بتكسشر ألواح، مموّجة بلون القسم بخفة
  const floorTex = tiled(sh, sh.woodFloorTex, Math.max(1, Math.round(w / 2.4)), Math.max(1, Math.round(d / 2.4)))
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.65, envMapIntensity: 0.45 })
  floorMat.color.copy(new THREE.Color(0xffffff).lerp(accent, 0.07))
  const floor = box(sh, floorMat, w, 0.12, d, 0, 0.06, 0)
  g.add(floor)
  // سجادة هادية تحت منطقة المكاتب بدرجة من لون القسم
  const rugMat = new THREE.MeshStandardMaterial({
    color: accent.clone().lerp(new THREE.Color(0x2a2118), 0.72),
    roughness: 1,
    transparent: true,
    opacity: 0.42,
  })
  const rug = new THREE.Mesh(sh.box, rugMat)
  rug.scale.set(Math.max(w - 1.1, 1), 0.012, Math.max(d - 1.3, 1))
  rug.position.set(0, 0.125, 0.1)
  rug.receiveShadow = true
  g.add(rug)

  // إطار وهيكل زجاجي
  const H = 2.65
  for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) {
    g.add(box(sh, sh.frameMat, 0.15, H, 0.15, px, H / 2, pz))
  }
  g.add(box(sh, sh.frameMat, w + 0.15, 0.16, 0.16, 0, H, -d / 2))
  g.add(box(sh, sh.frameMat, w + 0.15, 0.16, 0.16, 0, H, d / 2))
  g.add(box(sh, sh.frameMat, 0.16, 0.16, d + 0.15, -w / 2, H, 0))
  g.add(box(sh, sh.frameMat, 0.16, 0.16, d + 0.15, w / 2, H, 0))
  // عوارض وسيطة بتقسم الزجاج لألواح (إحساس الرندر)
  g.add(box(sh, sh.frameMat, w + 0.1, 0.07, 0.08, 0, H * 0.52, -d / 2))
  g.add(box(sh, sh.frameMat, w + 0.1, 0.07, 0.08, 0, H * 0.52, d / 2))
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
    new THREE.PlaneGeometry(Math.min(2.4, w * 0.48), 1.4),
    new THREE.MeshStandardMaterial({ map: sh.boardTex, roughness: 0.55, envMapIntensity: 0.4 }),
  )
  board.position.set(-w / 4, 1.62, -d / 2 + 0.05)
  g.add(board)
  g.add(box(sh, sh.woodDarkMat, Math.min(2.5, w * 0.5), 1.5, 0.04, -w / 4, 1.62, -d / 2 + 0.02))

  // ساعة حائط + لوحة فنية على الحيطة الخلفية
  const clock = new THREE.Mesh(
    new THREE.CircleGeometry(0.21, 24),
    new THREE.MeshStandardMaterial({ map: sh.clockTex, roughness: 0.5 }),
  )
  clock.position.set(w / 2 - 0.62, 2.0, -d / 2 + 0.045)
  g.add(clock)
  const clockRim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 8, 28), sh.woodDarkMat)
  clockRim.position.copy(clock.position)
  g.add(clockRim)
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.58),
    new THREE.MeshStandardMaterial({ map: sh.artTexs[Math.floor(rand() * sh.artTexs.length)], roughness: 0.6 }),
  )
  art.position.set(w / 4 + 0.3, 1.78, -d / 2 + 0.05)
  g.add(art)
  g.add(box(sh, sh.woodDarkMat, 0.86, 0.66, 0.035, w / 4 + 0.3, 1.78, -d / 2 + 0.025))
  // ملاحظات لاصقة ملوّنة جنب السبورة
  const noteColors = [0xffa726, 0xffd54f, 0xff7bac, 0x00d2ff, 0x34d399]
  for (let i = 0; i < 5; i++) {
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.11),
      new THREE.MeshStandardMaterial({ color: noteColors[i], roughness: 0.9 }),
    )
    note.position.set(-w / 4 + Math.min(1.35, w * 0.27) + (i % 2) * 0.15, 2.14 - Math.floor(i / 2) * 0.17, -d / 2 + 0.045)
    note.rotation.z = (rand() - 0.5) * 0.25
    g.add(note)
  }

  // مكتبة على جنب — كتب أكتر ونبتة وصندوق فوقها
  if (rand() > 0.3) {
    const shelf = new THREE.Group()
    shelf.position.set(w / 2 - 0.35, 0, -d / 2 + 0.55)
    shelf.add(box(sh, sh.woodDarkMat, 0.5, 1.7, 0.9, 0, 0.85, 0))
    const bookColors = [0x3b3fa3, 0xb45309, 0x0e7490, 0x7c2d4e, 0x4d7c0f, 0xc2410c, 0x155e75]
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      let bx = -0.19
      while (bx < 0.16) {
        if (rand() < 0.18) {
          bx += 0.05
          continue
        }
        const bw = 0.045 + rand() * 0.035
        const bh = 0.3 + rand() * 0.12
        for (const bz of [-0.22, 0.08]) {
          const book = box(
            sh,
            new THREE.MeshStandardMaterial({ color: bookColors[Math.floor(rand() * bookColors.length)], roughness: 0.85 }),
            bw, bh, 0.2,
            bx, 0.32 + sIdx * 0.48 + bh / 2, bz,
          )
          book.castShadow = false
          shelf.add(book)
        }
        bx += bw + 0.012
      }
    }
    const topPlant = makePlant(sh, rand, 0.6)
    topPlant.position.set(-0.08, 1.7, -0.18)
    shelf.add(topPlant)
    shelf.add(box(sh, new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.85 }), 0.3, 0.18, 0.34, 0.02, 1.79, 0.2))
    g.add(shelf)
  }

  // خزانة منخفضة على الحيطة الخلفية للغرف الواسعة
  if (w > 6.4) {
    const credenza = new THREE.Group()
    credenza.add(box(sh, sh.woodMat, 1.7, 0.52, 0.42, 0, 0.38, 0))
    credenza.add(box(sh, sh.woodDarkMat, 1.74, 0.05, 0.46, 0, 0.66, 0))
    const cp = makePlant(sh, rand, 0.7)
    cp.position.set(-0.55, 0.68, 0)
    credenza.add(cp)
    const stack = box(sh, new THREE.MeshStandardMaterial({ color: 0xeef1f6, roughness: 0.95 }), 0.3, 0.07, 0.24, 0.45, 0.72, 0)
    stack.rotation.y = 0.3
    credenza.add(stack)
    credenza.position.set(w / 4 - 0.4, 0.12, -d / 2 + 0.32)
    g.add(credenza)
  }

  // لمبة سقف متدلية بغطاء مخروطي
  const lampCount = w > 7 ? 2 : 1
  for (let i = 0; i < lampCount; i++) {
    const lx = lampCount === 1 ? 0 : (i === 0 ? -w / 4 : w / 4)
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6), sh.frameMat)
    cord.position.set(lx, H - 0.25, 0)
    g.add(cord)
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.17, 0.16, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x22345c, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide, emissive: AMBER, emissiveIntensity: 0.25 }),
    )
    shade.position.set(lx, H - 0.55, 0)
    g.add(shade)
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xffca7a, emissive: AMBER, emissiveIntensity: 2.6 }),
    )
    bulb.position.set(lx, H - 0.64, 0)
    g.add(bulb)
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sh.glowTex, color: AMBER, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    glow.scale.set(1.0, 1.0, 1)
    glow.position.copy(bulb.position)
    g.add(glow)
  }

  // إضاءة داخلية دافئة — بتدي إحساس الجولة ٢ (لمبات كهرمانية فوق خشب دافئ)
  const innerLight = new THREE.PointLight(0xffd9a0, 24, Math.max(w, d) * 1.8, 1.8)
  innerLight.position.set(0, 2.1, 0.2)
  g.add(innerLight)

  // نباتات في الأركان الأمامية + متدلية من العارضة الأمامية
  for (const s of [-1, 1]) {
    const plant = rand() > 0.5 ? makeLushPlant(sh, rand, 0.8 + rand() * 0.25) : makePlant(sh, rand, 0.95 + rand() * 0.4)
    plant.position.set(s * (w / 2 - 0.45), 0.1, d / 2 - 0.45)
    g.add(plant)
    const hanging = makeHangingPlant(sh, rand)
    hanging.position.set(s * (w / 2 - 0.55), H - 0.05, d / 2 - 0.12)
    g.add(hanging)
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

  const marbleTex = tiled(sh, sh.marbleTex, 5, 5)
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 0.12, 56),
    new THREE.MeshStandardMaterial({ map: marbleTex, roughness: 0.28, metalness: 0.05, envMapIntensity: 0.9 }),
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

  // مكتب استقبال منحني + موظفة استقبال + إكسسوارات الكاونتر
  const reception = new THREE.Group()
  const counter = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 0.98, 28, 1, false, -Math.PI / 3, (Math.PI * 2) / 3),
    new THREE.MeshStandardMaterial({ color: 0x2b4a7f, roughness: 0.25, metalness: 0.75, envMapIntensity: 1.3 }),
  )
  counter.position.y = 0.49
  counter.castShadow = true
  reception.add(counter)
  const counterTop = new THREE.Mesh(
    new THREE.CylinderGeometry(1.74, 1.74, 0.05, 28, 1, false, -Math.PI / 3, (Math.PI * 2) / 3),
    new THREE.MeshStandardMaterial({ map: sh.marbleTex, roughness: 0.3, envMapIntensity: 0.8 }),
  )
  counterTop.position.y = 1.0
  reception.add(counterTop)
  const counterGlow = new THREE.Mesh(
    new THREE.TorusGeometry(1.71, 0.025, 8, 40, (Math.PI * 2) / 3),
    new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 2 }),
  )
  counterGlow.rotation.x = Math.PI / 2
  counterGlow.rotation.z = Math.PI / 6
  counterGlow.position.y = 0.3
  reception.add(counterGlow)
  const host = makeFigure('reception-host', { standing: true })
  host.group.position.set(0, 0.1, -0.55)
  host.group.rotation.y = Math.PI
  reception.add(host.group)
  const counterPlant = makePlant(sh, rand, 0.6)
  counterPlant.position.set(0.85, 1.02, 0.55)
  reception.add(counterPlant)
  const counterScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.3),
    new THREE.MeshStandardMaterial({ map: sh.screenTexs[0], emissive: 0xffffff, emissiveMap: sh.screenTexs[0], emissiveIntensity: 0.9 }),
  )
  counterScreen.position.set(-0.8, 1.22, 0.5)
  counterScreen.rotation.y = 0.5
  counterScreen.rotation.x = -0.1
  reception.add(counterScreen)
  g.add(reception)

  // كنبتان وقعدة جانبية — وسايد ملوّنة فوق الكحلي
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
    const cushionAmber = new THREE.MeshStandardMaterial({ color: 0xffc46b, roughness: 0.95 })
    const cushionCream = new THREE.MeshStandardMaterial({ color: 0xe8dcc3, roughness: 0.95 })
    sofa.add(box(sh, cushionCream, 0.42, 0.36, 0.1, -0.42, 0.62, -0.24))
    sofa.add(box(sh, cushionAmber, 0.42, 0.36, 0.1, 0.42, 0.62, -0.24))
    g.add(sofa)
    const table = box(sh, sh.woodMat, 0.9, 0.06, 0.5, Math.cos(a) * (R - 3.1), 0.42, Math.sin(a) * (R - 3.1))
    g.add(table)
    const tablePlant = makePlant(sh, rand, 0.5)
    tablePlant.position.set(Math.cos(a) * (R - 3.1), 0.45, Math.sin(a) * (R - 3.1))
    g.add(tablePlant)
  }

  // موظفان واقفان بيتكلموا جنب الاستقبال (حياة في الساحة — زينة مش بيانات)
  const talker1 = makeFigure('plaza-talker-1', { standing: true, present: true })
  talker1.group.position.set(2.6, 0.1, 1.7)
  talker1.group.rotation.y = -2.2
  g.add(talker1.group)
  const talker2 = makeFigure('plaza-talker-2', { standing: true })
  talker2.group.position.set(3.3, 0.1, 2.5)
  talker2.group.rotation.y = 0.9
  g.add(talker2.group)

  // أحواض زرع مستطيلة بنباتات كبيرة حوالين الساحة
  for (const a of [0.45, 2.95, 5.35]) {
    const planter = new THREE.Group()
    planter.add(box(sh, sh.woodDarkMat, 1.5, 0.42, 0.52, 0, 0.21, 0))
    const lush = makeLushPlant(sh, rand, 1.05)
    lush.position.set(-0.35, 0.4, 0)
    planter.add(lush)
    const lush2 = makeLushPlant(sh, rand, 0.85)
    lush2.position.set(0.38, 0.4, 0)
    planter.add(lush2)
    planter.position.set(Math.cos(a) * (R - 1.05), 0.1, Math.sin(a) * (R - 1.05))
    planter.rotation.y = -a + Math.PI / 2
    g.add(planter)
  }

  // نباتات فردية حوالين الساحة
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.9
    const plant = makeLushPlant(sh, rand, 1.1 + rand() * 0.4)
    plant.position.set(Math.cos(a) * (R - 0.75), 0.1, Math.sin(a) * (R - 0.75))
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
  // أرضية بلاط داكن لامع بين المنصة والغرف
  const groundTex = tiled(sh, sh.tileTex, Math.round(layout.extent / 1.05), Math.round(layout.extent / 1.05))
  const ground = box(
    sh,
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.38, metalness: 0.28, envMapIntensity: 0.7 }),
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
    for (const t of sh.screenTexs) t.dispose()
    sh.boardTex.dispose()
    sh.clockTex.dispose()
    for (const t of sh.artTexs) t.dispose()
    sh.woodFloorTex.dispose()
    sh.woodGrainTex.dispose()
    sh.marbleTex.dispose()
    sh.tileTex.dispose()
    for (const t of sh.extraTextures) t.dispose()
    sh.zzzTex.dispose()
    sh.glowTex.dispose()
  }

  return { group, pickables, anchors, tick, dispose }
}
