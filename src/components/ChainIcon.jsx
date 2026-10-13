/** Compact chain marks for the network switcher. */

const ICONS = {
  ethereum: EthereumMark,
  sepolia: EthereumMark,
  base: BaseMark,
  arbitrum: ArbitrumMark,
  robinhood: RobinhoodMark,
}

export function ChainIcon({ chainKey, size = 18, className = '' }) {
  const Cmp = ICONS[chainKey] || FallbackMark
  return (
    <span
      className={`chain-icon ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Cmp />
    </span>
  )
}

function EthereumMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path d="M16.5 4.5v8.4l7.1 3.17L16.5 4.5z" fill="#fff" fillOpacity=".6" />
      <path d="M16.5 4.5 9.4 16.07l7.1-3.17V4.5z" fill="#fff" />
      <path d="M16.5 21.97v5.52l7.1-9.82-7.1 4.3z" fill="#fff" fillOpacity=".6" />
      <path d="M16.5 27.49v-5.52l-7.1-1.3 7.1 6.82z" fill="#fff" />
      <path d="m16.5 20.57 7.1-4.5-7.1-3.16v7.66z" fill="#fff" fillOpacity=".2" />
      <path d="m9.4 16.07 7.1 4.5v-7.66l-7.1 3.16z" fill="#fff" fillOpacity=".6" />
    </svg>
  )
}

function BaseMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <path
        d="M15.9 8.2c-4.3 0-7.8 3.5-7.9 7.8h9.7c.2 0 .3.1.3.3v.1c0 4.3-3.5 7.8-7.8 7.8h-.1C6.5 24 4 20.3 4 16S7.5 8 12 8h3.9v.2zm.3 0c4.2.1 7.6 3.5 7.7 7.7h-7.7V8.2z"
        fill="#fff"
      />
    </svg>
  )
}

function ArbitrumMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#213147" />
      <path
        d="M10.2 20.8 16 7.8l5.8 13-2.1.9-3.7-8.4-3.7 8.4-2.1-.9z"
        fill="#28A0F0"
      />
      <path
        d="M8.4 22.4h15.2l-1.6 2.4H10l-1.6-2.4z"
        fill="#9DCCED"
      />
      <path d="m16 11.2 2.6 5.9H13.4L16 11.2z" fill="#fff" />
    </svg>
  )
}

function RobinhoodMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#00C805" />
      <path
        d="M10 18.5c2.2-4.8 5-7.8 8.8-9.2.4 3.4-.4 6.5-2.2 9.4-1.5 2.4-3.6 4.1-6.2 5.1-.2-1.9-.4-3.6-.4-5.3z"
        fill="#fff"
      />
      <path
        d="M18.2 9.8c1.8 1.1 3.2 2.8 4 5 .6 1.7.8 3.5.6 5.3-2.4-.8-4.3-2.3-5.7-4.4-1.2-1.8-1.8-3.8-1.7-5.9 1 .0 1.9.0 2.8 0z"
        fill="#fff"
        fillOpacity=".85"
      />
    </svg>
  )
}

function FallbackMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="currentColor" opacity=".2" />
      <circle cx="16" cy="16" r="5" fill="currentColor" opacity=".55" />
    </svg>
  )
}
