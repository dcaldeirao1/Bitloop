import { truncateAddress } from '../lib/automations'
import { formatUsdCompact } from '../lib/dexscreener'
import { SEPOLIA_USDC } from '../lib/vault'

const USDC_ADDR = String(SEPOLIA_USDC || '').toLowerCase()

function neededAmount(action = {}) {
  const human = Number(action.amountHuman)
  if (Number.isFinite(human) && human > 0) return human
  // Raw on-chain units without amountHuman — don't guess
  return null
}

function sameToken(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase()
}

/**
 * Whether an enabled automation cannot run because the vault lacks balance.
 * Deposit-triggered splits are never "starved" (they wait for inflow).
 */
export function getAutomationFunding(rule, balances) {
  if (!rule?.enabled || !balances) {
    return { starved: false, warning: null, asset: null, need: null }
  }

  const action = rule.action || {}
  const type = action.type
  const trigger = rule.trigger?.type

  if (
    type === 'trading_strategy' ||
    trigger === 'screener' ||
    type === 'send_percent' ||
    type === 'split' ||
    trigger === 'receive_usdc' ||
    trigger === 'receive_eth'
  ) {
    return { starved: false, warning: null, asset: null, need: null }
  }

  const need = neededAmount(action)
  if (need == null) return { starved: false, warning: null, asset: null, need: null }

  const usdc = Number(balances.vaultUsdcFormatted)
  const eth = Number(balances.vaultEthFormatted)
  const warn = (asset) => ({
    starved: true,
    warning: `Vault needs ≥ ${need} ${asset} for the next run`,
    asset,
    need,
  })

  if (type === 'send_amount' || type === 'buy_eth') {
    if (Number.isFinite(usdc) && usdc + 1e-12 < need) return warn('USDC')
    return { starved: false, warning: null, asset: 'USDC', need }
  }

  if (type === 'bridge_relay') {
    const originSym = String(action.originSymbol || action.originToken || '').toUpperCase()
    const originCur = String(action.originCurrency || action.token || '').toLowerCase()
    if (originSym === 'USDC' || sameToken(originCur, USDC_ADDR)) {
      if (Number.isFinite(usdc) && usdc + 1e-12 < need) return warn('USDC')
      return { starved: false, warning: null, asset: 'USDC', need }
    }
    return {
      starved: false,
      warning: `Balance for ${originSym || 'token'} not shown — fund the vault before the next run`,
      asset: originSym || null,
      need,
    }
  }

  if (type === 'dca_swap' || type === 'swap_usdc_eth') {
    const spendsEth = action.outMode === 'token' || Boolean(action.tokenOut)
    if (spendsEth) {
      if (Number.isFinite(eth) && eth + 1e-12 < need) return warn('ETH')
      return { starved: false, warning: null, asset: 'ETH', need }
    }
    if (Number.isFinite(usdc) && usdc + 1e-12 < need) return warn('USDC')
    return { starved: false, warning: null, asset: 'USDC', need }
  }

  if (type === 'buy_token' || type === 'sell_eth_usdc') {
    if (Number.isFinite(eth) && eth + 1e-12 < need) return warn('ETH')
    return { starved: false, warning: null, asset: 'ETH', need }
  }

  if (type === 'sell_token_eth') {
    if (sameToken(action.tokenIn, USDC_ADDR)) {
      if (Number.isFinite(usdc) && usdc + 1e-12 < need) return warn('USDC')
      return { starved: false, warning: null, asset: 'USDC', need }
    }
    const sym = action.tokenSymbol || 'token'
    return {
      starved: false,
      warning: `Balance for ${sym} not shown — fund the vault before the next run`,
      asset: sym,
      need,
    }
  }

  if (type === 'send_token') {
    if (sameToken(action.token, USDC_ADDR)) {
      if (Number.isFinite(usdc) && usdc + 1e-12 < need) return warn('USDC')
      return { starved: false, warning: null, asset: 'USDC', need }
    }
    const sym = action.tokenSymbol || 'token'
    return {
      starved: false,
      warning: `Balance for ${sym} not shown — fund the vault before the next run`,
      asset: sym,
      need,
    }
  }

  return { starved: false, warning: null, asset: null, need: null }
}

/**
 * Reserved = max next-run need among enabled scheduled automations (USDC / ETH).
 * Splits are deposit-triggered and do not reserve idle balance.
 */
export function getReservedFunds(rules, balances) {
  let usdc = 0
  let eth = 0
  for (const rule of rules || []) {
    if (!rule?.enabled) continue
    const funding = getAutomationFunding(rule, balances || { vaultUsdcFormatted: '0', vaultEthFormatted: '0' })
    const need = funding.need
    if (need == null || !Number.isFinite(need)) continue
    if (funding.asset === 'USDC') usdc = Math.max(usdc, need)
    if (funding.asset === 'ETH') eth = Math.max(eth, need)
  }
  const vaultUsdc = Number(balances?.vaultUsdcFormatted)
  const vaultEth = Number(balances?.vaultEthFormatted)
  return {
    reservedUsdc: usdc,
    reservedEth: eth,
    availableUsdc: Number.isFinite(vaultUsdc) ? Math.max(0, vaultUsdc - usdc) : null,
    availableEth: Number.isFinite(vaultEth) ? Math.max(0, vaultEth - eth) : null,
  }
}

/**
 * Product status: active | paused | needs_attention | due
 */
export function getAutomationStatus(rule, balances, onchainTiming = null) {
  if (!rule?.enabled) {
    return { id: 'paused', label: 'Paused', tone: '' }
  }
  const funding = getAutomationFunding(rule, balances)
  if (funding.starved) {
    return { id: 'needs_attention', label: 'Needs attention', tone: 'is-warn' }
  }
  const schedule = getAutomationSchedule(rule, onchainTiming, funding)
  if (schedule.nextLabel === 'Due now') {
    return { id: 'due', label: 'Due', tone: 'is-due' }
  }
  return { id: 'active', label: 'Active', tone: 'is-on' }
}

/**
 * Short product-facing title for an automation node.
 */
export function getAutomationTitle(rule) {
  const type = rule?.action?.type
  const trigger = rule?.trigger?.type
  if (type === 'trading_strategy' || trigger === 'screener') return 'Trenches'
  if (type === 'sell_eth_usdc') return 'Sell ETH'
  if (type === 'sell_token_eth') return 'Sell token'
  if (type === 'buy_token') return 'Buy token'
  if (type === 'buy_eth') return 'Buy ETH'
  if (type === 'dca_swap' || type === 'swap_usdc_eth') {
    if (trigger === 'eth_price_below') return 'Buy the dip'
    if (trigger === 'eth_price_above') return 'Buy the rip'
    if (rule?.action?.outMode === 'token' || rule?.action?.tokenOut) return 'Buy token'
    return 'Buy ETH'
  }
  if (type === 'send_token') return 'Token transfer'
  if (type === 'bridge_relay') return 'Relay bridge'
  if (type === 'send_amount') {
    if (trigger === 'usdc_above') return 'Balance payout'
    if (trigger === 'time_window') return 'Timed transfer'
    if (trigger === 'eth_price_below' || trigger === 'eth_price_above') {
      return 'Price payout'
    }
    return 'Scheduled Transfer'
  }
  if (trigger === 'every_interval') return 'Scheduled Transfer'
  if (trigger === 'receive_eth') return 'ETH Income Split'
  if (type === 'send_percent' || type === 'split' || trigger === 'receive_usdc') {
    return 'Income Split'
  }
  return 'Automation'
}

/**
 * Break an automation into Trigger / Action block labels for the flow diagram.
 */
export function getAutomationBlocks(rule) {
  const trigger = rule.trigger || {}
  const action = rule.action || {}
  const type = action.type

  if (type === 'trading_strategy' || trigger.type === 'screener') {
    const vol = Number(trigger.minVolume24h || 0)
    const volLabel =
      vol >= 1_000_000
        ? `>${(vol / 1_000_000).toFixed(vol % 1_000_000 === 0 ? 0 : 1)}M vol`
        : vol >= 1_000
          ? `>${(vol / 1_000).toFixed(0)}K vol`
          : `>${vol} vol`
    const ifLines = [
      trigger.pairSource === 'new' ? 'New pairs' : 'Top volume',
      !trigger.chainId || trigger.chainId === 'all'
        ? 'All chains'
        : trigger.chainId,
      volLabel,
      `>${trigger.minHolders || 0} holders`,
    ]
    if (trigger.minLiquidityUsd) {
      ifLines.push(`>${formatUsdCompact(trigger.minLiquidityUsd)} liq`)
    }

    const thenBlocks = [
      {
        title: 'Buy',
        lines: [`${action.buyEth || '?'} ETH`],
      },
      ...((action.takeProfits || []).map((tp, i) => ({
        title: `TP${i + 1}`,
        lines: [`${tp.multiple}×`, `sell ${tp.sellPercent}%`],
      })) || []),
      {
        title: 'Stop',
        lines: [`−${action.stopLossPercent || '?'}%`],
      },
    ]

    return {
      kind: 'strategy',
      ifBlock: { title: 'Scan', lines: ifLines },
      thenBlocks,
    }
  }

  if (
    type === 'dca_swap' ||
    type === 'swap_usdc_eth' ||
    type === 'buy_eth' ||
    type === 'buy_token' ||
    type === 'sell_eth_usdc' ||
    type === 'sell_token_eth'
  ) {
    const every =
      trigger.label ||
      (trigger.intervalValue && trigger.intervalUnit
        ? `every ${trigger.intervalValue} ${trigger.intervalUnit}`
        : 'on schedule')
    const ifLines = [every]
    if (trigger.type === 'eth_price_below') ifLines.unshift(`ETH ≤ $${trigger.priceUsd}`)
    if (trigger.type === 'eth_price_above') ifLines.unshift(`ETH ≥ $${trigger.priceUsd}`)
    if (trigger.type === 'usdc_above') ifLines.unshift(`USDC ≥ ${trigger.amount}`)
    if (trigger.type === 'time_window') {
      const hour = trigger.hour ?? trigger.startHour ?? 0
      const minute = trigger.minute ?? 0
      const hh = String(hour).padStart(2, '0')
      const mm = String(minute).padStart(2, '0')
      ifLines.unshift(`At ${hh}:${mm} UTC`)
    }

    let swapLines
    if (type === 'sell_eth_usdc') {
      swapLines = [`${action.amountHuman || '?'} ETH`, '→ USDC']
    } else if (type === 'sell_token_eth') {
      const sym = action.tokenSymbol || truncateAddress(action.tokenIn, 4)
      swapLines = [`${action.amountHuman || '?'} ${sym}`, '→ ETH']
    } else if (type === 'buy_token' || action.outMode === 'token' || action.tokenOut) {
      swapLines = [
        `${action.amountHuman || '?'} ETH`,
        `→ ${truncateAddress(action.tokenOut, 4)}`,
      ]
    } else {
      swapLines = [`${action.amountHuman || '?'} USDC`, '→ ETH']
    }

    return {
      kind: 'dca',
      ifBlock: { title: 'When', lines: ifLines },
      thenBlocks: [{ title: 'Swap', lines: swapLines }],
    }
  }

  if (
    type === 'send_amount' ||
    type === 'send_token' ||
    type === 'bridge_relay' ||
    trigger.type === 'every_interval' ||
    trigger.type === 'usdc_above' ||
    trigger.type === 'time_window'
  ) {
    const every =
      trigger.label ||
      (trigger.intervalValue && trigger.intervalUnit
        ? `every ${trigger.intervalValue} ${trigger.intervalUnit}`
        : 'on schedule')
    const ifLines = [every]
    if (trigger.type === 'usdc_above') ifLines.unshift(`USDC ≥ ${trigger.amount}`)
    if (trigger.type === 'time_window') {
      const hour = trigger.hour ?? trigger.startHour ?? 0
      const minute = trigger.minute ?? 0
      const hh = String(hour).padStart(2, '0')
      const mm = String(minute).padStart(2, '0')
      ifLines.unshift(`At ${hh}:${mm} UTC`)
    }
    if (trigger.type === 'eth_price_below') ifLines.unshift(`ETH ≤ $${trigger.priceUsd}`)
    if (trigger.type === 'eth_price_above') ifLines.unshift(`ETH ≥ $${trigger.priceUsd}`)

    if (type === 'bridge_relay') {
      const fromSym = action.originSymbol || action.originToken || 'TOKEN'
      const toSym = action.destinationSymbol || action.destinationToken || 'TOKEN'
      return {
        kind: 'recurring',
        ifBlock: { title: 'When', lines: ifLines },
        thenBlocks: [
          {
            title: 'Bridge',
            lines: [
              `${action.amountHuman || '?'} ${fromSym}`,
              `→ ${toSym}`,
              `to ${truncateAddress(action.recipient || action.to, 4)}`,
            ],
          },
        ],
      }
    }

    const asset =
      type === 'send_token'
        ? action.tokenSymbol || truncateAddress(action.token, 4)
        : 'USDC'
    return {
      kind: 'recurring',
      ifBlock: { title: 'When', lines: ifLines },
      thenBlocks: [
        {
          title: 'Send',
          lines: [
            `${action.amountHuman || '?'} ${asset}`,
            `to ${truncateAddress(action.to, 4)}`,
          ],
        },
      ],
    }
  }

  const isEth = trigger.type === 'receive_eth' || action.asset === 'ETH'
  return {
    kind: 'split',
    ifBlock: {
      title: 'Deposit',
      lines: [isEth ? 'vault receives ETH' : 'vault receives USDC'],
    },
    thenBlocks: [
      {
        title: 'Split',
        lines: [
          `${action.percent ?? '?'}%`,
          `to ${truncateAddress(action.to, 4)}`,
        ],
      },
    ],
  }
}

function formatTs(seconds) {
  const n = Number(seconds)
  if (!n || !Number.isFinite(n)) return null
  const d = new Date(n * 1000)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function nextFromLast(lastSec, intervalSec, enabled) {
  if (!enabled) return 'Paused'
  const interval = Number(intervalSec)
  if (!interval || interval <= 0) return 'On schedule'
  const last = Number(lastSec) || 0
  const next = last > 0 ? last + interval : Math.floor(Date.now() / 1000)
  const now = Math.floor(Date.now() / 1000)
  if (next <= now) return 'Due now'
  return formatTs(next) || 'Soon'
}

/**
 * Human labels for last / next execution.
 * `onchainTiming` comes from getVaultScheduleState when available.
 */
export function getAutomationSchedule(rule, onchainTiming = null, funding = null) {
  const type = rule?.action?.type
  const trigger = rule?.trigger || {}
  const enabled = Boolean(rule?.enabled)
  const starved = Boolean(funding?.starved)

  if (type === 'trading_strategy' || trigger.type === 'screener') {
    const lastScan = rule?.action?.lastScanAt
    return {
      lastLabel: lastScan
        ? formatTs(Math.floor(new Date(lastScan).getTime() / 1000)) || 'Recently'
        : 'Never',
      nextLabel: !enabled
        ? 'Paused'
        : starved
          ? 'Needs funds'
          : 'On next scan',
    }
  }

  if (
    type === 'split' ||
    type === 'send_percent' ||
    trigger.type === 'receive_usdc' ||
    trigger.type === 'receive_eth' ||
    (!type && rule?.percent != null)
  ) {
    const eth = trigger.type === 'receive_eth' || rule?.action?.asset === 'ETH'
    return {
      lastLabel: 'On deposit',
      nextLabel: !enabled
        ? 'Paused'
        : eth
          ? 'When ETH arrives'
          : 'When USDC arrives',
    }
  }

  const isDca =
    type === 'dca_swap' ||
    type === 'swap_usdc_eth' ||
    type === 'buy_eth' ||
    type === 'buy_token' ||
    type === 'sell_eth_usdc' ||
    type === 'sell_token_eth'
  const isRecurring =
    type === 'send_amount' ||
    type === 'send_token' ||
    type === 'bridge_relay' ||
    trigger.type === 'every_interval' ||
    trigger.type === 'usdc_above' ||
    trigger.type === 'time_window' ||
    trigger.type === 'eth_price_below' ||
    trigger.type === 'eth_price_above'

  if (isDca) {
    const last = onchainTiming?.dcaLastExecuted
    const interval = onchainTiming?.dcaInterval || trigger.interval
    return {
      lastLabel: last ? formatTs(last) || 'Never' : 'Never',
      nextLabel: starved
        ? 'Needs funds'
        : nextFromLast(last, interval, enabled),
    }
  }

  if (isRecurring) {
    const last = onchainTiming?.recurringLastExecuted
    const interval = onchainTiming?.recurringInterval || trigger.interval
    return {
      lastLabel: last ? formatTs(last) || 'Never' : 'Never',
      nextLabel: starved
        ? 'Needs funds'
        : nextFromLast(last, interval, enabled),
    }
  }

  return {
    lastLabel: '—',
    nextLabel: !enabled ? 'Paused' : starved ? 'Needs funds' : '—',
  }
}
