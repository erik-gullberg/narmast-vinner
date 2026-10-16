'use client'

import { useEffect, useRef } from 'react'
import { AT_REST, applyClick, isAtRest, step, type SpinState } from '@/lib/spin'

/**
 * The bouncing logo. Clicking it flips it around its vertical axis, like a
 * mirror; each click adds speed and it coasts to a stop (physics in lib/spin.ts).
 *
 * The bounce stays on the button and the flip is on the image, so the two
 * transforms never fight. The animation writes the transform straight to the
 * DOM each frame instead of going through React state.
 *
 * It deliberately ignores prefers-reduced-motion: the spin only ever happens
 * because the user clicked, and skipping it silently made the logo look
 * clickable but dead for anyone with Reduce Motion on.
 */
export default function SpinningLogo() {
  const imgRef = useRef<HTMLImageElement>(null)
  const state = useRef<SpinState>(AT_REST)
  const frame = useRef<number | null>(null)
  const lastTime = useRef(0)

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
  }, [])

  const tick = (now: number) => {
    // Clamp so a backgrounded tab does not jump the spin forward on return.
    const dt = Math.min(0.05, (now - lastTime.current) / 1000)
    lastTime.current = now
    state.current = step(state.current, dt)

    if (imgRef.current) {
      imgRef.current.style.transform = `rotateY(${state.current.angle}deg)`
    }
    frame.current = isAtRest(state.current) ? null : requestAnimationFrame(tick)
  }

  const handleClick = () => {
    state.current = applyClick(state.current)
    if (frame.current === null) {
      lastTime.current = performance.now()
      frame.current = requestAnimationFrame(tick)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Snurra logotypen"
      className="mt-8 mb-4 animate-bounce [animation-duration:2s] [perspective:600px] cursor-pointer touch-manipulation select-none"
    >
      <img
        ref={imgRef}
        src="/logo.png"
        alt="Närmast Vinner logotyp - geografispel"
        width={80}
        height={80}
        draggable={false}
        className="will-change-transform"
      />
    </button>
  )
}
