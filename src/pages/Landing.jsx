import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExampleRuleBlocks } from '../components/RuleCanvas'
import { ThemeToggle } from '../components/ThemeToggle'

const FAQS = [
  {
    q: 'Do I need a smart contract?',
    a: 'No. The MVP watches your wallet in the browser and asks MetaMask to approve each send when a rule fires.',
  },
  {
    q: 'Does money move while I’m offline?',
    a: 'Not yet. Rules run while the app tab is open and your wallet is connected. Pro will add always-on cloud runners later.',
  },
  {
    q: 'Which networks work?',
    a: 'Whatever network MetaMask is on — Ethereum, Sepolia, Base, and others. The header shows the active chain.',
  },
  {
    q: 'Is my wallet data stored on a server?',
    a: 'Automations live in your browser’s local storage. Connecting only talks to MetaMask on your machine.',
  },
  {
    q: 'Can I cancel Pro anytime?',
    a: 'Yes. Pro is billed monthly and you can stop whenever you like. Free stays available forever for basic use.',
  },
]

export function Landing() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <SiteNav />
      <Hero />
      <ProductStory />
      <HowItWorks />
      <Pricing />
      <Faq />
      <SiteFooter />
    </div>
  )
}

function SiteNav() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
      <Link to="/" className="text-[15px] font-semibold tracking-tight text-ink">
        Programmable Money
      </Link>
      <nav className="hidden items-center gap-7 text-[13px] font-medium text-muted md:flex">
        <a href="#product" className="transition hover:text-ink">
          Product
        </a>
        <a href="#how" className="transition hover:text-ink">
          How it works
        </a>
        <a href="#pricing" className="transition hover:text-ink">
          Pricing
        </a>
        <a href="#faq" className="transition hover:text-ink">
          FAQ
        </a>
      </nav>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link to="/app" className="btn-primary px-4 py-2 text-[13px]">
          Open app
        </Link>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-20 pt-14 sm:pb-28 sm:pt-20">
      <div className="animate-in mx-auto max-w-2xl text-center">
        <p className="text-[15px] font-semibold tracking-tight text-ink sm:text-base">
          Programmable Money
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl sm:leading-[1.08]">
          Build simple IF–THEN rules for your crypto.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-muted sm:text-base">
          Connect MetaMask, click blocks, and route funds the moment they land —
          like sending 20% of every deposit to savings.
        </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Link to="/app" className="btn-primary">
            Start free
          </Link>
          <a href="#pricing" className="btn-ghost">
            See pricing
          </a>
        </div>
      </div>

      <div className="animate-in-late mx-auto mt-14 max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <ExampleRuleBlocks />
      </div>
    </section>
  )
}

function ProductStory() {
  return (
    <section id="product" className="border-t border-line">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Money that follows your rules.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted sm:text-base">
            Turn wallet activity into clear sentences you can edit. No scripts.
            No noisy dashboards. Just blocks you understand at a glance.
          </p>
        </div>

        <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-3">
          {[
            {
              title: 'Click, don’t code',
              body: 'Tap an IF block, tap a THEN block, set a percent and address. Done.',
            },
            {
              title: 'Readable rules',
              body: 'Every automation reads like English — easy to share and revisit.',
            },
            {
              title: 'Wallet-native',
              body: 'MetaMask stays in control. Approvals happen in your wallet when a rule fires.',
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="text-[15px] font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          How it works
        </h2>
        <p className="mt-3 max-w-md text-[15px] text-muted">
          Three steps from wallet to working rule.
        </p>

        <ol className="mt-12 grid gap-8 sm:grid-cols-3">
          {[
            {
              n: '01',
              title: 'Connect MetaMask',
              body: 'One click. We only use the address MetaMask shares.',
            },
            {
              n: '02',
              title: 'Assemble IF → THEN',
              body: 'Pick receive funds, then send a percent to savings.',
            },
            {
              n: '03',
              title: 'Watch it run',
              body: 'Keep the tab open. Incoming ETH triggers a MetaMask send prompt.',
            },
          ].map((step) => (
            <li key={step.n}>
              <p className="font-mono text-xs text-muted">{step.n}</p>
              <h3 className="mt-3 text-[15px] font-semibold text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="border-t border-line">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Pricing
          </h2>
          <p className="mt-3 text-[15px] text-muted">
            Start free. Upgrade when you need more.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-line bg-surface p-7">
            <h3 className="text-[15px] font-semibold text-ink">Free</h3>
            <p className="mt-1 text-[13px] text-muted">For trying the builder</p>
            <p className="mt-6 text-3xl font-semibold tracking-tight text-ink">
              $0
              <span className="text-sm font-medium text-muted"> / forever</span>
            </p>
            <ul className="mt-6 space-y-2.5 text-[14px] text-ink-soft">
              <li>1 live automation</li>
              <li>IF receives ETH → THEN send %</li>
              <li>Browser-based watcher</li>
            </ul>
            <Link to="/app" className="btn-outline mt-8 w-full">
              Use Free
            </Link>
          </article>

          <article className="rounded-2xl bg-[#10241f] p-7 text-[#eef5f2]">
            <h3 className="text-[15px] font-semibold">Pro</h3>
            <p className="mt-1 text-[13px] text-[#eef5f2]/55">For frequent automation</p>
            <p className="mt-6 text-3xl font-semibold tracking-tight">
              $49.99
              <span className="text-sm font-medium text-[#eef5f2]/55"> / month</span>
            </p>
            <ul className="mt-6 space-y-2.5 text-[14px] text-[#eef5f2]/75">
              <li>Unlimited automations</li>
              <li>Priority rule execution</li>
              <li>Cloud runner (coming soon)</li>
              <li>Early access to new blocks</li>
            </ul>
            <Link
              to="/app"
              className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-surface px-5 py-2.5 text-[15px] font-medium text-ink transition hover:opacity-90"
            >
              Get Pro
            </Link>
          </article>
        </div>
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          FAQ
        </h2>

        <div className="mt-10 max-w-2xl divide-y divide-line">
          {FAQS.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={item.q}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-6 py-5 text-left"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                >
                  <span className="text-[15px] font-medium text-ink">
                    {item.q}
                  </span>
                  <span className="text-muted">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <p className="pb-5 pr-10 text-[14px] leading-relaxed text-muted">
                    {item.a}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-ink">
            Programmable Money
          </p>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted">
            Simple blocks for crypto that should already know what to do next.
          </p>
        </div>
        <div className="flex gap-16 text-[13px]">
          <div>
            <p className="font-medium text-ink">Product</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li>
                <a href="#product" className="hover:text-ink">
                  Overview
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-ink">
                  Pricing
                </a>
              </li>
              <li>
                <Link to="/app" className="hover:text-ink">
                  Open app
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-ink">Trust</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li>Browser-local rules</li>
              <li>MetaMask approvals</li>
              <li>No custody</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-line px-6 py-4 text-center text-[12px] text-muted">
        © {new Date().getFullYear()} Programmable Money
      </div>
    </footer>
  )
}
