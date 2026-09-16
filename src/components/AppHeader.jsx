import { Link, NavLink } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { WalletMenu } from './WalletButton'

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-[15px] font-semibold tracking-tight text-ink">
            Programmable Money
          </Link>
          <nav className="flex gap-1 text-[13px] font-medium">
            <NavLink
              to="/app"
              end
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 transition ${
                  isActive ? 'bg-bg text-ink' : 'text-muted hover:text-ink'
                }`
              }
            >
              Automations
            </NavLink>
            <NavLink
              to="/app/vault"
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 transition ${
                  isActive ? 'bg-bg text-ink' : 'text-muted hover:text-ink'
                }`
              }
            >
              Vault
            </NavLink>
            <NavLink
              to="/app/new"
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 transition ${
                  isActive ? 'bg-bg text-ink' : 'text-muted hover:text-ink'
                }`
              }
            >
              New
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <WalletMenu />
        </div>
      </div>
    </header>
  )
}
