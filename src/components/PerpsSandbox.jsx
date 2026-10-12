import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PERP_MARKETS,
  fetchPerpMarkets,
  filterPerpMarkets,
  formatUsd,
  hlErrorMessage,
} from '../lib/hyperliquid'
import {
  CANDLE_INTERVALS,
  DEFAULT_PERPS_STRATEGY,
  describePerpsStrategy,
  fetchCandles,
  formatTs,
  getLatestPerpsSignal,
  runPerpsBacktest,
} from '../lib/perpsSandbox'
import { PerpsBacktestChart } from './PerpsBacktestChart'

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

function EquitySpark({ equity }) {
  if (!equity?.length) return null
  const vals = equity.map((p) => p.equity)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const w = 320
  const h = 72
  const pts = vals
    .map((v, i) => {
      const x = (i / Math.max(vals.length - 1, 1)) * w
      const y = h - ((v - min) / span) * (h - 8) - 4
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const up = vals[vals.length - 1] >= vals[0]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" aria-hidden>
      <polyline
        fill="none"
        stroke={up ? 'var(--color-teal)' : 'var(--color-danger)'}
        strokeWidth="2"
        points={pts}
      />
    </svg>
  )
}

/**
 * Hyperliquid perps backtest — step 1 before deploying with real funds.
 * `onContinueToDeploy(payload)` receives { strategy, signal, result, market }.
 */
export function PerpsSandbox({
  markets: marketsProp = null,
  onContinueToDeploy = null,
}) {
  const [markets, setMarkets] = useState(marketsProp?.length ? marketsProp : PERP_MARKETS)
  const [form, setForm] = useState(() => ({ ...DEFAULT_PERPS_STRATEGY }))
  const [marketQuery, setMarketQuery] = useState('')
  const [marketOpen, setMarketOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [liveSignal, setLiveSignal] = useState(null)
  const marketBoxRef = useRef(null)

  useEffect(() => {
    if (marketsProp?.length) {
      setMarkets(marketsProp)
      return undefined
    }
    let cancelled = false
    fetchPerpMarkets()
      .then((list) => {
        if (!cancelled && list?.length) setMarkets(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [marketsProp])

  useEffect(() => {
    const onDoc = (e) => {
      if (!marketBoxRef.current?.contains(e.target)) setMarketOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const marketOptions = useMemo(
    () => filterPerpMarkets(markets, marketQuery, { limit: 20 }),
    [markets, marketQuery],
  )

  const market =
    markets.find((m) => m.coin === form.coin) ||
    PERP_MARKETS.find((m) => m.coin === form.coin) ||
    PERP_MARKETS[0]

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const selectMarket = (m) => {
    set('coin', m.coin)
    setMarketQuery('')
    setMarketOpen(false)
    const maxLev = Number(m.maxLeverage) || 1
    if (Number(form.leverage) > maxLev) set('leverage', maxLev)
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    setLiveSignal(null)
    try {
      const end = Date.now()
      const start = end - Math.max(1, Number(form.lookbackDays) || 30) * 24 * 60 * 60_000
      const candles = await fetchCandles({
        coin: form.coin,
        interval: form.interval,
        startTime: start,
        endTime: end,
      })
      if (candles.length < 30) {
        throw new Error(
          `Not enough candles (${candles.length}). Try a longer lookback or a higher timeframe.`,
        )
      }
      const report = runPerpsBacktest(candles, form)
      const signal = getLatestPerpsSignal(candles, form)
      setResult(report)
      setLiveSignal(signal)
    } catch (err) {
      setError(hlErrorMessage(err, 'Backtest failed'))
    } finally {
      setBusy(false)
    }
  }

  const continueToDeploy = () => {
    if (!result || !onContinueToDeploy) return
    const signal =
      liveSignal || getLatestPerpsSignal(result.candles, result.strategy || form)
    onContinueToDeploy({
      strategy: { ...form, ...(result.strategy || {}) },
      signal,
      result,
      market,
    })
  }

  const m = result?.metrics
  const pnlTone =
    m == null ? '' : m.totalPnl > 0 ? 'text-teal' : m.totalPnl < 0 ? 'text-danger' : ''

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">
          1. Backtest your strategy
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Tune MA / RSI / volume signals on Hyperliquid candles. Review results, then deploy
          the same parameters with real funds on Hyperliquid.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative text-sm" ref={marketBoxRef}>
            <span className="text-muted">Market</span>
            <button
              type="button"
              className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-line bg-bg px-3 py-2.5 text-left text-ink"
              onClick={() => setMarketOpen((o) => !o)}
            >
              <span className="font-medium">{market?.label || form.coin}</span>
              <span className="text-xs text-muted">max {market?.maxLeverage || '—'}×</span>
            </button>
            {marketOpen ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                <input
                  autoFocus
                  type="search"
                  className="w-full border-b border-line bg-bg px-3 py-2.5 text-ink outline-none"
                  placeholder="Search market…"
                  value={marketQuery}
                  onChange={(e) => setMarketQuery(e.target.value)}
                />
                <ul className="max-h-48 overflow-y-auto py-1">
                  {marketOptions.map((item) => (
                    <li key={item.coin}>
                      <button
                        type="button"
                        className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-bg"
                        onClick={() => selectMarket(item)}
                      >
                        <span>{item.coin}</span>
                        <span className="text-xs text-muted">{item.maxLeverage}×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className="text-muted">Interval</span>
            <select
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-ink"
              value={form.interval}
              onChange={(e) => set('interval', e.target.value)}
            >
              {CANDLE_INTERVALS.map((iv) => (
                <option key={iv.id} value={iv.id}>
                  {iv.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-muted">Lookback (days)</span>
            <input
              type="number"
              min="3"
              max="180"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-ink"
              value={form.lookbackDays}
              onChange={(e) => set('lookbackDays', Number(e.target.value))}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Bankroll (USDC)</span>
            <input
              type="number"
              min="100"
              step="100"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-ink"
              value={form.bankroll}
              onChange={(e) => set('bankroll', Number(e.target.value))}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Leverage</span>
            <input
              type="number"
              min="1"
              max={market?.maxLeverage || 40}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-ink"
              value={form.leverage}
              onChange={(e) => set('leverage', Number(e.target.value))}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Sides</span>
            <select
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-ink"
              value={form.sideMode}
              onChange={(e) => set('sideMode', e.target.value)}
            >
              <option value="both">Long & short</option>
              <option value="long">Long only</option>
              <option value="short">Short only</option>
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-4 border-t border-line pt-5 lg:grid-cols-3">
          <fieldset className="rounded-xl border border-line bg-bg p-4">
            <legend className="px-1 text-sm font-medium text-ink">Moving average</legend>
            <label className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={form.usePriceVsMa}
                onChange={(e) => set('usePriceVsMa', e.target.checked)}
              />
              Price crosses MA
            </label>
            <p className="mt-1 text-[11px] text-muted">
              Long on cross up · short on cross down
            </p>
            <label className="mt-2 block text-xs text-muted">
              Cross period
              <input
                type="number"
                min="2"
                className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink disabled:opacity-50"
                value={form.priceCrossMaPeriod}
                disabled={!form.usePriceVsMa}
                onChange={(e) => set('priceCrossMaPeriod', Number(e.target.value))}
              />
            </label>

            <label className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={form.usePriceAboveMa}
                onChange={(e) => set('usePriceAboveMa', e.target.checked)}
              />
              Price above / below MA
            </label>
            <p className="mt-1 text-[11px] text-muted">
              Long only above this MA · short only below it
            </p>
            <label className="mt-2 block text-xs text-muted">
              Trend period
              <input
                type="number"
                min="2"
                className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink disabled:opacity-50"
                value={form.priceAboveMaPeriod}
                disabled={!form.usePriceAboveMa}
                onChange={(e) => set('priceAboveMaPeriod', Number(e.target.value))}
              />
            </label>

            <label className="mt-3 block text-xs text-muted">
              MA type
              <select
                className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-ink disabled:opacity-50"
                value={form.maType}
                disabled={
                  !form.usePriceVsMa && !form.usePriceAboveMa && !form.useMaCross
                }
                onChange={(e) => set('maType', e.target.value)}
              >
                <option value="ema">EMA</option>
                <option value="sma">SMA</option>
              </select>
            </label>

            <label className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={form.useMaCross}
                onChange={(e) => set('useMaCross', e.target.checked)}
              />
              MA crossover
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Fast
                <input
                  type="number"
                  min="2"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink"
                  value={form.maFast}
                  disabled={!form.useMaCross}
                  onChange={(e) => set('maFast', Number(e.target.value))}
                />
              </label>
              <label className="text-xs text-muted">
                Slow
                <input
                  type="number"
                  min="3"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink"
                  value={form.maSlow}
                  disabled={!form.useMaCross}
                  onChange={(e) => set('maSlow', Number(e.target.value))}
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Optional: long on fast cross above slow; short on cross below.
            </p>
          </fieldset>

          <fieldset className="rounded-xl border border-line bg-bg p-4">
            <legend className="px-1 text-sm font-medium text-ink">RSI</legend>
            <label className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={form.useRsi}
                onChange={(e) => set('useRsi', e.target.checked)}
              />
              Use RSI filter
            </label>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-xs text-muted">
                Period
                <input
                  type="number"
                  min="2"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink"
                  value={form.rsiPeriod}
                  disabled={!form.useRsi}
                  onChange={(e) => set('rsiPeriod', Number(e.target.value))}
                />
              </label>
              <label className="text-xs text-muted">
                Long below
                <input
                  type="number"
                  min="1"
                  max="99"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink"
                  value={form.rsiLongBelow}
                  disabled={!form.useRsi}
                  onChange={(e) => set('rsiLongBelow', Number(e.target.value))}
                />
              </label>
              <label className="text-xs text-muted">
                Short above
                <input
                  type="number"
                  min="1"
                  max="99"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink"
                  value={form.rsiShortAbove}
                  disabled={!form.useRsi}
                  onChange={(e) => set('rsiShortAbove', Number(e.target.value))}
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Longs only if RSI &lt; X · shorts only if RSI &gt; Y
            </p>
          </fieldset>

          <fieldset className="rounded-xl border border-line bg-bg p-4">
            <legend className="px-1 text-sm font-medium text-ink">Volume</legend>
            <label className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={form.useVolume}
                onChange={(e) => set('useVolume', e.target.checked)}
              />
              Require volume spike
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Vol MA
                <input
                  type="number"
                  min="2"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink"
                  value={form.volumeMaPeriod}
                  disabled={!form.useVolume}
                  onChange={(e) => set('volumeMaPeriod', Number(e.target.value))}
                />
              </label>
              <label className="text-xs text-muted">
                Min × MA
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-ink"
                  value={form.volumeMult}
                  disabled={!form.useVolume}
                  onChange={(e) => set('volumeMult', Number(e.target.value))}
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Entry only when bar volume ≥ multiplier × average volume.
            </p>
          </fieldset>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="text-muted">Take profit %</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-ink"
              value={form.takeProfitPct}
              onChange={(e) => set('takeProfitPct', Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Stop loss %</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-ink"
              value={form.stopLossPct}
              onChange={(e) => set('stopLossPct', Number(e.target.value))}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy}
              onClick={() => void run()}
            >
              {busy ? 'Running backtest…' : 'Run backtest'}
            </button>
          </div>
        </div>

        <p className="mt-3 text-[12px] text-muted">{describePerpsStrategy(form)}</p>
      </section>

      {result ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Return"
              value={`${m.returnPct >= 0 ? '+' : ''}${m.returnPct.toFixed(2)}%`}
              valueClass={pnlTone}
            />
            <Metric
              label="Net PnL"
              value={formatUsd(m.totalPnl)}
              valueClass={pnlTone}
            />
            <Metric
              label="Win rate"
              value={`${m.winRate.toFixed(0)}% (${m.wins}/${m.trades})`}
            />
            <Metric label="Max drawdown" value={`${m.maxDrawdownPct.toFixed(1)}%`} />
          </div>

          <PerpsBacktestChart result={result} />

          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Equity curve</h3>
                <p className="text-[12px] text-muted">
                  {result.candleCount} candles · {formatTs(result.start)} →{' '}
                  {formatTs(result.end)} · final {formatUsd(m.finalEquity)}
                </p>
              </div>
              <p className="text-[12px] text-muted">
                Avg trade {formatUsd(m.avgPnl)} · PF{' '}
                {Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : '∞'}
              </p>
            </div>
            <div className="mt-3 rounded-xl border border-line bg-bg px-2 py-2">
              <EquitySpark equity={result.equity} />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold text-ink">Trades</h3>
            {result.trades.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No trades — loosen filters or try another market / timeframe.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-muted">
                      <th className="pb-2 font-medium">Side</th>
                      <th className="pb-2 font-medium">Entry</th>
                      <th className="pb-2 font-medium">Exit</th>
                      <th className="pb-2 font-medium">PnL</th>
                      <th className="pb-2 font-medium">ROE</th>
                      <th className="pb-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.trades].reverse().map((t, idx) => (
                      <tr key={`${t.entryTime}-${idx}`} className="border-b border-line/60">
                        <td className="py-2.5 font-medium capitalize text-ink">{t.side}</td>
                        <td className="py-2.5 font-mono text-xs">
                          {formatUsd(t.entry)}
                          <span className="mt-0.5 block text-muted">{formatTs(t.entryTime)}</span>
                        </td>
                        <td className="py-2.5 font-mono text-xs">
                          {formatUsd(t.exit)}
                          <span className="mt-0.5 block text-muted">{formatTs(t.exitTime)}</span>
                        </td>
                        <td
                          className={`py-2.5 font-mono ${
                            t.pnl > 0 ? 'text-teal' : t.pnl < 0 ? 'text-danger' : ''
                          }`}
                        >
                          {formatUsd(t.pnl)}
                        </td>
                        <td
                          className={`py-2.5 font-mono ${
                            t.pnlPct > 0 ? 'text-teal' : t.pnlPct < 0 ? 'text-danger' : ''
                          }`}
                        >
                          {t.pnlPct >= 0 ? '+' : ''}
                          {t.pnlPct.toFixed(1)}%
                        </td>
                        <td className="py-2.5 text-muted">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {onContinueToDeploy ? (
            <div className="rounded-2xl border border-teal/30 bg-teal/5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
                    Next step
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-ink">
                    2. Deploy on Hyperliquid
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Same market, leverage, and TP/SL as this backtest. Opens a live position
                    with your Hyperliquid balance (testnet when configured).
                  </p>
                  {liveSignal ? (
                    <p className="mt-2 text-[13px] text-ink-soft">
                      Deploy side:{' '}
                      <span className="font-semibold capitalize text-ink">
                        {liveSignal.side}
                      </span>
                      {' · '}
                      {liveSignal.reason}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!result.trades.length && !liveSignal?.side}
                  onClick={continueToDeploy}
                >
                  Deploy this strategy
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
