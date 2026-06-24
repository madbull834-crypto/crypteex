import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("MetaCrownNFTStakeEcosystem", function () {
  const U = (value: string) => ethers.parseUnits(value, 6);
  const ZERO = ethers.ZeroAddress;
  const SILVER = 1;
  const GOLD = 2;
  const DIAMOND = 3;
  const WEEK = 7 * 24 * 60 * 60;
  const MONTH = 30 * 24 * 60 * 60;

  async function deployFixture() {
    const [owner, treasury, airdrop, root, sponsor, user, u2, u3, ...many] =
      await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt: any = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    const Ecosystem = await ethers.getContractFactory("MetaCrownNFTStakeEcosystem");
    const ecosystem: any = await Ecosystem.deploy(
      await usdt.getAddress(),
      treasury.address,
      airdrop.address,
      "ipfs://base/"
    );
    await ecosystem.waitForDeployment();

    const Marketplace = await ethers.getContractFactory("MetaCrownNFTMarketplace");
    const marketplace: any = await Marketplace.deploy(await usdt.getAddress(), await ecosystem.getAddress());
    await marketplace.waitForDeployment();
    await ecosystem.connect(owner).updateNFTMarketplace(await marketplace.getAddress());

    const accounts = [owner, treasury, airdrop, root, sponsor, user, u2, u3, ...many];
    for (const account of accounts) {
      await usdt.mint(account.address, U("1000000"));
      await usdt.connect(account).approve(await ecosystem.getAddress(), U("1000000"));
      await usdt.connect(account).approve(await marketplace.getAddress(), U("1000000"));
    }
    await ecosystem.connect(owner).fundRewardPool(U("500000"));
    return { owner, treasury, airdrop, root, sponsor, user, u2, u3, many, usdt, ecosystem, marketplace };
  }

  async function mintListedNFT(ecosystem: any, owner: any, packageId: number) {
    const tx = await ecosystem.connect(owner).adminMintFixedNFTForSale(packageId);
    const receipt = await tx.wait();
    for (const log of receipt.logs) {
      try {
        const parsed = ecosystem.interface.parseLog(log);
        if (parsed?.name === "NFTListed") return parsed.args.tokenId;
      } catch {
        // Ignore logs from other contracts.
      }
    }
    throw new Error("NFTListed event not found");
  }

  async function buyFixedNFT(ecosystem: any, owner: any, buyer: any, subscription: bigint, packageId: number, sponsor = ZERO) {
    const tokenId = await mintListedNFT(ecosystem, owner, packageId);
    expect(subscription).to.equal((await ecosystem.fixedPackages(packageId)).platformFee);
    await ecosystem.connect(buyer).purchaseSubscription(packageId, sponsor);
    await ecosystem.connect(buyer).buyListedFixedNFT(tokenId);
    return tokenId;
  }

  it("deploys with correct defaults", async function () {
    const { ecosystem, owner, treasury } = await deployFixture();
    expect(await ecosystem.owner()).to.equal(owner.address);
    expect(await ecosystem.treasuryWallet()).to.equal(treasury.address);
    expect(await ecosystem.withdrawalDeductionBps()).to.equal(1000);
    expect((await ecosystem.fixedPackages(SILVER)).nftValue).to.equal(U("10"));
    expect((await ecosystem.stakePackages(GOLD)).platformFee).to.equal(U("100"));
    expect(await ecosystem.STAKING_TERM()).to.equal(365 * 24 * 60 * 60);
    expect((await ecosystem.stakePackages(SILVER)).rewardRateBps).to.equal(400);
  });

  it("joins fixed Meta Crown packages and splits platform fees", async function () {
    const { ecosystem, owner, root } = await deployFixture();
    const tokenId = await mintListedNFT(ecosystem, owner, SILVER);
    await expect(ecosystem.connect(root).purchaseSubscription(SILVER, ZERO))
      .to.emit(ecosystem, "Subscribed")
      .and.to.emit(ecosystem, "WeeklyPoolFunded");
    await expect(ecosystem.connect(root).buyListedFixedNFT(tokenId)).to.emit(ecosystem, "NFTSold");

    const user = await ecosystem.getUser(root.address);
    expect(user.positionType).to.equal(1);
    expect(user.packageId).to.equal(SILVER);
    expect(await ecosystem.ownerOf(user.tokenId)).to.equal(root.address);
    expect(await ecosystem.totalNFTValueBalance()).to.equal(U("10"));
    expect(await ecosystem.platformFeeBalance()).to.equal(0);
  });

  it("lets admin mint listed NFTs and buyers relist immediately", async function () {
    const { ecosystem, marketplace, owner, root, user, usdt } = await deployFixture();
    const tokenId = await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);

    await expect(marketplace.connect(root).list(tokenId, U("20")))
      .to.emit(marketplace, "Listed")
      .withArgs(tokenId, root.address, U("20"));

    const sellerBefore = await usdt.balanceOf(root.address);
    await ecosystem.connect(user).purchaseSubscription(SILVER, ZERO);
    await expect(marketplace.connect(user).buy(tokenId))
      .to.emit(marketplace, "Purchased")
      .withArgs(tokenId, root.address, user.address, U("20"));

    expect(await ecosystem.ownerOf(tokenId)).to.equal(user.address);
    expect((await ecosystem.getUser(root.address)).active).to.equal(false);
    expect((await ecosystem.getUser(user.address)).active).to.equal(true);
    expect((await usdt.balanceOf(root.address)) - sellerBefore).to.equal(U("20"));
    expect(await ecosystem.balanceOf(root.address)).to.equal(2);
    expect(await ecosystem.ownerOf(2)).to.equal(root.address);
    expect(await ecosystem.ownerOf(3)).to.equal(root.address);
  });

  it("mints two same-category replacement NFTs to the seller after a 2X marketplace sale", async function () {
    const { ecosystem, marketplace, owner, root, user, u2 } = await deployFixture();
    const tokenId = await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);

    await marketplace.connect(root).list(tokenId, U("20"));
    await ecosystem.connect(user).purchaseSubscription(SILVER, ZERO);
    await marketplace.connect(user).buy(tokenId);

    expect(await ecosystem.balanceOf(root.address)).to.equal(2);
    expect(await ecosystem.ownerOf(2)).to.equal(root.address);
    expect(await ecosystem.ownerOf(3)).to.equal(root.address);

    await marketplace.connect(root).list(2, U("20"));
    await ecosystem.connect(u2).purchaseSubscription(SILVER, ZERO);
    await marketplace.connect(u2).buy(2);

    expect(await ecosystem.ownerOf(2)).to.equal(u2.address);
    expect((await ecosystem.getUser(u2.address)).active).to.equal(true);
    expect(await ecosystem.balanceOf(root.address)).to.equal(3);
  });

  it("requires a permanent category subscription before an NFT purchase", async function () {
    const { ecosystem, owner, root, sponsor, user } = await deployFixture();
    const goldToken = await mintListedNFT(ecosystem, owner, GOLD);
    await expect(ecosystem.connect(root).buyListedFixedNFT(goldToken)).to.be.reverted;
    await ecosystem.connect(root).purchaseSubscription(SILVER, ZERO);
    await expect(ecosystem.connect(root).buyListedFixedNFT(goldToken)).to.be.reverted;
    expect(await ecosystem.subscriptions(root.address, SILVER)).to.equal(true);

    await ecosystem.connect(root).purchaseSubscription(GOLD, ZERO);
    await ecosystem.connect(root).buyListedFixedNFT(goldToken);
    await buyFixedNFT(ecosystem, owner, sponsor, U("10"), GOLD, root.address);
    await buyFixedNFT(ecosystem, owner, user, U("50"), DIAMOND, sponsor.address);

    expect((await ecosystem.getUser(root.address)).nftValue).to.equal(U("100"));
    expect((await ecosystem.getUser(sponsor.address)).nftValue).to.equal(U("100"));
    expect((await ecosystem.getUser(user.address)).nftValue).to.equal(U("500"));
  });

  it("joins stake packages by amount and prevents duplicate active positions", async function () {
    const { ecosystem, owner, user } = await deployFixture();
    await ecosystem.connect(user).joinStakePackage(U("7000"), 1, ZERO);
    const record = await ecosystem.getUser(user.address);
    expect(record.positionType).to.equal(2);
    expect(record.packageId).to.equal(GOLD);
    expect(await ecosystem.totalStakeBalance()).to.equal(U("7000"));
    await ecosystem.connect(user).purchaseSubscription(SILVER, ZERO);
    await expect(ecosystem.connect(user).buyListedFixedNFT(await mintListedNFT(ecosystem, owner, SILVER))).to.be.reverted;
    await expect(ecosystem.connect(user).joinStakePackage(U("999"), 1, ZERO)).to.be.reverted;
  });

  it("requires active sponsors and tracks direct/team business", async function () {
    const { ecosystem, owner, root, sponsor, user } = await deployFixture();
    await expect(ecosystem.connect(user).purchaseSubscription(SILVER, sponsor.address)).to.be.reverted;

    await buyFixedNFT(ecosystem, owner, root, U("50"), DIAMOND, ZERO);
    await buyFixedNFT(ecosystem, owner, sponsor, U("10"), GOLD, root.address);
    await ecosystem.connect(user).joinStakePackage(U("2000"), 1, sponsor.address);

    expect(await ecosystem.getDirectCount(sponsor.address)).to.equal(1);
    expect(await ecosystem.getDirectBusiness(sponsor.address)).to.equal(U("2000"));
    expect(await ecosystem.getTeamBusiness(root.address)).to.equal(U("2100"));
    expect(await ecosystem.userRewardBalance(sponsor.address)).to.equal(U("100"));
  });

  it("credits 5%, 7%, and 10% level-one direct commissions for fixed packages", async function () {
    const { ecosystem, owner, root, many } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("50"), DIAMOND, ZERO);

    for (let i = 0; i < 6; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("5"), SILVER, root.address);
    }
    const afterSix = await ecosystem.userRewardBalance(root.address);
    expect(afterSix).to.equal(U("3.2"));

    for (let i = 6; i < 16; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("5"), SILVER, root.address);
    }
    const afterSixteen = await ecosystem.userRewardBalance(root.address);
    expect(afterSixteen - afterSix).to.equal(U("7.3"));

    await buyFixedNFT(ecosystem, owner, many[16], U("5"), SILVER, root.address);
    expect((await ecosystem.userRewardBalance(root.address)) - afterSixteen).to.equal(U("1"));
  });

  it("credits three-level income without double-paying level one", async function () {
    const { ecosystem, root, sponsor, user, u2 } = await deployFixture();
    await ecosystem.connect(root).joinStakePackage(U("1000"), 1, ZERO);
    await ecosystem.connect(sponsor).joinStakePackage(U("1000"), 1, root.address);
    await ecosystem.connect(user).joinStakePackage(U("1000"), 1, sponsor.address);
    await ecosystem.connect(u2).joinStakePackage(U("1000"), 1, user.address);

    expect(await ecosystem.userRewardBalance(user.address)).to.equal(U("50"));
    expect(await ecosystem.userRewardBalance(sponsor.address)).to.equal(U("70"));
    expect(await ecosystem.userRewardBalance(root.address)).to.equal(U("80"));
  });

  it("accrues passive income for fixed package users", async function () {
    const { ecosystem, owner, root, many } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("50"), DIAMOND, ZERO);
    await buyFixedNFT(ecosystem, owner, many[0], U("5"), SILVER, root.address);
    await time.increase(MONTH);
    expect(await ecosystem.pendingPassiveIncome(root.address)).to.equal(0);

    await buyFixedNFT(ecosystem, owner, many[1], U("5"), SILVER, root.address);
    await time.increase(MONTH);
    expect(await ecosystem.pendingPassiveIncome(root.address)).to.equal(U("25"));

    await ecosystem.connect(root).claimPassiveIncome();
    expect(await ecosystem.userRewardBalance(root.address)).to.be.gt(0);
  });

  it("uses daily passive after five directs and required volume", async function () {
    const { ecosystem, owner, root, many } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);
    for (let i = 0; i < 5; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("5"), SILVER, root.address);
    }
    await time.increase(2 * 24 * 60 * 60);
    expect(await ecosystem.pendingPassiveIncome(root.address)).to.equal(U("0.1"));
  });

  it("claims package ROI every 30 days, applies boost, and prevents early repeat", async function () {
    const { ecosystem, root, sponsor, user } = await deployFixture();
    await ecosystem.connect(root).joinStakePackage(U("1000"), 1, ZERO);
    await ecosystem.connect(sponsor).joinStakePackage(U("4000"), 1, root.address);
    expect(await ecosystem.getUserRewardBoost(root.address)).to.equal(100);

    await time.increase(30 * 24 * 60 * 60);
    // Silver monthly ROI 4% + 1% team-business boost = 5%.
    expect(await ecosystem.pendingROIReward(root.address)).to.equal(U("50"));
    await ecosystem.connect(root).claimROIReward();
    await expect(ecosystem.connect(root).claimROIReward()).to.be.reverted;

    await time.increase(30 * 24 * 60 * 60);
    expect(await ecosystem.pendingROIReward(root.address)).to.equal(U("50"));
    await ecosystem.connect(root).claimROIReward();
    expect(await ecosystem.roiClaimsCount(root.address)).to.equal(2);

    await ecosystem.connect(user).joinStakePackage(U("40000"), 1, sponsor.address);
    expect(await ecosystem.getUserRewardBoost(sponsor.address)).to.equal(200);
  });

  it("accumulates missed monthly ROI periods and caps the one-year plan at 12", async function () {
    const { ecosystem, root } = await deployFixture();
    await ecosystem.connect(root).joinStakePackage(U("1000"), 1, ZERO);

    await time.increase(90 * 24 * 60 * 60);
    expect(await ecosystem.pendingROIReward(root.address)).to.equal(U("120"));
    await ecosystem.connect(root).claimROIReward();
    expect(await ecosystem.roiClaimsCount(root.address)).to.equal(3);

    await time.increase(365 * 24 * 60 * 60);
    expect(await ecosystem.pendingROIReward(root.address)).to.equal(U("360"));
    await ecosystem.connect(root).claimROIReward();
    expect(await ecosystem.roiClaimsCount(root.address)).to.equal(12);
    expect(await ecosystem.pendingROIReward(root.address)).to.equal(0);
  });

  it("enforces monthly claim limit", async function () {
    const { ecosystem, owner, root, many } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("50"), DIAMOND, ZERO);
    for (let i = 0; i < 2; i++) await buyFixedNFT(ecosystem, owner, many[i], U("5"), SILVER, root.address);
    await time.increase(MONTH);
    await ecosystem.connect(root).claimPassiveIncome();
    await time.increase(MONTH);
    await ecosystem.connect(root).claimPassiveIncome();
    await time.increase(1);
    await expect(ecosystem.connect(root).claimPassiveIncome()).to.be.reverted;
    await time.increase(MONTH);
    await expect(ecosystem.connect(root).claimPassiveIncome()).to.not.be.reverted;
  });

  it("qualifies and distributes weekly leadership pool", async function () {
    const { ecosystem, owner, root, many } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("50"), DIAMOND, ZERO);
    await ecosystem.connect(many[0]).joinStakePackage(U("2500"), 1, root.address);
    const weekId = (await time.latest()) / WEEK;
    await ecosystem.closeWeeklyPool(Math.floor(weekId));
    await ecosystem.connect(root).claimWeeklyLeadershipPool(Math.floor(weekId));
    await expect(ecosystem.connect(root).claimWeeklyLeadershipPool(Math.floor(weekId))).to.be.reverted;
  });

  it("qualifies and distributes monthly royalty pool", async function () {
    const { ecosystem, owner, root, many } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);
    for (let i = 0; i < 25; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("5"), SILVER, root.address);
    }
    expect(await ecosystem.isRoyaltyMember(root.address)).to.equal(true);
    const monthId = Math.floor((await time.latest()) / MONTH);
    await ecosystem.closeMonthlyRoyaltyPool(monthId);
    await ecosystem.connect(root).claimMonthlyRoyalty(monthId);
    await expect(ecosystem.connect(root).claimMonthlyRoyalty(monthId)).to.be.reverted;
  });

  it("caps earnings at 2X and reTopup restores earning status", async function () {
    const { ecosystem, owner, root, many } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);
    for (let i = 0; i < 25; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("50"), DIAMOND, root.address);
    }
    expect(await ecosystem.isUserCapped(root.address)).to.equal(true);
    const beforeCap = await ecosystem.totalCap(root.address);
    await ecosystem.connect(root).reTopup();
    expect(await ecosystem.totalCap(root.address)).to.equal(beforeCap + U("20"));
    expect((await ecosystem.getUser(root.address)).earningActive).to.equal(true);
  });

  it("withdraws rewards with 10% deduction", async function () {
    const { ecosystem, usdt, root, user } = await deployFixture();
    await ecosystem.connect(root).joinStakePackage(U("1000"), 1, ZERO);
    await ecosystem.connect(user).joinStakePackage(U("1000"), 1, root.address);
    const before = await usdt.balanceOf(root.address);
    await ecosystem.connect(root).withdrawRewards(U("50"));
    expect((await usdt.balanceOf(root.address)) - before).to.equal(U("45"));
    expect(await ecosystem.airdropFundBalance()).to.equal(U("5"));
    await expect(ecosystem.connect(root).withdrawRewards(U("1"))).to.be.reverted;
  });

  it("exits stake positions with stability deductions and burns NFT", async function () {
    const { ecosystem, usdt, user } = await deployFixture();
    await ecosystem.connect(user).joinStakePackage(U("2000"), 1, ZERO);
    const tokenId = await ecosystem.tokenOfUser(user.address);
    const before = await usdt.balanceOf(user.address);
    await ecosystem.connect(user).exitStake();
    expect((await usdt.balanceOf(user.address)) - before).to.equal(U("1500"));
    await expect(ecosystem.ownerOf(tokenId)).to.be.reverted;
    await expect(ecosystem.connect(user).exitStake()).to.be.reverted;
  });

  it("applies 15% exit penalty before 180 days and 5% from day 180 onward", async function () {
    const { ecosystem, usdt, user, u2 } = await deployFixture();

    await ecosystem.connect(user).joinStakePackage(U("2000"), 1, ZERO);
    await time.increase(100 * 24 * 60 * 60);
    const userBefore = await usdt.balanceOf(user.address);
    await ecosystem.connect(user).exitStake();
    expect((await usdt.balanceOf(user.address)) - userBefore).to.equal(U("1700"));

    await ecosystem.connect(u2).joinStakePackage(U("2000"), 1, ZERO);
    await time.increase(180 * 24 * 60 * 60);
    const u2Before = await usdt.balanceOf(u2.address);
    await ecosystem.connect(u2).exitStake();
    expect((await usdt.balanceOf(u2.address)) - u2Before).to.equal(U("1900"));
  });

  it("restricts admin withdrawals and USDT rescue", async function () {
    const { ecosystem, treasury, owner, root, usdt } = await deployFixture();
    await ecosystem.connect(root).joinStakePackage(U("1000"), 1, ZERO);
    await expect(ecosystem.connect(root).pauseContract()).to.be.reverted;
    await ecosystem.connect(owner).pauseContract();
    await ecosystem.connect(owner).unpauseContract();

    await ecosystem.connect(owner).withdrawPlatformFees(U("50"));
    expect(await usdt.balanceOf(treasury.address)).to.be.gt(U("1000000"));
    await expect(ecosystem.connect(owner).emergencyRescueToken(await usdt.getAddress(), owner.address, 1)).to.be.reverted;
  });
});
