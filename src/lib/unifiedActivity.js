import { getRuleCategoryId, RULE_CATEGORY } from './ruleCategories'

/**
 * Merge vault on-chain history with paper (spot) session trades for one feed.
 * Does not invent rows — only maps existing confirmed / session data.
 */
export function buildUnifiedActivity({
  vaultItems = [],
  strategyRules = [],
  perpsFills = [],
} = {}) {
  const rows = []

  for (const item of vaultItems) {
    rows.push({
      ...item,
      categoryId: RULE_CATEGORY.SAVE_PAY,
      source: 'vault',
    })
  }

  for (const rule of strategyRules) {
    const trades = rule?.action?.sandboxSession?.trades || []
    for (const trade of trades) {
      const ts = trade.at || trade.timestamp || trade.time || null
      rows.push({
        id: `paper-${rule.id}-${trade.id || trade.at || Math.random()}`,
        type: trade.type === 'buy' ? 'paper_buy' : trade.type === 'tp' || trade.type === 'sl' ? 'paper_exit' : 'paper',
        label: trade.type === 'buy' ? 'Paper buy' : trade.type === 'tp' ? 'Take profit' : trade.type === 'sl' ? 'Stop loss' : 'Paper trade',
        status: 'paper',
        categoryId: RULE_CATEGORY.SPOT,
        source: 'paper',
        timestamp: ts,
        amountFormatted: trade.eth != null ? String(trade.eth) : trade.amountFormatted || '—',
        amountAsset: trade.symbol || 'ETH',
        subtitle: rule.trigger?.label || 'Spot strategy',
        txHash: null,
        ruleId: rule.id,
      })
    }
  }

  for (const fill of perpsFills) {
    rows.push({
      ...fill,
      categoryId: RULE_CATEGORY.PERPS,
      source: 'perps',
      status: fill.status || 'testnet',
    })
  }

  rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  return rows
}

export function activityCategoryId(item) {
  if (item?.categoryId) return item.categoryId
  if (item?.source === 'paper') return RULE_CATEGORY.SPOT
  if (item?.source === 'perps') return RULE_CATEGORY.PERPS
  return getRuleCategoryId({ action: { type: item?.type } })
}
