# Crypteex Frontend

React + Vite + TypeScript + Tailwind v4 dApp for Crypteex, a gold-themed NFT marketplace and staking platform.
Talks directly to the contracts in `../nft-stake/contracts` (deployed under the `MetaCrownNFTStakeEcosystem` /
`MetaCrownNFTMarketplace` names) via `ethers` v6 — no backend required.

## Pages

- **Staking** (`/staking`) — browse stake packages, join a package, track your active position (ROI claims,
  passive income, reward withdrawals, exit-stake penalty preview, re-topup), and team/leadership pool claims.
- **NFT Marketplace** (`/marketplace`) — an OpenSea-style marketplace: mint sample Silver/Gold/Diamond NFTs
  (contract owner only), buy them on primary sale, and list/cancel/buy NFTs peer-to-peer on the secondary
  market.

## Setup

```bash
npm install
npm run dev
```

### Required env vars (`.env`)

| Var | Description |
| --- | --- |
| `VITE_CHAIN_ID` | Target chain id (defaults to `11155111`, Ethereum Sepolia) |
| `VITE_CHAIN_NAME` | Display name used when prompting MetaMask to add/switch network |
| `VITE_RPC_URL` | RPC endpoint used when adding the network to MetaMask |
| `VITE_BLOCK_EXPLORER` | Explorer base URL for address/tx links |
| `VITE_USDT_ADDRESS` | Deployed (mock or real) USDT token address |
| `VITE_USDT_DECIMALS` | Payment token decimals. Use `18` for BSC mainnet USDT and `6` for local/Sepolia mock USDT. |
| `VITE_STAKE_ECOSYSTEM_ADDRESS` | Deployed `MetaCrownNFTStakeEcosystem` address |
| `VITE_MARKETPLACE_ADDRESS` | Deployed `MetaCrownNFTMarketplace` address |

Deploy the contracts first from `../nft-stake`, then paste
the printed addresses into `frontend/.env`. Until all three addresses are set, the app shows a banner warning that contracts
aren't configured.

## Updating ABIs

The ABIs in `src/abi/*.json` are extracted from `../nft-stake/artifacts`. If the contracts change, recompile
that project (`cd ../nft-stake && npx hardhat compile`) and re-extract:

```bash
node -e "
const fs = require('fs');
const extract = (src, dest) => fs.writeFileSync(dest, JSON.stringify(JSON.parse(fs.readFileSync(src)).abi, null, 2));
extract('../nft-stake/artifacts/contracts/MetaCrownNFTStakeEcosystem.sol/MetaCrownNFTStakeEcosystem.json', 'src/abi/MetaCrownNFTStakeEcosystem.json');
extract('../nft-stake/artifacts/contracts/MetaCrownNFTMarketplace.sol/MetaCrownNFTMarketplace.json', 'src/abi/MetaCrownNFTMarketplace.json');
extract('../nft-stake/artifacts/contracts/mocks/MockUSDT.sol/MockUSDT.json', 'src/abi/MockUSDT.json');
"
```

## Staking program rules reflected in the UI

- 365-day term; ROI is claimable every completed 30-day period, up to 12 times.
- Exiting the stake principal early applies a stability deduction:
  - **25%** if exited before 90 days
  - **15%** if exited before 180 days
  - **5%** flat from day 180 onward
- Reward balance withdrawals carry a 10% deduction.
- Earnings are capped at 2x principal; re-topup the same principal to resume earning.

## Build

```bash
npm run build
```
