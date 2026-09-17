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

function Metric({ label, value, valueClass = '' }) {
  return (
    <div className="rounded-xl border border-line bg-bg px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className={`mt-1 font-mono text-[1.05rem] font-semibold text-ink ${valueClass}`}>
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
  initialStrategyId = null,
  onClearPending,
  onDeploy,
  deploying = false,
}) {
  const pending = pendingStrategy ? strategyFromConfig(pendingStrategy) : null

  const options = useMemo(() => {
    const list = []
    if (pending) {
      list.push({ id: 'pending', label: 'Draft (unsaved)', strategy: pending })
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
  const metrics = useMemo(() => liveSessionMetrics(session), [session])
  const isLive = session?.status === 'running'
  const openPositions = session?.positions?.filter((p) => p.status === 'open') || []
  const closedPositions =
    session?.positions?.filter((p) => p.status === 'closed').slice(0, 12) || []

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
      setSession(next)
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
    setSession(next)
    sessionRef.current = next
    setBusy(true)
    try {
      let live = await liveScanAndEnter(next)
      live = await liveRefreshMarks(live)
      setSession(live)
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
    setSession((prev) => (prev ? stopLiveSession(prev) : prev))
  }

  const onClose = async (pos) => {
    setBusy(true)
    setError(null)
    try {
      let price = pos.lastPriceUsd
      const best = await getBestPair(pos.chainId, pos.tokenAddress)
      if (best?.priceUsd) price = best.priceUsd
      setSession((prev) => {
        if (!prev) return prev
        return liveClosePosition(prev, pos.id, price)
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
    Boolean(pending) ||
    (selected?.rule && selected.rule.enabled === false)

  const handleDeploy = () => {
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
          Create a screener strategy first — you’ll get options to paper-trade it here
          with mock funds against live prices, or deploy it live.
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
              New strategy ready
            </p>
            <p className="mt-1 text-[15px] font-semibold tracking-tight text-ink">
              Paper-trade live, then deploy when you’re happy
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
              {deploying ? 'Deploying…' : 'Deploy strategy'}
            </button>
          </div>
        </div>
      ) : null}

      <section className="automation-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">
              Live sandbox
            </h3>
            <p className="mt-1 text-[12px] text-muted">
              Mock ETH only — enter live Discover matches at current price, then manage
              TP / stop as DexScreener marks update.
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
                {deploying ? 'Deploying…' : 'Deploy'}
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
                Ready to go live with vault funds?
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={deploying}
                onClick={handleDeploy}
              >
                {deploying ? 'Deploying…' : 'Deploy strategy'}
              </button>
            </div>
          ) : null}

          <section>
            <div className="mb-3">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                Open paper positions
              </h3>
              <p className="mt-1 text-[12px] text-muted">
                Marks from DexScreener · exits fire when live price hits your TP / stop.
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
                      <th>Entry</th>
                      <th>Mark</th>
                      <th>Multiple</th>
                      <th>uPnL</th>
                      <th>Age</th>
                      <th>Exits</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.map((pos) => {
                      const mark = Number(pos.lastPriceUsd) || pos.entryPriceUsd
                      const multiple = mark / pos.entryPriceUsd
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
                            {formatUsdCompact(pos.entryPriceUsd)}
                          </td>
                          <td className="font-mono">{formatUsdCompact(mark)}</td>
                          <td className={`font-mono ${tone(multiple - 1)}`}>
                            {multiple.toFixed(2)}×
                          </td>
                          <td className={`font-mono ${tone(upnl)}`}>
                            {formatPnlEth(upnl)}
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
            <div className="grid gap-4 lg:grid-cols-2">
              {closedPositions.length > 0 ? (
                <section className="automation-card">
                  <h3 className="text-[14px] font-semibold text-ink">Closed</h3>
                  <ul className="mt-3 space-y-2">
                    {closedPositions.map((pos) => (
                      <li
                        key={pos.id}
                        className="flex items-center justify-between gap-3 text-[13px]"
                      >
                        <span className="text-ink">
                          {pos.symbol}{' '}
                          <span className="text-[11px] uppercase text-muted">
                            {pos.exitReason?.replace('_', ' ')}
                          </span>
                        </span>
                        <span className={`font-mono ${tone(pos.realizedPnlEth)}`}>
                          {formatPnlEth(pos.realizedPnlEth)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(session.trades || []).length > 0 ? (
                <section className="automation-card">
                  <h3 className="text-[14px] font-semibold text-ink">Activity</h3>
                  <ul className="mt-3 space-y-2">
                    {session.trades.slice(0, 12).map((t) => (
                      <li key={t.id} className="text-[12px]">
                        <span className="font-medium uppercase tracking-wide text-muted">
                          {t.type}
                        </span>{' '}
                        <span className="text-ink">{t.note}</span>
                        <span className="ml-2 font-mono text-muted">
                          {formatAge(t.at)}
                        </span>
                      </li>
                    ))}
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
        Test it live, or go live
      </h2>
      <p className="mt-2 text-[13px] text-muted">
        {describeStrategy(strategyFromConfig(strategy))}
      </p>
      <p className="mt-3 text-[13px] text-muted">
        Sandbox paper-trades live Discover matches with mock ETH — entries and exits
        use current DexScreener prices, not a historical backtest.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="flow-action" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn-outline" onClick={onTest}>
          Test in sandbox
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={deploying}
          onClick={onDeploy}
        >
          {deploying ? 'Deploying…' : 'Deploy strategy'}
        </button>
      </div>
    </div>
  )
}
