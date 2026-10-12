/**
 * Relay.link bridge helpers (quote + deposit-address flow).
 * @see https://docs.relay.link
 */

export const RELAY_NATIVE =
  '0x0000000000000000000000000000000000000000'

export const RELAY_API_URL = (
  import.meta.env.VITE_RELAY_API_URL || 'https://api.relay.link'
).replace(/\/$/, '')

/** Common tokens per chain (address lowercased for Relay). */
const TOKEN_CATALOG = {
  1: [
    { id: 'ETH', symbol: 'ETH', address: RELAY_NATIVE, decimals: 18, native: true },
    {
      id: 'WETH',
      symbol: 'WETH',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
    },
    {
      id: 'USDC',
      symbol: 'USDC',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    {
      id: 'USDT',
      symbol: 'USDT',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
    },
    {
      id: 'DAI',
      symbol: 'DAI',
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      decimals: 18,
    },
  ],
  8453: [
    { id: 'ETH', symbol: 'ETH', address: RELAY_NATIVE, decimals: 18, native: true },
    {
      id: 'WETH',
      symbol: 'WETH',
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    },
    {
      id: 'USDC',
      symbol: 'USDC',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
    },
    {
      id: 'USDT',
      symbol: 'USDT',
      address: '0xfde4C96c8593536E31F7877A73B276B5dC8C4d3F',
      decimals: 6,
    },
    {
      id: 'DAI',
      symbol: 'DAI',
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      decimals: 18,
    },
  ],
  42161: [
    { id: 'ETH', symbol: 'ETH', address: RELAY_NATIVE, decimals: 18, native: true },
    {
      id: 'WETH',
      symbol: 'WETH',
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      decimals: 18,
    },
    {
      id: 'USDC',
      symbol: 'USDC',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
    },
    {
      id: 'USDT',
      symbol: 'USDT',
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
    },
    {
      id: 'DAI',
      symbol: 'DAI',
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      decimals: 18,
    },
  ],
  10: [
    { id: 'ETH', symbol: 'ETH', address: RELAY_NATIVE, decimals: 18, native: true },
    {
      id: 'WETH',
      symbol: 'WETH',
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    },
    {
      id: 'USDC',
      symbol: 'USDC',
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      decimals: 6,
    },
    {
      id: 'USDT',
      symbol: 'USDT',
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      decimals: 6,
    },
    {
      id: 'DAI',
      symbol: 'DAI',
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      decimals: 18,
    },
  ],
  137: [
    { id: 'MATIC', symbol: 'MATIC', address: RELAY_NATIVE, decimals: 18, native: true },
    {
      id: 'WETH',
      symbol: 'WETH',
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
    },
    {
      id: 'USDC',
      symbol: 'USDC',
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      decimals: 6,
    },
    {
      id: 'USDT',
      symbol: 'USDT',
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
    },
    {
      id: 'DAI',
      symbol: 'DAI',
      address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      decimals: 18,
    },
  ],
}

/** Common EVM chains Relay supports (extend as needed). */
export const RELAY_CHAINS = Object.keys(TOKEN_CATALOG).map((id) => {
  const chainId = Number(id)
  const tokens = TOKEN_CATALOG[chainId]
  const usdc = tokens.find((t) => t.id === 'USDC')?.address
  const names = {
    1: 'Ethereum',
    8453: 'Base',
    42161: 'Arbitrum',
    10: 'Optimism',
    137: 'Polygon',
  }
  return { id: chainId, name: names[chainId] || `Chain ${chainId}`, usdc, tokens }
})

export function relayChain(id) {
  return RELAY_CHAINS.find((c) => c.id === Number(id)) || null
}

export function tokensForChain(chainId) {
  return TOKEN_CATALOG[Number(chainId)] || []
}

export function findChainToken(chainId, tokenId) {
  return tokensForChain(chainId).find((t) => t.id === tokenId) || null
}

export function isNativeCurrency(address) {
  return (
    !address ||
    String(address).toLowerCase() === RELAY_NATIVE.toLowerCase()
  )
}

export function normalizeCurrency(address) {
  if (isNativeCurrency(address)) return RELAY_NATIVE.toLowerCase()
  return String(address).toLowerCase()
}

/** Resolve a catalog id or raw address into Relay currency fields. */
export function resolveRelayToken(chainId, { tokenId, customAddress, decimals } = {}) {
  if (tokenId && tokenId !== 'custom') {
    const preset = findChainToken(chainId, tokenId)
    if (!preset) {
      throw new Error(`Token ${tokenId} is not listed for chain ${chainId}`)
    }
    return {
      id: preset.id,
      symbol: preset.symbol,
      address: normalizeCurrency(preset.address),
      decimals: preset.decimals,
      native: Boolean(preset.native),
    }
  }

  const addr = String(customAddress || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error('Enter a valid token contract address')
  }
  return {
    id: 'custom',
    symbol: 'TOKEN',
    address: normalizeCurrency(addr),
    decimals: Number.isFinite(Number(decimals)) ? Number(decimals) : 18,
    native: isNativeCurrency(addr),
  }
}

/** @deprecated Prefer resolveRelayToken — kept for callers expecting USDC/ETH shortcuts. */
export function currencyForAsset(chainId, asset) {
  if (asset === 'ETH' || asset === 'native') return RELAY_NATIVE
  const token = findChainToken(chainId, asset === 'USDC' ? 'USDC' : asset)
  if (!token?.address) {
    throw new Error(`No ${asset} address configured for chain ${chainId}`)
  }
  return token.address
}

function headers() {
  const key = (import.meta.env.VITE_RELAY_API_KEY || '').trim()
  const h = { 'Content-Type': 'application/json' }
  if (key) h['x-api-key'] = key
  return h
}

/**
 * Request a Relay quote. Prefer useDepositAddress for vault automations
 * (vault can plain-transfer ERC-20 to the deposit address via recurring send).
 */
export async function getRelayQuote({
  user,
  recipient,
  originChainId,
  destinationChainId,
  originCurrency,
  destinationCurrency,
  amount,
  tradeType = 'EXACT_INPUT',
  useDepositAddress = false,
  refundTo,
}) {
  const body = {
    user: String(user).toLowerCase(),
    recipient: String(recipient || user).toLowerCase(),
    originChainId: Number(originChainId),
    destinationChainId: Number(destinationChainId),
    originCurrency: normalizeCurrency(originCurrency),
    destinationCurrency: normalizeCurrency(destinationCurrency),
    amount: String(amount),
    tradeType,
    useDepositAddress: Boolean(useDepositAddress),
  }
  if (useDepositAddress) {
    body.refundTo = String(refundTo || user).toLowerCase()
  }

  const res = await fetch(`${RELAY_API_URL}/quote/v2`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      json?.errors?.[0]?.message ||
      text ||
      `Relay quote failed (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return json
}

export function extractDepositAddress(quote) {
  if (!quote) return null
  if (quote.steps) {
    for (const step of quote.steps) {
      if (step.depositAddress) return step.depositAddress
      for (const item of step.items || []) {
        if (item.depositAddress) return item.depositAddress
        if (item.data?.to && step.id === 'deposit' && quote.useDepositAddress) {
          return item.data.to
        }
      }
    }
  }
  return quote.depositAddress || null
}

export function extractRequestId(quote) {
  if (!quote?.steps?.length) return null
  for (const step of quote.steps) {
    if (step.requestId) return step.requestId
    for (const item of step.items || []) {
      if (item.requestId) return item.requestId
    }
  }
  return null
}

export function summarizeRelayQuote(quote) {
  const details = quote?.details || {}
  const fees = quote?.fees || {}
  return {
    requestId: extractRequestId(quote),
    depositAddress: extractDepositAddress(quote),
    timeEstimate: details.timeEstimate,
    amountIn: details.currencyIn?.amount,
    amountOut: details.currencyOut?.amount,
    symbolIn: details.currencyIn?.currency?.symbol,
    symbolOut: details.currencyOut?.currency?.symbol,
    relayerFee: fees.relayer?.amount,
    gasFee: fees.gas?.amount,
  }
}

export async function getRelayBridgeStatus(requestId) {
  const res = await fetch(
    `${RELAY_API_URL}/intents/status/v3?requestId=${encodeURIComponent(requestId)}`,
    { headers: headers() },
  )
  if (!res.ok) {
    throw new Error(`Relay status failed (${res.status})`)
  }
  return res.json()
}

export function chainLabel(chainId) {
  return relayChain(chainId)?.name || `chain ${chainId}`
}
