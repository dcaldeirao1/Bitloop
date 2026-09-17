import { useEffect, useState } from 'react'
import { truncateAddress } from '../lib/automations'
import {
  fetchNewPools,
  fetchTopPoolsByVolume,
  formatPriceChange,
  formatUsdCompact,
} from '../lib/geckoterminal'

function ageLabel(pairCreatedAt) {
  if (!pairCreatedAt) return '—'
  const ms = Date.now() - Number(pairCreatedAt)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${Math.max(1, m)}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return `${Math.floor(d / 30)}mo`
}

function ChangeCell({ value }) {
  const n = Number(value || 0)
  const tone = n > 0 ? 'text-teal' : n < 0 ? 'text-danger' : 'text-muted'
  return <span className={`font-mono ${tone}`}>{formatPriceChange(n)}</span>
}

function ChainBadge({ networkId, label, icon }) {
  const [broken, setBroken] = useState(false)
  return (
    <span
      className="inline-flex items-center justify-center"
      title={label || networkId}
    >
      {!broken && icon ? (
        <img
          src={icon}
          alt={label || networkId || 'chain'}
          className="h-5 w-5 rounded-full bg-bg object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bg text-[9px] font-semibold uppercase text-muted">
          {(label || networkId || '?').slice(0, 2)}
        </span>
      )}
    </span>
  )
}

function PairName({ token }) {
  const href = token.chartUrl || token.url
  const label = (
    <>
      {token.symbol}
      {token.quoteSymbol ? (
        <span className="text-muted"> / {token.quoteSymbol}</span>
      ) : null}
    </>
  )

  return (
    <div className="flex items-center gap-2">
      {token.icon ? (
        <img
          src={token.icon}
          alt=""
          className="h-6 w-6 rounded-full bg-bg object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg text-[10px] font-semibold text-muted">
          {token.symbol.slice(0, 2)}
        </span>
      )}
      <div className="min-w-0">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink hover:text-teal hover:underline"
            title="Open chart on Dexscreener"
          >
            {label}
          </a>
        ) : (
          <p className="font-medium text-ink">{label}</p>
        )}
        <p className="font-mono text-[11px] text-muted">
          {truncateAddress(token.tokenAddress, 4)} · {token.dexId}
        </p>
      </div>
    </div>
  )
}

function PairsTable({
  tokens,
  loading,
  emptyText,
  loadingText = 'Loading…',
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="token-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Pair</th>
            <th>Chain</th>
            <th>Price</th>
            <th>24h</th>
            <th>Volume 24h</th>
            <th>Liquidity</th>
            <th>MCap</th>
            <th>Txns</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={10} className="text-muted">
                {loadingText}
              </td>
            </tr>
          )}
          {!loading && tokens.length === 0 && (
            <tr>
              <td colSpan={10} className="text-muted">
                {emptyText}
              </td>
            </tr>
          )}
          {!loading &&
            tokens.map((t, i) => (
              <tr key={`${t.networkId}-${t.pairAddress}-${i}`}>
                <td className="font-mono text-muted">{i + 1}</td>
                <td>
                  <PairName token={t} />
                </td>
                <td>
                  <ChainBadge
                    networkId={t.networkId}
                    label={t.networkLabel}
                    icon={t.networkIcon}
                  />
                </td>
                <td className="font-mono">{formatUsdCompact(t.priceUsd)}</td>
                <td>
                  <ChangeCell value={t.priceChange24h} />
                </td>
                <td className="font-mono">{formatUsdCompact(t.volume24h)}</td>
                <td className="font-mono">{formatUsdCompact(t.liquidityUsd)}</td>
                <td className="font-mono">{formatUsdCompact(t.marketCap)}</td>
                <td className="font-mono text-muted">{t.txns24h || '—'}</td>
                <td className="font-mono text-muted">{ageLabel(t.pairCreatedAt)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Token discovery workspace — top volume + new pairs (GeckoTerminal).
 */
export function TradingDiscovery() {
  const [chainId, setChainId] = useState('all')
  const [topTokens, setTopTokens] = useState([])
  const [newTokens, setNewTokens] = useState([])
  const [loadingTop, setLoadingTop] = useState(true)
  const [loadingNew, setLoadingNew] = useState(true)
  const [errorTop, setErrorTop] = useState(null)
  const [errorNew, setErrorNew] = useState(null)

  const load = async () => {
    setLoadingTop(true)
    setLoadingNew(true)
    setErrorTop(null)
    setErrorNew(null)

    // New pairs first (1–2 light requests). Top-by-volume hits many networks
    // and was starving / rate-limiting the new-pairs call into an empty table.
    try {
      const list = await fetchNewPools({ chainId, limit: 40 })
      setNewTokens(list)
    } catch (err) {
      setNewTokens([])
      setErrorNew(err?.message || 'Could not load new pairs')
    } finally {
      setLoadingNew(false)
    }

    try {
      const list = await fetchTopPoolsByVolume({ chainId, limit: 40 })
      setTopTokens(list)
    } catch (err) {
      setTopTokens([])
      setErrorTop(err?.message || 'Could not load top pairs')
    } finally {
      setLoadingTop(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId])

  const loading = loadingTop || loadingNew

  return (
    <div className="animate-in">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-[12px] font-medium text-muted">
          Chain
          <select
            value={chainId}
            onChange={(e) => setChainId(e.target.value)}
            className="mt-1.5 block rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none"
          >
            <option value="all">All chains</option>
            <option value="ethereum">Ethereum</option>
            <option value="solana">Solana</option>
            <option value="bsc">BSC</option>
            <option value="base">Base</option>
            <option value="arbitrum">Arbitrum</option>
            <option value="polygon">Polygon</option>
            <option value="avalanche">Avalanche</option>
            <option value="optimism">Optimism</option>
            <option value="sui">Sui</option>
            <option value="ton">TON</option>
            <option value="tron">Tron</option>
            <option value="hyperevm">HyperEVM</option>
          </select>
        </label>
        <button
          type="button"
          className="btn-outline"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <section className="mb-8">
        <div className="mb-3">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">
            Top by volume
          </h3>
          <p className="mt-1 text-[12px] text-muted">
            {chainId === 'all'
              ? 'Highest 24h volume across chains · stables & majors filtered · GeckoTerminal'
              : 'Highest 24h volume · stables & majors filtered · GeckoTerminal'}
            {' · '}
            click a ticker for Dexscreener
          </p>
        </div>
        {errorTop && <p className="alert-error mb-3">{errorTop}</p>}
        <PairsTable
          tokens={topTokens}
          loading={loadingTop}
          loadingText="Loading top pairs…"
          emptyText="No pairs found."
        />
      </section>

      <section>
        <div className="mb-3">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">
            New pairs
          </h3>
          <p className="mt-1 text-[12px] text-muted">
            {chainId === 'all'
              ? 'Recently created pools across chains · GeckoTerminal'
              : 'Recently created pools · GeckoTerminal'}
            {' · '}
            click a ticker for Dexscreener
          </p>
        </div>
        {errorNew && <p className="alert-error mb-3">{errorNew}</p>}
        <PairsTable
          tokens={newTokens}
          loading={loadingNew}
          loadingText="Loading new pairs…"
          emptyText="No new pairs found."
        />
      </section>
    </div>
  )
}
