import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  chainLabel,
  connectWallet,
  hasMetaMask,
  markWalletConnected,
  markWalletDisconnected,
  onAccountsChanged,
  onChainChanged,
  restoreWallet,
  wasWalletConnected,
} from '../lib/wallet'

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [restoring, setRestoring] = useState(() => wasWalletConnected())
  const [error, setError] = useState(null)
  const [hasExtension, setHasExtension] = useState(() => hasMetaMask())

  const disconnect = useCallback(() => {
    markWalletDisconnected()
    setAddress(null)
    setChainId(null)
    setError(null)
  }, [])

  const applySession = useCallback((result) => {
    markWalletConnected()
    setAddress(result.address)
    setChainId(result.chainId)
    setError(null)
  }, [])

  const connect = useCallback(async () => {
    setHasExtension(hasMetaMask())
    setConnecting(true)
    setError(null)
    try {
      const result = await connectWallet()
      applySession(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect'
      setError(msg)
      setAddress(null)
      setChainId(null)
    } finally {
      setConnecting(false)
    }
  }, [applySession])

  // Restore session on refresh / first load
  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      if (!wasWalletConnected() || !hasMetaMask()) {
        setRestoring(false)
        return
      }

      try {
        const result = await restoreWallet()
        if (cancelled) return
        if (result?.address) {
          applySession(result)
        }
        // Keep connected flag even if MetaMask is locked (no accounts yet)
      } catch {
        if (!cancelled) setError(null)
      } finally {
        if (!cancelled) setRestoring(false)
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [applySession])

  useEffect(() => {
    const offAccounts = onAccountsChanged((accounts) => {
      // Switching accounts in MetaMask → stay connected with the new address.
      // Empty list (lock / temporary) must NOT clear the persistence flag.
      if (accounts?.length) {
        setAddress(accounts[0])
        markWalletConnected()
        return
      }
      setAddress(null)
    })

    const offChain = onChainChanged((hex) => {
      const id = Number.parseInt(hex, 16)
      if (!Number.isNaN(id)) setChainId(id)
    })

    return () => {
      offAccounts()
      offChain()
    }
  }, [])

  // If MetaMask unlocks later and we still want a session, pick the account up
  useEffect(() => {
    if (address || !wasWalletConnected() || !hasMetaMask()) return

    const onFocus = () => {
      void restoreWallet()
        .then((result) => {
          if (result?.address) applySession(result)
        })
        .catch(() => {})
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [address, applySession])

  const value = useMemo(
    () => ({
      address,
      chainId,
      chainName: chainId != null ? chainLabel(chainId) : '—',
      connecting: connecting || restoring,
      error,
      hasExtension,
      connect,
      disconnect,
    }),
    [
      address,
      chainId,
      connecting,
      restoring,
      error,
      hasExtension,
      connect,
      disconnect,
    ],
  )

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
