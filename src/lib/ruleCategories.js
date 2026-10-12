/**
 * Product-facing rule categories. UI/copy only — does not change stored schemas.
 */

export const RULE_CATEGORY = {
  SAVE_PAY: 'save-pay',
  SPOT: 'spot',
  PERPS: 'perps',
}

export const RULE_CATEGORIES = [
  {
    id: RULE_CATEGORY.SAVE_PAY,
    label: 'My Automations',
    shortLabel: 'Automations',
    blurb: 'Splits, scheduled sends, and DCA from your vault.',
    section: 'save-pay',
    newPath: '/app/new?type=save-pay',
    triggerSummary: 'Deposit, schedule, or balance',
    actionSummary: 'Split, send, or DCA',
    envLabel: 'On-chain (Sepolia)',
    envTone: 'is-onchain',
    deployLabel: 'Deploy to vault (Sepolia)',
  },
  {
    id: RULE_CATEGORY.SPOT,
    label: 'Spot strategies',
    shortLabel: 'Spot',
    blurb: 'Screen tokens and paper-trade with live prices before enabling a scan.',
    section: 'spot',
    newPath: '/app/new?type=spot',
    triggerSummary: 'Token matches filters',
    actionSummary: 'Buy, TP/SL',
    envLabel: 'Paper',
    envTone: 'is-paper',
    deployLabel: 'Run live scan (paper)',
  },
  {
    id: RULE_CATEGORY.PERPS,
    label: 'Perps strategies',
    shortLabel: 'Perps',
    blurb: 'Backtest a strategy, then deploy it on Hyperliquid testnet.',
    section: 'perps',
    newPath: '/app/new?type=perps',
    triggerSummary: 'MA/RSI signal (backtest)',
    actionSummary: 'Deploy long/short on Hyperliquid testnet',
    envLabel: 'Testnet',
    envTone: 'is-testnet',
    deployLabel: 'Deploy on Hyperliquid testnet',
  },
]

export function getCategoryMeta(id) {
  return RULE_CATEGORIES.find((c) => c.id === id) || RULE_CATEGORIES[0]
}

export function isSpotStrategyRule(rule) {
  return (
    rule?.action?.type === 'trading_strategy' || rule?.trigger?.type === 'screener'
  )
}

export function getRuleCategoryId(rule) {
  if (isSpotStrategyRule(rule)) return RULE_CATEGORY.SPOT
  return RULE_CATEGORY.SAVE_PAY
}

/**
 * Environment badge for a saved rule (honest labels).
 */
export function getRuleEnv(rule) {
  if (isSpotStrategyRule(rule)) {
    return {
      id: 'paper',
      label: 'Paper',
      tone: 'is-paper',
    }
  }
  if (rule?.onchain === false) {
    return {
      id: 'draft',
      label: 'Draft',
      tone: 'is-paper',
    }
  }
  return {
    id: 'onchain',
    label: 'On-chain (Sepolia)',
    tone: 'is-onchain',
  }
}

/**
 * Status for overview list: Active / Paper / Testnet / Paused (+ needs attention).
 */
export function getUnifiedRuleStatus(rule, balances, onchainTiming) {
  if (isSpotStrategyRule(rule)) {
    if (!rule.enabled) {
      return { id: 'paused', label: 'Paused', tone: '' }
    }
    return { id: 'paper', label: 'Paper', tone: 'is-paper' }
  }

  if (!rule.enabled) {
    return { id: 'paused', label: 'Paused', tone: '' }
  }

  // Lazy import avoided — mirror funding check lightly via balances consumer.
  return {
    id: 'active',
    label: 'Active',
    tone: 'is-on',
    balances,
    onchainTiming,
  }
}

export const RULE_STEPS = [
  { n: 1, id: 'trigger', label: 'Trigger' },
  { n: 2, id: 'action', label: 'Action' },
  { n: 3, id: 'test', label: 'Test' },
  { n: 4, id: 'deploy', label: 'Deploy' },
]
