import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { Reveal } from '../components/landing/Reveal'
import {
  DemoActivity,
  DemoBuilder,
  DemoVault,
} from '../components/landing/ProductDemos'
import { ThemeToggle } from '../components/ThemeToggle'

const STEPS = [
  {
    n: '01',
    title: 'Connect MetaMask',
    body: 'Link your wallet on Sepolia. Session persists until you disconnect.',
  },
  {
    n: '02',
    title: 'Compose a rule',
    body: 'IF → THEN blocks for splits, schedules, or DCA. Confirm once on-chain.',
  },
  {
    n: '03',
    title: 'Fund & forget',
    body: 'Deposit to your vault. The keeper executes while the app stays closed.',
  },
]

const FAQS = [
  {
    q: 'Do I need to write smart contract code?',
    a: 'No. You deploy a vault through the app and configure rules with blocks. The contract logic is already written — you set percentages, amounts, and addresses.',
  },
  {
    q: 'Does automation work when I close the browser?',
    a: 'Yes, for vault rules on Sepolia. A keeper watches your vault and calls processToken, executeRecurring, or executeDca when conditions are met.',
  },
  {
    q: 'Who pays gas for automated transactions?',
    a: 'The keeper wallet pays gas for splits, scheduled sends, and DCA. You pay gas when you deploy the vault, configure rules, deposit, or withdraw.',
  },
  {
    q: 'Which network is supported today?',
    a: 'Sepolia testnet with USDC. The app shows your active MetaMask network. Mainnet support is planned.',
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

const PROOF = [
  'Non-custodial vaults',
  'MetaMask-native',
  'On-chain rules',
  'Keeper offline execution',
  'Sepolia USDC',
  'Confirmed history',
]

export function Landing() {
  return (
    <div className="landing-page min-h-screen bg-bg text-ink">
      <SiteNav />
      <Hero />
      <ProofMarquee />
      <FeatureStory />
      <HowItWorks />
      <FreePanel />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </div>
  )
}

function SiteNav() {
  return (
    <header className="landing-nav">
      <div className="landing-nav-inner">
        <BrandLogo to="/" size="nav" />
        <nav className="landing-nav-links">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#access">Access</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/app" className="landing-btn-primary landing-btn-sm">
            Open app
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-orbs" aria-hidden="true">
        <span className="landing-orb is-a" />
        <span className="landing-orb is-b" />
        <span className="landing-orb is-c" />
      </div>
      <div className="landing-grid-bg landing-hero-grid" aria-hidden="true" />
      <div className="landing-hero-noise" aria-hidden="true" />

      <div className="landing-hero-inner">
        <div className="landing-hero-copy">
          <p className="landing-hero-kicker animate-in">
            <span className="landing-hero-kicker-dot" />
            Live on Sepolia · Non-custodial
          </p>
          <h1 className="landing-hero-headline animate-in">
            Set rules for your crypto.
            <span className="landing-hero-accent"> Let the vault execute.</span>
          </h1>
          <p className="landing-hero-sub animate-in-late">
            IF–THEN automations for a vault you own — split deposits, schedule
            payouts, and DCA. Keys stay in MetaMask. Keeper runs while you are
            offline.
          </p>
          <div className="landing-hero-actions animate-in-late">
            <Link to="/app" className="landing-btn-primary">
              Open app
            </Link>
            <a href="#product" className="landing-btn-ghost">
              See the product
            </a>
          </div>
          <ul className="landing-hero-trust animate-in-late">
            <li>Non-custodial vault</li>
            <li>On-chain rules</li>
            <li>Confirmed history</li>
          </ul>
        </div>

        <div className="landing-hero-stage animate-in-late">
          <div className="landing-hero-stage-glow" aria-hidden="true" />
          <DemoVault />
        </div>
      </div>
    </section>
  )
}

function ProofMarquee() {
  const loop = [...PROOF, ...PROOF]
  return (
    <section className="landing-marquee" aria-label="Product highlights">
      <div className="landing-marquee-track">
        {loop.map((item, i) => (
          <span key={`${item}-${i}`} className="landing-marquee-item">
            <span className="landing-marquee-dot" />
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}

function FeatureStory() {
  return (
    <section id="product" className="landing-section">
      <div className="landing-section-inner">
        <article className="landing-feature">
          <Reveal className="landing-feature-copy">
            <p className="landing-eyebrow">Automations</p>
            <h2 className="landing-section-title">
              Build rules that read like sentences
            </h2>
            <p className="landing-section-body">
              Compose IF–THEN blocks for splits, scheduled transfers, and DCA.
              Start from templates, preview before deploy, and keep every rule
              scoped to your wallet.
            </p>
            <ul className="landing-checklist">
              <li>Visual builder — no Solidity required</li>
              <li>Templates for income splits, schedules, and DCA</li>
              <li>Preview before MetaMask confirms on-chain setup</li>
            </ul>
            <Link to="/app/new" className="landing-btn-primary mt-8 inline-flex">
              Create automation
            </Link>
          </Reveal>
          <Reveal className="landing-feature-visual" delay={60} threshold={0.05}>
            <DemoBuilder />
          </Reveal>
        </article>

        <article className="landing-feature is-reverse">
          <Reveal className="landing-feature-copy">
            <p className="landing-eyebrow">Vault</p>
            <h2 className="landing-section-title">
              One address you own. Full history.
            </h2>
            <p className="landing-section-body">
              Deploy a smart-account vault on Sepolia. Deposit and withdraw with
              MetaMask. Automations run against that single balance — confirmed
              activity links out to the explorer.
            </p>
            <ul className="landing-checklist">
              <li>Non-custodial — keys stay in MetaMask</li>
              <li>USDC and ETH in one vault</li>
              <li>Deposits, splits, schedules, and DCA in activity</li>
            </ul>
            <Link to="/app/vault" className="landing-btn-ghost mt-8 inline-flex">
              Open vault
            </Link>
          </Reveal>
          <Reveal className="landing-feature-visual" delay={60} threshold={0.05}>
            <DemoActivity />
          </Reveal>
        </article>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how" className="landing-section landing-section-alt">
      <div className="landing-section-inner">
        <Reveal className="landing-section-head">
          <p className="landing-eyebrow">How it works</p>
          <h2 className="landing-section-title">Live in three steps</h2>
          <p className="landing-section-body mx-auto mt-3 max-w-xl">
            From wallet connect to keeper execution — the shortest path to a real
            on-chain rule.
          </p>
        </Reveal>

        <ol className="landing-steps">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} as="li" delay={i * 100} className="landing-step-card">
              <span className="landing-step-n">{step.n}</span>
              <h3 className="landing-step-title">{step.title}</h3>
              <p className="landing-step-body">{step.body}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={280}>
          <div className="landing-rule-row">
            <span className="landing-rule-chip">Receive USDC → send 20%</span>
            <span className="landing-rule-chip">Every day → send USDC</span>
            <span className="landing-rule-chip">Every hour → buy ETH</span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function FreePanel() {
  return (
    <section id="access" className="landing-section">
      <div className="landing-section-inner">
        <Reveal className="landing-access">
          <div className="landing-access-copy">
            <p className="landing-eyebrow">Access</p>
            <h2 className="landing-section-title">Free on Sepolia testnet</h2>
            <p className="landing-section-body mt-3">
              Build and run vault automations at no product cost. You only need
              Sepolia ETH for gas and test USDC to fund your vault.
            </p>
            <Link to="/app" className="landing-btn-primary mt-8 inline-flex">
              Get started
            </Link>
            <p className="mt-4 text-[12px] text-muted">Mainnet coming later.</p>
          </div>
          <ul className="landing-access-list">
            <li>Unlimited automations on your vault</li>
            <li>USDC splits, schedules, and DCA</li>
            <li>Keeper execution while you are offline</li>
            <li>Confirmed on-chain activity history</li>
          </ul>
        </Reveal>
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" className="landing-section landing-section-alt">
      <div className="landing-section-inner">
        <div className="landing-faq">
          <Reveal className="landing-faq-intro">
            <p className="landing-eyebrow">FAQ</p>
            <h2 className="landing-section-title mt-3">Common questions</h2>
            <p className="landing-section-body mt-3">
              Security, networks, and how automation actually runs.
            </p>
          </Reveal>
          <Reveal className="landing-faq-list" delay={80}>
            {FAQS.map((item, i) => {
              const isOpen = open === i
              return (
                <div key={item.q} className={`landing-faq-item ${isOpen ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="landing-faq-q"
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    aria-expanded={isOpen}
                  >
                    <span>{item.q}</span>
                    <span className="landing-faq-icon" aria-hidden="true">
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                  {isOpen ? <p className="landing-faq-a">{item.a}</p> : null}
                </div>
              )
            })}
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="landing-final">
      <div className="landing-final-glow" aria-hidden="true" />
      <Reveal className="landing-final-inner">
        <h2 className="landing-final-title">Ready to program your money?</h2>
        <p className="landing-final-sub">
          Connect MetaMask, deploy your vault, and ship your first rule in
          minutes.
        </p>
        <div className="landing-hero-actions justify-center">
          <Link to="/app/new" className="landing-btn-primary">
            Create automation
          </Link>
          <Link to="/app" className="landing-btn-ghost">
            View dashboard
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div>
          <BrandLogo to="/" size="footer" />
          <p className="landing-footer-blurb">
            IF–THEN automations for stablecoin vaults. Non-custodial, on-chain,
            readable.
          </p>
        </div>
        <div className="landing-footer-cols">
          <div>
            <p className="landing-footer-label">Product</p>
            <ul>
              <li>
                <Link to="/app">Dashboard</Link>
              </li>
              <li>
                <Link to="/app/vault">Vault</Link>
              </li>
              <li>
                <Link to="/app/new">New automation</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="landing-footer-label">Learn</p>
            <ul>
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <a href="#faq">FAQ</a>
              </li>
              <li>
                <a href="#access">Access</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="landing-footer-bottom">
        © {new Date().getFullYear()} bitloop · Built for Sepolia testnet
      </div>
    </footer>
  )
}
