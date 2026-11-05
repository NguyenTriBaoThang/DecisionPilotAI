import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { moneyCompact, percent, type Row } from '../api'

interface Scenario3DLandscapeProps {
  variants: Row[]
  recommendedName?: string
  onSelectVariant?: (name: string) => void
  metricKey?: 'profit' | 'revenue' | 'demand'
}

export function Scenario3DLandscape({
  variants,
  recommendedName,
  onSelectVariant,
  metricKey = 'profit',
}: Scenario3DLandscapeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState<number>(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !variants || variants.length === 0) return

    const width = container.clientWidth || 500
    const height = 260

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000)
    camera.position.set(0, 3.2, 5.8)
    camera.lookAt(0, 0.4, 0)

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)
    } catch {
      return
    }

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0x8b5cf6, 1.8)
    dirLight.position.set(5, 10, 7)
    scene.add(dirLight)

    const cyanLight = new THREE.PointLight(0x22d3ee, 2, 10)
    cyanLight.position.set(-4, 4, 3)
    scene.add(cyanLight)

    // Platform Group
    const platformGroup = new THREE.Group()
    scene.add(platformGroup)

    // Grid Floor
    const grid = new THREE.GridHelper(8, 16, 0x312e81, 0x1e1b4b)
    grid.position.y = -0.2
    scene.add(grid)

    // Calculate maximum metric value for normalized heights
    const values = variants.map((v) => Number(v[metricKey]) || 0)
    const minVal = Math.min(...values, 0)
    const maxVal = Math.max(...values, 1)
    const valRange = maxVal - minVal || 1

    const displayVariants = variants.slice(0, 4) // Show up to 4 platforms
    const spacing = 1.6
    const startX = -((displayVariants.length - 1) * spacing) / 2

    const meshes: THREE.Mesh[] = []

    displayVariants.forEach((v, idx) => {
      const val = Number(v[metricKey]) || 0
      const normalizedHeight = Math.max(0.3, ((val - minVal) / valRange) * 1.6 + 0.3)
      const isRecommended = String(v.name) === recommendedName
      const isBaseline = idx === 0

      // Cylinder Platform
      const geo = new THREE.CylinderGeometry(0.55, 0.65, normalizedHeight, 32)
      const color = isRecommended
        ? 0x22c55e
        : isBaseline
        ? 0x6366f1
        : idx % 2 === 0
        ? 0x8b5cf6
        : 0x22d3ee

      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.25,
        metalness: 0.65,
        transparent: true,
        opacity: 0.9,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(startX + idx * spacing, normalizedHeight / 2, 0)
      mesh.userData = { idx, name: String(v.name) }
      platformGroup.add(mesh)
      meshes.push(mesh)

      // Top glowing indicator ring
      const ringGeo = new THREE.TorusGeometry(0.5, 0.03, 16, 32)
      const ringMat = new THREE.MeshBasicMaterial({
        color: isRecommended ? 0x4ade80 : 0xa5f3fc,
        transparent: true,
        opacity: 0.8,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(startX + idx * spacing, normalizedHeight + 0.05, 0)
      platformGroup.add(ring)
    })

    // Animation & Smooth Interaction
    let animId: number
    const clock = new THREE.Clock()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      platformGroup.rotation.y = Math.sin(elapsed * 0.4) * 0.12
      if (renderer) {
        renderer.render(scene, camera)
      }
    }
    animate()

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer) return
      const w = container.clientWidth
      camera.aspect = w / height
      camera.updateProjectionMatrix()
      renderer.setSize(w, height)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      if (renderer) {
        renderer.dispose()
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement)
        }
      }
      meshes.forEach((m) => {
        m.geometry.dispose()
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose())
        else m.material.dispose()
      })
    }
  }, [variants, recommendedName, metricKey])

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-[#0c1224] to-[#070b17] p-4 shadow-xl">
      <div className="flex items-center justify-between pb-2 border-b border-indigo-500/10">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold tracking-wider uppercase text-cyan-300">
            3D Scenario Landscape (Interactive Metric View)
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Height represents:</span>
          <span className="font-semibold text-indigo-300 capitalize">{metricKey}</span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[260px] cursor-grab active:cursor-grabbing" />

      {/* Interactive Platform Cards Below */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-3">
        {variants.slice(0, 4).map((variant, idx) => {
          const isRec = String(variant.name) === recommendedName
          const isBase = idx === 0
          const val = Number(variant[metricKey]) || 0

          return (
            <button
              key={String(variant.name)}
              onClick={() => {
                setActiveIdx(idx)
                onSelectVariant?.(String(variant.name))
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                activeIdx === idx
                  ? 'border-indigo-400 bg-indigo-950/40 shadow-lg shadow-indigo-500/10'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 truncate">{String(variant.name)}</span>
                {isRec ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    RECOMMENDED
                  </span>
                ) : isBase ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                    BASELINE
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-sm font-bold text-white">
                {metricKey === 'profit' || metricKey === 'revenue' ? moneyCompact(val) : val}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>Margin: {percent(Number(variant.margin))}</span>
                {variant.risk != null && Number(variant.risk) > 0 ? (
                  <span className="text-rose-400 font-medium">{String(variant.risk)} risk</span>
                ) : (
                  <span className="text-emerald-400 font-medium">Safe</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

