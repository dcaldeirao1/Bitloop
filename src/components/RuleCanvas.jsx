import { isValidAddress } from '../lib/automations'
import {
  RELAY_CHAINS,
  findChainToken,
  isNativeCurrency,
  tokensForChain,
} from '../lib/relay'

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
    const hh = String(trigger.hour ?? 9).padStart(2, '0')
    const mm = String(trigger.minute ?? 0).padStart(2, '0')
    const timeValue = `${hh}:${mm}`
    return (
      <TriggerShell onRemove={onRemove} wide>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">at (UTC)</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="time"
            value={timeValue}
            onChange={(e) => {
              const [h, m] = String(e.target.value || '00:00').split(':')
              onChange({
                ...trigger,
                hour: Math.min(23, Math.max(0, Number(h) || 0)),
                minute: Math.min(59, Math.max(0, Number(m) || 0)),
              })
            }}
            className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[13px] text-teal outline-none focus:border-teal"
          />
          <span className="text-[12px] text-muted">· then every</span>
        </div>
        <IntervalFields trigger={trigger} onChange={onChange} />
        <p className="mt-2 text-[11px] text-muted">
          Soft gate opens near this UTC time; on-chain interval still controls how often it
          fires.
        </p>
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

  if (action.type === 'bridge_relay') {
    const recipientOk = isValidAddress(action.recipient)
    const originTokens = tokensForChain(action.originChainId)
    const destTokens = tokensForChain(action.destinationChainId)
    const originTokenId = action.originToken || 'USDC'
    const destTokenId = action.destinationToken || 'USDC'
    const originPreset = findChainToken(action.originChainId, originTokenId)
    const destPreset = findChainToken(action.destinationChainId, destTokenId)
    const originSym =
      originTokenId === 'custom'
        ? 'token'
        : originPreset?.symbol || action.originSymbol || 'token'
    const originIsNative =
      originTokenId === 'ETH' ||
      originTokenId === 'MATIC' ||
      isNativeCurrency(action.originCurrency || originPreset?.address)
    const customOriginOk =
      originTokenId !== 'custom' || isValidAddress(action.originCustomAddress)
    const customDestOk =
      destTokenId !== 'custom' || isValidAddress(action.destinationCustomAddress)

    const patchOriginChain = (chainId) => {
      const nextId = Number(chainId)
      const keep = findChainToken(nextId, originTokenId)
      const fallback = findChainToken(nextId, 'USDC') || tokensForChain(nextId)[0]
      const token = keep || fallback
      onChange({
        ...action,
        originChainId: nextId,
        originToken: token?.id || 'custom',
        originCurrency: token?.address || '',
        originSymbol: token?.symbol || 'TOKEN',
        originDecimals: token?.decimals ?? 18,
        originCustomAddress: keep ? '' : action.originCustomAddress,
      })
    }

    const patchDestChain = (chainId) => {
      const nextId = Number(chainId)
      const keep = findChainToken(nextId, destTokenId)
      const fallback = findChainToken(nextId, 'USDC') || tokensForChain(nextId)[0]
      const token = keep || fallback
      onChange({
        ...action,
        destinationChainId: nextId,
        destinationToken: token?.id || 'custom',
        destinationCurrency: token?.address || '',
        destinationSymbol: token?.symbol || 'TOKEN',
        destinationDecimals: token?.decimals ?? 18,
        destinationCustomAddress: keep ? '' : action.destinationCustomAddress,
      })
    }

    const patchOriginToken = (tokenId) => {
      if (tokenId === 'custom') {
        onChange({
          ...action,
          originToken: 'custom',
          originCurrency: action.originCustomAddress || '',
          originSymbol: 'TOKEN',
          originDecimals: Number(action.originDecimals) || 18,
        })
        return
      }
      const token = findChainToken(action.originChainId, tokenId)
      onChange({
        ...action,
        originToken: tokenId,
        originCurrency: token?.address || '',
        originSymbol: token?.symbol || tokenId,
        originDecimals: token?.decimals ?? 18,
        originCustomAddress: '',
      })
    }

    const patchDestToken = (tokenId) => {
      if (tokenId === 'custom') {
        onChange({
          ...action,
          destinationToken: 'custom',
          destinationCurrency: action.destinationCustomAddress || '',
          destinationSymbol: 'TOKEN',
          destinationDecimals: Number(action.destinationDecimals) || 18,
        })
        return
      }
      const token = findChainToken(action.destinationChainId, tokenId)
      onChange({
        ...action,
        destinationToken: tokenId,
        destinationCurrency: token?.address || '',
        destinationSymbol: token?.symbol || tokenId,
        destinationDecimals: token?.decimals ?? 18,
        destinationCustomAddress: '',
      })
    }

    return (
      <ActionShell onRemove={onRemove}>
        <p className="mb-3 pr-6 text-[14px] font-medium text-ink">
          bridge{' '}
          <AmountInput
            value={action.amount}
            onChange={(v) => onChange({ ...action, amount: v })}
          />{' '}
          {originSym} via Relay
        </p>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-[11px] font-medium text-muted">
            From chain
            <select
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-ink"
              value={action.originChainId}
              onChange={(e) => patchOriginChain(e.target.value)}
            >
              {RELAY_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-muted">
            From token
            <select
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-ink"
              value={originTokenId}
              onChange={(e) => patchOriginToken(e.target.value)}
            >
              {originTokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.symbol}
                  {t.native ? ' (native)' : ''}
                </option>
              ))}
              <option value="custom">Custom ERC-20…</option>
            </select>
          </label>
          <label className="block text-[11px] font-medium text-muted">
            To chain
            <select
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-ink"
              value={action.destinationChainId}
              onChange={(e) => patchDestChain(e.target.value)}
            >
              {RELAY_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-muted">
            To token
            <select
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-ink"
              value={destTokenId}
              onChange={(e) => patchDestToken(e.target.value)}
            >
              {destTokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.symbol}
                  {t.native ? ' (native)' : ''}
                </option>
              ))}
              <option value="custom">Custom ERC-20…</option>
            </select>
          </label>
        </div>
        {originTokenId === 'custom' ? (
          <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_5.5rem]">
            <AddressField
              label="Origin token contract"
              value={action.originCustomAddress}
              ok={customOriginOk}
              onChange={(v) =>
                onChange({
                  ...action,
                  originCustomAddress: v,
                  originCurrency: v,
                  originToken: 'custom',
                })
              }
            />
            <label className="block text-[11px] font-medium text-muted">
              Decimals
              <input
                type="number"
                min={0}
                max={36}
                value={action.originDecimals ?? 18}
                onChange={(e) =>
                  onChange({
                    ...action,
                    originDecimals: Math.min(36, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-ink"
              />
            </label>
          </div>
        ) : null}
        {destTokenId === 'custom' ? (
          <div className="mb-3">
            <AddressField
              label="Destination token contract"
              value={action.destinationCustomAddress}
              ok={customDestOk}
              onChange={(v) =>
                onChange({
                  ...action,
                  destinationCustomAddress: v,
                  destinationCurrency: v,
                  destinationToken: 'custom',
                })
              }
            />
          </div>
        ) : null}
        <AddressField
          label="Recipient on destination"
          value={action.recipient}
          ok={recipientOk}
          onChange={(v) => onChange({ ...action, recipient: v })}
        />
        {originIsNative ? (
          <p className="mt-2 text-[12px] leading-relaxed text-danger">
            Vault automations can only send ERC-20s. Use WETH (or another token) as the origin,
            or wrap ETH first. Destination can still be native ETH.
          </p>
        ) : (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            Vault sends the origin token to a Relay deposit address; Relay delivers the destination
            token to the recipient. Origin chain/token must match what the vault holds.
          </p>
        )}
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
