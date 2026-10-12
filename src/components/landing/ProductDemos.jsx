import { useInView } from '../../hooks/useInView'

/** App-shell chrome around a product demo. */
export function DemoFrame({
  title = 'Overview',
  path = 'bitloop.app',
  children,
  caption = 'Product demo — illustrative',
}) {
  return (
    <div className="demo-frame">
      <div className="demo-frame-shell">
        <aside className="demo-frame-rail" aria-hidden="true">
          <span className="demo-frame-rail-mark">b</span>
          <span className="demo-frame-rail-item is-on" />
          <span className="demo-frame-rail-item" />
          <span className="demo-frame-rail-item" />
          <span className="demo-frame-rail-item" />
          <span className="demo-frame-rail-spacer" />
          <span className="demo-frame-rail-item is-muted" />
        </aside>
        <div className="demo-frame-main">
          <div className="demo-frame-chrome">
            <div className="demo-frame-dots">
              <span className="demo-frame-dot is-red" />
              <span className="demo-frame-dot is-amber" />
              <span className="demo-frame-dot is-green" />
            </div>
            <div className="demo-frame-url">
              <span className="demo-frame-url-lock" aria-hidden="true" />
              <span>{path}</span>
            </div>
            <span className="demo-frame-title">{title}</span>
            <span className="demo-frame-live">
              <span className="status-dot is-on" />
              Live
            </span>
          </div>
          <div className="demo-frame-body">{children}</div>
        </div>
      </div>
      {caption ? <p className="demo-frame-caption">{caption}</p> : null}
    </div>
  )
}

/** Vault dashboard — hero product stage. */
export function DemoVault() {
  const { ref, inView } = useInView({ once: false, threshold: 0.08 })

  return (
    <DemoFrame title="Vault" path="app/vault">
      <div
        ref={ref}
        className={`demo-vault ${inView ? 'is-playing' : ''}`}
        aria-hidden="true"
      >
        <header className="demo-vault-top demo-pop" style={{ '--d': '0.04s' }}>
          <div>
            <p className="demo-vault-label">Your vault</p>
            <p className="demo-vault-addr">
              <span className="demo-vault-addr-dot" />
              0x7a3f…e91c
            </p>
          </div>
          <div className="demo-vault-top-meta">
            <span className="demo-pill is-on">
              <span className="status-dot is-on" />
              Sepolia
            </span>
            <span className="demo-pill">Keeper online</span>
          </div>
        </header>

        <div className="demo-vault-balances">
          <article className="demo-balance demo-pop" style={{ '--d': '0.12s' }}>
            <div className="demo-balance-head">
              <span className="demo-token is-usdc">$</span>
              <span>USDC</span>
            </div>
            <p className="demo-balance-amt">12,480.00</p>
            <p className="demo-balance-delta is-up">+2,400 today</p>
            <svg className="demo-spark" viewBox="0 0 120 28" fill="none">
              <path
                className="demo-spark-line"
                d="M0 22 C 18 20, 28 8, 42 12 C 56 16, 68 4, 84 8 C 96 11, 108 6, 120 3"
              />
            </svg>
          </article>
          <article className="demo-balance demo-pop" style={{ '--d': '0.2s' }}>
            <div className="demo-balance-head">
              <span className="demo-token is-eth">Ξ</span>
              <span>ETH</span>
            </div>
            <p className="demo-balance-amt">0.842</p>
            <p className="demo-balance-delta">DCA accumulating</p>
            <svg className="demo-spark" viewBox="0 0 120 28" fill="none">
              <path
                className="demo-spark-line is-mango"
                d="M0 18 C 20 16, 32 20, 48 14 C 64 8, 78 12, 94 7 C 106 4, 114 6, 120 2"
              />
            </svg>
          </article>
        </div>

        <div className="demo-vault-flow demo-pop" style={{ '--d': '0.3s' }}>
          <div className="demo-flow-node is-if">
            <span className="demo-role">IF</span>
            <p>Vault receives USDC</p>
          </div>
          <div className="demo-flow-wire">
            <span className="demo-flow-pulse" />
          </div>
          <div className="demo-flow-hub">
            <p className="demo-hub-label">Vault</p>
            <p className="demo-hub-title">Smart account</p>
            <div className="demo-hub-bar" />
          </div>
          <div className="demo-flow-wire">
            <span className="demo-flow-pulse is-late" />
          </div>
          <div className="demo-flow-node is-then">
            <span className="demo-role is-then">THEN</span>
            <p>Send 20% to savings</p>
          </div>
        </div>

        <ul className="demo-vault-rules">
          <li className="demo-pop" style={{ '--d': '0.4s' }}>
            <span className="status-dot is-on" />
            <span className="demo-rule-name">Income split</span>
            <span className="demo-rule-meta">20% → savings</span>
            <span className="demo-rule-state">Active</span>
          </li>
          <li className="demo-pop" style={{ '--d': '0.48s' }}>
            <span className="status-dot is-on" />
            <span className="demo-rule-name">DCA into ETH</span>
            <span className="demo-rule-meta">Every hour</span>
            <span className="demo-rule-state">Active</span>
          </li>
        </ul>
      </div>
    </DemoFrame>
  )
}

/** Builder IF→THEN assembly demo. */
export function DemoBuilder() {
  const { ref, inView } = useInView({ once: false, threshold: 0.08 })

  return (
    <DemoFrame title="Builder" path="app/new">
      <div
        ref={ref}
        className={`demo-builder ${inView ? 'is-playing' : ''}`}
        aria-hidden="true"
      >
        <div className="demo-builder-layout">
          <aside className="demo-builder-side">
            <p className="demo-builder-side-label">Templates</p>
            {['Income split', 'Scheduled transfer', 'DCA into ETH'].map(
              (label, i) => (
                <span
                  key={label}
                  className={`demo-builder-chip ${i === 0 ? 'is-active' : ''}`}
                  style={{ '--d': `${0.05 + i * 0.08}s` }}
                >
                  {label}
                </span>
              ),
            )}
            <p className="demo-builder-side-label mt">Blocks</p>
            <div className="demo-builder-palette">
              <span className="demo-palette-item is-if">IF</span>
              <span className="demo-palette-item is-then">THEN</span>
            </div>
          </aside>

          <div className="demo-builder-main">
            <div className="demo-builder-canvas">
              <div className="demo-builder-block is-if" style={{ '--d': '0.25s' }}>
                <div className="demo-builder-block-top">
                  <span className="demo-role">IF</span>
                  <span className="demo-builder-hint">Trigger · deposit</span>
                </div>
                <p className="demo-builder-line">Vault receives USDC</p>
                <div className="demo-builder-fields">
                  <span>Token · USDC</span>
                  <span>Any amount</span>
                </div>
              </div>

              <div className="demo-builder-connector" style={{ '--d': '0.45s' }}>
                <span className="demo-builder-dash" />
              </div>

              <div className="demo-builder-block is-then" style={{ '--d': '0.55s' }}>
                <div className="demo-builder-block-top">
                  <span className="demo-role is-then">THEN</span>
                  <span className="demo-builder-hint">Action · split</span>
                </div>
                <p className="demo-builder-line">Send 20% to savings</p>
                <div className="demo-builder-fields">
                  <span>20%</span>
                  <span>0x91de…0cf2</span>
                </div>
              </div>
            </div>

            <div className="demo-builder-footer" style={{ '--d': '0.75s' }}>
              <span className="demo-builder-status">
                <span className="status-dot is-on" />
                Ready to deploy on Sepolia
              </span>
              <span className="demo-builder-cta">Preview &amp; deploy</span>
            </div>
          </div>
        </div>
      </div>
    </DemoFrame>
  )
}

/** Activity feed demo — illustrative rows only. */
export function DemoActivity() {
  const { ref, inView } = useInView({ once: false, threshold: 0.08 })

  const rows = [
    {
      type: 'Deposit',
      badge: 'deposit',
      sub: 'From connected wallet',
      amount: '+2,400 USDC',
      tone: 'is-in',
      hash: '0x7a3f…e91c',
      time: '2m ago',
    },
    {
      type: 'Split',
      badge: 'split',
      sub: 'Automation · to savings',
      amount: '−480 USDC',
      tone: 'is-out',
      hash: '0xb21c…44a0',
      time: '2m ago',
    },
    {
      type: 'Schedule',
      badge: 'schedule',
      sub: 'Scheduled send · keeper',
      amount: '−100 USDC',
      tone: 'is-out',
      hash: '0x91de…0cf2',
      time: '1h ago',
    },
    {
      type: 'Swap',
      badge: 'swap',
      sub: 'DCA · USDC → ETH',
      amount: '+0.012 ETH',
      tone: 'is-swap',
      hash: '0x44a1…88be',
      time: '3h ago',
    },
  ]

  return (
    <DemoFrame title="Activity" path="app/vault">
      <div
        ref={ref}
        className={`demo-activity ${inView ? 'is-playing' : ''}`}
        aria-hidden="true"
      >
        <div className="demo-activity-head">
          <div>
            <p className="demo-activity-title">Recent activity</p>
            <p className="demo-activity-kicker">Confirmed on-chain only</p>
          </div>
          <span className="demo-pill is-on">
            <span className="status-dot is-on" />
            Synced
          </span>
        </div>
        <ul className="demo-activity-list">
          {rows.map((row, i) => (
            <li
              key={row.type}
              className="demo-activity-row"
              style={{ '--d': `${0.1 + i * 0.11}s` }}
            >
              <div className="demo-activity-main">
                <div className="demo-activity-top">
                  <span className={`demo-type-badge is-${row.badge}`}>
                    {row.type}
                  </span>
                  <span className="demo-confirmed">Confirmed</span>
                  <span className="demo-activity-time">{row.time}</span>
                </div>
                <p className="demo-activity-sub">{row.sub}</p>
                <p className="demo-activity-hash">{row.hash} ↗</p>
              </div>
              <p className={`demo-activity-amt ${row.tone}`}>{row.amount}</p>
            </li>
          ))}
        </ul>
      </div>
    </DemoFrame>
  )
}
