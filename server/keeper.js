import dotenv from 'dotenv'
import { Contract, JsonRpcProvider, Wallet, getAddress } from 'ethers'

dotenv.config()

const RPC_URL = (
  process.env.SEPOLIA_RPC_URL ||
  process.env.VITE_ALCHEMY_SEPOLIA_ENDPOINT ||
  ''
).trim()
const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').trim()
const FACTORY_ADDRESS = (
  process.env.FACTORY_ADDRESS ||
  process.env.VITE_ACCOUNT_FACTORY_ADDRESS ||
  ''
).trim()
const USDC = getAddress(
  process.env.VITE_USDC_ADDRESS || '0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212',
)
const POLL_MS = Number(process.env.KEEPER_POLL_MS || 15_000)

const FACTORY_ABI = [
  'function accountCount() view returns (uint256)',
  'function allAccounts(uint256 index) view returns (address)',
]

const ACCOUNT_ABI = [
  'function splitEnabled() view returns (bool)',
  'function splitToken() view returns (address)',
  'function accounted(address token) view returns (uint256)',
  'function processToken(address token_) returns (uint256)',
  'function recurringEnabled() view returns (bool)',
  'function recurringToken() view returns (address)',
  'function recurringAmount() view returns (uint256)',
  'function recurringInterval() view returns (uint256)',
  'function recurringLastExecuted() view returns (uint256)',
  'function executeRecurring() returns (uint256)',
]

const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)']

async function maybeProcessSplit(vaultAddr, vault, usdc, wallet) {
  try {
    const enabled = await vault.splitEnabled()
    if (!enabled) return

    const token = await vault.splitToken()
    if (getAddress(token) !== USDC) return

    const bal = await usdc.balanceOf(vaultAddr)
    const accounted = await vault.accounted(USDC)
    if (bal <= accounted) return

    const connected = vault.connect(wallet)
    const tx = await connected.processToken(USDC)
    const receipt = await tx.wait()
    console.log(
      `split ${vaultAddr} incoming=${(bal - accounted).toString()} tx=${receipt.hash}`,
    )
  } catch (err) {
    // Old vaults without split still fine; ignore disabled/wrong-token noise
    const msg = err?.shortMessage || err?.message || String(err)
    if (!/SplitDisabled|WrongToken|execution reverted/i.test(msg)) {
      console.warn(`split ${vaultAddr}:`, msg)
    }
  }
}

async function maybeExecuteRecurring(vaultAddr, vault, usdc, wallet) {
  try {
    const enabled = await vault.recurringEnabled()
    if (!enabled) return

    const token = await vault.recurringToken()
    if (getAddress(token) !== USDC) return

    const amount = await vault.recurringAmount()
    if (amount === 0n) return

    const bal = await usdc.balanceOf(vaultAddr)
    if (bal < amount) return

    const interval = await vault.recurringInterval()
    const last = await vault.recurringLastExecuted()
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (last !== 0n && now < last + interval) return

    const connected = vault.connect(wallet)
    const tx = await connected.executeRecurring()
    const receipt = await tx.wait()
    console.log(`recurring ${vaultAddr} amount=${amount.toString()} tx=${receipt.hash}`)
  } catch (err) {
    const msg = err?.shortMessage || err?.message || String(err)
    // Old vaults won't have recurring*; skip quietly
    if (/recurringEnabled|RecurringNotDue|RecurringDisabled|InsufficientBalance/i.test(msg)) {
      return
    }
    if (!/execution reverted/i.test(msg)) {
      console.warn(`recurring ${vaultAddr}:`, msg)
    }
  }
}

async function main() {
  if (!RPC_URL || !PRIVATE_KEY || !FACTORY_ADDRESS) {
    throw new Error('Need SEPOLIA_RPC_URL, PRIVATE_KEY, and FACTORY_ADDRESS')
  }

  const provider = new JsonRpcProvider(RPC_URL)
  const wallet = new Wallet(
    PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`,
    provider,
  )
  const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider)
  const usdc = new Contract(USDC, ERC20_ABI, provider)

  console.log('Keeper running')
  console.log('  factory', FACTORY_ADDRESS)
  console.log('  usdc   ', USDC)
  console.log('  signer ', wallet.address)

  const tick = async () => {
    try {
      const count = Number(await factory.accountCount())
      for (let i = 0; i < count; i++) {
        const vaultAddr = await factory.allAccounts(i)
        const vault = new Contract(vaultAddr, ACCOUNT_ABI, provider)
        await maybeProcessSplit(vaultAddr, vault, usdc, wallet)
        await maybeExecuteRecurring(vaultAddr, vault, usdc, wallet)
      }
    } catch (err) {
      console.error('tick error', err.message || err)
    }
  }

  await tick()
  setInterval(() => void tick(), POLL_MS)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
