import { BrandLogo } from './BrandLogo'
import { ChainSwitcher } from './ChainSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { WalletMenu } from './WalletButton'

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <BrandLogo to="/app" size="nav" />

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ChainSwitcher />
          <WalletMenu />
        </div>
      </div>
    </header>
  )
}
