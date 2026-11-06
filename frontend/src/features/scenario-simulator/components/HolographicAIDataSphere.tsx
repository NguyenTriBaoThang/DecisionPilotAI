import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { SimulatorTab } from '../types'

interface HolographicAIDataSphereProps {
  activeTab: SimulatorTab
  mode: 'overview' | 'focus' | 'comparison'
  className?: string
}

export function HolographicAIDataSphere({ activeTab, mode, className = '' }: HolographicAIDataSphereProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasWebGL, setHasWebGL] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHasWebGL(false)
      return
    }

    // WebGL Check
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl) {
        setHasWebGL(false)
        return
      }
    } catch {
      setHasWebGL(false)
      return
    }

    const width = container.clientWidth || 400
    const height = container.clientHeight || 400

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 1.2, 5.2)
    camera.lookAt(0, 0, 0)

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)
    } catch {
      setHasWebGL(false)
      return
    }

    // Root Group
    const rootGroup = new THREE.Group()
    scene.add(rootGroup)

    // Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9)
    scene.add(ambientLight)

    const cyanPoint = new THREE.PointLight(0x22d3ee, 3.5, 12)
    cyanPoint.position.set(-2.5, 2.5, 3)
    scene.add(cyanPoint)

    const violetPoint = new THREE.PointLight(0x8b5cf6, 3.5, 12)
    violetPoint.position.set(2.5, -1.5, 3)
    scene.add(violetPoint)

    const blueDir = new THREE.DirectionalLight(0x38bdf8, 1.5)
    blueDir.position.set(0, 5, 4)
    scene.add(blueDir)

    // ==========================================
    // 1. GLOWING 3D PEDESTAL (from Reference Image)
    // ==========================================
    const pedestalGroup = new THREE.Group()
    pedestalGroup.position.y = -1.65
    rootGroup.add(pedestalGroup)

    // Tier 1 Base Cylinder
    const baseGeo1 = new THREE.CylinderGeometry(1.6, 1.8, 0.18, 48)
    const baseMat1 = new THREE.MeshStandardMaterial({
      color: 0x0c1224,
      metalness: 0.9,
      roughness: 0.2,
    })
    const baseMesh1 = new THREE.Mesh(baseGeo1, baseMat1)
    pedestalGroup.add(baseMesh1)

    // Tier 2 Middle Cylinder with Neon Edge
    const baseGeo2 = new THREE.CylinderGeometry(1.25, 1.4, 0.15, 48)
    const baseMat2 = new THREE.MeshStandardMaterial({
      color: 0x111a30,
      metalness: 0.8,
      roughness: 0.25,
    })
    const baseMesh2 = new THREE.Mesh(baseGeo2, baseMat2)
    baseMesh2.position.y = 0.16
    pedestalGroup.add(baseMesh2)

    // Neon Concentric Rings on Pedestal
    const ringGeo1 = new THREE.TorusGeometry(1.3, 0.025, 16, 64)
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 })
    const pedestalRing1 = new THREE.Mesh(ringGeo1, ringMat1)
    pedestalRing1.rotation.x = Math.PI / 2
    pedestalRing1.position.y = 0.24
    pedestalGroup.add(pedestalRing1)

    const ringGeo2 = new THREE.TorusGeometry(0.95, 0.02, 16, 64)
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.75 })
    const pedestalRing2 = new THREE.Mesh(ringGeo2, ringMat2)
    pedestalRing2.rotation.x = Math.PI / 2
    pedestalRing2.position.y = 0.24
    pedestalGroup.add(pedestalRing2)

    // Upward Light Cone from Pedestal to Sphere
    const coneGeo = new THREE.ConeGeometry(1.1, 1.6, 32, 1, true)
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const lightCone = new THREE.Mesh(coneGeo, coneMat)
    lightCone.position.y = 0.8
    lightCone.rotation.x = Math.PI
    pedestalGroup.add(lightCone)

    // ==========================================
    // 2. CENTRAL AI DATA SPHERE
    // ==========================================
    const sphereGroup = new THREE.Group()
    sphereGroup.position.y = 0.05
    rootGroup.add(sphereGroup)

    // 2.1 Outer Glass Hologram Shell
    const outerGeo = new THREE.SphereGeometry(1.15, 48, 48)
    const outerMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.32,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.85,
      ior: 1.4,
      reflectivity: 0.9,
      wireframe: false,
    })
    const outerSphere = new THREE.Mesh(outerGeo, outerMat)
    sphereGroup.add(outerSphere)

    // 2.2 Wireframe Geodesic Net
    const wireGeo = new THREE.IcosahedronGeometry(1.16, 2)
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
    })
    const wireMesh = new THREE.Mesh(wireGeo, wireMat)
    sphereGroup.add(wireMesh)

    // 2.3 Inner Pulsating Core (Lõi Năng Lượng AI)
    const innerGeo = new THREE.SphereGeometry(0.68, 32, 32)
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      emissive: 0x6366f1,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.65,
      roughness: 0.3,
    })
    const innerCore = new THREE.Mesh(innerGeo, innerMat)
    sphereGroup.add(innerCore)

    // 2.4 Central AI Chip Box (Holographic Processor)
    const chipGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35)
    const chipMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    })
    const chipMesh = new THREE.Mesh(chipGeo, chipMat)
    sphereGroup.add(chipMesh)

    // ==========================================
    // 3. ORBITAL NEON DATA RINGS & PARTICLES
    // ==========================================
    const ring1Geo = new THREE.TorusGeometry(1.65, 0.016, 16, 100)
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    })
    const orbitRing1 = new THREE.Mesh(ring1Geo, ring1Mat)
    orbitRing1.rotation.x = Math.PI / 3.2
    sphereGroup.add(orbitRing1)

    const ring2Geo = new THREE.TorusGeometry(1.85, 0.014, 16, 100)
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    })
    const orbitRing2 = new THREE.Mesh(ring2Geo, ring2Mat)
    orbitRing2.rotation.y = Math.PI / 3.8
    orbitRing2.rotation.x = -Math.PI / 4
    sphereGroup.add(orbitRing2)

    // Starfield Particle Constellation
    const particleCount = 160
    const pos = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      const radius = 1.3 + Math.random() * 0.9
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = radius * Math.cos(phi)
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.035,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    })
    const particlePoints = new THREE.Points(particleGeo, particleMat)
    sphereGroup.add(particlePoints)

    // ==========================================
    // 4. MOUSE PARALLAX & ANIMATION LOOP
    // ==========================================
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      targetX = x * 0.35
      targetY = -y * 0.25
    }
    window.addEventListener('mousemove', handleMouseMove)

    let animId: number
    const clock = new THREE.Clock()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      // Smooth mouse interpolation
      currentX += (targetX - currentX) * 0.05
      currentY += (targetY - currentY) * 0.05
      rootGroup.rotation.y = currentX + elapsed * 0.15
      rootGroup.rotation.x = currentY

      // Component Rotations
      wireMesh.rotation.y = elapsed * 0.12
      wireMesh.rotation.x = -elapsed * 0.06
      innerCore.rotation.y = -elapsed * 0.22
      chipMesh.rotation.x = elapsed * 0.4
      chipMesh.rotation.y = elapsed * 0.3
      orbitRing1.rotation.z = elapsed * 0.25
      orbitRing2.rotation.z = -elapsed * 0.2
      particlePoints.rotation.y = elapsed * 0.05

      // Dynamic Heartbeat Pulse
      const pulse = 1 + Math.sin(elapsed * 2.5) * 0.04
      innerCore.scale.set(pulse, pulse, pulse)

      // Light response to active tab
      const tabColorMap: Record<SimulatorTab, number> = {
        overview: 0x22d3ee,
        pricing: 0x6366f1,
        marketing: 0xf59e0b,
        inventory: 0x10b981,
        recommendations: 0x8b5cf6,
      }
      cyanPoint.color.setHex(tabColorMap[activeTab] || 0x22d3ee)

      if (renderer) {
        renderer.render(scene, camera)
      }
    }
    animate()

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      if (renderer) {
        renderer.dispose()
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement)
        }
      }
      baseGeo1.dispose()
      baseMat1.dispose()
      baseGeo2.dispose()
      baseMat2.dispose()
      ringGeo1.dispose()
      ringMat1.dispose()
      ringGeo2.dispose()
      ringMat2.dispose()
      coneGeo.dispose()
      coneMat.dispose()
      outerGeo.dispose()
      outerMat.dispose()
      wireGeo.dispose()
      wireMat.dispose()
      innerGeo.dispose()
      innerMat.dispose()
      chipGeo.dispose()
      chipMat.dispose()
      ring1Geo.dispose()
      ring1Mat.dispose()
      ring2Geo.dispose()
      ring2Mat.dispose()
      particleGeo.dispose()
      particleMat.dispose()
    }
  }, [activeTab, mode])

  if (!hasWebGL) {
    return (
      <div className={`relative flex items-center justify-center p-8 ${className}`}>
        <div className="w-56 h-56 rounded-full border-2 border-indigo-500/30 animate-pulse flex items-center justify-center bg-indigo-950/20">
          <div className="w-36 h-36 rounded-full bg-gradient-to-tr from-indigo-600/40 to-cyan-500/40 blur-md" />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[380px] pointer-events-none select-none ${className}`}
      aria-label="3D Holographic AI Data Sphere"
    />
  )
}

