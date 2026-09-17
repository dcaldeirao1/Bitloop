const DEX_BASE = 'https://api.dexscreener.com'
const ETHPLORER = 'https://api.ethplorer.io'

/**
 * Normalize a DexScreener pair into a flat token opportunity.
 */
export function normalizePair(pair) {
  if (!pair?.baseToken?.address) return null
  const volume24h = Number(pair.volume?.h24 || 0)
  const liquidityUsd = Number(pair.liquidity?.usd || 0)
  const priceUsd = Number(pair.priceUsd || 0)
  const txns24h =
    Number(pair.txns?.h24?.buys || 0) + Number(pair.txns?.h24?.sells || 0)

  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    url: pair.url,
    tokenAddress: pair.baseToken.address,
    symbol: pair.baseToken.symbol || '???',
    name: pair.baseToken.name || pair.baseToken.symbol || 'Unknown',
    quoteSymbol: pair.quoteToken?.symbol || '',
    priceUsd,
    priceNative: Number(pair.priceNative || 0),
    volume24h,
    liquidityUsd,
    marketCap: Number(pair.marketCap || pair.fdv || 0),
    priceChange24h: Number(pair.priceChange?.h24 || 0),
    txns24h,
    pairCreatedAt: pair.pairCreatedAt || null,
  }
}

async function dexGet(path) {
  const res = await fetch(`${DEX_BASE}${path}`)
  if (!res.ok) throw new Error(`DexScreener ${res.status}`)
  return res.json()
}

/** Free-text search across DexScreener pairs. */
export async function searchPairs(query) {
  const q = String(query || '').trim()
  if (!q) return []
  const data = await dexGet(`/latest/dex/search?q=${encodeURIComponent(q)}`)
  const pairs = Array.isArray(data?.pairs) ? data.pairs : []
  return pairs.map(normalizePair).filter(Boolean)
}

/** All pairs for a token on a chain (e.g. ethereum / base / sepolia). */
export async function getTokenPairs(chainId, tokenAddress) {
  const data = await dexGet(
    `/token-pairs/v1/${encodeURIComponent(chainId)}/${tokenAddress}`,
  )
  const list = Array.isArray(data) ? data : data?.pairs || []
  return list.map(normalizePair).filter(Boolean)
}

/** Best (highest liquidity) pair for a token. */
export async function getBestPair(chainId, tokenAddress) {
  const pairs = await getTokenPairs(chainId, tokenAddress)
  if (!pairs.length) return null
  return pairs.sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0]
}

/** Latest boosted / profiled tokens, enriched with pair metrics. */
export async function fetchTrendingOpportunities({
  chainId = 'ethereum',
  limit = 40,
} = {}) {
  const [boosts, profiles] = await Promise.all([
    dexGet('/token-boosts/top/v1').catch(() => []),
    dexGet('/token-profiles/latest/v1').catch(() => []),
  ])

  const candidates = [...(Array.isArray(boosts) ? boosts : []), ...(Array.isArray(profiles) ? profiles : [])]
  const seen = new Set()
  const filtered = []

  for (const item of candidates) {
    if (!item?.tokenAddress || !item?.chainId) continue
    if (chainId && item.chainId !== chainId) continue
    const key = `${item.chainId}:${item.tokenAddress.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    filtered.push(item)
    if (filtered.length >= limit) break
  }

  const results = []
  // Enrich in small parallel batches to respect rate limits
  for (let i = 0; i < filtered.length; i += 4) {
    const batch = filtered.slice(i, i + 4)
    const enriched = await Promise.all(
      batch.map(async (item) => {
        try {
          const best = await getBestPair(item.chainId, item.tokenAddress)
          if (!best) return null
          return {
            ...best,
            description: item.description || null,
            icon: item.icon || null,
          }
        } catch {
          return null
        }
      }),
    )
    results.push(...enriched.filter(Boolean))
  }

  return results.sort((a, b) => b.volume24h - a.volume24h)
}

/**
 * Holder count via Ethplorer (Ethereum mainnet only, free tier).
 * Returns null when unavailable.
 */
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

export function matchesEntryFilters(token, filters) {
  const minVolume = Number(filters.minVolume24h || 0)
  const minHolders = Number(filters.minHolders || 0)
  const minLiquidity = Number(filters.minLiquidityUsd || 0)

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

export function formatUsdCompact(n) {
  const v = Number(n || 0)
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}
