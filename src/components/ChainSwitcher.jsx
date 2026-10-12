import { useEffect, useRef, useState } from 'react'
import { useWallet } from '../context/WalletContext'
import { APP_CHAINS, getChain } from '../lib/chains'

/** Header control: switch MetaMask across configured app chains. */
export function ChainSwitcher() {
  const { address, chainId, switchChain, switchingChain } = useWallet()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)
  const rootRef = useRef(null)

  const current = getChain(chainId)
  const label = current?.shortName || (chainId != null ? `ID ${chainId}` : 'Network')

  useEffect(() => {
    if (!open) return
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!address) return null

  const onSelect = async (id) => {
    if (id === chainId) {
      setOpen(false)
      return
    }
    setError(null)
    try {
      await switchChain(id)
      setOpen(false)
    } catch (err) {
      if (err?.code === 4001) {
        setError('Switch rejected in wallet')
        return
      }
      setError(err?.message || 'Could not switch network')
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="chain-switcher-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={switchingChain}
      >
        <span className={`chain-dot ${current?.vaultSupported ? 'is-vault' : ''}`} />
        <span>{switchingChain ? 'Switching…' : label}</span>
        <Chevron open={open} />
      </button>

      {open ? (
        <div className="chain-switcher-menu" role="listbox" aria-label="Networks">
          <p className="chain-switcher-hint">
            Switch MetaMask network. Uses your configured Alchemy RPCs when adding a chain.
          </p>
          {APP_CHAINS.map((chain) => {
            const active = chain.id === chainId
            return (
              <button
                key={chain.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`chain-switcher-item ${active ? 'is-active' : ''}`}
                onClick={() => void onSelect(chain.id)}
                disabled={switchingChain}
              >
                <span className="chain-switcher-item-main">
                  <span className="chain-switcher-name">{chain.name}</span>
                  {chain.vaultSupported ? (
                    <span className="chain-switcher-tag">Vault</span>
                  ) : null}
                </span>
                <span className="chain-switcher-id">{chain.id}</span>
              </button>
            )
          })}
          {error ? <p className="chain-switcher-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function Chevron({ open }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className={`text-muted transition ${open ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
