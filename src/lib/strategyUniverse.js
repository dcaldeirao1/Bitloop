import {
  fetchNewPools,
  fetchTopPoolsByVolume,
} from './geckoterminal'
import { getHoldersCount, matchesEntryFilters } from './dexscreener'

export const PAIR_SOURCES = [
  {
    id: 'volume',
    label: 'Top by volume',
    hint: 'Same list as Discover → Top by volume',
  },
  {
    id: 'new',
    label: 'New pairs',
    hint: 'Same list as Discover → New pairs',
  },
]

export function pairSourceLabel(pairSource) {
  return PAIR_SOURCES.find((s) => s.id === pairSource)?.label || 'Top by volume'
}

/**
 * Load the Discover universe the strategy should trade.
 * @param {'volume'|'new'} pairSource
 */
export async function fetchStrategyUniverse({
  chainId = 'ethereum',
  pairSource = 'volume',
  limit = 40,
} = {}) {
  const source = pairSource === 'new' ? 'new' : 'volume'
  if (source === 'new') {
    return fetchNewPools({ chainId, limit })
  }
  return fetchTopPoolsByVolume({ chainId, limit })
}

/**
 * Universe + holder enrichment + entry filters (preview / sandbox / dashboard).
 */
export async function fetchFilteredStrategyMatches(
  strategy,
  { limit = 12, enrichHolders = true } = {},
) {
  const chainId = strategy.chainId || 'all'
  const pairSource = strategy.pairSource === 'new' ? 'new' : 'volume'
  const tokens = await fetchStrategyUniverse({
    chainId,
    pairSource,
    limit: Math.max(limit * 2, 24),
  })

  let rows = tokens
  const needHolders = Number(strategy.minHolders || 0) > 0
  if (enrichHolders && needHolders) {
    const top = tokens.slice(0, Math.min(tokens.length, 12))
    rows = await Promise.all(
      top.map(async (t) => {
        // Ethplorer only covers Ethereum — skip extra calls elsewhere
        if (t.chainId !== 'ethereum' && t.chainId !== 'eth') {
          return { ...t, holders: null }
        }
        const holders = await getHoldersCount(t.tokenAddress, t.chainId)
        return { ...t, holders }
      }),
    )
  }

  const filtered = rows.filter((t) =>
    matchesEntryFilters(t, {
      minVolume24h: strategy.minVolume24h,
      minHolders: strategy.minHolders,
      minLiquidityUsd: strategy.minLiquidityUsd,
    }),
  )

  if (pairSource === 'new') {
    filtered.sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
  } else {
    filtered.sort((a, b) => b.volume24h - a.volume24h)
  }

  // One row per token — trending can return the same base across multiple pools
  const deduped = []
  const seen = new Set()
  for (const t of filtered) {
    const key = `${t.chainId}:${String(t.tokenAddress || '').toLowerCase()}`
    if (!t.tokenAddress || seen.has(key)) continue
    seen.add(key)
    deduped.push(t)
  }

  return deduped.slice(0, limit)
}
