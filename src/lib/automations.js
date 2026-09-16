import { supabase } from './supabase'

const VAULT_KEY = 'programmable-money-vaults'
const LEGACY_AUTOMATIONS_KEY = 'programmable-money-automations'

function normalizeWallet(wallet) {
  return String(wallet || '').trim().toLowerCase()
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

  if (a.trigger?.type === 'every_interval' || a.action?.type === 'send_amount') {
    const amount = a.action?.amountHuman ?? a.action?.amount ?? '?'
    const every =
      a.trigger?.label ||
      (a.trigger?.interval
        ? `every ${formatIntervalLabel(a.trigger.intervalValue, a.trigger.intervalUnit, a.trigger.interval)}`
        : 'on a schedule')
    return `${every}, send ${amount} USDC to ${dest}`
  }

  const pct = a.action?.percent ?? a.percent
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

/** Cache vault address per connected wallet (local). */
export function getCachedVault(owner) {
  try {
    const map = JSON.parse(localStorage.getItem(VAULT_KEY) || '{}')
    return map[normalizeWallet(owner)] || null
  } catch {
    return null
  }
}

export function setCachedVault(owner, vault) {
  try {
    const map = JSON.parse(localStorage.getItem(VAULT_KEY) || '{}')
    map[normalizeWallet(owner)] = vault
    localStorage.setItem(VAULT_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
