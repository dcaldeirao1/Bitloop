/**
 * App-supported EVM networks for MetaMask switching + read RPCs.
 * Vault automations remain Sepolia-only until contracts are deployed elsewhere.
 */

export const SEPOLIA_CHAIN_ID = 11155111
export const ETH_CHAIN_ID = 1
export const BASE_CHAIN_ID = 8453
export const ARB_CHAIN_ID = 42161
export const ROBINHOOD_CHAIN_ID = 4663

/** Chains shown in the network switcher (order = UI order). */
export const APP_CHAINS = [
  {
    id: SEPOLIA_CHAIN_ID,
    key: 'sepolia',
    name: 'Sepolia',
    shortName: 'Sepolia',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://sepolia.etherscan.io',
    vaultSupported: true,
    envKeys: ['VITE_ALCHEMY_SEPOLIA_ENDPOINT', 'VITE_SEPOLIA_RPC_URL'],
    publicRpcFallback: 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  {
    id: ETH_CHAIN_ID,
    key: 'ethereum',
    name: 'Ethereum',
    shortName: 'ETH',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://etherscan.io',
    vaultSupported: false,
    envKeys: ['VITE_ETH_RPC_URL', 'VITE_ALCHEMY_MAINNET_ENDPOINT'],
    publicRpcFallback: 'https://ethereum.publicnode.com',
  },
  {
    id: BASE_CHAIN_ID,
    key: 'base',
    name: 'Base',
    shortName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://basescan.org',
    vaultSupported: false,
    envKeys: ['VITE_BASE_RPC_URL', 'VITE_ALCHEMY_BASE_ENDPOINT'],
    publicRpcFallback: 'https://mainnet.base.org',
  },
  {
    id: ARB_CHAIN_ID,
    key: 'arbitrum',
    name: 'Arbitrum One',
    shortName: 'Arb',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://arbiscan.io',
    vaultSupported: false,
    envKeys: ['VITE_ARB_RPC_URL', 'VITE_ALCHEMY_ARB_ENDPOINT'],
    publicRpcFallback: 'https://arb1.arbitrum.io/rpc',
  },
  {
    id: ROBINHOOD_CHAIN_ID,
    key: 'robinhood',
    name: 'Robinhood Chain',
    shortName: 'RH',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://robinhoodchain.blockscout.com',
    vaultSupported: false,
    envKeys: ['VITE_ROBINHOOD_RPC_URL'],
    publicRpcFallback: 'https://rpc.mainnet.chain.robinhood.com',
  },
]

const BY_ID = Object.fromEntries(APP_CHAINS.map((c) => [c.id, c]))

export function getChain(chainId) {
  return BY_ID[Number(chainId)] ?? null
}

export function chainLabel(chainId) {
  return getChain(chainId)?.name ?? `Chain ${chainId}`
}

export function isSepolia(chainId) {
  return Number(chainId) === SEPOLIA_CHAIN_ID
}

export function isVaultChain(chainId) {
  return Boolean(getChain(chainId)?.vaultSupported)
}

export function explorerAddressUrl(chainId, address) {
  const base = getChain(chainId)?.explorerUrl
  if (!base || !address) return null
  return `${base}/address/${address}`
}

/** Resolve browser RPC for a chain (VITE_ env → public fallback). */
export function getChainRpcUrl(chainId) {
  const chain = getChain(chainId)
  if (!chain) return ''

  for (const key of chain.envKeys) {
    const value = String(import.meta.env[key] || '').trim()
    if (value) return value
  }
  return chain.publicRpcFallback || ''
}

/** MetaMask wallet_addEthereumChain payload. */
export function toWalletChainParams(chain) {
  const rpc = getChainRpcUrl(chain.id)
  return {
    chainId: `0x${Number(chain.id).toString(16)}`,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: rpc ? [rpc] : [],
    blockExplorerUrls: chain.explorerUrl ? [chain.explorerUrl] : [],
  }
}
