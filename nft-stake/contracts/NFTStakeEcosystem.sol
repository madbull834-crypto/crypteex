// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NFTStakeEcosystem
 * @dev Production-grade NFT staking ecosystem with ROI, performance boosters, and claim policies
 * 
 * ARCHITECTURE OVERVIEW:
 * - Three staking tiers: SILVER (1k-5k USDT), GOLD (5k-10k USDT), DIAMOND (10k+ USDT)
 * - Reward rates: SILVER 4%, GOLD 5%, DIAMOND 6%
 * - Direct reward: 5% one-time to sponsor
 * - ROI plans: 10% (3-month), 5% (6-month), 2% (9-month)
 * - Performance boosters: +1% at 3X milestone, +2% at 10X milestone
 * - Claim policy: Max 2 claims per calendar month
 * - Ecosystem stability: 25% (<90d), 15% (<180d), 5% (180d+)
 * - Withdrawal deduction: 5% on reward withdrawals
 * 
 * INTERNAL ACCOUNTING:
 * - totalStakeBalance: All user staked funds
 * - platformFeeBalance: Accumulated platform fees
 * - rewardPoolBalance: Available for ROI payouts
 * - deductionFundBalance: Accumulated from withdrawals
 * - ecosystemStabilityFundBalance: Accumulated from early exits
 * 
 * SECURITY:
 * - Reentrancy guards on withdrawal functions
 * - Pausable for emergency stop
 * - No unbounded loops
 * - SafeERC20 for token transfers
 * - Internal accounting pattern (withdraw/claim)
 */

contract NFTStakeEcosystem is ERC721URIStorage, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Constants
    uint256 private constant SECONDS_PER_MONTH = 2_592_000; // 30 days
    uint256 private constant BASIS_POINTS = 10_000; // 100% = 10000
    uint8 private constant USDT_DECIMALS = 6;

    // Package IDs
    uint8 private constant PACKAGE_SILVER = 1;
    uint8 private constant PACKAGE_GOLD = 2;
    uint8 private constant PACKAGE_DIAMOND = 3;

    // ROI Plan IDs
    uint8 private constant ROI_PLAN_10PCT = 1; // 10% for 3 months
    uint8 private constant ROI_PLAN_5PCT = 2;  // 5% for 6 months
    uint8 private constant ROI_PLAN_2PCT = 3;  // 2% for 9 months

    // Staking timeframes for ROI plans
    uint256 private constant LOCK_3_MONTHS = 90 days;
    uint256 private constant LOCK_6_MONTHS = 180 days;
    uint256 private constant LOCK_9_MONTHS = 270 days;

    // ============ STRUCTS ============

    struct Package {
        uint256 minStake;
        uint256 maxStake;
        uint256 platformFee;
        uint16 baseRewardBPS; // Base reward rate in basis points
    }

    struct User {
        uint8 packageId;
        uint256 stakeAmount;
        uint8 roiPlanId;
        address sponsor;
        uint256 activationTime;
        bool active;
        uint256 totalEarned;
        uint256 rewardBalance;
        uint256 tokenId;
        uint256 lastROIClaimTime;
        uint256 totalDirectBusiness;
        uint256 totalTeamBusiness;
        uint16 rewardBoost; // In basis points
    }

    struct ROIPlan {
        uint256 lockDuration;
        uint16 rewardBPS;
        bool active;
    }

    // ============ STATE VARIABLES ============

    IERC20 public usdt;
    address public treasuryWallet;

    // Package configuration
    mapping(uint8 => Package) public packages;

    // ROI Plans
    mapping(uint8 => ROIPlan) public roiPlans;

    // User data
    mapping(address => User) public users;
    mapping(address => uint256) public userIds; // For NFT tracking
    mapping(uint256 => address) public tokenToUser; // For reverse lookup

    // Monthly claim tracking
    mapping(address => mapping(uint256 => uint8)) public monthlyClaimCount;

    // Accounting
    uint256 public totalStakeBalance;
    uint256 public platformFeeBalance;
    uint256 public rewardPoolBalance;
    uint256 public deductionFundBalance;
    uint256 public ecosystemStabilityFundBalance;

    // Configuration
    uint16 public withdrawalDeductionBPS = 500; // 5%
    uint16 public directRewardBPS = 500; // 5%
    
    // Performance booster configuration
    uint16 public booster3XBPS = 100; // +1%
    uint16 public booster10XBPS = 200; // +2%

    uint256 private nextTokenId = 1;

    // ============ EVENTS ============

    event UserJoined(address indexed user, uint8 packageId, uint256 stakeAmount, address sponsor, uint256 tokenId);
    event NFTMinted(address indexed user, uint256 tokenId, uint8 packageId);
    event SponsorSet(address indexed user, address indexed sponsor);
    event DirectRewardCredited(address indexed sponsor, address indexed newUser, uint256 rewardAmount);
    event ROIRewardClaimed(address indexed user, uint256 amount, uint8 roiPlanId);
    event RewardWithdrawn(address indexed user, uint256 grossAmount, uint256 deductionAmount, uint256 netAmount);
    event StakeExited(address indexed user, uint256 stakeAmount, uint256 deductionAmount, uint256 netAmount);
    event PlatformFeeCollected(address indexed user, uint256 amount);
    event PlatformFeesWithdrawn(address indexed to, uint256 amount);
    event PerformanceMilestoneReached(address indexed user, uint8 milestoneType, uint16 boostBPS);
    event RewardBoostUpdated(address indexed user, uint16 newBoostBPS);
    event MonthlyClaimUsed(address indexed user, uint256 monthId, uint8 claimCount);
    event PackageConfigured(uint8 indexed packageId, uint256 minStake, uint256 maxStake, uint16 rewardBPS);
    event TreasuryUpdated(address newTreasuryWallet);
    event RewardPoolFunded(uint256 amount);
    event ContractPaused();
    event ContractUnpaused();

    // ============ CONSTRUCTOR ============

    constructor(
        address _usdt,
        address _treasury
    ) ERC721("NFT Stake Ecosystem", "NFTSTK") Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT address");
        require(_treasury != address(0), "Invalid treasury address");

        usdt = IERC20(_usdt);
        treasuryWallet = _treasury;

        // Initialize packages
        packages[PACKAGE_SILVER] = Package({
            minStake: 1_000 * 10**USDT_DECIMALS,
            maxStake: 5_000 * 10**USDT_DECIMALS,
            platformFee: 50 * 10**USDT_DECIMALS,
            baseRewardBPS: 400 // 4%
        });

        packages[PACKAGE_GOLD] = Package({
            minStake: 5_001 * 10**USDT_DECIMALS,
            maxStake: 10_000 * 10**USDT_DECIMALS,
            platformFee: 100 * 10**USDT_DECIMALS,
            baseRewardBPS: 500 // 5%
        });

        packages[PACKAGE_DIAMOND] = Package({
            minStake: 10_001 * 10**USDT_DECIMALS,
            maxStake: type(uint256).max,
            platformFee: 100 * 10**USDT_DECIMALS,
            baseRewardBPS: 600 // 6%
        });

        // Initialize ROI plans
        roiPlans[ROI_PLAN_10PCT] = ROIPlan({
            lockDuration: LOCK_3_MONTHS,
            rewardBPS: 1_000, // 10%
            active: true
        });

        roiPlans[ROI_PLAN_5PCT] = ROIPlan({
            lockDuration: LOCK_6_MONTHS,
            rewardBPS: 500, // 5%
            active: true
        });

        roiPlans[ROI_PLAN_2PCT] = ROIPlan({
            lockDuration: LOCK_9_MONTHS,
            rewardBPS: 200, // 2%
            active: true
        });
    }

    // ============ USER FUNCTIONS ============

    /**
     * @dev User joins the staking ecosystem
     * @param roiPlanId Selected ROI plan (1, 2, or 3)
     * @param stakeAmount Amount of USDT to stake (determines package)
     * @param sponsor Address of sponsor/referrer (can be address(0))
     */
    function join(
        uint8 roiPlanId,
        uint256 stakeAmount,
        address sponsor
    ) external whenNotPaused nonReentrant {
        require(!users[msg.sender].active, "User already has active stake");
        require(roiPlans[roiPlanId].active, "Invalid ROI plan");
        require(stakeAmount > 0, "Stake amount must be > 0");

        // Determine package from stake amount
        uint8 packageId = _getPackageId(stakeAmount);
        Package memory pkg = packages[packageId];

        require(stakeAmount >= pkg.minStake && stakeAmount <= pkg.maxStake, "Invalid stake amount for package");

        // Verify sponsor is active (if provided)
        if (sponsor != address(0)) {
            require(users[sponsor].active, "Sponsor must be active");
        }

        // Calculate total payment
        uint256 totalPayment = stakeAmount + pkg.platformFee;

        // Transfer USDT from user to contract
        usdt.safeTransferFrom(msg.sender, address(this), totalPayment);

        // Record user data
        User storage user = users[msg.sender];
        user.packageId = packageId;
        user.stakeAmount = stakeAmount;
        user.roiPlanId = roiPlanId;
        user.sponsor = sponsor;
        user.activationTime = block.timestamp;
        user.active = true;
        user.rewardBalance = 0;
        user.totalEarned = 0;
        user.lastROIClaimTime = block.timestamp;
        user.rewardBoost = 0;
        user.totalDirectBusiness = 0;
        user.totalTeamBusiness = 0;

        // Update accounting
        totalStakeBalance += stakeAmount;
        platformFeeBalance += pkg.platformFee;

        // Mint NFT
        uint256 tokenId = nextTokenId++;
        user.tokenId = tokenId;
        userIds[msg.sender] = tokenId;
        tokenToUser[tokenId] = msg.sender;
        _safeMint(msg.sender, tokenId);

        emit NFTMinted(msg.sender, tokenId, packageId);

        // Pay direct reward to sponsor
        if (sponsor != address(0)) {
            _payDirectReward(sponsor, msg.sender, stakeAmount);
        }

        // Update sponsor's team business
        if (sponsor != address(0)) {
            _updateTeamBusiness(sponsor, stakeAmount);
        }

        emit UserJoined(msg.sender, packageId, stakeAmount, sponsor, tokenId);
        emit PlatformFeeCollected(msg.sender, pkg.platformFee);
    }

    /**
     * @dev Pay direct reward to sponsor (5% of stake amount, one-time)
     */
    function _payDirectReward(address sponsor, address newUser, uint256 stakeAmount) internal {
        uint256 rewardAmount = (stakeAmount * directRewardBPS) / BASIS_POINTS;
        users[sponsor].rewardBalance += rewardAmount;
        rewardPoolBalance -= rewardAmount; // Deduct from pool

        emit DirectRewardCredited(sponsor, newUser, rewardAmount);
    }

    /**
     * @dev Update team business volume for sponsor chain
     */
    function _updateTeamBusiness(address sponsor, uint256 amount) internal {
        address current = sponsor;
        
        // Walk up sponsor chain (max 3 levels)
        for (uint256 i = 0; i < 3; i++) {
            if (current == address(0)) break;
            users[current].totalTeamBusiness += amount;
            _checkPerformanceMilestones(current);
            current = users[current].sponsor;
        }
    }

    /**
     * @dev Check and update performance milestone boosts
     */
    function _checkPerformanceMilestones(address user) internal {
        uint256 userStake = users[user].stakeAmount;
        if (userStake == 0) return;

        uint256 teamBusiness = users[user].totalTeamBusiness;
        uint16 currentBoost = users[user].rewardBoost;
        uint16 newBoost = 0;

        // Check 10X milestone first (takes precedence)
        if (teamBusiness >= userStake * 10) {
            newBoost = booster10XBPS;
            if (currentBoost != newBoost) {
                users[user].rewardBoost = newBoost;
                emit PerformanceMilestoneReached(user, 2, newBoost);
                emit RewardBoostUpdated(user, newBoost);
            }
        }
        // Check 3X milestone
        else if (teamBusiness >= userStake * 3) {
            newBoost = booster3XBPS;
            if (currentBoost != newBoost) {
                users[user].rewardBoost = newBoost;
                emit PerformanceMilestoneReached(user, 1, newBoost);
                emit RewardBoostUpdated(user, newBoost);
            }
        }
    }

    /**
     * @dev Determine package ID from stake amount
     */
    function _getPackageId(uint256 stakeAmount) internal view returns (uint8) {
        if (stakeAmount >= packages[PACKAGE_DIAMOND].minStake) {
            return PACKAGE_DIAMOND;
        } else if (stakeAmount >= packages[PACKAGE_GOLD].minStake) {
            return PACKAGE_GOLD;
        } else if (stakeAmount >= packages[PACKAGE_SILVER].minStake) {
            return PACKAGE_SILVER;
        }
        revert("Invalid stake amount");
    }

    /**
     * @dev Claim ROI reward based on lock duration and plan
     */
    function claimROIReward() external whenNotPaused nonReentrant {
        User storage user = users[msg.sender];
        require(user.active, "User not active");

        // Check monthly claim limit
        uint256 monthId = block.timestamp / SECONDS_PER_MONTH;
        require(monthlyClaimCount[msg.sender][monthId] < 2, "Monthly claim limit reached");

        // Get ROI plan
        ROIPlan memory plan = roiPlans[user.roiPlanId];
        require(plan.active, "ROI plan not active");

        // Check lock duration
        uint256 timeElapsed = block.timestamp - user.activationTime;
        require(timeElapsed >= plan.lockDuration, "Lock period not met");

        // Calculate pending reward
        uint256 pendingReward = _calculatePendingROIReward(msg.sender);
        require(pendingReward > 0, "No pending reward");

        // Prevent double claim by updating lastROIClaimTime
        user.lastROIClaimTime = block.timestamp;

        // Add reward to user's balance
        user.rewardBalance += pendingReward;
        user.totalEarned += pendingReward;
        rewardPoolBalance -= pendingReward;

        // Increment monthly claim count
        monthlyClaimCount[msg.sender][monthId]++;

        emit ROIRewardClaimed(msg.sender, pendingReward, user.roiPlanId);
        emit MonthlyClaimUsed(msg.sender, monthId, monthlyClaimCount[msg.sender][monthId]);
    }

    /**
     * @dev Calculate pending ROI reward for user
     */
    function pendingROIReward(address user) external view returns (uint256) {
        return _calculatePendingROIReward(user);
    }

    function _calculatePendingROIReward(address user) internal view returns (uint256) {
        User memory userData = users[user];
        if (!userData.active) return 0;

        ROIPlan memory plan = roiPlans[userData.roiPlanId];
        if (!plan.active) return 0;

        // Calculate pending based on stake, plan reward rate, and boosts
        uint256 stakeAmount = userData.stakeAmount;
        
        // Total reward rate = base reward + boost
        uint16 totalRewardBPS = packages[userData.packageId].baseRewardBPS + userData.rewardBoost;
        uint16 planRewardBPS = plan.rewardBPS;
        
        // Combined reward
        uint256 combinedRewardBPS = (uint256(totalRewardBPS) * planRewardBPS) / BASIS_POINTS;
        
        uint256 roiReward = (stakeAmount * combinedRewardBPS) / BASIS_POINTS;
        
        return roiReward;
    }

    /**
     * @dev Withdraw accumulated reward balance
     * Applies 5% withdrawal deduction
     */
    function withdrawRewards(uint256 amount) external whenNotPaused nonReentrant {
        User storage user = users[msg.sender];
        require(user.active, "User not active");
        require(amount > 0, "Amount must be > 0");
        require(user.rewardBalance >= amount, "Insufficient reward balance");

        // Calculate deduction
        uint256 deductionAmount = (amount * withdrawalDeductionBPS) / BASIS_POINTS;
        uint256 netAmount = amount - deductionAmount;

        // Update balances
        user.rewardBalance -= amount;
        deductionFundBalance += deductionAmount;

        // Transfer to user
        usdt.safeTransfer(msg.sender, netAmount);

        emit RewardWithdrawn(msg.sender, amount, deductionAmount, netAmount);
    }

    /**
     * @dev Exit stake position with ecosystem stability deduction
     * Deduction schedule:
     * - Before 90 days: 25%
     * - Before 180 days: 15%
     * - From 180 days onward: 5%
     */
    function exitStake() external whenNotPaused nonReentrant {
        User storage user = users[msg.sender];
        require(user.active, "User not active or already exited");

        uint256 stakeAmount = user.stakeAmount;
        uint256 deductionAmount = _calculateExitDeduction(msg.sender);
        uint256 netAmount = stakeAmount - deductionAmount;

        // Mark user as inactive
        user.active = false;

        // Update accounting
        totalStakeBalance -= stakeAmount;
        ecosystemStabilityFundBalance += deductionAmount;

        // Burn NFT
        uint256 tokenId = user.tokenId;
        _burn(tokenId);
        delete tokenToUser[tokenId];

        // Transfer net stake to user
        usdt.safeTransfer(msg.sender, netAmount);

        emit StakeExited(msg.sender, stakeAmount, deductionAmount, netAmount);
    }

    /**
     * @dev Calculate exit deduction based on time held
     */
    function calculateExitDeduction(address user) external view returns (uint256) {
        return _calculateExitDeduction(user);
    }

    function _calculateExitDeduction(address user) internal view returns (uint256) {
        User memory userData = users[user];
        require(userData.active, "User not active");

        uint256 stakeAmount = userData.stakeAmount;
        uint256 timeElapsed = block.timestamp - userData.activationTime;

        uint16 deductionBPS;
        if (timeElapsed < 90 days) {
            deductionBPS = 2_500; // 25%
        } else if (timeElapsed < 180 days) {
            deductionBPS = 1_500; // 15%
        } else {
            deductionBPS = 500; // 5%, applies indefinitely after 180 days
        }

        return (stakeAmount * deductionBPS) / BASIS_POINTS;
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @dev Pause contract (emergency stop)
     */
    function pauseContract() external onlyOwner {
        _pause();
        emit ContractPaused();
    }

    /**
     * @dev Unpause contract
     */
    function unpauseContract() external onlyOwner {
        _unpause();
        emit ContractUnpaused();
    }

    /**
     * @dev Update treasury wallet
     */
    function setTreasuryWallet(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury address");
        treasuryWallet = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @dev Update base NFT URI
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        // Store in a state variable if needed
        // This is simplified; full implementation would store baseURI
        // and override tokenURI() to return baseURI + tokenId
    }

    /**
     * @dev Update withdrawal deduction percentage
     */
    function setWithdrawalDeductionBPS(uint16 newBPS) external onlyOwner {
        require(newBPS <= BASIS_POINTS, "Invalid basis points");
        withdrawalDeductionBPS = newBPS;
    }

    /**
     * @dev Update direct reward percentage
     */
    function setDirectRewardBPS(uint16 newBPS) external onlyOwner {
        require(newBPS <= BASIS_POINTS, "Invalid basis points");
        directRewardBPS = newBPS;
    }

    /**
     * @dev Update performance booster percentages
     */
    function setPerformanceBoostBPS(uint16 _3XBPS, uint16 _10XBPS) external onlyOwner {
        require(_3XBPS <= BASIS_POINTS && _10XBPS <= BASIS_POINTS, "Invalid basis points");
        booster3XBPS = _3XBPS;
        booster10XBPS = _10XBPS;
    }

    /**
     * @dev Add funds to reward pool
     */
    function fundRewardPool(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        rewardPoolBalance += amount;
        emit RewardPoolFunded(amount);
    }

    /**
     * @dev Withdraw platform fees only
     * Cannot withdraw user stakes or rewards
     */
    function withdrawPlatformFees(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(platformFeeBalance >= amount, "Insufficient platform fee balance");

        platformFeeBalance -= amount;
        usdt.safeTransfer(to, amount);

        emit PlatformFeesWithdrawn(to, amount);
    }

    /**
     * @dev Withdraw from deduction fund
     */
    function withdrawDeductionFund(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(deductionFundBalance >= amount, "Insufficient deduction fund balance");

        deductionFundBalance -= amount;
        usdt.safeTransfer(to, amount);
    }

    /**
     * @dev Withdraw from ecosystem stability fund
     */
    function withdrawEcosystemStabilityFund(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(ecosystemStabilityFundBalance >= amount, "Insufficient stability fund balance");

        ecosystemStabilityFundBalance -= amount;
        usdt.safeTransfer(to, amount);
    }

    /**
     * @dev Emergency rescue non-USDT tokens
     */
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(usdt), "Cannot rescue USDT");
        require(to != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(to, amount);
    }

    // ============ VIEW FUNCTIONS ============

    function getUser(address userAddr) external view returns (User memory) {
        return users[userAddr];
    }

    function getPackage(uint8 packageId) external view returns (Package memory) {
        return packages[packageId];
    }

    function getUserPackage(address userAddr) external view returns (uint8) {
        return users[userAddr].packageId;
    }

    function getUserStake(address userAddr) external view returns (uint256) {
        return users[userAddr].stakeAmount;
    }

    function getSponsor(address userAddr) external view returns (address) {
        return users[userAddr].sponsor;
    }

    function getDirectBusiness(address userAddr) external view returns (uint256) {
        return users[userAddr].totalDirectBusiness;
    }

    function getTeamBusiness(address userAddr) external view returns (uint256) {
        return users[userAddr].totalTeamBusiness;
    }

    function getUserRewardBoost(address userAddr) external view returns (uint16) {
        return users[userAddr].rewardBoost;
    }

    function getMonthlyClaimCount(address userAddr, uint256 monthId) external view returns (uint8) {
        return monthlyClaimCount[userAddr][monthId];
    }

    function canClaimThisMonth(address userAddr) external view returns (bool) {
        uint256 monthId = block.timestamp / SECONDS_PER_MONTH;
        return monthlyClaimCount[userAddr][monthId] < 2;
    }

    function getContractBalances() external view returns (
        uint256 totalStake,
        uint256 platformFees,
        uint256 rewardPool,
        uint256 deductionFund,
        uint256 stabilityFund
    ) {
        return (
            totalStakeBalance,
            platformFeeBalance,
            rewardPoolBalance,
            deductionFundBalance,
            ecosystemStabilityFundBalance
        );
    }

    function tokenOfUser(address userAddr) external view returns (uint256) {
        return users[userAddr].tokenId;
    }

    function getUserRewardBalance(address userAddr) external view returns (uint256) {
        return users[userAddr].rewardBalance;
    }

    function getUserTotalEarned(address userAddr) external view returns (uint256) {
        return users[userAddr].totalEarned;
    }
}
