import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { truncateAddress } from '../lib/automations'
import { AGENT_PASSPHRASE_MIN } from '../lib/agentVault'
import {
  HL_APP_URL,
  HL_FAUCET_HINT,
  HL_IS_TESTNET,
  PERP_MARKETS,
  approveTradingAgent,
  clearAgentSession,
  closePositionMarket,
  estimateLiqPrice,
  fetchPerpMarkets,
  fetchPerpsAccount,
  filterPerpMarkets,
  formatSignedUsd,
  formatUsd,
  getAgentStatus,
  hlErrorMessage,
  isStopLossSafe,
  lockAgentSession,
  maxSafeStopLossPct,
  migrateAgentEncryption,
  parsePositions,
  placeOrderWithTpsl,
  stopLossPxFromPct,
  takeProfitPxFromPct,
  unlockAgentSession,
} from '../lib/hyperliquid'
import { PerpsSandbox } from './PerpsSandbox'

const POLL_MS = 8_000

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

function PassphraseFields({
  passphrase,
  confirm,
  onPassphrase,
  onConfirm,
  showConfirm = true,
  idPrefix = 'agent',
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="text-muted">Passphrase</span>
        <input
          id={`${idPrefix}-pass`}
          type="password"
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-ink"
          value={passphrase}
          onChange={(e) => onPassphrase(e.target.value)}
          placeholder={`At least ${AGENT_PASSPHRASE_MIN} characters`}
        />
      </label>
      {showConfirm ? (
        <label className="block text-sm">
          <span className="text-muted">Confirm passphrase</span>
          <input
            id={`${idPrefix}-confirm`}
            type="password"
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-ink"
            value={confirm}
            onChange={(e) => onConfirm(e.target.value)}
            placeholder="Repeat passphrase"
          />
        </label>
      ) : null}
    </div>
  )
}

/**
 * Hyperliquid perps desk — connect agent, search markets, long/short with TP/SL.
 */
export function PerpsDesk({ address }) {
  const [agent, setAgent] = useState(() => getAgentStatus(address))
  const [account, setAccount] = useState(null)
  const [markets, setMarkets] = useState(PERP_MARKETS)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [lastTrade, setLastTrade] = useState(null)

  const [passphrase, setPassphrase] = useState('')
  const [passConfirm, setPassConfirm] = useState('')
  const [unlockPass, setUnlockPass] = useState('')

  const [coin, setCoin] = useState('BTC')
  const [marketQuery, setMarketQuery] = useState('')
  const [marketOpen, setMarketOpen] = useState(false)
  const [side, setSide] = useState('long')
  const [marginUsd, setMarginUsd] = useState('25')
  const [leverage, setLeverage] = useState('10')
  const [tpPct, setTpPct] = useState('20')
  const [slPct, setSlPct] = useState('5')
  const [marginMode, setMarginMode] = useState('isolated')
  const [perpsTab, setPerpsTab] = useState('trade')
  const marketBoxRef = useRef(null)

  const refreshAgent = useCallback(() => {
    setAgent(getAgentStatus(address))
  }, [address])

  const refresh = useCallback(async () => {
    if (!address) {
      setAccount(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPerpsAccount(address)
      setAccount(data)
      refreshAgent()
    } catch (err) {
      setError(hlErrorMessage(err, 'Failed to load Hyperliquid account'))
    } finally {
      setLoading(false)
    }
  }, [address, refreshAgent])

  useEffect(() => {
    let cancelled = false
    fetchPerpMarkets()
      .then((list) => {
        if (!cancelled && list?.length) setMarkets(list)
      })
      .catch(() => {
        /* keep fallback PERP_MARKETS */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onDoc = (e) => {
      if (!marketBoxRef.current?.contains(e.target)) setMarketOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    setPassphrase('')
    setPassConfirm('')
    setUnlockPass('')
    refreshAgent()
    void refresh()
  }, [address, refresh, refreshAgent])

  useEffect(() => {
    if (!address) return undefined
    const id = setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [address, refresh])

  const marketOptions = useMemo(
    () => filterPerpMarkets(markets, marketQuery, { limit: 20 }),
    [markets, marketQuery],
  )

  const selectMarket = (m) => {
    setCoin(m.coin)
    setMarketQuery('')
    setMarketOpen(false)
    const maxLev = Number(m.maxLeverage) || 1
    if (Number(leverage) > maxLev) setLeverage(String(maxLev))
  }

  const onApprove = async () => {
    setBusy('approve')
    setError(null)
    try {
      const session = await approveTradingAgent(address, passphrase, passConfirm)
      setAgent(session)
      setPassphrase('')
      setPassConfirm('')
    } catch (err) {
      setError(hlErrorMessage(err, 'Agent approval failed'))
    } finally {
      setBusy(null)
    }
  }

  const onUnlock = async () => {
    setBusy('unlock')
    setError(null)
    try {
      const session = await unlockAgentSession(address, unlockPass)
      setAgent(session)
      setUnlockPass('')
    } catch (err) {
      setError(hlErrorMessage(err, 'Unlock failed'))
    } finally {
      setBusy(null)
    }
  }

  const onMigrate = async () => {
    setBusy('migrate')
    setError(null)
    try {
      const session = await migrateAgentEncryption(address, passphrase, passConfirm)
      setAgent(session)
      setPassphrase('')
      setPassConfirm('')
    } catch (err) {
      setError(hlErrorMessage(err, 'Encryption upgrade failed'))
    } finally {
      setBusy(null)
    }
  }

  const onLock = () => {
    lockAgentSession(address)
    refreshAgent()
  }

  const onDisconnectAgent = () => {
    clearAgentSession(address)
    setAgent(null)
    setPassphrase('')
    setPassConfirm('')
    setUnlockPass('')
  }

  const agentReady = Boolean(agent?.unlocked && !agent?.needsMigration)

  const onSubmitOrder = async () => {
    setBusy('order')
    setError(null)
    setLastTrade(null)
    try {
      const selected =
        markets.find((m) => m.coin === coin) ||
        PERP_MARKETS.find((m) => m.coin === coin)
      const result = await placeOrderWithTpsl({
        ownerAddress: address,
        coin,
        side,
        marginUsd,
        leverage,
        tpPct,
        slPct,
        isCross: marginMode === 'cross',
        maxLeverage: selected?.maxLeverage,
      })
      setLastTrade(result)
      await refresh()
    } catch (err) {
      setError(hlErrorMessage(err, 'Order failed'))
    } finally {
      setBusy(null)
    }
  }

  const onClose = async (position) => {
    const szi = Number(position.szi)
    setBusy(`close-${position.coin}`)
    setError(null)
    try {
      await closePositionMarket({
        ownerAddress: address,
        coin: position.coin,
        sizeAbs: Math.abs(szi),
        isLong: szi > 0,
      })
      await refresh()
    } catch (err) {
      setError(hlErrorMessage(err, 'Close failed'))
    } finally {
      setBusy(null)
    }
  }

  const state = account?.state
  const positions = parsePositions(state)
  const mids = account?.mids || {}
  const openOrders = account?.openOrders || []
  const market =
    markets.find((m) => m.coin === coin) ||
    PERP_MARKETS.find((m) => m.coin === coin) ||
    PERP_MARKETS[0]
  const mid = Number(mids[coin] ?? market?.mid) || 0
  const levNum = Math.max(1, Number(leverage) || 1)
  const marginNum = Number(marginUsd) || 0
  const tpNum = Number(tpPct) || 0
  const slNum = Number(slPct) || 0
  const estNotional = marginNum * levNum
  const estSize = mid > 0 && marginNum > 0 ? estNotional / mid : 0
  const accountValue = state?.marginSummary?.accountValue
  const withdrawable = state?.withdrawable
  const hasBalance = Number(accountValue) > 0 || Number(withdrawable) > 0

  const estLiq =
    mid > 0 && marginNum > 0
      ? estimateLiqPrice({
          entryPx: mid,
          size: estSize,
          marginUsd: marginNum,
          leverage: levNum,
          isCross: marginMode === 'cross',
          accountValue,
          maxLeverage: market.maxLeverage,
          side,
        })
      : null
  const maxSlPct =
    estLiq != null ? maxSafeStopLossPct(mid, estLiq, side) : null
  const tpPx = mid > 0 && tpNum > 0 ? takeProfitPxFromPct(mid, tpNum, side) : null
  const slPx = mid > 0 && slNum > 0 ? stopLossPxFromPct(mid, slNum, side) : null
  const slUnsafe =
    estLiq != null && slNum > 0 && !isStopLossSafe(mid, slNum, estLiq, side)
  const liqDropPct =
    estLiq != null && mid > 0
      ? (Math.abs(mid - estLiq) / mid) * 100
      : null

  const clampStopLoss = () => {
    if (maxSlPct == null || !(maxSlPct > 0)) return
    setSlPct(String(Math.floor(maxSlPct * 10) / 10))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="dash-title">Perps</h1>
            {HL_IS_TESTNET ? (
              <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
                Testnet
              </span>
            ) : null}
          </div>
          <p className="dash-subtitle mt-1 max-w-xl">
            Trade Hyperliquid perps with an encrypted agent, or backtest MA / RSI / volume
            strategies in the sandbox.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={HL_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-outline text-sm"
          >
            Open HL testnet
          </a>
          {perpsTab === 'trade' ? (
            <button type="button" className="btn-ghost text-sm" onClick={() => void refresh()}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="dash-segment">
        <button
          type="button"
          className={perpsTab === 'trade' ? 'is-active' : ''}
          onClick={() => setPerpsTab('trade')}
        >
          Trade
        </button>
        <button
          type="button"
          className={perpsTab === 'sandbox' ? 'is-active' : ''}
          onClick={() => setPerpsTab('sandbox')}
        >
          Sandbox
        </button>
      </div>

      {perpsTab === 'sandbox' ? (
        <PerpsSandbox markets={markets} />
      ) : (
      <>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* Account strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Account value" value={formatUsd(accountValue)} />
        <Metric label="Withdrawable" value={formatUsd(withdrawable)} />
        <Metric
          label="Open positions"
          value={String(positions.length)}
        />
        <Metric
          label={`${coin} mid`}
          value={mid > 0 ? formatUsd(mid, mid >= 1000 ? 0 : 2) : '—'}
        />
      </div>

      {!hasBalance && !loading ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
          {HL_FAUCET_HINT}{' '}
          <a
            href={HL_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Open testnet app
          </a>
        </div>
      ) : null}

      {/* Agent */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">Trading agent</h2>
            <p className="mt-1 max-w-lg text-sm text-muted">
              One MetaMask signature approves an API wallet that can trade but cannot withdraw.
              The agent private key is encrypted with your passphrase (AES-GCM) and only unlocked
              in memory for this tab.
            </p>
          </div>
          {agent ? (
            <div className="flex flex-wrap gap-2">
              {agent.unlocked && !agent.needsMigration ? (
                <button type="button" className="btn-ghost text-sm" onClick={onLock}>
                  Lock
                </button>
              ) : null}
              <button type="button" className="btn-ghost text-sm" onClick={onDisconnectAgent}>
                Forget agent
              </button>
            </div>
          ) : null}
        </div>

        {agent?.needsMigration ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              This agent was saved in plaintext from an earlier build. Set a passphrase to encrypt
              it before trading.
            </div>
            <PassphraseFields
              idPrefix="migrate"
              passphrase={passphrase}
              confirm={passConfirm}
              onPassphrase={setPassphrase}
              onConfirm={setPassConfirm}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={Boolean(busy)}
              onClick={() => void onMigrate()}
            >
              {busy === 'migrate' ? 'Encrypting…' : 'Encrypt agent key'}
            </button>
          </div>
        ) : agent?.unlocked ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg px-4 py-3">
            <span className="inline-flex h-2 w-2 rounded-full bg-teal" aria-hidden />
            <div>
              <p className="text-sm font-medium text-ink">Agent unlocked</p>
              <p className="font-mono text-xs text-muted">
                {truncateAddress(agent.address, 6)} · key held in memory only
              </p>
            </div>
          </div>
        ) : agent ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-line bg-bg px-4 py-3">
              <p className="text-sm font-medium text-ink">Agent locked</p>
              <p className="font-mono text-xs text-muted">{truncateAddress(agent.address, 6)}</p>
            </div>
            <label className="block max-w-sm text-sm">
              <span className="text-muted">Passphrase</span>
              <input
                type="password"
                autoComplete="current-password"
                className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-ink"
                value={unlockPass}
                onChange={(e) => setUnlockPass(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onUnlock()
                }}
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={Boolean(busy) || unlockPass.length < AGENT_PASSPHRASE_MIN}
              onClick={() => void onUnlock()}
            >
              {busy === 'unlock' ? 'Unlocking…' : 'Unlock agent'}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <PassphraseFields
              idPrefix="approve"
              passphrase={passphrase}
              confirm={passConfirm}
              onPassphrase={setPassphrase}
              onConfirm={setPassConfirm}
            />
            <p className="text-[12px] text-muted">
              Choose a strong passphrase you will remember — we cannot recover encrypted keys if
              you forget it (you can always approve a new agent).
            </p>
            <button
              type="button"
              className="btn-primary"
              disabled={Boolean(busy)}
              onClick={() => void onApprove()}
            >
              {busy === 'approve' ? 'Confirm in MetaMask…' : 'Approve trading agent'}
            </button>
          </div>
        )}
      </section>

      {/* Order ticket */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold tracking-tight text-ink">Trade with TP / SL</h2>
        <p className="mt-1 text-sm text-muted">
          Search any Hyperliquid perp, then open a long or short with linked take-profit and
          stop-loss.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
              side === 'long'
                ? 'border-teal bg-teal/10 text-teal'
                : 'border-line bg-bg text-muted hover:text-ink'
            }`}
            onClick={() => setSide('long')}
          >
            Long
          </button>
          <button
            type="button"
            className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
              side === 'short'
                ? 'border-danger bg-danger/10 text-danger'
                : 'border-line bg-bg text-muted hover:text-ink'
            }`}
            onClick={() => setSide('short')}
          >
            Short
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative block text-sm sm:col-span-2 lg:col-span-1" ref={marketBoxRef}>
            <span className="text-muted">Market</span>
            <button
              type="button"
              className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-line bg-bg px-3 py-2.5 text-left text-ink"
              onClick={() => setMarketOpen((o) => !o)}
            >
              <span className="font-medium">{market?.label || coin}</span>
              <span className="font-mono text-xs text-muted">
                {mid > 0 ? formatUsd(mid, mid >= 1000 ? 0 : 4) : '—'}
              </span>
            </button>
            {marketOpen ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                <input
                  autoFocus
                  type="search"
                  className="w-full border-b border-line bg-bg px-3 py-2.5 text-ink outline-none"
                  placeholder="Search BTC, SOL, HYPE…"
                  value={marketQuery}
                  onChange={(e) => setMarketQuery(e.target.value)}
                />
                <ul className="max-h-56 overflow-y-auto py-1">
                  {marketOptions.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted">No markets match.</li>
                  ) : (
                    marketOptions.map((m) => (
                      <li key={m.coin}>
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg ${
                            m.coin === coin ? 'bg-bg text-ink' : 'text-ink-soft'
                          }`}
                          onClick={() => selectMarket(m)}
                        >
                          <span className="font-medium">{m.coin}</span>
                          <span className="font-mono text-xs text-muted">
                            {m.maxLeverage}×
                            {m.mid
                              ? ` · ${formatUsd(m.mid, m.mid >= 1000 ? 0 : 4)}`
                              : ''}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
                  {markets.length} perps · type to filter
                </p>
              </div>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className="text-muted">Margin (USDC)</span>
            <input
              type="number"
              min="1"
              step="1"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-ink"
              value={marginUsd}
              onChange={(e) => setMarginUsd(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Leverage (max {market.maxLeverage}×)</span>
            <input
              type="number"
              min="1"
              max={market.maxLeverage}
              step="1"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-ink"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Take profit %</span>
            <input
              type="number"
              min="0.1"
              step="1"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-ink"
              value={tpPct}
              onChange={(e) => setTpPct(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Stop loss %</span>
            <input
              type="number"
              min="0.1"
              max={maxSlPct != null && maxSlPct > 0 ? maxSlPct : undefined}
              step="0.1"
              className={`mt-1.5 w-full rounded-xl border bg-bg px-3 py-2.5 font-mono text-ink ${
                slUnsafe ? 'border-danger' : 'border-line'
              }`}
              value={slPct}
              onChange={(e) => setSlPct(e.target.value)}
            />
            {maxSlPct != null && maxSlPct > 0 ? (
              <span className="mt-1 block text-[11px] text-muted">
                Max safe ~{maxSlPct.toFixed(1)}% (
                {side === 'short' ? 'below' : 'above'} liq)
              </span>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="text-muted">Margin mode</span>
            <select
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-ink"
              value={marginMode}
              onChange={(e) => setMarginMode(e.target.value)}
            >
              <option value="cross">Cross</option>
              <option value="isolated">Isolated</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
          <span>
            Est. size{' '}
            <span className="font-mono text-ink">
              {estSize > 0 ? estSize.toPrecision(4) : '—'} {coin}
            </span>
          </span>
          <span>
            Notional{' '}
            <span className="font-mono text-ink">{formatUsd(estNotional)}</span>
          </span>
          {mid > 0 ? (
            <>
              <span>
                TP ~{' '}
                <span className="font-mono text-ink">
                  {tpPx != null ? formatUsd(tpPx) : '—'}
                </span>
              </span>
              <span>
                SL ~{' '}
                <span className={`font-mono ${slUnsafe ? 'text-danger' : 'text-ink'}`}>
                  {slPx != null ? formatUsd(slPx) : '—'}
                </span>
              </span>
              <span>
                Est. liq ~{' '}
                <span className="font-mono text-ink">
                  {estLiq != null ? formatUsd(estLiq) : '—'}
                </span>
                {liqDropPct != null ? (
                  <span className="text-muted">
                    {' '}
                    ({side === 'short' ? '+' : '−'}
                    {liqDropPct.toFixed(1)}%)
                  </span>
                ) : null}
              </span>
            </>
          ) : null}
        </div>

        {marginMode === 'cross' && Number(accountValue) > marginNum ? (
          <p className="mt-2 text-[12px] text-muted">
            Cross liquidation uses full account equity ({formatUsd(accountValue)}), so
            estimated liq is further than isolated at the same leverage.
          </p>
        ) : null}

        {slUnsafe ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
            <span>
              Stop-loss crosses estimated liquidation. Adjust SL %, or reduce leverage.
            </span>
            {maxSlPct != null && maxSlPct > 0 ? (
              <button
                type="button"
                className="btn-outline px-3 py-1 text-xs text-ink"
                onClick={clampStopLoss}
              >
                Use {maxSlPct.toFixed(1)}% SL
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className="btn-primary mt-5"
          disabled={!agentReady || Boolean(busy) || slUnsafe}
          onClick={() => void onSubmitOrder()}
        >
          {busy === 'order'
            ? 'Submitting…'
            : !agent
              ? 'Approve agent to trade'
              : agent.needsMigration
                ? 'Encrypt agent to trade'
                : !agent.unlocked
                  ? 'Unlock agent to trade'
                  : slUnsafe
                    ? 'Fix stop-loss to continue'
                    : `${side === 'short' ? 'Short' : 'Long'} ${coin} ${levNum}×`}
        </button>

        {lastTrade ? (
          <p className="mt-3 text-sm text-teal">
            {lastTrade.side === 'short' ? 'Short' : 'Long'} filled {lastTrade.filledSize}{' '}
            {lastTrade.coin} @ {formatUsd(lastTrade.entryPx)} · TP{' '}
            {formatUsd(lastTrade.tpTrigger)} · SL {formatUsd(lastTrade.slTrigger)}
          </p>
        ) : null}
      </section>

      {/* Positions */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold tracking-tight text-ink">Positions</h2>
        {positions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No open positions.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-muted">
                  <th className="pb-2 font-medium">Coin</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">Entry</th>
                  <th className="pb-2 font-medium">Liq</th>
                  <th className="pb-2 font-medium">uPnL</th>
                  <th className="pb-2 font-medium">Lev</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const szi = Number(p.szi)
                  const pnl = Number(p.unrealizedPnl)
                  return (
                    <tr key={p.coin} className="border-b border-line/60">
                      <td className="py-3 font-medium text-ink">{p.coin}</td>
                      <td className="py-3 font-mono text-ink">
                        {szi > 0 ? '+' : ''}
                        {p.szi}
                      </td>
                      <td className="py-3 font-mono">{formatUsd(p.entryPx)}</td>
                      <td className="py-3 font-mono text-muted">
                        {p.liquidationPx != null ? formatUsd(p.liquidationPx) : '—'}
                      </td>
                      <td
                        className={`py-3 font-mono ${
                          pnl > 0 ? 'text-teal' : pnl < 0 ? 'text-danger' : ''
                        }`}
                      >
                        {formatSignedUsd(p.unrealizedPnl)}
                      </td>
                      <td className="py-3 font-mono">
                        {p.leverage?.value ?? '—'}× {p.leverage?.type || ''}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          className="btn-outline px-3 py-1.5 text-xs"
                          disabled={!agentReady || Boolean(busy)}
                          onClick={() => void onClose(p)}
                        >
                          {busy === `close-${p.coin}` ? 'Closing…' : 'Close'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Open orders */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold tracking-tight text-ink">Open orders</h2>
        {openOrders.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No resting orders (TP/SL triggers may appear here).</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {openOrders.map((o) => (
              <li
                key={`${o.oid}-${o.coin}-${o.timestamp || o.limitPx}`}
                className="flex flex-wrap justify-between gap-2 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm"
              >
                <span className="font-medium text-ink">
                  {o.coin} {o.side === 'B' || o.side === 'Buy' ? 'Buy' : 'Sell'} {o.sz}
                </span>
                <span className="font-mono text-muted">
                  {o.orderType || 'limit'} @ {o.limitPx || o.triggerPx || '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}
    </div>
  )
}
