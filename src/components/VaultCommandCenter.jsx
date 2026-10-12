import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getAutomationBlocks,
  getAutomationFunding,
  getAutomationStatus,
  getAutomationTitle,
  getReservedFunds,
} from '../lib/automationBlocks'
import { truncateAddress } from '../lib/automations'
import { getBalanceSeries } from '../lib/balanceSeries'
import { Sparkline } from './Sparkline'

function trimAmt(value, maxDecimals = 4) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '—')
  if (n === 0) return '0'
  return n.toFixed(maxDecimals).replace(/\.?0+$/, '')
}

function nodeSummary(rule) {
  const { ifBlock, thenBlocks } = getAutomationBlocks(rule)
  const trigger = (ifBlock?.lines || []).join(' · ')
  const action = (thenBlocks?.[0]?.lines || []).join(' · ')
  return { trigger, action }
}

/**
 * Angle sets (deg) around the vault hub.
 * 0 = right, 90 = bottom, 180 = left, 270 = top.
 * Tuned for balance + chrome clearance (avoid dead-top).
 */
const ANGLE_SETS = {
  1: [18],
  2: [205, 335],
  3: [210, 330, 95],
  4: [220, 320, 40, 140],
  5: [205, 250, 325, 35, 100],
  6: [200, 245, 300, 350, 50, 130],
  7: [195, 235, 280, 330, 20, 70, 125],
  8: [195, 235, 275, 320, 15, 55, 100, 145],
}

function slotFor(index, count) {
  const n = Math.min(Math.max(count, 1), 8)
  const angles = ANGLE_SETS[n] || ANGLE_SETS[8]
  const deg = angles[index % angles.length]
  const rad = (deg * Math.PI) / 180
  // Wide ellipse — satellites clear of the hub, not corner-pinned
  const rx = n <= 2 ? 34 : n <= 4 ? 36 : 37
  const ry = n <= 2 ? 22 : n <= 4 ? 30 : 32
  return {
    x: 50 + Math.cos(rad) * rx,
    y: 54 + Math.sin(rad) * ry,
  }
}

function edgeToward(from, to, pad = 0) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const hw = from.w / 2 + pad
  const hh = from.h / 2 + pad
  const tx = Math.abs(ux) < 1e-6 ? Infinity : hw / Math.abs(ux)
  const ty = Math.abs(uy) < 1e-6 ? Infinity : hh / Math.abs(uy)
  const t = Math.min(tx, ty)
  return { x: from.x + ux * t, y: from.y + uy * t }
}

/** Gentle arc with a perpendicular bulge — reads as routed flow, not a stab. */
function curvePath(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const bulge = Math.min(28, len * 0.14)
  const mx = (a.x + b.x) / 2 - (dy / len) * bulge
  const my = (a.y + b.y) / 2 + (dx / len) * bulge
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}

/**
 * Full-bleed vault canvas — orbital automations wired to the hub.
 */
export function VaultCommandCenter({
  vault,
  balances,
  loadingBalances,
  rules,
  loadingRules,
  activeCount,
  onSelectRule,
  selectedId,
}) {
  const usdc = loadingBalances
    ? '…'
    : balances
      ? trimAmt(balances.vaultUsdcFormatted)
      : '—'
  const eth = loadingBalances
    ? '…'
    : balances
      ? trimAmt(balances.vaultEthFormatted, 5)
      : '—'

  const usdcSeries = useMemo(
    () =>
      getBalanceSeries(vault, 'usdc', {
        current: balances?.vaultUsdcFormatted,
      }),
    [vault, balances?.vaultUsdcFormatted],
  )

  const reserved = useMemo(
    () => getReservedFunds(rules, balances),
    [rules, balances],
  )
  const availableLine =
    !loadingBalances && balances
      ? `${trimAmt(reserved.availableUsdc)} USDC available · ${trimAmt(reserved.availableEth, 5)} ETH available`
      : null

  const nodes = useMemo(() => {
    // Live / needs-attention first so the constellation reads active → quiet
    return [...rules]
      .sort((a, b) => {
        const aLive = a.enabled && !getAutomationFunding(a, balances).starved ? 1 : 0
        const bLive = b.enabled && !getAutomationFunding(b, balances).starved ? 1 : 0
        if (bLive !== aLive) return bLive - aLive
        return Number(b.enabled) - Number(a.enabled)
      })
      .slice(0, 8)
  }, [rules, balances])
  const count = nodes.length
  const attentionCount = useMemo(
    () =>
      rules.filter(
        (r) => r.enabled && getAutomationFunding(r, balances).starved,
      ).length,
    [rules, balances],
  )

  const stageRef = useRef(null)
  const vaultRef = useRef(null)
  const nodeRefs = useRef(new Map())
  const [wires, setWires] = useState([])
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })

  const setNodeRef = (id, el) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const measure = () => {
      const sr = stage.getBoundingClientRect()
      const w = sr.width
      const h = sr.height
      setStageSize({ w, h })

      const vaultEl = vaultRef.current
      if (!vaultEl || !w || !h) {
        setWires([])
        return
      }

      const vr = vaultEl.getBoundingClientRect()
      const hub = {
        x: vr.left - sr.left + vr.width / 2,
        y: vr.top - sr.top + vr.height / 2,
        w: vr.width,
        h: vr.height,
      }

      const next = nodes
        .map((rule) => {
          const el = nodeRefs.current.get(rule.id)
          if (!el) return null
          const nr = el.getBoundingClientRect()
          const node = {
            x: nr.left - sr.left + nr.width / 2,
            y: nr.top - sr.top + nr.height / 2,
            w: nr.width,
            h: nr.height,
          }
          const start = edgeToward(hub, node, 1)
          const end = edgeToward(node, hub, 1)
          const live =
            rule.enabled && !getAutomationFunding(rule, balances).starved
          return {
            id: rule.id,
            enabled: live,
            d: curvePath(start, end),
            sx: start.x,
            sy: start.y,
            ex: end.x,
            ey: end.y,
          }
        })
        .filter(Boolean)

      setWires(next)
    }

    // Second frame so absolute layout settles before measuring
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(stage)
    if (vaultRef.current) ro.observe(vaultRef.current)
    for (const el of nodeRefs.current.values()) ro.observe(el)

    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [nodes, selectedId, loadingBalances, usdc, balances])

  return (
    <section className="money-os money-os-canvas animate-in">
      <div
        ref={stageRef}
        className={`money-os-stage ${count === 0 ? 'is-empty' : ''}`}
      >
        <div className="money-os-chrome">
          <div className="money-os-chrome-left">
            <h2 className="money-os-chrome-title">Main Vault</h2>
            <p className="money-os-chrome-meta">
              {activeCount} active
              {attentionCount > 0 ? (
                <>
                  <span className="money-os-dot" aria-hidden="true" />
                  {attentionCount} need attention
                </>
              ) : null}
              <span className="money-os-dot" aria-hidden="true" />
              {rules.length} connected
            </p>
          </div>
          <Link to="/app/new" className="btn-primary money-os-chrome-cta">
            New rule
          </Link>
        </div>

        <div className="money-os-orbit" aria-hidden="true" />
        <div className="money-os-orbit is-inner" aria-hidden="true" />

        {stageSize.w > 0 && wires.length > 0 ? (
          <svg
            className="money-os-wires"
            width={stageSize.w}
            height={stageSize.h}
            viewBox={`0 0 ${stageSize.w} ${stageSize.h}`}
            aria-hidden="true"
          >
            {wires.map((wire, i) => (
              <g key={wire.id}>
                <path className="money-os-wire-track" d={wire.d} fill="none" />
                <path
                  className={`money-os-wire-flux ${wire.enabled ? 'is-live' : ''}`}
                  d={wire.d}
                  fill="none"
                  style={{ animationDelay: `${i * 0.35}s` }}
                />
                <circle
                  className={`money-os-wire-port ${wire.enabled ? 'is-live' : ''}`}
                  cx={wire.sx}
                  cy={wire.sy}
                  r="2.75"
                />
                <circle
                  className={`money-os-wire-port is-end ${wire.enabled ? 'is-live' : ''}`}
                  cx={wire.ex}
                  cy={wire.ey}
                  r="2.25"
                />
                {wire.enabled ? (
                  <circle className="money-os-wire-packet" r="2.75">
                    <animateMotion
                      dur={`${2.6 + i * 0.25}s`}
                      repeatCount="indefinite"
                      path={wire.d}
                    />
                  </circle>
                ) : null}
              </g>
            ))}
          </svg>
        ) : null}

        <div ref={vaultRef} className="money-os-vault glass-panel">
          <p className="money-os-vault-label">Vault balance</p>
          <p className="money-os-vault-value">
            {usdc}
            <span>USDC</span>
          </p>
          <Sparkline values={usdcSeries} width={140} height={22} className="money-os-spark" />
          <p className="money-os-vault-sub">
            {eth} ETH
            {vault ? (
              <>
                <span className="money-os-dot" aria-hidden="true" />
                <span className="font-mono">{truncateAddress(vault, 4)}</span>
              </>
            ) : null}
          </p>
          {availableLine ? (
            <p className="money-os-vault-available" title="Balance minus max next scheduled spend">
              {availableLine}
              {reserved.reservedUsdc > 0 || reserved.reservedEth > 0
                ? ` · reserved for schedules`
                : ''}
            </p>
          ) : null}
          <div className="money-os-vault-actions">
            <Link to="/app/vault" className="btn-outline money-os-vault-btn">
              Open vault
            </Link>
          </div>
        </div>

        {nodes.map((rule, i) => {
          const slot = slotFor(i, count)
          const { trigger, action } = nodeSummary(rule)
          const title = getAutomationTitle(rule)
          const funding = getAutomationFunding(rule, balances)
          const status = getAutomationStatus(rule, balances)
          const starved = Boolean(funding.starved)
          const live = status.id === 'active' || status.id === 'due'
          const detail = starved
            ? funding.warning || 'Needs funds'
            : action || trigger

          return (
            <button
              key={rule.id}
              type="button"
              ref={(el) => setNodeRef(rule.id, el)}
              className={`money-os-node glass-panel ${live ? 'is-on' : ''} ${
                starved ? 'is-starved' : ''
              } ${selectedId === rule.id ? 'is-selected' : ''}`}
              style={{
                left: `${slot.x}%`,
                top: `${slot.y}%`,
                animationDelay: `${Math.min(i, 6) * 0.06}s`,
              }}
              onClick={() => onSelectRule?.(rule)}
            >
              <span className="money-os-node-top">
                <span
                  className={`money-os-node-pill ${
                    status.tone === 'is-warn'
                      ? 'is-warn'
                      : live
                        ? 'is-on'
                        : ''
                  }`}
                >
                  <span className={`status-dot ${live ? 'is-on' : ''}`} />
                  {status.id === 'needs_attention'
                    ? 'Attention'
                    : status.id === 'due'
                      ? 'Due'
                      : live
                        ? 'Live'
                        : 'Paused'}
                </span>
              </span>
              <span className="money-os-node-title">{title}</span>
              {detail ? (
                <span
                  className={`money-os-node-line ${starved ? 'is-warn' : ''}`}
                >
                  {detail}
                </span>
              ) : null}
            </button>
          )
        })}

        {loadingRules ? (
          <p className="money-os-stage-note">Loading rules…</p>
        ) : null}

        {!loadingRules && count === 0 ? (
          <p className="money-os-stage-note">
            No rules connected — create one to see money flow here.
          </p>
        ) : null}

        {!loadingRules && rules.length > 8 ? (
          <p className="money-os-stage-note is-corner">
            Showing 8 of {rules.length}
          </p>
        ) : null}
      </div>
    </section>
  )
}
