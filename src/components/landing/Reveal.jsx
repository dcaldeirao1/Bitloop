import { useInView } from '../../hooks/useInView'

/**
 * Scroll-reveal wrapper. Adds `.is-inview` when visible.
 */
export function Reveal({
  children,
  className = '',
  as: Tag = 'div',
  delay = 0,
  once = true,
  threshold = 0.06,
}) {
  const { ref, inView } = useInView({
    once,
    threshold,
    rootMargin: '0px 0px 12% 0px',
  })

  return (
    <Tag
      ref={ref}
      className={`landing-reveal ${inView ? 'is-inview' : ''} ${className}`.trim()}
      style={delay ? { '--reveal-delay': `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
