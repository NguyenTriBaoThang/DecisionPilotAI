import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

interface AIIntelligenceCoreProps {
  size?: number
  className?: string
  interactive?: boolean
}

export function AIIntelligenceCore({ size = 320, className = '', interactive = true }: AIIntelligenceCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasWebGL, setHasWebGL] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Check WebGL availability
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

    // Three.js Scene Setup
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    camera.position.z = 4.2

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
      renderer.setSize(size, size)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)
    } catch {
      setHasWebGL(false)
      return
    }

    // Core Group
    const rootGroup = new THREE.Group()
    scene.add(rootGroup)

    // 1. Inner Glowing Energy Core
    const coreGeo = new THREE.SphereGeometry(0.75, 32, 32)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
    })
    const innerCore = new THREE.Mesh(coreGeo, coreMat)
    rootGroup.add(innerCore)

    // 2. Solid Inner Energy Seed
    const seedGeo = new THREE.IcosahedronGeometry(0.45, 1)
    const seedMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: false,
      transparent: true,
      opacity: 0.85,
    })
    const seedMesh = new THREE.Mesh(seedGeo, seedMat)
    rootGroup.add(seedMesh)

    // 3. Middle Polyhedral Hologram Cage
    const cageGeo = new THREE.IcosahedronGeometry(1.2, 1)
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    })
    const cageMesh = new THREE.Mesh(cageGeo, cageMat)
    rootGroup.add(cageMesh)

    // 4. Outer Rotating Data Rings
    const ringGeo1 = new THREE.TorusGeometry(1.55, 0.015, 16, 100)
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.6,
    })
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1)
    ring1.rotation.x = Math.PI / 3
    rootGroup.add(ring1)

    const ringGeo2 = new THREE.TorusGeometry(1.7, 0.012, 16, 100)
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.5,
    })
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2)
    ring2.rotation.y = Math.PI / 4
    ring2.rotation.x = -Math.PI / 6
    rootGroup.add(ring2)

    // 5. Constellation Data Nodes (Points)
    const particleCount = 120
    const positions = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      const radius = 1.0 + Math.random() * 0.9
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.035,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    })
    const particles = new THREE.Points(particleGeo, particleMat)
    rootGroup.add(particles)

    // Mouse Interaction
    let targetRotX = 0
    let targetRotY = 0
    let currentRotX = 0
    let currentRotY = 0

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return
      const rect = container.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      targetRotY = x * 0.45
      targetRotX = -y * 0.45
    }

    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove)
    }

    // Animation Loop
    let animId: number
    let clock = new THREE.Clock()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      // Smooth mouse follow
      currentRotX += (targetRotX - currentRotX) * 0.05
      currentRotY += (targetRotY - currentRotY) * 0.05

      rootGroup.rotation.x = currentRotX + Math.sin(elapsed * 0.4) * 0.08
      rootGroup.rotation.y = currentRotY + elapsed * 0.25

      // Sub-rotations
      innerCore.rotation.y = -elapsed * 0.4
      seedMesh.rotation.x = elapsed * 0.35
      seedMesh.rotation.z = elapsed * 0.25
      cageMesh.rotation.y = elapsed * 0.15
      cageMesh.rotation.z = -elapsed * 0.1
      ring1.rotation.z = elapsed * 0.2
      ring2.rotation.z = -elapsed * 0.25
      particles.rotation.y = elapsed * 0.08

      // Pulsing pulse scale
      const pulse = 1 + Math.sin(elapsed * 2.2) * 0.06
      seedMesh.scale.set(pulse, pulse, pulse)

      if (renderer) {
        renderer.render(scene, camera)
      }
    }
    animate()

    // Cleanup
    return () => {
      cancelAnimationFrame(animId)
      if (interactive) {
        window.removeEventListener('mousemove', handleMouseMove)
      }
      if (renderer) {
        renderer.dispose()
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement)
        }
      }
      coreGeo.dispose()
      coreMat.dispose()
      seedGeo.dispose()
      seedMat.dispose()
      cageGeo.dispose()
      cageMat.dispose()
      ringGeo1.dispose()
      ringMat1.dispose()
      ringGeo2.dispose()
      ringMat2.dispose()
      particleGeo.dispose()
      particleMat.dispose()
    }
  }, [size, interactive])

  if (!hasWebGL) {
    return (
      <div
        className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-950/40 via-violet-900/20 to-cyan-950/30 border border-indigo-500/20 shadow-2xl shadow-indigo-500/10 ${className}`}
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full border-2 border-indigo-500/30 animate-ping opacity-40" />
          <div className="w-24 h-24 rounded-full border border-violet-400/40 animate-pulse bg-violet-600/10 backdrop-blur-sm" />
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-400 shadow-lg shadow-cyan-500/30" />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-block cursor-grab active:cursor-grabbing select-none ${className}`}
      style={{ width: size, height: size }}
      aria-label="Interactive 3D AI Intelligence Core"
    />
  )
}

