import { getHlTransport } from './hyperliquid'

export const CANDLE_INTERVALS = [
  { id: '5m', label: '5m', ms: 5 * 60_000 },
  { id: '15m', label: '15m', ms: 15 * 60_000 },
  { id: '1h', label: '1h', ms: 60 * 60_000 },
  { id: '4h', label: '4h', ms: 4 * 60 * 60_000 },
  { id: '1d', label: '1d', ms: 24 * 60 * 60_000 },
]

export const DEFAULT_PERPS_STRATEGY = {
  coin: 'BTC',
  interval: '1h',
  lookbackDays: 30,
  bankroll: 10_000,
  leverage: 5,
  sideMode: 'both', // long | short | both
  maType: 'ema',
  maFast: 9,
  maSlow: 21,
  useMaCross: false,
  /** Price crosses this MA up → long; crosses down → short */
  usePriceVsMa: true,
  priceCrossMaPeriod: 21,
  /** Long while close > this MA; short while close < this MA */
  usePriceAboveMa: false,
  priceAboveMaPeriod: 200,
  rsiPeriod: 14,
  /** Long only when RSI is below this level */
  rsiLongBelow: 40,
  /** Short only when RSI is above this level */
  rsiShortAbove: 60,
  useRsi: true,
  volumeMaPeriod: 20,
  volumeMult: 1.5,
  useVolume: false,
  takeProfitPct: 4,
  stopLossPct: 2,
  feeBps: 3.5, // ~0.035% per fill (taker-ish)
}

/** Fetch OHLCV candles from Hyperliquid (max ~5000 per request). */
export async function fetchCandles({
  coin,
  interval = '1h',
  startTime,
  endTime = Date.now(),
  isTestnet,
} = {}) {
  const transport = getHlTransport()
  // getHlTransport already points at testnet/mainnet; isTestnet unused but kept for clarity
  void isTestnet
  const raw = await transport.request('info', {
    type: 'candleSnapshot',
    req: {
      coin: String(coin || '').toUpperCase(),
      interval,
      startTime: Number(startTime),
      endTime: Number(endTime),
    },
  })
  if (!Array.isArray(raw)) return []
  return raw
    .map((c) => ({
      t: Number(c.t),
      T: Number(c.T),
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
      n: Number(c.n) || 0,
    }))
    .filter((c) => Number.isFinite(c.c) && c.c > 0)
    .sort((a, b) => a.t - b.t)
}

function sma(values, period, i) {
  if (i + 1 < period) return null
  let sum = 0
  for (let j = i - period + 1; j <= i; j += 1) sum += values[j]
  return sum / period
}

function emaSeries(values, period) {
  const out = new Array(values.length).fill(null)
  if (values.length < period) return out
  let sum = 0
  for (let i = 0; i < period; i += 1) sum += values[i]
  out[period - 1] = sum / period
  const k = 2 / (period + 1)
  for (let i = period; i < values.length; i += 1) {
    out[i] = values[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

function smaSeries(values, period) {
  const out = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i += 1) {
    out[i] = sma(values, period, i)
  }
  return out
}

/** Wilder RSI */
function rsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null)
  if (closes.length <= period) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i += 1) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < closes.length; i += 1) {
    const d = closes[i] - closes[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export function computeIndicators(candles, strategy) {
  const closes = candles.map((c) => c.c)
  const volumes = candles.map((c) => c.v)
  const maFn = strategy.maType === 'sma' ? smaSeries : emaSeries
  const s = normalizeStrategy(strategy)
  return {
    maFast: maFn(closes, Math.max(2, Number(s.maFast) || 9)),
    maSlow: maFn(closes, Math.max(3, Number(s.maSlow) || 21)),
    priceCrossMa: maFn(closes, Math.max(2, Number(s.priceCrossMaPeriod) || 21)),
    priceAboveMa: maFn(closes, Math.max(2, Number(s.priceAboveMaPeriod) || 200)),
    /** @deprecated alias — prefer priceCrossMa */
    priceMa: maFn(closes, Math.max(2, Number(s.priceCrossMaPeriod) || 21)),
    rsi: rsiSeries(closes, Math.max(2, Number(s.rsiPeriod) || 14)),
    volMa: smaSeries(volumes, Math.max(2, Number(s.volumeMaPeriod) || 20)),
  }
}

function crossedUp(fast, slow, i) {
  if (fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) {
    return false
  }
  return fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]
}

function crossedDown(fast, slow, i) {
  if (fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) {
    return false
  }
  return fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]
}

function priceCrossedUp(candles, priceMa, i) {
  if (i < 1 || priceMa[i] == null || priceMa[i - 1] == null) return false
  return candles[i - 1].c <= priceMa[i - 1] && candles[i].c > priceMa[i]
}

function priceCrossedDown(candles, priceMa, i) {
  if (i < 1 || priceMa[i] == null || priceMa[i - 1] == null) return false
  return candles[i - 1].c >= priceMa[i - 1] && candles[i].c < priceMa[i]
}

function normalizeStrategy(strategy) {
  // Back-compat with older saved form fields
  const legacyPeriod = strategy.priceMaPeriod
  return {
    ...strategy,
    rsiLongBelow:
      strategy.rsiLongBelow ?? strategy.rsiOversold ?? DEFAULT_PERPS_STRATEGY.rsiLongBelow,
    rsiShortAbove:
      strategy.rsiShortAbove ?? strategy.rsiOverbought ?? DEFAULT_PERPS_STRATEGY.rsiShortAbove,
    usePriceVsMa: strategy.usePriceVsMa ?? false,
    usePriceAboveMa: strategy.usePriceAboveMa ?? false,
    priceCrossMaPeriod:
      strategy.priceCrossMaPeriod ?? legacyPeriod ?? DEFAULT_PERPS_STRATEGY.priceCrossMaPeriod,
    priceAboveMaPeriod:
      strategy.priceAboveMaPeriod ?? legacyPeriod ?? DEFAULT_PERPS_STRATEGY.priceAboveMaPeriod,
  }
}

function longFiltersOk(i, candles, ind, strategy) {
  if (i < 1) return false
  const checks = []
  if (strategy.useMaCross) checks.push(crossedUp(ind.maFast, ind.maSlow, i))
  if (strategy.usePriceVsMa) checks.push(priceCrossedUp(candles, ind.priceCrossMa, i))
  if (strategy.usePriceAboveMa) {
    const ma = ind.priceAboveMa[i]
    if (ma == null) return false
    checks.push(candles[i].c > ma)
  }
  if (strategy.useRsi) {
    const rsi = ind.rsi[i]
    if (rsi == null) return false
    checks.push(rsi < Number(strategy.rsiLongBelow))
  }
  if (strategy.useVolume) {
    const volMa = ind.volMa[i]
    if (volMa == null || !(volMa > 0)) return false
    checks.push(candles[i].v >= volMa * Number(strategy.volumeMult || 1))
  }
  return checks.length > 0 && checks.every(Boolean)
}

function shortFiltersOk(i, candles, ind, strategy) {
  if (i < 1) return false
  const checks = []
  if (strategy.useMaCross) checks.push(crossedDown(ind.maFast, ind.maSlow, i))
  if (strategy.usePriceVsMa) checks.push(priceCrossedDown(candles, ind.priceCrossMa, i))
  if (strategy.usePriceAboveMa) {
    const ma = ind.priceAboveMa[i]
    if (ma == null) return false
    checks.push(candles[i].c < ma)
  }
  if (strategy.useRsi) {
    const rsi = ind.rsi[i]
    if (rsi == null) return false
    checks.push(rsi > Number(strategy.rsiShortAbove))
  }
  if (strategy.useVolume) {
    const volMa = ind.volMa[i]
    if (volMa == null || !(volMa > 0)) return false
    checks.push(candles[i].v >= volMa * Number(strategy.volumeMult || 1))
  }
  return checks.length > 0 && checks.every(Boolean)
}

/**
 * Latest live signal for the last candle (same rules as the backtest engine).
 * Used when deploying a backtested strategy on Hyperliquid testnet.
 */
export function getLatestPerpsSignal(candles, strategyInput = {}) {
  const strategy = normalizeStrategy({ ...DEFAULT_PERPS_STRATEGY, ...strategyInput })
  if (!candles?.length) {
    return { side: null, reason: 'No candles', strategy }
  }
  const ind = computeIndicators(candles, strategy)
  const i = candles.length - 1
  const sideMode = strategy.sideMode || 'both'
  const allowLong = sideMode === 'long' || sideMode === 'both'
  const allowShort = sideMode === 'short' || sideMode === 'both'

  if (allowLong && longEntryAt(i, candles, ind, strategy)) {
    return {
      side: 'long',
      reason: 'Live long signal on latest bar',
      strategy,
      price: candles[i].c,
      time: candles[i].t,
    }
  }
  if (allowShort && shortEntryAt(i, candles, ind, strategy)) {
    return {
      side: 'short',
      reason: 'Live short signal on latest bar',
      strategy,
      price: candles[i].c,
      time: candles[i].t,
    }
  }

  // Fallback: bias from sideMode so deploy is still possible after a successful backtest
  if (sideMode === 'long') {
    return {
      side: 'long',
      reason: 'No live signal — using long bias from strategy',
      strategy,
      price: candles[i].c,
      time: candles[i].t,
      soft: true,
    }
  }
  if (sideMode === 'short') {
    return {
      side: 'short',
      reason: 'No live signal — using short bias from strategy',
      strategy,
      price: candles[i].c,
      time: candles[i].t,
      soft: true,
    }
  }
  return {
    side: 'long',
    reason: 'No live signal — defaulting to long (confirm before deploy)',
    strategy,
    price: candles[i].c,
    time: candles[i].t,
    soft: true,
  }
}

function longEntryAt(i, candles, ind, strategy) {
  if (!longFiltersOk(i, candles, ind, strategy)) return false
  // Cross signals are already a single-bar edge; otherwise rising edge of filters
  if (strategy.useMaCross || strategy.usePriceVsMa) return true
  return !longFiltersOk(i - 1, candles, ind, strategy)
}

function shortEntryAt(i, candles, ind, strategy) {
  if (!shortFiltersOk(i, candles, ind, strategy)) return false
  if (strategy.useMaCross || strategy.usePriceVsMa) return true
  return !shortFiltersOk(i - 1, candles, ind, strategy)
}

function feeNotional(notional, feeBps) {
  return (Math.abs(notional) * Number(feeBps || 0)) / 10_000
}

/**
 * Bar-by-bar backtest. One position at a time. Entries at signal close;
 * exits on TP/SL (intrabar high/low) or opposing signal.
 */
export function runPerpsBacktest(candles, strategyInput = {}) {
  const strategy = normalizeStrategy({ ...DEFAULT_PERPS_STRATEGY, ...strategyInput })
  if (
    !strategy.useMaCross &&
    !strategy.usePriceVsMa &&
    !strategy.usePriceAboveMa &&
    !strategy.useRsi &&
    !strategy.useVolume
  ) {
    throw new Error(
      'Enable at least one signal: price crosses MA, price above MA, MA cross, RSI, or volume.',
    )
  }
  if (Number(strategy.maFast) >= Number(strategy.maSlow) && strategy.useMaCross) {
    throw new Error('Fast MA period must be less than slow MA period.')
  }

  const ind = computeIndicators(candles, strategy)
  const bankroll = Number(strategy.bankroll) || 10_000
  const leverage = Math.max(1, Math.floor(Number(strategy.leverage) || 1))
  const tpPct = Number(strategy.takeProfitPct) || 0
  const slPct = Number(strategy.stopLossPct) || 0
  const sideMode = strategy.sideMode || 'both'

  let cash = bankroll
  let position = null
  const trades = []
  const equity = []

  const warm = Math.max(
    strategy.useMaCross ? Number(strategy.maSlow) || 21 : 0,
    strategy.usePriceVsMa ? Number(strategy.priceCrossMaPeriod) || 21 : 0,
    strategy.usePriceAboveMa ? Number(strategy.priceAboveMaPeriod) || 200 : 0,
    strategy.useRsi ? Number(strategy.rsiPeriod) || 14 : 0,
    strategy.useVolume ? Number(strategy.volumeMaPeriod) || 20 : 0,
    2,
  )

  const markEquity = (i, px) => {
    let eq = cash
    if (position) {
      const pnl =
        position.side === 'long'
          ? (px - position.entry) * position.size
          : (position.entry - px) * position.size
      eq += position.margin + pnl
    }
    equity.push({ t: candles[i].t, equity: eq })
    return eq
  }

  const closePosition = (i, exitPx, reason) => {
    if (!position) return
    const pnl =
      position.side === 'long'
        ? (exitPx - position.entry) * position.size
        : (position.entry - exitPx) * position.size
    const exitNotional = exitPx * position.size
    const fee = feeNotional(exitNotional, strategy.feeBps)
    const net = pnl - fee
    cash += position.margin + net
    trades.push({
      side: position.side,
      entryTime: position.entryTime,
      exitTime: candles[i].t,
      entry: position.entry,
      exit: exitPx,
      size: position.size,
      margin: position.margin,
      pnl: net,
      pnlPct: (net / position.margin) * 100,
      reason,
      bars: i - position.entryIndex,
    })
    position = null
  }

  const openPosition = (i, side) => {
    const px = candles[i].c
    const margin = Math.min(cash, bankroll) // use available cash up to bankroll unit
    if (!(margin > 0) || !(px > 0)) return
    const notional = margin * leverage
    const size = notional / px
    const fee = feeNotional(notional, strategy.feeBps)
    if (fee >= margin) return
    cash -= margin + fee
    position = {
      side,
      entry: px,
      size,
      margin,
      entryTime: candles[i].t,
      entryIndex: i,
      tp:
        side === 'long'
          ? px * (1 + tpPct / 100)
          : px * (1 - tpPct / 100),
      sl:
        side === 'long'
          ? px * (1 - slPct / 100)
          : px * (1 + slPct / 100),
    }
  }

  for (let i = warm; i < candles.length; i += 1) {
    const bar = candles[i]

    if (position) {
      // Intrabar TP/SL — conservative: if both could hit, assume SL first
      if (position.side === 'long') {
        const hitSl = bar.l <= position.sl
        const hitTp = bar.h >= position.tp
        if (hitSl && hitTp) closePosition(i, position.sl, 'stop')
        else if (hitSl) closePosition(i, position.sl, 'stop')
        else if (hitTp) closePosition(i, position.tp, 'take-profit')
      } else {
        const hitSl = bar.h >= position.sl
        const hitTp = bar.l <= position.tp
        if (hitSl && hitTp) closePosition(i, position.sl, 'stop')
        else if (hitSl) closePosition(i, position.sl, 'stop')
        else if (hitTp) closePosition(i, position.tp, 'take-profit')
      }

      // Opposite signal exit
      if (position) {
        if (position.side === 'long' && shortEntryAt(i, candles, ind, strategy)) {
          closePosition(i, bar.c, 'signal')
        } else if (position.side === 'short' && longEntryAt(i, candles, ind, strategy)) {
          closePosition(i, bar.c, 'signal')
        }
      }
    }

    if (!position) {
      const allowLong = sideMode === 'long' || sideMode === 'both'
      const allowShort = sideMode === 'short' || sideMode === 'both'
      if (allowLong && longEntryAt(i, candles, ind, strategy)) {
        openPosition(i, 'long')
      } else if (allowShort && shortEntryAt(i, candles, ind, strategy)) {
        openPosition(i, 'short')
      }
    }

    markEquity(i, bar.c)
  }

  // Flatten at end
  if (position && candles.length) {
    const last = candles.length - 1
    closePosition(last, candles[last].c, 'eod')
    if (equity.length) {
      equity[equity.length - 1] = { t: candles[last].t, equity: cash }
    }
  }

  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const finalEquity = cash
  const returnPct = ((finalEquity - bankroll) / bankroll) * 100

  let peak = bankroll
  let maxDd = 0
  for (const point of equity) {
    if (point.equity > peak) peak = point.equity
    if (peak > 0) {
      const dd = ((peak - point.equity) / peak) * 100
      if (dd > maxDd) maxDd = dd
    }
  }

  return {
    strategy,
    candles,
    indicators: ind,
    candleCount: candles.length,
    start: candles[0]?.t || null,
    end: candles[candles.length - 1]?.t || null,
    trades,
    equity,
    metrics: {
      bankroll,
      finalEquity,
      totalPnl,
      returnPct,
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      avgPnl: trades.length ? totalPnl / trades.length : 0,
      maxDrawdownPct: maxDd,
      profitFactor:
        losses.reduce((s, t) => s + Math.abs(t.pnl), 0) > 0
          ? wins.reduce((s, t) => s + t.pnl, 0) /
            losses.reduce((s, t) => s + Math.abs(t.pnl), 0)
          : wins.length
            ? Infinity
            : 0,
    },
  }
}

export function describePerpsStrategy(s) {
  const n = normalizeStrategy(s)
  const parts = [
    `${n.coin} ${n.interval}`,
    n.sideMode,
    n.usePriceVsMa
      ? `price crosses ${n.maType.toUpperCase()}(${n.priceCrossMaPeriod})`
      : null,
    n.usePriceAboveMa
      ? `price vs ${n.maType.toUpperCase()}(${n.priceAboveMaPeriod})`
      : null,
    n.useMaCross ? `cross ${n.maType.toUpperCase()} ${n.maFast}/${n.maSlow}` : null,
    n.useRsi
      ? `RSI(${n.rsiPeriod}) L<${n.rsiLongBelow} S>${n.rsiShortAbove}`
      : null,
    n.useVolume ? `Vol>${n.volumeMult}×MA(${n.volumeMaPeriod})` : null,
    `TP ${n.takeProfitPct}% / SL ${n.stopLossPct}%`,
    `${n.leverage}×`,
  ]
  return parts.filter(Boolean).join(' · ')
}

export function formatTs(ms) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}
