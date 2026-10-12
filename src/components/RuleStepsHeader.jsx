import { RULE_STEPS, getCategoryMeta } from '../lib/ruleCategories'

/**
 * Shared builder chrome: Trigger → Action → Test → Deploy.
 * `activeStep` is 1–4 (completed steps render as done).
 */
export function RuleStepsHeader({
  categoryId = 'save-pay',
  activeStep = 1,
  title,
  subtitle,
}) {
  const meta = getCategoryMeta(categoryId)

  return (
    <div className="rule-steps-header">
      <div className="rule-steps-intro">
        <p className="rule-steps-eyebrow">{meta.label}</p>
        <h1 className="dash-title">{title || 'New rule'}</h1>
        {subtitle ? <p className="dash-subtitle">{subtitle}</p> : null}
      </div>
      <ol className="rule-steps" aria-label="Rule steps">
        {RULE_STEPS.map((step) => {
          const state =
            step.n < activeStep ? 'is-done' : step.n === activeStep ? 'is-active' : ''
          return (
            <li key={step.id} className={`rule-step ${state}`}>
              <span className="rule-step-n">{step.n}</span>
              <span className="rule-step-label">{step.label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Env badge: On-chain (Sepolia) / Paper / Testnet */
export function EnvBadge({ env }) {
  if (!env) return null
  return (
    <span className={`rule-env-badge ${env.tone || ''}`}>
      {env.label}
    </span>
  )
}

/** Category badge for lists / activity */
export function CategoryBadge({ categoryId }) {
  const meta = getCategoryMeta(categoryId)
  return (
    <span className={`rule-category-badge is-${categoryId}`}>
      {meta.shortLabel}
    </span>
  )
}
