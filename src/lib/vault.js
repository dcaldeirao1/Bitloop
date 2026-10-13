import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  formatUnits,
  getAddress,
  MaxUint256,
  parseUnits,
} from 'ethers'
import { isVaultKindActive } from './automations'
import {
  chainLabel,
  extractDepositAddress,
  extractRequestId,
  getRelayQuote,
  isNativeCurrency,
  relayChain,
  resolveRelayToken,
  summarizeRelayQuote,
} from './relay'

export const SEPOLIA_USDC =
  import.meta.env.VITE_USDC_ADDRESS ||
  '0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212'

export const FACTORY_ADDRESS =
  import.meta.env.VITE_ACCOUNT_FACTORY_ADDRESS || ''

export const DCA_ROUTER_ADDRESS =
  import.meta.env.VITE_DCA_ROUTER_ADDRESS || ''

const READ_RPC = (
  import.meta.env.VITE_ALCHEMY_SEPOLIA_ENDPOINT ||
  import.meta.env.VITE_SEPOLIA_RPC_URL ||
  ''
).trim()

export const FACTORY_ABI = [
  'function userIdOf(address owner) view returns (bytes32)',
  'function accountOf(bytes32 userId) view returns (address)',
  'function getOrCreateAccount() returns (address)',
  'function createAccount() returns (address)',
  'function allAccounts(uint256) view returns (address)',
  'function accountCount() view returns (uint256)',
]

export const ACCOUNT_ABI = [
  'function owner() view returns (address)',
  'function savings() view returns (address)',
  'function splitToken() view returns (address)',
  'function splitBps() view returns (uint16)',
  'function splitEnabled() view returns (bool)',
  'function accounted(address token) view returns (uint256)',
  'function setSplit(address token_, address savings_, uint16 bps_, bool enabled_)',
  'function processToken(address token_) returns (uint256)',
  'function recurringCount() view returns (uint256)',
  'function recurringAt(uint256 ruleId) view returns (address token, address to, uint256 amount, uint256 interval, uint256 lastExecuted, bool enabled)',
  'function addRecurring(address token_, address to_, uint256 amount_, uint256 interval_) returns (uint256 ruleId)',
  'function setRecurringAt(uint256 ruleId, address token_, address to_, uint256 amount_, uint256 interval_, bool enabled_)',
  'function setRecurringEnabled(uint256 ruleId, bool enabled_)',
  'function executeRecurringAt(uint256 ruleId) returns (uint256)',
  'function recurringToken() view returns (address)',
  'function recurringTo() view returns (address)',
  'function recurringAmount() view returns (uint256)',
  'function recurringInterval() view returns (uint256)',
  'function recurringLastExecuted() view returns (uint256)',
  'function recurringEnabled() view returns (bool)',
  'function setRecurring(address token_, address to_, uint256 amount_, uint256 interval_, bool enabled_)',
  'function executeRecurring() returns (uint256)',
  'function dcaCount() view returns (uint256)',
  'function dcaAt(uint256 ruleId) view returns (address tokenIn, address tokenOut, address router, uint256 amount, uint256 interval, uint256 lastExecuted, uint256 minOut, bool enabled)',
  'function addDca(address tokenIn_, address tokenOut_, address router_, uint256 amount_, uint256 interval_, uint256 minOut_) returns (uint256 ruleId)',
  'function setDcaAt(uint256 ruleId, address tokenIn_, address tokenOut_, address router_, uint256 amount_, uint256 interval_, uint256 minOut_, bool enabled_)',
  'function setDcaEnabled(uint256 ruleId, bool enabled_)',
  'function executeDcaAt(uint256 ruleId) returns (uint256)',
  'function dcaToken() view returns (address)',
  'function dcaTokenOut() view returns (address)',
  'function dcaRouter() view returns (address)',
  'function dcaAmount() view returns (uint256)',
  'function dcaInterval() view returns (uint256)',
  'function dcaLastExecuted() view returns (uint256)',
  'function dcaMinOut() view returns (uint256)',
  'function dcaEnabled() view returns (bool)',
  'function setDca(address tokenIn_, address tokenOut_, address router_, uint256 amount_, uint256 interval_, uint256 minOut_, bool enabled_)',
  'function executeDca() returns (uint256)',
  'function withdrawToken(address token, address to, uint256 amount)',
  'function withdraw(address to, uint256 amount)',
  'event TokenSplit(address indexed token, uint256 incoming, uint256 sentToSavings, address indexed caller)',
  'event SplitConfigured(address indexed token, address indexed savings, uint16 bps, bool enabled)',
  'event RecurringConfigured(uint256 indexed ruleId, address indexed token, address indexed to, uint256 amount, uint256 interval, bool enabled)',
  'event RecurringExecuted(uint256 indexed ruleId, address indexed token, address indexed to, uint256 amount, address caller)',
  'event DcaConfigured(uint256 indexed ruleId, address indexed tokenIn, address indexed tokenOut, address router, uint256 amount, uint256 interval, uint256 minOut, bool enabled)',
  'event DcaExecuted(uint256 indexed ruleId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address caller)',
  'event EthReceived(address indexed from, uint256 amount, uint256 sentToSavings)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
]

/** Detect multi-slot vaults (new SmartAccount). Old single-slot vaults lack dcaCount. */
export async function supportsMultiRules(vaultAddress, runner) {
  try {
    const account =
      runner ||
      new Contract(vaultAddress, ACCOUNT_ABI, getReadProvider())
    await account.dcaCount()
    return true
  } catch {
    return false
  }
}

export const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]

const ZERO = '0x0000000000000000000000000000000000000000'

function requireFactory() {
  if (!FACTORY_ADDRESS) {
    throw new Error('Missing VITE_ACCOUNT_FACTORY_ADDRESS — deploy the factory first.')
  }
  return getAddress(FACTORY_ADDRESS)
}

/** Prefer Alchemy for reads — MetaMask getLogs/eth_call can be flaky. */
export function getReadProvider() {
  if (READ_RPC) return new JsonRpcProvider(READ_RPC)
  if (!window.ethereum) throw new Error('MetaMask not found')
  return new BrowserProvider(window.ethereum)
}

export async function getProvider() {
  if (!window.ethereum) throw new Error('MetaMask not found')
  return new BrowserProvider(window.ethereum)
}

export async function getSigner() {
  const provider = await getProvider()
  return provider.getSigner()
}

export async function getVaultAddress(ownerAddress) {
  const provider = getReadProvider()
  const factory = new Contract(requireFactory(), FACTORY_ABI, provider)
  const userId = await factory.userIdOf(getAddress(ownerAddress))
  const account = await factory.accountOf(userId)
  return account === ZERO ? null : getAddress(account)
}

export async function ensureVault() {
  const signer = await getSigner()
  const owner = await signer.getAddress()
  let vault = await getVaultAddress(owner)
  if (vault) return vault

  const factory = new Contract(requireFactory(), FACTORY_ABI, signer)
  const tx = await factory.getOrCreateAccount()
  await tx.wait()
  vault = await getVaultAddress(owner)
  if (!vault) throw new Error('Vault deployment failed')
  return vault
}

/** Deploy vault if needed (user pays gas, user is owner), then configure USDC split. */
export async function setupUsdcSplitAutomation({ savingsAddress, percent }) {
  const signer = await getSigner()
  const vault = await ensureVault()

  const account = new Contract(vault, ACCOUNT_ABI, signer)
  const bps = Math.round(Number(percent) * 100)
  const tx2 = await account.setSplit(
    getAddress(SEPOLIA_USDC),
    getAddress(savingsAddress),
    bps,
    true,
  )
  await tx2.wait()

  return {
    vaultAddress: vault,
    token: getAddress(SEPOLIA_USDC),
    savingsAddress: getAddress(savingsAddress),
    percent: Number(percent),
    bps,
  }
}

/**
 * Native ETH income split — setSplit(token=0) so receive() auto-forwards % on deposit.
 * Note: one split slot per vault (replaces any USDC split).
 */
export async function setupEthSplitAutomation({ savingsAddress, percent }) {
  const signer = await getSigner()
  const vault = await ensureVault()

  const account = new Contract(vault, ACCOUNT_ABI, signer)
  const bps = Math.round(Number(percent) * 100)
  const ZERO = '0x0000000000000000000000000000000000000000'
  const tx = await account.setSplit(
    ZERO,
    getAddress(savingsAddress),
    bps,
    true,
  )
  await tx.wait()

  return {
    vaultAddress: vault,
    token: null,
    savingsAddress: getAddress(savingsAddress),
    percent: Number(percent),
    bps,
  }
}

export async function setSplitEnabled(vaultAddress, enabled, { token, savings, percent }) {
  const signer = await getSigner()
  const account = new Contract(vaultAddress, ACCOUNT_ABI, signer)
  const bps = Math.round(Number(percent) * 100)
  const tx = await account.setSplit(
    getAddress(token || SEPOLIA_USDC),
    getAddress(savings),
    bps,
    enabled,
  )
  await tx.wait()
}

const INTERVAL_SECONDS = {
  minutes: 60,
  hours: 3600,
  days: 86400,
}

export function intervalToSeconds(value, unit) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) throw new Error('Interval must be at least 1')
  const mult = INTERVAL_SECONDS[unit]
  if (!mult) throw new Error('Interval unit must be minutes, hours, or days')
  const seconds = Math.round(n * mult)
  if (seconds < 60) throw new Error('Minimum interval is 1 minute')
  return seconds
}

export function describeInterval(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) return '—'
  if (s % 86400 === 0) {
    const d = s / 86400
    return d === 1 ? '1 day' : `${d} days`
  }
  if (s % 3600 === 0) {
    const h = s / 3600
    return h === 1 ? '1 hour' : `${h} hours`
  }
  if (s % 60 === 0) {
    const m = s / 60
    return m === 1 ? '1 minute' : `${m} minutes`
  }
  return `${s}s`
}

/** Deploy vault if needed, then configure fixed USDC recurring payout. */
export async function setupUsdcRecurringAutomation({
  toAddress,
  amountHuman,
  intervalValue,
  intervalUnit,
}) {
  const signer = await getSigner()
  const vault = await ensureVault()
  const account = new Contract(vault, ACCOUNT_ABI, signer)
  const erc20 = new Contract(getAddress(SEPOLIA_USDC), ERC20_ABI, signer)
  const decimals = Number(await erc20.decimals().catch(() => 6))
  const amount = parseUnits(String(amountHuman), decimals)
  const interval = intervalToSeconds(intervalValue, intervalUnit)

  const token = getAddress(SEPOLIA_USDC)
  const to = getAddress(toAddress)
  const multi = await supportsMultiRules(vault, account)
  let ruleId = null
  if (multi) {
    ruleId = Number(await account.addRecurring.staticCall(token, to, amount, interval))
    const tx = await account.addRecurring(token, to, amount, interval)
    await tx.wait()
  } else {
    const tx = await account.setRecurring(token, to, amount, interval, true)
    await tx.wait()
  }

  return {
    vaultAddress: vault,
    token,
    toAddress: to,
    amount: amount.toString(),
    amountHuman: String(amountHuman),
    decimals,
    interval,
    intervalValue: Number(intervalValue),
    intervalUnit,
    ruleId,
  }
}

/** Quote Relay deposit address, then configure ERC-20 recurring → deposit address. */
export async function setupRelayBridgeAutomation({
  amountHuman,
  originChainId,
  destinationChainId,
  recipient,
  intervalValue,
  intervalUnit,
  originToken,
  originCustomAddress,
  originDecimals,
  destinationToken,
  destinationCustomAddress,
  destinationDecimals,
  tokenAddress,
}) {
  const origin = Number(originChainId)
  const destination = Number(destinationChainId)
  if (!(origin > 0) || !(destination > 0) || origin === destination) {
    throw new Error('Pick different origin and destination chains.')
  }
  if (!relayChain(origin) || !relayChain(destination)) {
    throw new Error('Unsupported Relay chain selection.')
  }

  const originResolved = resolveRelayToken(origin, {
    tokenId: originToken || (tokenAddress ? 'custom' : 'USDC'),
    customAddress: originCustomAddress || tokenAddress,
    decimals: originDecimals,
  })
  const destinationResolved = resolveRelayToken(destination, {
    tokenId: destinationToken || 'USDC',
    customAddress: destinationCustomAddress,
    decimals: destinationDecimals,
  })

  if (originResolved.native || isNativeCurrency(originResolved.address)) {
    throw new Error(
      'Vault automations can only send ERC-20 origin tokens. Pick WETH or another ERC-20 (destination may still be ETH).',
    )
  }

  const signer = await getSigner()
  const vault = await ensureVault()
  const token = getAddress(originResolved.address)
  const erc20 = new Contract(token, ERC20_ABI, signer)
  let decimals = Number(originResolved.decimals)
  try {
    decimals = Number(await erc20.decimals())
  } catch {
    /* use catalog / provided decimals */
  }
  const amount = parseUnits(String(amountHuman), decimals)
  const originCurrency = originResolved.address
  const destinationCurrency = destinationResolved.address
  const toRecipient = getAddress(recipient)

  const quote = await getRelayQuote({
    user: vault,
    recipient: toRecipient,
    originChainId: origin,
    destinationChainId: destination,
    originCurrency,
    destinationCurrency,
    amount: amount.toString(),
    tradeType: 'EXACT_INPUT',
    useDepositAddress: true,
    refundTo: vault,
  })

  const depositAddress = extractDepositAddress(quote)
  if (!depositAddress || !isAddressLike(depositAddress)) {
    throw new Error(
      'Relay did not return a deposit address. Check chain support / API key, or try again.',
    )
  }

  const account = new Contract(vault, ACCOUNT_ABI, signer)
  const interval = intervalToSeconds(intervalValue, intervalUnit)
  const to = getAddress(depositAddress)
  const multi = await supportsMultiRules(vault, account)
  let ruleId = null
  if (multi) {
    ruleId = Number(await account.addRecurring.staticCall(token, to, amount, interval))
    const tx = await account.addRecurring(token, to, amount, interval)
    await tx.wait()
  } else {
    const tx = await account.setRecurring(token, to, amount, interval, true)
    await tx.wait()
  }

  return {
    vaultAddress: vault,
    token,
    toAddress: to,
    depositAddress: to,
    recipient: toRecipient,
    amount: amount.toString(),
    amountHuman: String(amountHuman),
    decimals,
    interval,
    intervalValue: Number(intervalValue),
    intervalUnit,
    ruleId,
    originChainId: origin,
    destinationChainId: destination,
    originCurrency,
    destinationCurrency,
    originToken: originResolved.id,
    destinationToken: destinationResolved.id,
    originSymbol: originResolved.symbol,
    destinationSymbol: destinationResolved.symbol,
    originDecimals: decimals,
    destinationDecimals: destinationResolved.decimals,
    originChainLabel: chainLabel(origin),
    destinationChainLabel: chainLabel(destination),
    requestId: extractRequestId(quote),
    relaySummary: summarizeRelayQuote(quote),
  }
}

function isAddressLike(value) {
  try {
    getAddress(value)
    return true
  } catch {
    return false
  }
}

export async function setRecurringEnabled(
  vaultAddress,
  enabled,
  { token, to, amountHuman, interval, decimals = 6, ruleId = null },
) {
  const signer = await getSigner()
  const account = new Contract(vaultAddress, ACCOUNT_ABI, signer)
  const multi = await supportsMultiRules(vaultAddress, account)
  if (multi && ruleId != null && Number.isFinite(Number(ruleId))) {
    const tx = await account.setRecurringEnabled(Number(ruleId), Boolean(enabled))
    await tx.wait()
    return
  }
  const amount = parseUnits(String(amountHuman), decimals)
  const tx = await account.setRecurring(
    getAddress(token || SEPOLIA_USDC),
    getAddress(to),
    amount,
    BigInt(interval),
    enabled,
  )
  await tx.wait()
}

export async function getRecurringConfig(vaultAddress) {
  const provider = getReadProvider()
  const account = new Contract(vaultAddress, ACCOUNT_ABI, provider)
  try {
    const [token, to, amount, interval, lastExecuted, enabled] = await Promise.all([
      account.recurringToken(),
      account.recurringTo(),
      account.recurringAmount(),
      account.recurringInterval(),
      account.recurringLastExecuted(),
      account.recurringEnabled(),
    ])
    return {
      token: token === ZERO ? null : getAddress(token),
      to: to === ZERO ? null : getAddress(to),
      amount,
      interval: Number(interval),
      lastExecuted: Number(lastExecuted),
      enabled,
    }
  } catch {
    return null
  }
}

function requireDcaRouter() {
  if (!DCA_ROUTER_ADDRESS) {
    throw new Error('Missing VITE_DCA_ROUTER_ADDRESS — deploy the DCA router first.')
  }
  return getAddress(DCA_ROUTER_ADDRESS)
}

/** Returns true if Uniswap V2 can quote WETH → tokenOut on Sepolia. */
export async function canBuyTokenWithEth(tokenOut) {
  const out = getAddress(tokenOut)
  if (out === ZERO) return true
  const provider = getReadProvider()
  const uni = (
    import.meta.env.VITE_UNISWAP_V2_ROUTER ||
    '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3'
  ).trim()
  const router = new Contract(
    uni,
    [
      'function WETH() view returns (address)',
      'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
    ],
    provider,
  )
  try {
    const weth = await router.WETH()
    const amounts = await router.getAmountsOut(parseUnits('0.001', 18), [weth, out])
    return amounts.length === 2 && amounts[1] > 0n
  } catch {
    return false
  }
}

/**
 * DCA setup:
 * - ETH out: sell USDC for ETH (amount in USDC)
 * - Token out: buy token with vault ETH (amount in ETH)
 */
export async function setupUsdcDcaAutomation({
  amountHuman,
  intervalValue,
  intervalUnit,
  tokenOut = null,
  minOutHuman = '0',
}) {
  const signer = await getSigner()
  const vault = await ensureVault()
  const account = new Contract(vault, ACCOUNT_ABI, signer)
  const interval = intervalToSeconds(intervalValue, intervalUnit)
  const router = requireDcaRouter()
  const toEth = !tokenOut || tokenOut === ZERO

  let tokenIn
  let out
  let amount
  let minOut
  let decimals

  if (toEth) {
    const erc20 = new Contract(getAddress(SEPOLIA_USDC), ERC20_ABI, signer)
    decimals = Number(await erc20.decimals().catch(() => 6))
    amount = parseUnits(String(amountHuman), decimals)
    minOut = parseUnits(String(minOutHuman || '0'), 18)
    tokenIn = getAddress(SEPOLIA_USDC)
    out = ZERO
  } else {
    out = getAddress(tokenOut)
    const ok = await canBuyTokenWithEth(out)
    if (!ok) {
      throw new Error(
        'No Sepolia Uniswap WETH pool for this token. Pick a token with liquidity, or DCA to ETH first.',
      )
    }
    decimals = 18
    amount = parseUnits(String(amountHuman), 18)
    minOut = 0n
    tokenIn = ZERO
  }

  const multi = await supportsMultiRules(vault, account)
  let ruleId = null
  if (multi) {
    ruleId = Number(
      await account.addDca.staticCall(tokenIn, out, router, amount, interval, minOut),
    )
    const tx = await account.addDca(tokenIn, out, router, amount, interval, minOut)
    await tx.wait()
  } else {
    const tx = await account.setDca(
      tokenIn,
      out,
      router,
      amount,
      interval,
      minOut,
      true,
    )
    await tx.wait()
  }

  return {
    vaultAddress: vault,
    token: toEth ? getAddress(SEPOLIA_USDC) : null,
    tokenOut: toEth ? null : out,
    router,
    amount: amount.toString(),
    amountHuman: String(amountHuman),
    amountAsset: toEth ? 'USDC' : 'ETH',
    decimals,
    interval,
    intervalValue: Number(intervalValue),
    intervalUnit,
    minOut: minOut.toString(),
    ruleId,
  }
}

/** Sell vault ETH for USDC via Uniswap (ETH → USDC). */
export async function setupSellEthForUsdcAutomation({
  amountHuman,
  intervalValue,
  intervalUnit,
}) {
  return setupUsdcDcaAutomation({
    amountHuman,
    intervalValue,
    intervalUnit,
    tokenOut: SEPOLIA_USDC,
  })
}

/** Sell an ERC-20 from the vault for ETH via the DCA router inventory rate. */
export async function setupSellTokenForEthAutomation({
  tokenIn,
  amountHuman,
  intervalValue,
  intervalUnit,
  minOutHuman = '0',
}) {
  const signer = await getSigner()
  const vault = await ensureVault()
  const account = new Contract(vault, ACCOUNT_ABI, signer)
  const interval = intervalToSeconds(intervalValue, intervalUnit)
  const router = requireDcaRouter()
  const token = getAddress(tokenIn)
  const erc20 = new Contract(token, ERC20_ABI, signer)
  const decimals = Number(await erc20.decimals().catch(() => 18))
  const symbol = await erc20.symbol().catch(() => 'TOKEN')
  const amount = parseUnits(String(amountHuman), decimals)
  const minOut = parseUnits(String(minOutHuman || '0'), 18)

  const multi = await supportsMultiRules(vault, account)
  let ruleId = null
  if (multi) {
    ruleId = Number(
      await account.addDca.staticCall(token, ZERO, router, amount, interval, minOut),
    )
    const tx = await account.addDca(token, ZERO, router, amount, interval, minOut)
    await tx.wait()
  } else {
    const tx = await account.setDca(
      token,
      ZERO,
      router,
      amount,
      interval,
      minOut,
      true,
    )
    await tx.wait()
  }

  return {
    vaultAddress: vault,
    token,
    tokenOut: null,
    tokenSymbol: symbol,
    router,
    amount: amount.toString(),
    amountHuman: String(amountHuman),
    amountAsset: symbol,
    decimals,
    interval,
    intervalValue: Number(intervalValue),
    intervalUnit,
    minOut: minOut.toString(),
    ruleId,
  }
}

/** Recurring payout of any ERC-20 (defaults to USDC). */
export async function setupTokenRecurringAutomation({
  tokenAddress = SEPOLIA_USDC,
  toAddress,
  amountHuman,
  intervalValue,
  intervalUnit,
}) {
  const signer = await getSigner()
  const vault = await ensureVault()
  const account = new Contract(vault, ACCOUNT_ABI, signer)
  const token = getAddress(tokenAddress)
  const erc20 = new Contract(token, ERC20_ABI, signer)
  const decimals = Number(await erc20.decimals().catch(() => 18))
  const symbol = await erc20.symbol().catch(() => 'TOKEN')
  const amount = parseUnits(String(amountHuman), decimals)
  const interval = intervalToSeconds(intervalValue, intervalUnit)

  const to = getAddress(toAddress)
  const multi = await supportsMultiRules(vault, account)
  let ruleId = null
  if (multi) {
    ruleId = Number(await account.addRecurring.staticCall(token, to, amount, interval))
    const tx = await account.addRecurring(token, to, amount, interval)
    await tx.wait()
  } else {
    const tx = await account.setRecurring(token, to, amount, interval, true)
    await tx.wait()
  }

  return {
    vaultAddress: vault,
    token,
    tokenSymbol: symbol,
    toAddress: to,
    amount: amount.toString(),
    amountHuman: String(amountHuman),
    decimals,
    interval,
    intervalValue: Number(intervalValue),
    intervalUnit,
    ruleId,
  }
}

export async function setDcaEnabled(
  vaultAddress,
  enabled,
  {
    token,
    tokenOut,
    router,
    amountHuman,
    interval,
    decimals = 6,
    minOut = '0',
    amountAsset,
    ruleId = null,
  },
) {
  const signer = await getSigner()
  const account = new Contract(vaultAddress, ACCOUNT_ABI, signer)
  const multi = await supportsMultiRules(vaultAddress, account)
  if (multi && ruleId != null && Number.isFinite(Number(ruleId))) {
    const tx = await account.setDcaEnabled(Number(ruleId), Boolean(enabled))
    await tx.wait()
    return
  }
  const toEth = !tokenOut || tokenOut === ZERO
  const asset = amountAsset || (toEth ? 'USDC' : 'ETH')
  const dec = asset === 'ETH' ? 18 : decimals
  const amount = parseUnits(String(amountHuman), dec)
  const out = toEth ? ZERO : getAddress(tokenOut)
  const tokenIn = toEth ? getAddress(token || SEPOLIA_USDC) : ZERO
  const tx = await account.setDca(
    tokenIn,
    out,
    getAddress(router || requireDcaRouter()),
    amount,
    BigInt(interval),
    BigInt(minOut || 0),
    enabled,
  )
  await tx.wait()
}

/**
 * Sync soft-pause with on-chain enabled flag for a saved automation row.
 * Returns false if the rule is off-chain (screener) or missing vault/config.
 */
export async function setAutomationOnchainEnabled(rule, enabled) {
  const vault = rule?.vaultAddress
  if (!vault || rule?.onchain === false) return false

  const action = rule.action || {}
  const trigger = rule.trigger || {}
  const type = action.type

  if (type === 'trading_strategy' || trigger.type === 'screener') return false

  const isDca =
    type === 'dca_swap' ||
    type === 'swap_usdc_eth' ||
    type === 'buy_eth' ||
    type === 'buy_token' ||
    type === 'sell_eth_usdc' ||
    type === 'sell_token_eth'

  const isRecurring =
    type === 'send_amount' ||
    type === 'send_token' ||
    type === 'bridge_relay' ||
    trigger.type === 'every_interval' ||
    trigger.type === 'time_window' ||
    trigger.type === 'usdc_above' ||
    trigger.type === 'eth_price_below' ||
    trigger.type === 'eth_price_above'

  const isSplit =
    type === 'split' ||
    type === 'send_percent' ||
    trigger.type === 'receive_usdc' ||
    trigger.type === 'receive_eth'

  if (isDca) {
    await setDcaEnabled(vault, enabled, {
      token: action.tokenIn || action.token || SEPOLIA_USDC,
      tokenOut: action.tokenOut || null,
      router: action.router,
      amountHuman: action.amountHuman ?? action.amount,
      interval: action.interval || trigger.interval,
      decimals: action.decimals ?? 6,
      minOut: action.minOut || '0',
      amountAsset: action.amountAsset,
      ruleId: action.ruleId,
    })
    return true
  }

  if (isRecurring) {
    const token = action.token || action.originCurrency || SEPOLIA_USDC
    await setRecurringEnabled(vault, enabled, {
      token,
      to: action.to || action.depositAddress || action.recipient,
      ruleId: action.ruleId,
      amountHuman: action.amountHuman ?? action.amount,
      interval: action.interval || trigger.interval,
      decimals: action.decimals ?? action.originDecimals ?? 6,
    })
    return true
  }

  if (isSplit) {
    const eth = trigger.type === 'receive_eth' || action.asset === 'ETH'
    await setSplitEnabled(vault, enabled, {
      token: eth ? ZERO : action.token || trigger.token || SEPOLIA_USDC,
      savings: action.to,
      percent: action.percent,
    })
    return true
  }

  return false
}

export async function getTokenBalance(holderAddress, token = SEPOLIA_USDC) {
  if (!holderAddress) return { raw: 0n, formatted: '0', decimals: 6, symbol: 'USDC' }
  const provider = getReadProvider()
  const erc20 = new Contract(getAddress(token), ERC20_ABI, provider)
  const raw = await erc20.balanceOf(getAddress(holderAddress))
  const decimals = await erc20.decimals().catch(() => 6)
  const symbol = await erc20.symbol().catch(() => 'USDC')
  const d = Number(decimals)
  return {
    raw,
    formatted: formatUnits(raw, d),
    decimals: d,
    symbol,
  }
}

export async function getVaultBalances(vaultAddress, ownerAddress, token = SEPOLIA_USDC) {
  const provider = getReadProvider()
  const erc20 = new Contract(getAddress(token), ERC20_ABI, provider)
  const vaultAddr = getAddress(vaultAddress)

  const [vaultToken, walletToken, eth, walletEth, decimals, symbol] = await Promise.all([
    erc20.balanceOf(vaultAddr),
    ownerAddress ? erc20.balanceOf(getAddress(ownerAddress)) : Promise.resolve(0n),
    provider.getBalance(vaultAddr),
    ownerAddress
      ? provider.getBalance(getAddress(ownerAddress))
      : Promise.resolve(0n),
    erc20.decimals().catch(() => 6),
    erc20.symbol().catch(() => 'USDC'),
  ])

  const d = Number(decimals)
  return {
    symbol,
    decimals: d,
    vaultUsdc: vaultToken,
    vaultUsdcFormatted: formatUnits(vaultToken, d),
    walletUsdc: walletToken,
    walletUsdcFormatted: formatUnits(walletToken, d),
    vaultEth: eth,
    vaultEthFormatted: formatUnits(eth, 18),
    walletEth,
    walletEthFormatted: formatUnits(walletEth, 18),
  }
}

export async function getVaultConfig(vaultAddress) {
  const provider = getReadProvider()
  const account = new Contract(vaultAddress, ACCOUNT_ABI, provider)
  const [owner, savings, splitToken, splitBps, splitEnabled] = await Promise.all([
    account.owner(),
    account.savings(),
    account.splitToken(),
    account.splitBps(),
    account.splitEnabled(),
  ])
  return {
    owner: getAddress(owner),
    savings: savings === ZERO ? null : getAddress(savings),
    splitToken: splitToken === ZERO ? null : getAddress(splitToken),
    splitBps: Number(splitBps),
    splitEnabled,
  }
}

/** On-chain timing for scheduled DCA / recurring automations. */
export async function getVaultScheduleState(vaultAddress, { ruleId = null, kind = null } = {}) {
  const provider = getReadProvider()
  const account = new Contract(vaultAddress, ACCOUNT_ABI, provider)

  const multi = await supportsMultiRules(vaultAddress, account)
  if (multi && ruleId != null && Number.isFinite(Number(ruleId))) {
    const id = Number(ruleId)
    if (kind === 'recurring') {
      try {
        const [, , , interval, lastExecuted, enabled] = await account.recurringAt(id)
        return {
          dcaEnabled: false,
          dcaLastExecuted: 0,
          dcaInterval: 0,
          recurringEnabled: Boolean(enabled),
          recurringLastExecuted: Number(lastExecuted),
          recurringInterval: Number(interval),
        }
      } catch {
        /* fall through */
      }
    }
    if (kind === 'dca' || kind == null) {
      try {
        const [, , , , interval, lastExecuted, , enabled] = await account.dcaAt(id)
        return {
          dcaEnabled: Boolean(enabled),
          dcaLastExecuted: Number(lastExecuted),
          dcaInterval: Number(interval),
          recurringEnabled: false,
          recurringLastExecuted: 0,
          recurringInterval: 0,
        }
      } catch {
        /* fall through */
      }
    }
  }

  const [
    dcaEnabled,
    dcaLastExecuted,
    dcaInterval,
    recurringEnabled,
    recurringLastExecuted,
    recurringInterval,
  ] = await Promise.all([
    account.dcaEnabled().catch(() => false),
    account.dcaLastExecuted().catch(() => 0n),
    account.dcaInterval().catch(() => 0n),
    account.recurringEnabled().catch(() => false),
    account.recurringLastExecuted().catch(() => 0n),
    account.recurringInterval().catch(() => 0n),
  ])
  return {
    dcaEnabled: Boolean(dcaEnabled),
    dcaLastExecuted: Number(dcaLastExecuted),
    dcaInterval: Number(dcaInterval),
    recurringEnabled: Boolean(recurringEnabled),
    recurringLastExecuted: Number(recurringLastExecuted),
    recurringInterval: Number(recurringInterval),
  }
}

/** Transfer USDC from connected wallet → vault (simple ERC-20 transfer). */
export async function depositUsdc(vaultAddress, amountHuman, token = SEPOLIA_USDC) {
  const signer = await getSigner()
  const erc20 = new Contract(getAddress(token), ERC20_ABI, signer)
  const decimals = Number(await erc20.decimals())
  const amount = parseUnits(String(amountHuman), decimals)
  const tx = await erc20.transfer(getAddress(vaultAddress), amount)
  await tx.wait()

  // ERC-20 transfers don't auto-run vault logic — poke the split now if configured
  // and not soft-paused in Supabase.
  try {
    const softActive = await isVaultKindActive(vaultAddress, 'split')
    if (!softActive) return tx.hash

    const vault = new Contract(getAddress(vaultAddress), ACCOUNT_ABI, signer)
    if (await vault.splitEnabled()) {
      const tokenAddr = getAddress(token)
      const splitToken = await vault.splitToken()
      if (getAddress(splitToken) === tokenAddr) {
        const poke = await vault.processToken(tokenAddr)
        await poke.wait()
      }
    }
  } catch {
    /* keeper will pick it up if this fails */
  }

  return tx.hash
}

/** Send native ETH from connected wallet → vault. */
export async function depositEth(vaultAddress, amountHuman) {
  const signer = await getSigner()
  const amount = parseUnits(String(amountHuman), 18)
  const tx = await signer.sendTransaction({
    to: getAddress(vaultAddress),
    value: amount,
  })
  await tx.wait()
  return tx.hash
}

/** Owner withdraws USDC from vault to their wallet. */
export async function withdrawUsdc(vaultAddress, amountHuman, toAddress, token = SEPOLIA_USDC) {
  const signer = await getSigner()
  const erc20 = new Contract(getAddress(token), ERC20_ABI, signer)
  const vault = new Contract(vaultAddress, ACCOUNT_ABI, signer)
  const decimals = Number(await erc20.decimals())
  const amount = parseUnits(String(amountHuman), decimals)
  const tx = await vault.withdrawToken(
    getAddress(token),
    getAddress(toAddress),
    amount,
  )
  await tx.wait()
  return tx.hash
}

/** Owner withdraws ETH from vault to their wallet. */
export async function withdrawEth(vaultAddress, amountHuman, toAddress) {
  const signer = await getSigner()
  const vault = new Contract(vaultAddress, ACCOUNT_ABI, signer)
  const amount = parseUnits(String(amountHuman), 18)
  const tx = await vault.withdraw(getAddress(toAddress), amount)
  await tx.wait()
  return tx.hash
}

export async function withdrawAllUsdc(vaultAddress, toAddress, token = SEPOLIA_USDC) {
  const provider = await getProvider()
  const erc20 = new Contract(getAddress(token), ERC20_ABI, provider)
  const bal = await erc20.balanceOf(getAddress(vaultAddress))
  if (bal === 0n) throw new Error('Vault USDC balance is zero')
  const signer = await getSigner()
  const vault = new Contract(vaultAddress, ACCOUNT_ABI, signer)
  const tx = await vault.withdrawToken(
    getAddress(token),
    getAddress(toAddress),
    bal,
  )
  await tx.wait()
  return tx.hash
}

export async function withdrawAllEth(vaultAddress, toAddress) {
  const provider = await getProvider()
  const bal = await provider.getBalance(getAddress(vaultAddress))
  if (bal === 0n) throw new Error('Vault ETH balance is zero')
  const signer = await getSigner()
  const vault = new Contract(vaultAddress, ACCOUNT_ABI, signer)
  const tx = await vault.withdraw(getAddress(toAddress), bal)
  await tx.wait()
  return tx.hash
}

export { MaxUint256, formatUnits, parseUnits, getAddress }
