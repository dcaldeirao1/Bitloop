import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { WalletProvider } from './context/WalletContext'
import { Builder } from './pages/Builder'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { VaultPage } from './pages/Vault'

export default function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<Dashboard />} />
            <Route path="/app/vault" element={<VaultPage />} />
            <Route path="/app/new" element={<Builder />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </ThemeProvider>
  )
}
