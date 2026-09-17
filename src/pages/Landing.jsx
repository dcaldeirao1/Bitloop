import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'

const FEATURES = [
  {
    icon: '◆',
    title: 'Visual IF → THEN builder',
    body: 'Assemble rules from blocks — no Solidity, no scripts. Every automation reads like a sentence you can share.',
  },
  {
    icon: '◇',
    title: 'Your vault, your keys',
    body: 'Deploy a smart-account vault you own on Sepolia. MetaMask signs setup; funds never pass through our servers.',
  },
  {
    icon: '○',
    title: 'Runs while you sleep',
    body: 'Incoming USDC splits and scheduled payouts execute on-chain via a keeper — even when the browser tab is closed.',
  },
  {
    icon: '▣',
    title: 'One unified vault',
    body: 'A single smart-account balance for deposits, withdrawals, and automation activity — no buckets to manage.',
  },
  {
    icon: '◎',
    title: 'Split or schedule',
    body: 'Send 20% of every deposit to another wallet, or pay a fixed USDC amount every hour, day, or week.',
  },
  {
    icon: '◈',
    title: 'Per-wallet automations',
    body: 'Rules are saved to Supabase scoped to your connected address — not shared across users or browsers.',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Connect MetaMask',
    body: 'Link your wallet on Sepolia. Session persists across refresh until you disconnect.',
  },
  {
    n: '02',
    title: 'Build a rule',
    body: 'Pick IF (receive USDC or every X time) and THEN (send % or fixed amount). Confirm once on-chain.',
  },
  {
    n: '03',
    title: 'Fund your vault',
    body: 'Deposit USDC to your vault. The keeper processes splits automatically; history shows every move.',
  },
]

const FAQS = [
  {
    q: 'Do I need to write smart contract code?',
    a: 'No. You deploy a vault through the app and configure rules with blocks. The contract logic is already written — you just set percentages, amounts, and addresses.',
  },
  {
    q: 'Does automation work when I close the browser?',
    a: 'Yes, for vault rules on Sepolia. A keeper watches your vault and calls processToken or executeRecurring when conditions are met. Deposits from the app also trigger splits immediately.',
  },
  {
    q: 'Who pays gas for automated transactions?',
    a: 'The keeper wallet pays gas for split and scheduled sends. You pay gas when you deploy the vault, configure rules, deposit, or withdraw.',
  },
  {
    q: 'Which network is supported today?',
    a: 'Sepolia testnet with USDC. The app shows your active MetaMask network in the header. Mainnet support is planned.',
  },
  {
    q: 'Where are my automations stored?',
    a: 'On Supabase, keyed to your wallet address. Only automations for the connected wallet are loaded. On-chain configuration lives in your vault contract.',
  },
  {
    q: 'Is this custodial?',
    a: 'No. You own the vault contract. We never hold your keys or move funds without a transaction you approved or a rule you configured.',
  },
]

export function Landing() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <SiteNav />
      <Hero />
      <TrustBar />
      <Features />
      <ProductPreview />
      <HowItWorks />
      <Pricing />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </div>
  )
}

function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-soft text-[13px] font-bold text-teal">
            PM
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Programmable Money
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-[13px] font-medium text-muted md:flex">
          <a href="#features" className="transition hover:text-ink">
            Features
          </a>
          <a href="#product" className="transition hover:text-ink">
            Product
          </a>
          <a href="#how" className="transition hover:text-ink">
            How it works
          </a>
          <a href="#pricing" className="transition hover:text-ink">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/app" className="btn-primary hidden px-4 py-2 text-[13px] sm:inline-flex">
            Open app
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="landing-mesh relative overflow-hidden">
      <div className="landing-grid-bg pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pb-24 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="animate-in inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] font-medium text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" />
            Non-custodial vault automations on Sepolia
          </p>
          <h1 className="animate-in mt-6 text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.25rem] lg:leading-[1.06]">
            Set rules for your crypto.
            <br />
            <span className="text-teal">Let the vault execute.</span>
          </h1>
          <p className="animate-in-late mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-muted sm:text-[17px]">
            Build IF–THEN automations in plain language — split incoming USDC,
            schedule recurring payouts, and manage everything from one vault you
            own.
          </p>
          <div className="animate-in-late mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/app" className="btn-primary px-6 py-3 text-[15px]">
              Start building
            </Link>
            <a href="#how" className="btn-outline px-6 py-3 text-[15px]">
              See how it works
            </a>
          </div>
          <p className="animate-in-late mt-4 text-[12px] text-muted">
            Free on Sepolia · MetaMask required · No custody
          </p>
        </div>

        <div className="animate-in-late mx-auto mt-14 max-w-4xl">
          <HeroDashboard />
        </div>
      </div>
    </section>
  )
}

function HeroDashboard() {
  return (
    <div className="landing-glow overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-bg/80 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-mango/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-teal/60" />
        <span className="ml-3 font-mono text-[11px] text-muted">
          programmable.money / vault
        </span>
      </div>
      <div className="grid gap-0 lg:grid-cols-5">
        <div className="border-b border-line p-5 lg:col-span-2 lg:border-b-0 lg:border-r">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Active rule
          </p>
          <div className="mt-4 space-y-2">
            <div className="block-if rounded-xl px-3.5 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-teal">
                IF
              </span>
              <p className="mt-0.5 text-[13px] font-medium text-ink">
                Vault receives USDC
              </p>
            </div>
            <div className="block-then rounded-xl px-3.5 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-mango">
                THEN
              </span>
              <p className="mt-0.5 text-[13px] font-medium text-ink">
                Send <span className="font-mono text-mango">20%</span> to a wallet
              </p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[12px] text-teal">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
            Keeper active · last split 2m ago
          </p>
        </div>
        <div className="p-5 lg:col-span-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'USDC', value: '1,020.00' },
              { label: 'ETH', value: '0.42' },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-ink bg-bg p-3"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  {s.label}
                </p>
                <p className="mt-1 font-mono text-[15px] font-medium text-ink">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-line bg-bg p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              Recent activity
            </p>
            <ul className="mt-2 space-y-2">
              {[
                { type: 'Deposit', amt: '+100', sub: 'To vault', color: 'text-teal' },
                { type: 'Split', amt: '−20', sub: 'To destination', color: 'text-mango' },
              ].map((row) => (
                <li
                  key={row.type}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span className="text-ink-soft">{row.type}</span>
                  <span className={`font-mono font-medium ${row.color}`}>
                    {row.amt} USDC
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrustBar() {
  const items = [
    'MetaMask-native',
    'Sepolia USDC vaults',
    'On-chain rules',
    'Offline keeper',
    'Open-source contracts',
  ]
  return (
    <section className="border-y border-line bg-surface/50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-5">
        {items.map((item) => (
          <span
            key={item}
            className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">
            Features
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Everything you need to automate stablecoin flows
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">
            From first deposit to recurring payouts — one product, one vault,
            rules you can actually read.
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="landing-card-hover rounded-2xl border border-line bg-surface p-6"
            >
              <span className="text-lg text-teal">{f.icon}</span>
              <h3 className="mt-4 text-[16px] font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductPreview() {
  return (
    <section id="product" className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">
              Vault
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              One address. Full history.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">
              Your vault is a smart contract you deploy and own. Deposit and
              withdraw USDC or ETH, then let automations run against that single
              balance.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                'Deposit and withdraw with simple modal flows',
                'One balance for USDC and ETH',
                'On-chain activity: deposits, splits, scheduled sends',
              ].map((item) => (
                <li key={item} className="flex gap-3 text-[14px] text-ink-soft">
                  <span className="mt-0.5 text-teal">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/app/vault" className="btn-outline mt-8 inline-flex">
              Open vault
            </Link>
          </div>
          <div className="rounded-2xl border border-line bg-bg p-6 landing-glow">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Total in vault
            </p>
            <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-ink">
              1,020.00
              <span className="ml-2 text-base font-normal text-muted">USDC</span>
            </p>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full w-full bg-teal" title="Vault" />
            </div>
            <div className="mt-3 flex justify-between text-[11px] text-muted">
              <span>USDC in vault</span>
              <span>Ready for automations</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" className="btn-primary w-full py-2.5 text-[13px]">
                Deposit
              </button>
              <button type="button" className="btn-outline w-full py-2.5 text-[13px]">
                Withdraw
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Live in three steps
          </h2>
        </div>
        <ol className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="relative rounded-2xl border border-line bg-surface p-7 landing-card-hover"
            >
              <span className="font-mono text-[13px] font-medium text-teal">{step.n}</span>
              <h3 className="mt-4 text-[17px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <AutomationPill label="Receive USDC → send 20%" />
          <AutomationPill label="Every 1 day → send 50 USDC" />
        </div>
      </div>
    </section>
  )
}

function AutomationPill({ label }) {
  return (
    <span className="rounded-full border border-line bg-surface px-4 py-2 font-mono text-[12px] text-ink-soft">
      {label}
    </span>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="border-b border-line bg-surface/50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">
            Pricing
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Start free on testnet
          </h2>
          <p className="mt-4 text-[16px] text-muted">
            Build and run automations on Sepolia at no cost. Pro adds scale when
            you go to mainnet.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-line bg-surface p-8">
            <h3 className="text-[16px] font-semibold text-ink">Free</h3>
            <p className="mt-1 text-[13px] text-muted">Sepolia testnet</p>
            <p className="mt-6 text-4xl font-semibold tracking-tight text-ink">
              $0
            </p>
            <ul className="mt-8 space-y-3 text-[14px] text-ink-soft">
              <li className="flex gap-2">
                <span className="text-teal">✓</span> Unlimited automations
              </li>
              <li className="flex gap-2">
                <span className="text-teal">✓</span> USDC split & scheduled sends
              </li>
              <li className="flex gap-2">
                <span className="text-teal">✓</span> Vault + activity history
              </li>
              <li className="flex gap-2">
                <span className="text-teal">✓</span> Keeper execution
              </li>
            </ul>
            <Link to="/app" className="btn-primary mt-8 w-full">
              Get started
            </Link>
          </article>

          <article className="relative overflow-hidden rounded-2xl border border-teal/30 bg-teal-soft p-8">
            <span className="absolute right-4 top-4 rounded-full bg-teal px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bg">
              Soon
            </span>
            <h3 className="text-[16px] font-semibold text-ink">Pro</h3>
            <p className="mt-1 text-[13px] text-muted">Mainnet & teams</p>
            <p className="mt-6 text-4xl font-semibold tracking-tight text-ink">
              $49
              <span className="text-base font-medium text-muted"> / mo</span>
            </p>
            <ul className="mt-8 space-y-3 text-[14px] text-ink-soft">
              <li className="flex gap-2">
                <span className="text-teal">✓</span> Ethereum & Base mainnet
              </li>
              <li className="flex gap-2">
                <span className="text-teal">✓</span> Priority keeper
              </li>
              <li className="flex gap-2">
                <span className="text-teal">✓</span> Advanced strategy types
              </li>
              <li className="flex gap-2">
                <span className="text-teal">✓</span> Email alerts & API
              </li>
            </ul>
            <button
              type="button"
              disabled
              className="btn-outline mt-8 w-full cursor-not-allowed opacity-60"
            >
              Join waitlist
            </button>
          </article>
        </div>
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">
              FAQ
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
              Common questions
            </h2>
            <p className="mt-4 text-[15px] text-muted">
              Security, networks, and how automation actually runs.
            </p>
          </div>
          <div className="divide-y divide-line lg:col-span-3">
            {FAQS.map((item, i) => {
              const isOpen = open === i
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-4 py-5 text-left"
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    aria-expanded={isOpen}
                  >
                    <span className="text-[15px] font-medium text-ink">{item.q}</span>
                    <span
                      className={`mt-0.5 shrink-0 text-[18px] leading-none text-muted transition ${
                        isOpen ? 'rotate-45' : ''
                      }`}
                    >
                      +
                    </span>
                  </button>
                  {isOpen && (
                    <p className="pb-5 text-[14px] leading-relaxed text-muted">
                      {item.a}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="landing-mesh border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-24">
        <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Ready to program your money?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[16px] text-muted">
          Connect MetaMask, deploy your vault, and ship your first rule in
          minutes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/app/new" className="btn-primary px-6 py-3">
            Create automation
          </Link>
          <Link to="/app" className="btn-outline px-6 py-3">
            View dashboard
          </Link>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 sm:flex-row sm:justify-between">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-soft text-[11px] font-bold text-teal">
              PM
            </span>
            <span className="text-[14px] font-semibold text-ink">
              Programmable Money
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted">
            IF–THEN automations for stablecoin vaults. Non-custodial, on-chain,
            readable.
          </p>
        </div>
        <div className="flex gap-16 text-[13px]">
          <div>
            <p className="font-medium text-ink">Product</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li>
                <Link to="/app" className="hover:text-ink">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/app/vault" className="hover:text-ink">
                  Vault
                </Link>
              </li>
              <li>
                <Link to="/app/new" className="hover:text-ink">
                  New automation
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-ink">Learn</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li>
                <a href="#how" className="hover:text-ink">
                  How it works
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-ink">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-ink">
                  Pricing
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-line px-6 py-5 text-center text-[12px] text-muted">
        © {new Date().getFullYear()} Programmable Money · Built for Sepolia testnet
      </div>
    </footer>
  )
}
