import { useEffect, useRef, type ReactNode } from 'react'
import scrapTexture from '../assets/images/scrap-metal-dark.jpg'
import './IndustrialBackground.css'

// Paleta industrial oscura derivada del verde corporativo (ver --brand en index.css),
// no la paleta ámbar/neutra del proyecto original de referencia.
const TONES = {
  base: '#050a07',
  primary: '#0f2a1a',
  secondary: '#173a24',
  specular: 'rgba(200, 255, 220, 0.09)',
  accentGlow: 'rgba(58, 168, 92, 0.4)',
  sparkColor: '#ffb84d',
  gridLine: 'rgba(255, 255, 255, 0.025)',
}

const PARTICLE_COUNT = 34

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  maxAlpha: number
  life: number
  maxLife: number
  spark: boolean
}

export default function IndustrialBackground({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)
    const handleResize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    const mousePos = { x: 0.5, y: 0.42 }
    const targetPos = { x: 0.5, y: 0.42 }
    const lastMove = { t: Date.now() }

    const handlePointerMove = (e: PointerEvent) => {
      targetPos.x = Math.max(0, Math.min(1, e.clientX / window.innerWidth))
      targetPos.y = Math.max(0, Math.min(1, e.clientY / window.innerHeight))
      lastMove.t = Date.now()
    }
    window.addEventListener('pointermove', handlePointerMove)

    const particles: Particle[] = []
    const createParticle = (spawnSpark = false): Particle => ({
      x: Math.random() * width,
      y: height + Math.random() * 20,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -(Math.random() * 0.9 + 0.3) * (spawnSpark ? 1.6 : 0.8),
      size: spawnSpark ? Math.random() * 2 + 1 : Math.random() * 1.5 + 0.5,
      alpha: 0,
      maxAlpha: spawnSpark ? Math.random() * 0.6 + 0.25 : Math.random() * 0.35 + 0.1,
      life: 0,
      maxLife: Math.random() * 240 + 140,
      spark: spawnSpark,
    })
    if (!reduceMotion) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = createParticle(Math.random() < 0.25)
        p.y = Math.random() * height
        p.life = Math.random() * p.maxLife
        particles.push(p)
      }
    }

    let clock = 0
    let frameId = 0

    const renderFrame = () => {
      clock += 0.012
      const idleMs = Date.now() - lastMove.t
      const lerp = 0.05
      if (idleMs > 2500) {
        const r = 0.16
        targetPos.x = 0.5 + Math.cos(clock * 0.6) * r
        targetPos.y = 0.42 + Math.sin(clock * 0.9) * (r * 0.7)
      }
      mousePos.x += (targetPos.x - mousePos.x) * lerp
      mousePos.y += (targetPos.y - mousePos.y) * lerp

      ctx.clearRect(0, 0, width, height)

      const lightX = mousePos.x * width
      const lightY = mousePos.y * height

      const base = ctx.createRadialGradient(lightX, lightY, 50, width * 0.5, height * 0.5, Math.max(width, height) * 0.9)
      base.addColorStop(0, TONES.secondary)
      base.addColorStop(0.6, TONES.primary)
      base.addColorStop(1, TONES.base)
      ctx.fillStyle = base
      ctx.fillRect(0, 0, width, height)

      ctx.save()
      ctx.translate(lightX, lightY)
      ctx.rotate(-Math.PI / 6)
      const sheenH = 300
      const sheen = ctx.createLinearGradient(0, -sheenH, 0, sheenH)
      sheen.addColorStop(0, 'rgba(0,0,0,0)')
      sheen.addColorStop(0.35, 'rgba(255,255,255,0.02)')
      sheen.addColorStop(0.5, TONES.specular)
      sheen.addColorStop(0.65, 'rgba(255,255,255,0.02)')
      sheen.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = sheen
      ctx.globalAlpha = 0.7
      const sheenW = Math.max(width, height) * 0.8
      ctx.fillRect(-sheenW, -sheenH, sheenW * 2, sheenH * 2)
      ctx.restore()

      const focalR = Math.max(300, width * 0.35)
      const focal = ctx.createRadialGradient(lightX, lightY, 10, lightX, lightY, focalR)
      focal.addColorStop(0, TONES.accentGlow)
      focal.addColorStop(0.5, 'rgba(255,255,255,0.02)')
      focal.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.fillStyle = focal
      ctx.globalAlpha = 0.55
      ctx.fillRect(0, 0, width, height)
      ctx.restore()

      ctx.save()
      ctx.strokeStyle = TONES.gridLine
      ctx.lineWidth = 1
      const gridSize = 64
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      ctx.restore()

      if (!reduceMotion) {
        ctx.save()
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i]
          p.x += p.vx
          p.y += p.vy
          p.life++
          const progress = p.life / p.maxLife
          p.alpha = progress < 0.2 ? (progress / 0.2) * p.maxAlpha : (1 - (progress - 0.2) / 0.8) * p.maxAlpha
          if (p.life >= p.maxLife || p.y < -10 || p.x < 0 || p.x > width) {
            particles[i] = createParticle(Math.random() < 0.3)
            continue
          }
          ctx.fillStyle = p.spark ? TONES.sparkColor : 'rgba(203, 213, 225, 0.3)'
          ctx.globalAlpha = p.alpha
          ctx.beginPath()
          if (p.spark) {
            ctx.ellipse(p.x, p.y, p.size * 0.8, p.size * 2, 0.2, 0, Math.PI * 2)
          } else {
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          }
          ctx.fill()
        }
        ctx.restore()
        frameId = requestAnimationFrame(renderFrame)
      }
    }

    renderFrame()
    if (reduceMotion) {
      // Un solo cuadro estático: nada de requestAnimationFrame ni listeners de pointer.
      window.removeEventListener('pointermove', handlePointerMove)
    }

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [])

  return (
    <div className="industrial-bg">
      <canvas ref={canvasRef} className="industrial-bg-canvas" />
      <div className="industrial-bg-texture" style={{ backgroundImage: `url(${scrapTexture})` }} />
      <div className="industrial-bg-vignette" />
      <div className="industrial-bg-content">{children}</div>
    </div>
  )
}
