# BSC Mainnet Deployment Commands

Run every command from the `nft-stake` folder.

## 1. Install dependencies

```bash
npm install
```

## 2. Compile and test

```bash
npm run compile
npm test
```

## 3. Check BSC mainnet config

Make sure `nft-stake/.env` contains real BSC mainnet values:

```bash
PRIVATE_KEY=...
BSC_RPC_URL=...
USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955
ORBD_ADDRESS=0x4E24C684a90f2c1f9030a5608A6c3A6fa4E854f5
PANCAKE_INFINITY_ROUTER_ADDRESS=0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB
PANCAKE_PERMIT2_ADDRESS=0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768
PANCAKE_INFINITY_CL_PATH=...
TREASURY_ADDRESS=...
AIRDROP_ADDRESS=...
BASE_URI=https://your-live-metadata-url/
ETHERSCAN_API_KEY=...
```

Use a deployer wallet only for deployment. Use separate treasury/airdrop wallets, preferably multisig/cold wallets.

## 4. Run preflight

```bash
npm run preflight:bsc
```

## 5. Deploy to BSC mainnet

This script refuses to deploy unless you explicitly confirm mainnet deployment:

```bash
CONFIRM_BSC_MAINNET_DEPLOY=true npm run deploy:bsc:mainnet
```

Deployment output is saved to:

```bash
nft-stake/deployments/bsc.latest.json
nft-stake/deployments/bsc-56.json
```

## 6. Verify contracts

Wait a few minutes for BscScan indexing, then run:

```bash
npm run verify:bsc
```

## 7. Mint platform NFTs

Default mints `NFT_COUNT` from `.env` as round-robin Silver/Gold/Diamond:

```bash
npm run mint:admin:bsc
```

For exactly 100:

```bash
NFT_COUNT=100 npm run mint:admin:bsc
```

After minting, set frontend token range:

```bash
VITE_PLATFORM_FIRST_TOKEN_ID=1
VITE_PLATFORM_LAST_TOKEN_ID=100
```

## 8. Copy frontend env values

Open:

```bash
nft-stake/deployments/bsc.latest.json
```

Copy the `frontendEnv` values into:

```bash
frontend/.env
```

Then build the frontend:

```bash
cd ../frontend
npm install
npm run build
```
