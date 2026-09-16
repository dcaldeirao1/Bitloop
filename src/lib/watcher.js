import { BrowserProvider, formatEther, parseEther } from 'ethers'

const POLL_MS = 8000
/** Keep a small ETH buffer so the outbound send can cover gas. */
const GAS_BUFFER_WEI = parseEther('0.00005')

/** Legacy browser ETH watcher (unused by USDC vault flow). */
export function startBalanceWatcher(address, getRules, callbacks = {}) {
  let stopped = false
  let lastBalance = null
  let busy = false

  const tick = async () => {
    if (stopped || busy || !window.ethereum) return
    busy = true

    try {
      const provider = new BrowserProvider(window.ethereum)
      const balance = await provider.getBalance(address)

      if (lastBalance === null) {
        lastBalance = balance
        callbacks.onStatus?.('Watching for incoming funds…')
        return
      }

      if (balance > lastBalance) {
        const incoming = balance - lastBalance
        lastBalance = balance
        const rules = getRules().filter(
          (r) => r.enabled && r.trigger?.type === 'receive_eth',
        )

        for (const rule of rules) {
          await runPercentSend(provider, address, incoming, rule, callbacks)
        }
      } else {
        lastBalance = balance
      }
    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err.message : 'Watcher error')
    } finally {
      busy = false
    }
  }

  void tick()
  const id = setInterval(() => void tick(), POLL_MS)

  return () => {
    stopped = true
    clearInterval(id)
  }
}

async function runPercentSend(provider, from, incomingWei, rule, callbacks) {
  const percent = Number(rule.action?.percent ?? rule.percent)
  const to = rule.action?.to ?? rule.savingsAddress
  if (!to || !percent) return

  let amount = (incomingWei * BigInt(Math.round(percent * 100))) / 10000n
  const balance = await provider.getBalance(from)
  const maxSendable = balance > GAS_BUFFER_WEI ? balance - GAS_BUFFER_WEI : 0n
  if (amount > maxSendable) amount = maxSendable
  if (amount <= 0n) return

  const amountEth = formatEther(amount)
  callbacks.onStatus?.(
    `Approve MetaMask: send ${percent}% (${amountEth} ETH) to savings…`,
  )

  const signer = await provider.getSigner()
  const tx = await signer.sendTransaction({ to, value: amount })
  await tx.wait()
  callbacks.onStatus?.(`Sent ${amountEth} ETH → ${to.slice(0, 10)}…`)
}
