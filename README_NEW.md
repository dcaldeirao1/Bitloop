# ProgrammableMoney

**Automation rules for your money, enforced on chain.**

ProgrammableMoney lets anyone build "if this, then that" rules for their crypto, with no code. Examples: *when I receive USDC, move 20% to savings*, *send 50 USDC to my sister every month*, or *buy ETH with 10 USDC every week*. Each rule runs from your own non-custodial smart account vault and keeps working when the app is closed.

> Demo video: _add link_  ·  Live app: _add link_  ·  Network: Ethereum Sepolia

## The problem

Programmable money is supposed to be crypto's superpower, but normal users still move funds by hand. ERC-20 transfers don't notify the receiving contract, so "do something when money arrives" doesn't happen on its own. Saving, recurring payments and DCA all depend on a person remembering to do them.

## How it works

1. **Connect** with MetaMask. The `AccountFactory` deploys a personal `SmartAccount` vault that you own.
2. **Build a rule** in the visual builder by dragging a trigger block and an action block (for example, *receives USDC* then *send 20% to savings*), then hit **Save & deploy**. The rule config is written to your vault on chain.
3. **The keeper** watches vaults and calls the public trigger functions (`processToken`, `executeRecurring`, `executeDca`). It only pays gas. It can never move funds anywhere except where the owner's rules say.
4. **Dashboard** shows your vault, active automations, next and last runs, and the activity history.

### Supported automations
| Rule | Contract function | What it does |
|---|---|---|
| Auto-save split | `setSplit` / `processToken` | Sends a set % of incoming tokens to a savings address |
| Recurring payment | `setRecurring` / `executeRecurring` | Pays a fixed amount on a schedule |
| DCA | `setDca` / `executeDca` | Swaps a fixed amount into another asset on a schedule |
| Owner controls | `withdraw`, `withdrawToken`, `execute`, `transferOwnership` | You keep full control of the vault |

Also included: a trading sandbox and strategy screener for testing rules before using real funds.

## Why it's safe
- **Non-custodial.** Only the owner can configure rules or withdraw. The keeper can only trigger rules the owner already set.
- **Works with the app closed.** Rules live on chain, not in a browser tab.
- **Transparent.** Every action emits an event (`TokenSplit`, `RecurringExecuted`, `DcaExecuted`).

## Deployed contracts (Sepolia)
| Contract | Address |
|---|---|
| AccountFactory | `0x6bc6A9c85ebF24B7270Cd0E3553e2295b58261a6` |
| DCA router | `0x77e3b91266097ce9f2a4a6EDF101433CFcFD4a5d` |
| Test USDC | `0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212` |

## Tech stack
Solidity + Hardhat · React 19 + Vite + Tailwind · ethers v6 · Node.js keeper and relayer · Supabase for rule metadata and history

## Run it locally
```bash
npm install
cp .env.example .env   # fill in RPC URL, keeper PRIVATE_KEY, factory address
npm run contracts:test
npm run keeper          # in one terminal
npm run dev             # in another
```
Quick test: connect MetaMask on Sepolia, create *IF receives USDC THEN send 20% to savings*, send test USDC to your vault address, and within about 15 seconds the keeper splits it.

## What's next
- Mainnet and L2 deployment, plus more chains
- More triggers (price levels, balance thresholds, dates) and actions
- A decentralised keeper network, so there's no single operator
- Shareable rule templates

## Team
_add names and links_
