import { BrowserProvider, Wallet } from 'ethers'
import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid'
import { formatPrice, formatSize, SymbolConverter } from '@nktkas/hyperliquid/utils'

/** Phase 1+2 ships on Hyperliquid testnet only. */
export const HL_IS_TESTNET = true

export const HL_APP_URL = HL_IS_TESTNET
  ? 'https://app.hyperliquid-testnet.xyz'
  : 'https://app.hyperliquid.xyz'

export const HL_FAUCET_HINT =
  'Fund your address on Hyperliquid testnet (faucet / bridge), then refresh.'

export const FEATURED_PERPS = ['BTC', 'ETH', 'SOL', 'HYPE', 'ARB', 'OP', 'DOGE', 'kPEPE']

/** Fallback while markets load. */
export const PERP_MARKETS = [
  { coin: 'BTC', label: 'BTC-PERP', maxLeverage: 40 },
  { coin: 'ETH', label: 'ETH-PERP', maxLeverage: 25 },
  { coin: 'SOL', label: 'SOL-PERP', maxLeverage: 10 },
]

/** Keep SL at least this fraction of entry away from estimated liq. */
export const SL_LIQ_BUFFER_FRAC = 0.0025

const AGENT_STORAGE_PREFIX = 'pm-hl-agent-v2'
const AGENT_STORAGE_LEGACY = 'pm-hl-agent-v1'
const AGENT_NAME = 'pm-desk'
const ENTRY_SLIPPAGE = 0.005 // 0.5% aggressive IOC vs mid
const TRIGGER_LIMIT_BUFFER = 0.01 // 1% limit cushion on market TP/SL

/** In-memory agent keys for this tab (also persisted locally for hackathon UX). */
const unlockedPrivateKeys = new Map()

let transportSingleton = null
let infoSingleton = null
let converterPromise = null

function normalizeOwner(owner) {
  return String(owner || '').trim().toLowerCase()
}

function agentStorageKey(owner) {
  return `${AGENT_STORAGE_PREFIX}:${normalizeOwner(owner)}`
}

function legacyStorageKey(owner) {
  return `${AGENT_STORAGE_LEGACY}:${normalizeOwner(owner)}`
}

export function getHlTransport() {
  if (!transportSingleton) {
    transportSingleton = new HttpTransport({ isTestnet: HL_IS_TESTNET })
  }
  return transportSingleton
}

export function getHlInfo() {
  if (!infoSingleton) {
    infoSingleton = new InfoClient({ transport: getHlTransport() })
  }
  return infoSingleton
}

async function getConverter() {
  if (!converterPromise) {
    converterPromise = SymbolConverter.create({ transport: getHlTransport() })
  }
  return converterPromise
}

async function getBrowserSigner() {
  if (!window.ethereum) {
    throw new Error('MetaMask is required to connect Hyperliquid.')
  }
  const provider = new BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  return provider.getSigner()
}

function getMasterExchange() {
  return getBrowserSigner().then(
    (wallet) =>
      new ExchangeClient({
        transport: getHlTransport(),
        wallet,
      }),
  )
}

function getAgentExchange(privateKey) {
  const wallet = new Wallet(privateKey)
  return new ExchangeClient({
    transport: getHlTransport(),
    wallet,
  })
}

function readRawRecord(ownerAddress) {
  if (!ownerAddress) return null
  try {
    const raw = localStorage.getItem(agentStorageKey(ownerAddress))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readLegacyPlaintext(ownerAddress) {
  if (!ownerAddress) return null
  try {
    const raw = localStorage.getItem(legacyStorageKey(ownerAddress))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.privateKey || !parsed?.address) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Load agent private key into memory from local storage (no passphrase).
 * Encrypted v2 records cannot be recovered — user must forget + re-approve.
 */
function hydrateAgentKey(ownerAddress) {
  const owner = normalizeOwner(ownerAddress)
  if (!owner) return null
  if (unlockedPrivateKeys.has(owner)) {
    return unlockedPrivateKeys.get(owner)
  }

  const record = readRawRecord(owner)
  if (record?.v === 3 && record.privateKey && record.address) {
    unlockedPrivateKeys.set(owner, record.privateKey)
    return record.privateKey
  }

  // Encrypted v2 — cannot unlock without passphrase (removed from product)
  if (record?.v === 2 && record.ciphertext) {
    return null
  }

  const legacy = readLegacyPlaintext(owner)
  if (legacy?.privateKey) {
    unlockedPrivateKeys.set(owner, legacy.privateKey)
    // Upgrade to v3 so next load is consistent
    try {
      persistAgent(owner, {
        address: legacy.address,
        privateKey: legacy.privateKey,
        approvedAt: legacy.approvedAt || Date.now(),
        name: legacy.name || AGENT_NAME,
      })
    } catch {
      /* ignore */
    }
    return legacy.privateKey
  }

  return null
}

function persistAgent(ownerAddress, session) {
  const owner = normalizeOwner(ownerAddress)
  localStorage.setItem(
    agentStorageKey(owner),
    JSON.stringify({
      v: 3,
      address: session.address,
      privateKey: session.privateKey,
      approvedAt: session.approvedAt,
      name: session.name,
    }),
  )
  try {
    localStorage.removeItem(legacyStorageKey(owner))
  } catch {
    /* ignore */
  }
  unlockedPrivateKeys.set(owner, session.privateKey)
}

/**
 * Public agent status (never returns the private key).
 * @returns {{ address, approvedAt, name, unlocked, needsReapprove } | null}
 */
export function getAgentStatus(ownerAddress) {
  if (!ownerAddress) return null
  const owner = normalizeOwner(ownerAddress)
  const record = readRawRecord(owner)

  // Old passphrase-encrypted vault — must re-approve
  if (record?.v === 2 && record.ciphertext && record.address) {
    return {
      address: record.address,
      approvedAt: record.approvedAt || null,
      name: record.name || AGENT_NAME,
      unlocked: false,
      needsReapprove: true,
    }
  }

  const pk = hydrateAgentKey(ownerAddress)
  if (pk && (record?.address || readLegacyPlaintext(owner)?.address)) {
    const address =
      record?.address || readLegacyPlaintext(owner)?.address || new Wallet(pk).address
    return {
      address,
      approvedAt: record?.approvedAt || readLegacyPlaintext(owner)?.approvedAt || null,
      name: record?.name || AGENT_NAME,
      unlocked: true,
      needsReapprove: false,
    }
  }

  return null
}

/** @deprecated use getAgentStatus — kept so older imports don't crash */
export function loadAgentSession(ownerAddress) {
  return getAgentStatus(ownerAddress)
}

export function isAgentUnlocked(ownerAddress) {
  return Boolean(hydrateAgentKey(ownerAddress))
}

/** No-op: passphrase lock removed for testnet UX. */
export function lockAgentSession(_ownerAddress) {
  /* intentionally empty */
}

export function clearAgentSession(ownerAddress) {
  if (!ownerAddress) return
  const owner = normalizeOwner(ownerAddress)
  unlockedPrivateKeys.delete(owner)
  try {
    localStorage.removeItem(agentStorageKey(owner))
    localStorage.removeItem(legacyStorageKey(owner))
  } catch {
    /* ignore */
  }
}

function requireUnlockedPrivateKey(ownerAddress) {
  const pk = hydrateAgentKey(ownerAddress)
  if (!pk) {
    throw new Error('Approve a trading agent first.')
  }
  return pk
}

/** @deprecated passphrase removed — clears encrypted vault so user can re-approve */
export async function migrateAgentEncryption(ownerAddress) {
  clearAgentSession(ownerAddress)
  return null
}

/** @deprecated passphrase removed — agent auto-loads from local storage */
export async function unlockAgentSession(ownerAddress) {
  return getAgentStatus(ownerAddress)
}

/**
 * Generate a trading agent and approve it with MetaMask.
 * Agent cannot withdraw funds. Key is stored locally (testnet / hackathon UX).
 */
export async function approveTradingAgent(ownerAddress) {
  if (!ownerAddress) throw new Error('Connect your wallet first.')

  const owner = normalizeOwner(ownerAddress)
  let agent

  const existingPk = hydrateAgentKey(owner)
  if (existingPk) {
    agent = new Wallet(existingPk)
  } else {
    // Drop unreadable encrypted vault before creating a fresh agent
    const record = readRawRecord(owner)
    if (record?.v === 2) {
      try {
        localStorage.removeItem(agentStorageKey(owner))
      } catch {
        /* ignore */
      }
    }
    agent = Wallet.createRandom()
  }

  const exchange = await getMasterExchange()
  await exchange.approveAgent({
    agentAddress: agent.address,
    agentName: AGENT_NAME,
  })

  persistAgent(ownerAddress, {
    address: agent.address,
    privateKey: agent.privateKey,
    approvedAt: Date.now(),
    name: AGENT_NAME,
  })
  return getAgentStatus(ownerAddress)
}

/** Clearinghouse + open orders for a user. */
export async function fetchPerpsAccount(userAddress) {
  if (!userAddress) {
    return { state: null, openOrders: [], mids: {} }
  }
  const info = getHlInfo()
  const user = String(userAddress).toLowerCase()
  const [state, openOrders, mids] = await Promise.all([
    info.clearinghouseState({ user }),
    info.openOrders({ user }),
    info.allMids(),
  ])
  return { state, openOrders: openOrders || [], mids: mids || {} }
}

export function parsePositions(state) {
  if (!state?.assetPositions?.length) return []
  return state.assetPositions
    .map((row) => row?.position)
    .filter((p) => p && Number(p.szi) !== 0)
}

export function formatUsd(value, digits = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const fixed = abs >= 1000 ? n.toFixed(0) : n.toFixed(digits)
  return `$${Number(fixed).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(digits, 2),
  })}`
}

export function formatSignedUsd(value, digits = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const prefix = n > 0 ? '+' : ''
  return `${prefix}${formatUsd(n, digits)}`
}

function assertOrderOk(result) {
  if (!result || result.status !== 'ok') {
    const msg =
      typeof result?.response === 'string'
        ? result.response
        : 'Order rejected by Hyperliquid'
    throw new Error(msg)
  }
  const statuses = result.response?.data?.statuses || []
  for (const status of statuses) {
    if (status && typeof status === 'object' && status.error) {
      throw new Error(status.error)
    }
  }
  return statuses
}

/** Prefer SDK / API error text when present. */
export function hlErrorMessage(err, fallback = 'Hyperliquid request failed') {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (err.response && typeof err.response === 'string') return err.response
  if (err.message) return err.message
  return fallback
}

/**
 * Estimated liquidation price (Hyperliquid formula).
 * side: `'long'` | `'short'`
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations
 */
export function estimateLiqPrice({
  entryPx,
  size,
  marginUsd,
  leverage,
  isCross,
  accountValue,
  maxLeverage,
  side = 'long',
}) {
  const price = Number(entryPx)
  const maxLev = Number(maxLeverage)
  const lev = Math.max(1, Math.floor(Number(leverage) || 1))
  const margin = Number(marginUsd)
  const sideSign = side === 'short' ? -1 : 1
  if (!(price > 0) || !(maxLev > 0) || !(margin > 0)) return null

  let sz = Number(size)
  if (!(sz > 0)) {
    sz = (margin * lev) / price
  }
  if (!(sz > 0)) return null

  const l = 1 / (2 * maxLev)
  const notional = sz * price
  const mmRequired = notional * l

  let equity
  if (isCross) {
    const av = Number(accountValue)
    equity = Number.isFinite(av) && av >= margin ? av : margin
  } else {
    equity = margin
  }

  const marginAvailable = equity - mmRequired
  if (!(marginAvailable > 0)) return null

  const denom = 1 - l * sideSign
  if (!(denom > 0)) return null

  const liq = price - (sideSign * marginAvailable) / sz / denom
  if (!Number.isFinite(liq) || liq <= 0) return null
  if (sideSign === 1 && liq >= price) return null
  if (sideSign === -1 && liq <= price) return null
  return liq
}

/** @deprecated use estimateLiqPrice */
export function estimateLongLiqPrice(args) {
  return estimateLiqPrice({ ...args, side: 'long' })
}

export function takeProfitPxFromPct(entryPx, tpPct, side = 'long') {
  const entry = Number(entryPx)
  const pct = Number(tpPct)
  if (!(entry > 0) || !(pct > 0)) return null
  return side === 'short' ? entry * (1 - pct / 100) : entry * (1 + pct / 100)
}

export function stopLossPxFromPct(entryPx, slPct, side = 'long') {
  const entry = Number(entryPx)
  const pct = Number(slPct)
  if (!(entry > 0) || !(pct > 0)) return null
  return side === 'short' ? entry * (1 + pct / 100) : entry * (1 - pct / 100)
}

/** Max SL % that stays on the safe side of liquidation. */
export function maxSafeStopLossPct(
  entryPx,
  liqPx,
  side = 'long',
  bufferFrac = SL_LIQ_BUFFER_FRAC,
) {
  const entry = Number(entryPx)
  const liq = Number(liqPx)
  if (!(entry > 0) || !(liq > 0)) return null

  if (side === 'short') {
    if (liq <= entry) return null
    const maxSlPx = liq - entry * bufferFrac
    if (maxSlPx <= entry) return 0
    return ((maxSlPx - entry) / entry) * 100
  }

  if (liq >= entry) return null
  const minSlPx = liq + entry * bufferFrac
  if (minSlPx >= entry) return 0
  return ((entry - minSlPx) / entry) * 100
}

export function isStopLossSafe(
  entryPx,
  slPct,
  liqPx,
  side = 'long',
  bufferFrac = SL_LIQ_BUFFER_FRAC,
) {
  if (liqPx == null || !Number.isFinite(Number(liqPx))) return true
  const slPx = stopLossPxFromPct(entryPx, slPct, side)
  if (slPx == null) return false
  const buf = Number(entryPx) * bufferFrac
  if (side === 'short') return slPx < Number(liqPx) - buf
  return slPx > Number(liqPx) + buf
}

/** @deprecated use isStopLossSafe */
export function isLongStopLossSafe(entryPx, slPct, liqPx, bufferFrac) {
  return isStopLossSafe(entryPx, slPct, liqPx, 'long', bufferFrac)
}

let marketsCache = null
let marketsCacheAt = 0
const MARKETS_TTL_MS = 60_000

/** Load all tradeable perp markets from Hyperliquid meta + mids. */
export async function fetchPerpMarkets({ force = false } = {}) {
  const now = Date.now()
  if (!force && marketsCache && now - marketsCacheAt < MARKETS_TTL_MS) {
    return marketsCache
  }

  const info = getHlInfo()
  const [meta, mids] = await Promise.all([info.meta(), info.allMids()])
  const universe = meta?.universe || []
  const list = []

  for (let i = 0; i < universe.length; i += 1) {
    const asset = universe[i]
    if (!asset?.name || asset.isDelisted) continue
    const mid = Number(mids?.[asset.name])
    list.push({
      coin: asset.name,
      label: `${asset.name}-PERP`,
      maxLeverage: Number(asset.maxLeverage) || 1,
      szDecimals: asset.szDecimals,
      assetId: i,
      mid: Number.isFinite(mid) && mid > 0 ? mid : null,
    })
  }

  list.sort((a, b) => {
    const ai = FEATURED_PERPS.indexOf(a.coin)
    const bi = FEATURED_PERPS.indexOf(b.coin)
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }
    return a.coin.localeCompare(b.coin)
  })

  marketsCache = list
  marketsCacheAt = now
  return list
}

export function filterPerpMarkets(markets, query, { limit = 24 } = {}) {
  const q = String(query || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/i, '')
  const source = Array.isArray(markets) ? markets : []
  if (!q) {
    const featured = FEATURED_PERPS.map((c) =>
      source.find((m) => m.coin === c),
    ).filter(Boolean)
    const rest = source.filter((m) => !FEATURED_PERPS.includes(m.coin))
    return [...featured, ...rest].slice(0, limit)
  }
  const starts = []
  const contains = []
  for (const m of source) {
    const coin = m.coin.toUpperCase()
    if (coin === q || coin.startsWith(q)) starts.push(m)
    else if (coin.includes(q)) contains.push(m)
  }
  return [...starts, ...contains].slice(0, limit)
}

/**
 * One-shot long or short with leverage + take-profit / stop-loss (normalTpsl).
 * Uses the unlocked agent wallet (no MetaMask popups).
 */
export async function placeOrderWithTpsl({
  ownerAddress,
  coin,
  side = 'long',
  marginUsd,
  leverage,
  tpPct,
  slPct,
  isCross = true,
  maxLeverage: maxLeverageHint,
}) {
  const sessionKey = requireUnlockedPrivateKey(ownerAddress)
  const isLong = side !== 'short'

  const coinUpper = String(coin || '').toUpperCase()
  const margin = Number(marginUsd)
  const lev = Math.max(1, Math.floor(Number(leverage) || 1))
  const tp = Number(tpPct)
  const sl = Number(slPct)

  if (!Number.isFinite(margin) || margin <= 0) {
    throw new Error('Enter a margin amount in USDC.')
  }
  if (!Number.isFinite(tp) || tp <= 0) {
    throw new Error('Take-profit % must be greater than 0.')
  }
  if (!Number.isFinite(sl) || sl <= 0) {
    throw new Error('Stop-loss % must be greater than 0.')
  }

  const [converter, mids, accountState, markets] = await Promise.all([
    getConverter(),
    getHlInfo().allMids(),
    ownerAddress
      ? getHlInfo()
          .clearinghouseState({ user: String(ownerAddress).toLowerCase() })
          .catch(() => null)
      : Promise.resolve(null),
    fetchPerpMarkets().catch(() => []),
  ])

  const marketMeta =
    markets.find((m) => m.coin === coinUpper) ||
    PERP_MARKETS.find((m) => m.coin === coinUpper)
  const maxLev = Number(maxLeverageHint) || marketMeta?.maxLeverage || lev
  if (lev > maxLev) {
    throw new Error(`Max leverage for ${coinUpper} is ${maxLev}×.`)
  }

  const assetId = converter.getAssetId(coinUpper)
  const szDecimals = converter.getSzDecimals(coinUpper)
  if (assetId == null || szDecimals == null) {
    throw new Error(`Unknown market: ${coinUpper}`)
  }

  const mid = Number(mids[coinUpper])
  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error(`No mid price for ${coinUpper}`)
  }

  const notional = margin * lev
  const rawSize = notional / mid
  const size = formatSize(rawSize, szDecimals)
  if (Number(size) <= 0) {
    throw new Error('Size too small for this margin — increase margin.')
  }

  const accountValue = accountState?.marginSummary?.accountValue
  const tradeSide = isLong ? 'long' : 'short'
  const estLiq = estimateLiqPrice({
    entryPx: mid,
    size: Number(size),
    marginUsd: margin,
    leverage: lev,
    isCross,
    accountValue,
    maxLeverage: maxLev,
    side: tradeSide,
  })
  if (estLiq != null && !isStopLossSafe(mid, sl, estLiq, tradeSide)) {
    const maxPct = maxSafeStopLossPct(mid, estLiq, tradeSide)
    throw new Error(
      `Stop-loss crosses estimated liquidation (~${estLiq.toFixed(2)}). ` +
        `Use at most ~${maxPct != null ? maxPct.toFixed(1) : '?'}% SL, or lower leverage.`,
    )
  }

  const entryRaw = isLong
    ? mid * (1 + ENTRY_SLIPPAGE)
    : mid * (1 - ENTRY_SLIPPAGE)
  const entryPx = formatPrice(entryRaw, szDecimals)

  const tpRaw = takeProfitPxFromPct(mid, tp, tradeSide)
  const slRaw = stopLossPxFromPct(mid, sl, tradeSide)
  const tpTrigger = formatPrice(tpRaw, szDecimals)
  const slTrigger = formatPrice(slRaw, szDecimals)

  // Market TP/SL limit cushion: sell below trigger, buy above trigger.
  const tpLimit = formatPrice(
    Number(tpTrigger) * (isLong ? 1 - TRIGGER_LIMIT_BUFFER : 1 + TRIGGER_LIMIT_BUFFER),
    szDecimals,
  )
  const slLimit = formatPrice(
    Number(slTrigger) * (isLong ? 1 - TRIGGER_LIMIT_BUFFER : 1 + TRIGGER_LIMIT_BUFFER),
    szDecimals,
  )

  const exchange = getAgentExchange(sessionKey)

  await exchange.updateLeverage({
    asset: assetId,
    isCross,
    leverage: lev,
  })

  const result = await exchange.order({
    orders: [
      {
        a: assetId,
        b: isLong,
        p: entryPx,
        s: size,
        r: false,
        t: { limit: { tif: 'Ioc' } },
      },
      {
        a: assetId,
        b: !isLong,
        p: tpLimit,
        s: size,
        r: true,
        t: {
          trigger: {
            isMarket: true,
            triggerPx: tpTrigger,
            tpsl: 'tp',
          },
        },
      },
      {
        a: assetId,
        b: !isLong,
        p: slLimit,
        s: size,
        r: true,
        t: {
          trigger: {
            isMarket: true,
            triggerPx: slTrigger,
            tpsl: 'sl',
          },
        },
      },
    ],
    grouping: 'normalTpsl',
  })

  const statuses = assertOrderOk(result)
  const entryStatus = statuses[0]
  const filled = entryStatus?.filled
  if (!filled && entryStatus?.resting) {
    throw new Error('Entry did not fill (IOC). Try a larger size or check liquidity.')
  }
  if (!filled && typeof entryStatus === 'string') {
    throw new Error(`Entry status: ${entryStatus}`)
  }

  return {
    coin: coinUpper,
    side: tradeSide,
    size,
    leverage: lev,
    margin,
    mid,
    entryPx: filled?.avgPx || entryPx,
    filledSize: filled?.totalSz || size,
    tpTrigger,
    slTrigger,
    oid: filled?.oid,
    statuses,
  }
}

/** @deprecated use placeOrderWithTpsl */
export async function placeLongWithTpsl(args) {
  return placeOrderWithTpsl({ ...args, side: 'long' })
}

/** Close an entire position with a reduce-only IOC. */
export async function closePositionMarket({ ownerAddress, coin, sizeAbs, isLong }) {
  const sessionKey = requireUnlockedPrivateKey(ownerAddress)

  const coinUpper = String(coin || '').toUpperCase()
  const [converter, mids] = await Promise.all([
    getConverter(),
    getHlInfo().allMids(),
  ])
  const assetId = converter.getAssetId(coinUpper)
  const szDecimals = converter.getSzDecimals(coinUpper)
  if (assetId == null || szDecimals == null) {
    throw new Error(`Unknown market: ${coinUpper}`)
  }

  const mid = Number(mids[coinUpper])
  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error(`No mid price for ${coinUpper}`)
  }

  const size = formatSize(Math.abs(Number(sizeAbs)), szDecimals)
  const isBuy = !isLong // close long = sell
  const px = formatPrice(
    mid * (isBuy ? 1 + ENTRY_SLIPPAGE : 1 - ENTRY_SLIPPAGE),
    szDecimals,
  )

  const exchange = getAgentExchange(sessionKey)
  const result = await exchange.order({
    orders: [
      {
        a: assetId,
        b: isBuy,
        p: px,
        s: size,
        r: true,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
  })
  assertOrderOk(result)
  return result
}
