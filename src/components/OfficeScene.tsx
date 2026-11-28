import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import type { OfficeData } from '../office/types'
import { computeLayout } from '../office/layout'
import { buildOfficeScene, type BuiltOffice } from '../office/scene'
import { loadOfficeAssets, type OfficeAssets } from '../office/assets'

/*
 * غلاف React حول مشهد المقر ثلاثي الأبعاد.
 * المشهد بيتبني من البيانات بس (computeLayout + buildOfficeScene) —
 * أي تغيير في البيانات يعيد بناء المشهد تلقائيًا.
 * الكاميرا بزاوية isometric مقيدة (موبايل أولًا): تدوير محدود + زوم محدود، بلا إزاحة حرة.
 */

interface Props {
  data: OfficeData
  selectedId: string | null
  onSelect: (id: string | null) => void
}

interface Runtime {
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  built: BuiltOffice | null
  /** أصول GLTF (شخصيات/أثاث) — بتتحمل مرة واحدة وبعدين المشهد بيتبني بيها */
  assets: OfficeAssets | null
  ring: THREE.Mesh
  dirLight: THREE.DirectionalLight
  lastExtent: number
  raf: number
}

export default function OfficeScene({ data, selectedId, onSelect }: Props) {
  const [glFailed, setGlFailed] = useState(false)
  const mountRef = useRef<HTMLDivElement>(null)
  const rtRef = useRef<Runtime | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  /* إقلاع المحرك مرة واحدة */
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      /* WebGL مش متاح (متصفح قديم/وضع توفير) — الصفحة تكمل ببديل نصي بدل ما تقع */
      setGlFailed(true)
      return
    }
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const isSmallScreen = window.innerWidth < 640
    /* سقف نسبة البكسل أخف على الشاشات الصغيرة — قيد أداء موبايل حقيقي */
    const pixelRatio = Math.min(
      window.devicePixelRatio,
      window.innerWidth < 640 ? 1.6 : 2,
    )
    renderer.setPixelRatio(pixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    /* بيئة إضاءة إجرائية — بتدي الزجاج والمعدن والخشب انعكاسات غنية زي الرندر */
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    ;(scene as unknown as { environmentIntensity?: number }).environmentIntensity = 0.5
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400)

    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x3a2f22, 1.35)
    scene.add(hemi)
    scene.add(new THREE.AmbientLight(0xffe8c4, 0.3))
    const dirLight = new THREE.DirectionalLight(0xfff1d6, 2.05)
    dirLight.position.set(16, 26, 10)
    dirLight.castShadow = true
    /* خريطة ظل أخف على الموبايل — 2048 على شاشة صغيرة تكلفة GPU بلا فرق بصري يذكر */
    const shadowSize = isSmallScreen ? 1024 : 2048
    dirLight.shadow.mapSize.set(shadowSize, shadowSize)
    dirLight.shadow.bias = -0.0004
    dirLight.shadow.normalBias = 0.03
    scene.add(dirLight)

    /*
     * معالجة لاحقة سينمائية خفيفة (جولة الجودة ٣): Bloom خفيف على اللمعات
     * السماوية واللمبات بس (عتبة عالية) + OutputPass للـtone mapping.
     * GTAO/SSAO اترفضت بوعي: تكلفتها على موبايل حقيقي عالية، وبديلها عندنا
     * ظلال تلامس مرسومة في المشهد نفسه (blob shadows) + ظلال PCFSoft أعمق.
     */
    const composer = new EffectComposer(renderer)
    composer.setPixelRatio(pixelRatio)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.35, 1.6)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    const fill = new THREE.DirectionalLight(0xffe2b8, 0.55)
    fill.position.set(-14, 10, -16)
    scene.add(fill)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 40),
      new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.16
    ring.visible = false
    scene.add(ring)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minPolarAngle = 0.72
    controls.maxPolarAngle = 1.12
    controls.minAzimuthAngle = -0.85
    controls.maxAzimuthAngle = 0.85
    controls.target.set(0, 0.4, 0)

    const rt: Runtime = {
      renderer, composer, scene, camera, controls,
      built: null, assets: null, ring, dirLight, lastExtent: 0, raf: 0,
    }
    rtRef.current = rt

    const fitCamera = (extent: number) => {
      const dist = extent * 2.02
      camera.position.set(dist * 0.62, dist * 0.6, dist * 0.62)
      controls.minDistance = extent * 0.7
      controls.maxDistance = extent * 3.1
      const s = extent + 3
      const cam = dirLight.shadow.camera
      cam.left = -s
      cam.right = s
      cam.top = s
      cam.bottom = -s
      cam.far = 90
      cam.updateProjectionMatrix()
      controls.update()
    }

    const rebuild = () => {
      const layout = computeLayout(dataRef.current)
      if (rt.built) {
        scene.remove(rt.built.group)
        rt.built.dispose()
      }
      const built = buildOfficeScene(layout, rt.assets)
      rt.built = built
      scene.add(built.group)
      if (Math.abs(layout.extent - rt.lastExtent) > 0.01) {
        rt.lastExtent = layout.extent
        fitCamera(layout.extent)
      }
    }
    rebuild()
    /*
     * أصول الشخصيات/الأثاث بتتحمل في الخلفية: أول بناء بيطلع فورًا بالاحتياطي
     * الإجرائي، ولما الأصول تجهز المشهد بيتبني من جديد بيها. فشل التحميل
     * بيخلّي الاحتياطي شغال — الصفحة ما بتقعش أبدًا علشان أصل خارجي.
     */
    let cancelled = false
    loadOfficeAssets()
      .then((assets) => {
        if (cancelled) return
        rt.assets = assets
        rebuild()
      })
      .catch(() => { /* الاحتياطي الإجرائي بيكمّل */ })

    /* اختيار باللمس/النقر — بنفرّق بين السحب للنقر بمسافة الحركة */
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downX = 0
    let downY = 0
    const onDown = (ev: PointerEvent) => {
      downX = ev.clientX
      downY = ev.clientY
    }
    const onUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 7) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = rt.built ? raycaster.intersectObjects(rt.built.pickables, false) : []
      const hit = hits.find((h) => h.object.userData.employeeId)
      onSelectRef.current(hit ? (hit.object.userData.employeeId as string) : null)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      composer.setSize(w, h)
      camera.aspect = w / h
      /* موبايل portrait: بنوسّع زاوية الرؤية رأسيًا علشان المقر كله يبان من غير قصّ أفقي */
      camera.fov = camera.aspect < 1 ? Math.min(38 / Math.max(camera.aspect, 0.5), 74) : 38
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    /*
     * إيقاف الرندر لما المشهد برّه الشاشة أو التبويب مخفي — المشهد ثلاثي الأبعاد
     * أتقل عنصر في الصفحة، وتشغيله في الخلفية بياكل بطارية موبايل المالك بلا أي فايدة.
     */
    let onScreen = true
    let tabVisible = !document.hidden
    const io = new IntersectionObserver((entries) => {
      onScreen = entries[0]?.isIntersecting ?? true
    })
    io.observe(mount)
    const onVis = () => {
      tabVisible = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)

    const clock = new THREE.Clock()
    const loop = () => {
      rt.raf = requestAnimationFrame(loop)
      if (!onScreen || !tabVisible) return
      /* تقليل الحركة: المشهد ثابت (زمن صفر) — لا نبض حلقة ولا حركة شخصيات */
      const t = reducedMotion ? 0 : clock.getElapsedTime()
      rt.built?.tick(t)
      if (ring.visible && !reducedMotion) {
        const s = 1 + Math.sin(t * 3) * 0.06
        ring.scale.set(s, s, 1)
      }
      controls.update()
      composer.render()
    }
    loop()

    return () => {
      cancelled = true
      cancelAnimationFrame(rt.raf)
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      if (rt.built) {
        rt.built.dispose()
        rt.built = null
      }
      ring.geometry.dispose()
      ;(ring.material as THREE.Material).dispose()
      bloom.dispose()
      composer.dispose()
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      rtRef.current = null
    }
  }, [])

  /* إعادة البناء عند تغيّر البيانات */
  useEffect(() => {
    const rt = rtRef.current
    if (!rt) return
    const layout = computeLayout(data)
    if (rt.built) {
      rt.scene.remove(rt.built.group)
      rt.built.dispose()
    }
    const built = buildOfficeScene(layout, rt.assets)
    rt.built = built
    rt.scene.add(built.group)
    if (Math.abs(layout.extent - rt.lastExtent) > 0.01) {
      rt.lastExtent = layout.extent
      const dist = layout.extent * 2.02
      rt.camera.position.set(dist * 0.62, dist * 0.6, dist * 0.62)
      rt.controls.minDistance = layout.extent * 0.7
      rt.controls.maxDistance = layout.extent * 3.1
      const s = layout.extent + 3
      const cam = rt.dirLight.shadow.camera
      cam.left = -s
      cam.right = s
      cam.top = s
      cam.bottom = -s
      cam.far = 90
      cam.updateProjectionMatrix()
      rt.controls.update()
    }
  }, [data])

  /* حلقة التمييز حول الموظف المختار */
  useEffect(() => {
    const rt = rtRef.current
    if (!rt) return
    if (!selectedId || !rt.built) {
      rt.ring.visible = false
      return
    }
    const anchor = rt.built.anchors.get(selectedId)
    if (!anchor) {
      rt.ring.visible = false
      return
    }
    rt.scene.updateMatrixWorld()
    const pos = new THREE.Vector3()
    anchor.getWorldPosition(pos)
    rt.ring.position.set(pos.x, 0.17, pos.z)
    rt.ring.visible = true
  }, [selectedId, data])

  if (glFailed) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted" role="note">
        المشهد ثلاثي الأبعاد مش متاح على الجهاز/المتصفح ده (WebGL) — بيانات الفريق والأقسام
        تحت المشهد شغالة عادي، والمقر بيفتح كامل على أي جهاز بيدعم WebGL.
      </div>
    )
  }
  return (
    <div
      ref={mountRef}
      className="h-full w-full touch-none [&>canvas]:block"
      role="application"
      aria-label="مشهد المقر الافتراضي ثلاثي الأبعاد — اضغط على أي موظف لعرض بطاقته"
    />
  )
}
