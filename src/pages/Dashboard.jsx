import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActivityList } from '../components/ActivityList'
import { AppHeader } from '../components/AppHeader'
import { WalletButton } from '../components/WalletButton'
import { useWallet } from '../context/WalletContext'
import {
  deleteAutomation,
  describeAutomation,
  getCachedVault,
  listAutomations,
  setCachedVault,
  truncateAddress,
  updateAutomation,
} from '../lib/automations'
import { fetchVaultHistory } from '../lib/history'
import {
  getVaultAddress,
  SEPOLIA_USDC,
  setRecurringEnabled,
  setSplitEnabled,
} from '../lib/vault'

export function Dashboard() {
  const { address, hasExtension, connecting, error, connect } = useWallet()
  const [rules, setRules] = useState([])
  const [loadingRules, setLoadingRules] = useState(false)
  const [vault, setVault] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [historyByRule, setHistoryByRule] = useState({})
  const [historyLoading, setHistoryLoading] = useState(null)

  const refresh = useCallback(async () => {
    if (!address) {
      setRules([])
      return
    }
    setLoadingRules(true)
    setActionError(null)
    try {
      const items = await listAutomations(address)
      setRules(items)
    } catch (err) {
      setRules([])
      setActionError(err?.message || 'Could not load automations')
    } finally {
      setLoadingRules(false)
    }
  }, [address])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!address) {
      setVault(null)
      return
    }
    const cached = getCachedVault(address)
    if (cached) setVault(cached)

    getVaultAddress(address)
      .then((addr) => {
        if (addr) {
          setVault(addr)
          setCachedVault(address, addr)
        }
      })
      .catch(() => {})
  }, [address])

  const loadHistory = useCallback(async (rule) => {
    if (!rule.vaultAddress) return
    setHistoryLoading(rule.id)
    try {
      const items = await fetchVaultHistory(rule.vaultAddress, {
        token: rule.trigger?.token || SEPOLIA_USDC,
        savingsAddress: rule.action?.to,
      })
      const focused =
        rule.action?.type === 'send_amount'
          ? items.filter((i) => i.type === 'recurring' || i.type === 'deposit')
          : items.filter((i) => i.type === 'split' || i.type === 'deposit')
      setHistoryByRule((prev) => ({ ...prev, [rule.id]: focused }))
    } catch (err) {
      setHistoryByRule((prev) => ({ ...prev, [rule.id]: [] }))
      const msg = String(err?.shortMessage || err?.message || '')
      if (!/coalesce|eth_getLogs|10 block/i.test(msg)) {
        setActionError(err.message || 'Could not load history')
      }
    } finally {
      setHistoryLoading(null)
    }
  }, [])

  const toggleHistory = (rule) => {
    if (expandedId === rule.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(rule.id)
    if (!historyByRule[rule.id]) {
      void loadHistory(rule)
    }
  }

  if (!address) {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <AppHeader />
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Connect your wallet
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Non-custodial: you deploy and own your automation vault. Keys stay
              in MetaMask.
            </p>
            {!hasExtension && (
              <p className="alert-error mt-5">
                MetaMask was not detected. Install the extension, then refresh.
              </p>
            )}
            {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
            <div className="mt-8 flex justify-center">
              <WalletButton
                onClick={() => void connect()}
                connecting={connecting}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const copyVault = async () => {
    if (!vault) return
    await navigator.clipboard.writeText(vault)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toggleEnabled = async (rule) => {
    setBusyId(rule.id)
    setActionError(null)
    try {
      const enabled = !rule.enabled
      if (rule.vaultAddress) {
        if (rule.action?.type === 'send_amount') {
          await setRecurringEnabled(rule.vaultAddress, enabled, {
            token: rule.trigger?.token || SEPOLIA_USDC,
            to: rule.action.to,
            amountHuman: rule.action.amountHuman,
            interval: rule.trigger.interval,
            decimals: rule.action.decimals ?? 6,
          })
        } else {
          await setSplitEnabled(rule.vaultAddress, enabled, {
            token: rule.trigger?.token || SEPOLIA_USDC,
            savings: rule.action.to,
            percent: rule.action.percent,
          })
        }
      }
      const updated = await updateAutomation(address, rule.id, { enabled })
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)))
    } catch (err) {
      setActionError(err?.shortMessage || err?.message || 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  const onDelete = async (rule) => {
    setActionError(null)
    try {
      await deleteAutomation(address, rule.id)
      setRules((prev) => prev.filter((r) => r.id !== rule.id))
    } catch (err) {
      setActionError(err?.message || 'Delete failed')
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Automations
            </h1>
            <p className="mt-1.5 text-[14px] text-muted">
              Saved to your wallet on Supabase · manage funds in Vault.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/app/vault" className="btn-outline">
              Vault
            </Link>
            <Link to="/app/new" className="btn-primary">
              New automation
            </Link>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
              Your vault
            </p>
            <Link to="/app/vault" className="text-[12px] font-medium text-teal hover:underline">
              Manage funds →
            </Link>
          </div>
          {vault ? (
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
          ) : (
            <p className="mt-3 text-[14px] text-muted">
              No vault yet — create an automation or deploy one in Vault.
            </p>
          )}
        </section>

        {actionError && <p className="alert-error mt-4">{actionError}</p>}

        <ul className="mt-8 space-y-3">
          {loadingRules && (
            <li className="rounded-2xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-muted">
              Loading your automations…
            </li>
          )}

          {!loadingRules && rules.length === 0 && (
            <li className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
              <p className="text-[15px] font-medium text-ink">No automations yet</p>
              <p className="mt-1 text-[13px] text-muted">
                Split incoming USDC, or send a fixed amount on a schedule.
              </p>
              <Link to="/app/new" className="btn-primary mt-5 inline-flex">
                Build your first rule
              </Link>
            </li>
          )}

          {!loadingRules &&
            rules.map((rule) => (
              <li
                key={rule.id}
                className="rounded-2xl border border-line bg-surface px-5 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-teal">
                        IF
                      </span>
                      <span className="text-muted">→</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-mango">
                        THEN
                      </span>
                      <span
                        className={`ml-1 text-[11px] font-medium ${
                          rule.enabled ? 'text-teal' : 'text-muted'
                        }`}
                      >
                        {rule.enabled ? 'On' : 'Off'}
                      </span>
                    </div>
                    <p className="text-[14px] leading-relaxed text-ink">
                      {describeAutomation(rule)}
                    </p>
                    {rule.vaultAddress && (
                      <p className="mt-1 font-mono text-[11px] text-muted">
                        Vault {truncateAddress(rule.vaultAddress, 6)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[13px]">
                    {rule.vaultAddress && (
                      <button
                        type="button"
                        onClick={() => toggleHistory(rule)}
                        className="text-ink-soft hover:text-ink"
                      >
                        {expandedId === rule.id ? 'Hide history' : 'History'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === rule.id}
                      onClick={() => void toggleEnabled(rule)}
                      className="text-ink-soft hover:text-ink"
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(rule)}
                      className="text-muted hover:text-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expandedId === rule.id && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
                      Recent transactions
                    </p>
                    {historyLoading === rule.id ? (
                      <p className="text-[13px] text-muted">Loading…</p>
                    ) : (
                      <ActivityList
                        items={historyByRule[rule.id] || []}
                        limit={8}
                        emptyText="No matching transactions for this rule yet."
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
        </ul>
      </main>
    </div>
  )
}
