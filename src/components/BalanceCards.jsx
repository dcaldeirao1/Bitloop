import { useMemo } from 'react'
import { getBalanceSeries, seriesDelta } from '../lib/balanceSeries'
import { Sparkline } from './Sparkline'

function trimAmt(value, maxDecimals = 4) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '—')
  if (n === 0) return '0'
  return n.toFixed(maxDecimals).replace(/\.?0+$/, '')
}

/**
 * USDC / ETH balance cards with sparklines — overview + vault.
 */
export function BalanceCards({
  vault,
  balances,
  loadingBalances = false,
  history = [],
  className = '',
}) {
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

  const usdcSeries = useMemo(
    () =>
      getBalanceSeries(vault, 'usdc', {
        current: balances?.vaultUsdcFormatted,
        history,
      }),
    [vault, balances?.vaultUsdcFormatted, history],
  )
  const ethSeries = useMemo(
    () =>
      getBalanceSeries(vault, 'eth', {
        current: balances?.vaultEthFormatted,
        history,
      }),
    [vault, balances?.vaultEthFormatted, history],
  )

  const usdcDelta = seriesDelta(usdcSeries)
  const ethDelta = seriesDelta(ethSeries)

  return (
    <div className={`vault-balance-grid ${className}`.trim()}>
      <BalanceCard
        symbol="USDC"
        tokenClass="is-usdc"
        tokenMark="$"
        amount={usdc}
        delta={usdcDelta}
        loading={loadingBalances}
        series={usdcSeries}
        tone="teal"
        decimals={4}
        flatLabel="No change"
      />
      <BalanceCard
        symbol="ETH"
        tokenClass="is-eth"
        tokenMark="Ξ"
        amount={eth}
        delta={ethDelta}
        loading={loadingBalances}
        series={ethSeries}
        tone="mango"
        decimals={5}
        flatLabel="No change"
      />
    </div>
  )
}

function BalanceCard({
  symbol,
  tokenClass,
  tokenMark,
  amount,
  delta,
  loading,
  series,
  tone,
  decimals,
  flatLabel,
}) {
  const deltaClass =
    delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''
  const deltaText = loading
    ? '…'
    : delta === 0
      ? flatLabel
      : `${delta > 0 ? '+' : ''}${trimAmt(delta, decimals)}`

  return (
    <article className={`vault-balance-card ${deltaClass}`.trim()}>
      <div className="vault-balance-copy">
        <div className="vault-balance-head">
          <span className={`vault-token ${tokenClass}`}>{tokenMark}</span>
          <span>{symbol}</span>
        </div>
        <p className="vault-balance-amt">{amount}</p>
        <p className={`vault-balance-delta ${deltaClass}`}>{deltaText}</p>
      </div>
      <div className="vault-balance-chart">
        <Sparkline values={series} tone={tone} width={180} height={56} />
      </div>
    </article>
  )
}
