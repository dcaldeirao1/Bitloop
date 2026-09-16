# Setup (Sepolia USDC automation)

## Contracts
Factory (latest): see `.env` → `VITE_ACCOUNT_FACTORY_ADDRESS`  
USDC: `0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212`

```bash
npm install
npm run contracts:test
npm run contracts:deploy:sepolia
```

Copy the printed factory address into `.env` as both `FACTORY_ADDRESS` and `VITE_ACCOUNT_FACTORY_ADDRESS`.

## Run
```bash
npm run keeper
npm run dev
```

Keeper wallet (`PRIVATE_KEY`) only needs a little Sepolia ETH for gas to call `processToken` — it never holds user funds.

## Test flow
1. MetaMask on **Sepolia** → Open app → Connect
2. **New automation** → IF receives USDC → THEN send 20% to savings → **Save & deploy**
3. Copy your **vault address** from the dashboard
4. Send test USDC to that vault
5. Within ~15s the keeper splits 20% to savings (works with the app closed)

## Why a vault + keeper?
Standard ERC-20 transfers don’t notify contracts. The vault holds USDC; the keeper only triggers `processToken`. You remain the vault owner (non-custodial).
