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
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.dataset.theme === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !variants || variants.length === 0) return

    const width = container.clientWidth || 500
    const height = 250

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000)
    camera.position.set(0, 3.1, 5.9)
    camera.lookAt(0, 0.5, 0)

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)
    } catch {
      return
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, isDark ? 0.85 : 1.05)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.4 : 1.1)
    dirLight.position.set(4, 9, 6)
    scene.add(dirLight)

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.65)
    rimLight.position.set(-5, 4, -4)
    scene.add(rimLight)

    const platformGroup = new THREE.Group()
    scene.add(platformGroup)

    const gridColorCenter = isDark ? 0x334155 : 0xcbd5e1
    const gridColorLines = isDark ? 0x1e293b : 0xe2e8f0
    const grid = new THREE.GridHelper(8, 16, gridColorCenter, gridColorLines)
    grid.position.y = -0.15
    scene.add(grid)

    const values = variants.map((v) => Number(v[metricKey]) || 0)
    const minVal = Math.min(...values, 0)
    const maxVal = Math.max(...values, 1)
    const valRange = maxVal - minVal || 1

    const displayVariants = variants.slice(0, 4)
    const spacing = 1.65
    const startX = -((displayVariants.length - 1) * spacing) / 2

    const meshes: THREE.Mesh[] = []

    displayVariants.forEach((v, idx) => {
      const val = Number(v[metricKey]) || 0
      const normalizedHeight = Math.max(0.35, ((val - minVal) / valRange) * 1.55 + 0.35)
      const isRecommended = String(v.name) === recommendedName
      const isBaseline = idx === 0

      const geo = new THREE.CylinderGeometry(0.52, 0.58, normalizedHeight, 36)
      const color = isRecommended
        ? 0x16a34a
        : isBaseline
        ? 0x64748b
        : idx % 2 === 0
        ? 0x2563eb
        : 0x0284c7

      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.18,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(startX + idx * spacing, normalizedHeight / 2 - 0.15, 0)
      mesh.userData = { idx, name: String(v.name) }
      platformGroup.add(mesh)
      meshes.push(mesh)

      const ringGeo = new THREE.RingGeometry(0.46, 0.54, 36)
      const ringMat = new THREE.MeshBasicMaterial({
        color: isRecommended ? 0x22c55e : 0x93c5fd,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(startX + idx * spacing, normalizedHeight - 0.13, 0)
      platformGroup.add(ring)
    })

    let animId: number
    const clock = new THREE.Clock()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      platformGroup.rotation.y = Math.sin(elapsed * 0.35) * 0.1
      if (renderer) renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!container || !renderer) return
      const w = container.clientWidth
      if (!w) return
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
  }, [variants, recommendedName, metricKey, isDark])

  return (
    <div
      className="dp-surface p-4 space-y-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-center justify-between pb-2.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--heading)' }}>
          3D Scenario Studio View
        </span>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>Height metric:</span>
          <span className="font-semibold capitalize" style={{ color: 'var(--primary-text)' }}>
            {metricKey}
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full h-[250px] rounded-xl border cursor-grab active:cursor-grabbing"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
      />

      {/* Interactive Scenario Variant Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {variants.slice(0, 4).map((variant, idx) => {
          const isRec = String(variant.name) === recommendedName
          const isBase = idx === 0
          const val = Number(variant[metricKey]) || 0
          const isActive = activeIdx === idx

          return (
            <button
              key={String(variant.name)}
              type="button"
              onClick={() => {
                setActiveIdx(idx)
                onSelectVariant?.(String(variant.name))
              }}
              style={{
                background: isActive ? 'var(--primary-soft)' : 'var(--surface-muted)',
                borderColor: isActive ? 'var(--primary)' : 'var(--border)',
              }}
              className="rounded-lg border p-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-semibold truncate" style={{ color: 'var(--heading)' }}>
                  {String(variant.name)}
                </span>
                {isRec ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}
                  >
                    RECOMMENDED
                  </span>
                ) : isBase ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
                  >
                    BASELINE
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 text-sm font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                {metricKey === 'profit' || metricKey === 'revenue' ? moneyCompact(val) : val}
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <span>Margin: {percent(Number(variant.margin))}</span>
                {variant.risk != null && Number(variant.risk) > 0 ? (
                  <span style={{ color: 'var(--danger-text)' }} className="font-medium">
                    {String(variant.risk)} risk
                  </span>
                ) : (
                  <span style={{ color: 'var(--success-text)' }} className="font-medium">
                    Safe
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
