# Meta Crown testnet deployment runbook

This package deploys the production-facing staking ecosystem contracts:

- `MetaCrownNFTStakeEcosystem`
- `MetaCrownNFTMarketplace`
- optional `MockUSDT` on test networks

## 1. Configure environment

Copy the template:

```bash
cd nft-stake
cp .env.example .env
```

Set at least:

```bash
PRIVATE_KEY=your_admin_private_key
BSC_TESTNET_RPC_URL=your_bsc_testnet_rpc
```

For Sepolia instead, set:

```bash
PRIVATE_KEY=your_admin_private_key
SEPOLIA_RPC_URL=your_sepolia_rpc
```

Optional but recommended:

```bash
TREASURY_ADDRESS=your_treasury_wallet
AIRDROP_ADDRESS=your_airdrop_wallet
BSCSCAN_API_KEY=your_bscscan_key
ETHERSCAN_API_KEY=your_etherscan_key
```

If `USDT_ADDRESS` is empty on testnet, the deploy script deploys `MockUSDT` and mints test tokens to the admin. On BSC mainnet, `USDT_ADDRESS` is required.

## 2. Compile and test

```bash
npm run compile
npm test
```

## 3. Deploy to testnet

BSC testnet:

```bash
npm run deploy:bsc-testnet
```

Sepolia:

```bash
npm run deploy:sepolia
```

The deploy script writes deployment files into:

```text
nft-stake/deployments/
```

It also prints frontend environment values:

```text
VITE_CHAIN_ID=
VITE_CHAIN_NAME=
VITE_RPC_URL=
VITE_BLOCK_EXPLORER=
VITE_USDT_ADDRESS=
VITE_STAKE_ECOSYSTEM_ADDRESS=
VITE_MARKETPLACE_ADDRESS=
```

Copy these values into `frontend/.env.local` for testnet frontend testing.

## 4. Admin mint 100 fixed NFTs for sale

After deploy:

```bash
npm run mint:admin:bsc-testnet
```

or:

```bash
npm run mint:admin:sepolia
```

By default it mints 100 NFTs in round-robin package order:

- Silver
- Gold
- Diamond

To mint a custom count:

```bash
NFT_COUNT=100 npm run mint:admin:bsc-testnet
```

To mint all NFTs in one category:

```bash
PACKAGE_ID=1 NFT_COUNT=100 npm run mint:admin:bsc-testnet
```

Package IDs:

- `1` = Silver
- `2` = Gold
- `3` = Diamond

## 5. User purchase flow

1. Admin mints fixed NFTs for sale.
2. User approves USDT to `MetaCrownNFTStakeEcosystem`.
3. User buys the one-time category subscription.
4. User buys an NFT only from a category they are subscribed to.
5. Marketplace resale requires both seller and buyer to be subscribed in that NFT category.
6. If a user resells an NFT for at least `2x` its package value, the platform mints two replacement NFTs to the seller.

Example:

```text
Alice owns a $10 Silver NFT.
Alice lists it for $20.
Bob, who is also a Silver subscriber, buys it.
Bob receives Alice's original NFT.
Alice receives $20 from Bob.
The platform mints two new Silver NFTs to Alice.
Each replacement NFT belongs to the same $10 Silver category.
```

## 6. Optional verification

After the block explorer indexes the contracts, run the exact verify commands printed by `deploy.ts`.

Example:

```bash
npx hardhat verify --network bscTestnet ECOSYSTEM_ADDRESS USDT_ADDRESS TREASURY_ADDRESS AIRDROP_ADDRESS "BASE_URI"
npx hardhat verify --network bscTestnet MARKETPLACE_ADDRESS USDT_ADDRESS ECOSYSTEM_ADDRESS
```

## Production readiness notes

- Use a treasury wallet that is not the deployer hot wallet.
- Use a dedicated airdrop wallet.
- Fund the reward pool before allowing ROI/reward claims.
- Use a real audited USDT/token address on production networks.
- Do not treat this repository change as a smart-contract audit. Run an external audit before mainnet custody of user funds.
