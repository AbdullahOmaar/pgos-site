import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { OfficeData } from '../office/types'
import { computeLayout } from '../office/layout'
import { buildOfficeScene, type BuiltOffice } from '../office/scene'

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
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  built: BuiltOffice | null
  ring: THREE.Mesh
  dirLight: THREE.DirectionalLight
  lastExtent: number
  raf: number
}

export default function OfficeScene({ data, selectedId, onSelect }: Props) {
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400)

    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x1a2440, 0.85)
    scene.add(hemi)
    const dirLight = new THREE.DirectionalLight(0xfff1d6, 1.6)
    dirLight.position.set(16, 26, 10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(2048, 2048)
    dirLight.shadow.bias = -0.0004
    scene.add(dirLight)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35)
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
      renderer, scene, camera, controls,
      built: null, ring, dirLight, lastExtent: 0, raf: 0,
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
      const built = buildOfficeScene(layout)
      rt.built = built
      scene.add(built.group)
      if (Math.abs(layout.extent - rt.lastExtent) > 0.01) {
        rt.lastExtent = layout.extent
        fitCamera(layout.extent)
      }
    }
    rebuild()

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
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const clock = new THREE.Clock()
    const loop = () => {
      rt.raf = requestAnimationFrame(loop)
      const t = clock.getElapsedTime()
      rt.built?.tick(t)
      if (ring.visible) {
        const s = 1 + Math.sin(t * 3) * 0.06
        ring.scale.set(s, s, 1)
      }
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(rt.raf)
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
    const built = buildOfficeScene(layout)
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

  return (
    <div
      ref={mountRef}
      className="h-full w-full touch-none [&>canvas]:block"
      role="application"
      aria-label="مشهد المقر الافتراضي ثلاثي الأبعاد — اضغط على أي موظف لعرض بطاقته"
    />
  )
}
