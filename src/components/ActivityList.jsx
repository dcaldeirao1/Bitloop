import {
  explorerTxUrl,
  formatHistoryRelative,
  formatHistoryTime,
  historySubtitle,
} from '../lib/history'
import { activityCategoryId } from '../lib/unifiedActivity'
import { CategoryBadge } from './RuleStepsHeader'

export function ActivityList({ items, emptyText = 'No activity yet.', limit }) {
  const rows = limit ? items.slice(0, limit) : items

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-bg/50 px-4 py-8 text-center">
        <p className="text-[13px] text-muted">{emptyText}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[12px] text-muted">
          Events from My Automations (on-chain), Spot (paper), and Perps appear here
          when available. Etherscan links show when a Sepolia tx hash exists.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {rows.map((item) => {
        const amount = formatActivityAmount(item)
        const categoryId = activityCategoryId(item)
        return (
          <li
            key={item.id}
            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-bg/60"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge categoryId={categoryId} />
                <TypeBadge type={item.type} />
                <span className="text-[13px] font-medium text-ink">{item.label}</span>
                <StatusBadge status={item.status || 'confirmed'} />
              </div>
              <p className="mt-1 text-[12px] leading-snug text-muted">
                {item.subtitle || historySubtitle(item)}
              </p>
              <p
                className="mt-0.5 text-[11px] text-muted"
                title={formatHistoryTime(item.timestamp)}
              >
                {formatHistoryRelative(item.timestamp)}
                {item.timestamp
                  ? ` · ${formatHistoryTime(item.timestamp)}`
                  : item.blockNumber
                    ? ` · block ${item.blockNumber}`
                    : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`font-mono text-[13px] font-medium ${amount.className}`}>
                {amount.text}
              </p>
              {item.txHash ? (
                <a
                  href={explorerTxUrl(item.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-mono text-[11px] text-teal hover:underline"
                  title={item.txHash}
                >
                  {item.txHash.slice(0, 10)}…↗
                </a>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function formatActivityAmount(item) {
  if (item.type === 'dca') {
    return {
      className: 'text-ink',
      text: (
        <>
          {item.amountFormatted} {item.amountAsset || 'USDC'}
          <span className="text-muted"> → </span>
          {item.amountOutFormatted} {item.amountOutAsset || 'ETH'}
        </>
      ),
    }
  }
  if (item.type === 'deposit' || item.type === 'paper_buy') {
    return {
      className: 'text-teal',
      text: `+${item.amountFormatted} ${item.amountAsset || 'USDC'}`,
    }
  }
  if (item.type === 'withdraw' || item.type === 'paper_exit') {
    return {
      className: 'text-ink',
      text: `−${item.amountFormatted} ${item.amountAsset || 'USDC'}`,
    }
  }
  if (item.type === 'split' || item.type === 'recurring') {
    return {
      className: 'text-mango',
      text: `−${item.amountFormatted} ${item.amountAsset || 'USDC'}`,
    }
  }
  return {
    className: 'text-ink',
    text: `${item.amountFormatted || '—'} ${item.amountAsset || ''}`.trim(),
  }
}

function StatusBadge({ status }) {
  if (status === 'failed') {
    return (
      <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
        Failed
      </span>
    )
  }
  if (status === 'paper') {
    return (
      <span className="rule-env-badge is-paper">Paper</span>
    )
  }
  if (status === 'testnet') {
    return (
      <span className="rule-env-badge is-testnet">Testnet</span>
    )
  }
  return (
    <span className="rounded-md bg-teal-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-deep">
      Confirmed
    </span>
  )
}

function TypeBadge({ type }) {
  const styles = {
    deposit: 'bg-teal-soft text-teal-deep',
    withdraw: 'bg-bg text-ink-soft',
    split: 'bg-mango-soft text-mango',
    recurring: 'bg-mango-soft text-mango',
    dca: 'bg-teal-soft text-teal-deep',
    paper_buy: 'bg-teal-soft text-teal-deep',
    paper_exit: 'bg-mango-soft text-mango',
    paper: 'bg-bg text-ink-soft',
  }
  const labels = {
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    split: 'Split',
    recurring: 'Schedule',
    dca: 'Swap',
    paper_buy: 'Paper buy',
    paper_exit: 'Paper exit',
    paper: 'Paper',
  }
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[type] || styles.withdraw}`}
    >
      {labels[type] || type || 'Tx'}
    </span>
  )
}
