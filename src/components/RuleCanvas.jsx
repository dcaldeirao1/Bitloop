import { isValidAddress } from '../lib/automations'

export function RuleCanvas({
  trigger,
  action,
  onClearTrigger,
  onClearAction,
  onTriggerChange,
  onActionChange,
}) {
  return (
    <div className="flex min-h-[300px] flex-1 flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
        Your rule
      </p>

      <div className="flex flex-1 flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted">IF</span>

        {trigger ? (
          <TriggerBlock
            trigger={trigger}
            onChange={onTriggerChange}
            onRemove={onClearTrigger}
          />
        ) : (
          <EmptySlot label="Add an IF block" />
        )}

        <span className="text-sm font-medium text-muted">THEN</span>

        {action ? (
          <ActionBlock
            action={action}
            onChange={onActionChange}
            onRemove={onClearAction}
          />
        ) : (
          <EmptySlot label="Add a THEN block" />
        )}
      </div>
    </div>
  )
}

function EmptySlot({ label }) {
  return (
    <div className="min-w-[180px] flex-1 rounded-xl border border-dashed border-line-strong px-4 py-7 text-center text-[13px] text-muted">
      {label}
    </div>
  )
}

function TriggerBlock({ trigger, onChange, onRemove }) {
  if (trigger.type === 'every_interval') {
    return (
      <div className="block-if relative min-w-[260px] max-w-md flex-1 rounded-xl px-4 py-3.5">
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2.5 top-2.5 text-[12px] text-muted hover:text-ink"
          aria-label="Remove trigger"
        >
          ✕
        </button>
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-teal">
          IF
        </span>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">every</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            value={trigger.every}
            onChange={(e) =>
              onChange({
                ...trigger,
                every: Math.max(1, Number(e.target.value) || 1),
              })
            }
            className="w-16 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-[13px] text-teal outline-none focus:border-teal"
          />
          <select
            value={trigger.unit}
            onChange={(e) => onChange({ ...trigger, unit: e.target.value })}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink outline-none focus:border-ink"
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      </div>
    )
  }

  return (
    <div className="block-if relative min-w-[220px] rounded-xl px-4 py-3.5">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2.5 top-2.5 text-[12px] text-muted hover:text-ink"
        aria-label="Remove trigger"
      >
        ✕
      </button>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-teal">
        IF
      </span>
      <p className="pr-6 text-[14px] font-medium text-ink">
        my vault receives USDC
      </p>
    </div>
  )
}

function ActionBlock({ action, onChange, onRemove }) {
  const addressOk = isValidAddress(action.to)

  if (action.type === 'send_amount') {
    return (
      <div className="block-then relative min-w-[280px] max-w-md flex-1 rounded-xl px-4 py-3.5">
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2.5 top-2.5 text-[12px] text-muted hover:text-ink"
          aria-label="Remove action"
        >
          ✕
        </button>
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-mango">
          THEN
        </span>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          send{' '}
          <input
            type="number"
            min={0}
            step="any"
            value={action.amount}
            onChange={(e) => onChange({ ...action, amount: e.target.value })}
            className="mx-0.5 w-20 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-[13px] text-mango outline-none focus:border-mango"
          />{' '}
          USDC to
        </p>
        <label className="block text-[11px] font-medium text-muted">
          Destination wallet
          <input
            type="text"
            placeholder="0x…"
            value={action.to}
            onChange={(e) => onChange({ ...action, to: e.target.value.trim() })}
            className={`mt-1.5 w-full rounded-lg border bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink ${
              action.to && !addressOk
                ? 'border-danger text-danger'
                : 'border-line text-ink'
            }`}
          />
        </label>
        {action.to && !addressOk && (
          <p className="mt-1 text-[12px] text-danger">Enter a valid 0x address</p>
        )}
      </div>
    )
  }

  return (
    <div className="block-then relative min-w-[280px] max-w-md flex-1 rounded-xl px-4 py-3.5">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2.5 top-2.5 text-[12px] text-muted hover:text-ink"
        aria-label="Remove action"
      >
        ✕
      </button>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-mango">
        THEN
      </span>
      <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
        send{' '}
        <input
          type="number"
          min={1}
          max={100}
          value={action.percent}
          onChange={(e) =>
            onChange({
              ...action,
              percent: Math.min(100, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          className="mx-0.5 w-14 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-[13px] text-mango outline-none focus:border-mango"
        />
        % of those funds to
      </p>
      <label className="block text-[11px] font-medium text-muted">
        Savings wallet
        <input
          type="text"
          placeholder="0x…"
          value={action.to}
          onChange={(e) => onChange({ ...action, to: e.target.value.trim() })}
          className={`mt-1.5 w-full rounded-lg border bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink ${
            action.to && !addressOk
              ? 'border-danger text-danger'
              : 'border-line text-ink'
          }`}
        />
      </label>
      {action.to && !addressOk && (
        <p className="mt-1 text-[12px] text-danger">Enter a valid 0x address</p>
      )}
      </div>
  )
}

export function ExampleRuleBlocks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <span className="text-sm font-medium text-muted">IF</span>
      <div className="block-if rounded-xl px-4 py-3">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-teal">
          IF
        </span>
        <p className="text-[14px] font-medium text-ink">
          my vault receives USDC
        </p>
      </div>
      <span className="text-sm font-medium text-muted">THEN</span>
      <div className="block-then rounded-xl px-4 py-3">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mango">
          THEN
        </span>
        <p className="text-[14px] font-medium text-ink">
          send <span className="font-mono text-mango">20%</span> of those funds
          to savings
        </p>
      </div>
    </div>
  )
}
