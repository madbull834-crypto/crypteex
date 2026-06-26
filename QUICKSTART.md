# Quick Start Guide - Meta Crown NFT

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Compile Contract

```bash
npm run compile
```

### 3. Run Tests

```bash
npm test
```

### 4. Deploy Locally

```bash
# Terminal 1
npm run node

# Terminal 2
npm run deploy
```

---

## 📋 Key Files

| File | Purpose |
|------|---------|
| `contracts/MetaCrownNFT.sol` | Main contract (1,200+ lines) |
| `contracts/TestToken.sol` | Mock USDT for testing |
| `contracts/interfaces/IUSDT.sol` | USDT interface |
| `test/MetaCrownNFT.test.ts` | Comprehensive test suite |
| `scripts/deploy.ts` | Deployment script |
| `hardhat.config.ts` | Hardhat configuration |
| `README.md` | Full documentation |

---

## 💡 Key Features Implemented

✅ **3 Package Types**: Silver (10 USDT), Gold (100 USDT), Diamond (500 USDT)

✅ **Passive Income**: 
- 5% monthly with 2-4 directs
- 0.50% daily with 5+ directs + volume

✅ **Dynamic Commissions**:
- Direct: 5%, 7%, or 10% based on active count
- Level 2: 2%
- Level 3: 1%

✅ **Weekly Leadership Pool**: $2,500 team volume = qualification

✅ **Monthly Royalty Club**: 25 directs + matching volume

✅ **2X Earning Cap**: Prevents unbounded earnings

✅ **Re-topup Mechanism**: User pays NFT value to reactivate

✅ **10% Withdrawal Deduction**: For Airdrop Fund

✅ **Complete Safety**: Reentrancy guard, pausable, no unbounded loops

---

## 🔧 Common Commands

```bash
# Development
npm run compile          # Compile contracts
npm test                 # Run all tests
npm run test:gas        # Run with gas reporting
npm run node            # Start local Hardhat node

# Deployment
npm run deploy                          # Deploy to localhost
npm run deploy:sepolia                  # Deploy to Sepolia testnet

# Code Quality
npx hardhat flatten     # Flatten contract for verification
npx hardhat coverage    # Generate coverage report
```

---

## 📝 Configuration

### Setup Environment

Use the two active env files:

- `nft-stake/.env` for contracts/deployment
- `frontend/.env` for frontend builds

Edit `nft-stake/.env`:

```
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
PRIVATE_KEY=your_private_key
TREASURY_ADDRESS=0x...
AIRDROP_ADDRESS=0x...
```

---

## 🧪 Test Coverage

The test suite includes:

- ✅ User joining (all packages)
- ✅ Sponsor relationships
- ✅ NFT minting
- ✅ Direct commissions (all tiers)
- ✅ Passive income calculations
- ✅ Level income distribution
- ✅ 2X capping
- ✅ Re-topup mechanism
- ✅ Withdrawals & airdrop deduction
- ✅ Admin functions
- ✅ View functions
- ✅ Event emissions

Run tests:

```bash
npm test
```

---

## 📊 Contract Structure

### Main Components

1. **User Management**
   - User registration with package selection
   - Sponsor relationship tracking
   - Active status management

2. **Reward System**
   - Passive income calculation
   - Direct commission payment
   - Level income distribution
   - Automatic 2X capping

3. **Pool Management**
   - Weekly leadership pool
   - Monthly royalty pool
   - Airdrop fund tracking

4. **Access Control**
   - Owner-only admin functions
   - Pausable for emergencies
   - No unbounded loops

---

## 🔐 Security Features

| Feature | Implementation |
|---------|-----------------|
| Reentrancy | OpenZeppelin's ReentrancyGuard |
| Access Control | Ownable (owner functions) |
| Token Safety | SafeERC20 for USDT |
| Pausable | Emergency pause capability |
| Capping | 2X earning cap enforced |
| Double Claim Prevention | Per-user per-pool mappings |
| No Unbounded Loops | Max 3 level iterations |

---

## 🚨 Important Notes

### Before Mainnet Deployment

1. **Security Audit**: Independent audit required
2. **Testnet Validation**: Test with real users
3. **Legal Review**: Compliance check
4. **Gas Optimization**: Already optimized
5. **Monitoring**: Set up alerts and monitoring

### Assumptions

- USDT has 6 decimals
- All percentages use basis points
- One active account per wallet
- Weekly = 604,800 seconds (7 days)
- Monthly = 2,592,000 seconds (30 days)

---

## 📖 Full Documentation

See `README.md` for:
- Detailed reward logic
- Complete admin functions
- All view functions
- Event documentation
- Advanced configuration

---

## 🐛 Troubleshooting

### Tests Failing

```bash
# Clear artifacts and try again
rm -rf artifacts cache
npm run compile
npm test
```

### Deployment Issues

1. Verify `.env` configuration
2. Check network RPC availability
3. Ensure sufficient gas funds
4. Verify USDT address on target chain

### Compilation Errors

```bash
# Update dependencies
npm install

# Clear cache
npm run compile -- --force
```

---

## 📞 Next Steps

1. **Review** the main contract: `contracts/MetaCrownNFT.sol`
2. **Understand** the reward logic in `README.md`
3. **Run tests**: `npm test`
4. **Deploy locally**: `npm run deploy`
5. **Audit** before mainnet

---

## ✨ Features at a Glance

```solidity
// Join the system
contract.join(packageType, sponsorAddress)

// Check pending passive income
contract.pendingPassiveIncome(userAddress)

// Claim passive income
contract.claimPassiveIncome()

// Check if capped
contract.isUserCapped(userAddress)

// Re-topup after capping
contract.reTopup()

// Withdraw rewards (10% deduction)
contract.withdraw(amount)

// Admin: pause contract
contract.pause()

// Admin: close weekly pool
contract.closeWeeklyPool(weekId)

// Admin: close royalty pool
contract.closeMonthlyRoyaltyPool(monthId)
```

---

## 📄 License

MIT

---

**Last Updated**: 2024
**Solidity Version**: ^0.8.24
**Status**: ✅ Production-Ready (Audit Required Before Mainnet)
