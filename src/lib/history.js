import { Contract, JsonRpcProvider, formatUnits, getAddress } from 'ethers'
import {
  ACCOUNT_ABI,
  ERC20_ABI,
  SEPOLIA_USDC,
  getReadProvider,
} from './vault'
import { truncateAddress } from './automations'

/** Public RPC for eth_getLogs — Alchemy free tier only allows 10-block ranges. */
const LOGS_RPC = (
  import.meta.env.VITE_SEPOLIA_LOGS_RPC ||
  'https://ethereum-sepolia-rpc.publicnode.com'
).trim()

const ALCHEMY_LOG_CHUNK = 10
const DEFAULT_MAX_BLOCKS = 10_000
const ZERO = '0x0000000000000000000000000000000000000000'

function getLogsProvider() {
  if (LOGS_RPC) return new JsonRpcProvider(LOGS_RPC)
  return getReadProvider()
}

function isZero(addr) {
  return !addr || getAddress(addr) === ZERO
}

async function queryFilterRange(contract, filter, fromBlock, toBlock) {
  try {
    return await contract.queryFilter(filter, fromBlock, toBlock)
  } catch (err) {
    const msg = String(err?.shortMessage || err?.message || err)
    if (/10 block|block range|eth_getLogs|[-]32600/i.test(msg)) {
      return queryFilterChunked(contract, filter, fromBlock, toBlock, ALCHEMY_LOG_CHUNK)
    }
    throw err
  }
}

async function queryFilterChunked(contract, filter, fromBlock, toBlock, chunkSize) {
  const out = []
  for (let end = toBlock; end >= fromBlock; end -= chunkSize) {
    const start = Math.max(fromBlock, end - chunkSize + 1)
    try {
      const part = await contract.queryFilter(filter, start, end)
      out.push(...part)
    } catch {
      /* skip failed chunk */
    }
  }
  return out
}

async function tokenMeta(provider, tokenAddr, fallbackDecimals = 18) {
  if (isZero(tokenAddr)) return { decimals: 18, symbol: 'ETH' }
  try {
    const erc20 = new Contract(tokenAddr, ERC20_ABI, provider)
    const [decimals, symbol] = await Promise.all([
      erc20.decimals().catch(() => fallbackDecimals),
      erc20.symbol().catch(() => null),
    ])
    return {
      decimals: Number(decimals),
      symbol: symbol || truncateAddress(tokenAddr, 4),
    }
  } catch {
    return { decimals: fallbackDecimals, symbol: truncateAddress(tokenAddr, 4) }
  }
}

/**
 * Fetch recent vault activity: deposits, withdrawals, splits, recurring, DCA.
 * Only includes confirmed on-chain logs — never fabricated rows.
 */
export async function fetchVaultHistory(
  vaultAddress,
  {
    token = SEPOLIA_USDC,
    maxBlocks = DEFAULT_MAX_BLOCKS,
    savingsAddress = null,
  } = {},
) {
  if (!vaultAddress) return []

  const provider = getLogsProvider()
  const latest = await provider.getBlockNumber()
  const fromBlock = Math.max(0, latest - maxBlocks)
  const vault = getAddress(vaultAddress)
  const tokenAddr = getAddress(token)

  const erc20 = new Contract(tokenAddr, ERC20_ABI, provider)
  const account = new Contract(vault, ACCOUNT_ABI, provider)

  const decimals = Number(await erc20.decimals().catch(() => 6))

  // RecurringExecuted / DcaExecuted: do not filter by USDC only
  const [ins, outs, splits, recurrings, dcas, ethIns] = await Promise.all([
    queryFilterRange(erc20, erc20.filters.Transfer(null, vault), fromBlock, latest),
    queryFilterRange(erc20, erc20.filters.Transfer(vault, null), fromBlock, latest),
    queryFilterRange(account, account.filters.TokenSplit(), fromBlock, latest).catch(
      () => [],
    ),
    queryFilterRange(
      account,
      account.filters.RecurringExecuted(),
      fromBlock,
      latest,
    ).catch(() => []),
    queryFilterRange(account, account.filters.DcaExecuted(), fromBlock, latest).catch(() => []),
    queryFilterRange(account, account.filters.EthReceived(), fromBlock, latest).catch(() => []),
  ])

  const skipOutTx = new Set([
    ...splits.map((e) => e.transactionHash),
    ...recurrings.map((e) => e.transactionHash),
    ...dcas.map((e) => e.transactionHash),
  ])

  const metaCache = new Map()
  const metaOf = async (addr, fallbackDecimals = 18) => {
    if (isZero(addr)) return { decimals: 18, symbol: 'ETH' }
    const key = getAddress(addr)
    if (!metaCache.has(key)) {
      metaCache.set(key, tokenMeta(provider, key, fallbackDecimals))
    }
    return metaCache.get(key)
  }

  const items = []

  for (const ev of ins) {
    items.push({
      id: `${ev.transactionHash}-in-${ev.index}`,
      type: 'deposit',
      label: 'Deposit',
      amount: ev.args.value,
      amountFormatted: formatUnits(ev.args.value, decimals),
      amountAsset: 'USDC',
      counterparty: ev.args.from,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      status: 'confirmed',
    })
  }

  for (const ev of ethIns) {
    const amount = ev.args.amount
    if (!amount || amount === 0n) continue
    const sent = ev.args.sentToSavings
    items.push({
      id: `${ev.transactionHash}-ethin-${ev.index}`,
      type: 'deposit',
      label: 'ETH deposit',
      amount,
      amountFormatted: formatUnits(amount, 18),
      amountAsset: 'ETH',
      counterparty: ev.args.from,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      status: 'confirmed',
      splitNote:
        sent && sent > 0n
          ? `${formatUnits(sent, 18)} ETH forwarded to savings`
          : null,
    })
    if (sent && sent > 0n) {
      items.push({
        id: `${ev.transactionHash}-ethsplit-${ev.index}`,
        type: 'split',
        label: 'ETH income split',
        amount: sent,
        amountFormatted: formatUnits(sent, 18),
        amountAsset: 'ETH',
        incoming: amount,
        incomingFormatted: formatUnits(amount, 18),
        counterparty: savingsAddress,
        txHash: ev.transactionHash,
        blockNumber: ev.blockNumber,
        logIndex: ev.index + 0.1,
        status: 'confirmed',
      })
    }
  }

  for (const ev of outs) {
    if (skipOutTx.has(ev.transactionHash)) continue
    items.push({
      id: `${ev.transactionHash}-out-${ev.index}`,
      type: 'withdraw',
      label: 'Withdraw',
      amount: ev.args.value,
      amountFormatted: formatUnits(ev.args.value, decimals),
      amountAsset: 'USDC',
      counterparty: ev.args.to,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      status: 'confirmed',
    })
  }

  for (const ev of splits) {
    const splitToken = ev.args.token
    const incoming = ev.args.incoming
    const sent = ev.args.sentToSavings
    const ethSplit = isZero(splitToken)
    const meta = ethSplit
      ? { decimals: 18, symbol: 'ETH' }
      : sameAddr(splitToken, tokenAddr)
        ? { decimals, symbol: 'USDC' }
        : await metaOf(splitToken, 6)
    items.push({
      id: `${ev.transactionHash}-split-${ev.index}`,
      type: 'split',
      label: ethSplit ? 'ETH income split' : 'Automation split',
      amount: sent,
      amountFormatted: formatUnits(sent, meta.decimals),
      amountAsset: meta.symbol,
      incoming,
      incomingFormatted: formatUnits(incoming, meta.decimals),
      counterparty: savingsAddress,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      caller: ev.args.caller,
      status: 'confirmed',
    })
  }

  for (const ev of recurrings) {
    const amount = ev.args.amount
    const recToken = ev.args.token
    const ethRec = isZero(recToken)
    const meta = ethRec
      ? { decimals: 18, symbol: 'ETH' }
      : sameAddr(recToken, tokenAddr)
        ? { decimals, symbol: 'USDC' }
        : await metaOf(recToken, 6)
    items.push({
      id: `${ev.transactionHash}-recurring-${ev.index}`,
      type: 'recurring',
      label: 'Scheduled send',
      amount,
      amountFormatted: formatUnits(amount, meta.decimals),
      amountAsset: meta.symbol,
      counterparty: ev.args.to,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      caller: ev.args.caller,
      ruleId:
        ev.args.ruleId != null ? Number(ev.args.ruleId) : undefined,
      status: 'confirmed',
    })
  }

  for (const ev of dcas) {
    const tokenIn = ev.args.tokenIn
    const tokenOut = ev.args.tokenOut
    const amountIn = ev.args.amountIn
    const amountOut = ev.args.amountOut
    const ethIn = isZero(tokenIn)
    const ethOut = isZero(tokenOut)

    const inMeta = ethIn
      ? { decimals: 18, symbol: 'ETH' }
      : sameAddr(tokenIn, tokenAddr)
        ? { decimals, symbol: 'USDC' }
        : await metaOf(tokenIn, 6)

    const outMeta = ethOut
      ? { decimals: 18, symbol: 'ETH' }
      : await metaOf(tokenOut, 18)

    items.push({
      id: `${ev.transactionHash}-dca-${ev.index}`,
      type: 'dca',
      label: 'DCA swap',
      amount: amountIn,
      amountFormatted: formatUnits(amountIn, inMeta.decimals),
      amountAsset: inMeta.symbol,
      amountOut,
      amountOutFormatted: formatUnits(amountOut, outMeta.decimals),
      amountOutAsset: outMeta.symbol,
      tokenOut: ethOut ? null : getAddress(tokenOut),
      ethOut: ethOut ? amountOut : null,
      ethOutFormatted: ethOut ? formatUnits(amountOut, 18) : null,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      caller: ev.args.caller,
      ruleId:
        ev.args.ruleId != null ? Number(ev.args.ruleId) : undefined,
      status: 'confirmed',
    })
  }

  items.sort((a, b) => {
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber
    return b.logIndex - a.logIndex
  })

  const blockCache = new Map()
  await Promise.all(
    items.slice(0, 40).map(async (item) => {
      if (!blockCache.has(item.blockNumber)) {
        blockCache.set(
          item.blockNumber,
          provider.getBlock(item.blockNumber).then((b) => b?.timestamp ?? null),
        )
      }
      item.timestamp = await blockCache.get(item.blockNumber)
    }),
  )

  return items
}

function sameAddr(a, b) {
  try {
    return getAddress(a) === getAddress(b)
  } catch {
    return false
  }
}

export function formatHistoryTime(timestamp) {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleString()
}

/** Compact relative time for activity rows (e.g. "3m ago"). */
export function formatHistoryRelative(timestamp) {
  if (!timestamp) return '—'
  const ms = Number(timestamp) * 1000
  if (!Number.isFinite(ms)) return '—'
  const delta = Date.now() - ms
  if (delta < 0) return 'just now'
  const sec = Math.floor(delta / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function explorerTxUrl(txHash, chainId = 11155111) {
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`
  return `https://etherscan.io/tx/${txHash}`
}

export function historySubtitle(item) {
  if (item.type === 'split') {
    return `Received ${item.incomingFormatted} ${item.amountAsset || ''} → sent ${item.amountFormatted} to savings`.replace(
      /\s+/g,
      ' ',
    ).trim()
  }
  if (item.type === 'recurring') {
    return `Scheduled send to ${truncateAddress(item.counterparty, 4)}`
  }
  if (item.type === 'dca') {
    const out = item.amountOutAsset || (item.tokenOut ? truncateAddress(item.tokenOut, 4) : 'ETH')
    return `${item.amountFormatted} ${item.amountAsset || 'USDC'} swapped for ${item.amountOutFormatted} ${out}`
  }
  if (item.type === 'deposit') {
    const base = `From ${truncateAddress(item.counterparty, 4)}`
    return item.splitNote ? `${base} · ${item.splitNote}` : base
  }
  if (item.type === 'withdraw') {
    return `To ${truncateAddress(item.counterparty, 4)}`
  }
  return truncateAddress(item.txHash, 6)
}
