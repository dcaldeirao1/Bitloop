import { useEffect, useRef, useState } from 'react'
import { truncateAddress } from '../lib/automations'
import { useWallet } from '../context/WalletContext'

/** Standalone connect CTA (empty states, landing CTAs). */
export function WalletButton({
  onClick,
  connecting = false,
  label = 'Connect wallet',
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={connecting}
      className={`wallet-connect-btn disabled:cursor-wait ${className}`}
    >
      <MetaMaskIcon />
      <span>{connecting ? 'Connecting…' : label}</span>
    </button>
  )
}

/** Header control: connect CTA or connected account menu. */
export function WalletMenu() {
  const { address, chainName, chainId, connecting, connect, disconnect } =
    useWallet()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef(null)

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

  if (!address) {
    return (
      <WalletButton
        onClick={() => void connect()}
        connecting={connecting}
        className="!px-3.5 !py-2 !text-[13px]"
      />
    )
  }

  const copy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const explorer =
    chainId === 11155111
      ? `https://sepolia.etherscan.io/address/${address}`
      : chainId === 1
        ? `https://etherscan.io/address/${address}`
        : null

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="wallet-account-btn"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="wallet-fox">
          <MetaMaskIcon size={14} />
        </span>
        <span className="hidden font-mono text-[13px] text-ink sm:inline">
          {truncateAddress(address, 4)}
        </span>
        <span className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
          {chainName}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          role="menu"
        >
          <div className="border-b border-line px-3.5 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Connected
            </p>
            <p className="mt-1 break-all font-mono text-[12px] text-ink">
              {address}
            </p>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void copy()}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-bg"
            >
              {copied ? 'Copied' : 'Copy address'}
            </button>
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-bg"
              >
                View on explorer
              </a>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                disconnect()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger hover:bg-danger-soft"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
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

function MetaMaskIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 318 318" aria-hidden>
      <path fill="#E2761B" d="M274.1 35.5l-99.5 73.9L193 65.8z" />
      <path
        fill="#E4761B"
        d="M44.4 35.5l98.7 74.6-17.5-44.3zm193.9 171.3l-26.9 41.2 57.6 15.8 16.5-56.1zm-204.3.9l16.4 56.1 57.5-15.8-26.8-41.2z"
      />
      <path
        fill="#E4761B"
        d="M103.6 138.2l-15.8 23.9 56.3 2.5-2-60.6zm111.3 0l-39-34.8-1.6 61.2 56.2-2.5zM106.8 247.9l33.8-16.5-29.2-22.8zm71.1-16.5l33.9 16.5-4.7-39.3z"
      />
    </svg>
  )
}
