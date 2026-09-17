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
    <div className="builder-canvas">
      <p className="builder-canvas-kicker">Your rule</p>

      <div className="builder-canvas-flow">
        <div className="builder-flow-col">
          <span className="builder-flow-label">Trigger</span>
          {trigger ? (
            <TriggerBlock
              trigger={trigger}
              onChange={onTriggerChange}
              onRemove={onClearTrigger}
            />
          ) : (
            <EmptySlot label="Pick a trigger below" />
          )}
        </div>

        <div className="builder-flow-join" aria-hidden="true">
          →
        </div>

        <div className="builder-flow-col">
          <span className="builder-flow-label">Action</span>
          {action ? (
            <ActionBlock
              action={action}
              onChange={onActionChange}
              onRemove={onClearAction}
            />
          ) : (
            <EmptySlot label="Pick an action below" />
          )}
        </div>
      </div>
    </div>
  )
}

function EmptySlot({ label }) {
  return (
    <div className="builder-empty-slot">
      {label}
    </div>
  )
}

function IntervalFields({ trigger, onChange }) {
  return (
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
  )
}

function TriggerShell({ onRemove, children, wide }) {
  return (
    <div className={`block-if builder-block ${wide ? 'is-wide' : ''}`}>
      <button
        type="button"
        onClick={onRemove}
        className="builder-block-remove"
        aria-label="Remove trigger"
      >
        ✕
      </button>
      {children}
    </div>
  )
}

function TriggerBlock({ trigger, onChange, onRemove }) {
  if (trigger.type === 'every_interval') {
    return (
      <TriggerShell onRemove={onRemove} wide>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">every</p>
        <IntervalFields trigger={trigger} onChange={onChange} />
      </TriggerShell>
    )
  }

  if (trigger.type === 'time_window') {
    return (
      <TriggerShell onRemove={onRemove} wide>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">only between (UTC)</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            max={23}
            value={trigger.startHour}
            onChange={(e) =>
              onChange({
                ...trigger,
                startHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
              })
            }
            className="w-14 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-[13px] text-teal outline-none focus:border-teal"
          />
          <span className="text-[12px] text-muted">to</span>
          <input
            type="number"
            min={0}
            max={23}
            value={trigger.endHour}
            onChange={(e) =>
              onChange({
                ...trigger,
                endHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
              })
            }
            className="w-14 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-[13px] text-teal outline-none focus:border-teal"
          />
          <span className="text-[12px] text-muted">· then every</span>
        </div>
        <IntervalFields trigger={trigger} onChange={onChange} />
      </TriggerShell>
    )
  }

  if (trigger.type === 'usdc_above') {
    return (
      <TriggerShell onRemove={onRemove} wide>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          when vault USDC ≥{' '}
          <input
            type="number"
            min={0}
            step="any"
            value={trigger.amount}
            onChange={(e) => onChange({ ...trigger, amount: e.target.value })}
            className="mx-0.5 w-20 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-[13px] text-teal outline-none focus:border-teal"
          />
        </p>
        <p className="mb-2 text-[12px] text-muted">Cooldown-check every</p>
        <IntervalFields trigger={trigger} onChange={onChange} />
      </TriggerShell>
    )
  }

  if (trigger.type === 'eth_price_below' || trigger.type === 'eth_price_above') {
    const below = trigger.type === 'eth_price_below'
    return (
      <TriggerShell onRemove={onRemove} wide>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          when ETH {below ? '≤' : '≥'} ${' '}
          <input
            type="number"
            min={0}
            step="any"
            value={trigger.priceUsd}
            onChange={(e) => onChange({ ...trigger, priceUsd: e.target.value })}
            className="mx-0.5 w-24 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-[13px] text-teal outline-none focus:border-teal"
          />
        </p>
        <p className="mb-2 text-[12px] text-muted">Re-check every</p>
        <IntervalFields trigger={trigger} onChange={onChange} />
      </TriggerShell>
    )
  }

  if (trigger.type === 'receive_eth') {
    return (
      <TriggerShell onRemove={onRemove}>
        <p className="pr-6 text-[14px] font-medium text-ink">my vault receives ETH</p>
      </TriggerShell>
    )
  }

  return (
    <TriggerShell onRemove={onRemove}>
      <p className="pr-6 text-[14px] font-medium text-ink">my vault receives USDC</p>
    </TriggerShell>
  )
}

function ActionShell({ onRemove, children }) {
  return (
    <div className="block-then builder-block is-wide">
      <button
        type="button"
        onClick={onRemove}
        className="builder-block-remove"
        aria-label="Remove action"
      >
        ✕
      </button>
      {children}
    </div>
  )
}

function AmountInput({ value, onChange }) {
  return (
    <input
      type="number"
      min={0}
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mx-0.5 w-20 rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-mono text-[13px] text-mango outline-none focus:border-mango"
    />
  )
}

function AddressField({ label, value, onChange, ok }) {
  return (
    <label className="block text-[11px] font-medium text-muted">
      {label}
      <input
        type="text"
        placeholder="0x…"
        value={value || ''}
        onChange={(e) => onChange(e.target.value.trim())}
        className={`mt-1.5 w-full rounded-lg border bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-ink ${
          value && !ok ? 'border-danger text-danger' : 'border-line text-ink'
        }`}
      />
      {value && !ok ? (
        <span className="mt-1 block text-[12px] text-danger">Enter a valid 0x address</span>
      ) : null}
    </label>
  )
}

function ActionBlock({ action, onChange, onRemove }) {
  const addressOk = isValidAddress(action.to)
  const tokenInOk = isValidAddress(action.tokenIn)
  const tokenOutOk = isValidAddress(action.tokenOut)

  if (
    action.type === 'buy_eth' ||
    ((action.type === 'swap_usdc_eth' || action.type === 'dca_swap') &&
      action.outMode !== 'token')
  ) {
    return (
      <ActionShell onRemove={onRemove}>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          buy ETH with <AmountInput value={action.amount} onChange={(v) => onChange({ ...action, amount: v })} /> USDC
        </p>
        <p className="text-[12px] leading-relaxed text-muted">
          Uses vault USDC. Bought ETH stays in the vault.
        </p>
      </ActionShell>
    )
  }

  if (
    action.type === 'buy_token' ||
    ((action.type === 'swap_usdc_eth' || action.type === 'dca_swap') &&
      action.outMode === 'token')
  ) {
    return (
      <ActionShell onRemove={onRemove}>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          spend <AmountInput value={action.amount} onChange={(v) => onChange({ ...action, amount: v })} /> ETH → token
        </p>
        <AddressField
          label="Token contract"
          value={action.tokenOut}
          ok={tokenOutOk}
          onChange={(v) => onChange({ ...action, tokenOut: v })}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Needs a Sepolia Uniswap WETH pool. Bought tokens stay in the vault.
        </p>
      </ActionShell>
    )
  }

  if (action.type === 'sell_eth_usdc') {
    return (
      <ActionShell onRemove={onRemove}>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          sell <AmountInput value={action.amount} onChange={(v) => onChange({ ...action, amount: v })} /> ETH → USDC
        </p>
        <p className="text-[12px] leading-relaxed text-muted">
          Uses vault ETH via Uniswap. USDC returns to the vault.
        </p>
      </ActionShell>
    )
  }

  if (action.type === 'sell_token_eth') {
    return (
      <ActionShell onRemove={onRemove}>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          sell <AmountInput value={action.amount} onChange={(v) => onChange({ ...action, amount: v })} /> token → ETH
        </p>
        <AddressField
          label="Token contract"
          value={action.tokenIn}
          ok={tokenInOk}
          onChange={(v) => onChange({ ...action, tokenIn: v })}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Uses the DCA router inventory rate. ETH returns to the vault.
        </p>
      </ActionShell>
    )
  }

  if (action.type === 'send_token') {
    return (
      <ActionShell onRemove={onRemove}>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          send <AmountInput value={action.amount} onChange={(v) => onChange({ ...action, amount: v })} /> token to
        </p>
        <div className="mb-3">
          <AddressField
            label="Token contract"
            value={action.token}
            ok={isValidAddress(action.token)}
            onChange={(v) => onChange({ ...action, token: v })}
          />
        </div>
        <AddressField
          label="Destination wallet"
          value={action.to}
          ok={addressOk}
          onChange={(v) => onChange({ ...action, to: v })}
        />
      </ActionShell>
    )
  }

  if (action.type === 'send_amount') {
    return (
      <ActionShell onRemove={onRemove}>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          send <AmountInput value={action.amount} onChange={(v) => onChange({ ...action, amount: v })} /> USDC to
        </p>
        <AddressField
          label="Destination wallet"
          value={action.to}
          ok={addressOk}
          onChange={(v) => onChange({ ...action, to: v })}
        />
      </ActionShell>
    )
  }

  return (
    <ActionShell onRemove={onRemove}>
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
      <AddressField
        label="Destination wallet"
        value={action.to}
        ok={addressOk}
        onChange={(v) => onChange({ ...action, to: v })}
      />
    </ActionShell>
  )
}

export function ExampleRuleBlocks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <span className="text-sm font-medium text-muted">Trigger</span>
      <div className="block-if rounded-xl px-4 py-3">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-teal">
          Trigger
        </span>
        <p className="text-[14px] font-medium text-ink">my vault receives USDC</p>
      </div>
      <span className="text-sm font-medium text-muted">Action</span>
      <div className="block-then rounded-xl px-4 py-3">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mango">
          Action
        </span>
        <p className="text-[14px] font-medium text-ink">
          send <span className="font-mono text-mango">20%</span> of those funds to savings
        </p>
      </div>
    </div>
  )
}
