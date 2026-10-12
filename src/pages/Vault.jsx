import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActivityList } from '../components/ActivityList'
import { DashShell } from '../components/DashShell'
import { NetworkBanner } from '../components/NetworkBanner'
import { Sparkline } from '../components/Sparkline'
import { WalletButton } from '../components/WalletButton'
import { useWallet } from '../context/WalletContext'
import { getCachedVault, setCachedVault } from '../lib/automations'
import {
  getBalanceSeries,
  recordVaultBalanceSnapshot,
  seriesDelta,
} from '../lib/balanceSeries'
import { explorerTxUrl, fetchVaultHistory } from '../lib/history'
import {
  SEPOLIA_USDC,
  depositEth,
  depositUsdc,
  ensureVault,
  getVaultAddress,
  getVaultBalances,
  getVaultConfig,
  withdrawAllEth,
  withdrawAllUsdc,
  withdrawEth,
  withdrawUsdc,
} from '../lib/vault'

export function VaultPage() {
  const { address, hasExtension, connecting, error, connect, chainName } = useWallet()
  const [vault, setVault] = useState(null)
  const [balances, setBalances] = useState(null)
  const [config, setConfig] = useState(null)
  const [history, setHistory] = useState([])
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [asset, setAsset] = useState('USDC')
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(null)
  const [status, setStatus] = useState(null)
  const [statusTx, setStatusTx] = useState(null)
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
        return
      }

      setVault(vaultAddr)
      setCachedVault(address, vaultAddr)

      const [b, c] = await Promise.all([
        getVaultBalances(vaultAddr, address),
        getVaultConfig(vaultAddr),
      ])

      setBalances(b)
      setConfig(c)
      recordVaultBalanceSnapshot(vaultAddr, {
        usdc: b.vaultUsdcFormatted,
        eth: b.vaultEthFormatted,
      })

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
    setConfig(null)
    setHistory([])
    setErr(null)
    if (!address) return
    refresh().catch((e) => {
      setErr(e.message)
      setLoadingBalances(false)
    })
  }, [address, refresh])

  const usdcSeries = useMemo(
    () =>
      getBalanceSeries(vault, 'usdc', {
        current: balances?.vaultUsdcFormatted,
        history,
      }),
    [vault, balances?.vaultUsdcFormatted, history],
  )
  const ethSeries = useMemo(
    () =>
      getBalanceSeries(vault, 'eth', {
        current: balances?.vaultEthFormatted,
        history,
      }),
    [vault, balances?.vaultEthFormatted, history],
  )
  const usdcDelta = seriesDelta(usdcSeries)
  const ethDelta = seriesDelta(ethSeries)

  if (!address) {
    return (
      <DashShell>
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="vault-empty w-full max-w-md text-center">
            <p className="landing-eyebrow justify-center">Vault</p>
            <h1 className="dash-title mt-3">Connect to manage your vault</h1>
            <p className="mt-3 text-[15px] text-muted">
              One vault for deposits, withdrawals, and automation activity.
            </p>
            {!hasExtension && (
              <p className="alert-error mt-5">MetaMask was not detected.</p>
            )}
            {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
            <div className="mt-8 flex justify-center">
              <WalletButton onClick={() => void connect()} connecting={connecting} />
            </div>
          </div>
        </div>
      </DashShell>
    )
  }

  const onCreateVault = async () => {
    setBusy('create')
    setErr(null)
    setStatusTx(null)
    setStatus('Confirm MetaMask: deploy vault…')
    try {
      const addr = await ensureVault()
      setCachedVault(address, addr)
      setVault(addr)
      setStatus('Vault deployed.')
      await refresh()
    } catch (e) {
      setErr(humanTxError(e, 'Deploy failed'))
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
    setAsset('USDC')
  }

  const onDeposit = async (e) => {
    e.preventDefault()
    if (!vault || !depositAmount) return
    setBusy('deposit')
    setErr(null)
    setStatusTx(null)
    setStatus(`Confirm MetaMask: deposit ${asset}…`)
    try {
      const hash =
        asset === 'ETH'
          ? await depositEth(vault, depositAmount)
          : await depositUsdc(vault, depositAmount)
      setStatus(`Deposited ${asset} (confirmed)`)
      setStatusTx(hash)
      setDepositAmount('')
      setModal(null)
      await refresh()
    } catch (e2) {
      setErr(humanTxError(e2, 'Deposit failed'))
      setStatus(null)
      setStatusTx(null)
    } finally {
      setBusy(null)
    }
  }

  const onWithdraw = async (e) => {
    e.preventDefault()
    if (!vault || !withdrawAmount) return
    setBusy('withdraw')
    setErr(null)
    setStatusTx(null)
    setStatus(`Confirm MetaMask: withdraw ${asset}…`)
    try {
      const hash =
        asset === 'ETH'
          ? await withdrawEth(vault, withdrawAmount, address)
          : await withdrawUsdc(vault, withdrawAmount, address)
      setStatus(`Withdrew ${asset} (confirmed)`)
      setStatusTx(hash)
      setWithdrawAmount('')
      setModal(null)
      await refresh()
    } catch (e2) {
      setErr(humanTxError(e2, 'Withdraw failed'))
      setStatus(null)
      setStatusTx(null)
    } finally {
      setBusy(null)
    }
  }

  const onWithdrawAll = async () => {
    if (!vault || !address) return
    setBusy('withdraw-all')
    setErr(null)
    setStatusTx(null)
    setStatus(`Confirm MetaMask: withdraw all ${asset}…`)
    try {
      const hash =
        asset === 'ETH'
          ? await withdrawAllEth(vault, address)
          : await withdrawAllUsdc(vault, address)
      setStatus(`Withdrew all ${asset} (confirmed)`)
      setStatusTx(hash)
      setWithdrawAmount('')
      setModal(null)
      await refresh()
    } catch (e2) {
      setErr(humanTxError(e2, 'Withdraw failed'))
      setStatus(null)
      setStatusTx(null)
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
  const walletUsdc = balances
    ? `${trimAmt(balances.walletUsdcFormatted)} USDC`
    : loadingBalances
      ? '…'
      : '—'

  return (
    <>
      <DashShell>
        <NetworkBanner />
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Vault</h1>
            <p className="dash-subtitle">
              Deposit, withdraw, and track confirmed on-chain activity
              {chainName ? ` · ${chainName}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => refresh().catch((e) => setErr(e.message))}
              className="btn-outline text-[13px]"
            >
              Refresh
            </button>
            <Link to="/app/new" className="btn-primary">
              New rule
            </Link>
          </div>
        </div>

        {!vault ? (
          <section className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
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
                New rule
              </Link>
            </div>
            {(status || err) && (
              <div className="mx-auto mt-6 max-w-md space-y-2 text-left">
                {status ? (
                  <p className="rounded-xl border border-line bg-surface px-4 py-2.5 font-mono text-[12px] text-ink-soft">
                    {status}
                    {statusTx ? (
                      <>
                        {' '}
                        <a
                          href={explorerTxUrl(statusTx)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal hover:underline"
                        >
                          {statusTx.slice(0, 10)}…↗
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {err ? <p className="alert-error">{err}</p> : null}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-line bg-surface p-5">
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
              {config?.savings ? (
                <p className="mt-3 text-[12px] text-muted">
                  Split destination{' '}
                  <span className="font-mono text-ink-soft">{config.savings}</span>
                  {config.splitEnabled
                    ? ` · ${(config.splitBps / 100).toFixed(0)}% on`
                    : ' · off'}
                </p>
              ) : null}
            </section>

            <section className="vault-balance-panel mt-4">
              <div className="vault-balance-grid">
                <article className="vault-balance-card">
                  <div className="vault-balance-head">
                    <span className="vault-token is-usdc">$</span>
                    <span>USDC</span>
                  </div>
                  <p className="vault-balance-amt">{usdc}</p>
                  <p
                    className={`vault-balance-delta ${
                      usdcDelta > 0 ? 'is-up' : usdcDelta < 0 ? 'is-down' : ''
                    }`}
                  >
                    {loadingBalances
                      ? '…'
                      : usdcDelta === 0
                        ? 'No change in window'
                        : `${usdcDelta > 0 ? '+' : ''}${trimAmt(usdcDelta)} window`}
                  </p>
                  <Sparkline values={usdcSeries} tone="teal" />
                </article>

                <article className="vault-balance-card">
                  <div className="vault-balance-head">
                    <span className="vault-token is-eth">Ξ</span>
                    <span>ETH</span>
                  </div>
                  <p className="vault-balance-amt">{eth}</p>
                  <p
                    className={`vault-balance-delta ${
                      ethDelta > 0 ? 'is-up' : ethDelta < 0 ? 'is-down' : ''
                    }`}
                  >
                    {loadingBalances
                      ? '…'
                      : ethDelta === 0
                        ? 'No change in window'
                        : `${ethDelta > 0 ? '+' : ''}${trimAmt(ethDelta, 5)} window`}
                  </p>
                  <Sparkline values={ethSeries} tone="mango" />
                </article>
              </div>

              <p className="vault-balance-wallet">Wallet {walletUsdc}</p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setModal('deposit')}
                  disabled={!!busy}
                  className="btn-primary min-w-[120px]"
                >
                  Deposit
                </button>
                <button
                  type="button"
                  onClick={() => setModal('withdraw')}
                  disabled={!!busy}
                  className="btn-outline min-w-[120px]"
                >
                  Withdraw
                </button>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-[15px] font-semibold text-ink">Activity</h2>
              <p className="mt-1 text-[12px] text-muted">
                Deposits, withdrawals, splits, DCA, and scheduled sends
              </p>
              <div className="mt-4">
                <ActivityList items={history} emptyText="No vault activity yet." />
              </div>
            </section>

            {(status || err) && (
              <div className="mt-4 space-y-2">
                {status && (
                  <p className="rounded-xl border border-line bg-surface px-4 py-2.5 font-mono text-[12px] text-ink-soft">
                    {status}
                    {statusTx ? (
                      <>
                        {' '}
                        <a
                          href={explorerTxUrl(statusTx)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal hover:underline"
                        >
                          {statusTx.slice(0, 10)}…↗
                        </a>
                      </>
                    ) : null}
                  </p>
                )}
                {err && <p className="alert-error">{err}</p>}
              </div>
            )}
          </>
        )}
      </DashShell>

      {modal === 'deposit' && (
        <Modal title="Deposit" onClose={closeModal}>
          <form onSubmit={(e) => void onDeposit(e)}>
            <div className="mb-3 flex gap-2">
              {['USDC', 'ETH'].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAsset(a)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${
                    asset === a
                      ? 'bg-ink text-bg'
                      : 'border border-line text-muted hover:text-ink'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-muted">
              Transfer {asset} from your wallet into the vault.
              {asset === 'ETH' ? ' Needed for custom-token DCA.' : ''}
            </p>
            {balances && (
              <p className="mt-2 font-mono text-[12px] text-muted">
                Wallet:{' '}
                {asset === 'ETH'
                  ? `${trimAmt(balances.walletEthFormatted, 5)} ETH`
                  : `${trimAmt(balances.walletUsdcFormatted)} USDC`}
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
        <Modal title="Withdraw" onClose={closeModal}>
          <form onSubmit={(e) => void onWithdraw(e)}>
            <div className="mb-3 flex gap-2">
              {['USDC', 'ETH'].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAsset(a)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${
                    asset === a
                      ? 'bg-ink text-bg'
                      : 'border border-line text-muted hover:text-ink'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-muted">
              Send {asset} from the vault back to your connected wallet.
            </p>
            {balances && (
              <p className="mt-2 font-mono text-[12px] text-muted">
                Vault:{' '}
                {asset === 'ETH'
                  ? `${trimAmt(balances.vaultEthFormatted, 5)} ETH`
                  : `${trimAmt(balances.vaultUsdcFormatted)} USDC`}
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
    </>
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

function trimAmt(value, maxDecimals = 4) {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals })
}

function humanTxError(err, fallback) {
  const msg = String(err?.shortMessage || err?.message || fallback)
  if (/user rejected|denied|ACTION_REJECTED/i.test(msg)) {
    return 'Transaction rejected in MetaMask'
  }
  if (/insufficient funds|exceeds balance/i.test(msg)) {
    return 'Insufficient funds for this transaction'
  }
  if (/network| eth_ |timeout|429/i.test(msg)) {
    return 'Network error — check you are on Sepolia and try again'
  }
  return msg || fallback
}
