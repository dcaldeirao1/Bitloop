import { useEffect, useMemo, useRef, useState } from 'react'
import { truncateAddress } from '../lib/automations'
import { formatUsdCompact, getBestPair } from '../lib/dexscreener'
import {
  DEFAULT_BANKROLL_ETH,
  LIVE_POLL_MS,
  createLiveSession,
  describeStrategy,
  formatAge,
  formatEth,
  formatPct,
  formatPnlEth,
  liveClosePosition,
  liveRefreshMarks,
  liveScanAndEnter,
  liveSessionMetrics,
  loadSandboxSession,
  positionDisplayMultiple,
  positionExitPath,
  saveSandboxSession,
  stopLiveSession,
  strategyFromConfig,
  strategyFromRule,
} from '../lib/sandbox'

function tone(n) {
  const v = Number(n)
  if (v > 0) return 'text-teal'
  if (v < 0) return 'text-danger'
  return 'text-muted'
}

function sandboxTradeBadge(type) {
  if (type === 'buy') {
    return { label: 'Buy', className: 'bg-teal-soft text-teal-deep' }
  }
  if (type === 'tp') {
    return { label: 'TP', className: 'bg-teal-soft text-teal-deep' }
  }
  if (type === 'stop') {
    return { label: 'Stop', className: 'bg-bg text-danger' }
  }
  if (type === 'close') {
    return { label: 'Close', className: 'bg-mango-soft text-mango' }
  }
  return { label: type || 'Trade', className: 'bg-bg text-ink-soft' }
}

function Metric({ label, value, valueClass = '' }) {
  return (
    <div className="rounded-xl border border-line bg-bg px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-[1.05rem] font-semibold ${valueClass || 'text-ink'}`}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * Live paper-trading sandbox — enters on live matches, marks TP/SL on live prices.
 */
export function TradingSandbox({
  strategyRules = [],
  pendingStrategy = null,
  pendingRuleId = null,
  initialStrategyId = null,
  ownerKey = 'anon',
  onClearPending,
  onDeploy,
  onPersistSandbox = null,
  deploying = false,
}) {
  const pending = pendingStrategy ? strategyFromConfig(pendingStrategy) : null

  const options = useMemo(() => {
    const list = []
    if (pending) {
      list.push({ id: 'pending', label: 'Draft (saved)', strategy: pending })
    }
    for (const rule of strategyRules) {
      const s = strategyFromRule(rule)
      if (!s) continue
      list.push({
        id: rule.id,
        label: rule.enabled ? 'Live' : 'Paused',
        strategy: s,
        rule,
      })
    }
    return list
  }, [pending, strategyRules])

  const [selectedId, setSelectedId] = useState('')
  const [bankroll, setBankroll] = useState(String(DEFAULT_BANKROLL_ETH))
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const focusApplied = useRef(false)
  const sessionRef = useRef(null)
  sessionRef.current = session

  useEffect(() => {
    if (pending) {
      setSelectedId('pending')
      return
    }
    if (
      initialStrategyId &&
      !focusApplied.current &&
      options.some((o) => o.id === initialStrategyId)
    ) {
      focusApplied.current = true
      setSelectedId(initialStrategyId)
      return
    }
    if (!selectedId && options[0]) {
      setSelectedId(options[0].id)
      return
    }
    if (selectedId && !options.find((o) => o.id === selectedId)) {
      setSelectedId(options[0]?.id || '')
    }
  }, [pending, options, selectedId, initialStrategyId])

  useEffect(() => {
    focusApplied.current = false
  }, [initialStrategyId])

  const selected = options.find((o) => o.id === selectedId) || null
  const strategy = selected?.strategy || null
  const strategyKey =
    selectedId === 'pending'
      ? pendingRuleId || 'draft'
      : selectedId || pendingRuleId || 'draft'
  const metrics = useMemo(() => liveSessionMetrics(session), [session])
  const isLive = session?.status === 'running'
  const openPositions = session?.positions?.filter((p) => p.status === 'open') || []
  const closedPositions =
    session?.positions?.filter((p) => p.status === 'closed').slice(0, 12) || []

  const persist = (next) => {
    setSession(next)
    saveSandboxSession(ownerKey, strategyKey, next)
    if (onPersistSandbox && strategyKey && strategyKey !== 'draft') {
      void onPersistSandbox(strategyKey, next)
    }
  }

  // Restore saved sandbox for this strategy/wallet (local first, then DB)
  useEffect(() => {
    if (!strategyKey || strategyKey === 'draft') {
      setSession(null)
      return
    }
    const local = loadSandboxSession(ownerKey, strategyKey)
    if (local) {
      setSession(local)
      return
    }
    const rule = strategyRules.find((r) => r.id === strategyKey)
    const fromDb = rule?.action?.sandboxSession
    if (fromDb) {
      setSession(fromDb)
      saveSandboxSession(ownerKey, strategyKey, fromDb)
    } else {
      setSession(null)
    }
  }, [ownerKey, strategyKey, strategyRules])

  const tick = async ({ scan = false } = {}) => {
    const current = sessionRef.current
    if (!current || current.status !== 'running') return
    setBusy(true)
    setError(null)
    try {
      let next = current
      if (scan) {
        next = await liveScanAndEnter(next)
      }
      next = await liveRefreshMarks(next)
      persist(next)
      if (next.note) setError(next.note)
    } catch (err) {
      setError(err?.message || 'Live sandbox tick failed')
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    if (!strategy) {
      setError('Create or select a strategy first')
      return
    }
    setError(null)
    const next = createLiveSession(
      strategy,
      Number(bankroll) || DEFAULT_BANKROLL_ETH,
    )
    next.strategyId = strategyKey
    persist(next)
    sessionRef.current = next
    setBusy(true)
    try {
      let live = await liveScanAndEnter(next)
      live = await liveRefreshMarks(live)
      persist(live)
      if (live.note) setError(live.note)
      if (!live.positions.some((p) => p.status === 'open')) {
        setError(
          live.note ||
            'No live matches to enter yet — keep the test running; we’ll scan again shortly.',
        )
      }
    } catch (err) {
      setError(err?.message || 'Could not start live test')
    } finally {
      setBusy(false)
    }
  }

  const stop = () => {
    setSession((prev) => {
      if (!prev) return prev
      const next = stopLiveSession(prev)
      saveSandboxSession(ownerKey, strategyKey, next)
      if (onPersistSandbox && strategyKey && strategyKey !== 'draft') {
        void onPersistSandbox(strategyKey, next)
      }
      return next
    })
  }

  const onClose = async (pos) => {
    setBusy(true)
    setError(null)
    try {
      let quote = {
        priceUsd: pos.lastPriceUsd,
        marketCap: pos.lastMarketCap,
      }
      const best = await getBestPair(pos.chainId, pos.tokenAddress)
      if (best) {
        quote = {
          priceUsd: best.priceUsd || quote.priceUsd,
          marketCap: best.marketCap || quote.marketCap,
        }
      }
      setSession((prev) => {
        if (!prev) return prev
        const next = liveClosePosition(prev, pos.id, quote)
        saveSandboxSession(ownerKey, strategyKey, next)
        if (onPersistSandbox && strategyKey && strategyKey !== 'draft') {
          void onPersistSandbox(strategyKey, next)
        }
        return next
      })
    } catch (err) {
      setError(err?.message || 'Could not close position')
    } finally {
      setBusy(false)
    }
  }

  // Poll live marks + periodic rescan while running
  useEffect(() => {
    if (!isLive) return undefined
    const markId = setInterval(() => void tick({ scan: false }), LIVE_POLL_MS)
    const scanId = setInterval(() => void tick({ scan: true }), LIVE_POLL_MS * 4)
    return () => {
      clearInterval(markId)
      clearInterval(scanId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, session?.id])

  useEffect(() => {
    if (pending && strategy && !session) void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.chainId, pending?.buyEth, pending?.minVolume24h, pending?.pairSource])

  const canDeploy =
    Boolean(pendingRuleId) ||
    Boolean(pending) ||
    (selected?.rule && selected.rule.enabled === false)

  const handleDeploy = () => {
    if (pendingRuleId) {
      onDeploy?.(null, { id: pendingRuleId, enabled: false })
      return
    }
    if (pending) {
      onDeploy?.(pendingStrategy)
      return
    }
    if (selected?.rule) onDeploy?.(null, selected.rule)
  }

  if (!options.length) {
    return (
      <div className="dash-empty animate-in">
        <p className="text-[15px] font-medium text-ink">No strategies to test</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
          Create a spot strategy first — then test with paper funds against live
          prices, and run a live paper scan when ready.
        </p>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-5">
      {pending ? (
        <div className="sandbox-hero">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Test, then deploy
            </p>
            <p className="mt-1 text-[15px] font-semibold tracking-tight text-ink">
              Test with paper funds, then run live scan (paper)
            </p>
            <p className="mt-1 text-[12px] text-muted">{describeStrategy(pending)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onClearPending ? (
              <button type="button" className="flow-action" onClick={onClearPending}>
                Discard draft
              </button>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              disabled={deploying}
              onClick={handleDeploy}
            >
              {deploying ? 'Enabling…' : 'Run live scan (paper)'}
            </button>
          </div>
        </div>
      ) : null}

      <section className="automation-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">
              Test with paper funds
            </h3>
            <p className="mt-1 text-[12px] text-muted">
              Mock ETH only — paper positions at live DexScreener prices. Does not spend
              vault funds. Environment: Paper.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[12px] font-medium text-muted">
              Mock bankroll (ETH)
              <input
                type="number"
                min="0.1"
                step="any"
                value={bankroll}
                disabled={isLive}
                onChange={(e) => setBankroll(e.target.value)}
                className="mt-1.5 block w-28 rounded-xl border border-line bg-bg px-3 py-2 font-mono text-[13px] text-ink outline-none disabled:opacity-60"
              />
            </label>
            <label className="text-[12px] font-medium text-muted">
              Strategy
              <select
                value={selectedId}
                disabled={isLive}
                onChange={(e) => {
                  setSelectedId(e.target.value)
                  setSession(null)
                  setError(null)
                }}
                className="mt-1.5 block min-w-[14rem] rounded-xl border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none disabled:opacity-60"
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id === 'pending'
                      ? `Draft · ${o.strategy.pairSource === 'new' ? 'new pairs' : 'top volume'}`
                      : `${
                          o.strategy.chainId === 'all' ? 'all' : o.strategy.chainId
                        } · ${
                          o.strategy.pairSource === 'new' ? 'new' : 'volume'
                        } · ${o.strategy.buyEth} ETH (${o.label})`}
                  </option>
                ))}
              </select>
            </label>
            {!isLive ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !strategy}
                onClick={() => void start()}
              >
                {busy ? 'Starting…' : 'Start live test'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busy}
                  onClick={() => void tick({ scan: true })}
                >
                  {busy ? 'Updating…' : 'Scan now'}
                </button>
                <button type="button" className="flow-action is-danger" onClick={stop}>
                  Stop
                </button>
              </>
            )}
            {canDeploy && !pending ? (
              <button
                type="button"
                className="btn-primary"
                disabled={deploying}
                onClick={handleDeploy}
              >
                {deploying ? 'Enabling…' : 'Run live scan (paper)'}
              </button>
            ) : null}
          </div>
        </div>

        {strategy ? (
          <p className="mt-3 text-[12px] text-muted">{describeStrategy(strategy)}</p>
        ) : null}

        {isLive ? (
          <p className="mt-2 text-[12px] text-teal">
            Live · last mark {formatAge(session.lastMarkAt)} ago
            {session.lastScanAt ? ` · last scan ${formatAge(session.lastScanAt)} ago` : ''}
          </p>
        ) : null}
      </section>

      {error ? (
        <p
          className={
            session?.note === error
              ? 'rounded-xl border border-line bg-surface px-3 py-2 text-[12px] text-muted'
              : 'alert-error'
          }
        >
          {error}
        </p>
      ) : null}

      {session ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Equity"
              value={`${formatEth(metrics.endingEth)} ETH`}
            />
            <Metric
              label="Total PnL"
              value={formatPnlEth(metrics.totalPnlEth)}
              valueClass={tone(metrics.totalPnlEth)}
            />
            <Metric
              label="Max drawdown"
              value={`${Number(metrics.maxDrawdownPct).toFixed(1)}%`}
              valueClass={metrics.maxDrawdownPct > 0 ? 'text-danger' : 'text-muted'}
            />
            <Metric
              label="Open / closed"
              value={`${metrics.openCount} · ${metrics.closedCount}`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Cash" value={`${formatEth(metrics.cashEth)} ETH`} />
            <Metric
              label="Unrealized"
              value={formatPnlEth(metrics.unrealizedPnlEth)}
              valueClass={tone(metrics.unrealizedPnlEth)}
            />
            <Metric
              label="Realized"
              value={formatPnlEth(metrics.realizedPnlEth)}
              valueClass={tone(metrics.realizedPnlEth)}
            />
          </div>

          {pending && !isLive ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="text-[13px] text-muted">
                Enable keeper paper tracking (live prices, mock bankroll — not vault
                swaps)?
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={deploying}
                onClick={handleDeploy}
              >
                {deploying ? 'Enabling…' : 'Run live scan (paper)'}
              </button>
            </div>
          ) : null}

          <section>
            <div className="mb-3">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                Open paper positions
              </h3>
              <p className="mt-1 text-[12px] text-muted">
                Market caps from live DexScreener / GeckoTerminal · exits fire when
                mcap multiple hits your TP / stop.
              </p>
            </div>

            {openPositions.length === 0 ? (
              <div className="dash-empty !py-10">
                <p className="text-[14px] font-medium text-ink">No open positions</p>
                <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted">
                  {isLive
                    ? 'Waiting for the next live match scan…'
                    : 'Start a live test to paper-buy matching tokens.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="token-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Entry mcap</th>
                      <th>Mark mcap</th>
                      <th>Multiple</th>
                      <th>uPnL</th>
                      <th>Age</th>
                      <th>Exits</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.map((pos) => {
                      const multiple = positionDisplayMultiple(pos)
                      const remain =
                        pos.tokensInitial > 0
                          ? pos.tokensHeld / pos.tokensInitial
                          : 0
                      const basis = remain * pos.costEth
                      const markEth = basis * multiple
                      const upnl = markEth - basis
                      return (
                        <tr key={pos.id}>
                          <td>
                            <p className="font-medium text-ink">{pos.symbol}</p>
                            <p className="font-mono text-[11px] text-muted">
                              {truncateAddress(pos.tokenAddress, 4)} · {pos.chainId}
                            </p>
                          </td>
                          <td className="font-mono">
                            {pos.entryMarketCap > 0
                              ? formatUsdCompact(pos.entryMarketCap)
                              : '—'}
                          </td>
                          <td className="font-mono">
                            {pos.lastMarketCap > 0
                              ? formatUsdCompact(pos.lastMarketCap)
                              : '—'}
                          </td>
                          <td className="font-mono">
                            <span className={tone(multiple - 1)}>
                              {multiple.toFixed(2)}×
                            </span>
                          </td>
                          <td className="font-mono font-medium">
                            <span className={tone(upnl)}>{formatPnlEth(upnl)}</span>
                          </td>
                          <td className="font-mono text-muted">
                            {formatAge(pos.openedAt)}
                          </td>
                          <td className="font-mono text-[11px] text-muted">
                            {(pos.takeProfits || [])
                              .map((tp, i) => (tp.hit ? `TP${i + 1}✓` : `TP${i + 1}`))
                              .join(' · ')}
                            {` · SL −${pos.stopLossPercent}%`}
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {pos.url ? (
                                <a
                                  href={pos.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flow-action"
                                >
                                  Chart
                                </a>
                              ) : null}
                              <button
                                type="button"
                                className="flow-action"
                                disabled={busy}
                                onClick={() => void onClose(pos)}
                              >
                                Close
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(closedPositions.length > 0 || (session.trades || []).length > 0) && (
            <div className="space-y-4">
              {closedPositions.length > 0 ? (
                <section>
                  <div className="mb-3">
                    <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                      Closed positions
                    </h3>
                    <p className="mt-1 text-[12px] text-muted">
                      Fills use the live mark at poll time — not the exact TP / stop
                      trigger — so entry, exit mcap, and PnL are the real fill values.
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                    <table className="token-table">
                      <thead>
                        <tr>
                          <th>Token</th>
                          <th>Entry mcap</th>
                          <th>Exit mcap</th>
                          <th>Fill</th>
                          <th>Exact PnL</th>
                          <th>Exit path</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closedPositions.map((pos) => {
                          const exitMcap =
                            Number(pos.exitMarketCap) || Number(pos.lastMarketCap) || 0
                          const entryMcap = Number(pos.entryMarketCap) || 0
                          const fillMult =
                            Number(pos.exitMultiple) ||
                            (entryMcap > 0 && exitMcap > 0
                              ? exitMcap / entryMcap
                              : 0)
                          const pnl = Number(pos.realizedPnlEth) || 0
                          const pnlPct =
                            pos.costEth > 0 ? (pnl / pos.costEth) * 100 : 0
                          const path = positionExitPath(pos)
                          const tpHits = (pos.takeProfits || [])
                            .map((tp, i) =>
                              tp.hit ? `TP${i + 1}@${tp.multiple}×` : null,
                            )
                            .filter(Boolean)
                          return (
                            <tr key={pos.id}>
                              <td>
                                <p className="font-medium text-ink">{pos.symbol}</p>
                                <p className="font-mono text-[11px] text-muted">
                                  {truncateAddress(pos.tokenAddress, 4)} ·{' '}
                                  {formatAge(pos.closedAt)}
                                </p>
                              </td>
                              <td className="font-mono">
                                {entryMcap > 0 ? formatUsdCompact(entryMcap) : '—'}
                              </td>
                              <td className="font-mono">
                                {exitMcap > 0 ? formatUsdCompact(exitMcap) : '—'}
                              </td>
                              <td className="font-mono">
                                <span className={tone(fillMult - 1)}>
                                  {fillMult > 0 ? `${fillMult.toFixed(3)}×` : '—'}
                                </span>
                              </td>
                              <td className="font-mono font-medium">
                                <span className={tone(pnl)}>{formatPnlEth(pnl)}</span>
                                <span className="ml-1 text-muted">
                                  ({formatPct(pnlPct)})
                                </span>
                              </td>
                              <td>
                                <p className="font-mono text-[12px] font-medium text-ink">
                                  {path}
                                </p>
                                {tpHits.length > 0 ? (
                                  <p className="mt-0.5 font-mono text-[11px] text-teal">
                                    {tpHits.join(' · ')}
                                    {(pos.fills || []).length > 0
                                      ? ` · ${(pos.fills || [])
                                          .map((f) => formatPnlEth(f.pnlEth))
                                          .join(', ')}`
                                      : ''}
                                  </p>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {(session.trades || []).length > 0 ? (
                <section>
                  <div className="mb-3">
                    <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                      Activity
                    </h3>
                    <p className="mt-1 text-[12px] text-muted">
                      Paper fills from this sandbox session — buys, take-profits, and
                      stops.
                    </p>
                  </div>
                  <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                    {session.trades.slice(0, 20).map((t) => {
                      const badge = sandboxTradeBadge(t.type)
                      return (
                        <li
                          key={t.id}
                          className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                              <span className="text-[13px] font-medium text-ink">
                                {t.symbol || 'Trade'}
                              </span>
                              {t.targetMultiple != null ? (
                                <span className="font-mono text-[11px] text-muted">
                                  target {Number(t.targetMultiple).toFixed(2)}×
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[12px] text-muted">{t.note}</p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {formatAge(t.at)}
                              {t.multiple != null
                                ? ` · filled ${Number(t.multiple).toFixed(3)}×`
                                : ''}
                            </p>
                          </div>
                          <div className="text-right font-mono text-[13px]">
                            {t.amountEth != null ? (
                              <p className="text-ink">{formatEth(t.amountEth)} ETH</p>
                            ) : null}
                            {t.pnlEth != null ? (
                              <p className={`mt-0.5 ${tone(t.pnlEth)}`}>
                                {formatPnlEth(t.pnlEth)}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

/**
 * Shown right after creating a strategy — choose sandbox test or deploy.
 */
export function StrategyLaunchPanel({
  strategy,
  onTest,
  onDeploy,
  onBack,
  deploying = false,
}) {
  if (!strategy) return null
  return (
    <div className="automation-card animate-in">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        Strategy created
      </p>
      <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-ink">
        Test, then deploy
      </h2>
      <p className="mt-2 text-[13px] text-muted">
        {describeStrategy(strategyFromConfig(strategy))}
      </p>
      <p className="mt-3 text-[13px] text-muted">
        Paper test and live scan both use mock ETH with live DexScreener prices.
        They do not spend vault funds or open real on-chain swaps.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="flow-action" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn-outline" onClick={onTest}>
          Test with paper funds
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={deploying}
          onClick={onDeploy}
        >
          {deploying ? 'Enabling…' : 'Run live scan (paper)'}
        </button>
      </div>
    </div>
  )
}
