# BSC mainnet deployment runbook

This is the production deployment path for BNB Smart Chain mainnet. Use the `nft-stake` project for deployment; the root Hardhat project is legacy.

Mainnet contracts deployed by `npm run deploy:bsc`:

- `OrbdSwapLocker`
- `MetaCrownNFTStakeEcosystem`
- `MetaCrownNFTMarketplace`

Primary platform NFT buys on BSC mainnet buy ORBD through PancakeSwap Infinity/Universal Router. Purchased ORBD remains locked in `OrbdSwapLocker`.

| Package | NFT Value | ORBD Buy Share |
| --- | ---: | ---: |
| Silver | 10 USDT | 5% = 0.5 USDT |
| Gold | 50 USDT | 10% = 5 USDT |
| Diamond | 50 USDT | 2% = 1 USDT |

## 1. Prepare env files

The project now uses exactly two active env files:

- `nft-stake/.env` for contract deployment
- `frontend/.env` for frontend builds

Edit `nft-stake/.env`:

```env
PRIVATE_KEY=your_admin_private_key
BSC_RPC_URL=your_bsc_mainnet_rpc
FRONTEND_RPC_URL=your_bsc_mainnet_rpc

USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955
ORBD_ADDRESS=0x4E24C684a90f2c1f9030a5608A6c3A6fa4E854f5
PANCAKE_INFINITY_ROUTER_ADDRESS=0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB
PANCAKE_PERMIT2_ADDRESS=0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768
PANCAKE_INFINITY_CL_PATH=0x0000000000000000000000000000000000000000,67,0x0000000000000000000000000000000000000000,0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b,0x0000000000000000000000000000000000000000000000000000000000010000;0x4E24C684a90f2c1f9030a5608A6c3A6fa4E854f5,3355,0x0000000000000000000000000000000000000000,0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b,0x0000000000000000000000000000000000000000000000000000000000010000

TREASURY_ADDRESS=your_treasury_wallet
AIRDROP_ADDRESS=your_airdrop_wallet
ETHERSCAN_API_KEY=your_etherscan_v2_api_key
```

Keep the deployer wallet funded with BNB for deployment gas.

Important BSC token unit note: BSC mainnet USDT at `0x55d398326f99059fF775485246999027B3197955` uses 18 decimals. The contract reads payment-token decimals during deployment, and the frontend must use `VITE_USDT_DECIMALS=18`.

## 2. Compile, test, and sync frontend ABI

```bash
cd nft-stake
npm install
npm run compile
npm test
npm run sync:frontend-abi
npm run preflight:bsc
```

`sync:frontend-abi` copies the latest compiled ABIs into:

- `frontend/src/abi/MetaCrownNFTStakeEcosystem.json`
- `frontend/src/abi/MetaCrownNFTMarketplace.json`
- `frontend/src/abi/MockUSDT.json`

## 3. Deploy contracts to BSC mainnet

```bash
cd nft-stake
npm run preflight:bsc
npm run deploy:bsc
```

The deploy script will:

1. refuse to deploy if `USDT_ADDRESS` is missing on BSC mainnet;
2. deploy `OrbdSwapLocker` with USDT, ORBD, Pancake router, and Permit2;
3. deploy `MetaCrownNFTStakeEcosystem` with the locker address;
4. connect the locker back to the ecosystem contract;
5. deploy `MetaCrownNFTMarketplace`;
6. register the marketplace in the ecosystem;
7. write deployment JSON files:
   - `nft-stake/deployments/bsc-56.json`
   - `nft-stake/deployments/bsc.latest.json`
8. print frontend env values.

## 4. Verify contracts on BscScan

Wait until BscScan indexes the deployment, then run:

```bash
cd nft-stake
npm run verify:bsc
```

If you use a custom deployment file:

```bash
DEPLOYMENT_FILE=deployments/bsc-56.json npm run verify:bsc
```

## 5. Mint primary NFT inventory

For 100 total NFTs round-robin across Silver/Gold/Diamond:

```bash
cd nft-stake
NFT_COUNT=100 npm run mint:admin:bsc
```

For one category only:

```bash
PACKAGE_ID=1 NFT_COUNT=100 npm run mint:admin:bsc
PACKAGE_ID=2 NFT_COUNT=100 npm run mint:admin:bsc
PACKAGE_ID=3 NFT_COUNT=100 npm run mint:admin:bsc
```

Package IDs:

- `1` = Silver
- `2` = Gold
- `3` = Diamond

For a fresh deployment and first mint of 100 NFTs, set frontend token range:

```env
VITE_PLATFORM_FIRST_TOKEN_ID=1
VITE_PLATFORM_LAST_TOKEN_ID=100
```

If you mint more later, update `VITE_PLATFORM_LAST_TOKEN_ID` to the latest token ID printed by the mint script.

## 6. Configure frontend for BSC mainnet

After deployment, copy values from `nft-stake/deployments/bsc.latest.json` or from the `npm run deploy:bsc` output into `frontend/.env`:

```env
VITE_CHAIN_ID=56
VITE_CHAIN_NAME=bsc
VITE_RPC_URL=your_bsc_mainnet_rpc
VITE_BLOCK_EXPLORER=https://bscscan.com
VITE_USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955
VITE_USDT_DECIMALS=18
VITE_STAKE_ECOSYSTEM_ADDRESS=deployed_ecosystem_address
VITE_MARKETPLACE_ADDRESS=deployed_marketplace_address
VITE_ORBD_ADDRESS=0x4E24C684a90f2c1f9030a5608A6c3A6fa4E854f5
VITE_PANCAKE_INFINITY_CL_PATH=0x0000000000000000000000000000000000000000,67,0x0000000000000000000000000000000000000000,0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b,0x0000000000000000000000000000000000000000000000000000000000010000;0x4E24C684a90f2c1f9030a5608A6c3A6fa4E854f5,3355,0x0000000000000000000000000000000000000000,0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b,0x0000000000000000000000000000000000000000000000000000000000010000
VITE_PLATFORM_FIRST_TOKEN_ID=1
VITE_PLATFORM_LAST_TOKEN_ID=100
VITE_EVENT_LOOKBACK_BLOCKS=50000
VITE_EVENT_CHUNK_BLOCKS=1000
VITE_ENABLE_RESALE_SCAN=true
```

Then build:

```bash
cd frontend
npm install
npm run build
```

Deploy to Nginx web root from repo root:

```bash
npm run deploy:frontend:nginx -- /var/www/crypteex
```

If your Nginx root is different, replace `/var/www/crypteex`.

## 7. Full command sequence

From repo root, fill both env files:

- `nft-stake/.env`
- `frontend/.env`

Then run:

```bash
cd nft-stake
npm install
npm run compile
npm test
npm run sync:frontend-abi
npm run preflight:bsc
npm run deploy:bsc
npm run verify:bsc
NFT_COUNT=100 npm run mint:admin:bsc
```

Update `frontend/.env` with deployed addresses and token range, then:

```bash
cd ../frontend
npm install
npm run build
```

Optional Nginx deploy:

```bash
cd ..
npm run deploy:frontend:nginx -- /var/www/crypteex
```

## 8. BSC primary NFT buy flow with ORBD

The user flow is:

1. user approves USDT to `MetaCrownNFTStakeEcosystem`;
2. user calls `purchaseSubscription(packageId, sponsor)` once for the category;
3. user buys a listed platform NFT by calling:

```solidity
buyListedFixedNFT(tokenId, minimumOrbdOut, commands, inputs)
```

When `OrbdSwapLocker` is configured:

- the buyer pays the full NFT value in USDT;
- the ecosystem sends the package-specific ORBD buy share to `OrbdSwapLocker`;
- `OrbdSwapLocker` approves Permit2 for the exact USDT amount;
- Pancake Infinity/Universal Router executes the supplied route;
- the locker verifies the exact USDT amount was spent;
- the locker verifies at least `minimumOrbdOut` ORBD was received;
- the locker revokes allowances;
- ORBD remains held in `OrbdSwapLocker`;
- the remaining NFT value is added to ecosystem NFT accounting.

The frontend builds Pancake Infinity calldata locally from `VITE_PANCAKE_INFINITY_CL_PATH`.
No custom ORBD quote API is required. In this no-API mode, `minimumOrbdOut` is `0`, so the
locker only checks that some ORBD was received; it does not enforce slippage protection.

## Mainnet safety checklist

- Use a dedicated deployer/admin wallet.
- Use real treasury and airdrop wallets, not the deployer hot wallet.
- Confirm every address in `.env` before deploy.
- Test one small BSC mainnet platform NFT buy before opening primary NFT buys publicly.
- Fund the reward pool before allowing reward claims.
- Run independent smart-contract audit and legal review before custodying user funds on mainnet.
