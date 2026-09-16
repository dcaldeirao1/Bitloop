import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { Contract, JsonRpcProvider, Wallet, id as keccakId, getAddress, isAddress } from 'ethers'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const PORT = Number(process.env.RELAYER_PORT || 8787)
const RPC_URL = (
  process.env.SEPOLIA_RPC_URL ||
  process.env.VITE_ALCHEMY_SEPOLIA_ENDPOINT ||
  ''
).trim()
const PRIVATE_KEY = (process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || '').trim()
const FACTORY_ADDRESS = (
  process.env.FACTORY_ADDRESS ||
  process.env.VITE_ACCOUNT_FACTORY_ADDRESS ||
  ''
).trim()
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim()

const FACTORY_ABI = [
  'function accountOf(bytes32 userId) view returns (address)',
  'function createAccount(bytes32 userId, address owner) returns (address)',
]

const ACCOUNT_ABI = [
  'function setSplit(address savings_, uint16 bps_, bool enabled_)',
  'function owner() view returns (address)',
  'function savings() view returns (address)',
  'function splitBps() view returns (uint16)',
  'function splitEnabled() view returns (bool)',
]

function requireEnv() {
  const missing = []
  if (!RPC_URL) missing.push('SEPOLIA_RPC_URL or VITE_ALCHEMY_SEPOLIA_ENDPOINT')
  if (!PRIVATE_KEY) missing.push('PRIVATE_KEY')
  if (!FACTORY_ADDRESS) missing.push('FACTORY_ADDRESS or VITE_ACCOUNT_FACTORY_ADDRESS')
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL')
  if (!SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY')
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(', ')}`)
  }
}

function userIdBytes32(userUuid) {
  return keccakId(userUuid)
}

async function getAuthedUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    const err = new Error('Missing Authorization bearer token')
    err.status = 401
    throw err
  }
  const token = authHeader.slice(7)
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    const err = new Error('Invalid session')
    err.status = 401
    throw err
  }
  return { user: data.user, supabase, token }
}

function getWallet() {
  const provider = new JsonRpcProvider(RPC_URL)
  return new Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`, provider)
}

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, factory: FACTORY_ADDRESS || null })
})

app.post('/create-account', async (req, res) => {
  try {
    requireEnv()
    const { user, supabase } = await getAuthedUser(req.headers.authorization)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, account_address')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    if (profile.account_address) {
      return res.json({
        accountAddress: profile.account_address,
        created: false,
      })
    }

    const wallet = getWallet()
    const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet)
    const salt = userIdBytes32(user.id)

    const existing = await factory.accountOf(salt)
    let accountAddress = existing

    if (existing === '0x0000000000000000000000000000000000000000') {
      const tx = await factory.createAccount(salt, wallet.address)
      const receipt = await tx.wait()
      accountAddress = await factory.accountOf(salt)
      if (!accountAddress || accountAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(`createAccount mined but address missing (tx ${receipt?.hash})`)
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        account_address: getAddress(accountAddress),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) throw updateError

    res.json({
      accountAddress: getAddress(accountAddress),
      created: true,
      owner: wallet.address,
    })
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'create-account failed' })
  }
})

app.post('/configure-split', async (req, res) => {
  try {
    requireEnv()
    const { user, supabase } = await getAuthedUser(req.headers.authorization)
    const { savingsAddress, percent, enabled = true, automationId } = req.body || {}

    if (!isAddress(savingsAddress)) {
      return res.status(400).json({ error: 'Invalid savings address' })
    }
    const pct = Number(percent)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return res.status(400).json({ error: 'percent must be 1–100' })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_address')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError
    if (!profile?.account_address) {
      return res.status(400).json({ error: 'Smart account not created yet' })
    }

    const bps = Math.round(pct * 100)
    const wallet = getWallet()
    const account = new Contract(profile.account_address, ACCOUNT_ABI, wallet)

    const owner = await account.owner()
    if (getAddress(owner) !== getAddress(wallet.address)) {
      return res.status(403).json({
        error: 'Relayer is not the smart account owner',
      })
    }

    const tx = await account.setSplit(getAddress(savingsAddress), bps, Boolean(enabled))
    const receipt = await tx.wait()

    if (automationId) {
      await supabase
        .from('automations')
        .update({
          onchain_configured: true,
          enabled: Boolean(enabled),
          updated_at: new Date().toISOString(),
        })
        .eq('id', automationId)
        .eq('user_id', user.id)
    }

    res.json({
      txHash: receipt.hash,
      accountAddress: profile.account_address,
      savingsAddress: getAddress(savingsAddress),
      percent: pct,
      enabled: Boolean(enabled),
    })
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'configure-split failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Relayer listening on http://localhost:${PORT}`)
})
