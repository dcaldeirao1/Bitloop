import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { WalletProvider } from './context/WalletContext'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { NewRule } from './pages/NewRule'
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
            <Route path="/app/new" element={<NewRule />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </ThemeProvider>
  )
}
