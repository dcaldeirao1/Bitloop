import { useId } from 'react'
import { sparkGeometry } from '../lib/balanceSeries'

/** Compact SVG sparkline with smooth curve, soft fill, and end marker. */
export function Sparkline({
  values,
  width = 160,
  height = 48,
  tone = 'teal',
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const geo = sparkGeometry(values, width, height)
  if (!geo.line) return null

  const gradId = `spark-fill-${uid}`
  const isMango = tone === 'mango'
  const isDown = (() => {
    const nums = (values || []).map(Number).filter(Number.isFinite)
    return nums.length >= 2 && nums[nums.length - 1] < nums[0]
  })()

  return (
    <svg
      className={`balance-spark ${isMango ? 'is-mango' : ''} ${isDown ? 'is-down' : ''} ${className}`.trim()}
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="balance-spark-stop-top" />
          <stop offset="100%" className="balance-spark-stop-bot" />
        </linearGradient>
      </defs>
      {geo.area ? (
        <path className="balance-spark-area" d={geo.area} fill={`url(#${gradId})`} />
      ) : null}
      <path className="balance-spark-line" d={geo.line} />
      {geo.end ? (
        <circle
          className="balance-spark-dot"
          cx={geo.end.x}
          cy={geo.end.y}
          r="2.25"
        />
      ) : null}
    </svg>
  )
}
