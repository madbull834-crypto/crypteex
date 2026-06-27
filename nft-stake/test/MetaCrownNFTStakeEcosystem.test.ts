import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("MetaCrownNFTStakeEcosystem", function () {
  const U = (value: string) => ethers.parseUnits(value, 6);
  const ZERO = ethers.ZeroAddress;
  const SILVER = 1;
  const GOLD = 2;
  const DIAMOND = 3;
  const WEEK = 7 * 24 * 60 * 60;
  const MONTH = 30 * 24 * 60 * 60;

  async function deployEcosystemProxy(usdtAddress: string, treasury: string, airdrop: string, orbdSwapLocker: string) {
    const Ecosystem = await ethers.getContractFactory("MetaCrownNFTStakeEcosystem");
    const ecosystem: any = await upgrades.deployProxy(Ecosystem, [], { initializer: false, kind: "transparent" });
    await ecosystem.waitForDeployment();

    const decimals = await (await ethers.getContractAt("MockUSDT", usdtAddress)).decimals();
    const unit = 10n ** BigInt(decimals);
    const RewardPools = await ethers.getContractFactory("MetaCrownRewardPools");
    const rewardPools: any = await upgrades.deployProxy(RewardPools, [], { initializer: false, kind: "transparent" });
    await rewardPools.waitForDeployment();
    await rewardPools.initialize(await ecosystem.getAddress(), unit);

    await ecosystem.initialize(usdtAddress, treasury, airdrop, "ipfs://base/", orbdSwapLocker, await rewardPools.getAddress());
    return { ecosystem, rewardPools };
  }

  async function deployMarketplaceProxy(usdtAddress: string, ecosystemAddress: string) {
    const Marketplace = await ethers.getContractFactory("MetaCrownNFTMarketplace");
    const marketplace: any = await upgrades.deployProxy(Marketplace, [usdtAddress, ecosystemAddress], { kind: "transparent" });
    await marketplace.waitForDeployment();
    return marketplace;
  }

  async function deployFixture() {
    const [owner, treasury, airdrop, root, sponsor, user, u2, u3, ...many] =
      await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt: any = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    const { ecosystem, rewardPools } = await deployEcosystemProxy(
      await usdt.getAddress(),
      treasury.address,
      airdrop.address,
      ZERO
    );

    const marketplace = await deployMarketplaceProxy(await usdt.getAddress(), await ecosystem.getAddress());
    await ecosystem.connect(owner).updateNFTMarketplace(await marketplace.getAddress());

    const accounts = [owner, treasury, airdrop, root, sponsor, user, u2, u3, ...many];
    for (const account of accounts) {
      await usdt.mint(account.address, U("1000000"));
      await usdt.connect(account).approve(await ecosystem.getAddress(), U("1000000"));
      await usdt.connect(account).approve(await marketplace.getAddress(), U("1000000"));
    }
    await ecosystem.connect(owner).fundRewardPool(U("500000"));
    return { owner, treasury, airdrop, root, sponsor, user, u2, u3, many, usdt, ecosystem, marketplace, rewardPools };
  }

  async function deployFixtureWithOrbdLocker() {
    const [owner, treasury, airdrop, root, sponsor, user] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt: any = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    const MockLocker = await ethers.getContractFactory("MockOrbdSwapLocker");
    const locker: any = await MockLocker.deploy(await usdt.getAddress());
    await locker.waitForDeployment();

    const { ecosystem, rewardPools } = await deployEcosystemProxy(
      await usdt.getAddress(),
      treasury.address,
      airdrop.address,
      await locker.getAddress()
    );

    for (const account of [owner, root, sponsor, user]) {
      await usdt.mint(account.address, U("1000000"));
      await usdt.connect(account).approve(await ecosystem.getAddress(), U("1000000"));
    }
    await ecosystem.connect(owner).fundRewardPool(U("500000"));
    return { owner, root, sponsor, user, usdt, ecosystem, locker, rewardPools };
  }

  async function mintListedNFT(ecosystem: any, owner: any, packageId: number) {
    const tx = await ecosystem.connect(owner).adminBulkMintFixedNFTsForSale(packageId, 1);
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

  async function rewardPoolsOf(ecosystem: any) {
    return ethers.getContractAt("MetaCrownRewardPools", await ecosystem.rewardPools());
  }

  async function buyFixedNFT(ecosystem: any, owner: any, buyer: any, subscription: bigint, packageId: number, sponsor = ZERO) {
    const tokenId = await mintListedNFT(ecosystem, owner, packageId);
    const rewardPools = await rewardPoolsOf(ecosystem);
    expect(subscription).to.equal((await rewardPools.fixedPackages(packageId)).platformFee);
    await ecosystem.connect(buyer).purchaseSubscription(packageId, sponsor);
    await ecosystem.connect(buyer).buyListedFixedNFT(tokenId, 0, "0x", []);
    return tokenId;
  }

  it("deploys with correct defaults", async function () {
    const { ecosystem, owner, treasury, rewardPools } = await deployFixture();
    expect(await ecosystem.owner()).to.equal(owner.address);
    expect(await ecosystem.treasuryWallet()).to.equal(treasury.address);
    expect(await ecosystem.withdrawalDeductionBps()).to.equal(1000);
    expect((await rewardPools.fixedPackages(SILVER)).nftValue).to.equal(U("10"));
    expect((await rewardPools.stakePackages(GOLD)).platformFee).to.equal(U("100"));
    expect((await rewardPools.stakePackages(SILVER)).rewardRateBps).to.equal(400);
  });

  it("scales all USDT package values from the payment token decimals", async function () {
    const [owner, treasury, airdrop] = await ethers.getSigners();
    const U18 = (value: string) => ethers.parseUnits(value, 18);

    const MockUSDT18 = await ethers.getContractFactory("MockUSDT18");
    const usdt18: any = await MockUSDT18.deploy();
    await usdt18.waitForDeployment();

    const { ecosystem, rewardPools } = await deployEcosystemProxy(
      await usdt18.getAddress(),
      treasury.address,
      airdrop.address,
      ZERO
    );

    expect((await rewardPools.fixedPackages(SILVER)).nftValue).to.equal(U18("10"));
    expect((await rewardPools.fixedPackages(GOLD)).nftValue).to.equal(U18("50"));
    expect((await rewardPools.fixedPackages(DIAMOND)).platformFee).to.equal(U18("50"));
    expect((await rewardPools.stakePackages(SILVER)).minStake).to.equal(U18("1000"));
    expect((await rewardPools.stakePackages(GOLD)).platformFee).to.equal(U18("100"));
    expect(await ecosystem.owner()).to.equal(owner.address);
  });

  it("joins fixed Meta Crown packages and splits platform fees", async function () {
    const { ecosystem, owner, root, rewardPools } = await deployFixture();
    const tokenId = await mintListedNFT(ecosystem, owner, SILVER);
    await expect(ecosystem.connect(root).purchaseSubscription(SILVER, ZERO))
      .to.emit(ecosystem, "Subscribed")
      .and.to.emit(rewardPools, "WeeklyPoolFunded");
    await expect(ecosystem.connect(root).buyListedFixedNFT(tokenId, 0, "0x", [])).to.emit(ecosystem, "NFTSold");

    const user = await ecosystem.getUser(root.address);
    expect(user.positionType).to.equal(1);
    expect(user.packageId).to.equal(SILVER);
    expect(await ecosystem.ownerOf(user.tokenId)).to.equal(root.address);
    expect(await ecosystem.totalNFTValueBalance()).to.equal(U("10"));
    expect(await ecosystem.platformFeeBalance()).to.equal(0);
  });

  it("routes package-specific platform NFT value to the ORBD swap locker", async function () {
    const { ecosystem, owner, root, sponsor, user, usdt, locker } = await deployFixtureWithOrbdLocker();
    const silverToken = await mintListedNFT(ecosystem, owner, SILVER);
    const goldToken = await mintListedNFT(ecosystem, owner, GOLD);
    const diamondToken = await mintListedNFT(ecosystem, owner, DIAMOND);

    await ecosystem.connect(root).purchaseSubscription(SILVER, ZERO);
    await expect(ecosystem.connect(root).buyListedFixedNFT(silverToken, 1, "0x10", []))
      .to.emit(locker, "MockSwapAndLock")
      .withArgs(root.address, U("0.5"), 1);

    await ecosystem.connect(sponsor).purchaseSubscription(GOLD, ZERO);
    await expect(ecosystem.connect(sponsor).buyListedFixedNFT(goldToken, 1, "0x10", []))
      .to.emit(locker, "MockSwapAndLock")
      .withArgs(sponsor.address, U("5"), 1);

    await ecosystem.connect(user).purchaseSubscription(DIAMOND, ZERO);
    await expect(ecosystem.connect(user).buyListedFixedNFT(diamondToken, 1, "0x10", []))
      .to.emit(locker, "MockSwapAndLock")
      .withArgs(user.address, U("10"), 1);

    expect(await locker.calls()).to.equal(3);
    expect(await locker.lastBuyer()).to.equal(user.address);
    expect(await locker.lastUsdtAmount()).to.equal(U("10"));
    expect(await usdt.balanceOf(await locker.getAddress())).to.equal(U("15.5"));
    expect(await ecosystem.totalNFTValueBalance()).to.equal(U("544.5"));
    expect(await ecosystem.ownerOf(silverToken)).to.equal(root.address);
    expect(await ecosystem.ownerOf(goldToken)).to.equal(sponsor.address);
    expect(await ecosystem.ownerOf(diamondToken)).to.equal(user.address);
  });

  it("requires non-zero ORBD minimum output when ORBD locker is enabled", async function () {
    const { ecosystem, owner, root } = await deployFixtureWithOrbdLocker();
    const tokenId = await mintListedNFT(ecosystem, owner, SILVER);
    await ecosystem.connect(root).purchaseSubscription(SILVER, ZERO);
    await expect(ecosystem.connect(root).buyListedFixedNFT(tokenId, 0, "0x10", [])).to.be.reverted;
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

  it("lets admin bulk mint listed fixed NFTs for sale", async function () {
    const { ecosystem, owner } = await deployFixture();
    const tx = await ecosystem.connect(owner).adminBulkMintFixedNFTsForSale(SILVER, 3);
    const receipt = await tx.wait();
    const listed = receipt.logs
      .map((log: any) => {
        try {
          return ecosystem.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((log: any) => log?.name === "NFTListed");

    expect(listed[0].args.tokenId).to.equal(1n);
    expect(listed[0].args.packageId).to.equal(SILVER);
    expect(listed[0].args.price).to.equal(U("10"));

    expect(await ecosystem.ownerOf(1)).to.equal(await ecosystem.getAddress());
    expect(await ecosystem.ownerOf(2)).to.equal(await ecosystem.getAddress());
    expect(await ecosystem.ownerOf(3)).to.equal(await ecosystem.getAddress());
    expect((await ecosystem.nftSales(1)).active).to.equal(true);
    expect((await ecosystem.nftSales(2)).packageId).to.equal(SILVER);
    expect((await ecosystem.nftSales(3)).packageId).to.equal(SILVER);
    await expect(ecosystem.connect(owner).adminBulkMintFixedNFTsForSale(SILVER, 0)).to.be.reverted;
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
    await expect(ecosystem.connect(root).buyListedFixedNFT(goldToken, 0, "0x", [])).to.be.reverted;
    await ecosystem.connect(root).purchaseSubscription(SILVER, ZERO);
    await expect(ecosystem.connect(root).buyListedFixedNFT(goldToken, 0, "0x", [])).to.be.reverted;
    expect(await ecosystem.subscriptions(root.address, SILVER)).to.equal(true);

    await ecosystem.connect(root).purchaseSubscription(GOLD, ZERO);
    await ecosystem.connect(root).buyListedFixedNFT(goldToken, 0, "0x", []);
    await buyFixedNFT(ecosystem, owner, sponsor, U("10"), GOLD, root.address);
    await buyFixedNFT(ecosystem, owner, user, U("50"), DIAMOND, sponsor.address);

    expect((await ecosystem.getUser(root.address)).nftValue).to.equal(U("50"));
    expect((await ecosystem.getUser(sponsor.address)).nftValue).to.equal(U("50"));
    expect((await ecosystem.getUser(user.address)).nftValue).to.equal(U("500"));
  });

  it("blocks direct ERC721 transfers even when the receiver is subscribed", async function () {
    const { ecosystem, owner, root, user } = await deployFixture();
    const tokenId = await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);

    await ecosystem.connect(user).purchaseSubscription(SILVER, ZERO);
    await expect(ecosystem.connect(root).transferFrom(root.address, user.address, tokenId)).to.be.reverted;
  });

  it("uses the NFT category, not the seller's current package, for resale checks", async function () {
    const { ecosystem, marketplace, owner, root, user, u2 } = await deployFixture();
    const silverToken = await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);

    await marketplace.connect(root).list(silverToken, U("20"));
    await ecosystem.connect(user).purchaseSubscription(SILVER, ZERO);
    await marketplace.connect(user).buy(silverToken);

    const replacementSilverToken = 2n;
    await ecosystem.connect(root).purchaseSubscription(DIAMOND, ZERO);
    const diamondToken = await mintListedNFT(ecosystem, owner, DIAMOND);
    await ecosystem.connect(root).buyListedFixedNFT(diamondToken, 0, "0x", []);

    await marketplace.connect(root).list(replacementSilverToken, U("20"));
    await ecosystem.connect(u2).purchaseSubscription(SILVER, ZERO);
    await marketplace.connect(u2).buy(replacementSilverToken);

    expect(await ecosystem.ownerOf(replacementSilverToken)).to.equal(u2.address);
    expect((await ecosystem.getUser(u2.address)).packageId).to.equal(SILVER);
  });

  it("requires sponsors to be subscribed NFT holders before referring", async function () {
    const { ecosystem, owner, root, sponsor, user } = await deployFixture();

    await ecosystem.connect(root).purchaseSubscription(SILVER, ZERO);
    await expect(ecosystem.connect(sponsor).purchaseSubscription(SILVER, root.address)).to.be.reverted;
    await expect(ecosystem.connect(user).joinStakePackage(U("1000"), 1, root.address)).to.be.reverted;

    const tokenId = await mintListedNFT(ecosystem, owner, SILVER);
    await ecosystem.connect(root).buyListedFixedNFT(tokenId, 0, "0x", []);

    await expect(ecosystem.connect(sponsor).purchaseSubscription(SILVER, root.address))
      .to.emit(ecosystem, "Subscribed")
      .withArgs(sponsor.address, SILVER, U("5"), root.address);
    await ecosystem.connect(user).joinStakePackage(U("1000"), 1, root.address);
    expect((await ecosystem.getUser(user.address)).sponsor).to.equal(root.address);
  });

  it("lets the admin sponsor users without subscribing or holding a platform NFT", async function () {
    const { ecosystem, owner, user } = await deployFixture();

    await expect(ecosystem.connect(user).joinStakePackage(U("1000"), 1, owner.address))
      .to.emit(ecosystem, "UserJoined")
      .withArgs(user.address, 2, SILVER, U("1000"), owner.address, 1);

    const record = await ecosystem.getUser(user.address);
    expect(record.sponsor).to.equal(owner.address);
    expect(await ecosystem.activeDirectCount(owner.address)).to.equal(1);
    expect(await ecosystem.totalDirectBusiness(owner.address)).to.equal(U("1000"));
  });

  it("lets the admin whitelist an offline-staked user so they can refer without subscription", async function () {
    const { ecosystem, owner, root, user } = await deployFixture();

    await ecosystem.connect(owner).adminActivateStakePosition(root.address, U("1000"), 1, ZERO);
    expect(await ecosystem.canRefer(root.address)).to.equal(false);
    await expect(ecosystem.connect(user).joinStakePackage(U("1000"), 1, root.address)).to.be.reverted;

    await expect(ecosystem.connect(user).whitelistReferralUser(root.address)).to.be.reverted;
    await expect(ecosystem.connect(owner).whitelistReferralUser(ZERO)).to.be.reverted;
    await ecosystem.connect(owner).whitelistReferralUser(root.address);
    expect(await ecosystem.canRefer(root.address)).to.equal(true);

    await ecosystem.connect(user).joinStakePackage(U("1000"), 1, root.address);
    expect((await ecosystem.getUser(user.address)).sponsor).to.equal(root.address);
    expect(await ecosystem.activeDirectCount(root.address)).to.equal(1);
    expect(await ecosystem.totalDirectBusiness(root.address)).to.equal(U("1000"));
  });

  it("joins stake packages by amount and prevents duplicate active positions", async function () {
    const { ecosystem, owner, user } = await deployFixture();
    await ecosystem.connect(user).joinStakePackage(U("7000"), 1, ZERO);
    const record = await ecosystem.getUser(user.address);
    expect(record.positionType).to.equal(2);
    expect(record.packageId).to.equal(GOLD);
    expect(await ecosystem.totalStakeBalance()).to.equal(U("7000"));
    await ecosystem.connect(user).purchaseSubscription(SILVER, ZERO);
    await expect(
      ecosystem.connect(user).buyListedFixedNFT(await mintListedNFT(ecosystem, owner, SILVER), 0, "0x", [])
    ).to.be.reverted;
    await expect(ecosystem.connect(user).joinStakePackage(U("999"), 1, ZERO)).to.be.reverted;
  });

  it("lets admin activate an offline-paid stake position for any user", async function () {
    const { ecosystem, owner, user, u2, usdt } = await deployFixture();
    const contractAddress = await ecosystem.getAddress();
    const beforeUser = await usdt.balanceOf(user.address);
    const beforeContract = await usdt.balanceOf(contractAddress);

    await expect(ecosystem.connect(user).adminActivateStakePosition(u2.address, U("1000"), 1, owner.address)).to.be.reverted;
    await expect(ecosystem.connect(owner).adminActivateStakePosition(user.address, U("1000"), 1, owner.address))
      .to.emit(ecosystem, "UserJoined")
      .withArgs(user.address, 2, SILVER, U("1000"), owner.address, 1);

    const record = await ecosystem.getUser(user.address);
    expect(record.active).to.equal(true);
    expect(record.positionType).to.equal(2);
    expect(record.stakeAmount).to.equal(U("1000"));
    expect(record.platformFeePaid).to.equal(0);
    expect(record.sponsor).to.equal(owner.address);
    expect(await ecosystem.balanceOf(user.address)).to.equal(1);
    expect(await ecosystem.totalStakeBalance()).to.equal(U("1000"));
    expect(await usdt.balanceOf(user.address)).to.equal(beforeUser);
    expect(await usdt.balanceOf(contractAddress)).to.equal(beforeContract);

    await time.increase(MONTH);
    expect(await ecosystem.pendingROIReward(user.address)).to.equal(U("40"));
    await expect(ecosystem.connect(owner).adminActivateStakePosition(user.address, U("1000"), 1, ZERO)).to.be.reverted;
  });

  it("requires active sponsors and tracks direct/team business", async function () {
    const { ecosystem, owner, root, sponsor, user } = await deployFixture();
    await expect(ecosystem.connect(user).purchaseSubscription(SILVER, sponsor.address)).to.be.reverted;

    await buyFixedNFT(ecosystem, owner, root, U("50"), DIAMOND, ZERO);
    await buyFixedNFT(ecosystem, owner, sponsor, U("10"), GOLD, root.address);
    await ecosystem.connect(user).joinStakePackage(U("2000"), 1, sponsor.address);

    expect(await ecosystem.activeDirectCount(sponsor.address)).to.equal(1);
    expect(await ecosystem.totalDirectBusiness(sponsor.address)).to.equal(U("2000"));
    expect(await ecosystem.totalTeamBusiness(root.address)).to.equal(U("2050"));
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
    const { ecosystem, owner, root, sponsor, user, u2 } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("50"), DIAMOND, ZERO);
    await buyFixedNFT(ecosystem, owner, sponsor, U("50"), DIAMOND, root.address);
    await buyFixedNFT(ecosystem, owner, user, U("50"), DIAMOND, sponsor.address);

    const userBefore = await ecosystem.userRewardBalance(user.address);
    const sponsorBefore = await ecosystem.userRewardBalance(sponsor.address);
    const rootBefore = await ecosystem.userRewardBalance(root.address);
    await ecosystem.connect(u2).joinStakePackage(U("1000"), 1, user.address);

    expect((await ecosystem.userRewardBalance(user.address)) - userBefore).to.equal(U("50"));
    expect((await ecosystem.userRewardBalance(sponsor.address)) - sponsorBefore).to.equal(U("20"));
    expect((await ecosystem.userRewardBalance(root.address)) - rootBefore).to.equal(U("10"));
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

  it("claims package ROI every 30 days and prevents early repeat", async function () {
    const { ecosystem, root } = await deployFixture();
    await ecosystem.connect(root).joinStakePackage(U("1000"), 1, ZERO);
    expect(await ecosystem.pendingROIReward(root.address)).to.equal(0);

    await time.increase(30 * 24 * 60 * 60);
    // Silver monthly ROI 4%.
    expect(await ecosystem.pendingROIReward(root.address)).to.equal(U("40"));
    await ecosystem.connect(root).claimROIReward();
    await expect(ecosystem.connect(root).claimROIReward()).to.be.reverted;

    await time.increase(30 * 24 * 60 * 60);
    expect(await ecosystem.pendingROIReward(root.address)).to.equal(U("40"));
    await ecosystem.connect(root).claimROIReward();
    expect(await ecosystem.roiClaimsCount(root.address)).to.equal(2);
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
    await expect(ecosystem.closeWeeklyPool(Math.floor(weekId))).to.be.reverted;
    await time.increase(WEEK);
    await ecosystem.closeWeeklyPool(Math.floor(weekId));
    await ecosystem.connect(root).claimWeeklyLeadershipPool(Math.floor(weekId));
    await expect(ecosystem.connect(root).claimWeeklyLeadershipPool(Math.floor(weekId))).to.be.reverted;
  });

  it("qualifies and distributes monthly royalty pool", async function () {
    const { ecosystem, owner, root, many, rewardPools } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);
    for (let i = 0; i < 25; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("5"), SILVER, root.address);
    }
    expect(await rewardPools.royaltyMember(root.address)).to.equal(true);
    const monthId = Math.floor((await time.latest()) / MONTH);
    await expect(ecosystem.closeMonthlyRoyaltyPool(monthId)).to.be.reverted;
    await time.increase(MONTH);
    await ecosystem.closeMonthlyRoyaltyPool(monthId);
    await ecosystem.connect(root).claimMonthlyRoyalty(monthId);
    await expect(ecosystem.connect(root).claimMonthlyRoyalty(monthId)).to.be.reverted;
  });

  it("prevents royalty members from claiming pools closed before their qualification month", async function () {
    const { ecosystem, owner, root, sponsor, many, rewardPools } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);
    for (let i = 0; i < 25; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("5"), SILVER, root.address);
    }
    expect(await rewardPools.royaltyMember(root.address)).to.equal(true);
    const monthId = Math.floor((await time.latest()) / MONTH);
    await time.increase(MONTH);
    await ecosystem.closeMonthlyRoyaltyPool(monthId);

    await buyFixedNFT(ecosystem, owner, sponsor, U("5"), SILVER, ZERO);
    for (let i = 25; i < 50; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("5"), SILVER, sponsor.address);
    }
    expect(await rewardPools.royaltyMember(sponsor.address)).to.equal(true);
    await expect(ecosystem.connect(sponsor).claimMonthlyRoyalty(monthId)).to.be.reverted;
  });

  it("lets marketplace owner pause and unpause resale actions", async function () {
    const { ecosystem, marketplace, owner, root } = await deployFixture();
    const tokenId = await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);
    await marketplace.connect(owner).pause();
    await expect(marketplace.connect(root).list(tokenId, U("20"))).to.be.reverted;
    await marketplace.connect(owner).unpause();
    await expect(marketplace.connect(root).list(tokenId, U("20"))).to.emit(marketplace, "Listed");
  });

  it("caps earnings at 2X and reTopup restores earning status", async function () {
    const { ecosystem, owner, root, many } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("5"), SILVER, ZERO);
    for (let i = 0; i < 25; i++) {
      await buyFixedNFT(ecosystem, owner, many[i], U("50"), DIAMOND, root.address);
    }
    expect(await ecosystem.totalEarned(root.address)).to.be.gte(await ecosystem.totalCap(root.address));
    const beforeCap = await ecosystem.totalCap(root.address);
    await ecosystem.connect(root).reTopup();
    expect(await ecosystem.totalCap(root.address)).to.equal(beforeCap + U("20"));
    expect((await ecosystem.getUser(root.address)).earningActive).to.equal(true);
  });

  it("withdraws rewards with 10% deduction", async function () {
    const { ecosystem, owner, usdt, root, user } = await deployFixture();
    await buyFixedNFT(ecosystem, owner, root, U("50"), DIAMOND, ZERO);
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
    const tokenId = await ecosystem.userToTokenId(user.address);
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

    await expect(ecosystem.connect(root).withdrawPlatformFees(U("50"))).to.be.reverted;
    await ecosystem.connect(owner).withdrawPlatformFees(U("50"));
    expect(await usdt.balanceOf(treasury.address)).to.be.gt(U("1000000"));
    await expect(ecosystem.connect(owner).emergencyRescueToken(await usdt.getAddress(), owner.address, 1)).to.be.reverted;
  });
});
