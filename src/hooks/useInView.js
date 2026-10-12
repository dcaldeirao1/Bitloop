import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isElementInViewport(el, marginBottom = 0) {
  const rect = el.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  return rect.top < vh - marginBottom && rect.bottom > 0
}

/**
 * IntersectionObserver helper for scroll reveals / demo playback.
 */
export function useInView({
  once = true,
  threshold = 0.08,
  rootMargin = '0px 0px -4% 0px',
} = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(() => prefersReducedMotion())

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    if (prefersReducedMotion()) {
      setInView(true)
      return undefined
    }

    // Sync above-the-fold content immediately (IO can lag a frame)
    if (isElementInViewport(el, 24)) {
      setInView(true)
      if (once) return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.unobserve(el)
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold, rootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [once, threshold, rootMargin])

  return { ref, inView }
}
