import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import { useTheme } from '../context/ThemeContext'
import { formatUsd } from '../lib/hyperliquid'

function toTime(ms) {
  return Math.floor(Number(ms) / 1000)
}

function themeColors(isDark) {
  if (isDark) {
    return {
      background: '#0c1218',
      text: '#9aa7b5',
      grid: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.08)',
      up: '#2dd4a8',
      down: '#f07178',
      maFast: '#f0b429',
      maSlow: '#7aa2f7',
      volUp: 'rgba(45, 212, 168, 0.45)',
      volDown: 'rgba(240, 113, 120, 0.45)',
      rsi: '#c4b5fd',
      rsiBand: 'rgba(148, 163, 184, 0.55)',
      crosshair: 'rgba(255,255,255,0.2)',
    }
  }
  return {
    background: '#f7f8fa',
    text: '#5b6570',
    grid: 'rgba(15, 23, 42, 0.06)',
    border: 'rgba(15, 23, 42, 0.08)',
    up: '#0b6b61',
    down: '#c23b3b',
    maFast: '#b45309',
    maSlow: '#2563eb',
    volUp: 'rgba(11, 107, 97, 0.35)',
    volDown: 'rgba(194, 59, 59, 0.35)',
    rsi: '#7c3aed',
    rsiBand: 'rgba(100, 116, 139, 0.5)',
    crosshair: 'rgba(15, 23, 42, 0.2)',
  }
}

function lineData(times, values) {
  const out = []
  for (let i = 0; i < times.length; i += 1) {
    const v = values[i]
    if (v == null || !Number.isFinite(v)) continue
    out.push({ time: times[i], value: v })
  }
  return out
}

function buildMarkers(trades) {
  const markers = []
  for (const trade of trades || []) {
    const entryTime = toTime(trade.entryTime)
    const exitTime = toTime(trade.exitTime)
    const win = trade.pnl > 0
    if (trade.side === 'long') {
      markers.push({
        time: entryTime,
        position: 'belowBar',
        shape: 'arrowUp',
        color: '#0b6b61',
        text: 'Long',
      })
      markers.push({
        time: exitTime,
        position: 'aboveBar',
        shape: win ? 'circle' : 'arrowDown',
        color: win ? '#0b6b61' : '#c23b3b',
        text: `Exit ${win ? '+' : ''}${trade.pnlPct?.toFixed?.(1) ?? ''}%`,
      })
    } else {
      markers.push({
        time: entryTime,
        position: 'aboveBar',
        shape: 'arrowDown',
        color: '#c23b3b',
        text: 'Short',
      })
      markers.push({
        time: exitTime,
        position: 'belowBar',
        shape: win ? 'circle' : 'arrowUp',
        color: win ? '#0b6b61' : '#c23b3b',
        text: `Exit ${win ? '+' : ''}${trade.pnlPct?.toFixed?.(1) ?? ''}%`,
      })
    }
  }
  // lightweight-charts requires markers sorted by time
  markers.sort((a, b) => a.time - b.time || a.position.localeCompare(b.position))
  return markers
}

/**
 * Professional OHLC chart: candles, MAs, volume, RSI, entry/exit markers.
 */
export function PerpsBacktestChart({ result }) {
  const containerRef = useRef(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const el = containerRef.current
    const candles = result?.candles
    if (!el || !candles?.length) return undefined

    const colors = themeColors(isDark)
    const strategy = result.strategy || {}
    const ind = result.indicators || {}
    const times = candles.map((c) => toTime(c.t))

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 11,
        panes: {
          separatorColor: colors.border,
          separatorHoverColor: colors.crosshair,
        },
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.border },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.border },
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
      },
    })

    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: colors.up,
        downColor: colors.down,
        borderUpColor: colors.up,
        borderDownColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
      },
      0,
    )
    candleSeries.setData(
      candles.map((c) => ({
        time: toTime(c.t),
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      })),
    )

    if (strategy.usePriceVsMa && ind.priceCrossMa) {
      const crossMa = chart.addSeries(
        LineSeries,
        {
          color: colors.maFast,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: `Cross MA ${strategy.priceCrossMaPeriod}`,
        },
        0,
      )
      crossMa.setData(lineData(times, ind.priceCrossMa))
    }

    if (strategy.usePriceAboveMa && ind.priceAboveMa) {
      const aboveMa = chart.addSeries(
        LineSeries,
        {
          color: colors.maSlow,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: `Trend MA ${strategy.priceAboveMaPeriod}`,
        },
        0,
      )
      aboveMa.setData(lineData(times, ind.priceAboveMa))
    }

    if (strategy.useMaCross && ind.maFast) {
      const fast = chart.addSeries(
        LineSeries,
        {
          color: '#f59e0b',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: `MA ${strategy.maFast}`,
        },
        0,
      )
      fast.setData(lineData(times, ind.maFast))
    }

    if (strategy.useMaCross && ind.maSlow) {
      const slow = chart.addSeries(
        LineSeries,
        {
          color: '#a78bfa',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: `MA ${strategy.maSlow}`,
        },
        0,
      )
      slow.setData(lineData(times, ind.maSlow))
    }

    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      },
      0,
    )
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    })
    volumeSeries.setData(
      candles.map((c, i) => ({
        time: times[i],
        value: c.v,
        color: c.c >= c.o ? colors.volUp : colors.volDown,
      })),
    )

    if (strategy.useVolume && ind.volMa) {
      const volMa = chart.addSeries(
        LineSeries,
        {
          color: colors.text,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceScaleId: 'volume',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: 'Vol MA',
        },
        0,
      )
      volMa.setData(
        lineData(
          times,
          ind.volMa.map((v) =>
            v == null ? null : v * Number(strategy.volumeMult || 1),
          ),
        ),
      )
    }

    if (strategy.useRsi && ind.rsi) {
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: colors.rsi,
          lineWidth: 2,
          lastValueVisible: true,
          priceLineVisible: false,
          title: 'RSI',
        },
        1,
      )
      rsiSeries.setData(lineData(times, ind.rsi))
      const panes = chart.panes()
      if (panes[1]) {
        panes[1].setHeight(120)
      }
      rsiSeries.createPriceLine({
        price: Number(strategy.rsiShortAbove ?? strategy.rsiOverbought) || 60,
        color: colors.rsiBand,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Short>',
      })
      rsiSeries.createPriceLine({
        price: Number(strategy.rsiLongBelow ?? strategy.rsiOversold) || 40,
        color: colors.rsiBand,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Long<',
      })
      rsiSeries.createPriceLine({
        price: 50,
        color: colors.grid,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      })
    }

    const markersApi = createSeriesMarkers(candleSeries, buildMarkers(result.trades))

    chart.timeScale().fitContent()

    return () => {
      markersApi.detach()
      chart.remove()
    }
  }, [result, isDark])

  if (!result?.candles?.length) return null

  const strategy = result.strategy || {}

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Price & signals</h3>
          <p className="text-[12px] text-muted">
            {strategy.coin} · {strategy.interval} · candles with indicators and trade markers
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          {strategy.usePriceVsMa ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-amber-600 dark:bg-amber-400" />
              Cross MA {strategy.priceCrossMaPeriod}
            </span>
          ) : null}
          {strategy.usePriceAboveMa ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-blue-600 dark:bg-blue-400" />
              Trend MA {strategy.priceAboveMaPeriod}
            </span>
          ) : null}
          {strategy.useMaCross ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-amber-600 dark:bg-amber-400" />
                Fast MA
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-violet-500" />
                Slow MA
              </span>
            </>
          ) : null}
          {strategy.useRsi ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-violet-600 dark:bg-violet-400" />
              RSI
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span className="text-teal">▲</span> Long entry
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-danger">▼</span> Short entry
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span>○</span> Exit
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="mt-3 h-[440px] w-full overflow-hidden rounded-xl border border-line"
      />

      {result.trades?.length ? (
        <p className="mt-2 text-[12px] text-muted">
          {result.trades.length} trades marked · hover crosshair for OHLC · last exit{' '}
          {formatUsd(result.trades[result.trades.length - 1]?.exit)}
        </p>
      ) : (
        <p className="mt-2 text-[12px] text-muted">No trade markers — strategy did not fill.</p>
      )}
    </div>
  )
}
