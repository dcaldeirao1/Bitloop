import { Link } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { WalletMenu } from './WalletButton'

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
        <Link to="/app" className="text-[15px] font-semibold tracking-tight text-ink">
          Programmable Money
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <WalletMenu />
        </div>
      </div>
    </header>
  )
}
