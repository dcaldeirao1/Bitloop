import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'
import { Contract, JsonRpcProvider, Wallet, getAddress } from 'ethers'
import {
  applyMatchAndExits,
  fetchStrategyUniverse,
  getBestPair,
  getHoldersCount,
  matchesFilters,
} from './screener.js'

dotenv.config()

const RPC_URL = (
  process.env.SEPOLIA_RPC_URL ||
  process.env.VITE_ALCHEMY_SEPOLIA_ENDPOINT ||
  ''
).trim()
const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').trim()
const FACTORY_ADDRESS = (
  process.env.FACTORY_ADDRESS ||
  process.env.VITE_ACCOUNT_FACTORY_ADDRESS ||
  ''
).trim()
const USDC = getAddress(
  process.env.VITE_USDC_ADDRESS || '0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212',
)
const POLL_MS = Number(process.env.KEEPER_POLL_MS || 15_000)
const SCREENER_POLL_MS = Number(process.env.SCREENER_POLL_MS || 60_000)
const SUPABASE_URL = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).trim()
const SUPABASE_KEY = (
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCK_PATH = path.join(__dirname, '.keeper.lock')

const FACTORY_ABI = [
  'function accountCount() view returns (uint256)',
  'function allAccounts(uint256 index) view returns (address)',
]

const ACCOUNT_ABI = [
  'function splitEnabled() view returns (bool)',
  'function splitToken() view returns (address)',
  'function accounted(address token) view returns (uint256)',
  'function processToken(address token_) returns (uint256)',
  'function recurringEnabled() view returns (bool)',
  'function recurringToken() view returns (address)',
  'function recurringAmount() view returns (uint256)',
  'function recurringInterval() view returns (uint256)',
  'function recurringLastExecuted() view returns (uint256)',
  'function executeRecurring() returns (uint256)',
  'function dcaEnabled() view returns (bool)',
  'function dcaToken() view returns (address)',
  'function dcaTokenOut() view returns (address)',
  'function dcaAmount() view returns (uint256)',
  'function dcaInterval() view returns (uint256)',
  'function dcaLastExecuted() view returns (uint256)',
  'function executeDca() returns (uint256)',
]

const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)']

/** Ensure only one keeper process runs (prevents duplicate txs). */
function acquireLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const raw = fs.readFileSync(LOCK_PATH, 'utf8').trim()
      const oldPid = Number(raw)
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0)
          throw new Error(
            `Keeper already running (pid ${oldPid}). Stop it before starting another.`,
          )
        } catch (err) {
          if (err.code !== 'ESRCH' && !/already running/i.test(err.message)) {
            throw err
          }
          // Stale lock — previous process died
        }
      }
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'w' })
  } catch (err) {
    if (/already running/i.test(err.message)) throw err
    fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'w' })
  }

  const release = () => {
    try {
      if (fs.existsSync(LOCK_PATH)) {
        const cur = fs.readFileSync(LOCK_PATH, 'utf8').trim()
        if (cur === String(process.pid)) fs.unlinkSync(LOCK_PATH)
      }
    } catch {
      /* ignore */
    }
  }

  process.on('exit', release)
  process.on('SIGINT', () => {
    release()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    release()
    process.exit(0)
  })
}

async function maybeProcessSplit(vaultAddr, vault, usdc, wallet, softPaused) {
  try {
    if (softPaused) return
    const enabled = await vault.splitEnabled()
    if (!enabled) return

    const token = await vault.splitToken()
    // Native ETH split runs in receive() — no keeper poke needed
    if (!token || token === '0x0000000000000000000000000000000000000000') return
    if (getAddress(token) !== USDC) return

    const bal = await usdc.balanceOf(vaultAddr)
    const accounted = await vault.accounted(USDC)
    if (bal <= accounted) return

    const connected = vault.connect(wallet)
    const tx = await connected.processToken(USDC)
    const receipt = await tx.wait()
    console.log(
      `split ${vaultAddr} incoming=${(bal - accounted).toString()} tx=${receipt.hash}`,
    )
  } catch (err) {
    const msg = err?.shortMessage || err?.message || String(err)
    if (!/SplitDisabled|WrongToken|execution reverted/i.test(msg)) {
      console.warn(`split ${vaultAddr}:`, msg)
    }
  }
}

function inUtcWindow(startHour, endHour, hour = new Date().getUTCHours()) {
  const s = Number(startHour)
  const e = Number(endHour)
  if (!Number.isFinite(s) || !Number.isFinite(e)) return true
  if (s === e) return true
  if (s < e) return hour >= s && hour < e
  return hour >= s || hour < e
}

/** Soft gate: open for `windowMinutes` after the target UTC HH:MM (default 20m). */
function atUtcTime(hour, minute, now = new Date(), windowMinutes = 20) {
  const h = Number(hour)
  const m = Number(minute)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return true
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const targetMins = ((h % 24) + 24) % 24 * 60 + ((m % 60) + 60) % 60
  let delta = nowMins - targetMins
  if (delta < 0) delta += 24 * 60
  return delta < windowMinutes
}

function passesTriggerGates(trigger, ctx) {
  if (!trigger?.type) return true
  const t = trigger.type

  if (t === 'time_window') {
    // New shape: specific HH:MM. Legacy: startHour/endHour window.
    if (trigger.hour != null || trigger.minute != null) {
      return atUtcTime(trigger.hour ?? 0, trigger.minute ?? 0, ctx.now || new Date())
    }
    return inUtcWindow(trigger.startHour, trigger.endHour, ctx.hourUtc)
  }

  if (t === 'usdc_above') {
    const floor = Number(trigger.amount)
    if (!Number.isFinite(floor)) return true
    return ctx.usdcHuman >= floor
  }

  if (t === 'eth_price_below') {
    const px = Number(trigger.priceUsd)
    if (!Number.isFinite(px) || px <= 0) return true
    if (!(ctx.ethPriceUsd > 0)) return false
    return ctx.ethPriceUsd <= px
  }

  if (t === 'eth_price_above') {
    const px = Number(trigger.priceUsd)
    if (!Number.isFinite(px) || px <= 0) return true
    if (!(ctx.ethPriceUsd > 0)) return false
    return ctx.ethPriceUsd >= px
  }

  return true
}

let ethPriceCache = { at: 0, usd: 0 }

async function fetchEthPriceUsd() {
  const now = Date.now()
  if (ethPriceCache.usd > 0 && now - ethPriceCache.at < 60_000) {
    return ethPriceCache.usd
  }
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(8_000) },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const usd = Number(json?.ethereum?.usd || 0)
    if (usd > 0) {
      ethPriceCache = { at: now, usd }
      return usd
    }
  } catch (err) {
    console.warn('eth price:', err.message || err)
  }
  return ethPriceCache.usd || 0
}

/**
 * Soft gates from enabled Supabase rows for this vault+kind.
 * If any enabled row fails its gate, block execution (AND across enabled gated rows).
 * Ungated rows (every_interval / receive_*) always pass.
 */
async function loadEnabledTriggers(supabase, vaultAddr, kind) {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('automations')
      .select('enabled, vault_address, action_config, trigger_config')
      .eq('enabled', true)

    if (error) throw error
    const vault = String(vaultAddr || '').trim().toLowerCase()
    return (data || [])
      .filter((row) => {
        if (String(row.vault_address || '').trim().toLowerCase() !== vault) return false
        return classifyAutomationKind(row) === kind
      })
      .map((row) => row.trigger_config || {})
  } catch (err) {
    console.warn('trigger gates:', err.message || err)
    return []
  }
}

async function softGatesAllow(supabase, vaultAddr, kind, ctx) {
  const triggers = await loadEnabledTriggers(supabase, vaultAddr, kind)
  if (!triggers.length) return true
  // If at least one enabled rule's gates pass, allow (OR) — matches soft-pause OR of enabled
  return triggers.some((t) => passesTriggerGates(t, ctx))
}

async function maybeExecuteRecurring(
  vaultAddr,
  vault,
  usdc,
  wallet,
  softPaused,
  supabase,
  ctx,
) {
  try {
    if (softPaused) return
    const enabled = await vault.recurringEnabled()
    if (!enabled) return

    const tokenAddr = await vault.recurringToken()
    if (!tokenAddr || tokenAddr === '0x0000000000000000000000000000000000000000') {
      return
    }

    const amount = await vault.recurringAmount()
    if (amount === 0n) return

    const token = new Contract(tokenAddr, ERC20_ABI, wallet.provider)
    const bal = await token.balanceOf(vaultAddr)
    if (bal < amount) return

    const interval = await vault.recurringInterval()
    const last = await vault.recurringLastExecuted()
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (last !== 0n && now < last + interval) return

    let usdcHuman = 0
    try {
      const usdcBal = await usdc.balanceOf(vaultAddr)
      usdcHuman = Number(usdcBal) / 1e6
    } catch {
      /* ignore */
    }

    const gateCtx = { ...ctx, usdcHuman }
    if (!(await softGatesAllow(supabase, vaultAddr, 'recurring', gateCtx))) {
      return
    }

    const connected = vault.connect(wallet)
    const tx = await connected.executeRecurring()
    const receipt = await tx.wait()
    console.log(
      `recurring ${vaultAddr} token=${tokenAddr} amount=${amount.toString()} tx=${receipt.hash}`,
    )
  } catch (err) {
    const msg = err?.shortMessage || err?.message || String(err)
    if (/recurringEnabled|RecurringNotDue|RecurringDisabled|InsufficientBalance/i.test(msg)) {
      return
    }
    if (!/execution reverted/i.test(msg)) {
      console.warn(`recurring ${vaultAddr}:`, msg)
    }
  }
}

async function maybeExecuteDca(
  vaultAddr,
  vault,
  usdc,
  wallet,
  softPaused,
  supabase,
  ctx,
) {
  try {
    if (softPaused) return
    const enabled = await vault.dcaEnabled()
    if (!enabled) return

    const amount = await vault.dcaAmount()
    if (amount === 0n) return

    const tokenOut = await vault.dcaTokenOut()
    const tokenIn = await vault.dcaToken()
    const toEth =
      !tokenOut || tokenOut === '0x0000000000000000000000000000000000000000'
    const fromEth =
      !tokenIn || tokenIn === '0x0000000000000000000000000000000000000000'

    let usdcHuman = 0
    try {
      const usdcBal = await usdc.balanceOf(vaultAddr)
      usdcHuman = Number(usdcBal) / 1e6
    } catch {
      /* ignore */
    }

    if (toEth) {
      // Sell ERC-20 → ETH (tokenIn must be set)
      if (fromEth) return
      const erc20 = new Contract(tokenIn, ERC20_ABI, wallet.provider)
      const bal = await erc20.balanceOf(vaultAddr)
      if (bal < amount) return
    } else {
      // Buy token with vault ETH (tokenIn must be zero)
      if (!fromEth) return
      const ethBal = await wallet.provider.getBalance(vaultAddr)
      if (ethBal < amount) return
    }

    const interval = await vault.dcaInterval()
    const last = await vault.dcaLastExecuted()
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (last !== 0n && now < last + interval) return

    const gateCtx = { ...ctx, usdcHuman }
    if (!(await softGatesAllow(supabase, vaultAddr, 'dca', gateCtx))) {
      return
    }

    const connected = vault.connect(wallet)
    const tx = await connected.executeDca()
    const receipt = await tx.wait()
    const mode = toEth
      ? `${tokenIn.slice(0, 8)}→ETH`
      : `ETH→${tokenOut.slice(0, 8)}`
    console.log(
      `dca ${vaultAddr} ${mode} amountIn=${amount.toString()} tx=${receipt.hash}`,
    )
  } catch (err) {
    const msg = err?.shortMessage || err?.message || String(err)
    if (
      /dcaEnabled|DcaNotDue|DcaDisabled|InsufficientBalance|InsufficientLiquidity|NoTokenMarket|InvalidAmount/i.test(
        msg,
      )
    ) {
      if (/NoTokenMarket|InsufficientLiquidity/i.test(msg)) {
        console.warn(`dca ${vaultAddr}: no market/liquidity for token — ${msg}`)
      }
      return
    }
    if (!/execution reverted/i.test(msg)) {
      console.warn(`dca ${vaultAddr}:`, msg)
    }
  }
}

function classifyAutomationKind(row) {
  const action = row.action_config || {}
  const trigger = row.trigger_config || {}
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
    trigger.type === 'usdc_above'
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
 * Soft-pause map: `${vault}:${kind}` → true when every matching Supabase row is disabled.
 * Missing keys mean "no soft control" (run if on-chain enabled).
 */
async function loadSoftPauseMap(supabase) {
  const paused = new Set()
  if (!supabase) return paused

  try {
    const { data, error } = await supabase
      .from('automations')
      .select('vault_address, enabled, action_config, trigger_config')

    if (error) throw error

    const seen = new Map()
    for (const row of data || []) {
      const vault = String(row.vault_address || '').trim().toLowerCase()
      const kind = classifyAutomationKind(row)
      if (!vault || !kind) continue
      const key = `${vault}:${kind}`
      const cur = seen.get(key) || { allow: false }
      if (row.enabled) cur.allow = true
      seen.set(key, cur)
    }

    for (const [key, cur] of seen) {
      if (!cur.allow) paused.add(key)
    }
  } catch (err) {
    console.warn('soft-pause load:', err.message || err)
  }

  return paused
}

async function maybeRunScreeners(supabase) {
  if (!supabase) return
  try {
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('enabled', true)

    if (error) throw error
    const strategies = (data || []).filter(
      (row) =>
        row.action_config?.type === 'trading_strategy' ||
        row.trigger_config?.type === 'screener',
    )
    if (!strategies.length) return

    // Group by chain + pair universe so volume/new lists stay separate
    const byUniverse = new Map()
    for (const row of strategies) {
      const chain = row.trigger_config?.chainId || 'all'
      const pairSource =
        row.trigger_config?.pairSource === 'new' ? 'new' : 'volume'
      const key = `${chain}:${pairSource}`
      if (!byUniverse.has(key)) byUniverse.set(key, [])
      byUniverse.get(key).push(row)
    }

    for (const [key, rows] of byUniverse) {
      const [chainId, pairSource] = key.split(':')
      let universe = []
      try {
        universe = await fetchStrategyUniverse(chainId, pairSource, 24)
      } catch (err) {
        console.warn(`screener ${key}:`, err.message || err)
        continue
      }

      for (const row of rows) {
        const trigger = row.trigger_config || {}
        const action = row.action_config || {}
        const needHolders = Number(trigger.minHolders || 0) > 0

        let match = null
        for (const token of universe) {
          let enriched = token
          if (needHolders) {
            const holders = await getHoldersCount(
              token.tokenAddress,
              token.chainId || chainId,
            )
            enriched = { ...token, holders }
          }
          if (matchesFilters(enriched, trigger)) {
            match = enriched
            break
          }
        }

        // Refresh prices for open positions even without a new entry match
        const openPositions = (action.positions || []).filter(
          (p) => p.status === 'open' || p.status === 'partial',
        )

        let nextAction = {
          ...action,
          lastScanAt: new Date().toISOString(),
        }

        if (match) {
          nextAction = applyMatchAndExits(action, match)
          console.log(
            `screener match ${row.id} [${pairSource}] ${match.symbol} vol=${match.volume24h} price=${match.priceUsd}`,
          )
        }

        for (const pos of openPositions) {
          const addr = pos.tokenAddress
          if (match && addr.toLowerCase() === match.tokenAddress.toLowerCase()) {
            continue
          }
          const posChain =
            pos.chainId && pos.chainId !== 'all' ? pos.chainId : chainId
          if (!posChain || posChain === 'all') continue
          try {
            const pair = await getBestPair(posChain, addr)
            if (pair?.priceUsd) {
              nextAction = applyMatchAndExits(nextAction, pair)
            }
          } catch {
            /* ignore */
          }
        }

        const { error: upErr } = await supabase
          .from('automations')
          .update({ action_config: nextAction })
          .eq('id', row.id)

        if (upErr) {
          console.warn(`screener update ${row.id}:`, upErr.message)
        }
      }
    }
  } catch (err) {
    console.warn('screener tick:', err.message || err)
  }
}

async function main() {
  if (!RPC_URL || !PRIVATE_KEY || !FACTORY_ADDRESS) {
    throw new Error('Need SEPOLIA_RPC_URL, PRIVATE_KEY, and FACTORY_ADDRESS')
  }

  acquireLock()

  const provider = new JsonRpcProvider(RPC_URL)
  const wallet = new Wallet(
    PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`,
    provider,
  )
  const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider)
  const usdc = new Contract(USDC, ERC20_ABI, provider)
  const supabase =
    SUPABASE_URL && SUPABASE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: { transport: ws },
        })
      : null

  console.log('Keeper running')
  console.log('  pid    ', process.pid)
  console.log('  factory', FACTORY_ADDRESS)
  console.log('  usdc   ', USDC)
  console.log('  signer ', wallet.address)
  console.log('  screener', supabase ? 'on' : 'off (missing Supabase env)')

  let ticking = false
  const tick = async () => {
    if (ticking) return
    ticking = true
    try {
      const softPaused = await loadSoftPauseMap(supabase)
      const ethPriceUsd = await fetchEthPriceUsd()
      const hourUtc = new Date().getUTCHours()
      const gateBase = { ethPriceUsd, hourUtc, now: new Date() }

      const count = Number(await factory.accountCount())
      for (let i = 0; i < count; i++) {
        const vaultAddr = await factory.allAccounts(i)
        const vault = new Contract(vaultAddr, ACCOUNT_ABI, provider)
        const key = vaultAddr.toLowerCase()
        await maybeProcessSplit(
          vaultAddr,
          vault,
          usdc,
          wallet,
          softPaused.has(`${key}:split`),
        )
        await maybeExecuteRecurring(
          vaultAddr,
          vault,
          usdc,
          wallet,
          softPaused.has(`${key}:recurring`),
          supabase,
          gateBase,
        )
        await maybeExecuteDca(
          vaultAddr,
          vault,
          usdc,
          wallet,
          softPaused.has(`${key}:dca`),
          supabase,
          gateBase,
        )
      }
    } catch (err) {
      console.error('tick error', err.message || err)
    } finally {
      ticking = false
    }
  }

  let screening = false
  const screenerTick = async () => {
    if (screening) return
    screening = true
    try {
      await maybeRunScreeners(supabase)
    } finally {
      screening = false
    }
  }

  await tick()
  setInterval(() => void tick(), POLL_MS)
  void screenerTick()
  setInterval(() => void screenerTick(), SCREENER_POLL_MS)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
