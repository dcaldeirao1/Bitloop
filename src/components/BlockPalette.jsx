export function BlockPalette({
  onAddTrigger,
  onAddAction,
  hasTrigger,
  hasAction,
  triggerType,
}) {
  return (
    <aside className="flex w-full flex-col gap-3 lg:w-60">
      <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
        Blocks
      </p>

      <button
        type="button"
        onClick={() => onAddTrigger('receive_usdc')}
        disabled={hasTrigger}
        className="block-if rounded-xl px-4 py-3.5 text-left transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-teal">
          IF
        </span>
        <span className="text-[13px] font-medium text-ink">
          Vault receives USDC
        </span>
      </button>

      <button
        type="button"
        onClick={() => onAddTrigger('every_interval')}
        disabled={hasTrigger}
        className="block-if rounded-xl px-4 py-3.5 text-left transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-teal">
          IF
        </span>
        <span className="text-[13px] font-medium text-ink">
          Every X minutes / hours / days
        </span>
      </button>

      <button
        type="button"
        onClick={() => onAddAction('send_percent')}
        disabled={hasAction || (hasTrigger && triggerType !== 'receive_usdc')}
        className="block-then rounded-xl px-4 py-3.5 text-left transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mango">
          THEN
        </span>
        <span className="text-[13px] font-medium text-ink">
          Send % to address
        </span>
      </button>

      <button
        type="button"
        onClick={() => onAddAction('send_amount')}
        disabled={hasAction || (hasTrigger && triggerType !== 'every_interval')}
        className="block-then rounded-xl px-4 py-3.5 text-left transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mango">
          THEN
        </span>
        <span className="text-[13px] font-medium text-ink">
          Send fixed USDC amount
        </span>
      </button>

      <p className="text-[12px] leading-relaxed text-muted">
        Pair receive → % split, or schedule → fixed amount.
      </p>
    </aside>
  )
}
