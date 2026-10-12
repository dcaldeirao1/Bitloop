import { sparkPath } from '../lib/balanceSeries'

/** Compact SVG sparkline for balance cards. */
export function Sparkline({
  values,
  width = 120,
  height = 28,
  tone = 'teal',
  className = '',
}) {
  const d = sparkPath(values, width, height)
  if (!d) return null

  return (
    <svg
      className={`balance-spark ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        className={`balance-spark-line ${tone === 'mango' ? 'is-mango' : ''}`}
        d={d}
      />
    </svg>
  )
}
