import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { DashShell } from '../components/DashShell'
import { NetworkBanner } from '../components/NetworkBanner'
import { PerpsSandbox } from '../components/PerpsSandbox'
import { EnvBadge, RuleStepsHeader } from '../components/RuleStepsHeader'
import { RuleFlowSummary } from '../components/RuleFlowSummary'
import { TradingStrategyForm } from '../components/TradingStrategyForm'
import { useWallet } from '../context/WalletContext'
import { getCachedVault, saveAutomation } from '../lib/automations'
import {
  RULE_CATEGORIES,
  RULE_CATEGORY,
  getCategoryMeta,
} from '../lib/ruleCategories'
import { getVaultAddress } from '../lib/vault'
import { Builder } from './Builder'

/**
 * Unified "New rule" entry: pick a category, then use the existing builder/form
 * for that type under a shared Trigger → Action → Test → Deploy header.
 */
export function NewRule() {
  const { address } = useWallet()
  const [params] = useSearchParams()
  const type = params.get('type')

  if (!address) {
    return <Navigate to="/app" replace />
  }

  if (!type || !RULE_CATEGORIES.some((c) => c.id === type)) {
    return <RuleCategoryPicker />
  }

  if (type === RULE_CATEGORY.SAVE_PAY) {
    return <Builder />
  }

  if (type === RULE_CATEGORY.SPOT) {
    return <SpotRuleCreate />
  }

  return <PerpsRuleCreate />
}

function RuleCategoryPicker() {
  return (
    <DashShell section="overview">
      <NetworkBanner />
      <div className="dash-header">
        <div>
          <h1 className="dash-title">New rule</h1>
          <p className="dash-subtitle">
            What do you want this rule to do? Every rule is a trigger plus an
            action — test before you deploy.
          </p>
        </div>
      </div>

      <div className="category-grid">
        {RULE_CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            to={cat.newPath}
            className="category-card"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
              {cat.shortLabel}
            </p>
            <h2>{cat.label}</h2>
            <p>{cat.blurb}</p>
            <div className="mt-4">
              <EnvBadge env={{ label: cat.envLabel, tone: cat.envTone }} />
            </div>
          </Link>
        ))}
      </div>
    </DashShell>
  )
}

function SpotRuleCreate() {
  const navigate = useNavigate()
  const { address } = useWallet()
  const meta = getCategoryMeta(RULE_CATEGORY.SPOT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async (config) => {
    setSaving(true)
    setError(null)
    try {
      const vaultAddr =
        getCachedVault(address) || (await getVaultAddress(address))
      const saved = await saveAutomation(address, {
        enabled: false,
        vaultAddress: vaultAddr,
        onchain: false,
        trigger: {
          type: 'screener',
          chainId: config.chainId,
          pairSource: config.pairSource === 'new' ? 'new' : 'volume',
          minVolume24h: config.minVolume24h,
          minHolders: config.minHolders,
          minLiquidityUsd: config.minLiquidityUsd,
          label: `GeckoTerminal ${config.chainId} · ${
            config.pairSource === 'new' ? 'new pairs' : 'top volume'
          }`,
        },
        action: {
          type: 'trading_strategy',
          buyEth: config.buyEth,
          takeProfits: config.takeProfits,
          stopLossPercent: config.stopLossPercent,
          positions: [],
          sandboxSession: null,
          lastScanAt: null,
          lastMatch: null,
        },
      })
      navigate(`/app?section=spot&launch=${encodeURIComponent(saved.id)}`)
    } catch (err) {
      setError(err?.message || 'Could not save strategy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashShell section="spot">
      <NetworkBanner />
      <RuleStepsHeader
        categoryId={RULE_CATEGORY.SPOT}
        activeStep={2}
        title="New spot strategy"
        subtitle="Set filters (trigger) and buy / TP / SL (action). Next you’ll test with paper funds."
      />
      <RuleFlowSummary
        triggerTitle="Filters"
        triggerBody={meta.triggerSummary}
        actionTitle="Trade"
        actionBody={meta.actionSummary}
        envBadge={<EnvBadge env={{ label: meta.envLabel, tone: meta.envTone }} />}
      />
      {error ? <p className="alert-error mt-4">{error}</p> : null}
      <div className="mt-6">
        <TradingStrategyForm
          saving={saving}
          onCancel={() => navigate('/app?section=spot')}
          onSave={(cfg) => void handleSave(cfg)}
        />
        <p className="mt-4 text-[12px] text-muted">
          After you save: <strong className="font-medium text-ink">Test with paper funds</strong>
          , then <strong className="font-medium text-ink">{meta.deployLabel}</strong>.
        </p>
      </div>
    </DashShell>
  )
}

function PerpsRuleCreate() {
  const navigate = useNavigate()
  const meta = getCategoryMeta(RULE_CATEGORY.PERPS)
  const activeStep = useMemo(() => 3, [])

  return (
    <DashShell section="perps">
      <NetworkBanner />
      <RuleStepsHeader
        categoryId={RULE_CATEGORY.PERPS}
        activeStep={activeStep}
        title="New perps strategy"
        subtitle="Backtest MA / RSI / volume signals here, then deploy the same strategy on Hyperliquid testnet."
      />
      <RuleFlowSummary
        triggerTitle="Signal"
        triggerBody={meta.triggerSummary}
        actionTitle="Deploy"
        actionBody={meta.actionSummary}
        envBadge={<EnvBadge env={{ label: meta.envLabel, tone: meta.envTone }} />}
      />
      <div className="mt-6">
        <PerpsSandbox
          onContinueToDeploy={(payload) => {
            try {
              sessionStorage.setItem(
                'pm.perps.deployDraft',
                JSON.stringify({
                  strategy: payload.strategy,
                  signal: payload.signal,
                  metrics: payload.result?.metrics || null,
                }),
              )
            } catch {
              /* ignore */
            }
            navigate('/app?section=perps&deploy=1')
          }}
        />
      </div>
    </DashShell>
  )
}
