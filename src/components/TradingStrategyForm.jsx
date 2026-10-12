import { useEffect, useMemo, useState } from 'react'
import {
  formatUsdCompact,
  getHoldersCount,
  matchesEntryFilters,
  searchPairs,
} from '../lib/dexscreener'
import {
  PAIR_SOURCES,
  fetchFilteredStrategyMatches,
} from '../lib/strategyUniverse'

const CHAINS = [
  { id: 'all', label: 'All chains' },
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'base', label: 'Base' },
  { id: 'bsc', label: 'BSC' },
  { id: 'arbitrum', label: 'Arbitrum' },
]

const DEFAULT_FORM = {
  chainId: 'all',
  pairSource: 'volume',
  minVolume24h: '1000000',
  minHolders: '1000',
  minLiquidityUsd: '25000',
  buyEth: '0.1',
  tp1Multiple: '2',
  tp1SellPercent: '50',
  tp2Multiple: '4',
  tp2SellPercent: '100',
  stopLossPercent: '50',
}

export function TradingStrategyForm({ onSave, onCancel, saving }) {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [preview, setPreview] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [search, setSearch] = useState('')

  const filters = useMemo(
    () => ({
      minVolume24h: Number(form.minVolume24h) || 0,
      minHolders: Number(form.minHolders) || 0,
      minLiquidityUsd: Number(form.minLiquidityUsd) || 0,
    }),
    [form],
  )

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const canSave =
    Number(form.buyEth) > 0 &&
    Number(form.tp1Multiple) > 1 &&
    Number(form.tp2Multiple) > Number(form.tp1Multiple) &&
    Number(form.stopLossPercent) > 0 &&
    Number(form.stopLossPercent) < 100

  const runPreview = async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      let tokens
      if (search.trim()) {
        const pairs = await searchPairs(search.trim())
        tokens = pairs.filter(
          (p) => form.chainId === 'all' || p.chainId === form.chainId,
        )
        const top = tokens.slice(0, 12)
        const withHolders = await Promise.all(
          top.map(async (t) => {
            const holders = await getHoldersCount(t.tokenAddress, t.chainId)
            return { ...t, holders }
          }),
        )
        setPreview(
          withHolders
            .filter((t) => matchesEntryFilters(t, filters))
            .sort((a, b) => b.volume24h - a.volume24h)
            .slice(0, 8),
        )
      } else {
        const matches = await fetchFilteredStrategyMatches(
          {
            chainId: form.chainId,
            pairSource: form.pairSource,
            ...filters,
          },
          { limit: 8 },
        )
        setPreview(matches)
      }
    } catch (err) {
      setPreview([])
      setPreviewError(err?.message || 'Could not load pair universe')
    } finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => {
    void runPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.chainId, form.pairSource])

  const handleSave = () => {
    if (!canSave) return
    onSave({
      chainId: form.chainId,
      pairSource: form.pairSource === 'new' ? 'new' : 'volume',
      minVolume24h: Number(form.minVolume24h) || 0,
      minHolders: Number(form.minHolders) || 0,
      minLiquidityUsd: Number(form.minLiquidityUsd) || 0,
      buyEth: String(form.buyEth),
      takeProfits: [
        {
          multiple: Number(form.tp1Multiple),
          sellPercent: Number(form.tp1SellPercent),
        },
        {
          multiple: Number(form.tp2Multiple),
          sellPercent: Number(form.tp2SellPercent),
        },
      ],
      stopLossPercent: Number(form.stopLossPercent),
    })
  }

  return (
    <div className="automation-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight text-ink">
            New spot strategy
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Pick a Discover list, scan filters, then buy → take profits → stop.
            Live preview uses that same universe.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="flow-action">
          Cancel
        </button>
      </div>

      <div className="mt-5">
        <p className="text-[12px] font-medium text-muted">Trade universe</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {PAIR_SOURCES.map((source) => {
            const active = form.pairSource === source.id
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => set('pairSource', source.id)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? 'border-teal bg-bg'
                    : 'border-line bg-surface hover:border-line-strong'
                }`}
              >
                <p className="text-[13px] font-semibold text-ink">{source.label}</p>
                <p className="mt-1 text-[11px] text-muted">{source.hint}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-[12px] font-medium text-muted">
          Chain
          <select
            value={form.chainId}
            onChange={(e) => set('chainId', e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[14px] text-ink outline-none focus:border-ink"
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[12px] font-medium text-muted">
          Buy size (ETH)
          <input
            type="number"
            min="0"
            step="any"
            value={form.buyEth}
            onChange={(e) => set('buyEth', e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink"
          />
        </label>

        <label className="block text-[12px] font-medium text-muted">
          Min 24h volume (USD)
          <input
            type="number"
            min="0"
            value={form.minVolume24h}
            onChange={(e) => set('minVolume24h', e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink"
          />
        </label>

        <label className="block text-[12px] font-medium text-muted">
          Min holders
          <input
            type="number"
            min="0"
            value={form.minHolders}
            onChange={(e) => set('minHolders', e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink"
          />
          <span className="mt-1 block text-[11px] font-normal text-muted">
            Ethereum via Ethplorer; other chains skip this check if unavailable.
          </span>
        </label>

        <label className="block text-[12px] font-medium text-muted sm:col-span-2">
          Min liquidity (USD)
          <input
            type="number"
            min="0"
            value={form.minLiquidityUsd}
            onChange={(e) => set('minLiquidityUsd', e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Take profit 1
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min="1.1"
              step="0.1"
              value={form.tp1Multiple}
              onChange={(e) => set('tp1Multiple', e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-[13px] outline-none"
              aria-label="TP1 multiple"
            />
            <span className="self-center text-[12px] text-muted">×</span>
            <input
              type="number"
              min="1"
              max="100"
              value={form.tp1SellPercent}
              onChange={(e) => set('tp1SellPercent', e.target.value)}
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-[13px] outline-none"
              aria-label="TP1 sell percent"
            />
            <span className="self-center text-[12px] text-muted">%</span>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Take profit 2
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min="1.1"
              step="0.1"
              value={form.tp2Multiple}
              onChange={(e) => set('tp2Multiple', e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-[13px] outline-none"
              aria-label="TP2 multiple"
            />
            <span className="self-center text-[12px] text-muted">×</span>
            <input
              type="number"
              min="1"
              max="100"
              value={form.tp2SellPercent}
              onChange={(e) => set('tp2SellPercent', e.target.value)}
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-[13px] outline-none"
              aria-label="TP2 sell percent"
            />
            <span className="self-center text-[12px] text-muted">%</span>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Stop loss
          </p>
          <div className="mt-2 flex gap-2">
            <span className="self-center text-[12px] text-muted">−</span>
            <input
              type="number"
              min="1"
              max="99"
              value={form.stopLossPercent}
              onChange={(e) => set('stopLossPercent', e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-[13px] outline-none"
              aria-label="Stop loss percent"
            />
            <span className="self-center text-[12px] text-muted">%</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1 text-[12px] font-medium text-muted">
          Preview search (optional)
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="PEPE, token address…"
            className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2 text-[14px] text-ink outline-none focus:border-ink"
          />
        </label>
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={previewLoading}
          className="btn-outline"
        >
          {previewLoading ? 'Scanning…' : 'Refresh matches'}
        </button>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={handleSave}
          className="btn-primary"
        >
          {saving ? 'Creating…' : 'Create strategy'}
        </button>
      </div>

      {previewError && <p className="alert-error mt-4">{previewError}</p>}

      <div className="mt-5">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
          Live matches ·{' '}
          {form.pairSource === 'new' ? 'New pairs' : 'Top by volume'} · GeckoTerminal
        </p>
        {!previewLoading && preview.length === 0 && (
          <p className="mt-3 text-[13px] text-muted">
            No tokens match these filters right now. Loosen volume/holders or try
            another chain.
          </p>
        )}
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {preview.map((t, i) => (
            <li
              key={`${t.chainId}-${t.pairAddress || t.tokenAddress}-${i}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">
                  {t.symbol}{' '}
                  <span className="font-normal text-muted">{t.name}</span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted">
                  {t.tokenAddress.slice(0, 10)}… · {t.dexId}
                </p>
              </div>
              <div className="text-right font-mono text-[12px] text-ink-soft">
                <p>{formatUsdCompact(t.volume24h)} vol</p>
                <p className="text-muted">
                  {formatUsdCompact(t.liquidityUsd)} liq
                  {t.holders != null ? ` · ${t.holders.toLocaleString()} holders` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function describeTradingStrategy(rule) {
  const a = rule.action || {}
  const t = rule.trigger || {}
  const vol = formatUsdCompact(t.minVolume24h || 0)
  const buy = a.buyEth || '?'
  const universe = t.pairSource === 'new' ? 'new pairs' : 'top volume'
  const chain = !t.chainId || t.chainId === 'all' ? 'all chains' : t.chainId
  const tps = (a.takeProfits || [])
    .map((tp) => `${tp.sellPercent}% @ ${tp.multiple}×`)
    .join(', ')
  return `If ${universe} on ${chain}: vol > ${vol} & holders > ${t.minHolders || 0}, buy ${buy} ETH · exits ${tps || '—'} · SL −${a.stopLossPercent || '?'}%`
}
