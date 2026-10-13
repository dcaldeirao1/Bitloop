import { getAddress } from 'ethers'
import { automationKind } from './automations'

function safeAddr(value) {
  try {
    if (value == null || value === '') return null
    return getAddress(String(value))
  } catch {
    return null
  }
}

function ruleAmountHuman(action) {
  if (action == null) return null
  const raw = action.amountHuman ?? action.amount
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function amountMatchesItem(item, action) {
  const target = ruleAmountHuman(action)
  if (target == null) return true
  const got = Number(item.amountFormatted)
  if (!Number.isFinite(got)) return true
  const tol = Math.max(0.0001, Math.abs(target) * 0.002)
  return Math.abs(got - target) <= tol
}

function isDcaActionType(type) {
  return (
    type === 'dca_swap' ||
    type === 'swap_usdc_eth' ||
    type === 'buy_eth' ||
    type === 'buy_token' ||
    type === 'sell_eth_usdc' ||
    type === 'sell_token_eth'
  )
}

function dcaItemMatchesRule(item, action) {
  const type = action.type
  if (type === 'buy_token' || action.outMode === 'token') {
    const want = safeAddr(action.tokenOut)
    const out = item.tokenOut ? safeAddr(item.tokenOut) : null
    if (want && out && out !== want) return false
    if (want && !out && item.amountOutAsset !== 'ETH') return false
  } else if (type === 'buy_eth' || type === 'dca_swap' || type === 'swap_usdc_eth') {
    if (item.amountOutAsset && item.amountOutAsset !== 'ETH') return false
    if (item.amountAsset && item.amountAsset !== 'USDC' && type !== 'sell_eth_usdc') {
      /* allow USDC in for standard DCA */
    }
    if (
      (type === 'buy_eth' || type === 'dca_swap' || type === 'swap_usdc_eth') &&
      item.amountAsset &&
      item.amountAsset !== 'USDC'
    ) {
      return false
    }
  } else if (type === 'sell_eth_usdc' || type === 'sell_token_eth') {
    if (item.amountAsset !== 'ETH') return false
    if (item.amountOutAsset && item.amountOutAsset !== 'USDC') return false
  }
  return amountMatchesItem(item, action)
}

/**
 * Keep only on-chain history rows that belong to this automation rule
 * (same vault may run multiple rules with different amounts / recipients).
 */
export function filterHistoryForRule(rule, items) {
  if (!rule || !Array.isArray(items) || !items.length) return []

  const action = rule.action || {}
  const trigger = rule.trigger || {}
  const type = action.type
  const kind = automationKind(action, trigger)

  if (kind === 'dca' || isDcaActionType(type)) {
    return items.filter((item) => {
      if (item.type !== 'dca') return false
      if (
        action.ruleId != null &&
        item.ruleId != null &&
        Number(item.ruleId) === Number(action.ruleId)
      ) {
        return true
      }
      return dcaItemMatchesRule(item, action)
    })
  }

  if (kind === 'recurring') {
    const to = safeAddr(
      action.to || action.recipient || action.depositAddress || action.destination,
    )
    return items.filter((item) => {
      if (item.type !== 'recurring') return false
      if (
        action.ruleId != null &&
        item.ruleId != null &&
        Number(item.ruleId) === Number(action.ruleId)
      ) {
        return true
      }
      const cp = safeAddr(item.counterparty)
      if (to && cp && cp !== to) return false
      return amountMatchesItem(item, action)
    })
  }

  if (kind === 'split') {
    const savings = safeAddr(action.to || trigger.savings || trigger.savingsAddress)
    return items.filter((item) => {
      if (item.type === 'split') {
        const cp = safeAddr(item.counterparty)
        if (savings && cp && cp !== savings) return false
        return true
      }
      if (item.type === 'deposit') {
        if (trigger.type === 'receive_eth') return item.amountAsset === 'ETH'
        if (trigger.type === 'receive_usdc') return item.amountAsset === 'USDC'
      }
      return false
    })
  }

  return []
}
