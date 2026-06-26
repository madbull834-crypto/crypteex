# Meta Crown NFT Stake Ecosystem

Production-oriented Hardhat project for a combined Meta Crown fixed NFT package ecosystem and high-value NFT stake ecosystem.

## Legal and Audit Warning

This code controls user funds and implements referral, ROI, pool, deduction, and staking logic. Do not deploy to mainnet until the product has received legal review in every target jurisdiction and a full independent smart contract audit. The tests in this repository are not a substitute for formal verification, economic review, or external audit.

## Architecture

- `MetaCrownNFTStakeEcosystem` is the main ERC721 contract. One active NFT represents one active user position.
- Users can hold either a fixed Meta Crown NFT package or a high-value stake package, not both at the same time.
- USDT is transferred into the contract with `SafeERC20`; token units are read from the payment token decimals at deployment. Mock/test tokens can use 6 decimals, while BSC mainnet USDT uses 18 decimals.
- Rewards are not transferred during joins. They are credited to `userRewardBalance` and later withdrawn through `withdrawRewards`.
- Sponsor traversal is bounded to 3 levels.
- Fixed package exit is disabled. Stake package exit uses the stability deduction schedule and burns the NFT.
- Fixed NFTs are not minted by users. Admin mints fixed-package NFTs into primary sale inventory, buyers purchase listed inventory, and buyers can immediately resell through `MetaCrownNFTMarketplace`.

## Package Tables

Fixed Meta Crown packages:

| Subscription Plan | Allowed NFT Package | NFT Value | Total Payment |
| --- | ---: | ---: | ---: |
| 5 USDT | Silver | 10 USDT | 15 USDT |
| 10 USDT | Gold | 50 USDT | 60 USDT |
| 50 USDT | Diamond | 50 USDT | 100 USDT |

The platform uses two separate actions:

```solidity
purchaseSubscription(packageId, sponsor) // one-time category subscription
adminBulkMintFixedNFTsForSale(packageId, count) // owner only, auto-lists primary inventory
buyListedFixedNFT(tokenId, minimumOrbdOut, commands, inputs)
```

Examples: a Silver subscriber can only buy Silver fixed NFTs, a Gold subscriber can only buy Gold fixed NFTs, and a Diamond subscriber can only buy Diamond fixed NFTs. Buying an NFT does not charge another subscription fee.

On BSC mainnet, the deploy script configures an `OrbdSwapLocker`. When it is configured, every primary platform NFT buy sends a package-specific share of the NFT value through PancakeSwap Infinity/Universal Router to buy ORBD and permanently hold the ORBD in the locker contract. The frontend or backend must build the Pancake route off-chain and pass `minimumOrbdOut`, `commands`, and `inputs` into `buyListedFixedNFT`.

ORBD buy share by package:

| Package | NFT Value | ORBD Buy Share |
| --- | ---: | ---: |
| Silver | 10 USDT | 5% = 0.5 USDT |
| Gold | 50 USDT | 10% = 5 USDT |
| Diamond | 50 USDT | 2% = 1 USDT |

Secondary resale is handled by `MetaCrownNFTMarketplace`:

```solidity
list(tokenId, price)
buy(tokenId)
cancel(tokenId)
```

The marketplace is registered in the ecosystem with `updateNFTMarketplace`. When a secondary sale completes, the marketplace calls the ecosystem transfer hook so the active fixed NFT position moves from seller to buyer.

Stake packages are detected automatically from deposit amount:

| Package | Stake Range | Platform Fee | ROI per completed 30 days |
| --- | ---: | ---: | ---: |
| Silver Stake | 1,000-5,000 USDT | 50 USDT | 4% monthly |
| Gold Stake | 5,001-10,000 USDT | 100 USDT | 5% monthly |
| Diamond Stake | 10,001+ USDT | 100 USDT | 6% monthly |

All stake packages use one 365-day plan. ROI becomes claimable after each
completed 30-day period. Missed periods accumulate, and no more than 12 monthly
periods can be claimed for one staking term.

## Reward Logic

- Direct commission: fixed packages use 5%, 7%, or 10% based on active direct count. Stake packages default to one-time 5%.
- Level income: level 1 uses the direct commission amount, level 2 pays 2%, and level 3 pays 1%. Level 1 is not double-paid.
- Passive income applies to fixed packages only. Two active directs unlock 5% per complete 30-day period. Five active directs plus required direct business unlock 0.50% per complete day.
- ROI applies to stake packages only and is claimable every completed 30 days for one year. Silver pays 4%, Gold 5%, and Diamond 6% per monthly period, with at most 12 periods.
- Performance boosters use 3X team business for +1% and 10X team business for +2%; only the highest milestone applies.
- Every reward source respects the 2X cap. When `totalEarned >= totalCap`, earning pauses until `reTopup`.

## Pools

- Weekly leadership uses `weekId = block.timestamp / 7 days`. Qualification is 2,500 USDT in 3-level team business for that week. Admin closes the week and qualified users claim equal shares.
- Monthly royalty uses `monthId = block.timestamp / 30 days`. Qualification is 25 active directs plus package-specific direct business. Admin closes the month and members claim equal shares.
- Fixed package platform split funds weekly and royalty pools. Silver has a documented business-rule conflict because its platform fee is 5 USDT while requested pool funding is 5 + 2 USDT; the contract funds both configured pools and leaves no remaining Silver platform fee.
- Primary platform NFT purchases on BSC mainnet send the package-specific ORBD buy share to the ORBD swap locker; only the remaining NFT value is added to `totalNFTValueBalance`.

## Accounting Model

The contract tracks separate ledgers:

- `totalNFTValueBalance`
- `totalStakeBalance`
- `platformFeeBalance`
- `rewardPoolBalance`
- `userRewardBalance[address]`
- `deductionFundBalance`
- `airdropFundBalance`
- `weeklyLeadershipPoolBalance`
- `monthlyRoyaltyPoolBalance`
- `ecosystemStabilityFundBalance`
- `totalEarned[address]`
- `totalCap[address]`
- `totalDirectBusiness[address]`
- `totalTeamBusiness[address]`

Admin withdrawals are limited to tracked admin-owned balances: platform fees, airdrop/deduction fund, and ecosystem stability fund. Admin cannot withdraw user stake principal or pending user rewards. Emergency rescue rejects USDT.

## Claim and Withdrawal Policy

- Users can make 2 reward claims per 30-day month period.
- Reward withdrawal does not count as a monthly claim.
- `withdrawRewards` deducts 10% by default and sends 90% to the user. The deduction is tracked for the airdrop/deduction fund.
- The deduction can be configured to 500 bps if a 5% legacy staking policy is required.

## Stake Exit

Stake users can call `exitStake`:

| Time Since Activation | Deduction |
| --- | ---: |
| Before 90 days | 25% |
| 90-179 days | 15% |
| 180+ days | 5% |

The net stake is returned, deduction goes to `ecosystemStabilityFundBalance`, the user becomes inactive, and the NFT is burned.

## Security Decisions

- Solidity `^0.8.24`
- OpenZeppelin ERC721, Ownable, ReentrancyGuard, SafeERC20
- Internal accounting plus withdraw pattern
- Bounded sponsor loops only
- Custom errors to keep deployable bytecode below the EVM contract-size limit
- `viaIR`, optimizer runs `0`, and Cancun EVM target are enabled in Hardhat config
- BSC mainnet ORBD purchasing is isolated in `OrbdSwapLocker` so the main ecosystem contract remains below the EVM size limit.
- No USDT emergency rescue

## Commands

```bash
npm install --legacy-peer-deps
npm run compile
npm test
```

In this environment Hardhat could not download the compiler list. The contract was verified with local `solc@0.8.24` and tests were run with generated artifacts via:

```bash
npx hardhat test --no-compile
```

## Deployment

Fill `nft-stake/.env`, then run:

```bash
npm run deploy -- --network <network>
```

Environment variables:

- `USDT_ADDRESS`
- `ORBD_ADDRESS`
- `PANCAKE_INFINITY_ROUTER_ADDRESS`
- `PANCAKE_PERMIT2_ADDRESS`
- `TREASURY_ADDRESS`
- `AIRDROP_ADDRESS`
- `BASE_URI`
- `SEPOLIA_RPC_URL`
- `BSC_RPC_URL`
- `PRIVATE_KEY`
