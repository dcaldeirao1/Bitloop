import { BrowserProvider } from 'ethers'

export const CHAIN_NAMES = {
  1: 'Ethereum',
  11155111: 'Sepolia',
  8453: 'Base',
  84532: 'Base Sepolia',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
}

const CONNECTED_KEY = 'programmable-money-wallet-connected'

export function hasMetaMask() {
  return typeof window !== 'undefined' && Boolean(window.ethereum?.isMetaMask)
}

export function getProvider() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed')
  }
  return new BrowserProvider(window.ethereum)
}

export function wasWalletConnected() {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

export function markWalletConnected() {
  try {
    localStorage.setItem(CONNECTED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function markWalletDisconnected() {
  try {
    localStorage.removeItem(CONNECTED_KEY)
  } catch {
    /* ignore */
  }
}

/** Silent restore — does not prompt MetaMask. */
export async function restoreWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed')
  }

  const accounts = await window.ethereum.request({ method: 'eth_accounts' })
  if (!accounts?.length) {
    return null
  }

  const provider = getProvider()
  const network = await provider.getNetwork()

  return {
    address: accounts[0],
    chainId: Number(network.chainId),
  }
}

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install the MetaMask extension.')
  }

  const provider = getProvider()
  await provider.send('eth_requestAccounts', [])
  const signer = await provider.getSigner()
  const address = await signer.getAddress()
  const network = await provider.getNetwork()

  return {
    address,
    chainId: Number(network.chainId),
  }
}

export async function getChainId() {
  const provider = getProvider()
  const network = await provider.getNetwork()
  return Number(network.chainId)
}

export function chainLabel(chainId) {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

export const SEPOLIA_CHAIN_ID = 11155111

export function isSepolia(chainId) {
  return Number(chainId) === SEPOLIA_CHAIN_ID
}

/** Prompt MetaMask to switch to Sepolia (adds the network if missing). */
export async function switchToSepolia() {
  if (!window.ethereum) throw new Error('MetaMask is not installed')
  const hex = `0x${SEPOLIA_CHAIN_ID.toString(16)}`
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }],
    })
  } catch (err) {
    if (err?.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hex,
            chainName: 'Sepolia',
            nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          },
        ],
      })
      return
    }
    throw err
  }
}

export function onAccountsChanged(handler) {
  const eth = window.ethereum
  if (!eth?.on) return () => {}

  const listener = (...args) => {
    handler(args[0] ?? [])
  }
  eth.on('accountsChanged', listener)
  return () => eth.removeListener?.('accountsChanged', listener)
}

export function onChainChanged(handler) {
  const eth = window.ethereum
  if (!eth?.on) return () => {}

  const listener = (...args) => {
    handler(String(args[0] ?? ''))
  }
  eth.on('chainChanged', listener)
  return () => eth.removeListener?.('chainChanged', listener)
}
