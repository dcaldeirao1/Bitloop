/**
 * DexScreener screener helpers for the keeper (Node, no Vite).
 */

const DEX_BASE = 'https://api.dexscreener.com'
const ETHPLORER = 'https://api.ethplorer.io'

function normalizePair(pair) {
  if (!pair?.baseToken?.address) return null
  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    tokenAddress: pair.baseToken.address,
    symbol: pair.baseToken.symbol || '???',
    name: pair.baseToken.name || '',
    priceUsd: Number(pair.priceUsd || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    liquidityUsd: Number(pair.liquidity?.usd || 0),
    priceChange24h: Number(pair.priceChange?.h24 || 0),
  }
}

async function dexGet(path) {
  const res = await fetch(`${DEX_BASE}${path}`)
  if (!res.ok) throw new Error(`DexScreener ${res.status}`)
  return res.json()
}

export async function getBestPair(chainId, tokenAddress) {
  const data = await dexGet(
    `/token-pairs/v1/${encodeURIComponent(chainId)}/${tokenAddress}`,
  )
  const list = (Array.isArray(data) ? data : data?.pairs || [])
    .map(normalizePair)
    .filter(Boolean)
  if (!list.length) return null
  return list.sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0]
}

export async function fetchTrending(chainId = 'ethereum', limit = 20) {
  const [boosts, profiles] = await Promise.all([
    dexGet('/token-boosts/top/v1').catch(() => []),
    dexGet('/token-profiles/latest/v1').catch(() => []),
  ])
  const candidates = [
    ...(Array.isArray(boosts) ? boosts : []),
    ...(Array.isArray(profiles) ? profiles : []),
  ]
  const seen = new Set()
  const filtered = []
  for (const item of candidates) {
    if (!item?.tokenAddress || item.chainId !== chainId) continue
    const key = item.tokenAddress.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    filtered.push(item)
    if (filtered.length >= limit) break
  }

  const out = []
  for (let i = 0; i < filtered.length; i += 3) {
    const batch = filtered.slice(i, i + 3)
    const rows = await Promise.all(
      batch.map(async (item) => {
        try {
          return await getBestPair(item.chainId, item.tokenAddress)
        } catch {
          return null
        }
      }),
    )
    out.push(...rows.filter(Boolean))
  }
  return out.sort((a, b) => b.volume24h - a.volume24h)
}

export async function getHoldersCount(tokenAddress, chainId = 'ethereum') {
  if (chainId !== 'ethereum' && chainId !== 'eth') return null
  try {
    const res = await fetch(
      `${ETHPLORER}/getTokenInfo/${tokenAddress}?apiKey=freekey`,
    )
    if (!res.ok) return null
    const data = await res.json()
    const n = Number(data?.holdersCount)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function matchesFilters(token, trigger) {
  const minVolume = Number(trigger.minVolume24h || 0)
  const minHolders = Number(trigger.minHolders || 0)
  const minLiquidity = Number(trigger.minLiquidityUsd || 0)
  if (minVolume > 0 && token.volume24h < minVolume) return false
  if (minLiquidity > 0 && token.liquidityUsd < minLiquidity) return false
  if (minHolders > 0) {
    if (token.holders == null) {
      if (token.chainId === 'ethereum' || token.chainId === 'eth') return false
    } else if (token.holders < minHolders) {
      return false
    }
  }
  return true
}

/**
 * Open a paper position and/or update TP/SL state from live DexScreener price.
 * Returns updated action_config.
 */
export function applyMatchAndExits(action, match) {
  const now = new Date().toISOString()
  const takeProfits = action.takeProfits || []
  const stopLossPercent = Number(action.stopLossPercent || 50)
  let positions = Array.isArray(action.positions) ? [...action.positions] : []

  const already = positions.some(
    (p) =>
      p.tokenAddress?.toLowerCase() === match.tokenAddress.toLowerCase() &&
      (p.status === 'open' || p.status === 'partial'),
  )

  if (!already && match.priceUsd > 0) {
    positions.push({
      id: `${match.tokenAddress}-${Date.now()}`,
      tokenAddress: match.tokenAddress,
      symbol: match.symbol,
      chainId: match.chainId,
      entryPriceUsd: match.priceUsd,
      buyEth: action.buyEth,
      remainingPercent: 100,
      status: 'open',
      openedAt: now,
      hits: [],
    })
  }

  positions = positions.map((pos) => {
    if (pos.status === 'closed' || pos.status === 'stopped') return pos
    if (pos.tokenAddress.toLowerCase() !== match.tokenAddress.toLowerCase()) {
      return pos
    }
    const entry = Number(pos.entryPriceUsd)
    const price = Number(match.priceUsd)
    if (!(entry > 0) || !(price > 0)) return pos

    const multiple = price / entry
    const dropPct = ((entry - price) / entry) * 100
    let remaining = Number(pos.remainingPercent ?? 100)
    const hits = [...(pos.hits || [])]
    let status = pos.status || 'open'

    if (dropPct >= stopLossPercent && remaining > 0) {
      hits.push({ type: 'stop', at: now, price, remainingSold: remaining })
      remaining = 0
      status = 'stopped'
    } else {
      for (const tp of takeProfits) {
        const key = `tp-${tp.multiple}`
        if (hits.some((h) => h.type === key)) continue
        if (multiple >= Number(tp.multiple) && remaining > 0) {
          const sellPct = Math.min(remaining, Number(tp.sellPercent) || 0)
          remaining = Math.max(0, remaining - sellPct)
          hits.push({ type: key, at: now, price, multiple, soldPercent: sellPct })
          status = remaining <= 0 ? 'closed' : 'partial'
        }
      }
    }

    return { ...pos, remainingPercent: remaining, hits, status, lastPriceUsd: price }
  })

  return {
    ...action,
    lastScanAt: now,
    lastMatch: {
      symbol: match.symbol,
      tokenAddress: match.tokenAddress,
      volume24h: match.volume24h,
      priceUsd: match.priceUsd,
      at: now,
    },
    positions,
  }
}

/* ── GeckoTerminal Discover universes (top volume / new pairs) ── */

const GT_BASE = 'https://api.geckoterminal.com/api/v2'

const GT_NETWORKS = {
  ethereum: 'eth',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arbitrum-one',
  solana: 'solana',
  polygon: 'polygon_pos',
  avalanche: 'avalanche',
  optimism: 'optimism',
}

function reverseGtNetwork(networkId) {
  for (const [appId, gtId] of Object.entries(GT_NETWORKS)) {
    if (gtId === networkId) return appId
  }
  return networkId
}

function networkFromPoolId(poolId = '') {
  const idx = String(poolId).indexOf('_0x')
  if (idx > 0) return String(poolId).slice(0, idx)
  return String(poolId).split('_')[0] || ''
}

function includedMap(included = []) {
  const map = new Map()
  for (const item of included) {
    if (item?.id) map.set(item.id, item)
  }
  return map
}

function normalizeGeckoPool(pool, included = new Map(), networkHint = null) {
  if (!pool?.attributes?.address) return null
  const attrs = pool.attributes
  const rel = pool.relationships || {}
  const networkId =
    networkHint || networkFromPoolId(pool.id) || rel.network?.data?.id || 'eth'
  const chainId = reverseGtNetwork(networkId)
  const baseRel = rel.base_token?.data?.id
  const quoteRel = rel.quote_token?.data?.id
  const base = baseRel ? included.get(baseRel) : null
  const quote = quoteRel ? included.get(quoteRel) : null
  const baseAttrs = base?.attributes || {}
  const quoteAttrs = quote?.attributes || {}
  const tokenAddress =
    baseAttrs.address || String(baseRel || '').replace(/^[^_]+_/, '')
  const symbol =
    baseAttrs.symbol ||
    String(attrs.name || '').split('/')[0]?.trim() ||
    '???'
  const created = attrs.pool_created_at
    ? Date.parse(attrs.pool_created_at)
    : null
  const tx = attrs.transactions?.h24 || {}

  return {
    chainId,
    dexId: rel.dex?.data?.id || 'dex',
    pairAddress: attrs.address,
    url: `https://dexscreener.com/${encodeURIComponent(chainId)}/${attrs.address}`,
    tokenAddress,
    symbol,
    name: baseAttrs.name || symbol,
    quoteSymbol: quoteAttrs.symbol || '',
    priceUsd: Number(attrs.base_token_price_usd || 0),
    volume24h: Number(attrs.volume_usd?.h24 || 0),
    liquidityUsd: Number(attrs.reserve_in_usd || 0),
    marketCap: Number(attrs.market_cap_usd || attrs.fdv_usd || 0),
    priceChange24h: Number(attrs.price_change_percentage?.h24 || 0),
    txns24h: Number(tx.buys || 0) + Number(tx.sells || 0),
    pairCreatedAt: Number.isFinite(created) ? created : null,
  }
}

async function fetchGtPools(path, networkHint = null, sort = null) {
  const params = new URLSearchParams({
    include: 'base_token,quote_token,dex',
  })
  if (sort) params.set('sort', sort)
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${GT_BASE}${path}${sep}${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`)
  const json = await res.json()
  const included = includedMap(json.included || [])
  return (Array.isArray(json.data) ? json.data : [])
    .map((pool) => normalizeGeckoPool(pool, included, networkHint))
    .filter(Boolean)
}

/**
 * Discover list for a strategy: top volume or new pairs (GeckoTerminal).
 * Pass chainId `"all"` for cross-network. Falls back to DexScreener trending.
 */
export async function fetchStrategyUniverse(
  chainId = 'ethereum',
  pairSource = 'volume',
  limit = 24,
) {
  const source = pairSource === 'new' ? 'new' : 'volume'
  try {
    let pools = []

    if (!chainId || chainId === 'all') {
      if (source === 'new') {
        pools = await fetchGtPools(`/networks/new_pools?page=1`)
      } else {
        pools = await fetchGtPools(
          `/networks/trending_pools?page=1&duration=24h`,
        )
      }
    } else {
      const network = GT_NETWORKS[chainId] || chainId
      if (source === 'new') {
        pools = await fetchGtPools(
          `/networks/${network}/new_pools?page=1`,
          network,
        )
      } else {
        pools = await fetchGtPools(
          `/networks/${network}/pools?page=1`,
          network,
          'h24_volume_usd_desc',
        )
      }
    }

    if (source === 'new') {
      pools.sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
    } else {
      pools.sort((a, b) => b.volume24h - a.volume24h)
    }
    if (pools.length) return pools.slice(0, limit)
  } catch (err) {
    console.warn(`gecko universe ${chainId}/${source}:`, err.message || err)
  }
  if (chainId && chainId !== 'all') {
    return fetchTrending(chainId, limit)
  }
  return fetchTrending('ethereum', limit)
}
