import { BrowserProvider } from 'ethers'
import {
  APP_CHAINS,
  SEPOLIA_CHAIN_ID,
  chainLabel,
  getChain,
  isSepolia,
  toWalletChainParams,
} from './chains'

export { APP_CHAINS, SEPOLIA_CHAIN_ID, chainLabel, isSepolia }
export { getChain, getChainRpcUrl, isVaultChain, explorerAddressUrl } from './chains'

/** @deprecated use APP_CHAINS / chainLabel — kept for older imports */
export const CHAIN_NAMES = Object.fromEntries(
  APP_CHAINS.map((c) => [c.id, c.name]),
)

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

/**
 * Switch MetaMask to a supported chain. Adds the network (with our RPC) if missing.
 */
export async function switchChain(chainId) {
  if (!window.ethereum) throw new Error('MetaMask is not installed')

  const chain = getChain(chainId)
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`)

  const hex = `0x${Number(chain.id).toString(16)}`
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }],
    })
  } catch (err) {
    // 4902 = unrecognized chain — add it with our Alchemy/public RPC
    if (err?.code === 4902 || err?.code === -32603) {
      const params = toWalletChainParams(chain)
      if (!params.rpcUrls?.length) {
        throw new Error(`No RPC configured for ${chain.name}`)
      }
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [params],
      })
      return
    }
    throw err
  }
}

/** Prompt MetaMask to switch to Sepolia (adds the network if missing). */
export async function switchToSepolia() {
  return switchChain(SEPOLIA_CHAIN_ID)
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
