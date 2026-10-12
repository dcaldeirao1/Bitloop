import { useState } from 'react'
import { useWallet } from '../context/WalletContext'
import { isSepolia, switchToSepolia } from '../lib/wallet'

/** Shown when MetaMask is connected but not on Sepolia (vault chain). */
export function NetworkBanner() {
  const { address, chainId, chainName } = useWallet()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  if (!address || chainId == null || isSepolia(chainId)) return null

  return (
    <div className="network-banner mb-4" role="status">
      <div>
        <p className="text-[13px] font-medium text-ink">
          Wrong network — vault automations run on Sepolia
        </p>
        <p className="mt-0.5 text-[12px] text-muted">
          Connected to {chainName || `chain ${chainId}`}. Balances and transactions
          will fail until you switch.
        </p>
        {err ? <p className="mt-1 text-[12px] text-danger">{err}</p> : null}
      </div>
      <button
        type="button"
        className="btn-primary shrink-0 text-[13px]"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setErr(null)
          void switchToSepolia()
            .catch((e) =>
              setErr(e?.message || 'Could not switch network'),
            )
            .finally(() => setBusy(false))
        }}
      >
        {busy ? 'Switching…' : 'Switch to Sepolia'}
      </button>
    </div>
  )
}
