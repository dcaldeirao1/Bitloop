import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActivityList } from '../components/ActivityList'
import { AppHeader } from '../components/AppHeader'
import { WalletButton } from '../components/WalletButton'
import { useWallet } from '../context/WalletContext'
import { getCachedVault, setCachedVault } from '../lib/automations'
import { fetchVaultHistory } from '../lib/history'
import {
  SEPOLIA_USDC,
  depositUsdc,
  ensureVault,
  getTokenBalance,
  getVaultAddress,
  getVaultBalances,
  getVaultConfig,
  withdrawAllUsdc,
  withdrawUsdc,
} from '../lib/vault'

const SECTIONS = [
  {
    id: 'main',
    label: 'Main',
    blurb: 'Primary balance in your vault. Deposit and withdraw here.',
  },
  {
    id: 'savings',
    label: 'Savings',
    blurb: 'Funds your automation sends to the savings wallet.',
  },
  {
    id: 'trenches',
    label: 'Trenches',
    blurb: 'Reserved for memecoin / trench strategies.',
    soon: true,
  },
  {
    id: 'perps',
    label: 'Perps',
    blurb: 'Reserved for perps and leveraged strategies.',
    soon: true,
  },
]

export function VaultPage() {
  const { address, hasExtension, connecting, error, connect, chainName } = useWallet()
  const [section, setSection] = useState('main')
  const [vault, setVault] = useState(null)
  const [balances, setBalances] = useState(null)
  const [savingsBal, setSavingsBal] = useState(null)
  const [config, setConfig] = useState(null)
  const [history, setHistory] = useState([])
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(null)
  const [status, setStatus] = useState(null)
  const [err, setErr] = useState(null)
  const [copied, setCopied] = useState(false)
  const [loadingBalances, setLoadingBalances] = useState(false)

  const refresh = useCallback(async () => {
    if (!address) return
    setLoadingBalances(true)
    setErr(null)

    try {
      const vaultAddr = (await getVaultAddress(address)) || getCachedVault(address)
      if (!vaultAddr) {
        setVault(null)
        setBalances(null)
        setConfig(null)
        setHistory([])
        setSavingsBal(null)
        return
      }

      setVault(vaultAddr)
      setCachedVault(address, vaultAddr)

      const [b, c] = await Promise.all([
        getVaultBalances(vaultAddr, address),
        getVaultConfig(vaultAddr),
      ])

      // Set balances immediately so UI doesn't stay on "—" if history fails
      setBalances(b)
      setConfig(c)

      let savings = null
      if (c.savings) {
        try {
          savings = await getTokenBalance(c.savings, SEPOLIA_USDC)
        } catch {
          savings = { formatted: '0', raw: 0n, decimals: 6, symbol: 'USDC' }
        }
      }
      setSavingsBal(savings)

      try {
        const hist = await fetchVaultHistory(vaultAddr, {
          token: SEPOLIA_USDC,
          savingsAddress: c.savings,
        })
        setHistory(hist)
      } catch {
        setHistory([])
      }
    } finally {
      setLoadingBalances(false)
    }
  }, [address])

  useEffect(() => {
    setVault(null)
    setBalances(null)
    setSavingsBal(null)
    setConfig(null)
    setHistory([])
    setErr(null)
    if (!address) return
    refresh().catch((e) => {
      setErr(e.message)
      setLoadingBalances(false)
    })
  }, [address, refresh])

  const sectionHistory = useMemo(() => {
    if (section === 'main') {
      return history.filter((i) => i.type === 'deposit' || i.type === 'withdraw')
    }
    if (section === 'savings') {
      return history.filter((i) => i.type === 'split')
    }
    return []
  }, [history, section])

  const overview = useMemo(
    () => [
      {
        id: 'main',
        label: 'Main',
        value: balances
          ? trimAmt(balances.vaultUsdcFormatted)
          : loadingBalances
            ? '…'
            : '—',
      },
      {
        id: 'savings',
        label: 'Savings',
        value: savingsBal
          ? trimAmt(savingsBal.formatted)
          : config?.savings
            ? '0'
            : loadingBalances
              ? '…'
              : '—',
      },
      { id: 'trenches', label: 'Trenches', value: '0' },
      { id: 'perps', label: 'Perps', value: '0' },
    ],
    [balances, savingsBal, config, loadingBalances],
  )

  if (!address) {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <AppHeader />
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Connect to manage your vault
            </h1>
            <p className="mt-3 text-[15px] text-muted">
              One vault, organized into Main, Savings, Trenches, and Perps.
            </p>
            {!hasExtension && (
              <p className="alert-error mt-5">
                MetaMask was not detected.
              </p>
            )}
            {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
            <div className="mt-8 flex justify-center">
              <WalletButton onClick={() => void connect()} connecting={connecting} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const onCreateVault = async () => {
    setBusy('create')
    setErr(null)
    setStatus('Confirm MetaMask: deploy vault…')
    try {
      const addr = await ensureVault()
      setCachedVault(address, addr)
      setVault(addr)
      setStatus('Vault deployed.')
      await refresh()
    } catch (e) {
      setErr(e?.shortMessage || e?.message || 'Deploy failed')
      setStatus(null)
    } finally {
      setBusy(null)
    }
  }

  const closeModal = () => {
    if (busy) return
    setModal(null)
    setDepositAmount('')
    setWithdrawAmount('')
  }

  const onDeposit = async (e) => {
    e.preventDefault()
    if (!vault || !depositAmount) return
    setBusy('deposit')
    setErr(null)
    setStatus('Confirm MetaMask: deposit USDC…')
    try {
      const hash = await depositUsdc(vault, depositAmount)
      setStatus(`Deposited to Main. Tx ${hash.slice(0, 10)}…`)
      setDepositAmount('')
      setModal(null)
      await refresh()
    } catch (e2) {
      setErr(e2?.shortMessage || e2?.message || 'Deposit failed')
      setStatus(null)
    } finally {
      setBusy(null)
    }
  }

  const onWithdraw = async (e) => {
    e.preventDefault()
    if (!vault || !withdrawAmount) return
    setBusy('withdraw')
    setErr(null)
    setStatus('Confirm MetaMask: withdraw USDC…')
    try {
      const hash = await withdrawUsdc(vault, withdrawAmount, address)
      setStatus(`Withdrawn from Main. Tx ${hash.slice(0, 10)}…`)
      setWithdrawAmount('')
      setModal(null)
      await refresh()
    } catch (e2) {
      setErr(e2?.shortMessage || e2?.message || 'Withdraw failed')
      setStatus(null)
    } finally {
      setBusy(null)
    }
  }

  const onWithdrawAll = async () => {
    if (!vault) return
    setBusy('withdraw-all')
    setErr(null)
    setStatus('Confirm MetaMask: withdraw all USDC…')
    try {
      await withdrawAllUsdc(vault, address)
      setStatus('Withdrew all USDC from Main.')
      setWithdrawAmount('')
      setModal(null)
      await refresh()
    } catch (e2) {
      setErr(e2?.shortMessage || e2?.message || 'Withdraw failed')
      setStatus(null)
    } finally {
      setBusy(null)
    }
  }

  const copyVault = async () => {
    if (!vault) return
    await navigator.clipboard.writeText(vault)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const active = SECTIONS.find((s) => s.id === section) || SECTIONS[0]

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Vault
            </h1>
            <p className="mt-1.5 text-[14px] text-muted">
              One vault, four sections
              {chainName ? ` · ${chainName}` : ''}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh().catch((e) => setErr(e.message))}
            className="btn-outline text-[13px]"
          >
            Refresh
          </button>
        </div>

        {!vault ? (
          <section className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-ink">No vault yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Deploy a vault you own, or create an automation first.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                disabled={busy === 'create'}
                onClick={() => void onCreateVault()}
                className="btn-primary"
              >
                {busy === 'create' ? 'Deploying…' : 'Deploy vault'}
              </button>
              <Link to="/app/new" className="btn-outline">
                New automation
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
              <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
                Vault address
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="break-all font-mono text-[13px] text-ink">{vault}</code>
                <button
                  type="button"
                  onClick={() => void copyVault()}
                  className="btn-outline px-3 py-1.5 text-[12px]"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-line bg-surface px-5 py-6">
              <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
                Total in vault
              </p>
              <p className="mt-2 font-mono text-[36px] font-semibold tracking-tight text-ink sm:text-[42px]">
                {balances
                  ? trimAmt(balances.vaultUsdcFormatted)
                  : loadingBalances
                    ? '…'
                    : '—'}
                <span className="ml-2 text-[16px] font-normal text-muted">USDC</span>
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {balances
                  ? `${trimAmt(balances.vaultEthFormatted, 5)} ETH · across Main (Trenches & Perps coming soon)`
                  : 'Funds held in your smart account'}
              </p>
            </section>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {overview.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    section === item.id
                      ? 'border-ink bg-surface'
                      : 'border-line bg-surface hover:border-line-strong'
                  }`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    {item.label}
                  </p>
                  <p className="mt-2 font-mono text-[18px] font-medium text-ink">
                    {item.value}
                    <span className="ml-1 text-[12px] font-normal text-muted">USDC</span>
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line pb-px">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-medium transition ${
                    section === s.id
                      ? 'border-b-2 border-ink text-ink'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {s.label}
                  {s.soon ? (
                    <span className="ml-1.5 text-[10px] font-normal text-muted">Soon</span>
                  ) : null}
                </button>
              ))}
            </div>

            <section className="mt-6">
              <h2 className="text-[18px] font-semibold tracking-tight text-ink">
                {active.label}
              </h2>
              <p className="mt-1 text-[13px] text-muted">{active.blurb}</p>

              {section === 'main' && (
                <MainSection
                  balances={balances}
                  loadingBalances={loadingBalances}
                  busy={busy}
                  onOpenDeposit={() => setModal('deposit')}
                  onOpenWithdraw={() => setModal('withdraw')}
                  history={sectionHistory}
                />
              )}

              {section === 'savings' && (
                <SavingsSection
                  config={config}
                  savingsBal={savingsBal}
                  history={sectionHistory}
                />
              )}

              {(section === 'trenches' || section === 'perps') && (
                <SoonSection name={active.label} />
              )}
            </section>

            {(status || err) && (
              <div className="mt-4 space-y-2">
                {status && (
                  <p className="rounded-xl border border-line bg-surface px-4 py-2.5 font-mono text-[12px] text-ink-soft">
                    {status}
                  </p>
                )}
                {err && (
                  <p className="alert-error">
                    {err}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {modal === 'deposit' && (
        <Modal title="Deposit to Main" onClose={closeModal}>
          <form onSubmit={(e) => void onDeposit(e)}>
            <p className="text-[13px] text-muted">
              Transfer USDC from your wallet into the vault Main balance.
            </p>
            {balances && (
              <p className="mt-2 font-mono text-[12px] text-muted">
                Wallet: {trimAmt(balances.walletUsdcFormatted)} USDC
              </p>
            )}
            <label className="mt-4 block text-[12px] font-medium text-muted">
              Amount
              <input
                type="number"
                min="0"
                step="any"
                autoFocus
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.0"
                className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink"
                required
              />
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={!!busy}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === 'deposit' || !depositAmount}
                className="btn-primary flex-1"
              >
                {busy === 'deposit' ? 'Confirm in MetaMask…' : 'Deposit'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'withdraw' && (
        <Modal title="Withdraw from Main" onClose={closeModal}>
          <form onSubmit={(e) => void onWithdraw(e)}>
            <p className="text-[13px] text-muted">
              Send USDC from the vault back to your connected wallet.
            </p>
            {balances && (
              <p className="mt-2 font-mono text-[12px] text-muted">
                Available: {trimAmt(balances.vaultUsdcFormatted)} USDC
              </p>
            )}
            <label className="mt-4 block text-[12px] font-medium text-muted">
              Amount
              <input
                type="number"
                min="0"
                step="any"
                autoFocus
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.0"
                className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink"
                required
              />
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy === 'withdraw-all'}
                onClick={() => void onWithdrawAll()}
                className="btn-outline"
              >
                {busy === 'withdraw-all' ? '…' : 'All'}
              </button>
              <button
                type="button"
                onClick={closeModal}
                disabled={!!busy}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === 'withdraw' || !withdrawAmount}
                className="btn-primary flex-1"
              >
                {busy === 'withdraw' ? 'Confirm…' : 'Withdraw'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[18px] leading-none text-muted hover:bg-bg hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function MainSection({
  balances,
  loadingBalances,
  busy,
  onOpenDeposit,
  onOpenWithdraw,
  history,
}) {
  const usdc = balances
    ? trimAmt(balances.vaultUsdcFormatted)
    : loadingBalances
      ? '…'
      : '—'
  const eth = balances
    ? trimAmt(balances.vaultEthFormatted, 5)
    : loadingBalances
      ? '…'
      : '—'
  const wallet = balances
    ? `${trimAmt(balances.walletUsdcFormatted)} USDC`
    : loadingBalances
      ? '…'
      : '—'

  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Main balance
          </p>
          <p className="mt-2 font-mono text-[22px] font-medium text-ink">
            {usdc} <span className="text-[13px] text-muted">USDC</span>
          </p>
          <p className="mt-1 text-[12px] text-muted">Wallet: {wallet}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Vault ETH
          </p>
          <p className="mt-2 font-mono text-[22px] font-medium text-ink">
            {eth} <span className="text-[13px] text-muted">ETH</span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onOpenDeposit}
          disabled={!!busy}
          className="btn-primary min-w-[120px]"
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={onOpenWithdraw}
          disabled={!!busy}
          className="btn-outline min-w-[120px]"
        >
          Withdraw
        </button>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-[15px] font-semibold text-ink">Main activity</h3>
        <p className="mt-1 text-[12px] text-muted">Deposits and withdrawals</p>
        <div className="mt-4">
          <ActivityList items={history} emptyText="No Main activity yet." />
        </div>
      </div>
    </>
  )
}

function SavingsSection({ config, savingsBal, history }) {
  if (!config?.savings) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="text-[15px] font-medium text-ink">No savings wallet linked</p>
        <p className="mt-1 text-[13px] text-muted">
          Create an automation that sends a % of incoming USDC to a savings address.
        </p>
        <Link to="/app/new" className="btn-primary mt-5 inline-flex">
          New automation
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Savings balance
        </p>
        <p className="mt-2 font-mono text-[22px] font-medium text-ink">
          {savingsBal ? trimAmt(savingsBal.formatted) : '—'}{' '}
          <span className="text-[13px] text-muted">USDC</span>
        </p>
        <p className="mt-3 font-mono text-[12px] text-muted">{config.savings}</p>
        <p className="mt-2 text-[12px] text-muted">
          Automation split{' '}
          {config.splitEnabled
            ? `${(config.splitBps / 100).toFixed(0)}% On`
            : 'Off'}
          {' · '}
          Balance is on this external wallet (not inside the vault contract).
        </p>
        <Link
          to="/app"
          className="mt-4 inline-block text-[13px] font-medium text-teal hover:underline"
        >
          Manage automations →
        </Link>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-[15px] font-semibold text-ink">Savings activity</h3>
        <p className="mt-1 text-[12px] text-muted">
          Automation splits sent from your vault
        </p>
        <div className="mt-4">
          <ActivityList items={history} emptyText="No savings splits yet." />
        </div>
      </div>
    </>
  )
}

function SoonSection({ name }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-ink">{name} is coming soon</p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] text-muted">
        Same vault under the hood — this section will get its own balance and
        strategies later. For now funds live in Main.
      </p>
      <p className="mt-6 font-mono text-[20px] font-medium text-ink">
        0 <span className="text-[13px] font-normal text-muted">USDC</span>
      </p>
    </div>
  )
}

function trimAmt(value, maxDecimals = 4) {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals })
}
