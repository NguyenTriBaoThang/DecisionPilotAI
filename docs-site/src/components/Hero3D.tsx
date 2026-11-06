import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export function Hero3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [hasWebGL, setHasWebGL] = useState(true)

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // Verify WebGL availability
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setHasWebGL(false)
      return
    }

    const width = container.clientWidth || 800
    const height = 280
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.z = 6

    // Group containing all holographic elements
    const holoGroup = new THREE.Group()
    scene.add(holoGroup)

    // 1. Core Sphere (Wireframe & inner glowing core)
    const sphereGeo = new THREE.IcosahedronGeometry(1.6, 2)
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    })
    const sphere = new THREE.Mesh(sphereGeo, sphereMat)
    holoGroup.add(sphere)

    // Inner core point light simulation
    const innerGeo = new THREE.SphereGeometry(0.8, 16, 16)
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    })
    const innerSphere = new THREE.Mesh(innerGeo, innerMat)
    holoGroup.add(innerSphere)

    // 2. Orbital Data Rings
    const ringGeo1 = new THREE.TorusGeometry(2.3, 0.02, 16, 100)
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.6 })
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1)
    ring1.rotation.x = Math.PI / 3
    holoGroup.add(ring1)

    const ringGeo2 = new THREE.TorusGeometry(2.6, 0.02, 16, 100)
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.5 })
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2)
    ring2.rotation.y = Math.PI / 4
    ring2.rotation.x = -Math.PI / 6
    holoGroup.add(ring2)

    // 3. Floating Data Particles
    const particleCount = 180
    const particleGeo = new THREE.BufferGeometry()
    const posArray = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount * 3; i += 3) {
      const radius = 2.0 + Math.random() * 1.8
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      posArray[i] = radius * Math.sin(phi) * Math.cos(theta)
      posArray[i + 1] = radius * Math.sin(phi) * Math.sin(theta)
      posArray[i + 2] = radius * Math.cos(phi)
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
    const particleMat = new THREE.PointsMaterial({
      size: 0.05,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
    })
    const particles = new THREE.Points(particleGeo, particleMat)
    holoGroup.add(particles)

    // Mouse parallax interaction
    let mouseX = 0
    let mouseY = 0
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouseX = ((e.clientX - rect.left) / width - 0.5) * 2
      mouseY = -((e.clientY - rect.top) / height - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouseMove)

    // Resize observer
    const handleResize = () => {
      if (!container) return
      const w = container.clientWidth
      camera.aspect = w / height
      camera.updateProjectionMatrix()
      renderer.setSize(w, height)
    }
    window.addEventListener('resize', handleResize)

    // Animation Loop
    let reqId: number
    const clock = new THREE.Clock()

    const animate = () => {
      reqId = requestAnimationFrame(animate)
      const elapsedTime = clock.getElapsedTime()

      sphere.rotation.y = elapsedTime * 0.15
      sphere.rotation.x = elapsedTime * 0.08
      innerSphere.rotation.y = -elapsedTime * 0.25
      ring1.rotation.z = elapsedTime * 0.12
      ring2.rotation.z = -elapsedTime * 0.15
      particles.rotation.y = elapsedTime * 0.05

      // Smooth mouse follow
      holoGroup.rotation.y += (mouseX * 0.5 - holoGroup.rotation.y) * 0.05
      holoGroup.rotation.x += (-mouseY * 0.3 - holoGroup.rotation.x) * 0.05

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(reqId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', handleResize)
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [])

  return (
    <div className="hero-canvas-wrap" ref={mountRef}>
      {!hasWebGL && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          DecisionPilot AI Holographic Core Engine
        </div>
      )}
      <div className="canvas-caption">HOLOGRAPHIC AI CORE · INTERACTIVE 3D DATA SPHERE</div>
    </div>
  )
}

