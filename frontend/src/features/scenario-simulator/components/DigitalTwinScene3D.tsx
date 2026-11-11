import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DigitalTwinCanvas2D, type DigitalTwinViewportProps } from './DigitalTwinCanvas2D'

const MAX_PARTICLES_PER_EDGE = 2

export function DigitalTwinScene3D(props: DigitalTwinViewportProps & { force2D?: boolean }) {
  const {
    zones,
    nodes,
    edges,
    activeEdgeIds,
    events,
    activeStepIndex,
    selectedZoneId,
    selectedNodeId,
    selectedEdgeId,
    onSelectZone,
    onSelectNode,
    onSelectEdge,
    isPlaying,
    playbackSpeed,
    animateParticles,
    showBaselineFlow,
    reducedMotion,
    cameraPreset = 'iso',
    dark3D,
    resultsMap,
    aiModels,
    force2D = false,
  } = props

  const mountRef = useRef<HTMLDivElement>(null)
  const [webglFailed, setWebglFailed] = useState(false)
  const [hoverInfo, setHoverInfo] = useState<{ label: string; sub: string } | null>(null)

  // Keep latest callbacks & playback props accessible inside animation loop without recreating scene
  const callbacksRef = useRef({ onSelectZone, onSelectNode, onSelectEdge })
  callbacksRef.current = { onSelectZone, onSelectNode, onSelectEdge }

  const playbackRef = useRef({
    isPlaying,
    playbackSpeed,
    animateParticles,
    reducedMotion,
    activeStepIndex,
    activeEdgeId: activeStepIndex >= 0 && activeStepIndex < events.length ? events[activeStepIndex].edge_id : null,
  })
  playbackRef.current = {
    isPlaying,
    playbackSpeed,
    animateParticles,
    reducedMotion,
    activeStepIndex,
    activeEdgeId: activeStepIndex >= 0 && activeStepIndex < events.length ? events[activeStepIndex].edge_id : null,
  }

  const cameraRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null)

  const nodePositions = useMemo(() => {
    const zoneMap = new Map(zones.map((z) => [z.id, z]))
    const grouped: Record<string, typeof nodes> = {}
    for (const n of nodes) (grouped[n.zone_id] ??= []).push(n)

    const out: Record<string, THREE.Vector3> = {}
    for (const [zid, list] of Object.entries(grouped)) {
      const z = zoneMap.get(zid)
      const [zx, zy, zz] = z?.position || [0, 0, 0]
      const cols = zid === 'ai_engine' ? 4 : Math.min(3, list.length)
      list.forEach((n, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const ox = (col - (cols - 1) / 2) * 1.45
        const oz = (row - Math.floor((list.length - 1) / cols) / 2) * 1.4
        out[n.id] = new THREE.Vector3(zx + ox, zy + 0.65, zz + oz)
      })
    }
    return out
  }, [zones, nodes])

  // Apply Camera presets smoothly when changed
  useEffect(() => {
    const camCtx = cameraRef.current
    if (!camCtx) return
    const { camera, controls } = camCtx
    if (cameraPreset === 'reset' || cameraPreset === 'iso') {
      camera.position.set(1.5, 17.5, 22.0)
      controls.target.set(0, 0.5, 0)
    } else if (cameraPreset === 'top') {
      camera.position.set(0.01, 29.0, 2.0)
      controls.target.set(0, 0, 0)
    } else if (cameraPreset === 'focus_zone' && selectedZoneId) {
      const z = zones.find((item) => item.id === selectedZoneId)
      if (z) {
        const [zx, zy, zz] = z.position
        camera.position.set(zx + 4.5, zy + 8.5, zz + 9.5)
        controls.target.set(zx, zy + 0.5, zz)
      }
    } else if (cameraPreset === 'focus_flow') {
      camera.position.set(-2.0, 12.5, 17.5)
      controls.target.set(2.5, 0.8, 0)
    }
    controls.update()
  }, [cameraPreset, selectedZoneId, zones])

  useEffect(() => {
    if (force2D || webglFailed) return
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth || 720
    const height = container.clientHeight || 500

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height)
      renderer.setClearColor(dark3D ? 0x0f172a : 0xf8fafc, 1)
      container.innerHTML = ''
      container.appendChild(renderer.domElement)
    } catch {
      setWebglFailed(true)
      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120)
    camera.position.set(1.5, 17.5, 22.0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 8
    controls.maxDistance = 42
    controls.maxPolarAngle = Math.PI * 0.46
    controls.target.set(0, 0.5, 0)
    controls.update()
    cameraRef.current = { camera, controls }

    // Enterprise Studio Lighting
    const ambient = new THREE.AmbientLight(0xffffff, dark3D ? 0.72 : 0.95)
    scene.add(ambient)
    const keyLight = new THREE.DirectionalLight(0xffffff, dark3D ? 1.25 : 0.95)
    keyLight.position.set(12, 24, 16)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0x93c5fd, dark3D ? 0.5 : 0.4)
    fillLight.position.set(-14, 10, -12)
    scene.add(fillLight)

    // Floor Architectural Grid
    const grid = new THREE.GridHelper(38, 38, dark3D ? 0x334155 : 0xcbd5e1, dark3D ? 0x1e293b : 0xe2e8f0)
    grid.position.y = -0.02
    scene.add(grid)

    const pickables: THREE.Object3D[] = []
    const disposables: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] } = {
      geometries: [],
      materials: [],
    }
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposables.geometries.push(g)
      return g
    }
    const trackMat = <T extends THREE.Material>(m: T): T => {
      disposables.materials.push(m)
      return m
    }

    const activeEvt = activeStepIndex >= 0 && activeStepIndex < events.length ? events[activeStepIndex] : null
    const modelStatusMap = new Map(aiModels.map((m) => [m.id, m.status]))
    const activeEdgeSet = new Set(activeEdgeIds)

    // 1. Build Business Zone Architectural Platforms & Inventory 3D Warehouse Shelves
    zones.forEach((z) => {
      const [zx, zy, zz] = z.position
      const isAiHub = z.id === 'ai_engine'
      const isSelected = selectedZoneId === z.id || activeEvt?.zone_id === z.id
      const isUnsupported = z.baseline && z.baseline.supported === false
      const w = isAiHub ? 6.4 : z.id === 'outcomes' ? 4.4 : 4.8
      const d = isAiHub ? 3.8 : 3.4

      const baseGeo = trackGeo(new THREE.BoxGeometry(w, 0.34, d))
      const baseColor = dark3D ? 0x1e293b : 0xffffff
      const baseMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: baseColor,
          roughness: 0.45,
          metalness: 0.08,
          transparent: isUnsupported,
          opacity: isUnsupported ? 0.72 : 1,
        })
      )
      const mesh = new THREE.Mesh(baseGeo, baseMat)
      mesh.position.set(zx, zy + 0.16, zz)
      mesh.userData = { pickType: 'zone', id: z.id, label: z.name, sub: z.department }
      scene.add(mesh)
      pickables.push(mesh)

      // Accent border stripe around Zone
      const rimGeo = trackGeo(new THREE.BoxGeometry(w + 0.14, 0.08, d + 0.14))
      const rimColor = isSelected ? 0xea580c : isUnsupported ? 0x94a3b8 : new THREE.Color(z.color).getHex()
      const rimMat = trackMat(new THREE.MeshBasicMaterial({ color: rimColor }))
      const rim = new THREE.Mesh(rimGeo, rimMat)
      rim.position.set(zx, zy + 0.04, zz)
      scene.add(rim)

      // 3D Warehouse Shelf Rack + Dynamic Stock Crates inside Inventory Zone
      if (z.id === 'inventory') {
        const closing = resultsMap.closing_inventory_units?.scenario_value
        const risk = resultsMap.inventory_risk_units?.scenario_value
        const ratioFill =
          closing != null
            ? Math.max(0.15, Math.min(1, Number(closing) / Math.max(120, Number(closing) + Number(risk || 0))))
            : 0.65

        for (let col = -1; col <= 1; col += 2) {
          const postGeo = trackGeo(new THREE.BoxGeometry(0.12, 1.35, 0.12))
          const postMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x64748b }))
          const post = new THREE.Mesh(postGeo, postMat)
          post.position.set(zx + col * 1.65, zy + 0.85, zz - 1.15)
          scene.add(post)
        }
        const shelfGeo = trackGeo(new THREE.BoxGeometry(3.4, 0.08, 0.8))
        const shelfMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x94a3b8 }))
        const shelf = new THREE.Mesh(shelfGeo, shelfMat)
        shelf.position.set(zx, zy + 0.95, zz - 1.15)
        scene.add(shelf)

        // Stock level crates
        const crateColor = risk && risk > 0 ? 0xea580c : 0x16a34a
        for (let b = 0; b < 4; b++) {
          const filled = (b + 1) / 4 <= ratioFill + 0.12
          const crateGeo = trackGeo(new THREE.BoxGeometry(0.58, filled ? 0.52 : 0.16, 0.55))
          const crateMat = trackMat(
            new THREE.MeshStandardMaterial({
              color: filled ? crateColor : 0xcbd5e1,
              roughness: 0.4,
            })
          )
          const crate = new THREE.Mesh(crateGeo, crateMat)
          crate.position.set(zx - 1.05 + b * 0.7, zy + 1.0 + (filled ? 0.28 : 0.1), zz - 1.15)
          crate.userData = {
            pickType: 'zone',
            id: 'inventory',
            label: '3D Warehouse Inventory Stock',
            sub: closing != null ? `Closing: ${Math.round(closing)} units` : 'Baseline warehouse level',
          }
          scene.add(crate)
          pickables.push(crate)
        }
      }
    })

    // 2. Build Nodes atop Zones
    const inputGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.34, 0.44, 18))
    const procGeo = trackGeo(new THREE.BoxGeometry(0.56, 0.42, 0.56))
    const aiGeo = trackGeo(new THREE.OctahedronGeometry(0.36, 0))
    const outGeo = trackGeo(new THREE.DodecahedronGeometry(0.38, 0))

    nodes.forEach((n) => {
      const pos = nodePositions[n.id]
      if (!pos) return
      const modelStatus = n.kind === 'ai_model' ? modelStatusMap.get(n.id) : undefined
      const isDisabledModel = modelStatus === 'not_integrated' || modelStatus === 'unavailable'
      const isCurrent = activeEvt?.node_id === n.id
      const isSelected = selectedNodeId === n.id

      const geo =
        n.kind === 'ai_model'
          ? aiGeo
          : n.kind === 'output'
          ? outGeo
          : n.kind === 'input' || n.kind === 'assumption'
          ? inputGeo
          : procGeo

      const hex = isDisabledModel
        ? 0x94a3b8
        : isCurrent
        ? 0xea580c
        : isSelected
        ? 0x2563eb
        : n.kind === 'ai_model'
        ? 0x0284c7
        : n.kind === 'output'
        ? 0x16a34a
        : 0x3b82f6

      const mat = trackMat(
        new THREE.MeshStandardMaterial({
          color: hex,
          roughness: 0.32,
          metalness: isDisabledModel ? 0.05 : 0.22,
          emissive: isCurrent ? 0xea580c : isSelected ? 0x1d4ed8 : 0x000000,
          emissiveIntensity: isCurrent ? 0.35 : isSelected ? 0.2 : 0,
        })
      )
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(pos)
      mesh.userData = {
        pickType: 'node',
        id: n.id,
        label: n.label,
        sub: modelStatus ? `Model status: ${modelStatus.replace('_', ' ')}` : n.kind.toUpperCase(),
      }
      scene.add(mesh)
      pickables.push(mesh)
    })

    // 3. Build Directed Edge Curves & Arrow Cones + Precompute Curves for Pooled Particle InstancedMesh
    const curveEntries: Array<{
      edgeId: string
      curve: THREE.CatmullRomCurve3
      isActive: boolean
      isCurrent: boolean
    }> = []
    const coneGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.28, 10))

    edges.forEach((e) => {
      const p1 = nodePositions[e.source]
      const p2 = nodePositions[e.target]
      if (!p1 || !p2) return
      const isPipe = activeEdgeSet.has(e.id)
      const isCurrent = activeEvt?.edge_id === e.id
      const isSelEdge = selectedEdgeId === e.id

      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
      mid.y += isPipe ? 1.15 : 0.75
      const curve = new THREE.CatmullRomCurve3([p1.clone(), mid, p2.clone()])
      const tubeGeo = trackGeo(new THREE.TubeGeometry(curve, 20, isCurrent || isSelEdge ? 0.075 : isPipe ? 0.05 : 0.024, 6, false))
      const tubeMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: isCurrent || isSelEdge ? 0xea580c : isPipe ? 0x2563eb : dark3D ? 0x334155 : 0xcbd5e1,
          transparent: true,
          opacity: isCurrent || isSelEdge ? 0.96 : isPipe ? 0.72 : 0.32,
        })
      )
      const tube = new THREE.Mesh(tubeGeo, tubeMat)
      tube.userData = { pickType: 'edge', id: e.id, label: e.label, sub: `${e.source} → ${e.target}` }
      scene.add(tube)
      pickables.push(tube)

      // Parallel baseline flow comparison path
      if (showBaselineFlow && isPipe) {
        const bCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(p1.x, p1.y - 0.22, p1.z),
          new THREE.Vector3(mid.x, mid.y - 0.32, mid.z),
          new THREE.Vector3(p2.x, p2.y - 0.22, p2.z),
        ])
        const bGeo = trackGeo(new THREE.TubeGeometry(bCurve, 16, 0.025, 5, false))
        const bMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.45 }))
        scene.add(new THREE.Mesh(bGeo, bMat))
      }

      if (isPipe) {
        curveEntries.push({ edgeId: e.id, curve, isActive: true, isCurrent })
        // Direction cone near target
        const tipPt = curve.getPointAt(0.84)
        const tan = curve.getTangentAt(0.84)
        const coneMat = trackMat(new THREE.MeshBasicMaterial({ color: isCurrent ? 0xea580c : 0x2563eb }))
        const cone = new THREE.Mesh(coneGeo, coneMat)
        cone.position.copy(tipPt)
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
        scene.add(cone)
      }
    })

    // 4. Single Pooled InstancedMesh for Flow Particles (Zero per-frame GC allocations)
    const particleCount = Math.max(1, curveEntries.length * MAX_PARTICLES_PER_EDGE)
    const particleGeo = trackGeo(new THREE.SphereGeometry(0.11, 10, 10))
    const particleMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }))
    const particleInstances = new THREE.InstancedMesh(particleGeo, particleMat, particleCount)
    particleInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(particleInstances)

    // Pre-allocated scratch variables strictly outside animate()
    const _pos = new THREE.Vector3()
    const _scale = new THREE.Vector3()
    const _quat = new THREE.Quaternion()
    const _mat4 = new THREE.Matrix4()
    const _colorScenario = new THREE.Color(0x0284c7)
    const _colorStep = new THREE.Color(0xea580c)

    // Pointer picking (only triggers when drag distance <= 6px)
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downX = 0
    let downY = 0

    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX
      downY = ev.clientY
    }
    const onPointerUp = (ev: PointerEvent) => {
      if (!renderer) return
      const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY)
      if (dist > 6) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(pickables, false)
      if (hits.length > 0) {
        const hit = hits[0].object.userData as { pickType?: string; id?: string }
        if (hit.pickType === 'node' && hit.id) callbacksRef.current.onSelectNode(hit.id)
        else if (hit.pickType === 'zone' && hit.id) callbacksRef.current.onSelectZone(hit.id)
        else if (hit.pickType === 'edge' && hit.id) callbacksRef.current.onSelectEdge(hit.id)
      }
    }
    const onPointerMove = (ev: PointerEvent) => {
      if (!renderer) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(pickables, false)
      if (hits.length > 0) {
        const u = hits[0].object.userData as { label?: string; sub?: string }
        setHoverInfo(u.label ? { label: u.label, sub: u.sub || '' } : null)
        renderer.domElement.style.cursor = 'pointer'
      } else {
        setHoverInfo(null)
        renderer.domElement.style.cursor = 'grab'
      }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointermove', onPointerMove)

    const resizeObs = new ResizeObserver(() => {
      if (!container || !renderer) return
      const w = container.clientWidth
      const h = container.clientHeight || 500
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    resizeObs.observe(container)

    let animId = 0
    const clock = new THREE.Clock()
    const animate = () => {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      const pb = playbackRef.current
      const showParticles = pb.animateParticles && !pb.reducedMotion && curveEntries.length > 0

      if (!showParticles) {
        particleInstances.visible = false
      } else {
        particleInstances.visible = true
        let instIdx = 0
        for (let ci = 0; ci < curveEntries.length; ci++) {
          const entry = curveEntries[ci]
          const isStepEdge = pb.activeEdgeId === entry.edgeId
          for (let p = 0; p < MAX_PARTICLES_PER_EDGE; p++) {
            const speed = isStepEdge ? 0.55 * pb.playbackSpeed : 0.25 * pb.playbackSpeed
            const u = pb.isPlaying || isStepEdge ? (t * speed + p / MAX_PARTICLES_PER_EDGE + ci * 0.13) % 1 : 0.5
            entry.curve.getPointAt(u, _pos)
            const s = isStepEdge ? 1.45 : 0.9
            _scale.set(s, s, s)
            _mat4.compose(_pos, _quat, _scale)
            particleInstances.setMatrixAt(instIdx, _mat4)
            particleInstances.setColorAt(instIdx, isStepEdge ? _colorStep : _colorScenario)
            instIdx++
          }
        }
        particleInstances.instanceMatrix.needsUpdate = true
        if (particleInstances.instanceColor) particleInstances.instanceColor.needsUpdate = true
      }

      controls.update()
      renderer?.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      resizeObs.disconnect()
      renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer?.domElement.removeEventListener('pointerup', onPointerUp)
      renderer?.domElement.removeEventListener('pointermove', onPointerMove)
      controls.dispose()
      cameraRef.current = null
      disposables.geometries.forEach((g) => g.dispose())
      disposables.materials.forEach((m) => m.dispose())
      if (renderer) {
        renderer.dispose()
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement)
        }
      }
    }
  }, [
    force2D,
    webglFailed,
    zones,
    nodes,
    edges,
    nodePositions,
    activeEdgeIds,
    selectedZoneId,
    selectedNodeId,
    selectedEdgeId,
    activeStepIndex,
    events,
    showBaselineFlow,
    dark3D,
    resultsMap,
    aiModels,
  ])

  if (force2D || webglFailed) {
    return (
      <div className="space-y-1.5">
        {webglFailed && (
          <div className="text-[11px] px-2 py-1 rounded border" style={{ background: 'var(--info-bg)', borderColor: 'var(--info-border)', color: 'var(--info-text)' }}>
            WebGL context unavailable in this browser/hardware profile — switched automatically to 2D Interactive Digital Twin Architecture view.
          </div>
        )}
        <DigitalTwinCanvas2D {...props} />
      </div>
    )
  }

  return (
    <div className="relative w-full h-[500px] rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div
        ref={mountRef}
        data-testid="digital-twin-canvas-3d"
        className="w-full h-full"
        aria-label="Interactive 3D Business Scenario Digital Twin"
      />

      {/* Accessible Top-Left Zone & Flow Overlay Chips for keyboard / quick selection */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap gap-1 pointer-events-auto">
          {zones.map((z) => {
            const active = selectedZoneId === z.id
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => onSelectZone(z.id)}
                className="px-2 py-1 rounded-md text-[10px] font-semibold border shadow-sm transition-colors"
                style={{
                  background: active ? '#2563EB' : dark3D ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)',
                  color: active ? '#ffffff' : dark3D ? '#e2e8f0' : '#0f172a',
                  borderColor: active ? '#1d4ed8' : dark3D ? '#334155' : '#cbd5e1',
                }}
              >
                {z.name.replace(' Zone', '')}
              </button>
            )
          })}
        </div>

        <div
          className="px-2.5 py-1 rounded-md text-[10px] font-medium border shadow-sm"
          style={{
            background: dark3D ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)',
            color: dark3D ? '#94a3b8' : '#475569',
            borderColor: dark3D ? '#334155' : '#cbd5e1',
          }}
        >
          Drag: Orbit · Scroll: Zoom · Click Zone/Node/Flow
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div
          className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg border shadow-md text-xs pointer-events-none"
          style={{
            background: dark3D ? 'rgba(15,23,42,0.94)' : 'rgba(255,255,255,0.96)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="font-semibold" style={{ color: dark3D ? '#f8fafc' : '#0f172a' }}>
            {hoverInfo.label}
          </div>
          {hoverInfo.sub && (
            <div className="text-[10px]" style={{ color: dark3D ? '#94a3b8' : '#475569' }}>
              {hoverInfo.sub}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

