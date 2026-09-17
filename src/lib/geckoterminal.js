const GT_ORIGIN = 'https://api.geckoterminal.com'
// Dev: proxy through Vite so 429/error bodies still reach the app (no CORS block)
const GT_BASE =
  typeof window !== 'undefined' && import.meta.env?.DEV
    ? '/api/geckoterminal/api/v2'
    : `${GT_ORIGIN}/api/v2`

/** App / display chain ids → GeckoTerminal network ids */
export const GT_NETWORKS = {
  ethereum: 'eth',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arbitrum-one',
  solana: 'solana',
  polygon: 'polygon_pos',
  avalanche: 'avalanche',
  optimism: 'optimism',
  sui: 'sui-network',
  ton: 'ton',
  tron: 'tron',
  hyperevm: 'hyperevm',
  sonic: 'sonic',
  berachain: 'berachain',
  abstract: 'abstract',
  unichain: 'unichain',
  linea: 'linea',
  scroll: 'scroll',
  blast: 'blast',
  mantle: 'mantle',
  celo: 'celo',
  aptos: 'aptos',
  near: 'near-protocol',
}

/** Human labels for network ids (incl. ones we only show in Discover). */
export const NETWORK_LABELS = {
  eth: 'Ethereum',
  base: 'Base',
  bsc: 'BSC',
  'arbitrum-one': 'Arbitrum',
  solana: 'Solana',
  polygon_pos: 'Polygon',
  avalanche: 'Avalanche',
  optimism: 'Optimism',
  'sui-network': 'Sui',
  ton: 'TON',
  tron: 'Tron',
  hyperevm: 'HyperEVM',
  sonic: 'Sonic',
  berachain: 'Berachain',
  abstract: 'Abstract',
  unichain: 'Unichain',
  linea: 'Linea',
  scroll: 'Scroll',
  blast: 'Blast',
  mantle: 'Mantle',
  celo: 'Celo',
  aptos: 'Aptos',
  'near-protocol': 'NEAR',
  robinhood: 'Robinhood',
}

/** DefiLlama icon slug per GeckoTerminal network id */
const NETWORK_ICON_SLUG = {
  eth: 'ethereum',
  base: 'base',
  bsc: 'bsc',
  'arbitrum-one': 'arbitrum',
  solana: 'solana',
  polygon_pos: 'polygon',
  avalanche: 'avalanche',
  optimism: 'optimism',
  'sui-network': 'sui',
  ton: 'ton',
  tron: 'tron',
  hyperevm: 'hyperliquid',
  sonic: 'sonic',
  berachain: 'berachain',
  abstract: 'abstract',
  unichain: 'unichain',
  linea: 'linea',
  scroll: 'scroll',
  blast: 'blast',
  mantle: 'mantle',
  celo: 'celo',
  aptos: 'aptos',
  'near-protocol': 'near',
  robinhood: 'ethereum',
}

export function networkIconUrl(networkId) {
  const slug = NETWORK_ICON_SLUG[networkId] || networkId
  return `https://icons.llamao.fi/icons/chains/rsz_${slug}.jpg`
}

/** Stablecoins + wrapped gas majors we hide from Discover base tokens. */
const EXCLUDED_SYMBOLS = new Set(
  [
    'USDT',
    'USDC',
    'USD1',
    'USDS',
    'DAI',
    'FRAX',
    'USDE',
    'USDD',
    'TUSD',
    'BUSD',
    'FDUSD',
    'PYUSD',
    'GUSD',
    'LUSD',
    'CRVUSD',
    'GHO',
    'EURC',
    'EUROC',
    'USDP',
    'SUSD',
    'USD0',
    'USDY',
    'USDC.E',
    'USDT.E',
    'DAI.E',
    'CUSD',
    'AUSD',
    'USDBC',
    'USDT0',
    'WETH',
    'ETH',
    'WBNB',
    'BNB',
    'WMATIC',
    'MATIC',
    'POL',
    'WAVAX',
    'AVAX',
    'WSOL',
    'SOL',
    'WFTM',
    'FTM',
    'WS',
    'S',
    'WBTC',
    'BTC',
    'BTCB',
    'CBBTC',
    'TBTC',
    'STETH',
    'WSTETH',
    'CBETH',
    'RETH',
    'WEETH',
    'EZETH',
    'RSETH',
    'METH',
    'WTRX',
    'TRX',
    'WTON',
    'TON',
    'XRP',
    'WXRP',
    'HYPE',
    'WHYPE',
  ].map((s) => s.toUpperCase()),
)

function normalizeSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/^\$/, '')
}

export function isExcludedDiscoverSymbol(symbol) {
  const s = normalizeSymbol(symbol)
  if (!s) return true
  if (EXCLUDED_SYMBOLS.has(s)) return true
  if (/^U?USD[TC0-9]?/.test(s) && s.length <= 8) return true
  if (/^WETH/.test(s)) return true
  return false
}

/** Keep pools whose base token is an interesting (non-stable / non-WETH-like) asset. */
export function isInterestingDiscoverPool(pool) {
  if (!pool?.symbol) return false
  return !isExcludedDiscoverSymbol(pool.symbol)
}

/** Networks fetched when Discover is set to All chains (fallback only). */
const ALL_VOLUME_NETWORKS = [
  'eth',
  'bsc',
  'solana',
  'base',
  'arbitrum-one',
  'polygon_pos',
]

function reverseNetworkLookup(networkId) {
  for (const [appId, gtId] of Object.entries(GT_NETWORKS)) {
    if (gtId === networkId) return appId
  }
  return networkId
}

function networkFromPoolId(poolId = '') {
  const idx = String(poolId).indexOf('_0x')
  if (idx > 0) return String(poolId).slice(0, idx)
  const parts = String(poolId).split('_')
  return parts[0] || ''
}

function includedMap(included = []) {
  const map = new Map()
  for (const item of included) {
    if (item?.id) map.set(item.id, item)
  }
  return map
}

/**
 * Normalize a GeckoTerminal pool into the flat shape used by TradingDiscovery.
 */
export function normalizeGeckoPool(pool, included = new Map(), chainHint = null) {
  if (!pool?.attributes?.address) return null
  const attrs = pool.attributes
  const rel = pool.relationships || {}

  const networkId =
    chainHint ||
    networkFromPoolId(pool.id) ||
    rel.network?.data?.id ||
    'eth'
  const chainId = reverseNetworkLookup(networkId)

  const baseRel = rel.base_token?.data?.id
  const quoteRel = rel.quote_token?.data?.id
  const dexRel = rel.dex?.data?.id

  const base = baseRel ? included.get(baseRel) : null
  const quote = quoteRel ? included.get(quoteRel) : null
  const dex = dexRel ? included.get(dexRel) : null

  const baseAttrs = base?.attributes || {}
  const quoteAttrs = quote?.attributes || {}

  const tokenAddress = baseAttrs.address || String(baseRel || '').replace(/^[^_]+_/, '')
  const symbol =
    baseAttrs.symbol ||
    String(attrs.name || '').split('/')[0]?.trim() ||
    '???'
  const quoteSymbol =
    quoteAttrs.symbol ||
    String(attrs.name || '').split('/')[1]?.trim() ||
    ''

  const tx = attrs.transactions?.h24 || {}
  const txns24h = Number(tx.buys || 0) + Number(tx.sells || 0)
  const created = attrs.pool_created_at
    ? Date.parse(attrs.pool_created_at)
    : null

  const pairAddress = attrs.address
  const geckoUrl = `https://www.geckoterminal.com/${networkId}/pools/${pairAddress}`
  const chartUrl =
    chainId && pairAddress
      ? `https://dexscreener.com/${encodeURIComponent(chainId)}/${pairAddress}`
      : geckoUrl

  return {
    chainId,
    networkId,
    networkLabel: NETWORK_LABELS[networkId] || networkId,
    networkIcon: networkIconUrl(networkId),
    dexId: dex?.attributes?.name || dexRel || 'dex',
    pairAddress,
    url: geckoUrl,
    chartUrl,
    tokenAddress,
    symbol,
    name: baseAttrs.name || symbol,
    quoteSymbol,
    priceUsd: Number(attrs.base_token_price_usd || 0),
    volume24h: Number(attrs.volume_usd?.h24 || 0),
    liquidityUsd: Number(attrs.reserve_in_usd || 0),
    marketCap: Number(attrs.market_cap_usd || attrs.fdv_usd || 0),
    fdv: Number(attrs.fdv_usd || 0),
    priceChange24h: Number(attrs.price_change_percentage?.h24 || 0),
    txns24h,
    buys24h: Number(tx.buys || 0),
    sells24h: Number(tx.sells || 0),
    pairCreatedAt: Number.isFinite(created) ? created : null,
    icon: baseAttrs.image_url || null,
  }
}

async function fetchGtPools(path, { networkHint = null, sort = null } = {}) {
  const params = new URLSearchParams({
    include: 'base_token,quote_token,dex',
  })
  if (sort) params.set('sort', sort)

  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${GT_BASE}${path}${sep}${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 429) {
    throw new Error('GeckoTerminal rate limit — wait a moment and refresh')
  }
  if (!res.ok) {
    throw new Error(`GeckoTerminal ${res.status}`)
  }

  const json = await res.json()
  const included = includedMap(json.included || [])
  const pools = Array.isArray(json.data) ? json.data : []
  return pools
    .map((pool) => normalizeGeckoPool(pool, included, networkHint))
    .filter(Boolean)
}

async function fetchGlobalTrendingPools(page = 1, duration = '24h') {
  return fetchGtPools(
    `/networks/trending_pools?page=${page}&duration=${encodeURIComponent(duration)}`,
  )
}

async function fetchNetworkTopPools(network, page = 1) {
  return fetchGtPools(`/networks/${network}/pools?page=${page}`, {
    networkHint: network,
    sort: 'h24_volume_usd_desc',
  })
}

async function fetchNetworkNewPools(network, page = 1) {
  return fetchGtPools(`/networks/${network}/new_pools?page=${page}`, {
    networkHint: network,
  })
}

async function fetchGlobalNewPools(page = 1) {
  return fetchGtPools(`/networks/new_pools?page=${page}`)
}

function rankInteresting(pools, limit) {
  return pools
    .filter(isInterestingDiscoverPool)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit)
}

function rankNewest(pools, limit) {
  return pools
    .filter(isInterestingDiscoverPool)
    .sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
    .slice(0, limit)
}

/**
 * Top pools sorted by 24h USD volume.
 * Pass chainId `"all"` for a single cross-network trending call (rate-limit friendly).
 * Stablecoins and wrapped majors (WETH, etc.) are filtered out.
 */
export async function fetchTopPoolsByVolume({
  chainId = 'all',
  page = 1,
  limit = 40,
} = {}) {
  if (chainId && chainId !== 'all') {
    const network = GT_NETWORKS[chainId] || chainId
    const pools = await fetchNetworkTopPools(network, page)
    let ranked = rankInteresting(pools, limit)
    if (ranked.length < limit && page === 1) {
      try {
        const more = await fetchNetworkTopPools(network, 2)
        ranked = rankInteresting([...pools, ...more], limit)
      } catch {
        /* keep first page */
      }
    }
    return ranked
  }

  // Prefer one global trending request over N per-network volume calls
  try {
    const page1 = await fetchGlobalTrendingPools(1)
    let merged = page1
    if (page1.length < limit) {
      try {
        await new Promise((r) => setTimeout(r, 300))
        const page2 = await fetchGlobalTrendingPools(2)
        const seen = new Set(
          page1.map((p) => `${p.networkId}:${p.pairAddress}`.toLowerCase()),
        )
        for (const pool of page2) {
          const key = `${pool.networkId}:${pool.pairAddress}`.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          merged = [...merged, pool]
        }
      } catch {
        /* keep first page */
      }
    }
    const ranked = rankInteresting(merged, limit)
    if (ranked.length) return ranked
  } catch (err) {
    console.warn('trending_pools failed, falling back:', err?.message || err)
  }

  // Light fallback — major chains only, sequential pairs of 2
  const merged = []
  const seen = new Set()
  for (let i = 0; i < ALL_VOLUME_NETWORKS.length; i += 2) {
    const batch = ALL_VOLUME_NETWORKS.slice(i, i + 2)
    const results = await Promise.allSettled(
      batch.map((network) => fetchNetworkTopPools(network, 1)),
    )
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      for (const pool of result.value.slice(0, 15)) {
        const key = `${pool.networkId}:${pool.pairAddress}`.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(pool)
      }
    }
    if (i + 2 < ALL_VOLUME_NETWORKS.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  return rankInteresting(merged, limit)
}

/**
 * Newest pools (GeckoTerminal new_pools).
 * Pass chainId `"all"` for cross-network latest, or a specific app chain.
 */
export async function fetchNewPools({ chainId = 'all', limit = 40 } = {}) {
  if (chainId && chainId !== 'all') {
    const network = GT_NETWORKS[chainId] || chainId
    const pools = await fetchNetworkNewPools(network, 1)
    let ranked = rankNewest(pools, limit)
    if (ranked.length < limit) {
      try {
        const more = await fetchNetworkNewPools(network, 2)
        ranked = rankNewest([...pools, ...more], limit)
      } catch {
        /* keep first page */
      }
    }
    return ranked
  }

  // One cheap global call first — avoid parallel pages that burn the rate limit
  const page1 = await fetchGlobalNewPools(1)
  let merged = page1
  if (page1.length < limit) {
    try {
      await new Promise((r) => setTimeout(r, 300))
      const page2 = await fetchGlobalNewPools(2)
      const seen = new Set(
        page1.map((p) => `${p.networkId}:${p.pairAddress}`.toLowerCase()),
      )
      for (const pool of page2) {
        const key = `${pool.networkId}:${pool.pairAddress}`.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        merged = [...merged, pool]
      }
    } catch {
      /* keep first page */
    }
  }

  return rankNewest(merged, limit)
}

export function formatUsdCompact(n) {
  const v = Number(n || 0)
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v > 0) return `$${v.toPrecision(3)}`
  return '$0'
}

export function formatPriceChange(n) {
  const v = Number(n || 0)
  if (!Number.isFinite(v)) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}
