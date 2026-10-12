import { useState } from 'react'
import { useWallet } from '../context/WalletContext'
import { isVaultChain } from '../lib/chains'
import { SEPOLIA_CHAIN_ID } from '../lib/wallet'

/** Shown when MetaMask is connected but not on the vault chain (Sepolia). */
export function NetworkBanner() {
  const { address, chainId, chainName, switchChain, switchingChain } = useWallet()
  const [err, setErr] = useState(null)

  if (!address || chainId == null || isVaultChain(chainId)) return null

  return (
    <div className="network-banner mb-4" role="status">
      <div>
        <p className="text-[13px] font-medium text-ink">
          Vault automations need Sepolia
        </p>
        <p className="mt-0.5 text-[12px] text-muted">
          Connected to {chainName || `chain ${chainId}`}. Spot / perps UIs still
          work; vault deploy, deposits, and on-chain rules need Sepolia.
        </p>
        {err ? <p className="mt-1 text-[12px] text-danger">{err}</p> : null}
      </div>
      <button
        type="button"
        className="btn-primary shrink-0 text-[13px]"
        disabled={switchingChain}
        onClick={() => {
          setErr(null)
          void switchChain(SEPOLIA_CHAIN_ID).catch((e) => {
            if (e?.code === 4001) return
            setErr(e?.message || 'Could not switch network')
          })
        }}
      >
        {switchingChain ? 'Switching…' : 'Switch to Sepolia'}
      </button>
    </div>
  )
}
