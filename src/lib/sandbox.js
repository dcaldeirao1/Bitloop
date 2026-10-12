import { getBestPair } from './dexscreener'
import { fetchFilteredStrategyMatches } from './strategyUniverse'

export const DEFAULT_BANKROLL_ETH = 10
export const MAX_LIVE_POSITIONS = 8
export const LIVE_POLL_MS = 5_000

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

function positionMultiple(pos, priceUsd, marketCap) {
  const entryMcap = Number(pos.entryMarketCap)
  const markMcap = Number(marketCap ?? pos.lastMarketCap)
  if (entryMcap > 0 && markMcap > 0) return markMcap / entryMcap

  const entryPx = Number(pos.entryPriceUsd)
  const markPx = Number(priceUsd ?? pos.lastPriceUsd)
  if (entryPx > 0 && markPx > 0) return markPx / entryPx
  return 1
}

function markValueEth(pos, priceUsd, marketCap) {
  const multiple = positionMultiple(pos, priceUsd, marketCap)
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
    let marketCap = Number(token.marketCap || token.fdv || 0)
    // Refresh mark from DexScreener when possible
    try {
      if (token.chainId && token.chainId !== 'all' && token.tokenAddress) {
        const best = await getBestPair(token.chainId, token.tokenAddress)
        if (best?.priceUsd) price = best.priceUsd
        if (best?.marketCap) marketCap = best.marketCap
        if (best?.url) token.url = best.url || token.url || token.chartUrl
      }
    } catch {
      /* keep gecko quote */
    }

    if (!(price > 0) && !(marketCap > 0)) continue
    // Prefer a synthetic price from mcap only for internal math when px missing
    if (!(price > 0) && marketCap > 0) price = marketCap

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
      entryMarketCap: marketCap || 0,
      lastMarketCap: marketCap || 0,
      maxMultiple: 1,
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
      fills: [],
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
      marketCap,
      note: `Paper buy ${token.symbol}`,
    })
  }

  return pushEquity(next, liveEquityEth(next))
}

/**
 * Mark open positions with live quotes and apply TP / stop rules.
 * `quotes` is optional map of positionId → { priceUsd, marketCap }.
 *
 * Take-profits are applied before stop, using a peak multiple so a pump→dump
 * between polls still records TP fills (at the TP trigger level).
 */
export function liveMarkPositions(session, quotes = {}) {
  if (!session) return session

  let cashEth = session.cashEth
  const events = []
  const positions = session.positions.map((pos) => {
    if (pos.status !== 'open') return pos
    const quote = quotes[pos.id] || {}
    const price = Number(quote.priceUsd ?? pos.lastPriceUsd)
    const marketCap = Number(quote.marketCap ?? pos.lastMarketCap)
    const multiple = positionMultiple(pos, price, marketCap)
    if (!(multiple > 0)) return pos

    const peak = Math.max(Number(pos.maxMultiple) || 1, multiple)
    let next = {
      ...pos,
      lastPriceUsd: price > 0 ? price : pos.lastPriceUsd,
      lastMarketCap: marketCap > 0 ? marketCap : pos.lastMarketCap,
      maxMultiple: peak,
    }
    const stopMult = 1 - (Number(pos.stopLossPercent) || 50) / 100

    // 1) Take profits first (against peak so inter-poll pumps still count)
    const tps = (next.takeProfits || []).map((tp) => ({ ...tp }))
    for (let i = 0; i < tps.length; i += 1) {
      const tp = tps[i]
      if (tp.hit || next.tokensHeld <= 0) continue
      if (peak < tp.multiple) continue

      const sellFrac = Math.min(1, Math.max(0, Number(tp.sellPercent) / 100))
      const soldShare = next.tokensHeld * sellFrac
      if (soldShare <= 0) {
        tps[i] = { ...tp, hit: true }
        continue
      }

      const basis = (soldShare / next.tokensInitial) * next.costEth
      // Missed between polls → fill at TP trigger; otherwise at live mark
      const fillMult = multiple >= tp.multiple ? multiple : tp.multiple
      const proceeds = basis * fillMult
      const pnl = proceeds - basis
      cashEth += proceeds
      next = {
        ...next,
        tokensHeld: next.tokensHeld - soldShare,
        realizedPnlEth: (next.realizedPnlEth || 0) + pnl,
        exitMarketCap: marketCap > 0 ? marketCap : next.lastMarketCap,
        exitPriceUsd: price > 0 ? price : next.lastPriceUsd,
        exitMultiple: fillMult,
        targetMultiple: tp.multiple,
        fills: [
          ...(next.fills || []),
          {
            type: `tp${i + 1}`,
            at: Date.now(),
            multiple: fillMult,
            targetMultiple: tp.multiple,
            marketCap,
            priceUsd: price,
            soldPct: sellFrac * 100,
            pnlEth: pnl,
            amountEth: proceeds,
          },
        ],
      }
      tps[i] = { ...tp, hit: true }
      events.push({
        type: 'tp',
        symbol: pos.symbol,
        amountEth: proceeds,
        priceUsd: price,
        marketCap,
        multiple: fillMult,
        targetMultiple: tp.multiple,
        pnlEth: pnl,
        note: `TP${i + 1} @ ${tp.multiple}× on ${pos.symbol} · filled ${fillMult.toFixed(3)}×`,
      })
    }

    next = { ...next, takeProfits: tps }

    if (next.tokensHeld <= 1e-12) {
      return {
        ...next,
        tokensHeld: 0,
        status: 'closed',
        exitReason: 'take_profit',
        exitMarketCap: next.exitMarketCap || (marketCap > 0 ? marketCap : next.lastMarketCap),
        exitPriceUsd: next.exitPriceUsd || (price > 0 ? price : next.lastPriceUsd),
        exitMultiple: next.exitMultiple || multiple,
        closedAt: Date.now(),
      }
    }

    // 2) Stop on remaining size at live mark
    if (next.tokensHeld > 0 && multiple <= stopMult) {
      const basis = remainingBasisEth(next)
      const proceeds = basis * multiple
      const pnl = proceeds - basis
      cashEth += proceeds
      const hadTp = (next.fills || []).some((f) => String(f.type).startsWith('tp'))
      events.push({
        type: 'stop',
        symbol: pos.symbol,
        amountEth: proceeds,
        priceUsd: price,
        marketCap,
        multiple,
        targetMultiple: stopMult,
        pnlEth: pnl,
        note: hadTp
          ? `Stop −${pos.stopLossPercent}% on ${pos.symbol} after TP · filled ${multiple.toFixed(3)}×`
          : `Stop −${pos.stopLossPercent}% on ${pos.symbol} · filled ${multiple.toFixed(3)}× (target ${stopMult.toFixed(2)}×)`,
      })
      return {
        ...next,
        tokensHeld: 0,
        status: 'closed',
        realizedPnlEth: (next.realizedPnlEth || 0) + pnl,
        exitReason: 'stop',
        exitMarketCap: marketCap > 0 ? marketCap : next.lastMarketCap,
        exitPriceUsd: price > 0 ? price : next.lastPriceUsd,
        exitMultiple: multiple,
        targetMultiple: stopMult,
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

/** Human-readable exit path, e.g. "TP1 → TP2" or "TP1 → SL". */
export function positionExitPath(pos) {
  if (!pos) return '—'
  const parts = []
  const fills = Array.isArray(pos.fills) ? pos.fills : []
  if (fills.length) {
    for (const f of fills) {
      const t = String(f.type || '')
      if (t.startsWith('tp')) parts.push(t.toUpperCase())
    }
  } else {
    ;(pos.takeProfits || []).forEach((tp, i) => {
      if (tp.hit) parts.push(`TP${i + 1}`)
    })
  }
  const reason = pos.exitReason
  if (reason === 'stop') parts.push(`SL −${pos.stopLossPercent ?? '?'}%`)
  else if (reason === 'manual') parts.push('Manual')
  else if (reason === 'take_profit' && parts.length === 0) parts.push('Take profit')
  return parts.length ? parts.join(' → ') : String(reason || '—').replace(/_/g, ' ')
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

  const quotes = {}
  await Promise.all(
    open.map(async (pos) => {
      try {
        if (!pos.chainId || pos.chainId === 'all') return
        const best = await getBestPair(pos.chainId, pos.tokenAddress)
        if (!best) return
        quotes[pos.id] = {
          priceUsd: best.priceUsd || pos.lastPriceUsd,
          marketCap: best.marketCap || pos.lastMarketCap,
        }
      } catch {
        /* keep last */
      }
    }),
  )

  const stamped = {
    ...session,
    positions: session.positions.map((p) => {
      const q = quotes[p.id]
      if (!q) return p
      return {
        ...p,
        lastPriceUsd: q.priceUsd > 0 ? q.priceUsd : p.lastPriceUsd,
        lastMarketCap: q.marketCap > 0 ? q.marketCap : p.lastMarketCap,
      }
    }),
  }
  return liveMarkPositions(stamped, quotes)
}

export function liveEquityEth(session) {
  if (!session) return 0
  let openValue = 0
  for (const pos of session.positions) {
    if (pos.status !== 'open') continue
    openValue += markValueEth(pos, pos.lastPriceUsd, pos.lastMarketCap)
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
    const mark = markValueEth(pos, pos.lastPriceUsd, pos.lastMarketCap)
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
export function liveClosePosition(session, positionId, quote = {}) {
  const price = Number(quote.priceUsd)
  const marketCap = Number(quote.marketCap)
  const multiple = (() => {
    const pos = session.positions.find((p) => p.id === positionId)
    if (!pos) return 0
    return positionMultiple(pos, price, marketCap)
  })()
  if (!(multiple > 0)) throw new Error('Missing live mark')

  let cashEth = session.cashEth
  let trade = null
  const positions = session.positions.map((pos) => {
    if (pos.id !== positionId || pos.status !== 'open') return pos
    const basis = remainingBasisEth(pos)
    const proceeds = basis * multiple
    const pnl = proceeds - basis
    cashEth += proceeds
    trade = {
      type: 'close',
      symbol: pos.symbol,
      amountEth: proceeds,
      priceUsd: price,
      marketCap,
      multiple,
      pnlEth: pnl,
      note: `Manual close ${pos.symbol} @ ${multiple.toFixed(3)}×`,
    }
    return {
      ...pos,
      lastPriceUsd: price > 0 ? price : pos.lastPriceUsd,
      lastMarketCap: marketCap > 0 ? marketCap : pos.lastMarketCap,
      tokensHeld: 0,
      status: 'closed',
      realizedPnlEth: (pos.realizedPnlEth || 0) + pnl,
      exitReason: 'manual',
      exitMarketCap: marketCap > 0 ? marketCap : pos.lastMarketCap,
      exitPriceUsd: price > 0 ? price : pos.lastPriceUsd,
      exitMultiple: multiple,
      closedAt: Date.now(),
    }
  })

  let next = { ...session, cashEth, positions }
  if (trade) next = pushTrade(next, trade)
  return pushEquity(next, liveEquityEth(next))
}

const SANDBOX_STORAGE_PREFIX = 'pm.trenches.sandbox.session.v1'

export function sandboxStorageKey(walletAddress, strategyId) {
  return `${SANDBOX_STORAGE_PREFIX}:${String(walletAddress || 'anon').toLowerCase()}:${strategyId || 'draft'}`
}

export function loadSandboxSession(walletAddress, strategyId) {
  try {
    const raw = localStorage.getItem(sandboxStorageKey(walletAddress, strategyId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveSandboxSession(walletAddress, strategyId, session) {
  try {
    if (!session) {
      localStorage.removeItem(sandboxStorageKey(walletAddress, strategyId))
      return
    }
    localStorage.setItem(
      sandboxStorageKey(walletAddress, strategyId),
      JSON.stringify(session),
    )
  } catch {
    /* ignore quota */
  }
}

export function clearSandboxSession(walletAddress, strategyId) {
  saveSandboxSession(walletAddress, strategyId, null)
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

export function positionDisplayMultiple(pos) {
  return positionMultiple(pos, pos.lastPriceUsd, pos.lastMarketCap)
}
