import { supabase } from './supabase'

const VAULT_KEY = 'programmable-money-vaults'
const LEGACY_AUTOMATIONS_KEY = 'programmable-money-automations'
const FACTORY = (
  import.meta.env.VITE_ACCOUNT_FACTORY_ADDRESS || ''
).trim().toLowerCase()

function normalizeWallet(wallet) {
  return String(wallet || '').trim().toLowerCase()
}

function vaultCacheKey(owner) {
  return `${FACTORY}:${normalizeWallet(owner)}`
}

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    enabled: row.enabled,
    vaultAddress: row.vault_address,
    trigger: row.trigger_config || {},
    action: row.action_config || {},
    onchain: row.onchain,
    walletAddress: row.wallet_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Clear old shared localStorage automations (were visible to every wallet). */
export function clearLegacyLocalAutomations() {
  try {
    localStorage.removeItem(LEGACY_AUTOMATIONS_KEY)
  } catch {
    /* ignore */
  }
}

export async function listAutomations(walletAddress) {
  const wallet = normalizeWallet(walletAddress)
  if (!wallet) return []

  clearLegacyLocalAutomations()

  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('wallet_address', wallet)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(mapRow)
}

export async function saveAutomation(walletAddress, automation) {
  const wallet = normalizeWallet(walletAddress)
  if (!wallet) throw new Error('Connect a wallet before saving an automation')

  const payload = {
    wallet_address: wallet,
    enabled: automation.enabled ?? true,
    vault_address: automation.vaultAddress || null,
    trigger_config: automation.trigger || {},
    action_config: automation.action || {},
    onchain: automation.onchain ?? true,
  }

  const { data, error } = await supabase
    .from('automations')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  return mapRow(data)
}

export async function updateAutomation(walletAddress, id, patch) {
  const wallet = normalizeWallet(walletAddress)
  if (!wallet) throw new Error('Wallet required')

  const updates = {}
  if (typeof patch.enabled === 'boolean') updates.enabled = patch.enabled
  if (patch.vaultAddress !== undefined) updates.vault_address = patch.vaultAddress
  if (patch.trigger !== undefined) updates.trigger_config = patch.trigger
  if (patch.action !== undefined) updates.action_config = patch.action
  if (typeof patch.onchain === 'boolean') updates.onchain = patch.onchain

  const { data, error } = await supabase
    .from('automations')
    .update(updates)
    .eq('id', id)
    .eq('wallet_address', wallet)
    .select('*')
    .single()

  if (error) throw error
  return mapRow(data)
}

export async function deleteAutomation(walletAddress, id) {
  const wallet = normalizeWallet(walletAddress)
  if (!wallet) throw new Error('Wallet required')

  const { error } = await supabase
    .from('automations')
    .delete()
    .eq('id', id)
    .eq('wallet_address', wallet)

  if (error) throw error
}

/**
 * Soft-pause kind for a vault: 'split' | 'recurring' | 'dca' | null (not on-chain).
 */
export function automationKind(action = {}, trigger = {}) {
  const type = action.type
  if (type === 'trading_strategy' || trigger.type === 'screener') return null
  if (
    type === 'dca_swap' ||
    type === 'swap_usdc_eth' ||
    type === 'buy_eth' ||
    type === 'buy_token' ||
    type === 'sell_eth_usdc' ||
    type === 'sell_token_eth'
  ) {
    return 'dca'
  }
  if (
    type === 'send_amount' ||
    type === 'send_token' ||
    type === 'bridge_relay' ||
    trigger.type === 'every_interval' ||
    trigger.type === 'time_window' ||
    trigger.type === 'usdc_above' ||
    trigger.type === 'eth_price_below' ||
    trigger.type === 'eth_price_above'
  ) {
    return 'recurring'
  }
  if (
    type === 'split' ||
    type === 'send_percent' ||
    trigger.type === 'receive_usdc' ||
    trigger.type === 'receive_eth'
  ) {
    return 'split'
  }
  return null
}

/**
 * Whether keeper / deposit poke should run this vault kind.
 * If no Supabase rows exist for the vault+kind, returns true (trust on-chain).
 * If any matching row is enabled, returns true; if all are paused, false.
 */
export async function isVaultKindActive(vaultAddress, kind) {
  const vault = String(vaultAddress || '').trim().toLowerCase()
  if (!vault || !kind) return true

  const { data, error } = await supabase
    .from('automations')
    .select('enabled, action_config, trigger_config, vault_address')

  if (error) {
    console.warn('isVaultKindActive:', error.message)
    return true
  }

  const rows = (data || []).filter((row) => {
    if (String(row.vault_address || '').trim().toLowerCase() !== vault) return false
    return automationKind(row.action_config || {}, row.trigger_config || {}) === kind
  })
  if (!rows.length) return true
  return rows.some((r) => r.enabled)
}

export function isValidAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim())
}

export function truncateAddress(address, chars = 4) {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`
}

export function describeAutomation(a) {
  const to = a.action?.to ?? a.savingsAddress
  const dest = truncateAddress(to)

  if (a.action?.type === 'trading_strategy' || a.trigger?.type === 'screener') {
    const action = a.action || {}
    const trigger = a.trigger || {}
    const vol = Number(trigger.minVolume24h || 0)
    const volLabel =
      vol >= 1_000_000
        ? `$${(vol / 1_000_000).toFixed(vol % 1_000_000 === 0 ? 0 : 1)}M`
        : vol >= 1_000
          ? `$${(vol / 1_000).toFixed(0)}K`
          : `$${vol}`
    const tps = (action.takeProfits || [])
      .map((tp) => `${tp.sellPercent}% @ ${tp.multiple}×`)
      .join(', ')
    const universe = trigger.pairSource === 'new' ? 'new pairs' : 'top volume'
    const chain =
      !trigger.chainId || trigger.chainId === 'all' ? 'all' : trigger.chainId
    return `Screener (${chain} · ${universe}): vol > ${volLabel}, holders > ${trigger.minHolders || 0} → buy ${action.buyEth || '?'} ETH · ${tps || 'TP —'} · SL −${action.stopLossPercent || '?'}%`
  }

  if (
    a.action?.type === 'swap_usdc_eth' ||
    a.action?.type === 'dca_swap' ||
    a.action?.type === 'buy_eth' ||
    a.action?.type === 'buy_token' ||
    a.action?.type === 'sell_eth_usdc' ||
    a.action?.type === 'sell_token_eth'
  ) {
    const amount = a.action?.amountHuman ?? a.action?.amount ?? '?'
    const every =
      a.trigger?.label ||
      (a.trigger?.interval
        ? formatIntervalLabel(a.trigger.intervalValue, a.trigger.intervalUnit, a.trigger.interval)
        : 'on a schedule')
    if (a.action?.type === 'sell_eth_usdc') {
      return `${every}, sell ${amount} ETH → USDC`
    }
    if (a.action?.type === 'sell_token_eth') {
      const sym = a.action?.tokenSymbol || truncateAddress(a.action?.tokenIn)
      return `${every}, sell ${amount} ${sym} → ETH`
    }
    if (a.action?.type === 'buy_token' || a.action?.tokenOut) {
      return `${every}, buy ${truncateAddress(a.action.tokenOut)} with ${amount} ETH`
    }
    return `${every}, buy ETH with ${amount} USDC`
  }

  if (a.action?.type === 'bridge_relay') {
    const amount = a.action?.amountHuman ?? a.action?.amount ?? '?'
    const every =
      a.trigger?.label ||
      (a.trigger?.interval
        ? formatIntervalLabel(a.trigger.intervalValue, a.trigger.intervalUnit, a.trigger.interval)
        : 'on a schedule')
    const to = a.action?.recipient
      ? truncateAddress(a.action.recipient)
      : dest
    const fromSym = a.action?.originSymbol || a.action?.originToken || 'TOKEN'
    const toSym = a.action?.destinationSymbol || a.action?.destinationToken || 'TOKEN'
    const from = a.action?.originChainId ?? '?'
    const chain = a.action?.destinationChainId ?? '?'
    return `${every}, bridge ${amount} ${fromSym} (${from} → ${toSym} on ${chain}) to ${to}`
  }

  if (
    a.trigger?.type === 'every_interval' ||
    a.trigger?.type === 'time_window' ||
    a.trigger?.type === 'usdc_above' ||
    a.trigger?.type === 'eth_price_below' ||
    a.trigger?.type === 'eth_price_above' ||
    a.action?.type === 'send_amount' ||
    a.action?.type === 'send_token'
  ) {
    const amount = a.action?.amountHuman ?? a.action?.amount ?? '?'
    const every =
      a.trigger?.label ||
      (a.trigger?.interval
        ? formatIntervalLabel(a.trigger.intervalValue, a.trigger.intervalUnit, a.trigger.interval)
        : 'on a schedule')
    const asset =
      a.action?.type === 'send_token'
        ? a.action?.tokenSymbol || truncateAddress(a.action?.token)
        : 'USDC'
    return `${every}, send ${amount} ${asset} to ${dest}`
  }

  const pct = a.action?.percent ?? a.percent
  if (a.trigger?.type === 'receive_eth' || a.action?.asset === 'ETH') {
    return `When this vault receives ETH, send ${pct}% to ${dest}`
  }
  return `When this vault receives USDC, send ${pct}% to ${dest}`
}

function formatIntervalLabel(value, unit, seconds) {
  if (value && unit) {
    const n = Number(value)
    const u = String(unit)
    if (n === 1) return `every ${u.replace(/s$/, '')}`
    return `every ${n} ${u}`
  }
  if (seconds) {
    const s = Number(seconds)
    if (s % 86400 === 0) {
      const d = s / 86400
      return d === 1 ? 'every day' : `every ${d} days`
    }
    if (s % 3600 === 0) {
      const h = s / 3600
      return h === 1 ? 'every hour' : `every ${h} hours`
    }
    if (s % 60 === 0) {
      const m = s / 60
      return m === 1 ? 'every minute' : `every ${m} minutes`
    }
  }
  return 'on a schedule'
}

/** Cache vault address per connected wallet + current factory (local). */
export function getCachedVault(owner) {
  try {
    const map = JSON.parse(localStorage.getItem(VAULT_KEY) || '{}')
    return map[vaultCacheKey(owner)] || null
  } catch {
    return null
  }
}

export function setCachedVault(owner, vault) {
  try {
    const map = JSON.parse(localStorage.getItem(VAULT_KEY) || '{}')
    map[vaultCacheKey(owner)] = vault
    localStorage.setItem(VAULT_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
