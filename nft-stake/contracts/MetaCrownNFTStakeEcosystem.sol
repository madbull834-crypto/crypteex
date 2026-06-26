// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOrbdSwapLocker {
    function swapAndLock(
        address buyer,
        uint256 usdtAmount,
        uint256 minimumOrbdOut,
        bytes calldata commands,
        bytes[] calldata inputs
    ) external returns (uint256 orbdReceived);
}

/**
 * @title MetaCrownNFTStakeEcosystem
 * @notice Combined Meta Crown fixed NFT package and high-value NFT stake ecosystem.
 *
 * Architecture summary:
 * - One ERC721 NFT represents one active user position.
 * - Users can activate either a fixed Meta Crown package or a high-value stake package, never both.
 * - USDT is held by the contract and separated through internal ledgers for stake principal,
 *   NFT value pool, platform fees, reward pool, weekly pool, royalty pool, deductions, and stability funds.
 * - Rewards are credited to userRewardBalance and withdrawn later through withdrawRewards.
 *
 * Assumptions:
 * - USDT token units are read from the payment token decimals at deployment.
 * - weekId = block.timestamp / 7 days and monthId = block.timestamp / 30 days.
 * - Passive monthly income accrues in complete 30-day periods; daily income accrues in complete days.
 * - Fixed Meta Crown package exit is disabled. Stake package exit is supported with the stability schedule.
 * - Stake ROI is claimable every completed 30-day period for a one-year term.
 */
contract MetaCrownNFTStakeEcosystem is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error BadPackage();
    error BadPlan();
    error BadAmount();
    error ActivePositionExists();
    error SponsorNotActive();
    error SelfSponsor();
    error NotActive();
    error NotStakeUser();
    error NoReward();
    error MonthlyLimit();
    error AlreadyClaimed();
    error NotQualified();
    error NotClosed();
    error AlreadyClosed();
    error NoQualifiers();
    error NoMembers();
    error CannotRescueUSDT();
    error NotListed();
    error OnlyMarketplace();
    error AlreadySubscribed();
    error NotSubscriber();

    uint256 private constant BPS = 10_000;
    uint256 private constant SECONDS_PER_DAY = 1 days;
    uint256 private constant SECONDS_PER_WEEK = 7 days;
    uint256 private constant SECONDS_PER_MONTH = 30 days;
    uint8 private constant MAX_MONTHLY_ROI_CLAIMS = 12;

    uint8 private constant PACKAGE_SILVER = 1;
    uint8 private constant PACKAGE_GOLD = 2;
    uint8 private constant PACKAGE_DIAMOND = 3;

    uint8 private constant POSITION_FIXED = 1;
    uint8 private constant POSITION_STAKE = 2;

    uint256 private immutable usdtUnit;
    uint256 private immutable weeklyPoolContribution;
    uint256 private immutable royaltyPoolContribution;
    uint256 private immutable weeklyQualificationVolume;
    uint256 private constant ROYALTY_DIRECTS_REQUIRED = 25;

    IERC20 public immutable usdt;
    address private immutable orbdSwapLocker;
    address public treasuryWallet;
    address public airdropWallet;
    address public nftMarketplace;
    mapping(uint8 => string) private packageTokenURIs;
    uint256 private nextTokenId = 1;
    uint256 public totalUsers;
    uint256 public royaltyMembersCount;

    struct FixedPackage {
        uint256 nftValue;
        uint256 platformFee;
        bool active;
    }

    struct StakePackage {
        uint256 minStake;
        uint256 maxStake;
        uint256 platformFee;
        uint16 rewardRateBps;
        bool active;
    }

    struct User {
        uint8 positionType;
        uint8 packageId;
        uint256 nftValue;
        uint256 stakeAmount;
        uint256 platformFeePaid;
        uint256 roiPlanId;
        address sponsor;
        uint256 activationTime;
        bool active;
        bool earningActive;
        uint256 tokenId;
        uint256 lastPassiveClaimTime;
        bool roiClaimed;
        uint256 reTopupCount;
    }

    struct WeeklyPool {
        uint256 poolAmount;
        uint256 qualifierCount;
        bool closed;
        uint256 rewardPerQualifier;
    }

    struct MonthlyRoyaltyPool {
        uint256 poolAmount;
        bool closed;
        uint256 memberCountSnapshot;
        uint256 rewardPerMember;
    }

    struct NFTSale {
        uint8 packageId;
        bool active;
    }

    mapping(uint8 => FixedPackage) public fixedPackages;
    mapping(uint8 => StakePackage) public stakePackages;
    mapping(address => User) private users;

    mapping(address => uint256) public userRewardBalance;
    mapping(address => uint256) public totalEarned;
    mapping(address => uint256) public totalCap;
    mapping(address => uint256) public totalDirectBusiness;
    mapping(address => uint256) public totalTeamBusiness;
    mapping(address => uint256) public activeDirectCount;
    mapping(address => uint256) public userToTokenId;
    mapping(uint256 => address) public tokenToUser;
    mapping(uint256 => uint8) private tokenPackageId;
    mapping(uint256 => NFTSale) public nftSales;
    mapping(address => bool) private subscriberExists;
    mapping(address => mapping(uint8 => bool)) public subscriptions;
    mapping(address => mapping(uint8 => address)) private subscriptionSponsor;

    mapping(address => mapping(uint256 => uint256)) public weeklyTeamVolume;
    mapping(uint256 => WeeklyPool) public weeklyPools;
    mapping(address => mapping(uint256 => bool)) public weeklyQualified;
    mapping(address => mapping(uint256 => bool)) public weeklyClaimed;

    mapping(address => bool) public royaltyMember;
    mapping(uint256 => MonthlyRoyaltyPool) public monthlyRoyaltyPools;
    mapping(address => mapping(uint256 => bool)) public royaltyClaimed;

    mapping(address => mapping(uint256 => uint256)) public monthlyClaimCount;
    mapping(address => uint256) public lastROIClaimTime;
    mapping(address => uint8) public roiClaimsCount;

    uint256 public totalNFTValueBalance;
    uint256 public totalStakeBalance;
    uint256 public platformFeeBalance;
    uint256 public rewardPoolBalance;
    uint256 public deductionFundBalance;
    uint256 public airdropFundBalance;
    uint256 public weeklyLeadershipPoolBalance;
    uint256 public monthlyRoyaltyPoolBalance;
    uint256 public ecosystemStabilityFundBalance;

    uint16 public withdrawalDeductionBps = 1_000;
    uint16 public stakeDirectRewardBps = 500;
    uint16 public level2Bps = 200;
    uint16 public level3Bps = 100;
    uint16 public monthlyPassiveBps = 500;
    uint16 public dailyPassiveBps = 50;
    uint16 private constant BOOSTER_3X_BPS = 100;
    uint16 private constant BOOSTER_10X_BPS = 200;

    event UserJoined(address indexed user, uint8 indexed positionType, uint8 indexed packageId, uint256 value, address sponsor, uint256 tokenId);
    event DirectCommissionCredited(address indexed sponsor, address indexed from, uint256 amount, uint16 bps);
    event DirectRewardCredited(address indexed sponsor, address indexed from, uint256 amount);
    event LevelIncomeCredited(address indexed recipient, address indexed from, uint8 level, uint256 amount);
    event PassiveIncomeClaimed(address indexed user, uint256 amount);
    event ROIRewardClaimed(address indexed user, uint256 amount, uint256 roiPlanId);
    event RewardWithdrawn(address indexed user, uint256 grossAmount, uint256 deductionAmount, uint256 netAmount);
    event WeeklyPoolFunded(uint256 indexed weekId, uint256 amount);
    event WeeklyPoolQualified(address indexed user, uint256 indexed weekId, uint256 teamVolume);
    event WeeklyPoolClosed(uint256 indexed weekId, uint256 poolAmount, uint256 qualifierCount, uint256 rewardPerQualifier);
    event WeeklyPoolClaimed(address indexed user, uint256 indexed weekId, uint256 amount);
    event RoyaltyQualified(address indexed user);
    event RoyaltyPoolFunded(uint256 indexed monthId, uint256 amount);
    event RoyaltyPoolClosed(uint256 indexed monthId, uint256 poolAmount, uint256 memberCount, uint256 rewardPerMember);
    event RoyaltyClaimed(address indexed user, uint256 indexed monthId, uint256 amount);
    event ReTopup(address indexed user, uint256 value, uint256 newCap, uint256 count);
    event Capped(address indexed user, uint256 totalEarned, uint256 totalCap);
    event StakeExited(address indexed user, uint256 stakeAmount, uint256 deductionAmount, uint256 netAmount);
    event PlatformFeesWithdrawn(address indexed to, uint256 amount);
    event Subscribed(address indexed account, uint8 indexed packageId, uint256 fee, address indexed sponsor);
    event NFTListed(uint256 indexed tokenId, uint8 indexed packageId, uint256 price);
    event NFTSold(uint256 indexed tokenId, address indexed buyer, uint256 price);

    constructor(address usdt_, address treasuryWallet_, address airdropWallet_, string memory baseURI_, address orbdSwapLocker_)
        ERC721("Meta Crown NFT Stake Ecosystem", "MCNSE")
        Ownable(msg.sender)
    {
        if (usdt_ == address(0) || treasuryWallet_ == address(0) || airdropWallet_ == address(0)) revert ZeroAddress();
        usdt = IERC20(usdt_);
        orbdSwapLocker = orbdSwapLocker_;
        treasuryWallet = treasuryWallet_;
        airdropWallet = airdropWallet_;
        packageTokenURIs[PACKAGE_SILVER] = string.concat(baseURI_, "silver.json");
        packageTokenURIs[PACKAGE_GOLD] = string.concat(baseURI_, "gold.json");
        packageTokenURIs[PACKAGE_DIAMOND] = string.concat(baseURI_, "diamond.json");

        uint256 unit = 10 ** IERC20Metadata(usdt_).decimals();
        usdtUnit = unit;
        weeklyPoolContribution = 5 * unit;
        royaltyPoolContribution = 2 * unit;
        weeklyQualificationVolume = 2_500 * unit;

        fixedPackages[PACKAGE_SILVER] = FixedPackage(10 * unit, 5 * unit, true);
        fixedPackages[PACKAGE_GOLD] = FixedPackage(50 * unit, 10 * unit, true);
        fixedPackages[PACKAGE_DIAMOND] = FixedPackage(50 * unit, 50 * unit, true);

        stakePackages[PACKAGE_SILVER] = StakePackage(1_000 * unit, 5_000 * unit, 50 * unit, 400, true);
        stakePackages[PACKAGE_GOLD] = StakePackage(5_001 * unit, 10_000 * unit, 100 * unit, 500, true);
        stakePackages[PACKAGE_DIAMOND] = StakePackage(10_001 * unit, type(uint256).max, 100 * unit, 600, true);

    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId);
        return packageTokenURIs[tokenPackageId[tokenId]];
    }

    function adminBulkMintFixedNFTsForSale(uint8 packageId, uint16 count) external onlyOwner returns (uint256 firstTokenId) {
        FixedPackage memory pkg = fixedPackages[packageId];
        if (!pkg.active) revert BadPackage();
        if (count == 0) revert BadAmount();

        firstTokenId = nextTokenId;
        for (uint16 i; i < count; ++i) {
            uint256 tokenId = nextTokenId++;
            tokenPackageId[tokenId] = packageId;
            _mint(address(this), tokenId);
            nftSales[tokenId] = NFTSale(packageId, true);

            emit NFTListed(tokenId, packageId, pkg.nftValue);
        }
    }

    function purchaseSubscription(uint8 packageId, address sponsor) external nonReentrant {
        FixedPackage memory pkg = fixedPackages[packageId];
        if (!pkg.active) revert BadPackage();
        if (subscriptions[msg.sender][packageId]) revert AlreadySubscribed();
        if (sponsor == msg.sender) revert SelfSponsor();
        if (sponsor != address(0) && !_isEligibleSponsor(sponsor)) revert SponsorNotActive();

        usdt.safeTransferFrom(msg.sender, address(this), pkg.platformFee);
        subscriptions[msg.sender][packageId] = true;
        subscriberExists[msg.sender] = true;
        subscriptionSponsor[msg.sender][packageId] = sponsor;
        _splitFixedPlatformFee(pkg.platformFee);
        emit Subscribed(msg.sender, packageId, pkg.platformFee, sponsor);
    }

    function buyListedFixedNFT(
        uint256 tokenId,
        uint256 minimumOrbdOut,
        bytes calldata commands,
        bytes[] calldata inputs
    ) external nonReentrant {
        NFTSale memory sale = nftSales[tokenId];
        if (!sale.active) revert NotListed();
        FixedPackage memory pkg = fixedPackages[sale.packageId];
        if (!subscriptions[msg.sender][sale.packageId]) revert NotSubscriber();
        _validateNewPositionFor(msg.sender);

        delete nftSales[tokenId];
        uint256 price = pkg.nftValue;
        usdt.safeTransferFrom(msg.sender, address(this), price);

        uint256 swapAmount;
        if (orbdSwapLocker != address(0)) {
            swapAmount = (price * _orbdSwapBps(sale.packageId)) / BPS;
            usdt.safeTransfer(orbdSwapLocker, swapAmount);
            IOrbdSwapLocker(orbdSwapLocker).swapAndLock(msg.sender, swapAmount, minimumOrbdOut, commands, inputs);
        }

        totalNFTValueBalance += price - swapAmount;
        address sponsor = subscriptionSponsor[msg.sender][sale.packageId];
        _activateFixedUserFromToken(msg.sender, tokenId, sale.packageId, pkg.nftValue, pkg.platformFee, sponsor);
        _processBusinessAndRewards(msg.sender, sponsor, pkg.nftValue, false);

        _transfer(address(this), msg.sender, tokenId);
        emit NFTSold(tokenId, msg.sender, price);
    }

    function marketplaceTransferFixedNFT(address seller, address buyer, uint256 tokenId, uint256 price) external {
        if (msg.sender != nftMarketplace) revert OnlyMarketplace();
        uint8 packageId = users[seller].packageId;
        if (!subscriptions[seller][packageId] || !subscriptions[buyer][packageId]) revert NotSubscriber();
        _validateNewPositionFor(buyer);
        uint256 nftValue = fixedPackages[packageId].nftValue;
        if (users[seller].active && users[seller].positionType == POSITION_FIXED && users[seller].tokenId == tokenId) {
            _transferFixedPosition(seller, buyer, tokenId);
        } else {
            _activateFixedUserFromToken(buyer, tokenId, packageId, nftValue, fixedPackages[packageId].platformFee, address(0));
        }
        _transfer(seller, buyer, tokenId);
        if (price >= nftValue * 2) _mintReplacementNFTs(seller);
    }

    function joinStakePackage(uint256 stakeAmount, uint256 roiPlanId, address sponsor) external nonReentrant {
        uint8 packageId = _validateStakeActivation(msg.sender, stakeAmount, roiPlanId, sponsor);
        uint256 platformFee = stakePackages[packageId].platformFee;

        usdt.safeTransferFrom(msg.sender, address(this), stakeAmount + platformFee);
        _activateStakePosition(msg.sender, packageId, stakeAmount, platformFee, roiPlanId, sponsor);

        platformFeeBalance += platformFee;
    }

    function adminActivateStakePosition(address account, uint256 stakeAmount, uint256 roiPlanId, address sponsor)
        external
        onlyOwner
    {
        uint8 packageId = _validateStakeActivation(account, stakeAmount, roiPlanId, sponsor);
        _activateStakePosition(account, packageId, stakeAmount, 0, roiPlanId, sponsor);
    }

    function reTopup() external nonReentrant {
        User storage user = users[msg.sender];
        if (!user.active) revert NotActive();
        uint256 value = user.positionType == POSITION_FIXED ? user.nftValue : user.stakeAmount;
        if (value == 0) revert BadAmount();

        usdt.safeTransferFrom(msg.sender, address(this), value);
        if (user.positionType == POSITION_FIXED) {
            totalNFTValueBalance += value;
        } else {
            totalStakeBalance += value;
            user.stakeAmount += value;
        }

        user.earningActive = true;
        user.roiClaimed = false;
        lastROIClaimTime[msg.sender] = block.timestamp;
        roiClaimsCount[msg.sender] = 0;
        user.lastPassiveClaimTime = block.timestamp;
        user.reTopupCount += 1;
        totalCap[msg.sender] += value * 2;

        _processBusinessAndRewards(msg.sender, user.sponsor, value, user.positionType == POSITION_STAKE);
        emit ReTopup(msg.sender, value, totalCap[msg.sender], user.reTopupCount);
    }

    function claimPassiveIncome() external nonReentrant {
        _useMonthlyClaim(msg.sender);
        uint256 amount = pendingPassiveIncome(msg.sender);
        if (amount == 0) revert NoReward();
        users[msg.sender].lastPassiveClaimTime = block.timestamp;
        uint256 credited = _creditReward(msg.sender, amount, 0);
        emit PassiveIncomeClaimed(msg.sender, credited);
    }

    function claimROIReward() external nonReentrant {
        _useMonthlyClaim(msg.sender);
        User storage user = users[msg.sender];
        if (user.positionType != POSITION_STAKE || !user.active) revert NotStakeUser();
        uint256 periods = _claimableROIPeriods(msg.sender);
        if (periods == 0) revert NotClosed();
        uint256 amount = pendingROIReward(msg.sender);
        if (amount == 0) revert NoReward();
        roiClaimsCount[msg.sender] += uint8(periods);
        lastROIClaimTime[msg.sender] += periods * SECONDS_PER_MONTH;
        if (roiClaimsCount[msg.sender] == MAX_MONTHLY_ROI_CLAIMS) user.roiClaimed = true;
        uint256 credited = _creditReward(msg.sender, amount, 0);
        emit ROIRewardClaimed(msg.sender, credited, user.roiPlanId);
    }

    function claimWeeklyLeadershipPool(uint256 weekId) external nonReentrant {
        _useMonthlyClaim(msg.sender);
        WeeklyPool memory pool = weeklyPools[weekId];
        if (!pool.closed) revert NotClosed();
        if (!weeklyQualified[msg.sender][weekId]) revert NotQualified();
        if (weeklyClaimed[msg.sender][weekId]) revert AlreadyClaimed();
        weeklyClaimed[msg.sender][weekId] = true;
        uint256 credited = _creditReward(msg.sender, pool.rewardPerQualifier, 1);
        emit WeeklyPoolClaimed(msg.sender, weekId, credited);
    }

    function claimMonthlyRoyalty(uint256 monthId) external nonReentrant {
        _useMonthlyClaim(msg.sender);
        MonthlyRoyaltyPool memory pool = monthlyRoyaltyPools[monthId];
        if (!pool.closed) revert NotClosed();
        if (!royaltyMember[msg.sender]) revert NotQualified();
        if (royaltyClaimed[msg.sender][monthId]) revert AlreadyClaimed();
        royaltyClaimed[msg.sender][monthId] = true;
        uint256 credited = _creditReward(msg.sender, pool.rewardPerMember, 2);
        emit RoyaltyClaimed(msg.sender, monthId, credited);
    }

    function withdrawRewards(uint256 amount) external nonReentrant {
        if (amount == 0 || userRewardBalance[msg.sender] < amount) revert BadAmount();
        uint256 deduction = (amount * withdrawalDeductionBps) / BPS;
        uint256 net = amount - deduction;

        userRewardBalance[msg.sender] -= amount;
        deductionFundBalance += deduction;
        airdropFundBalance += deduction;

        usdt.safeTransfer(msg.sender, net);
        emit RewardWithdrawn(msg.sender, amount, deduction, net);
    }

    function exitStake() external nonReentrant {
        User storage user = users[msg.sender];
        if (!user.active || user.positionType != POSITION_STAKE) revert NotStakeUser();
        uint256 stake = user.stakeAmount;
        uint256 deduction = _exitDeduction(msg.sender);
        uint256 net = stake - deduction;

        user.active = false;
        user.earningActive = false;
        totalStakeBalance -= stake;
        ecosystemStabilityFundBalance += deduction;

        uint256 tokenId = user.tokenId;
        delete userToTokenId[msg.sender];
        delete tokenToUser[tokenId];
        _burn(tokenId);

        usdt.safeTransfer(msg.sender, net);
        emit StakeExited(msg.sender, stake, deduction, net);
    }

    function closeWeeklyPool(uint256 weekId) external onlyOwner {
        WeeklyPool storage pool = weeklyPools[weekId];
        if (pool.closed) revert AlreadyClosed();
        if (pool.qualifierCount == 0) revert NoQualifiers();
        pool.closed = true;
        pool.rewardPerQualifier = pool.poolAmount / pool.qualifierCount;
        emit WeeklyPoolClosed(weekId, pool.poolAmount, pool.qualifierCount, pool.rewardPerQualifier);
    }

    function closeMonthlyRoyaltyPool(uint256 monthId) external onlyOwner {
        MonthlyRoyaltyPool storage pool = monthlyRoyaltyPools[monthId];
        if (pool.closed) revert AlreadyClosed();
        if (royaltyMembersCount == 0) revert NoMembers();
        pool.closed = true;
        pool.memberCountSnapshot = royaltyMembersCount;
        pool.rewardPerMember = pool.poolAmount / royaltyMembersCount;
        emit RoyaltyPoolClosed(monthId, pool.poolAmount, royaltyMembersCount, pool.rewardPerMember);
    }

    function fundRewardPool(uint256 amount) external nonReentrant {
        if (amount == 0) revert BadAmount();
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        rewardPoolBalance += amount;
    }

    function updateTreasuryWallet(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasuryWallet = newTreasury;
    }

    function updateAirdropWallet(address newAirdropWallet) external onlyOwner {
        if (newAirdropWallet == address(0)) revert ZeroAddress();
        airdropWallet = newAirdropWallet;
    }

    function updateNFTMarketplace(address newMarketplace) external onlyOwner {
        if (newMarketplace == address(0)) revert ZeroAddress();
        nftMarketplace = newMarketplace;
    }

    function withdrawPlatformFees(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0 || amount > platformFeeBalance) revert BadAmount();
        platformFeeBalance -= amount;
        usdt.safeTransfer(treasuryWallet, amount);
        emit PlatformFeesWithdrawn(treasuryWallet, amount);
    }

    function withdrawAirdropDeductionFund(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0 || amount > airdropFundBalance) revert BadAmount();
        airdropFundBalance -= amount;
        deductionFundBalance -= amount;
        usdt.safeTransfer(airdropWallet, amount);
    }

    function withdrawEcosystemStabilityFund(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0 || amount > ecosystemStabilityFundBalance) revert BadAmount();
        ecosystemStabilityFundBalance -= amount;
        usdt.safeTransfer(treasuryWallet, amount);
    }

    function emergencyRescueToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(usdt)) revert CannotRescueUSDT();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    function pendingPassiveIncome(address account) public view returns (uint256) {
        User memory user = users[account];
        if (!user.active || !user.earningActive || user.positionType != POSITION_FIXED) return 0;
        if (activeDirectCount[account] >= 5 && totalDirectBusiness[account] >= _requiredDirectBusiness(user.packageId)) {
            uint256 daysElapsed = (block.timestamp - user.lastPassiveClaimTime) / SECONDS_PER_DAY;
            return (user.nftValue * dailyPassiveBps * daysElapsed) / BPS;
        }
        if (activeDirectCount[account] >= 2) {
            uint256 periods = (block.timestamp - user.lastPassiveClaimTime) / SECONDS_PER_MONTH;
            return (user.nftValue * monthlyPassiveBps * periods) / BPS;
        }
        return 0;
    }

    function pendingROIReward(address account) public view returns (uint256) {
        User memory user = users[account];
        if (!user.active || !user.earningActive || user.positionType != POSITION_STAKE || user.roiClaimed) return 0;
        uint256 periods = _claimableROIPeriods(account);
        if (periods == 0) return 0;
        uint16 monthlyRateBps = stakePackages[user.packageId].rewardRateBps;
        return (user.stakeAmount * (monthlyRateBps + _userRewardBoost(account)) * periods) / BPS;
    }

    function _claimableROIPeriods(address account) internal view returns (uint256 periods) {
        User memory user = users[account];
        if (
            !user.active ||
            user.positionType != POSITION_STAKE ||
            roiClaimsCount[account] >= MAX_MONTHLY_ROI_CLAIMS
        ) return 0;

        uint256 claimFrom = lastROIClaimTime[account];
        if (claimFrom == 0) claimFrom = user.activationTime;
        periods = (block.timestamp - claimFrom) / SECONDS_PER_MONTH;
        uint256 remainingPeriods = MAX_MONTHLY_ROI_CLAIMS - roiClaimsCount[account];
        if (periods > remainingPeriods) periods = remainingPeriods;
    }

    function remainingCap(address account) public view returns (uint256) {
        if (totalEarned[account] >= totalCap[account]) return 0;
        return totalCap[account] - totalEarned[account];
    }

    function _userRewardBoost(address account) private view returns (uint16) {
        User memory user = users[account];
        uint256 ownValue = user.positionType == POSITION_STAKE ? user.stakeAmount : user.nftValue;
        if (ownValue == 0) return 0;
        uint256 business = totalTeamBusiness[account];
        if (business >= ownValue * 10) return BOOSTER_10X_BPS;
        if (business >= ownValue * 3) return BOOSTER_3X_BPS;
        return 0;
    }

    function getUser(address account) external view returns (User memory) {
        return users[account];
    }

    function _validateStakeActivation(address account, uint256 stakeAmount, uint256 roiPlanId, address sponsor)
        internal
        view
        returns (uint8 packageId)
    {
        if (account == address(0)) revert ZeroAddress();
        if (roiPlanId != 1) revert BadPlan();
        packageId = _stakePackageId(stakeAmount);
        if (!stakePackages[packageId].active) revert BadPackage();
        if (users[account].active || userToTokenId[account] != 0) revert ActivePositionExists();
        if (sponsor == account) revert SelfSponsor();
        if (sponsor != address(0) && !_isEligibleSponsor(sponsor)) revert SponsorNotActive();
    }

    function _activateStakePosition(address account, uint8 packageId, uint256 stakeAmount, uint256 platformFee, uint256 roiPlanId, address sponsor) internal {
        totalStakeBalance += stakeAmount;
        _activateUser(account, POSITION_STAKE, packageId, 0, stakeAmount, platformFee, roiPlanId, sponsor);
        _processBusinessAndRewards(account, sponsor, stakeAmount, true);
    }

    function _validateNewPositionFor(address account) internal view {
        if (users[account].active || userToTokenId[account] != 0) revert ActivePositionExists();
    }

    function _isEligibleSponsor(address account) private view returns (bool) {
        return account == owner() || (subscriberExists[account] && balanceOf(account) != 0);
    }

    function _activateUser(
        address account,
        uint8 positionType,
        uint8 packageId,
        uint256 nftValue,
        uint256 stakeAmount,
        uint256 platformFee,
        uint256 roiPlanId,
        address sponsor
    ) internal {
        uint256 tokenId = nextTokenId++;
        users[account] = User(positionType, packageId, nftValue, stakeAmount, platformFee, roiPlanId, sponsor, block.timestamp, true, true, tokenId, block.timestamp, false, users[account].reTopupCount);
        userToTokenId[account] = tokenId;
        tokenToUser[tokenId] = account;
        tokenPackageId[tokenId] = packageId;
        totalCap[account] = (positionType == POSITION_STAKE ? stakeAmount : nftValue) * 2;
        totalUsers += 1;
        if (positionType == POSITION_STAKE) {
            lastROIClaimTime[account] = block.timestamp;
            roiClaimsCount[account] = 0;
        }
        _mint(account, tokenId);

        emit UserJoined(account, positionType, packageId, positionType == POSITION_STAKE ? stakeAmount : nftValue, sponsor, tokenId);
    }

    function _activateFixedUserFromToken(
        address account,
        uint256 tokenId,
        uint8 packageId,
        uint256 nftValue,
        uint256 platformFee,
        address sponsor
    ) internal {
        users[account] = User(POSITION_FIXED, packageId, nftValue, 0, platformFee, 0, sponsor, block.timestamp, true, true, tokenId, block.timestamp, false, users[account].reTopupCount);
        userToTokenId[account] = tokenId;
        tokenToUser[tokenId] = account;
        tokenPackageId[tokenId] = packageId;
        totalCap[account] = nftValue * 2;
        totalUsers += 1;

        emit UserJoined(account, POSITION_FIXED, packageId, nftValue, sponsor, tokenId);
    }

    function _transferFixedPosition(address seller, address buyer, uint256 tokenId) internal {
        User storage sellerUser = users[seller];
        if (!sellerUser.active || sellerUser.positionType != POSITION_FIXED || sellerUser.tokenId != tokenId) revert NotActive();

        uint8 packageId = sellerUser.packageId;
        uint256 nftValue = sellerUser.nftValue;
        uint256 platformFee = sellerUser.platformFeePaid;

        sellerUser.active = false;
        sellerUser.earningActive = false;
        delete userToTokenId[seller];
        delete tokenToUser[tokenId];

        users[buyer] = User(POSITION_FIXED, packageId, nftValue, 0, platformFee, 0, address(0), block.timestamp, true, true, tokenId, block.timestamp, false, users[buyer].reTopupCount);
        userToTokenId[buyer] = tokenId;
        tokenToUser[tokenId] = buyer;
        totalCap[buyer] = nftValue * 2;
        totalUsers += 1;

        emit UserJoined(buyer, POSITION_FIXED, packageId, nftValue, address(0), tokenId);
    }

    function _mintReplacementNFTs(address account) internal {
        uint8 packageId = users[account].packageId;
        for (uint8 i = 0; i < 2; ++i) {
            uint256 tokenId = nextTokenId++;
            tokenPackageId[tokenId] = packageId;
            _mint(account, tokenId);
        }
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && to != address(this) && !subscriptions[to][tokenPackageId[tokenId]]) {
            revert NotSubscriber();
        }
        return super._update(to, tokenId, auth);
    }

    function _splitFixedPlatformFee(uint256 platformFee) internal {
        uint256 weekId = block.timestamp / SECONDS_PER_WEEK;
        uint256 monthId = block.timestamp / SECONDS_PER_MONTH;
        weeklyPools[weekId].poolAmount += weeklyPoolContribution;
        monthlyRoyaltyPools[monthId].poolAmount += royaltyPoolContribution;
        weeklyLeadershipPoolBalance += weeklyPoolContribution;
        monthlyRoyaltyPoolBalance += royaltyPoolContribution;
        uint256 poolContribution = weeklyPoolContribution + royaltyPoolContribution;
        if (platformFee > poolContribution) {
            platformFeeBalance += platformFee - poolContribution;
        }
        emit WeeklyPoolFunded(weekId, weeklyPoolContribution);
        emit RoyaltyPoolFunded(monthId, royaltyPoolContribution);
    }

    function _processBusinessAndRewards(address buyer, address sponsor, uint256 businessValue, bool isStake) internal {
        if (sponsor == address(0)) return;

        if (users[buyer].reTopupCount == 0) {
            activeDirectCount[sponsor] += 1;
            if (users[sponsor].positionType == POSITION_FIXED && activeDirectCount[sponsor] == 2) {
                users[sponsor].lastPassiveClaimTime = block.timestamp;
            }
        }
        totalDirectBusiness[sponsor] += businessValue;
        _maybeUpdateRoyalty(sponsor);

        uint256 weekId = block.timestamp / SECONDS_PER_WEEK;
        address current = sponsor;
        for (uint8 level = 1; level <= 3; ++level) {
            if (current == address(0)) break;
            totalTeamBusiness[current] += businessValue;
            weeklyTeamVolume[current][weekId] += businessValue;
            _maybeQualifyWeekly(current, weekId);

            uint16 bps = level == 1 ? _directCommissionBps(current, isStake) : (level == 2 ? level2Bps : level3Bps);
            uint256 credited = _creditReward(current, (businessValue * bps) / BPS, 0);
            if (credited > 0) {
                if (level == 1) {
                    emit DirectCommissionCredited(current, buyer, credited, bps);
                    if (isStake) emit DirectRewardCredited(current, buyer, credited);
                }
                emit LevelIncomeCredited(current, buyer, level, credited);
            }
            current = users[current].sponsor;
        }
    }

    function _creditReward(address account, uint256 amount, uint8 source) internal returns (uint256 credited) {
        if (amount == 0 || !users[account].active || !users[account].earningActive) return 0;
        uint256 capLeft = remainingCap(account);
        if (capLeft == 0) {
            users[account].earningActive = false;
            emit Capped(account, totalEarned[account], totalCap[account]);
            return 0;
        }
        credited = amount < capLeft ? amount : capLeft;
        uint256 available = _availableRewardSource(source);
        if (credited > available) credited = available;
        if (credited == 0) return 0;

        _decreaseRewardSource(source, credited);
        userRewardBalance[account] += credited;
        totalEarned[account] += credited;

        if (totalEarned[account] >= totalCap[account]) {
            users[account].earningActive = false;
            emit Capped(account, totalEarned[account], totalCap[account]);
        }
    }

    function _availableRewardSource(uint8 source) internal view returns (uint256) {
        if (source == 1) return weeklyLeadershipPoolBalance;
        if (source == 2) return monthlyRoyaltyPoolBalance;
        return rewardPoolBalance;
    }

    function _decreaseRewardSource(uint8 source, uint256 amount) internal {
        if (source == 1) weeklyLeadershipPoolBalance -= amount;
        else if (source == 2) monthlyRoyaltyPoolBalance -= amount;
        else rewardPoolBalance -= amount;
    }

    function _useMonthlyClaim(address account) internal {
        uint256 monthId = block.timestamp / SECONDS_PER_MONTH;
        if (monthlyClaimCount[account][monthId] >= 2) revert MonthlyLimit();
        monthlyClaimCount[account][monthId] += 1;
    }

    function _stakePackageId(uint256 stakeAmount) internal view returns (uint8) {
        for (uint8 packageId = PACKAGE_SILVER; packageId <= PACKAGE_DIAMOND; ++packageId) {
            StakePackage memory pkg = stakePackages[packageId];
            if (stakeAmount >= pkg.minStake && stakeAmount <= pkg.maxStake) return packageId;
        }
        revert BadAmount();
    }

    function _orbdSwapBps(uint8 packageId) private pure returns (uint16) {
        if (packageId == PACKAGE_GOLD) return 1_000;
        if (packageId == PACKAGE_DIAMOND) return 200;
        return 500;
    }

    function _directCommissionBps(address sponsor, bool isStake) internal view returns (uint16) {
        if (isStake) return stakeDirectRewardBps;
        uint256 directs = activeDirectCount[sponsor];
        if (directs >= 16) return 1_000;
        if (directs >= 6) return 700;
        if (directs >= 1) return 500;
        return 0;
    }

    function _requiredDirectBusiness(uint8 packageId) internal view returns (uint256) {
        if (packageId == PACKAGE_SILVER) return 50 * usdtUnit;
        if (packageId == PACKAGE_GOLD) return 500 * usdtUnit;
        return 2_500 * usdtUnit;
    }

    function _maybeQualifyWeekly(address account, uint256 weekId) internal {
        if (!weeklyQualified[account][weekId] && weeklyTeamVolume[account][weekId] >= weeklyQualificationVolume) {
            weeklyQualified[account][weekId] = true;
            weeklyPools[weekId].qualifierCount += 1;
            emit WeeklyPoolQualified(account, weekId, weeklyTeamVolume[account][weekId]);
        }
    }

    function _maybeUpdateRoyalty(address account) internal {
        if (!royaltyMember[account] && activeDirectCount[account] >= ROYALTY_DIRECTS_REQUIRED) {
            User memory user = users[account];
            if (totalDirectBusiness[account] >= _requiredDirectBusiness(user.packageId)) {
                royaltyMember[account] = true;
                royaltyMembersCount += 1;
                emit RoyaltyQualified(account);
            }
        }
    }

    function _exitDeduction(address account) internal view returns (uint256) {
        User memory user = users[account];
        if (!user.active || user.positionType != POSITION_STAKE) revert NotStakeUser();
        uint256 elapsed = block.timestamp - user.activationTime;
        uint16 bps = elapsed < 90 days ? 2_500 : elapsed < 180 days ? 1_500 : 500;
        return (user.stakeAmount * bps) / BPS;
    }
}
