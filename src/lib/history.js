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

  // DcaExecuted must NOT filter by tokenIn — ETH→token uses tokenIn=address(0)
  const [ins, outs, splits, recurrings, dcas, ethIns] = await Promise.all([
    queryFilterRange(erc20, erc20.filters.Transfer(null, vault), fromBlock, latest),
    queryFilterRange(erc20, erc20.filters.Transfer(vault, null), fromBlock, latest),
    queryFilterRange(account, account.filters.TokenSplit(tokenAddr), fromBlock, latest).catch(
      () => [],
    ),
    queryFilterRange(
      account,
      account.filters.RecurringExecuted(tokenAddr),
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
    })
  }

  for (const ev of ethIns) {
    const amount = ev.args.amount
    if (!amount || amount === 0n) continue
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
    })
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
    })
  }

  for (const ev of splits) {
    const incoming = ev.args.incoming
    const sent = ev.args.sentToSavings
    items.push({
      id: `${ev.transactionHash}-split-${ev.index}`,
      type: 'split',
      label: 'Automation split',
      amount: sent,
      amountFormatted: formatUnits(sent, decimals),
      amountAsset: 'USDC',
      incoming,
      incomingFormatted: formatUnits(incoming, decimals),
      counterparty: savingsAddress,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      caller: ev.args.caller,
    })
  }

  for (const ev of recurrings) {
    const amount = ev.args.amount
    items.push({
      id: `${ev.transactionHash}-recurring-${ev.index}`,
      type: 'recurring',
      label: 'Scheduled send',
      amount,
      amountFormatted: formatUnits(amount, decimals),
      amountAsset: 'USDC',
      counterparty: ev.args.to,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      caller: ev.args.caller,
    })
  }

  const outMetaCache = new Map()
  for (const ev of dcas) {
    const tokenIn = ev.args.tokenIn
    const tokenOut = ev.args.tokenOut
    const amountIn = ev.args.amountIn
    const amountOut = ev.args.amountOut
    const ethIn = isZero(tokenIn)
    const ethOut = isZero(tokenOut)

    let outMeta = { decimals: 18, symbol: 'ETH' }
    if (!ethOut) {
      const key = getAddress(tokenOut)
      if (!outMetaCache.has(key)) {
        outMetaCache.set(key, tokenMeta(provider, key, 18))
      }
      outMeta = await outMetaCache.get(key)
    }

    const inDecimals = ethIn ? 18 : decimals
    const inAsset = ethIn ? 'ETH' : 'USDC'
    const outLabel = ethOut ? 'ETH' : outMeta.symbol

    items.push({
      id: `${ev.transactionHash}-dca-${ev.index}`,
      type: 'dca',
      label: 'DCA swap',
      amount: amountIn,
      amountFormatted: formatUnits(amountIn, inDecimals),
      amountAsset: inAsset,
      amountOut,
      amountOutFormatted: formatUnits(amountOut, ethOut ? 18 : outMeta.decimals),
      amountOutAsset: outLabel,
      tokenOut: ethOut ? null : getAddress(tokenOut),
      ethOut: ethOut ? amountOut : null,
      ethOutFormatted: ethOut ? formatUnits(amountOut, 18) : null,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index,
      caller: ev.args.caller,
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

export function formatHistoryTime(timestamp) {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleString()
}

export function explorerTxUrl(txHash, chainId = 11155111) {
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`
  return `https://etherscan.io/tx/${txHash}`
}

export function historySubtitle(item) {
  if (item.type === 'split') {
    return `Received ${item.incomingFormatted} → sent ${item.amountFormatted} to savings`
  }
  if (item.type === 'recurring') {
    return `Sent ${item.amountFormatted} USDC to ${truncateAddress(item.counterparty, 4)}`
  }
  if (item.type === 'dca') {
    const out = item.amountOutAsset || (item.tokenOut ? truncateAddress(item.tokenOut, 4) : 'ETH')
    return `Swapped ${item.amountFormatted} ${item.amountAsset || 'USDC'} → ${item.amountOutFormatted} ${out}`
  }
  if (item.type === 'deposit') {
    return `From ${truncateAddress(item.counterparty, 4)}`
  }
  if (item.type === 'withdraw') {
    return `To ${truncateAddress(item.counterparty, 4)}`
  }
  return truncateAddress(item.txHash, 6)
}
