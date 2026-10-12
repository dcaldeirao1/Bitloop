/**
 * Trigger → Action summary strip (matches AutomationFlow visual language).
 */
export function RuleFlowSummary({
  triggerTitle = 'Trigger',
  triggerBody,
  actionTitle = 'Action',
  actionBody,
  envBadge = null,
}) {
  return (
    <div className="rule-flow-summary">
      <div className="rule-flow-summary-top">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          Rule shape
        </p>
        {envBadge}
      </div>
      <div className="flow-diagram is-compact">
        <div className="flow-diagram-lane">
          <div className="flow-node flow-node-if">
            <div className="flow-node-chrome">
              <span className="flow-node-role">Trigger</span>
              <span className="flow-node-title">{triggerTitle}</span>
            </div>
            <p className="flow-node-line">{triggerBody}</p>
          </div>
          <div className="flow-diagram-step">
            <div className="flow-wire tone-mix" aria-hidden="true">
              <svg
                className="flow-wire-svg"
                viewBox="0 0 64 28"
                preserveAspectRatio="none"
              >
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
            </div>
            <div className="flow-node flow-node-then">
              <div className="flow-node-chrome">
                <span className="flow-node-role">Action</span>
                <span className="flow-node-title">{actionTitle}</span>
              </div>
              <p className="flow-node-line">{actionBody}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
