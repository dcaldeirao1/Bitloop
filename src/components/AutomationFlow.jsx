import {
  getAutomationBlocks,
  getAutomationFunding,
  getAutomationSchedule,
} from '../lib/automationBlocks'

function FlowWire({ tone = 'teal' }) {
  return (
    <div className={`flow-wire tone-${tone}`} aria-hidden="true">
      <svg className="flow-wire-svg" viewBox="0 0 64 28" preserveAspectRatio="none">
        <path className="flow-wire-track" d="M2 14 H50" />
        <path className="flow-wire-flux" d="M2 14 H50" />
        <path
          className="flow-wire-head"
          d="M48 8.5 L56 14 L48 19.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="flow-wire-dot" />
    </div>
  )
}

function FlowNode({ role, variant, title, lines }) {
  const body = Array.isArray(lines) ? lines.filter(Boolean).join(' · ') : String(lines || '')

  return (
    <div className={`flow-node flow-node-${variant}`}>
      <div className="flow-node-chrome">
        <span className="flow-node-role">{role}</span>
        <span className="flow-node-title">{title}</span>
      </div>
      <p className="flow-node-line">{body}</p>
    </div>
  )
}

export function AutomationFlow({ rule, compact = false, paused = false }) {
  const { ifBlock, thenBlocks } = getAutomationBlocks(rule)
  const shown = compact ? thenBlocks.slice(0, 2) : thenBlocks
  const extra = compact && thenBlocks.length > 2 ? thenBlocks.length - 2 : 0

  return (
    <div
      className={`flow-diagram ${compact ? 'is-compact' : ''} ${paused ? 'is-paused' : ''}`}
    >
      <div className="flow-diagram-lane">
        <FlowNode
          role="Trigger"
          variant="if"
          title={ifBlock.title}
          lines={ifBlock.lines}
        />

        {shown.map((block, i) => (
          <div key={`${block.title}-${i}`} className="flow-diagram-step">
            <FlowWire tone={block.title === 'Stop' ? 'danger' : i === 0 ? 'mix' : 'mango'} />
            <FlowNode
              role={i === 0 ? 'Action' : 'Then'}
              variant={block.title === 'Stop' ? 'stop' : 'then'}
              title={block.title}
              lines={block.lines}
            />
          </div>
        ))}

        {extra > 0 ? (
          <div className="flow-diagram-step">
            <FlowWire tone="mango" />
            <FlowNode role="Then" variant="then" title="More" lines={[`+${extra} steps`]} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AutomationCard({
  rule,
  busy,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onDelete,
  onTestSandbox = null,
  expandLabel = 'Details',
  collapseLabel = 'Hide',
  onchainTiming = null,
  balances = null,
  children,
}) {
  const funding = getAutomationFunding(rule, balances)
  const starved = Boolean(funding.starved)
  const visuallyPaused = !rule.enabled || starved
  const schedule = getAutomationSchedule(rule, onchainTiming, funding)
  const hasDetail = Boolean(
    children &&
      (Array.isArray(children)
        ? children.some(Boolean)
        : children),
  )

  return (
    <article
      className={`automation-card ${!rule.enabled ? 'is-off' : ''} ${
        starved ? 'is-starved' : ''
      }`}
    >
      <div className="automation-card-top">
        <div className="automation-card-lead">
          <span
            className={`status-pill ${
              starved ? 'is-warn' : rule.enabled ? 'is-on' : ''
            }`}
          >
            <span className="status-dot" aria-hidden="true" />
            {visuallyPaused ? 'Paused' : 'Active'}
          </span>
          <div className="automation-schedule" title="Execution timing">
            <span>
              <em>Last</em> {schedule.lastLabel}
            </span>
            <span className="automation-schedule-sep" aria-hidden="true">
              ·
            </span>
            <span>
              <em>Next</em> {schedule.nextLabel}
            </span>
          </div>
        </div>
        <div className="automation-actions">
          <button type="button" className="flow-action" onClick={onToggleExpand}>
            {expanded ? collapseLabel : expandLabel}
          </button>
          {onTestSandbox ? (
            <button type="button" className="flow-action" onClick={onTestSandbox}>
              Test in sandbox
            </button>
          ) : null}
          <button
            type="button"
            className="flow-action"
            disabled={busy}
            onClick={onToggleEnabled}
          >
            {rule.enabled ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="flow-action is-danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {starved ? (
        <p className="automation-fund-warn" role="status">
          Vault is out of funds
        </p>
      ) : null}

      <AutomationFlow rule={rule} compact paused={visuallyPaused} />

      {hasDetail ? <div className="automation-card-detail">{children}</div> : null}
    </article>
  )
}
