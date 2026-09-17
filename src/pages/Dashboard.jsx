import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ActivityList } from '../components/ActivityList'
import { AutomationCard } from '../components/AutomationFlow'
import { DashShell, normalizeSection } from '../components/DashShell'
import { ThemeToggle } from '../components/ThemeToggle'
import { TradingDiscovery } from '../components/TradingDiscovery'
import {
  StrategyLaunchPanel,
  TradingSandbox,
} from '../components/TradingSandbox'
import { TradingStrategyForm } from '../components/TradingStrategyForm'
import { VaultCommandCenter } from '../components/VaultCommandCenter'
import { WalletButton } from '../components/WalletButton'
import { useWallet } from '../context/WalletContext'
import {
  deleteAutomation,
  getCachedVault,
  listAutomations,
  saveAutomation,
  setCachedVault,
  truncateAddress,
  updateAutomation,
} from '../lib/automations'
import { getAutomationFunding } from '../lib/automationBlocks'
import { formatUsdCompact } from '../lib/dexscreener'
import { fetchFilteredStrategyMatches } from '../lib/strategyUniverse'
import { fetchVaultHistory } from '../lib/history'
import {
  getVaultAddress,
  getVaultBalances,
  getVaultScheduleState,
  SEPOLIA_USDC,
} from '../lib/vault'

function isDcaRule(rule) {
  const type = rule.action?.type
  return (
    type === 'dca_swap' ||
    type === 'swap_usdc_eth' ||
    type === 'buy_eth' ||
    type === 'buy_token' ||
    type === 'sell_eth_usdc' ||
    type === 'sell_token_eth'
  )
}

function isStrategyRule(rule) {
  return rule.action?.type === 'trading_strategy' || rule.trigger?.type === 'screener'
}

function isAutomationLibraryRule(rule) {
  return !isStrategyRule(rule)
}

function trimAmt(value, maxDecimals = 4) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '—')
  if (n === 0) return '0'
  return n.toFixed(maxDecimals).replace(/\.?0+$/, '')
}

export function Dashboard() {
  const { address, hasExtension, connecting, error, connect } = useWallet()
  const [params, setParams] = useSearchParams()
  const [rules, setRules] = useState([])
  const [loadingRules, setLoadingRules] = useState(false)
  const [vault, setVault] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [historyByRule, setHistoryByRule] = useState({})
  const [historyLoading, setHistoryLoading] = useState(null)
  const [section, setSection] = useState(() => normalizeSection(params.get('section')))
  const [trenchesTab, setTrenchesTab] = useState('discover')
  const [showStrategyForm, setShowStrategyForm] = useState(false)
  const [pendingStrategy, setPendingStrategy] = useState(null)
  const [showStrategyLaunch, setShowStrategyLaunch] = useState(false)
  const [sandboxFocusId, setSandboxFocusId] = useState(null)
  const [savingStrategy, setSavingStrategy] = useState(false)
  const [strategyMatches, setStrategyMatches] = useState({})
  const [matchesLoading, setMatchesLoading] = useState(null)
  const [balances, setBalances] = useState(null)
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [scheduleByVault, setScheduleByVault] = useState({})
  const [vaultActivity, setVaultActivity] = useState([])
  const [loadingActivity, setLoadingActivity] = useState(false)

  const refresh = useCallback(async () => {
    if (!address) {
      setRules([])
      return
    }
    setLoadingRules(true)
    setActionError(null)
    try {
      const items = await listAutomations(address)
      setRules(items)
    } catch (err) {
      setRules([])
      setActionError(err?.message || 'Could not load automations')
    } finally {
      setLoadingRules(false)
    }
  }, [address])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setSection(normalizeSection(params.get('section')))
  }, [params])

  useEffect(() => {
    if (!address) {
      setVault(null)
      setBalances(null)
      return
    }
    const cached = getCachedVault(address)
    if (cached) setVault(cached)

    getVaultAddress(address)
      .then((addr) => {
        if (addr) {
          setVault(addr)
          setCachedVault(address, addr)
        }
      })
      .catch(() => {})
  }, [address])

  useEffect(() => {
    if (!vault || !address) {
      setBalances(null)
      return
    }
    let cancelled = false
    setLoadingBalances(true)
    ;(async () => {
      try {
        const [b, schedule] = await Promise.all([
          getVaultBalances(vault, address),
          getVaultScheduleState(vault).catch(() => null),
        ])
        if (cancelled) return
        setBalances(b)
        if (schedule) {
          setScheduleByVault((prev) => ({ ...prev, [vault.toLowerCase()]: schedule }))
        }
      } catch {
        if (!cancelled) setBalances(null)
      } finally {
        if (!cancelled) setLoadingBalances(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vault, address])

  // Overview recent activity from the vault
  useEffect(() => {
    if (!vault || section !== 'overview') return
    let cancelled = false
    setLoadingActivity(true)
    fetchVaultHistory(vault, { token: SEPOLIA_USDC })
      .then((items) => {
        if (!cancelled) setVaultActivity(items)
      })
      .catch(() => {
        if (!cancelled) setVaultActivity([])
      })
      .finally(() => {
        if (!cancelled) setLoadingActivity(false)
      })
    return () => {
      cancelled = true
    }
  }, [vault, section])

  const counts = useMemo(() => {
    let automations = 0
    let trenches = 0
    for (const rule of rules) {
      if (isStrategyRule(rule)) trenches += 1
      else automations += 1
    }
    return { automations, trenches, perps: 0 }
  }, [rules])

  const enabledRules = useMemo(() => rules.filter((r) => r.enabled), [rules])
  const activeRules = useMemo(
    () =>
      enabledRules.filter((r) => !getAutomationFunding(r, balances).starved),
    [enabledRules, balances],
  )
  const activeCount = activeRules.length
  const overviewRules = useMemo(
    () =>
      [...enabledRules].sort((a, b) => {
        const aStarved = getAutomationFunding(a, balances).starved ? 1 : 0
        const bStarved = getAutomationFunding(b, balances).starved ? 1 : 0
        return aStarved - bStarved
      }),
    [enabledRules, balances],
  )

  const libraryRules = useMemo(
    () => rules.filter(isAutomationLibraryRule),
    [rules],
  )

  const strategyRules = useMemo(() => rules.filter(isStrategyRule), [rules])

  const sectionMeta = {
    overview: {
      title: 'Overview',
      blurb: 'Vault at the center. Money flows through connected automations.',
    },
    automations: {
      title: 'Automations',
      blurb: 'Your rule library — splits, schedules, and DCA.',
    },
    trenches: {
      title: 'Trenches',
      blurb: 'Discover tokens, run strategies, or paper-trade in the sandbox.',
    },
    perps: {
      title: 'Perps',
      blurb: 'Hyperliquid perpetuals automations — coming soon.',
    },
    settings: {
      title: 'Settings',
      blurb: 'Account, appearance, and vault.',
    },
  }

  const meta = sectionMeta[section] || sectionMeta.overview

  const loadHistory = useCallback(async (rule, { quiet = false } = {}) => {
    if (!rule.vaultAddress) return
    if (!quiet) setHistoryLoading(rule.id)
    try {
      const items = await fetchVaultHistory(rule.vaultAddress, {
        token: rule.trigger?.token || SEPOLIA_USDC,
        savingsAddress: rule.action?.to,
      })
      const focused =
        isDcaRule(rule)
          ? items.filter((i) => i.type === 'dca' || i.type === 'deposit')
          : rule.action?.type === 'send_amount' || rule.action?.type === 'send_token'
            ? items.filter((i) => i.type === 'recurring' || i.type === 'deposit')
            : items.filter((i) => i.type === 'split' || i.type === 'deposit')
      setHistoryByRule((prev) => ({ ...prev, [rule.id]: focused }))
    } catch (err) {
      if (!quiet) {
        setHistoryByRule((prev) => ({ ...prev, [rule.id]: [] }))
        const msg = String(err?.shortMessage || err?.message || '')
        if (!/coalesce|eth_getLogs|10 block/i.test(msg)) {
          setActionError(err.message || 'Could not load history')
        }
      }
    } finally {
      if (!quiet) setHistoryLoading(null)
    }
  }, [])

  const refreshSchedule = useCallback(async (vaultAddress) => {
    if (!vaultAddress) return
    try {
      const schedule = await getVaultScheduleState(vaultAddress)
      if (schedule) {
        setScheduleByVault((prev) => ({
          ...prev,
          [vaultAddress.toLowerCase()]: schedule,
        }))
      }
    } catch {
      /* ignore */
    }
  }, [])

  const toggleHistory = (rule) => {
    if (expandedId === rule.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(rule.id)
    void loadHistory(rule)
    void refreshSchedule(rule.vaultAddress)
  }

  useEffect(() => {
    if (!expandedId) return
    const rule = rules.find((r) => r.id === expandedId)
    if (!rule || isStrategyRule(rule)) return

    const tick = () => {
      void loadHistory(rule, { quiet: true })
      void refreshSchedule(rule.vaultAddress)
    }

    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [expandedId, rules, loadHistory, refreshSchedule])

  useEffect(() => {
    if (!vault) return
    const id = setInterval(() => {
      void refreshSchedule(vault)
    }, 30_000)
    return () => clearInterval(id)
  }, [vault, refreshSchedule])

  const copyVault = async () => {
    if (!vault) return
    await navigator.clipboard.writeText(vault)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toggleEnabled = async (rule) => {
    setBusyId(rule.id)
    setActionError(null)
    try {
      const enabled = !rule.enabled
      const updated = await updateAutomation(address, rule.id, { enabled })
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)))
    } catch (err) {
      setActionError(err?.shortMessage || err?.message || 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  const createStrategyDraft = (config) => {
    setPendingStrategy(config)
    setShowStrategyForm(false)
    setShowStrategyLaunch(true)
    setActionError(null)
  }

  const saveStrategy = async (config, { enabled = true } = {}) => {
    setSavingStrategy(true)
    setActionError(null)
    try {
      const vaultAddr = vault || (await getVaultAddress(address))
      const saved = await saveAutomation(address, {
        enabled,
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
          lastScanAt: null,
          lastMatch: null,
        },
      })
      setRules((prev) => [saved, ...prev])
      setPendingStrategy(null)
      setShowStrategyLaunch(false)
      setShowStrategyForm(false)
      setTrenchesTab(enabled ? 'strategies' : 'sandbox')
      return saved
    } catch (err) {
      setActionError(err?.message || 'Could not save strategy')
      return null
    } finally {
      setSavingStrategy(false)
    }
  }

  const deployPendingStrategy = async () => {
    if (!pendingStrategy) return
    await saveStrategy(pendingStrategy, { enabled: true })
  }

  const deploySandboxStrategy = async (config, rule) => {
    if (config) {
      await saveStrategy(config, { enabled: true })
      return
    }
    if (rule && !rule.enabled) {
      setBusyId(rule.id)
      setActionError(null)
      try {
        const updated = await updateAutomation(address, rule.id, { enabled: true })
        setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)))
        setTrenchesTab('strategies')
      } catch (err) {
        setActionError(err?.shortMessage || err?.message || 'Deploy failed')
      } finally {
        setBusyId(null)
      }
    }
  }

  const loadStrategyMatches = async (rule) => {
    setMatchesLoading(rule.id)
    try {
      const matches = await fetchFilteredStrategyMatches(
        {
          chainId: rule.trigger?.chainId || 'all',
          pairSource: rule.trigger?.pairSource,
          minVolume24h: rule.trigger?.minVolume24h || 0,
          minHolders: rule.trigger?.minHolders || 0,
          minLiquidityUsd: rule.trigger?.minLiquidityUsd || 0,
        },
        { limit: 5 },
      )
      setStrategyMatches((prev) => ({
        ...prev,
        [rule.id]: matches,
      }))
    } catch {
      setStrategyMatches((prev) => ({ ...prev, [rule.id]: [] }))
    } finally {
      setMatchesLoading(null)
    }
  }

  const onDelete = async (rule) => {
    setActionError(null)
    try {
      await deleteAutomation(address, rule.id)
      setRules((prev) => prev.filter((r) => r.id !== rule.id))
    } catch (err) {
      setActionError(err?.message || 'Delete failed')
    }
  }

  const selectSection = (id) => {
    const next = normalizeSection(id)
    setSection(next)
    setExpandedId(null)
    setShowStrategyForm(false)
    setParams(next === 'overview' ? {} : { section: next })
  }

  const selectRule = (rule) => {
    if (isStrategyRule(rule)) {
      if (expandedId === rule.id) {
        setExpandedId(null)
        return
      }
      setExpandedId(rule.id)
      if (!strategyMatches[rule.id]) void loadStrategyMatches(rule)
      return
    }
    toggleHistory(rule)
  }

  const timingFor = (rule) => {
    if (!rule.vaultAddress) return null
    return scheduleByVault[rule.vaultAddress.toLowerCase()] || null
  }

  const renderRuleCard = (rule, index, { forceExpanded = false } = {}) => {
    const expanded = forceExpanded || expandedId === rule.id
    return (
      <div
        key={rule.id}
        className="animate-in"
        style={{ animationDelay: `${Math.min(index, 6) * 0.04}s` }}
      >
        <AutomationCard
          rule={rule}
          busy={busyId === rule.id}
          expanded={expanded}
          onchainTiming={timingFor(rule)}
          balances={balances}
          expandLabel={isStrategyRule(rule) ? 'Matches' : 'History'}
          collapseLabel={forceExpanded ? 'Close' : 'Hide'}
          onToggleExpand={() => {
            if (forceExpanded) {
              setExpandedId(null)
              return
            }
            selectRule(rule)
          }}
          onToggleEnabled={() => void toggleEnabled(rule)}
          onDelete={() => void onDelete(rule)}
          onTestSandbox={
            isStrategyRule(rule)
              ? () => {
                  setPendingStrategy(null)
                  setShowStrategyLaunch(false)
                  setShowStrategyForm(false)
                  setSandboxFocusId(rule.id)
                  setSection('trenches')
                  setTrenchesTab('sandbox')
                  setParams({ section: 'trenches' })
                }
              : null
          }
        >
          {expanded ? (
            isStrategyRule(rule) ? (
              <>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  Live matches
                </p>
                {matchesLoading === rule.id ? (
                  <p className="text-[13px] text-muted">Scanning…</p>
                ) : (strategyMatches[rule.id] || []).length === 0 ? (
                  <p className="text-[13px] text-muted">No matches right now.</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                    {(strategyMatches[rule.id] || []).map((t, i) => (
                      <li
                        key={`${t.chainId}-${t.pairAddress || t.tokenAddress}-${i}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                      >
                        <div>
                          <p className="text-[13px] font-medium text-ink">{t.symbol}</p>
                          <p className="font-mono text-[11px] text-muted">
                            {truncateAddress(t.tokenAddress, 4)}
                          </p>
                        </div>
                        <div className="text-right font-mono text-[11px] text-muted">
                          <p>{formatUsdCompact(t.volume24h)} vol</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  Recent activity
                </p>
                {historyLoading === rule.id ? (
                  <p className="text-[13px] text-muted">Loading…</p>
                ) : (
                  <ActivityList
                    items={historyByRule[rule.id] || []}
                    limit={8}
                    emptyText="No matching transactions yet."
                  />
                )}
              </>
            )
          ) : null}
        </AutomationCard>
      </div>
    )
  }

  if (!address) {
    return (
      <DashShell>
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="w-full max-w-md text-center animate-in">
            <h1 className="dash-title">Connect your wallet</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Non-custodial vault automations. Keys stay in MetaMask.
            </p>
            {!hasExtension && (
              <p className="alert-error mt-5">
                MetaMask was not detected. Install the extension, then refresh.
              </p>
            )}
            {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
            <div className="mt-8 flex justify-center">
              <WalletButton onClick={() => void connect()} connecting={connecting} />
            </div>
          </div>
        </div>
      </DashShell>
    )
  }

  return (
    <DashShell
      section={section}
      onSelectSection={selectSection}
      autoCounts={counts}
    >
      {section === 'settings' ? (
        <SettingsPanel
          address={address}
          vault={vault}
          balances={balances}
          loadingBalances={loadingBalances}
          copied={copied}
          onCopy={() => void copyVault()}
        />
      ) : section === 'perps' ? (
        <SoonPanel
          title="Perps on Hyperliquid"
          body="Automate perpetual entries, exits, and risk rules on Hyperliquid. Spot trenches and vault automations are live today."
        />
      ) : (
        <>
          {section !== 'overview' && (
            <div className="dash-header">
              <div>
                <h1 className="dash-title">{meta.title}</h1>
                <p className="dash-subtitle">{meta.blurb}</p>
              </div>
              {section === 'automations' ? (
                <Link to="/app/new" className="btn-primary">
                  Create automation
                </Link>
              ) : section === 'trenches' &&
                trenchesTab !== 'sandbox' &&
                !showStrategyLaunch ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setTrenchesTab('strategies')
                    setShowStrategyLaunch(false)
                    setPendingStrategy(null)
                    setShowStrategyForm(true)
                  }}
                >
                  New strategy
                </button>
              ) : null}
            </div>
          )}

          {actionError && <p className="alert-error mb-4">{actionError}</p>}

          {section === 'overview' && (
            <>
              <VaultCommandCenter
                vault={vault}
                balances={balances}
                loadingBalances={loadingBalances}
                rules={rules}
                loadingRules={loadingRules}
                activeCount={activeCount}
                selectedId={expandedId}
                onSelectRule={selectRule}
              />

              {expandedId
                ? (() => {
                    const rule = rules.find((r) => r.id === expandedId)
                    if (!rule) return null
                    return (
                      <div className="os-section">
                        {renderRuleCard(rule, 0, { forceExpanded: true })}
                      </div>
                    )
                  })()
                : null}

              <div className="os-section">
                <div className="os-section-header">
                  <h3 className="os-section-title">Active automations</h3>
                  <span className="os-section-meta">
                    {activeCount} running · {rules.length} total
                  </span>
                </div>

                {loadingRules ? (
                  <div className="dash-empty text-[13px] text-muted">Loading…</div>
                ) : overviewRules.length === 0 ? (
                  <div className="dash-empty animate-in">
                    <p className="text-[15px] font-medium text-ink">Nothing running yet</p>
                    <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
                      Create a split, schedule, or DCA — it will appear here when live.
                    </p>
                    <Link to="/app/new" className="btn-primary mt-5 inline-flex">
                      Create automation
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {overviewRules
                      .filter((rule) => rule.id !== expandedId)
                      .map((rule, index) => renderRuleCard(rule, index))}
                  </div>
                )}
              </div>

              <div className="os-section">
                <div className="os-section-header">
                  <h3 className="os-section-title">Recent activity</h3>
                  <Link
                    to="/app/vault"
                    className="text-[12px] font-medium text-teal hover:underline"
                  >
                    Open vault →
                  </Link>
                </div>
                <div className="automation-card">
                  {loadingActivity ? (
                    <p className="text-[13px] text-muted">Loading…</p>
                  ) : (
                    <ActivityList
                      items={vaultActivity}
                      limit={10}
                      emptyText="No vault transactions yet."
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {section === 'automations' && (
            <div className="w-full space-y-3">
              <div className="dash-stats mb-4">
                <div className="dash-stat glass-panel">
                  <p className="dash-stat-label">Library</p>
                  <p className="dash-stat-value">{libraryRules.length}</p>
                </div>
                <div className="dash-stat glass-panel">
                  <p className="dash-stat-label">Active</p>
                  <p className="dash-stat-value">
                    {
                      libraryRules.filter(
                        (r) =>
                          r.enabled &&
                          !getAutomationFunding(r, balances).starved,
                      ).length
                    }{' '}
                    running
                  </p>
                </div>
                <div className="dash-stat glass-panel">
                  <p className="dash-stat-label">Vault</p>
                  <p className="dash-stat-value" style={{ fontSize: '0.95rem' }}>
                    {vault ? truncateAddress(vault, 3) : '—'}
                  </p>
                </div>
              </div>

              {loadingRules && (
                <div className="dash-empty text-[13px] text-muted">Loading…</div>
              )}

              {!loadingRules && libraryRules.length === 0 && (
                <div className="dash-empty animate-in">
                  <p className="text-[15px] font-medium text-ink">No automations yet</p>
                  <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
                    Build a split, scheduled transfer, or DCA into your vault.
                  </p>
                  <Link to="/app/new" className="btn-primary mt-5 inline-flex">
                    Create automation
                  </Link>
                </div>
              )}

              {!loadingRules &&
                libraryRules.map((rule, index) => renderRuleCard(rule, index))}
            </div>
          )}

          {section === 'trenches' && (
            <>
              <div className="dash-segment">
                {[
                  { id: 'discover', label: 'Discover' },
                  { id: 'strategies', label: 'Strategies' },
                  { id: 'sandbox', label: 'Sandbox' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setTrenchesTab(tab.id)
                      setShowStrategyForm(false)
                      setShowStrategyLaunch(false)
                      setExpandedId(null)
                    }}
                    className={trenchesTab === tab.id ? 'is-active' : ''}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {showStrategyForm && (
                <div className="mb-6 animate-in">
                  <TradingStrategyForm
                    saving={savingStrategy}
                    onCancel={() => setShowStrategyForm(false)}
                    onSave={(cfg) => createStrategyDraft(cfg)}
                  />
                </div>
              )}

              {showStrategyLaunch && pendingStrategy && (
                <div className="mb-6">
                  <StrategyLaunchPanel
                    strategy={pendingStrategy}
                    deploying={savingStrategy}
                    onBack={() => {
                      setShowStrategyLaunch(false)
                      setShowStrategyForm(true)
                    }}
                    onTest={() => {
                      setShowStrategyLaunch(false)
                      setTrenchesTab('sandbox')
                    }}
                    onDeploy={() => void deployPendingStrategy()}
                  />
                </div>
              )}

              {trenchesTab === 'discover' &&
                !showStrategyForm &&
                !showStrategyLaunch && <TradingDiscovery />}

              {trenchesTab === 'sandbox' &&
                !showStrategyForm &&
                !showStrategyLaunch && (
                  <TradingSandbox
                    strategyRules={strategyRules}
                    pendingStrategy={pendingStrategy}
                    initialStrategyId={sandboxFocusId}
                    deploying={savingStrategy || Boolean(busyId)}
                    onClearPending={() => setPendingStrategy(null)}
                    onDeploy={(cfg, rule) => void deploySandboxStrategy(cfg, rule)}
                  />
                )}

              {trenchesTab === 'strategies' &&
                !showStrategyForm &&
                !showStrategyLaunch && (
                <div className="w-full space-y-3">
                  {loadingRules && (
                    <div className="dash-empty text-[13px] text-muted">Loading…</div>
                  )}

                  {!loadingRules && strategyRules.length === 0 && (
                    <div className="dash-empty animate-in">
                      <p className="text-[15px] font-medium text-ink">
                        No screener strategies
                      </p>
                      <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
                        Set volume, liquidity, and risk rules — we’ll surface matching tokens.
                        Use New strategy above to get started.
                      </p>
                    </div>
                  )}

                  {!loadingRules &&
                    strategyRules.map((rule, index) => renderRuleCard(rule, index))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </DashShell>
  )
}

function SoonPanel({ title, body }) {
  return (
    <div className="dash-empty animate-in">
      <h1 className="dash-title">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">{body}</p>
    </div>
  )
}

function SettingsPanel({ address, vault, balances, loadingBalances, copied, onCopy }) {
  const usdc = loadingBalances
    ? '…'
    : balances
      ? trimAmt(balances.vaultUsdcFormatted)
      : '—'
  const eth = loadingBalances
    ? '…'
    : balances
      ? trimAmt(balances.vaultEthFormatted, 5)
      : '—'

  return (
    <div className="animate-in">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Settings</h1>
          <p className="dash-subtitle">Account, appearance, and vault.</p>
        </div>
      </div>
      <div className="space-y-3">
        <section className="automation-card">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Account
          </p>
          <p className="mt-2 font-mono text-[13px] text-ink">{address}</p>
        </section>

        <section className="automation-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Appearance
              </p>
              <p className="mt-1 text-[14px] text-ink">Light / dark</p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        <section className="automation-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Vault
            </p>
            <Link
              to="/app/vault"
              className="text-[12px] font-medium text-teal hover:underline"
            >
              Manage funds →
            </Link>
          </div>
          {vault ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="break-all font-mono text-[13px] text-ink">{vault}</code>
                <button
                  type="button"
                  onClick={onCopy}
                  className="btn-outline px-3 py-1.5 text-[12px]"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-3 text-[13px] text-muted">
                {usdc} USDC · {eth} ETH
              </p>
            </>
          ) : (
            <p className="mt-3 text-[14px] text-muted">No vault yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}
