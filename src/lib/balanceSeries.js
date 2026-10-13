/**
 * Local balance snapshots + sparkline path helpers for vault UI.
 * Snapshots are browser-local (no backend) and fill in as the user refreshes.
 */

const PREFIX = 'bitloop-bal-v1:'
const MAX_POINTS = 48
const MIN_GAP_MS = 60_000

function keyFor(vaultAddress) {
  return `${PREFIX}${String(vaultAddress || '').toLowerCase()}`
}

function readRaw(vaultAddress) {
  try {
    const raw = localStorage.getItem(keyFor(vaultAddress))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRaw(vaultAddress, points) {
  try {
    localStorage.setItem(keyFor(vaultAddress), JSON.stringify(points.slice(-MAX_POINTS)))
  } catch {
    /* ignore quota */
  }
}

/** Record a USDC/ETH sample when vault balances change or enough time passed. */
export function recordVaultBalanceSnapshot(vaultAddress, { usdc, eth }) {
  if (!vaultAddress) return
  const u = Number(usdc)
  const e = Number(eth)
  if (!Number.isFinite(u) || !Number.isFinite(e)) return

  const prev = readRaw(vaultAddress)
  const last = prev[prev.length - 1]
  const now = Date.now()
  const changed =
    !last ||
    Math.abs(Number(last.usdc) - u) > 1e-9 ||
    Math.abs(Number(last.eth) - e) > 1e-12
  const stale = !last || now - Number(last.t) >= MIN_GAP_MS

  if (!changed && !stale) return
  if (last && !changed && now - Number(last.t) < MIN_GAP_MS) return

  prev.push({ t: now, usdc: u, eth: e })
  writeRaw(vaultAddress, prev)
}

/**
 * Approximate series from on-chain history by replaying from current balance.
 * `history` is newest-first (vault history shape).
 */
export function seriesFromHistory(history, asset, currentBalance) {
  const current = Number(currentBalance)
  if (!Number.isFinite(current)) return []

  const points = [current]
  let bal = current
  const rows = Array.isArray(history) ? history : []

  for (const item of rows) {
    const delta = signedDelta(item, asset)
    if (delta == null) continue
    bal -= delta
    points.unshift(Math.max(0, bal))
  }

  return points
}

function signedDelta(item, asset) {
  const sym = String(asset || '').toUpperCase()
  const itemAsset = String(item?.amountAsset || '').toUpperCase()
  const outAsset = String(item?.amountOutAsset || '').toUpperCase()
  const amt = Number(item?.amountFormatted)
  const amtOut = Number(item?.amountOutFormatted)

  switch (item?.type) {
    case 'deposit':
      if (itemAsset === sym && Number.isFinite(amt)) return amt
      return null
    case 'withdraw':
    case 'recurring':
    case 'split':
      if (itemAsset === sym && Number.isFinite(amt)) return -amt
      return null
    case 'dca':
      if (itemAsset === sym && Number.isFinite(amt)) return -amt
      if (outAsset === sym && Number.isFinite(amtOut)) return amtOut
      return null
    default:
      return null
  }
}

/** Prefer meaningful history; then snapshots; else a soft placeholder curve. */
export function getBalanceSeries(vaultAddress, asset, { current, history } = {}) {
  const snaps = readRaw(vaultAddress)
  const key = String(asset || 'usdc').toLowerCase() === 'eth' ? 'eth' : 'usdc'
  const fromHist = seriesFromHistory(history, key === 'eth' ? 'ETH' : 'USDC', current)
  if (fromHist.length >= 3) return downsample(fromHist, 24)

  const fromSnaps = snaps.map((p) => Number(p[key])).filter(Number.isFinite)
  if (fromSnaps.length >= 2) return fromSnaps

  if (fromHist.length >= 2) return fromHist

  const c = Number(current)
  if (!Number.isFinite(c)) return [0, 0, 0]
  // Soft placeholder so the chart never looks broken / empty
  return placeholderSeries(c)
}

function downsample(values, max) {
  if (values.length <= max) return values
  const out = []
  const step = (values.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) {
    out.push(values[Math.round(i * step)])
  }
  return out
}

function placeholderSeries(current) {
  if (current <= 0) return [0, 0, 0, 0]
  const base = current * 0.92
  return [
    base,
    base * 1.02,
    base * 0.98,
    base * 1.04,
    base * 1.01,
    current,
  ]
}

function toPoints(values, width, height, pad) {
  const nums = (values || []).map(Number).filter(Number.isFinite)
  if (!nums.length) return []

  // Avoid zero-span flat lines looking broken — add tiny padding
  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (max - min < 1e-12) {
    const padY = Math.abs(max) * 0.04 || 1
    min -= padY
    max += padY
  }
  const span = max - min
  const n = nums.length
  const innerH = height - pad * 2
  const innerW = width - pad * 2

  return nums.map((v, i) => ({
    x: pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    y: pad + innerH - ((v - min) / span) * innerH,
  }))
}

/** Smooth cubic path through points. */
function smoothLine(points) {
  if (!points.length) return ''
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  }
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

/**
 * Geometry for a richer sparkline: smooth line, area fill, end dot.
 */
export function sparkGeometry(values, width = 160, height = 48, pad = 3) {
  const points = toPoints(values, width, height, pad)
  if (!points.length) {
    return { line: '', area: '', end: null, width, height }
  }

  const line = smoothLine(points)
  const last = points[points.length - 1]
  const first = points[0]
  const bottom = height - pad
  const area = `${line} L ${last.x.toFixed(2)} ${bottom.toFixed(2)} L ${first.x.toFixed(2)} ${bottom.toFixed(2)} Z`

  return {
    line,
    area,
    end: { x: last.x, y: last.y },
    width,
    height,
  }
}

/** @deprecated use sparkGeometry — kept for callers that only need a path */
export function sparkPath(values, width = 120, height = 28, pad = 2) {
  return sparkGeometry(values, width, height, pad).line
}

export function seriesDelta(values) {
  const nums = (values || []).map(Number).filter(Number.isFinite)
  if (nums.length < 2) return 0
  return nums[nums.length - 1] - nums[0]
}
