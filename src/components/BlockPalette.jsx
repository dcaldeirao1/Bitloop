const TRIGGER_GROUPS = [
  {
    id: 'deposit',
    label: 'Deposit',
    items: [
      { id: 'receive_usdc', title: 'Receives USDC', hint: 'Income split' },
      { id: 'receive_eth', title: 'Receives ETH', hint: 'Native split' },
    ],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    items: [
      { id: 'every_interval', title: 'Every interval', hint: 'Minutes / hours / days' },
      { id: 'time_window', title: 'At time (UTC)', hint: 'Specific HH:MM' },
      { id: 'usdc_above', title: 'USDC above', hint: 'Balance gate' },
    ],
  },
  {
    id: 'market',
    label: 'Market',
    items: [
      { id: 'eth_price_below', title: 'ETH below', hint: 'Buy the dip' },
      { id: 'eth_price_above', title: 'ETH above', hint: 'Price level' },
    ],
  },
]

const ACTION_GROUPS = [
  {
    id: 'send',
    label: 'Send',
    items: [
      { id: 'send_percent', title: 'Send %', hint: 'Of deposit' },
      { id: 'send_amount', title: 'Send USDC', hint: 'Fixed amount' },
      { id: 'send_token', title: 'Send ERC-20', hint: 'Any token' },
    ],
  },
  {
    id: 'buy',
    label: 'Buy',
    items: [
      { id: 'buy_eth', title: 'Buy ETH', hint: 'With USDC' },
      { id: 'buy_token', title: 'Buy token', hint: 'With ETH' },
    ],
  },
  {
    id: 'sell',
    label: 'Sell',
    items: [
      { id: 'sell_eth_usdc', title: 'Sell ETH', hint: 'For USDC' },
      { id: 'sell_token_eth', title: 'Sell token', hint: 'For ETH' },
    ],
  },
  {
    id: 'bridge',
    label: 'Bridge (experimental)',
    items: [
      {
        id: 'bridge_relay',
        title: 'Relay bridge',
        hint: 'Mainnet L2s — not Sepolia vault',
      },
    ],
  },
]

export function BlockPalette({
  onAddTrigger,
  onAddAction,
  hasTrigger,
  hasAction,
  triggerType,
}) {
  const percentTriggers =
    !hasTrigger || triggerType === 'receive_usdc' || triggerType === 'receive_eth'
  const scheduleTriggers =
    !hasTrigger ||
    [
      'every_interval',
      'time_window',
      'usdc_above',
      'eth_price_below',
      'eth_price_above',
    ].includes(triggerType)
  const dcaTriggers =
    !hasTrigger ||
    [
      'every_interval',
      'time_window',
      'usdc_above',
      'eth_price_below',
      'eth_price_above',
    ].includes(triggerType)

  const actionEnabled = (id) => {
    if (hasAction) return false
    if (!hasTrigger) return true
    if (id === 'send_percent') return percentTriggers
    if (id === 'send_amount' || id === 'send_token' || id === 'bridge_relay') {
      return scheduleTriggers
    }
    return dcaTriggers
  }

  return (
    <div className="builder-catalog">
      <section className="catalog-panel">
        <header className="catalog-panel-head">
          <h3 className="catalog-panel-title">Triggers</h3>
          <p className="catalog-panel-meta">
            {hasTrigger ? 'Clear the canvas trigger to swap' : 'When should it run?'}
          </p>
        </header>
        <div className="catalog-groups">
          {TRIGGER_GROUPS.map((group) => (
            <div key={group.id} className="catalog-group">
              <p className="catalog-group-label">{group.label}</p>
              <div className="catalog-tiles">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={hasTrigger}
                    onClick={() => onAddTrigger(item.id)}
                    className="catalog-tile is-trigger"
                  >
                    <span className="catalog-tile-title">{item.title}</span>
                    <span className="catalog-tile-hint">{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="catalog-panel">
        <header className="catalog-panel-head">
          <h3 className="catalog-panel-title">Actions</h3>
          <p className="catalog-panel-meta">
            {hasAction
              ? 'Clear the canvas action to swap'
              : hasTrigger
                ? 'Compatible actions stay available'
                : 'What should it do?'}
          </p>
        </header>
        <div className="catalog-groups">
          {ACTION_GROUPS.map((group) => (
            <div key={group.id} className="catalog-group">
              <p className="catalog-group-label">{group.label}</p>
              <div className="catalog-tiles">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!actionEnabled(item.id)}
                    onClick={() => onAddAction(item.id)}
                    className="catalog-tile is-action"
                  >
                    <span className="catalog-tile-title">{item.title}</span>
                    <span className="catalog-tile-hint">{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
