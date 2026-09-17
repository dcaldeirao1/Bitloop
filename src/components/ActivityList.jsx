import { explorerTxUrl, formatHistoryTime, historySubtitle } from '../lib/history'

export function ActivityList({ items, emptyText = 'No activity yet.', limit }) {
  const rows = limit ? items.slice(0, limit) : items

  if (!rows.length) {
    return <p className="text-[13px] text-muted">{emptyText}</p>
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((item) => (
        <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={item.type} />
              <span className="text-[13px] font-medium text-ink">{item.label}</span>
            </div>
            <p className="mt-1 text-[12px] text-muted">{historySubtitle(item)}</p>
            <p className="mt-0.5 text-[11px] text-muted">
              {formatHistoryTime(item.timestamp)}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`font-mono text-[13px] font-medium ${
                item.type === 'deposit'
                  ? 'text-teal'
                  : item.type === 'withdraw'
                    ? 'text-ink'
                    : 'text-mango'
              }`}
            >
              {item.type === 'dca' ? (
                <>
                  {item.amountFormatted} {item.amountAsset || 'USDC'}
                  <span className="text-muted"> → </span>
                  {item.amountOutFormatted} {item.amountOutAsset || 'ETH'}
                </>
              ) : (
                <>
                  {item.type === 'deposit' ? '+' : '−'}
                  {item.amountFormatted} {item.amountAsset || 'USDC'}
                </>
              )}
            </p>
            <a
              href={explorerTxUrl(item.txHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-[11px] text-muted hover:text-ink"
            >
              View tx ↗
            </a>
          </div>
        </li>
      ))}
    </ul>
  )
}

function TypeBadge({ type }) {
  const styles = {
    deposit: 'bg-teal-soft text-teal-deep',
    withdraw: 'bg-bg text-ink-soft',
    split: 'bg-mango-soft text-mango',
    recurring: 'bg-mango-soft text-mango',
    dca: 'bg-teal-soft text-teal-deep',
  }
  const labels = {
    deposit: 'In',
    withdraw: 'Out',
    split: 'Split',
    recurring: 'Schedule',
    dca: 'DCA',
  }
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[type] || styles.withdraw}`}
    >
      {labels[type] || 'Out'}
    </span>
  )
}
