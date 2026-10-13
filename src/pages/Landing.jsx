import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { Reveal } from '../components/landing/Reveal'
import {
  DemoActivity,
  DemoBuilder,
  DemoMoneyOs,
  DemoSpot,
} from '../components/landing/ProductDemos'
import { ThemeToggle } from '../components/ThemeToggle'

const STEPS = [
  {
    n: '01',
    title: 'Trigger',
    body: 'Choose when the rule fires — deposit, schedule, token filter, or signal.',
  },
  {
    n: '02',
    title: 'Action',
    body: 'Define what happens — split, send, DCA, paper buy, or a perps order.',
  },
  {
    n: '03',
    title: 'Test',
    body: 'Preview vault rules, paper-trade spot, or backtest perps before you deploy.',
  },
  {
    n: '04',
    title: 'Deploy',
    body: 'Ship on-chain across supported networks, run a paper scan, or place a perps order.',
  },
]

const FAQS = [
  {
    q: 'Do I need to write smart contract code?',
    a: 'No. You deploy a vault through the app and configure rules with blocks. The contract logic is already written — you set percentages, amounts, and addresses.',
  },
  {
    q: 'Does automation work when I close the browser?',
    a: 'Yes, for vault rules — while the keeper process is running. It watches your vault and calls processToken, executeRecurring, or executeDca when conditions are met.',
  },
  {
    q: 'Who pays gas for automated transactions?',
    a: 'The keeper wallet pays gas for splits, scheduled sends, and DCA. You pay gas when you deploy the vault, configure rules, deposit, or withdraw.',
  },
  {
    q: 'Which networks are supported?',
    a: 'Ethereum, Arbitrum, Base, and Robinhood Chain — switch networks in the app header. Spot strategies are paper. Perps deploy on Hyperliquid.',
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

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    blurb: 'Get started',
    price: '$0',
    period: null,
    cta: 'Get started',
    ctaTo: '/app',
    featured: false,
    soon: false,
    features: [
      'Unlimited automations',
      'USDC split & scheduled sends',
      'Vault + activity history',
      'Keeper execution',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'Multi-chain & teams',
    price: '$49',
    period: '/ mo',
    cta: 'Join waitlist',
    ctaTo: null,
    featured: true,
    soon: true,
    features: [
      'Ethereum, Arb, Base & Robinhood',
      'Priority keeper',
      'Advanced strategy types',
      'Email alerts & API',
    ],
  },
]

export function Landing() {
  return (
    <div className="landing-page min-h-screen bg-bg text-ink">
      <SiteNav />
      <Hero />
      <FeatureStory />
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
    <header className="landing-nav">
      <div className="landing-nav-inner">
        <BrandLogo to="/" size="nav" />
        <nav className="landing-nav-links">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
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
    <section className="landing-hero is-clean">
      <div className="landing-hero-wash is-soft" aria-hidden="true" />

      <div className="landing-hero-inner">
        <div className="landing-hero-copy">
          <h1 className="landing-hero-headline animate-in">
            Your money, on autopilot.
          </h1>
          <p className="landing-hero-sub animate-in-late">
            Build rules that save, pay, and trade — then deploy on Ethereum,
            Arbitrum, Base, or Robinhood Chain.
          </p>
          <div className="landing-hero-actions animate-in-late">
            <Link to="/app" className="landing-btn-primary">
              Open app
            </Link>
            <a href="#product" className="landing-btn-ghost">
              See the product
            </a>
          </div>
        </div>

        <div className="landing-hero-stage animate-in-late">
          <DemoMoneyOs />
        </div>
      </div>
    </section>
  )
}

function FeatureStory() {
  return (
    <section id="product" className="landing-section">
      <div className="landing-section-inner">
        <Reveal className="landing-section-head">
          <p className="landing-eyebrow">One product · three rule types</p>
          <h2 className="landing-section-title">Rules that run your money</h2>
          <p className="landing-section-body mx-auto mt-3 max-w-xl">
            Every feature is the same shape: Trigger → Action → Test → Deploy.
          </p>
        </Reveal>

        <article className="landing-feature">
          <Reveal className="landing-feature-copy">
            <p className="landing-eyebrow">My Automations</p>
            <h2 className="landing-section-title">
              Splits, schedules, and DCA from your vault
            </h2>
            <p className="landing-section-body">
              On-chain rules on the network you choose. Preview, then deploy to a
              vault you own. Keeper runs while you are offline.
            </p>
            <Link to="/app/new?type=save-pay" className="landing-btn-primary mt-8 inline-flex">
              New automation
            </Link>
          </Reveal>
          <Reveal className="landing-feature-visual" delay={60} threshold={0.05}>
            <DemoBuilder />
          </Reveal>
        </article>

        <article className="landing-feature is-reverse">
          <Reveal className="landing-feature-copy">
            <p className="landing-eyebrow">Spot strategies</p>
            <h2 className="landing-section-title">
              Screen tokens. Test with paper funds.
            </h2>
            <p className="landing-section-body">
              Trigger when a token matches your filters. Action: buy with TP/SL.
              Paper only — live scan still uses mock funds.
            </p>
            <Link to="/app/new?type=spot" className="landing-btn-primary mt-8 inline-flex">
              New strategy
            </Link>
          </Reveal>
          <Reveal className="landing-feature-visual" delay={60} threshold={0.05}>
            <DemoSpot />
          </Reveal>
        </article>

        <article className="landing-feature">
          <Reveal className="landing-feature-copy">
            <p className="landing-eyebrow">Perps strategies</p>
            <h2 className="landing-section-title">
              Backtest first. Deploy on Hyperliquid.
            </h2>
            <p className="landing-section-body">
              Tune MA / RSI signals on history, then deploy the same parameters on
              Hyperliquid. You confirm every live order.
            </p>
            <Link to="/app/new?type=perps" className="landing-btn-primary mt-8 inline-flex">
              New strategy
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
          <h2 className="landing-section-title">Trigger, Action, Test, Deploy</h2>
          <p className="landing-section-body mx-auto mt-3 max-w-xl">
            One flow for My Automations, Spot, and Perps — with clear environments
            for each.
          </p>
        </Reveal>

        <ol className="landing-steps landing-steps-four">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} as="li" delay={i * 80} className="landing-step-card">
              <span className="landing-step-n">{step.n}</span>
              <h3 className="landing-step-title">{step.title}</h3>
              <p className="landing-step-body">{step.body}</p>
            </Reveal>
          ))}
        </ol>

      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="landing-section">
      <div className="landing-section-inner">
        <Reveal className="landing-section-head">
          <p className="landing-eyebrow">Pricing</p>
          <h2 className="landing-section-title">Start free. Scale when ready.</h2>
          <p className="landing-section-body mx-auto mt-3 max-w-xl">
            Build and run automations at no cost. Pro unlocks multi-chain scale,
            priority keeper, and team features.
          </p>
        </Reveal>

        <div className="landing-pricing-grid">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 80} className={`landing-plan ${plan.featured ? 'is-featured' : ''}`}>
              {plan.soon ? (
                <span className="landing-plan-badge">Soon</span>
              ) : null}
              <h3 className="landing-plan-name">{plan.name}</h3>
              <p className="landing-plan-blurb">{plan.blurb}</p>
              <p className="landing-plan-price">
                {plan.price}
                {plan.period ? (
                  <span className="landing-plan-period">{plan.period}</span>
                ) : null}
              </p>
              <ul className="landing-plan-features">
                {plan.features.map((f) => (
                  <li key={f}>
                    <span aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {plan.ctaTo ? (
                <Link to={plan.ctaTo} className="landing-btn-primary landing-plan-cta">
                  {plan.cta}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="landing-btn-ghost landing-plan-cta is-disabled"
                >
                  {plan.cta}
                </button>
              )}
            </Reveal>
          ))}
        </div>
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
            New rule
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
            Rules that run your money — Ethereum, Arbitrum, Base, and Robinhood
            Chain. Non-custodial and readable.
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
                <Link to="/app/new">New rule</Link>
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
                <a href="#pricing">Pricing</a>
              </li>
              <li>
                <a href="#faq">FAQ</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="landing-footer-bottom">
        © {new Date().getFullYear()} bitloop · ETH · Arb · Base · Robinhood
      </div>
    </footer>
  )
}
