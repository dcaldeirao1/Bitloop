# bitloop

**Rules that run your money — Trigger → Action → Test → Deploy.**

bitloop lets anyone build IF–THEN rules for crypto with no Solidity. Split deposits, schedule payouts, DCA from a non-custodial Sepolia vault, paper-test spot strategies, and backtest then deploy perps on Hyperliquid testnet. Vault rules keep working when the app is closed.

> Demo video: _add link_ · Live app: _add link_ · Chains: Ethereum Sepolia + Hyperliquid testnet

## The problem

Programmable money is supposed to be crypto’s superpower, but people still move funds by hand. ERC-20 transfers don’t notify the receiving contract, so “do something when money arrives” doesn’t happen on its own. Saving, recurring payments, and DCA still depend on remembering to click.

## How it works

1. **Connect** MetaMask on Sepolia. An `AccountFactory` deploys a personal `SmartAccount` vault that you own.
2. **Build a rule** — pick a category (My Automations / Spot / Perps), set a trigger and action, then **Test** before deploy.
3. **Keeper** watches vaults and calls public executors (`processToken`, `executeRecurring`, `executeDca`). It only pays gas and can only move funds where your on-chain rules allow.
4. **Dashboard** shows vault balances, all rules with status, and confirmed activity (Etherscan when a tx hash exists).

### Product surfaces

| Surface | Environment | What it does |
|---|---|---|
| My Automations | On-chain (Sepolia) | Splits, schedules, DCA from your vault |
| Spot strategies | Paper | Screen tokens, paper-trade, live paper scan |
| Perps strategies | Hyperliquid testnet | Backtest MA/RSI signals, then deploy a testnet order |

### On-chain automations

| Rule | Contract | What it does |
|---|---|---|
| Auto-save split | `setSplit` / `processToken` | Sends a % of incoming tokens to savings |
| Recurring payment | `setRecurring` / `executeRecurring` | Pays a fixed amount on a schedule |
| DCA | `setDca` / `executeDca` | Swaps a fixed amount on a schedule |
| Owner controls | `withdraw`, `withdrawToken`, `execute` | You keep full control |

## Why it’s safe

- **Non-custodial.** Only the owner configures rules or withdraws. The keeper can only trigger rules you already set.
- **Works with the app closed.** Vault rules live on chain (requires the keeper process for execution).
- **Transparent.** Events: `TokenSplit`, `RecurringExecuted`, `DcaExecuted`.
- **Honest labels.** Spot = paper. Perps = Hyperliquid **testnet**. Sepolia vault = testnet USDC/ETH.

## Deployed contracts (Sepolia)

| Contract | Address | Explorer |
|---|---|---|
| AccountFactory | `0x6bc6A9c85ebF24B7270Cd0E3553e2295b58261a6` | [Etherscan](https://sepolia.etherscan.io/address/0x6bc6A9c85ebF24B7270Cd0E3553e2295b58261a6) |
| DCA router | `0x77e3b91266097ce9f2a4a6EDF101433CFcFD4a5d` | [Etherscan](https://sepolia.etherscan.io/address/0x77e3b91266097ce9f2a4a6EDF101433CFcFD4a5d) |
| Test USDC | `0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212` | [Etherscan](https://sepolia.etherscan.io/address/0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212) |

## Tech stack

Solidity + Hardhat · React 19 + Vite + Tailwind · ethers v6 · Node.js keeper · Supabase (rule metadata) · Hyperliquid SDK (perps testnet)

## Run locally

```bash
npm install
cp .env.example .env   # fill RPC, factory, Supabase, keeper PRIVATE_KEY
npm run contracts:test
npm run keeper          # terminal 1 — required for vault splits / schedules / DCA
npm run dev             # terminal 2
```

Quick test: MetaMask on Sepolia → create *IF receives USDC THEN send 20% to savings* → send test USDC to your vault → within ~15s the keeper splits it (check Activity + Etherscan).

**Note:** Vault “works offline” means the **keeper process** is running somewhere. Without `npm run keeper` (or a hosted keeper), on-chain rules will not execute after you close the browser.

## What’s next

- Mainnet and L2 vaults
- More triggers and actions
- Decentralised keeper network
- Shareable rule templates

## Team

_add names and links_

## Colosseum / World’s Fair

Built for [Crypto World’s Fair](https://colosseum.com/worldsfair). Chains: **Ethereum Sepolia** + **Hyperliquid testnet** (not Solana).
