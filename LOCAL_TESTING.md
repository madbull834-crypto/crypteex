# Local dApp Testing

The current local deployment runs on Hardhat chain `31337` at
`http://127.0.0.1:8545`.

## Open the app

Open `http://127.0.0.1:5174/` while the local services are running.

## Add the local network to MetaMask

- Network name: `Hardhat Local`
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

## Local-only test wallets

These are Hardhat's public development keys. Never use them or fund them on a
live network.

- Owner/admin address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Owner private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- Buyer address: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- Buyer private key: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

The buyer and local accounts #1-#5 each receive 100,000 mock USDT.

## Deployed contracts

- Mock USDT: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Staking ecosystem: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`
- Marketplace: `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`

Add the mock USDT address as a custom MetaMask token with 6 decimals if you
want its balance visible inside MetaMask. The dApp reads the balance directly.

Two hundred NFTs are already minted and listed: 67 Silver, 67 Gold, and 66
Diamond. Each NFT has a deterministic random image URI based on its token ID.
The ecosystem reward pool is funded with 500,000 mock USDT.

Marketplace buying is now a two-step flow:

1. Buy the one-time Silver, Gold, or Diamond subscription.
2. Buy NFTs only from categories where that wallet is subscribed.

Resale buyers and sellers must both have the matching category subscription.

## Restart from a fresh chain

Terminal 1:

```bash
cd nft-stake
npx hardhat node
```

Terminal 2:

```bash
cd nft-stake
npx hardhat run scripts/deploy.ts --network localhost
npm run seed:local
```

Terminal 3:

```bash
cd frontend
npm run dev
```

Stopping the Hardhat node deletes all local blockchain state.
