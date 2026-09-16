import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { BlockPalette } from '../components/BlockPalette'
import { RuleCanvas } from '../components/RuleCanvas'
import { useWallet } from '../context/WalletContext'
import {
  isValidAddress,
  saveAutomation,
  setCachedVault,
} from '../lib/automations'
import {
  setupUsdcRecurringAutomation,
  setupUsdcSplitAutomation,
} from '../lib/vault'

export function Builder() {
  const { address } = useWallet()
  const navigate = useNavigate()
  const [trigger, setTrigger] = useState(null)
  const [action, setAction] = useState(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  const canSave = useMemo(() => {
    if (!trigger || !action || !isValidAddress(action.to)) return false

    if (trigger.type === 'receive_usdc' && action.type === 'send_percent') {
      return action.percent >= 1 && action.percent <= 100
    }

    if (trigger.type === 'every_interval' && action.type === 'send_amount') {
      const amount = Number(action.amount)
      return (
        Number.isFinite(amount) &&
        amount > 0 &&
        Number(trigger.every) >= 1 &&
        ['minutes', 'hours', 'days'].includes(trigger.unit)
      )
    }

    return false
  }, [trigger, action])

  if (!address) {
    return <Navigate to="/app" replace />
  }

  const addTrigger = (type) => {
    if (type === 'every_interval') {
      setTrigger({ type: 'every_interval', every: 1, unit: 'hours' })
      if (action && action.type !== 'send_amount') setAction(null)
      return
    }
    setTrigger({ type: 'receive_usdc' })
    if (action && action.type !== 'send_percent') setAction(null)
  }

  const addAction = (type) => {
    if (type === 'send_amount') {
      setAction({ type: 'send_amount', amount: '10', to: '' })
      if (trigger && trigger.type !== 'every_interval') setTrigger(null)
      return
    }
    setAction({ type: 'send_percent', percent: 20, to: '' })
    if (trigger && trigger.type !== 'receive_usdc') setTrigger(null)
  }

  const handleSave = async () => {
    if (!trigger || !action || !canSave) return
    setSaving(true)
    setError(null)
    setStatus('Confirm MetaMask: deploy/configure your vault…')
    try {
      if (trigger.type === 'every_interval') {
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
          trigger: {
            type: 'every_interval',
            interval: result.interval,
            intervalValue: result.intervalValue,
            intervalUnit: result.intervalUnit,
            label: `Every ${result.intervalValue} ${result.intervalUnit}`,
          },
          action: {
            type: 'send_amount',
            amount: result.amount,
            amountHuman: result.amountHuman,
            decimals: result.decimals,
            to: result.toAddress,
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
          },
          onchain: true,
        })
      }

      navigate('/app')
    } catch (err) {
      setError(err?.shortMessage || err?.message || 'Could not set up automation')
      setStatus(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              to="/app"
              className="text-[13px] font-medium text-muted hover:text-ink"
            >
              ← Back
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              New automation
            </h1>
            <p className="mt-1.5 max-w-lg text-[14px] text-muted">
              Split incoming USDC, or send a fixed amount on a schedule — even
              while you’re offline (keeper required).
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
        {error && (
          <p className="alert-error mb-4">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <BlockPalette
            hasTrigger={Boolean(trigger)}
            hasAction={Boolean(action)}
            triggerType={trigger?.type}
            onAddTrigger={addTrigger}
            onAddAction={addAction}
          />
          <RuleCanvas
            trigger={trigger}
            action={action}
            onClearTrigger={() => setTrigger(null)}
            onClearAction={() => setAction(null)}
            onTriggerChange={setTrigger}
            onActionChange={setAction}
          />
        </div>
      </main>
    </div>
  )
}
