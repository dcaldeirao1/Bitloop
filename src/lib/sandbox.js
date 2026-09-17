import { getBestPair } from './dexscreener'
import { fetchFilteredStrategyMatches } from './strategyUniverse'

export const DEFAULT_BANKROLL_ETH = 10
export const MAX_LIVE_POSITIONS = 8
export const LIVE_POLL_MS = 15_000

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Normalize strategy config from the form or a saved automation rule.
 */
export function strategyFromConfig(config = {}) {
  return {
    chainId: config.chainId || 'all',
    pairSource: config.pairSource === 'new' ? 'new' : 'volume',
    minVolume24h: Number(config.minVolume24h) || 0,
    minHolders: Number(config.minHolders) || 0,
    minLiquidityUsd: Number(config.minLiquidityUsd) || 0,
    buyEth: String(config.buyEth ?? '0.1'),
    takeProfits: Array.isArray(config.takeProfits)
      ? config.takeProfits.map((tp) => ({
          multiple: Number(tp.multiple),
          sellPercent: Number(tp.sellPercent),
        }))
      : [
          { multiple: 2, sellPercent: 50 },
          { multiple: 4, sellPercent: 100 },
        ],
    stopLossPercent: Number(config.stopLossPercent) || 50,
  }
}

export function strategyFromRule(rule) {
  if (!rule) return null
  return strategyFromConfig({
    chainId: rule.trigger?.chainId,
    pairSource: rule.trigger?.pairSource,
    minVolume24h: rule.trigger?.minVolume24h,
    minHolders: rule.trigger?.minHolders,
    minLiquidityUsd: rule.trigger?.minLiquidityUsd,
    buyEth: rule.action?.buyEth,
    takeProfits: rule.action?.takeProfits,
    stopLossPercent: rule.action?.stopLossPercent,
  })
}

export function describeStrategy(strategy) {
  const universe = strategy.pairSource === 'new' ? 'new pairs' : 'top volume'
  const chain =
    !strategy.chainId || strategy.chainId === 'all' ? 'all chains' : strategy.chainId
  const vol =
    strategy.minVolume24h >= 1_000_000
      ? `$${(strategy.minVolume24h / 1_000_000).toFixed(1)}M`
      : strategy.minVolume24h >= 1_000
        ? `$${(strategy.minVolume24h / 1_000).toFixed(0)}K`
        : `$${strategy.minVolume24h}`
  const tps = (strategy.takeProfits || [])
    .map((tp) => `${tp.sellPercent}% @ ${tp.multiple}×`)
    .join(', ')
  return `${chain} · ${universe} · vol ≥ ${vol} · holders ≥ ${strategy.minHolders} · buy ${strategy.buyEth} ETH · ${tps || 'TP —'} · SL −${strategy.stopLossPercent}%`
}

function maxDrawdownPct(equitySeries) {
  if (!equitySeries?.length) return 0
  let peak = equitySeries[0]
  let maxDd = 0
  for (const v of equitySeries) {
    if (v > peak) peak = v
    if (peak > 0) {
      const dd = ((peak - v) / peak) * 100
      if (dd > maxDd) maxDd = dd
    }
  }
  return maxDd
}

function pushTrade(session, trade) {
  return {
    ...session,
    trades: [{ id: uid(), at: Date.now(), ...trade }, ...(session.trades || [])].slice(
      0,
      100,
    ),
  }
}

function pushEquity(session, equity) {
  const point = { t: Date.now(), equity: Number(equity) }
  const curve = [...(session.equityCurve || []), point].slice(-200)
  return { ...session, equityCurve: curve }
}

function remainingBasisEth(pos) {
  if (!pos.tokensInitial) return 0
  return (pos.tokensHeld / pos.tokensInitial) * pos.costEth
}

function markValueEth(pos, priceUsd) {
  const price = Number(priceUsd) || pos.entryPriceUsd
  if (!(pos.entryPriceUsd > 0)) return remainingBasisEth(pos)
  const multiple = price / pos.entryPriceUsd
  return remainingBasisEth(pos) * multiple
}

export function createLiveSession(strategy, bankrollEth = DEFAULT_BANKROLL_ETH) {
  const starting = Number(bankrollEth) || DEFAULT_BANKROLL_ETH
  return {
    id: uid(),
    strategy: strategyFromConfig(strategy),
    status: 'running',
    startingCashEth: starting,
    cashEth: starting,
    positions: [],
    trades: [],
    equityCurve: [{ t: Date.now(), equity: starting }],
    startedAt: Date.now(),
    lastScanAt: null,
    lastMarkAt: null,
    note: null,
  }
}

export function stopLiveSession(session) {
  return { ...session, status: 'stopped' }
}

/**
 * Scan live Discover matches and paper-buy at current prices (mock ETH).
 */
export async function liveScanAndEnter(session, { maxPositions = MAX_LIVE_POSITIONS } = {}) {
  if (!session || session.status !== 'running') return session

  const strategy = session.strategy
  const buyEth = Number(strategy.buyEth)
  if (!(buyEth > 0)) throw new Error('Buy size must be greater than 0')

  let matches = await fetchFilteredStrategyMatches(strategy, { limit: maxPositions })
  let note = null
  if (!matches.length) {
    matches = await fetchFilteredStrategyMatches(
      { ...strategy, minVolume24h: 0, minHolders: 0, minLiquidityUsd: 0 },
      { limit: maxPositions, enrichHolders: false },
    )
    if (matches.length) {
      note = 'No filter matches — entered from the raw live universe this scan.'
    }
  }

  let next = {
    ...session,
    lastScanAt: Date.now(),
    note,
  }

  const openKeys = new Set(
    next.positions
      .filter((p) => p.status === 'open')
      .map((p) => `${p.chainId}:${String(p.tokenAddress).toLowerCase()}`),
  )

  for (const token of matches) {
    const openCount = next.positions.filter((p) => p.status === 'open').length
    if (openCount >= maxPositions) break
    if (next.cashEth + 1e-12 < buyEth) break

    const key = `${token.chainId}:${String(token.tokenAddress).toLowerCase()}`
    if (openKeys.has(key)) continue

    let price = Number(token.priceUsd)
    // Refresh mark from DexScreener when possible
    try {
      if (token.chainId && token.chainId !== 'all' && token.tokenAddress) {
        const best = await getBestPair(token.chainId, token.tokenAddress)
        if (best?.priceUsd) {
          price = best.priceUsd
          token.url = best.url || token.url || token.chartUrl
        }
      }
    } catch {
      /* keep gecko price */
    }

    if (!(price > 0)) continue

    const position = {
      id: uid(),
      chainId: token.chainId,
      tokenAddress: token.tokenAddress,
      pairAddress: token.pairAddress,
      symbol: token.symbol,
      name: token.name,
      url: token.url || token.chartUrl || null,
      entryPriceUsd: price,
      lastPriceUsd: price,
      tokensHeld: 1,
      tokensInitial: 1,
      costEth: buyEth,
      openedAt: Date.now(),
      status: 'open',
      takeProfits: (strategy.takeProfits || []).map((tp) => ({
        multiple: Number(tp.multiple),
        sellPercent: Number(tp.sellPercent),
        hit: false,
      })),
      stopLossPercent: Number(strategy.stopLossPercent) || 50,
      realizedPnlEth: 0,
      exitReason: null,
      volume24h: token.volume24h,
      liquidityUsd: token.liquidityUsd,
    }

    next = {
      ...next,
      cashEth: next.cashEth - buyEth,
      positions: [position, ...next.positions],
    }
    openKeys.add(key)
    next = pushTrade(next, {
      type: 'buy',
      symbol: token.symbol,
      amountEth: buyEth,
      priceUsd: price,
      note: `Paper buy ${token.symbol} @ $${price}`,
    })
  }

  return pushEquity(next, liveEquityEth(next))
}

/**
 * Mark open positions with live prices and apply TP / stop rules.
 * `prices` is optional map of positionId → priceUsd.
 */
export function liveMarkPositions(session, prices = {}) {
  if (!session) return session

  let cashEth = session.cashEth
  const events = []
  const positions = session.positions.map((pos) => {
    if (pos.status !== 'open') return pos
    const price = Number(prices[pos.id] ?? pos.lastPriceUsd)
    if (!(price > 0) || !(pos.entryPriceUsd > 0)) return pos

    let next = { ...pos, lastPriceUsd: price }
    const multiple = price / pos.entryPriceUsd
    const stopMult = 1 - (Number(pos.stopLossPercent) || 50) / 100

    if (next.tokensHeld > 0 && multiple <= stopMult) {
      const basis = remainingBasisEth(next)
      const proceeds = basis * stopMult
      const pnl = proceeds - basis
      cashEth += proceeds
      events.push({
        type: 'stop',
        symbol: pos.symbol,
        amountEth: proceeds,
        priceUsd: price,
        note: `Stop −${pos.stopLossPercent}% on ${pos.symbol} @ ${multiple.toFixed(2)}×`,
      })
      return {
        ...next,
        tokensHeld: 0,
        status: 'closed',
        realizedPnlEth: (next.realizedPnlEth || 0) + pnl,
        exitReason: 'stop',
        closedAt: Date.now(),
      }
    }

    const tps = (next.takeProfits || []).map((tp) => ({ ...tp }))
    for (let i = 0; i < tps.length; i += 1) {
      const tp = tps[i]
      if (tp.hit || next.tokensHeld <= 0) continue
      if (multiple < tp.multiple) continue

      const sellFrac = Math.min(1, Math.max(0, Number(tp.sellPercent) / 100))
      const soldShare = next.tokensHeld * sellFrac
      if (soldShare <= 0) {
        tps[i] = { ...tp, hit: true }
        continue
      }

      const basis = (soldShare / next.tokensInitial) * next.costEth
      const proceeds = basis * tp.multiple
      const pnl = proceeds - basis
      cashEth += proceeds
      next = {
        ...next,
        tokensHeld: next.tokensHeld - soldShare,
        realizedPnlEth: (next.realizedPnlEth || 0) + pnl,
      }
      tps[i] = { ...tp, hit: true }
      events.push({
        type: 'tp',
        symbol: pos.symbol,
        amountEth: proceeds,
        priceUsd: price,
        note: `TP${i + 1} ${tp.multiple}× on ${pos.symbol}`,
      })
    }

    next = { ...next, takeProfits: tps }
    if (next.tokensHeld <= 1e-12) {
      next = {
        ...next,
        tokensHeld: 0,
        status: 'closed',
        exitReason: next.exitReason || 'take_profit',
        closedAt: Date.now(),
      }
    }
    return next
  })

  let nextSession = {
    ...session,
    cashEth,
    positions,
    lastMarkAt: Date.now(),
  }
  for (const ev of events) {
    nextSession = pushTrade(nextSession, ev)
  }
  return pushEquity(nextSession, liveEquityEth(nextSession))
}

/** Fetch live DexScreener marks for open positions, then apply exits. */
export async function liveRefreshMarks(session) {
  if (!session) return session
  const open = session.positions.filter((p) => p.status === 'open')
  if (!open.length) {
    return pushEquity(
      { ...session, lastMarkAt: Date.now() },
      liveEquityEth(session),
    )
  }

  const prices = {}
  await Promise.all(
    open.map(async (pos) => {
      try {
        if (!pos.chainId || pos.chainId === 'all') return
        const best = await getBestPair(pos.chainId, pos.tokenAddress)
        if (best?.priceUsd) prices[pos.id] = best.priceUsd
      } catch {
        /* keep last */
      }
    }),
  )

  // Stamp last prices even when getBestPair misses
  const stamped = {
    ...session,
    positions: session.positions.map((p) =>
      prices[p.id] ? { ...p, lastPriceUsd: prices[p.id] } : p,
    ),
  }
  return liveMarkPositions(stamped, prices)
}

export function liveEquityEth(session) {
  if (!session) return 0
  let openValue = 0
  for (const pos of session.positions) {
    if (pos.status !== 'open') continue
    openValue += markValueEth(pos, pos.lastPriceUsd)
  }
  return session.cashEth + openValue
}

export function liveSessionMetrics(session) {
  if (!session) {
    return emptyMetrics(DEFAULT_BANKROLL_ETH)
  }
  const open = session.positions.filter((p) => p.status === 'open')
  const closed = session.positions.filter((p) => p.status === 'closed')
  let unrealized = 0
  for (const pos of open) {
    const mark = markValueEth(pos, pos.lastPriceUsd)
    unrealized += mark - remainingBasisEth(pos)
  }
  const realized = session.positions.reduce((s, p) => s + (p.realizedPnlEth || 0), 0)
  const equity = liveEquityEth(session)
  const starting = session.startingCashEth
  const totalPnl = equity - starting
  const equitySeries = (session.equityCurve || []).map((p) => p.equity)
  const wins = closed.filter((p) => (p.realizedPnlEth || 0) > 0).length
  const losses = closed.filter((p) => (p.realizedPnlEth || 0) < 0).length

  return {
    startingEth: starting,
    endingEth: equity,
    cashEth: session.cashEth,
    openValueEth: equity - session.cashEth,
    totalPnlEth: totalPnl,
    totalPnlPct: starting > 0 ? (totalPnl / starting) * 100 : 0,
    realizedPnlEth: realized,
    unrealizedPnlEth: unrealized,
    maxDrawdownPct: maxDrawdownPct(equitySeries.length ? equitySeries : [starting]),
    openCount: open.length,
    closedCount: closed.length,
    trades: closed.length,
    wins,
    losses,
    winRatePct: closed.length ? (wins / closed.length) * 100 : 0,
    bankrollUsedEth: Math.max(0, starting - session.cashEth + unrealized + realized),
  }
}

/** Manually close remaining size at live mark. */
export function liveClosePosition(session, positionId, priceUsd) {
  const price = Number(priceUsd)
  if (!(price > 0)) throw new Error('Missing live mark price')

  let cashEth = session.cashEth
  let trade = null
  const positions = session.positions.map((pos) => {
    if (pos.id !== positionId || pos.status !== 'open') return pos
    const multiple = price / pos.entryPriceUsd
    const basis = remainingBasisEth(pos)
    const proceeds = basis * multiple
    const pnl = proceeds - basis
    cashEth += proceeds
    trade = {
      type: 'close',
      symbol: pos.symbol,
      amountEth: proceeds,
      priceUsd: price,
      note: `Manual close ${pos.symbol} @ ${multiple.toFixed(2)}×`,
    }
    return {
      ...pos,
      lastPriceUsd: price,
      tokensHeld: 0,
      status: 'closed',
      realizedPnlEth: (pos.realizedPnlEth || 0) + pnl,
      exitReason: 'manual',
      closedAt: Date.now(),
    }
  })

  let next = { ...session, cashEth, positions }
  if (trade) next = pushTrade(next, trade)
  return pushEquity(next, liveEquityEth(next))
}

function emptyMetrics(bankrollEth) {
  return {
    startingEth: bankrollEth,
    endingEth: bankrollEth,
    cashEth: bankrollEth,
    openValueEth: 0,
    totalPnlEth: 0,
    totalPnlPct: 0,
    realizedPnlEth: 0,
    unrealizedPnlEth: 0,
    maxDrawdownPct: 0,
    openCount: 0,
    closedCount: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    winRatePct: 0,
    bankrollUsedEth: 0,
  }
}

export function formatEth(n, digits = 4) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs !== 0 && abs < 0.0001) return v.toExponential(2)
  return v.toFixed(digits).replace(/\.?0+$/, '') || '0'
}

export function formatPct(n, digits = 1) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(digits)}%`
}

export function formatPnlEth(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${formatEth(v)} ETH`
}

export function formatAge(ts) {
  if (!ts) return '—'
  const s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}
