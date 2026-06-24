# Meta Crown NFT - Smart Contract System

A production-grade smart contract system for Meta Crown NFT featuring multi-tier rewards, passive income, referral commissions, weekly leadership pools, and royalty club distribution.

**⚠️ SECURITY WARNING**: This contract handles financial rewards and USDT transactions. Before mainnet deployment:
1. Complete independent security audit by professional auditors
2. Extensive testnet validation
3. Legal review for compliance with local regulations
4. Consider insurance/protection mechanisms
5. Implement gradual rollout with monitoring

---

## Project Overview

Meta Crown NFT is a comprehensive reward ecosystem built on Ethereum, featuring:

- **NFT-based User Packages**: Silver, Gold, Diamond
- **Multi-tier Reward System**: Passive income, direct commissions, level income
- **Weekly Leadership Pool**: For high-volume team builders
- **Monthly Royalty Club**: For elite performers
- **2X Earning Cap**: Prevents unlimited accumulation with re-topup mechanism
- **Automated Reward Distribution**: Instant commission crediting with capping

---

## Package Structure

| Package | NFT Value | Platform Fee | Total Payment |
|---------|-----------|--------------|---------------|
| Silver  | 10 USDT   | 5 USDT       | 15 USDT       |
| Gold    | 100 USDT  | 10 USDT      | 110 USDT      |
| Diamond | 500 USDT  | 50 USDT      | 550 USDT      |

### Payment Allocation

For every registration:
- **10% of NFT Value**: Swapped through PancakeSwap Infinity using the USDT → BNB → ORBD smart route
- **Purchased ORBD**: Sent to and permanently held by the MetaCrownNFT contract
- **Remaining NFT Value**: Stays in the system pool as USDT
- **Platform Fee**: To treasury wallet
- **$5 from each registration**: Goes to Crown Weekend Leadership Pool
- **$2 from each platform fee**: Goes to Global Royalty Pool
- **10% of withdrawals**: Goes to Airdrop Fund

### Permanent subscriptions and category NFT trading

Joining creates two separate on-chain assets: a permanent wallet subscription
record and an initial tradable NFT tagged Silver, Gold, or Diamond. NFTs can be
sold using standard ERC721 approval and transfer flows only when both seller and
buyer are active subscribers in that NFT's category. Trading does not move or
cancel either wallet's subscription, does not move rewards or referral data,
and does not charge another subscription fee or trigger another ORBD swap. A
subscriber may own multiple NFTs within their subscribed category.

---

## Reward System

### 1. Passive Income

Based on active direct referrals and business volume:

| Condition | Rate | Frequency |
|-----------|------|-----------|
| 0-1 active directs | 0% | — |
| 2-4 active directs | 5% | Monthly |
| 5+ active directs + volume requirement | 0.50% | Daily |

**Volume Requirements for 0.50% Daily Income:**
- Silver: 50 USDT direct volume
- Gold: 500 USDT direct volume
- Diamond: 2,500 USDT direct volume

**Implementation Notes:**
- Passive income calculated per-second, claimed on demand
- Respects 2X earning cap
- Last claim timestamp tracked to prevent double claims

### 2. Direct Sponsor Commission

Paid instantly when direct referral joins or re-topups:

| Active Directs | Commission % |
|----------------|--------------|
| 1-5 | 5% |
| 6-15 | 7% |
| 16-25 | 10% |

- Commission based on NFT value of new referral
- Applied to sponsor's internal reward balance
- Respects 2X earning cap

### 3. Team Level Income (3 Levels)

One-time income when new NFT package is purchased or re-topup occurs:

| Level | Commission % |
|-------|--------------|
| Level 1 (Direct) | 5%, 7%, or 10% (per table above) |
| Level 2 | 2% |
| Level 3 | 1% |

**Notes:**
- Walks sponsor chain up to 3 levels only
- Each recipient subject to 2X earning cap
- No unbounded loops

### 4. Crown Weekend Leadership Pool

**Contribution:** $5 extracted from every new NFT registration

**Qualification:** Users generating $2,500 in new business from their 3-level team within a week (Monday-Sunday)

**Distribution:** Pool divided equally among weekly qualifiers

**Key Details:**
- Automatic weekly pool close by admin
- Prevents double claims
- Payouts occur per-week, not cumulative

### 5. Meta Crown Royalty Club

**Qualification:**
- 25+ active direct referrals
- Direct business volume meeting package-specific target:
  - Silver: 50 USDT
  - Gold: 500 USDT
  - Diamond: 2,500 USDT

**Reward:** $2 from every platform fee worldwide, distributed equally to members monthly

**Distribution:**
- Monthly pool closes by admin
- Equal distribution among qualified members
- Prevents double claims

---

## 2X Earning Cap & Re-topup

### Earning Cap

Users cannot earn more than **2X their NFT value** in total income (passive + active rewards combined).

**Example:**
- Silver user (10 USDT NFT) → Cap = 20 USDT total earnings
- Gold user (100 USDT NFT) → Cap = 200 USDT total earnings
- Diamond user (500 USDT NFT) → Cap = 1,000 USDT total earnings

When a user reaches their cap:
- All earning sources pause (passive, commissions, pool distributions)
- User status remains `active: false` until re-topup
- User cannot receive new rewards

### Re-topup Mechanism

To continue earning after reaching 2X cap:

1. User pays **100% of initial NFT value** (no platform fee)
   - Silver: 10 USDT
   - Gold: 100 USDT
   - Diamond: 500 USDT

2. User is reactivated and can earn again

3. Earning cap increases additively:
   - New cap = previous cap + 2X new NFT value
   - However, if re-topping with same package, cap increases by 2X that package value

4. Re-topup triggers sponsor commissions as if it's a new join

**Tracking:**
- `reTopupCount` incremented per re-topup
- `totalEarned` carries forward (not reset)
- `lastPassiveClaimTime` reset to current timestamp

---

## Withdrawal & Airdrop Deduction

### Withdrawal Process

1. User initiates withdrawal from internal reward balance
2. **10% automatic deduction** for Airdrop Fund
3. **90% net amount** transferred to user wallet
4. Deduction tracked and available for admin distribution

**Requirements:**
- Non-zero amount
- Amount ≤ user's reward balance
- Reentrancy protection enforced

**Emission:**
```
event Withdrawal(
    address indexed user,
    uint256 grossAmount,
    uint256 airdropDeduction,
    uint256 netAmount
);
```

---

## Smart Contract Architecture

### Core Components

**MetaCrownNFT.sol** (Main Contract)
- ERC721: NFT minting for packages
- Ownable: Admin functions
- ReentrancyGuard: Reentrancy protection
- Pausable: Emergency contract pause
- SafeERC20: Safe USDT transfers

### Key Data Structures

```solidity
struct User {
    uint8 packageType;           // 1=Silver, 2=Gold, 3=Diamond
    uint256 nftValue;            // In USDT (6 decimals)
    address sponsor;             // Direct upline
    uint256 activationTime;      // Timestamp
    bool active;                 // Current status
    uint256 totalEarned;         // Total earnings (for 2X cap)
    uint256 rewardBalance;       // Withdrawable balance
    uint256 lastPassiveClaimTime; // Passive income tracking
    uint8 reTopupCount;          // Re-topup counter
}

struct Package {
    uint256 nftValue;    // In USDT
    uint256 platformFee; // In USDT
}
```

### Security Features

- **Reentrancy Protection**: `ReentrancyGuard` on critical functions
- **Access Control**: Only owner can execute admin functions
- **2X Capping**: Prevents unbounded earnings
- **Pausable**: Emergency pause capability
- **SafeERC20**: Safe token transfer handling
- **No Unbounded Loops**: All iterations bounded (max 3 levels)
- **Double Claim Prevention**: Per-user per-pool tracking
- **Timestamp-based Calculations**: For passive income and pools

---

## Setup & Deployment

### Prerequisites

- Node.js v18+
- npm or yarn
- Hardhat

### Installation

```bash
npm install
```

### Environment Configuration

Create `.env` file (copy from `.env.example`):

```
# Network RPC
BSC_RPC_URL=https://bsc-dataseed.binance.org/

# Private Keys
PRIVATE_KEY=your_private_key_here

# Token Addresses
USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955
ORBD_ADDRESS=0x4E24C684a90f2c1f9030a5608A6c3A6fa4E854f5
PANCAKE_INFINITY_ROUTER_ADDRESS=0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB
PANCAKE_PERMIT2_ADDRESS=0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768
TREASURY_ADDRESS=0x0000000000000000000000000000000000000000
AIRDROP_ADDRESS=0x0000000000000000000000000000000000000000

# Gas Reporting
REPORT_GAS=true
```

The frontend must obtain PancakeSwap Universal Router `commands` and `inputs`
for an exact-input USDT → BNB → ORBD route and call:

```solidity
join(packageType, sponsor, minimumOrbdOut, commands, inputs)
```

The contract grants Permit2 the exact 10% NFT-value allowance only for the
current transaction, requires an Infinity (`INFI_SWAP`) command, verifies the
complete USDT amount was spent, verifies `minimumOrbdOut`, and revokes both
allowances. The live ORBD/native-BNB Infinity CL pool ID is
`0x739b42ece644d78fb884c105e3feaf380084e825a4489ce7676851228307bcdb`.

### Compilation

```bash
npx hardhat compile
```

### Running Tests

```bash
# Run all tests
npx hardhat test

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run specific test file
npx hardhat test test/MetaCrownNFT.test.ts

# Run tests with coverage
npx hardhat coverage
```

### Local Testing

```bash
# Terminal 1: Start local network
npx hardhat node

# Terminal 2: Deploy to local network
npx hardhat run scripts/deploy.ts --network localhost
```

### Sepolia Testnet Deployment

```bash
# 1. Ensure SEPOLIA_RPC_URL and PRIVATE_KEY are set in .env
# 2. Deploy
npx hardhat run scripts/deploy.ts --network sepolia
```

### Mainnet Deployment (⚠️ Use caution)

```bash
# 1. Verify all configuration
# 2. Ensure sufficient gas funds
# 3. Execute deployment
npx hardhat run scripts/deploy.ts --network <mainnet-name>
```

---

## Admin Functions

### Pause/Unpause

```solidity
// Pause contract - no joins/claims/withdrawals allowed
contract.pause()

// Unpause contract
contract.unpause()
```

### Configuration Updates

```solidity
// Update treasury wallet
setTreasuryWallet(address newTreasury)

// Update airdrop wallet
setAirdropWallet(address newAirdrop)

// Update NFT metadata base URI
setBaseURI(string memory newBaseURI)

// Update package configuration
updatePackage(uint8 packageType, uint256 nftValue, uint256 platformFee)
```

### Pool Management

```solidity
// Close weekly pool for claims
closeWeeklyPool(uint256 weekId)

// Close monthly royalty pool for claims
closeMonthlyRoyaltyPool(uint256 monthId)

// Withdraw accumulated airdrop funds
withdrawAirdropFund(uint256 amount)
```

### Emergency Functions

```solidity
// Rescue non-USDT tokens (cannot rescue USDT)
emergencyRescue(address tokenAddress, uint256 amount)
```

---

## View Functions

### User & Account Info

```solidity
// Get full user data
getUser(address user) → User

// Check if user is capped
isUserCapped(address user) → bool

// Get remaining earning capacity
remainingCap(address user) → uint256

// Get pending withdrawal balance
pendingWithdrawalBalance(address user) → uint256
```

### Referral & Business Info

```solidity
// Get active direct count
getDirectCount(address user) → uint256

// Get direct business volume
getDirectBusinessVolume(address user) → uint256

// Get upline chain (up to 3 levels)
getUplines(address user) → address[3]
```

### Income & Rewards

```solidity
// Get pending passive income
pendingPassiveIncome(address user) → uint256
```

### Pool Info

```solidity
// Get weekly pool data
getWeeklyPool(uint256 weekId) → WeeklyPoolData

// Check weekly qualification
isWeeklyQualified(address user, uint256 weekId) → bool

// Get monthly royalty pool data
getMonthlyRoyaltyPool(uint256 monthId) → MonthlyRoyaltyData
```

### Package Info

```solidity
// Get package configuration
getPackage(uint8 packageType) → Package
```

---

## Events Emitted

All significant contract actions emit events:

```solidity
// User lifecycle
event UserJoined(address indexed user, address indexed sponsor, uint8 packageType, uint256 nftValue, uint256 tokenId)
event NFTMinted(address indexed to, uint256 tokenId, uint8 packageType)
event ReTopup(address indexed user, uint256 newCap, uint8 reTopupCount)
event Capped(address indexed user, uint256 totalEarned, uint256 cap)

// Rewards
event DirectCommissionCredited(address indexed sponsor, address indexed from, uint256 amount, uint256 directCount)
event LevelIncomeCredited(address indexed recipient, uint8 level, uint256 amount)
event PassiveIncomeClaimed(address indexed user, uint256 amount)

// Pools
event WeeklyPoolFunded(uint256 indexed weekId, uint256 amount)
event WeeklyPoolQualified(address indexed user, uint256 indexed weekId, uint256 teamVolume)
event WeeklyPoolClosed(uint256 indexed weekId, uint256 poolAmount, uint256 qualifierCount)
event WeeklyPoolClaimed(address indexed user, uint256 indexed weekId, uint256 amount)

event RoyaltyQualified(address indexed user, uint256 directCount, uint256 directVolume)
event RoyaltyPoolFunded(uint256 indexed monthId, uint256 amount)
event RoyaltyPoolClosed(uint256 indexed monthId, uint256 poolAmount, uint256 memberCount)
event RoyaltyClaimed(address indexed user, uint256 indexed monthId, uint256 amount)

// Finance
event Withdrawal(address indexed user, uint256 grossAmount, uint256 airdropDeduction, uint256 netAmount)

// Admin
event TreasuryUpdated(address indexed newTreasury)
event AirdropWalletUpdated(address indexed newAirdropWallet)
event BaseURIUpdated(string newBaseURI)
event PackageUpdated(uint8 packageType, uint256 nftValue, uint256 platformFee)
```

---

## Gas Optimization Notes

1. **No unbounded loops**: Max 3 level iterations
2. **Mapping-based tracking**: Avoids array iteration
3. **Per-second calculations**: Efficient storage, calculation on-demand
4. **Snapshot logic**: Weekly/monthly pools avoid iterating all members
5. **Basis points**: Integer arithmetic, no decimals

---

## Testing Coverage

The test suite covers:

✅ Joining (Silver, Gold, Diamond packages)
✅ Sponsor validation and NFT minting
✅ Direct commissions (5%, 7%, 10% tiers)
✅ Passive income (no income, 5% monthly, 0.50% daily)
✅ Level 2 & 3 income
✅ 2X earning cap
✅ Re-topup mechanism
✅ Withdrawal & airdrop deduction
✅ Admin functions (pause, wallet updates)
✅ View functions
✅ Event emissions
✅ Reentrancy protection
✅ Capping enforcement
✅ Double claim prevention

---

## Future Enhancements (Optional)

These can be added as configurable extensions:

- **Performance Boosters**: +1% for 3X milestone, +2% for 10X
- **Claim Policy**: Limit claims to X per month
- **Ecosystem Stability**: Tiered bonuses (3mo, 6mo, 9mo)
- **NFT Burn Mechanics**: Upgrade paths
- **Governance**: Community voting on parameters

---

## Audit & Security

### Pre-Deployment Checklist

- [ ] Independent third-party security audit completed
- [ ] All test cases passing
- [ ] Gas optimization reviewed
- [ ] Legal review completed
- [ ] Testnet validation with real users
- [ ] Admin key management plan in place
- [ ] Incident response plan prepared
- [ ] Insurance/protection considered
- [ ] Regulatory compliance verified

### Known Limitations

1. **Weekly/Monthly ID Calculation**: Uses simple timestamp division. For production, implement calendar-aware calculations.
2. **Weekly Team Volume**: Simplified for this version. Production version should maintain per-week per-user mappings.
3. **Royalty Member Snapshot**: Admin must manually close pools to finalize member count.
4. **No Withdrawal Cooldown**: Consider adding cooldown period between withdrawals.

---

## Support & Resources

- **Solidity Docs**: https://docs.soliditylang.org/
- **OpenZeppelin**: https://docs.openzeppelin.com/
- **Hardhat**: https://hardhat.org/
- **USDT Contract**: Verify actual address on target chain

---

## License

MIT

---

## Disclaimer

**THIS CONTRACT IS PROVIDED AS-IS FOR EDUCATIONAL AND TESTING PURPOSES ONLY.**

Before deploying to mainnet:
1. Conduct independent security audit
2. Perform extensive testing
3. Verify legal compliance
4. Consider insurance mechanisms
5. Implement monitoring and circuit breakers

**The authors and contributors assume no liability for financial losses or damages resulting from use of this contract.**

---

## Contact & Development

For questions, issues, or improvements, please review the inline code documentation.

**Last Updated**: 2024

**Solidity Version**: ^0.8.24

**OpenZeppelin Version**: ^5.0.1
