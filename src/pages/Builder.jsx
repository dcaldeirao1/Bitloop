import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { BlockPalette } from '../components/BlockPalette'
import { DashShell } from '../components/DashShell'
import { RuleCanvas } from '../components/RuleCanvas'
import { useWallet } from '../context/WalletContext'
import {
  isValidAddress,
  saveAutomation,
  setCachedVault,
} from '../lib/automations'
import {
  setupEthSplitAutomation,
  setupSellEthForUsdcAutomation,
  setupSellTokenForEthAutomation,
  setupTokenRecurringAutomation,
  setupUsdcDcaAutomation,
  setupUsdcRecurringAutomation,
  setupUsdcSplitAutomation,
} from '../lib/vault'

const SCHEDULE_TRIGGERS = new Set([
  'every_interval',
  'time_window',
  'usdc_above',
  'eth_price_below',
  'eth_price_above',
])

const PERCENT_TRIGGERS = new Set(['receive_usdc', 'receive_eth'])

const DCA_ACTIONS = new Set([
  'buy_eth',
  'buy_token',
  'sell_eth_usdc',
  'sell_token_eth',
  'dca_swap',
  'swap_usdc_eth',
])

const SEND_ACTIONS = new Set(['send_amount', 'send_token'])

function intervalOk(trigger) {
  return (
    Number(trigger.every) >= 1 &&
    ['minutes', 'hours', 'days'].includes(trigger.unit)
  )
}

function scheduleTriggerFieldsOk(trigger) {
  if (!intervalOk(trigger)) return false
  if (trigger.type === 'usdc_above') {
    const floor = Number(trigger.amount)
    return Number.isFinite(floor) && floor >= 0
  }
  if (trigger.type === 'eth_price_below' || trigger.type === 'eth_price_above') {
    const px = Number(trigger.priceUsd)
    return Number.isFinite(px) && px > 0
  }
  if (trigger.type === 'time_window') {
    const s = Number(trigger.startHour)
    const e = Number(trigger.endHour)
    return (
      Number.isInteger(s) &&
      Number.isInteger(e) &&
      s >= 0 &&
      s <= 23 &&
      e >= 0 &&
      e <= 23
    )
  }
  return true
}

function buildTriggerPayload(trigger, result) {
  const base = {
    type: trigger.type,
    interval: result.interval,
    intervalValue: result.intervalValue,
    intervalUnit: result.intervalUnit,
  }

  if (trigger.type === 'every_interval') {
    return {
      ...base,
      label: `Every ${result.intervalValue} ${result.intervalUnit}`,
    }
  }

  if (trigger.type === 'time_window') {
    return {
      ...base,
      startHour: Number(trigger.startHour),
      endHour: Number(trigger.endHour),
      label: `UTC ${trigger.startHour}–${trigger.endHour} · every ${result.intervalValue} ${result.intervalUnit}`,
    }
  }

  if (trigger.type === 'usdc_above') {
    return {
      ...base,
      amount: String(trigger.amount),
      label: `USDC ≥ ${trigger.amount} · every ${result.intervalValue} ${result.intervalUnit}`,
    }
  }

  if (trigger.type === 'eth_price_below') {
    return {
      ...base,
      priceUsd: String(trigger.priceUsd),
      label: `ETH ≤ $${trigger.priceUsd} · every ${result.intervalValue} ${result.intervalUnit}`,
    }
  }

  if (trigger.type === 'eth_price_above') {
    return {
      ...base,
      priceUsd: String(trigger.priceUsd),
      label: `ETH ≥ $${trigger.priceUsd} · every ${result.intervalValue} ${result.intervalUnit}`,
    }
  }

  return base
}

export function Builder() {
  const { address } = useWallet()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [trigger, setTrigger] = useState(null)
  const [action, setAction] = useState(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = params.get('token')
    if (token && isValidAddress(token)) {
      setTrigger({ type: 'every_interval', every: 1, unit: 'hours' })
      setAction({
        type: 'buy_token',
        amount: '0.01',
        tokenOut: token,
      })
    }
  }, [params])

  const canSave = useMemo(() => {
    if (!trigger || !action) return false

    if (PERCENT_TRIGGERS.has(trigger.type) && action.type === 'send_percent') {
      return (
        action.percent >= 1 &&
        action.percent <= 100 &&
        isValidAddress(action.to)
      )
    }

    if (SCHEDULE_TRIGGERS.has(trigger.type) && SEND_ACTIONS.has(action.type)) {
      if (!scheduleTriggerFieldsOk(trigger)) return false
      const amount = Number(action.amount)
      if (!Number.isFinite(amount) || amount <= 0 || !isValidAddress(action.to)) {
        return false
      }
      if (action.type === 'send_token' && !isValidAddress(action.token)) return false
      return true
    }

    if (SCHEDULE_TRIGGERS.has(trigger.type) && DCA_ACTIONS.has(action.type)) {
      if (!scheduleTriggerFieldsOk(trigger)) return false
      const amount = Number(action.amount)
      if (!Number.isFinite(amount) || amount <= 0) return false
      if (action.type === 'buy_token' && !isValidAddress(action.tokenOut)) return false
      if (action.type === 'sell_token_eth' && !isValidAddress(action.tokenIn)) return false
      if (
        (action.type === 'dca_swap' || action.type === 'swap_usdc_eth') &&
        action.outMode === 'token' &&
        !isValidAddress(action.tokenOut)
      ) {
        return false
      }
      return true
    }

    return false
  }, [trigger, action])

  if (!address) {
    return <Navigate to="/app" replace />
  }

  const addTrigger = (type) => {
    if (type === 'every_interval') {
      setTrigger({ type: 'every_interval', every: 1, unit: 'hours' })
    } else if (type === 'time_window') {
      setTrigger({
        type: 'time_window',
        startHour: 9,
        endHour: 17,
        every: 1,
        unit: 'hours',
      })
    } else if (type === 'usdc_above') {
      setTrigger({ type: 'usdc_above', amount: '100', every: 1, unit: 'hours' })
    } else if (type === 'eth_price_below') {
      setTrigger({
        type: 'eth_price_below',
        priceUsd: '2000',
        every: 1,
        unit: 'hours',
      })
    } else if (type === 'eth_price_above') {
      setTrigger({
        type: 'eth_price_above',
        priceUsd: '4000',
        every: 1,
        unit: 'hours',
      })
    } else if (type === 'receive_eth') {
      setTrigger({ type: 'receive_eth' })
    } else {
      setTrigger({ type: 'receive_usdc' })
    }

    if (PERCENT_TRIGGERS.has(type) || type === 'receive_usdc' || type === 'receive_eth') {
      if (action && action.type !== 'send_percent') setAction(null)
      return
    }
    if (
      action &&
      !SEND_ACTIONS.has(action.type) &&
      !DCA_ACTIONS.has(action.type)
    ) {
      setAction(null)
    }
  }

  const addAction = (type) => {
    if (type === 'buy_eth' || type === 'swap_usdc_eth') {
      setAction({ type: 'buy_eth', amount: '10' })
      if (trigger && !SCHEDULE_TRIGGERS.has(trigger.type)) setTrigger(null)
      return
    }
    if (type === 'buy_token') {
      setAction({ type: 'buy_token', amount: '0.01', tokenOut: '' })
      if (trigger && !SCHEDULE_TRIGGERS.has(trigger.type)) setTrigger(null)
      return
    }
    if (type === 'sell_eth_usdc') {
      setAction({ type: 'sell_eth_usdc', amount: '0.01' })
      if (trigger && !SCHEDULE_TRIGGERS.has(trigger.type)) setTrigger(null)
      return
    }
    if (type === 'sell_token_eth') {
      setAction({ type: 'sell_token_eth', amount: '10', tokenIn: '' })
      if (trigger && !SCHEDULE_TRIGGERS.has(trigger.type)) setTrigger(null)
      return
    }
    if (type === 'send_token') {
      setAction({ type: 'send_token', amount: '10', token: '', to: '' })
      if (trigger && !SCHEDULE_TRIGGERS.has(trigger.type)) setTrigger(null)
      return
    }
    if (type === 'send_amount') {
      setAction({ type: 'send_amount', amount: '10', to: '' })
      if (trigger && !SCHEDULE_TRIGGERS.has(trigger.type)) setTrigger(null)
      return
    }
    setAction({ type: 'send_percent', percent: 20, to: '' })
    if (trigger && !PERCENT_TRIGGERS.has(trigger.type)) setTrigger(null)
  }

  const handleSave = async () => {
    if (!trigger || !action || !canSave) return
    setSaving(true)
    setError(null)
    setStatus('Confirm MetaMask: deploy/configure your vault…')
    try {
      if (action.type === 'sell_eth_usdc') {
        const result = await setupSellEthForUsdcAutomation({
          amountHuman: action.amount,
          intervalValue: trigger.every,
          intervalUnit: trigger.unit,
        })
        setCachedVault(address, result.vaultAddress)
        await saveAutomation(address, {
          enabled: true,
          vaultAddress: result.vaultAddress,
          trigger: buildTriggerPayload(trigger, result),
          action: {
            type: 'sell_eth_usdc',
            amount: result.amount,
            amountHuman: result.amountHuman,
            amountAsset: 'ETH',
            decimals: result.decimals,
            router: result.router,
            minOut: result.minOut,
            tokenOut: result.tokenOut,
          },
          onchain: true,
        })
      } else if (action.type === 'sell_token_eth') {
        const result = await setupSellTokenForEthAutomation({
          tokenIn: action.tokenIn,
          amountHuman: action.amount,
          intervalValue: trigger.every,
          intervalUnit: trigger.unit,
        })
        setCachedVault(address, result.vaultAddress)
        await saveAutomation(address, {
          enabled: true,
          vaultAddress: result.vaultAddress,
          trigger: buildTriggerPayload(trigger, result),
          action: {
            type: 'sell_token_eth',
            amount: result.amount,
            amountHuman: result.amountHuman,
            amountAsset: result.amountAsset,
            decimals: result.decimals,
            router: result.router,
            minOut: result.minOut,
            tokenIn: result.token,
            tokenSymbol: result.tokenSymbol,
          },
          onchain: true,
        })
      } else if (
        action.type === 'buy_eth' ||
        action.type === 'buy_token' ||
        action.type === 'swap_usdc_eth' ||
        action.type === 'dca_swap'
      ) {
        const buyToken =
          action.type === 'buy_token' ||
          ((action.type === 'dca_swap' || action.type === 'swap_usdc_eth') &&
            action.outMode === 'token')
        const result = await setupUsdcDcaAutomation({
          amountHuman: action.amount,
          intervalValue: trigger.every,
          intervalUnit: trigger.unit,
          tokenOut: buyToken ? action.tokenOut : null,
        })
        setCachedVault(address, result.vaultAddress)
        await saveAutomation(address, {
          enabled: true,
          vaultAddress: result.vaultAddress,
          trigger: buildTriggerPayload(trigger, result),
          action: {
            type: buyToken ? 'buy_token' : 'buy_eth',
            amount: result.amount,
            amountHuman: result.amountHuman,
            amountAsset: result.amountAsset,
            decimals: result.decimals,
            router: result.router,
            minOut: result.minOut,
            tokenOut: result.tokenOut,
            outMode: result.tokenOut ? 'token' : 'eth',
          },
          onchain: true,
        })
      } else if (action.type === 'send_token') {
        const result = await setupTokenRecurringAutomation({
          tokenAddress: action.token,
          toAddress: action.to,
          amountHuman: action.amount,
          intervalValue: trigger.every,
          intervalUnit: trigger.unit,
        })
        setCachedVault(address, result.vaultAddress)
        await saveAutomation(address, {
          enabled: true,
          vaultAddress: result.vaultAddress,
          trigger: buildTriggerPayload(trigger, result),
          action: {
            type: 'send_token',
            amount: result.amount,
            amountHuman: result.amountHuman,
            decimals: result.decimals,
            to: result.toAddress,
            token: result.token,
            tokenSymbol: result.tokenSymbol,
          },
          onchain: true,
        })
      } else if (action.type === 'send_amount') {
        const result = await setupUsdcRecurringAutomation({
          toAddress: action.to,
          amountHuman: action.amount,
          intervalValue: trigger.every,
          intervalUnit: trigger.unit,
        })
        setCachedVault(address, result.vaultAddress)
        await saveAutomation(address, {
          enabled: true,
          vaultAddress: result.vaultAddress,
          trigger: buildTriggerPayload(trigger, result),
          action: {
            type: 'send_amount',
            amount: result.amount,
            amountHuman: result.amountHuman,
            decimals: result.decimals,
            to: result.toAddress,
          },
          onchain: true,
        })
      } else if (trigger.type === 'receive_eth') {
        const result = await setupEthSplitAutomation({
          savingsAddress: action.to,
          percent: action.percent,
        })
        setCachedVault(address, result.vaultAddress)
        await saveAutomation(address, {
          enabled: true,
          vaultAddress: result.vaultAddress,
          trigger: { type: 'receive_eth', token: null },
          action: {
            type: 'send_percent',
            percent: action.percent,
            to: result.savingsAddress,
            asset: 'ETH',
          },
          onchain: true,
        })
      } else {
        const result = await setupUsdcSplitAutomation({
          savingsAddress: action.to,
          percent: action.percent,
        })
        setCachedVault(address, result.vaultAddress)
        await saveAutomation(address, {
          enabled: true,
          vaultAddress: result.vaultAddress,
          trigger: { type: 'receive_usdc', token: result.token },
          action: {
            type: 'send_percent',
            percent: action.percent,
            to: result.savingsAddress,
            asset: 'USDC',
          },
          onchain: true,
        })
      }

      navigate('/app?section=automations')
    } catch (err) {
      setError(err?.shortMessage || err?.message || 'Could not set up automation')
      setStatus(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashShell>
      <div className="dash-header">
        <div>
          <h1 className="dash-title">New automation</h1>
          <p className="dash-subtitle">
            Compose the rule on top, then pick blocks from the catalog.
          </p>
        </div>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() => void handleSave()}
          className="btn-primary"
        >
          {saving ? 'Confirm in MetaMask…' : 'Save & deploy'}
        </button>
      </div>

      {status && (
        <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 font-mono text-[12px] text-ink-soft">
          {status}
        </p>
      )}
      {error && <p className="alert-error mb-4">{error}</p>}

      <div className="builder-workspace">
        <RuleCanvas
          trigger={trigger}
          action={action}
          onClearTrigger={() => setTrigger(null)}
          onClearAction={() => setAction(null)}
          onTriggerChange={setTrigger}
          onActionChange={setAction}
        />
        <BlockPalette
          hasTrigger={Boolean(trigger)}
          hasAction={Boolean(action)}
          triggerType={trigger?.type}
          onAddTrigger={addTrigger}
          onAddAction={addAction}
        />
      </div>
    </DashShell>
  )
}
