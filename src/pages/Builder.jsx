import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { BlockPalette } from '../components/BlockPalette'
import { DashShell } from '../components/DashShell'
import { NetworkBanner } from '../components/NetworkBanner'
import { RuleCanvas } from '../components/RuleCanvas'
import { EnvBadge, RuleStepsHeader } from '../components/RuleStepsHeader'
import { RULE_CATEGORY, getCategoryMeta } from '../lib/ruleCategories'
import { useWallet } from '../context/WalletContext'
import {
  automationKind,
  describeAutomation,
  isValidAddress,
  listAutomations,
  saveAutomation,
  setCachedVault,
  updateAutomation,
} from '../lib/automations'
import {
  setupEthSplitAutomation,
  setupRelayBridgeAutomation,
  setupSellEthForUsdcAutomation,
  setupSellTokenForEthAutomation,
  setupTokenRecurringAutomation,
  setupUsdcDcaAutomation,
  setupUsdcRecurringAutomation,
  setupUsdcSplitAutomation,
} from '../lib/vault'
import { findChainToken, isNativeCurrency } from '../lib/relay'

const TEMPLATES = [
  {
    id: 'income_split',
    title: 'Income split',
    blurb: 'When USDC arrives, send 20% to savings',
    apply: () => ({
      trigger: { type: 'receive_usdc' },
      action: { type: 'send_percent', percent: 20, to: '' },
    }),
  },
  {
    id: 'scheduled_transfer',
    title: 'Scheduled transfer',
    blurb: 'Every day, send 10 USDC to an address',
    apply: () => ({
      trigger: { type: 'every_interval', every: 1, unit: 'days' },
      action: { type: 'send_amount', amount: '10', to: '' },
    }),
  },
  {
    id: 'dca_eth',
    title: 'DCA into ETH',
    blurb: 'Every hour, buy ETH with 10 USDC',
    apply: () => ({
      trigger: { type: 'every_interval', every: 1, unit: 'hours' },
      action: { type: 'buy_eth', amount: '10' },
    }),
  },
]

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

const SEND_ACTIONS = new Set(['send_amount', 'send_token', 'bridge_relay'])

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
    const hour = Number(trigger.hour ?? trigger.startHour)
    const minute = Number(trigger.minute ?? 0)
    return (
      Number.isInteger(hour) &&
      Number.isInteger(minute) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
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
    const hour = Number(trigger.hour ?? trigger.startHour ?? 0)
    const minute = Number(trigger.minute ?? 0)
    const hh = String(hour).padStart(2, '0')
    const mm = String(minute).padStart(2, '0')
    return {
      ...base,
      hour,
      minute,
      label: `At ${hh}:${mm} UTC · every ${result.intervalValue} ${result.intervalUnit}`,
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
  const [showPreview, setShowPreview] = useState(false)
  const [existingRules, setExistingRules] = useState([])

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

  useEffect(() => {
    if (!address) return
    listAutomations(address)
      .then(setExistingRules)
      .catch(() => setExistingRules([]))
  }, [address])

  const draftKind = useMemo(() => {
    if (!trigger || !action) return null
    return automationKind(action, trigger)
  }, [trigger, action])

  const overwriteRules = useMemo(() => {
    if (!draftKind) return []
    return existingRules.filter(
      (r) =>
        r.onchain !== false &&
        automationKind(r.action, r.trigger) === draftKind,
    )
  }, [existingRules, draftKind])

  const previewRule = useMemo(() => {
    if (!trigger || !action) return null
    return {
      enabled: true,
      trigger,
      action,
      onchain: true,
    }
  }, [trigger, action])

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
      if (!Number.isFinite(amount) || amount <= 0) return false
      if (action.type === 'bridge_relay') {
        const originToken = action.originToken || 'USDC'
        const destToken = action.destinationToken || 'USDC'
        if (originToken === 'custom' && !isValidAddress(action.originCustomAddress)) {
          return false
        }
        if (destToken === 'custom' && !isValidAddress(action.destinationCustomAddress)) {
          return false
        }
        const originAddr =
          originToken === 'custom'
            ? action.originCustomAddress
            : findChainToken(action.originChainId, originToken)?.address ||
              action.originCurrency
        if (isNativeCurrency(originAddr) || originToken === 'ETH' || originToken === 'MATIC') {
          return false
        }
        return (
          isValidAddress(action.recipient) &&
          Number(action.originChainId) > 0 &&
          Number(action.destinationChainId) > 0 &&
          Number(action.originChainId) !== Number(action.destinationChainId)
        )
      }
      if (!isValidAddress(action.to)) return false
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
        hour: 9,
        minute: 0,
        every: 1,
        unit: 'days',
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
    if (type === 'bridge_relay') {
      const origin = findChainToken(42161, 'WETH')
      const dest = findChainToken(8453, 'USDC')
      setAction({
        type: 'bridge_relay',
        amount: '0.01',
        originChainId: 42161,
        destinationChainId: 8453,
        originToken: 'WETH',
        originCurrency: origin?.address || '',
        originSymbol: 'WETH',
        originDecimals: 18,
        destinationToken: 'USDC',
        destinationCurrency: dest?.address || '',
        destinationSymbol: 'USDC',
        destinationDecimals: 6,
        recipient: address || '',
      })
      if (trigger && !SCHEDULE_TRIGGERS.has(trigger.type)) setTrigger(null)
      return
    }
    setAction({ type: 'send_percent', percent: 20, to: '' })
    if (trigger && !PERCENT_TRIGGERS.has(trigger.type)) setTrigger(null)
  }

  const requestSave = () => {
    if (!trigger || !action || !canSave) return
    setError(null)
    setShowPreview(true)
  }

  const handleSave = async () => {
    if (!trigger || !action || !canSave) return
    setSaving(true)
    setError(null)
    setShowPreview(false)
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
      } else if (action.type === 'bridge_relay') {
        setStatus('Fetching Relay quote + configuring vault…')
        const result = await setupRelayBridgeAutomation({
          amountHuman: action.amount,
          originChainId: action.originChainId,
          destinationChainId: action.destinationChainId,
          recipient: action.recipient,
          intervalValue: trigger.every,
          intervalUnit: trigger.unit,
          originToken: action.originToken,
          originCustomAddress: action.originCustomAddress,
          originDecimals: action.originDecimals,
          destinationToken: action.destinationToken,
          destinationCustomAddress: action.destinationCustomAddress,
          destinationDecimals: action.destinationDecimals,
        })
        setCachedVault(address, result.vaultAddress)
        await saveAutomation(address, {
          enabled: true,
          vaultAddress: result.vaultAddress,
          trigger: buildTriggerPayload(trigger, result),
          action: {
            type: 'bridge_relay',
            amount: result.amount,
            amountHuman: result.amountHuman,
            decimals: result.decimals,
            to: result.toAddress,
            recipient: result.recipient,
            originChainId: result.originChainId,
            destinationChainId: result.destinationChainId,
            originToken: result.originToken,
            destinationToken: result.destinationToken,
            originCurrency: result.originCurrency,
            destinationCurrency: result.destinationCurrency,
            originSymbol: result.originSymbol,
            destinationSymbol: result.destinationSymbol,
            originDecimals: result.originDecimals,
            destinationDecimals: result.destinationDecimals,
            depositAddress: result.depositAddress,
            requestId: result.requestId,
            relaySummary: result.relaySummary,
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

      // Soft-pause superseded same-kind rows (vault has one on-chain slot per kind)
      if (overwriteRules.length) {
        setStatus('Updating superseded automations…')
        await Promise.all(
          overwriteRules.map((r) =>
            updateAutomation(address, r.id, { enabled: false }).catch(() => null),
          ),
        )
      }

      navigate('/app?section=save-pay')
    } catch (err) {
      const msg = String(err?.shortMessage || err?.message || '')
      if (/user rejected|denied|ACTION_REJECTED/i.test(msg)) {
        setError('Transaction rejected in MetaMask')
      } else if (/insufficient funds/i.test(msg)) {
        setError('Insufficient funds for gas — fund your wallet with Sepolia ETH')
      } else {
        setError(msg || 'Could not set up automation')
      }
      setStatus(null)
    } finally {
      setSaving(false)
    }
  }

  const applyTemplate = (template) => {
    const next = template.apply()
    setTrigger(next.trigger)
    setAction(next.action)
    setError(null)
  }

  const savePayMeta = getCategoryMeta(RULE_CATEGORY.SAVE_PAY)
  const builderStep = !trigger ? 1 : !action ? 2 : showPreview ? 4 : 3

  return (
    <DashShell section="save-pay">
      <NetworkBanner />
      <RuleStepsHeader
        categoryId={RULE_CATEGORY.SAVE_PAY}
        activeStep={builderStep}
        title="New automation"
        subtitle="Compose a trigger and action, test the preview, then deploy to your Sepolia vault."
      />
      <div className="dash-header" style={{ marginTop: '1rem' }}>
        <div className="flex flex-wrap items-center gap-2">
          <EnvBadge
            env={{ label: savePayMeta.envLabel, tone: savePayMeta.envTone }}
          />
          <p className="text-[13px] text-muted">
            Step 4: {savePayMeta.deployLabel}
          </p>
        </div>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={requestSave}
          className="btn-primary"
        >
          {saving ? 'Confirm in MetaMask…' : savePayMeta.deployLabel}
        </button>
      </div>

      {status && (
        <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 font-mono text-[12px] text-ink-soft">
          {status}
        </p>
      )}
      {error && <p className="alert-error mb-4">{error}</p>}

      <div className="builder-templates mb-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          Templates
        </p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="builder-template-chip"
              onClick={() => applyTemplate(t)}
            >
              <span className="builder-template-title">{t.title}</span>
              <span className="builder-template-blurb">{t.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      {overwriteRules.length > 0 && draftKind ? (
        <p className="alert-warn mb-4" role="status">
          This vault has one on-chain {draftKind} slot. Deploying will replace the
          current {draftKind} rule and pause {overwriteRules.length} existing
          automation{overwriteRules.length === 1 ? '' : 's'} in your library.
        </p>
      ) : null}

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

      {showPreview && previewRule ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !saving && setShowPreview(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Preview automation"
          >
            <h3 className="text-[16px] font-semibold text-ink">Preview before deploy</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {describeAutomation(previewRule)}
            </p>
            <ul className="mt-4 space-y-2 text-[12px] text-muted">
              <li>
                · Real on-chain setup via MetaMask (not a simulation)
              </li>
              <li>
                · Spending per run is capped at the amount you configured
                {action?.amount || action?.percent
                  ? ` (${action.amount ? `${action.amount} tokens` : `${action.percent}%`})`
                  : ''}
              </li>
              <li>· Keeper executes only while the automation stays Active and funded</li>
              {overwriteRules.length > 0 ? (
                <li className="text-mango">
                  · Replaces the existing on-chain {draftKind} configuration
                </li>
              ) : null}
            </ul>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn-outline flex-1"
                disabled={saving}
                onClick={() => setShowPreview(false)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Confirm in MetaMask…' : 'Confirm & deploy'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashShell>
  )
}
