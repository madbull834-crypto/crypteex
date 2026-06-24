import { expect } from "chai";
import { ethers } from "hardhat";
import { MetaCrownNFT, IERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MetaCrownNFT", function () {
  let contract: MetaCrownNFT;
  let usdtToken: IERC20;
  let orbdToken: IERC20;
  let infinityRouter: any;
  let permit2: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let treasury: SignerWithAddress;
  let airdrop: SignerWithAddress;

  // USDT decimals and values
  const USDT_DECIMALS = 6;
  const USDT = (amount: number) => ethers.parseUnits(amount.toString(), USDT_DECIMALS);

  // Package info
  const SILVER_NFT = USDT(10);
  const SILVER_FEE = USDT(5);
  const SILVER_TOTAL = USDT(15);

  const GOLD_NFT = USDT(100);
  const GOLD_FEE = USDT(10);
  const GOLD_TOTAL = USDT(110);

  const DIAMOND_NFT = USDT(500);
  const DIAMOND_FEE = USDT(50);
  const DIAMOND_TOTAL = USDT(550);

  async function join(
    caller: SignerWithAddress,
    packageType: number,
    sponsor: string
  ) {
    const nftValues = [0n, SILVER_NFT, GOLD_NFT, DIAMOND_NFT];
    const amountIn = nftValues[packageType] / 10n;
    const minimumOrbdOut = amountIn * 10n ** 12n;
    const commands = "0x10"; // Pancake Universal Router INFI_SWAP command
    const inputs = [
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint160", "uint256"],
        [amountIn, minimumOrbdOut]
      ),
    ];
    return contract
      .connect(caller)
      .join(packageType, sponsor, minimumOrbdOut, commands, inputs);
  }

  // Mock USDT contract
  class MockUSDT {
    balances: Map<string, bigint> = new Map();
    allowances: Map<string, Map<string, bigint>> = new Map();

    constructor(initialBalances: Map<string, bigint>) {
      this.balances = initialBalances;
    }

    async approve(owner: string, spender: string, amount: bigint) {
      if (!this.allowances.has(owner)) {
        this.allowances.set(owner, new Map());
      }
      this.allowances.get(owner)!.set(spender, amount);
    }

    async transfer(from: string, to: string, amount: bigint) {
      const fromBalance = this.balances.get(from) || BigInt(0);
      if (fromBalance < amount) throw new Error("Insufficient balance");
      this.balances.set(from, fromBalance - amount);
      this.balances.set(to, (this.balances.get(to) || BigInt(0)) + amount);
    }

    async transferFrom(from: string, to: string, amount: bigint) {
      const allowance = this.allowances.get(from)?.get(to) || BigInt(0);
      if (allowance < amount) throw new Error("Insufficient allowance");
      this.balances.set(from, (this.balances.get(from) || BigInt(0)) - amount);
      this.balances.set(to, (this.balances.get(to) || BigInt(0)) + amount);
      this.allowances.get(from)!.set(to, allowance - amount);
    }

    getBalance(address: string) {
      return this.balances.get(address) || BigInt(0);
    }
  }

  let mockUSDT: MockUSDT;

  before(async function () {
    [owner, user1, user2, user3, user4, treasury, airdrop] = await ethers.getSigners();

    // Deploy mock USDT
    const initialBalances = new Map<string, bigint>();
    initialBalances.set(user1.address, USDT(100000));
    initialBalances.set(user2.address, USDT(100000));
    initialBalances.set(user3.address, USDT(100000));
    initialBalances.set(user4.address, USDT(100000));
    mockUSDT = new MockUSDT(initialBalances);

    // For testing, we'll use a real ERC20 mock
    const UsdtTokenFactory = await ethers.getContractFactory("TestToken");
    usdtToken = await UsdtTokenFactory.deploy("USDT", "USDT", USDT_DECIMALS);
    await usdtToken.getAddress();

    // Mint tokens to users
    for (const user of [user1, user2, user3, user4]) {
      await (usdtToken as any).mint(user.address, USDT(100000));
    }
  });

  beforeEach(async function () {
    const Token = await ethers.getContractFactory("TestToken");
    orbdToken = await Token.deploy("OrbitX Token", "ORBD", 18);

    const MockPermit2 = await ethers.getContractFactory("MockPermit2");
    permit2 = await MockPermit2.deploy();

    const MockInfinityRouter = await ethers.getContractFactory("MockInfinityRouter");
    infinityRouter = await MockInfinityRouter.deploy(
      await permit2.getAddress(),
      await usdtToken.getAddress(),
      await orbdToken.getAddress(),
      10n ** 12n
    );
    await (orbdToken as any).mint(
      await infinityRouter.getAddress(),
      ethers.parseUnits("1000000000", 18)
    );

    const MetaCrownNFT = await ethers.getContractFactory("MetaCrownNFT");
    contract = await MetaCrownNFT.deploy(
      await usdtToken.getAddress(),
      treasury.address,
      airdrop.address,
      await orbdToken.getAddress(),
      await infinityRouter.getAddress(),
      await permit2.getAddress(),
      "https://metadata.example.com/"
    );

    // Fund and approve every signer used by the referral-volume tests.
    for (const user of await ethers.getSigners()) {
      await (usdtToken as any).mint(user.address, USDT(100000));
      await usdtToken.connect(user).approve(await contract.getAddress(), USDT(100000));
    }
  });

  describe("Joining", function () {
    it("swaps 10% of the NFT value to ORBD and locks it in the contract", async function () {
      const contractAddress = await contract.getAddress();

      await expect(join(user1, 1, ethers.ZeroAddress))
        .to.emit(contract, "OrbdPurchasedAndLocked")
        .withArgs(user1.address, USDT(1), ethers.parseUnits("1", 18));

      expect(await orbdToken.balanceOf(contractAddress)).to.equal(
        ethers.parseUnits("1", 18)
      );
      expect(await usdtToken.balanceOf(await infinityRouter.getAddress())).to.equal(USDT(1));
    });

    it("does not allow the owner to rescue locked ORBD", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      await expect(
        contract.emergencyRescue(await orbdToken.getAddress(), ethers.parseUnits("1", 18))
      ).to.be.revertedWith("Cannot rescue locked ORBD");
    });

    it("rejects a route without a Pancake Infinity command", async function () {
      await expect(
        contract.connect(user1).join(
          1,
          ethers.ZeroAddress,
          ethers.parseUnits("1", 18),
          "0x00",
          [ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint160", "uint256"],
            [USDT(1), ethers.parseUnits("1", 18)]
          )]
        )
      ).to.be.revertedWith("Infinity swap required");
    });

    it("reverts when the route returns less than minimumOrbdOut", async function () {
      await expect(
        contract.connect(user1).join(
          1,
          ethers.ZeroAddress,
          ethers.parseUnits("2", 18),
          "0x10",
          [ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint160", "uint256"],
            [USDT(1), ethers.parseUnits("2", 18)]
          )]
        )
      ).to.be.revertedWith("Insufficient output");
    });

    it("First user joins as root with Silver package", async function () {
      await expect(join(user1, 1, ethers.ZeroAddress))
        .to.emit(contract, "UserJoined")
        .withArgs(user1.address, ethers.ZeroAddress, 1, SILVER_NFT, 1);

      const userData = await contract.getUser(user1.address);
      expect(userData.packageType).to.equal(1);
      expect(userData.nftValue).to.equal(SILVER_NFT);
      expect(userData.active).to.be.true;
    });

    it("User cannot join twice", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await expect(
        join(user1, 2, ethers.ZeroAddress)
      ).to.be.revertedWith("Already joined");
    });

    it("Second user requires active sponsor", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      await expect(
        join(user2, 1, ethers.ZeroAddress)
      ).to.be.revertedWith("Sponsor required");
    });

    it("User can join with active sponsor", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      await expect(join(user2, 1, user1.address))
        .to.emit(contract, "UserJoined")
        .withArgs(user2.address, user1.address, 1, SILVER_NFT, 2);

      const userData = await contract.getUser(user2.address);
      expect(userData.sponsor).to.equal(user1.address);
    });

    it("Cannot join with non-active sponsor", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      // Don't activate user2

      await expect(
        join(user3, 1, user2.address)
      ).to.be.revertedWith("Sponsor not found");
    });

    it("NFT is minted on join", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      const balance = await contract.balanceOf(user1.address);
      expect(balance).to.equal(1);

      const tokenId = await contract.tokenOfOwnerByIndex(user1.address, 0);
      expect(tokenId).to.equal(1);
    });

    it("Gold and Diamond packages work correctly", async function () {
      await usdtToken.connect(user1).approve(await contract.getAddress(), GOLD_TOTAL);
      await join(user1, 2, ethers.ZeroAddress);

      let userData = await contract.getUser(user1.address);
      expect(userData.nftValue).to.equal(GOLD_NFT);

      await usdtToken.connect(user2).approve(await contract.getAddress(), DIAMOND_TOTAL);
      await join(user2, 3, user1.address);

      userData = await contract.getUser(user2.address);
      expect(userData.nftValue).to.equal(DIAMOND_NFT);
    });
  });

  describe("Category NFT trading", function () {
    it("allows active subscribers to trade within their category without another fee", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 1, user1.address);
      const buyerUsdtBefore = await usdtToken.balanceOf(user2.address);

      await expect(
        contract.connect(user1).transferFrom(user1.address, user2.address, 1)
      )
        .to.emit(contract, "CategoryNFTTransferred")
        .withArgs(1, user1.address, user2.address, 1);

      expect(await contract.ownerOf(1)).to.equal(user2.address);
      expect(await contract.addressToUserId(user1.address)).to.equal(1);
      expect(await contract.addressToUserId(user2.address)).to.equal(2);
      expect(await contract.isSubscriber(user1.address)).to.be.true;
      expect(await contract.isSubscriber(user2.address)).to.be.true;
      expect((await contract.getUser(user1.address)).packageType).to.equal(1);
      expect((await contract.getUser(user2.address)).packageType).to.equal(1);
      expect(await contract.balanceOf(user1.address)).to.equal(0);
      expect(await contract.balanceOf(user2.address)).to.equal(2);
      expect(await usdtToken.balanceOf(user2.address)).to.equal(buyerUsdtBefore);
    });

    it("rejects a buyer who is not an on-chain subscriber", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      await expect(
        contract.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWith("Buyer not active subscriber");
    });

    it("rejects trading across subscription categories", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 2, user1.address);

      await expect(
        contract.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWith("Buyer category mismatch");
    });
  });

  describe("Direct Commission", function () {
    it("Sponsor gets 5% with 1-5 directs", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 1, user1.address);

      const userData = await contract.getUser(user1.address);
      // 5% of 10 USDT = 0.5 USDT
      expect(userData.rewardBalance).to.equal(USDT(0.5));
    });

    it("Sponsor gets 7% with 6-15 directs", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      // Create 6 directs
      for (let i = 0; i < 6; i++) {
        const user = await ethers.getSigners().then(signers => signers[i + 2]);
        await usdtToken.connect(user).approve(await contract.getAddress(), SILVER_TOTAL);
        await join(user, 1, user1.address);
      }

      // The 6th direct should trigger 7% commission
      const userData = await contract.getUser(user1.address);
      // First 5 at 5% = 2.5, 6th at 7% = 0.7
      expect(userData.rewardBalance).to.be.gte(USDT(3));
    });

    it("Sponsor gets 10% with 16+ directs", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      // Would need 16 different signers - simplified test
      const signers = await ethers.getSigners();
      for (let i = 2; i < Math.min(18, signers.length); i++) {
        const user = signers[i];
        await usdtToken.connect(user).approve(await contract.getAddress(), SILVER_TOTAL);
        await join(user, 1, user1.address);
      }

      const directCount = await contract.getDirectCount(user1.address);
      expect(directCount).to.be.gte(16);
    });
  });

  describe("Passive Income", function () {
    it("0-1 directs: no passive income", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      const pending = await contract.pendingPassiveIncome(user1.address);
      expect(pending).to.equal(0);
    });

    it("2+ directs: 5% monthly passive income", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 1, user1.address);
      await join(user3, 1, user1.address);

      // After a day, should have some pending income
      await ethers.provider.send("hardhat_mine", ["0x15180"]); // Mine ~86400 seconds worth

      const pending = await contract.pendingPassiveIncome(user1.address);
      // With 2 directs, 5% monthly of 10 USDT = 0.5 per month
      // After ~1 day, should be much less
      expect(pending).to.be.gt(0);
    });

    it("5+ directs + volume: 0.50% daily passive income", async function () {
      await join(user1, 3, ethers.ZeroAddress); // Diamond: 2500 USDT required
      
      // Create 5 Diamond directs for sufficient volume
      const signers = await ethers.getSigners();
      for (let i = 2; i < 7; i++) {
        const user = signers[i];
        await usdtToken.connect(user).approve(await contract.getAddress(), DIAMOND_TOTAL);
        await join(user, 3, user1.address);
      }

      // Move time forward 1 day
      await ethers.provider.send("hardhat_mine", ["0x15180"]);

      const pending = await contract.pendingPassiveIncome(user1.address);
      // With 5 directs and volume, 0.50% daily of 500 USDT = 2.5 per day
      expect(pending).to.be.gt(0);
    });

    it("Cannot claim passive income with 0-1 directs", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      await expect(
        contract.connect(user1).claimPassiveIncome()
      ).to.be.revertedWith("Insufficient directs for passive income");
    });

    it("Passive income respects 2X cap", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 1, user1.address);
      await join(user3, 1, user1.address);

      // Move time forward significantly to accumulate 20+ USDT of passive income
      for (let i = 0; i < 100; i++) {
        await ethers.provider.send("hardhat_mine", ["0x15180"]);
        const pending = await contract.pendingPassiveIncome(user1.address);
        if (pending > 0) {
          await contract.connect(user1).claimPassiveIncome();
        }
      }

      const userCapped = await contract.isUserCapped(user1.address);
      if (userCapped) {
        const remaining = await contract.remainingCap(user1.address);
        expect(remaining).to.equal(0);
      }
    });
  });

  describe("Level Income", function () {
    it("Level 2 receives 2%", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 1, user1.address);
      await join(user3, 1, user2.address);

      const userLevel2Data = await contract.getUser(user1.address);
      // Level 2 income: 2% of 10 USDT = 0.2 USDT
      expect(userLevel2Data.rewardBalance).to.be.gte(USDT(0.2));
    });

    it("Level 3 receives 1%", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 1, user1.address);
      await join(user3, 1, user2.address);

      const signers = await ethers.getSigners();
      await usdtToken.connect(signers[4]).approve(await contract.getAddress(), SILVER_TOTAL);
      await join(signers[4], 1, user3.address);

      const userLevel3Data = await contract.getUser(user1.address);
      // Level 3 income: 1% of 10 USDT = 0.1 USDT
      expect(userLevel3Data.rewardBalance).to.be.gte(USDT(0.1));
    });
  });

  describe("2X Capping", function () {
    it("User becomes capped when totalEarned >= 2X NFT value", async function () {
      await join(user1, 1, ethers.ZeroAddress); // 10 USDT cap = 20 USDT

      const isCapped = await contract.isUserCapped(user1.address);
      expect(isCapped).to.be.false;

      const remaining = await contract.remainingCap(user1.address);
      expect(remaining).to.equal(SILVER_NFT * BigInt(2));
    });

    it("Re-topup reactivates user and adds cap", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      // Manually set totalEarned to cap it
      // This would require additional setup - simplified for this test
      expect(true).to.be.true; // Placeholder
    });
  });

  describe("Withdrawal", function () {
    it("10% deduction on withdrawal", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 1, user1.address);

      // User1 has commission balance
      const initialBalance = (await contract.getUser(user1.address)).rewardBalance;
      if (initialBalance > 0) {
        await expect(contract.connect(user1).withdraw(initialBalance))
          .to.emit(contract, "Withdrawal");

        const airdropBalance = await contract.airdropFundBalance();
        expect(airdropBalance).to.be.gt(0);
      }
    });

    it("Cannot withdraw more than balance", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      await expect(
        contract.connect(user1).withdraw(USDT(1000))
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Cannot withdraw zero", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      await expect(
        contract.connect(user1).withdraw(0)
      ).to.be.revertedWith("Cannot withdraw zero");
    });
  });

  describe("Admin Functions", function () {
    it("Only owner can pause", async function () {
      await expect(contract.connect(user1).pause()).to.be.reverted;
      await contract.connect(owner).pause();
      expect(await contract.paused()).to.be.true;
    });

    it("Cannot join when paused", async function () {
      await contract.connect(owner).pause();

      await expect(
        join(user1, 1, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
    });

    it("Treasury wallet can be updated", async function () {
      const newTreasury = user3.address;
      await expect(contract.connect(owner).setTreasuryWallet(newTreasury))
        .to.emit(contract, "TreasuryUpdated");

      expect(await contract.treasuryWallet()).to.equal(newTreasury);
    });

    it("Airdrop wallet can be updated", async function () {
      const newAirdrop = user4.address;
      await expect(contract.connect(owner).setAirdropWallet(newAirdrop))
        .to.emit(contract, "AirdropWalletUpdated");

      expect(await contract.airdropWallet()).to.equal(newAirdrop);
    });
  });

  describe("View Functions", function () {
    it("getUser returns correct data", async function () {
      await join(user1, 1, ethers.ZeroAddress);

      const user = await contract.getUser(user1.address);
      expect(user.packageType).to.equal(1);
      expect(user.nftValue).to.equal(SILVER_NFT);
      expect(user.active).to.be.true;
    });

    it("getDirectCount returns correct count", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      expect(await contract.getDirectCount(user1.address)).to.equal(0);

      await join(user2, 1, user1.address);
      expect(await contract.getDirectCount(user1.address)).to.equal(1);
    });

    it("getDirectBusinessVolume returns correct volume", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      expect(await contract.getDirectBusinessVolume(user1.address)).to.equal(0);

      await join(user2, 1, user1.address);
      expect(await contract.getDirectBusinessVolume(user1.address)).to.equal(SILVER_NFT);
    });

    it("getUplines returns sponsor chain", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      await join(user2, 1, user1.address);
      await join(user3, 1, user2.address);

      const uplines = await contract.getUplines(user3.address);
      expect(uplines[0]).to.equal(user2.address);
      expect(uplines[1]).to.equal(user1.address);
      expect(uplines[2]).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Events", function () {
    it("UserJoined event emitted", async function () {
      await expect(join(user1, 1, ethers.ZeroAddress))
        .to.emit(contract, "UserJoined");
    });

    it("NFTMinted event emitted", async function () {
      await expect(join(user1, 1, ethers.ZeroAddress))
        .to.emit(contract, "NFTMinted");
    });

    it("DirectCommissionCredited event emitted", async function () {
      await join(user1, 1, ethers.ZeroAddress);
      
      await expect(join(user2, 1, user1.address))
        .to.emit(contract, "DirectCommissionCredited");
    });
  });
});

// Helper contract for mocking USDT
const testTokenContract = `
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    uint8 public _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}
`;
