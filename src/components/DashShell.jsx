import { useLocation, useNavigate } from 'react-router-dom'
import { AppHeader } from './AppHeader'

/** Primary app sections — single source of truth for sidebar + mobile chips. */
export const APP_NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'automations', label: 'Automations', countKey: 'automations' },
  { id: 'trenches', label: 'Trenches', countKey: 'trenches' },
  { id: 'perps', label: 'Perps', soon: true },
  { id: 'settings', label: 'Settings', footer: true },
]

/** Legacy query params → canonical section ids. */
export const SECTION_ALIASES = {
  home: 'overview',
  basic: 'automations',
  trading: 'trenches',
  'auto-perps': 'perps',
}

export function normalizeSection(raw) {
  if (!raw) return 'overview'
  if (SECTION_ALIASES[raw]) return SECTION_ALIASES[raw]
  if (APP_NAV.some((n) => n.id === raw)) return raw
  return 'overview'
}

/**
 * Shared dashboard chrome: header + left sidebar.
 * `section` is the active /app section id.
 */
export function DashShell({
  children,
  section = 'overview',
  onSelectSection,
  autoCounts = {},
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const onDash = location.pathname === '/app' || location.pathname === '/app/'
  const onVault = location.pathname.startsWith('/app/vault')
  const active = normalizeSection(section)

  const go = (id) => {
    if (onSelectSection) onSelectSection(id)
    if (!onDash) navigate(id === 'overview' ? '/app' : `/app?section=${id}`)
  }

  const primary = APP_NAV.filter((n) => !n.footer)
  const footer = APP_NAV.filter((n) => n.footer)

  const renderItem = (item) => {
    const isActive = onDash && active === item.id
    const count = item.countKey ? autoCounts[item.countKey] : undefined
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => go(item.id)}
        className={`dash-nav-item ${isActive ? 'is-active' : ''}`}
      >
        <span>{item.label}</span>
        {item.soon ? (
          <span className="dash-nav-soon">Soon</span>
        ) : count != null ? (
          <span className="dash-nav-count">{count || 0}</span>
        ) : null}
      </button>
    )
  }

  return (
    <div className="dash-shell">
      <AppHeader />
      <div className="dash-layout">
        <div className="dash-mobile-nav">
          {APP_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={`dash-chip ${onDash && active === item.id ? 'is-active' : ''}`}
            >
              {item.label}
              {!item.soon && item.countKey && autoCounts[item.countKey]
                ? ` ${autoCounts[item.countKey]}`
                : ''}
            </button>
          ))}
          {onVault ? (
            <button type="button" className="dash-chip is-active" disabled>
              Vault
            </button>
          ) : null}
        </div>

        <aside className="dash-sidebar">
          <p className="dash-nav-group">Workspace</p>
          <nav className="flex flex-1 flex-col gap-0.5">{primary.map(renderItem)}</nav>

          <div className="mt-auto border-t border-line pt-2">
            {footer.map(renderItem)}
          </div>
        </aside>

        <main className="dash-main">{children}</main>
      </div>
    </div>
  )
}
