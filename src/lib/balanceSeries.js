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
  // Avoid duplicate identical samples within a short window
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

/** Prefer snapshots; fall back to history reconstruction; else flat current. */
export function getBalanceSeries(vaultAddress, asset, { current, history } = {}) {
  const snaps = readRaw(vaultAddress)
  const key = String(asset || 'usdc').toLowerCase() === 'eth' ? 'eth' : 'usdc'
  const fromSnaps = snaps.map((p) => Number(p[key])).filter(Number.isFinite)

  if (fromSnaps.length >= 2) return fromSnaps

  const fromHist = seriesFromHistory(history, key === 'eth' ? 'ETH' : 'USDC', current)
  if (fromHist.length >= 2) return fromHist

  const c = Number(current)
  if (!Number.isFinite(c)) return [0, 0]
  // Gentle flat line so the spark always renders
  return [c, c]
}

/** Build SVG path for a list of y values (0..n). */
export function sparkPath(values, width = 120, height = 28, pad = 2) {
  const nums = (values || []).map(Number).filter(Number.isFinite)
  if (!nums.length) return ''

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const n = nums.length
  const innerH = height - pad * 2
  const innerW = width - pad * 2

  return nums
    .map((v, i) => {
      const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
      const y = pad + innerH - ((v - min) / span) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export function seriesDelta(values) {
  const nums = (values || []).map(Number).filter(Number.isFinite)
  if (nums.length < 2) return 0
  return nums[nums.length - 1] - nums[0]
}
