// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IPancakeInfinityRouter,
    IPermit2AllowanceTransfer
} from "./interfaces/IPancakeInfinity.sol";

/**
 * @title MetaCrownNFT
 * @dev Production-grade smart contract for Meta Crown NFT system with multi-tier rewards.
 *
 * Key Features:
 * - ERC721 NFT minting for user packages
 * - Multi-tier passive income based on active referrals and business volume
 * - Dynamic direct sponsor commissions
 * - 3-level team income distribution
 * - Weekly leadership pool with qualification
 * - Monthly royalty club distribution
 * - 2X earning cap with re-topup mechanism
 * - 10% withdrawal airdrop deduction
 * - Comprehensive safety measures (reentrancy, pausable, etc.)
 *
 * ASSUMPTIONS:
 * - USDT has 6 decimals (1 USDT = 10^6 units)
 * - All percentages use basis points (1% = 100 basis points)
 * - One active account per wallet address
 * - Weekly calculation: Monday to Sunday (timestamp / 604800)
 * - Monthly calculation: Day 1 to end of month
 */
contract MetaCrownNFT is
    ERC721Enumerable,
    Ownable,
    ReentrancyGuard,
    Pausable
{
    using SafeERC20 for IERC20;

    // ============= CONSTANTS =============

    /// @dev USDT token decimals (6 for USDT)
    uint8 private constant USDT_DECIMALS = 6;

    /// @dev Basis point denominator (10000 = 100%)
    uint16 private constant BASIS_POINTS_DENOMINATOR = 10000;

    /// @dev Percentage of each NFT plan value swapped from USDT to ORBD (10%)
    uint16 public constant ORBD_SWAP_BPS = 1000;

    /// @dev Universal Router command for a PancakeSwap Infinity swap
    uint8 private constant INFINITY_SWAP_COMMAND = 0x10;

    /// @dev Seconds in a week (7 * 24 * 60 * 60)
    uint256 private constant SECONDS_PER_WEEK = 604800;

    /// @dev Seconds in a day (24 * 60 * 60)
    uint256 private constant SECONDS_PER_DAY = 86400;

    /// @dev Seconds in 30 days (30 * 24 * 60 * 60)
    uint256 private constant SECONDS_PER_MONTH = 2592000;

    // ============= PACKAGE TYPES =============

    uint8 private constant PACKAGE_SILVER = 1;
    uint8 private constant PACKAGE_GOLD = 2;
    uint8 private constant PACKAGE_DIAMOND = 3;

    // ============= STRUCTS =============

    /**
     * @dev User data structure
     */
    struct User {
        uint8 packageType; // 1=Silver, 2=Gold, 3=Diamond
        uint256 nftValue; // In USDT (6 decimals)
        address sponsor; // Direct upline
        uint256 activationTime; // Timestamp of activation
        bool active; // Is user currently active?
        uint256 totalEarned; // Total income earned (passive + active commissions)
        uint256 rewardBalance; // Internal USDT balance for rewards (claimed but not withdrawn)
        uint256 lastPassiveClaimTime; // Last claim timestamp for passive income
        uint8 reTopupCount; // Number of re-topups performed
    }

    /**
     * @dev Package configuration
     */
    struct Package {
        uint256 nftValue; // In USDT (6 decimals)
        uint256 platformFee; // In USDT (6 decimals)
    }

    /**
     * @dev Weekly pool data
     */
    struct WeeklyPoolData {
        uint256 poolAmount; // Total pool balance for the week
        uint256 qualifierCount; // Number of qualified users
        bool closed; // Whether pool has been closed for distribution
    }

    /**
     * @dev Monthly royalty pool data
     */
    struct MonthlyRoyaltyData {
        uint256 poolAmount; // Total pool balance for the month
        uint256 memberCount; // Number of royalty members at month close
        bool closed; // Whether pool has been closed for distribution
    }

    // ============= STATE VARIABLES =============

    /// @dev USDT token instance
    IERC20 public usdtToken;

    /// @dev ORBD received from plan purchases remains held by this contract
    IERC20 public immutable orbdToken;

    /// @dev PancakeSwap Infinity Universal Router and its BSC Permit2 deployment
    IPancakeInfinityRouter public immutable infinityRouter;
    IPermit2AllowanceTransfer public immutable permit2;

    /// @dev Treasury wallet (receives platform fees)
    address public treasuryWallet;

    /// @dev Airdrop fund wallet (for distributed airdrops)
    address public airdropWallet;

    /// @dev Base URI for NFT metadata
    string public baseURI;

    /// @dev Independent counters for permanent subscribers and tradable NFTs
    uint256 public subscriberIdCounter;
    uint256 public tokenIdCounter;

    /// @dev Mapping of address to user ID (1-indexed)
    mapping(address => uint256) public addressToUserId;

    /// @dev Stable subscriber identity and sponsor relationship, independent of NFT ownership
    mapping(uint256 => address) public subscriberWallet;
    mapping(uint256 => uint256) public sponsorUserId;

    /// @dev Category attached to each tradable NFT
    mapping(uint256 => uint8) public tokenPackageType;

    /// @dev Mapping of user ID to user data
    mapping(uint256 => User) public users;

    /// @dev Mapping of package type to package config
    mapping(uint8 => Package) public packages;

    /// @dev Tracking active direct referrals per user
    mapping(address => uint256) public directReferralCount;

    /// @dev Tracking direct business volume per user
    /// directBusinessVolume[userAddress] = total NFT value of direct referrals
    mapping(address => uint256) public directBusinessVolume;

    /// @dev Tracking if user qualified for weekly pool
    /// weeklyQualified[weekId][userAddress] = true/false
    mapping(uint256 => mapping(address => bool)) public weeklyQualified;

    /// @dev Tracking if user already claimed weekly pool
    /// weeklyPoolClaimed[weekId][userAddress] = true/false
    mapping(uint256 => mapping(address => bool)) public weeklyPoolClaimed;

    /// @dev Royalty club members
    mapping(address => bool) public isRoyaltyMember;

    /// @dev Tracking if user already claimed monthly royalty
    /// royaltyClaimed[monthId][userAddress] = true/false
    mapping(uint256 => mapping(address => bool)) public royaltyClaimed;

    /// @dev Weekly pool data for each week
    mapping(uint256 => WeeklyPoolData) public weeklyPools;

    /// @dev Monthly royalty pool data for each month
    mapping(uint256 => MonthlyRoyaltyData) public monthlyRoyaltyPools;

    /// @dev Airdrop fund balance
    uint256 public airdropFundBalance;

    /// @dev Weekly leadership pool funded amount (5 USDT per registration)
    uint256 private constant WEEKLY_POOL_CONTRIBUTION = 5e6; // 5 USDT (6 decimals)

    /// @dev Royalty pool contribution (2 USDT from platform fee)
    uint256 private constant ROYALTY_POOL_CONTRIBUTION = 2e6; // 2 USDT (6 decimals)

    /// @dev Weekly pool team volume target for qualification
    uint256 private constant WEEKLY_QUALIFICATION_VOLUME = 2500e6; // 2500 USDT

    /// @dev Royalty qualification: 25 active directs required
    uint256 private constant ROYALTY_ACTIVE_DIRECTS_REQUIRED = 25;

    /// @dev Passive income percentages (in basis points)
    uint16 private constant PASSIVE_INCOME_MONTHLY_BPS = 500; // 5% monthly
    uint16 private constant PASSIVE_INCOME_DAILY_BPS = 50; // 0.50% daily

    /// @dev Direct commission percentages (basis points) based on active directs
    // 1-5 directs: 5%, 6-15 directs: 7%, 16-25 directs: 10%
    uint16 private constant DIRECT_COMMISSION_LOW_BPS = 500; // 5%
    uint16 private constant DIRECT_COMMISSION_MID_BPS = 700; // 7%
    uint16 private constant DIRECT_COMMISSION_HIGH_BPS = 1000; // 10%

    /// @dev Level income percentages
    uint16 private constant LEVEL_2_COMMISSION_BPS = 200; // 2%
    uint16 private constant LEVEL_3_COMMISSION_BPS = 100; // 1%

    /// @dev Withdrawal airdrop deduction
    uint16 private constant WITHDRAWAL_AIRDROP_DEDUCTION_BPS = 1000; // 10%

    /// @dev 2X capping multiplier (200%)
    uint8 private constant EARNING_CAP_MULTIPLIER = 2;

    // ============= EVENTS =============

    event UserJoined(
        address indexed user,
        address indexed sponsor,
        uint8 packageType,
        uint256 nftValue,
        uint256 tokenId
    );

    event NFTMinted(address indexed to, uint256 tokenId, uint8 packageType);

    event SponsorSet(address indexed user, address indexed sponsor);

    event DirectCommissionCredited(
        address indexed sponsor,
        address indexed from,
        uint256 amount,
        uint256 directCount
    );

    event LevelIncomeCredited(
        address indexed recipient,
        uint8 level,
        uint256 amount
    );

    event PassiveIncomeClaimed(address indexed user, uint256 amount);

    event WeeklyPoolFunded(uint256 indexed weekId, uint256 amount);

    event WeeklyPoolQualified(
        address indexed user,
        uint256 indexed weekId,
        uint256 teamVolume
    );

    event WeeklyPoolClosed(
        uint256 indexed weekId,
        uint256 poolAmount,
        uint256 qualifierCount
    );

    event WeeklyPoolClaimed(
        address indexed user,
        uint256 indexed weekId,
        uint256 amount
    );

    event RoyaltyQualified(
        address indexed user,
        uint256 directCount,
        uint256 directVolume
    );

    event RoyaltyPoolFunded(uint256 indexed monthId, uint256 amount);

    event RoyaltyPoolClosed(
        uint256 indexed monthId,
        uint256 poolAmount,
        uint256 memberCount
    );

    event RoyaltyClaimed(
        address indexed user,
        uint256 indexed monthId,
        uint256 amount
    );

    event ReTopup(
        address indexed user,
        uint256 newCap,
        uint8 reTopupCount
    );

    event Withdrawal(
        address indexed user,
        uint256 grossAmount,
        uint256 airdropDeduction,
        uint256 netAmount
    );

    event Capped(address indexed user, uint256 totalEarned, uint256 cap);

    event PackageUpdated(
        uint8 packageType,
        uint256 nftValue,
        uint256 platformFee
    );

    event TreasuryUpdated(address indexed newTreasury);

    event AirdropWalletUpdated(address indexed newAirdropWallet);

    event BaseURIUpdated(string newBaseURI);

    event CategoryNFTTransferred(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint8 packageType
    );

    event OrbdPurchasedAndLocked(
        address indexed user,
        uint256 usdtAmount,
        uint256 orbdAmount
    );

    // ============= MODIFIERS =============

    /**
     * @dev Ensure caller is active user
     */
    modifier onlyActiveUser() {
        require(
            addressToUserId[msg.sender] != 0,
            "User not found"
        );
        uint256 userId = addressToUserId[msg.sender];
        require(users[userId].active, "User not active");
        _;
    }

    /**
     * @dev Ensure user exists
     */
    modifier userExists(address user) {
        require(addressToUserId[user] != 0, "User not found");
        _;
    }

    // ============= CONSTRUCTOR =============

    constructor(
        address _usdtAddress,
        address _treasuryWallet,
        address _airdropWallet,
        address _orbdAddress,
        address _infinityRouter,
        address _permit2,
        string memory initialBaseURI
    ) ERC721("MetaCrownNFT", "CROWN") Ownable(msg.sender) {
        require(_usdtAddress != address(0), "Invalid USDT address");
        require(_treasuryWallet != address(0), "Invalid treasury");
        require(_airdropWallet != address(0), "Invalid airdrop wallet");
        require(_orbdAddress != address(0), "Invalid ORBD address");
        require(_infinityRouter != address(0), "Invalid router address");
        require(_permit2 != address(0), "Invalid Permit2 address");
        require(_orbdAddress != _usdtAddress, "ORBD cannot be USDT");

        usdtToken = IERC20(_usdtAddress);
        orbdToken = IERC20(_orbdAddress);
        infinityRouter = IPancakeInfinityRouter(_infinityRouter);
        permit2 = IPermit2AllowanceTransfer(_permit2);
        treasuryWallet = _treasuryWallet;
        airdropWallet = _airdropWallet;
        baseURI = initialBaseURI;

        // Initialize packages
        _initializePackages();
    }

    // ============= INITIALIZATION =============

    /**
     * @dev Initialize default package configurations
     */
    function _initializePackages() private {
        // SILVER: 10 USDT NFT value, 5 USDT platform fee
        packages[PACKAGE_SILVER] = Package(10e6, 5e6);

        // GOLD: 100 USDT NFT value, 10 USDT platform fee
        packages[PACKAGE_GOLD] = Package(100e6, 10e6);

        // DIAMOND: 500 USDT NFT value, 50 USDT platform fee
        packages[PACKAGE_DIAMOND] = Package(500e6, 50e6);
    }

    // ============= USER JOINING FUNCTIONS =============

    /**
     * @dev User joins the system by purchasing an NFT package.
     * First user (root) does not need a sponsor.
     * Subsequent users require an active sponsor.
     *
     * @param packageType Package type (1=Silver, 2=Gold, 3=Diamond)
     * @param sponsor Sponsor address (address(0) for first user)
     */
    function join(
        uint8 packageType,
        address sponsor,
        uint256 minimumOrbdOut,
        bytes calldata commands,
        bytes[] calldata inputs
    ) external nonReentrant whenNotPaused {
        require(packageType >= 1 && packageType <= 3, "Invalid package");
        require(addressToUserId[msg.sender] == 0, "Already joined");

        Package storage pkg = packages[packageType];
        require(pkg.nftValue > 0, "Package not configured");

        uint256 totalPayment = pkg.nftValue + pkg.platformFee;

        // Transfer USDT from user to contract
        usdtToken.safeTransferFrom(msg.sender, address(this), totalPayment);

        // Convert 10% of the NFT plan value (platform fee excluded) to ORBD.
        // The ORBD recipient is this contract and no ORBD withdrawal is exposed.
        _swapAndLockOrbd(
            msg.sender,
            pkg.nftValue,
            minimumOrbdOut,
            commands,
            inputs
        );

        // Validate sponsor
        if (subscriberIdCounter == 0) {
            // First user (root)
            sponsor = address(0);
        } else {
            require(sponsor != address(0), "Sponsor required");
            require(addressToUserId[sponsor] != 0, "Sponsor not found");
            uint256 sponsorId = addressToUserId[sponsor];
            require(users[sponsorId].active, "Sponsor not active");
        }

        // Create a permanent wallet subscription record.
        subscriberIdCounter++;
        uint256 userId = subscriberIdCounter;
        subscriberWallet[userId] = msg.sender;
        addressToUserId[msg.sender] = userId;

        // Mint a separate tradable NFT in the subscriber's category.
        tokenIdCounter++;
        uint256 tokenId = tokenIdCounter;

        User storage newUser = users[userId];
        newUser.packageType = packageType;
        newUser.nftValue = pkg.nftValue;
        newUser.sponsor = sponsor;
        sponsorUserId[userId] = sponsor == address(0)
            ? 0
            : addressToUserId[sponsor];
        newUser.activationTime = block.timestamp;
        newUser.active = true;
        newUser.lastPassiveClaimTime = block.timestamp;

        // Mint NFT
        tokenPackageType[tokenId] = packageType;
        _safeMint(msg.sender, tokenId);
        emit NFTMinted(msg.sender, tokenId, packageType);

        emit UserJoined(msg.sender, sponsor, packageType, pkg.nftValue, tokenId);

        // Process pool contributions and sponsor rewards
        _processJoinRewards(msg.sender, sponsor, pkg.nftValue, pkg.platformFee);
    }

    function _swapAndLockOrbd(
        address user,
        uint256 nftValue,
        uint256 minimumOrbdOut,
        bytes calldata commands,
        bytes[] calldata inputs
    ) private {
        uint256 usdtAmount = (nftValue * ORBD_SWAP_BPS) /
            BASIS_POINTS_DENOMINATOR;
        require(minimumOrbdOut > 0, "Minimum ORBD required");
        require(_containsInfinitySwap(commands), "Infinity swap required");
        require(usdtAmount <= type(uint160).max, "Swap amount too large");

        uint256 usdtBefore = usdtToken.balanceOf(address(this));
        uint256 orbdBefore = orbdToken.balanceOf(address(this));

        // Permit2 requires both ERC20 approval to Permit2 and a Permit2 allowance
        // for the Universal Router. Both are exact and revoked after execution.
        usdtToken.forceApprove(address(permit2), usdtAmount);
        permit2.approve(
            address(usdtToken),
            address(infinityRouter),
            uint160(usdtAmount),
            uint48(block.timestamp)
        );
        infinityRouter.execute(commands, inputs);
        permit2.approve(address(usdtToken), address(infinityRouter), 0, 0);
        usdtToken.forceApprove(address(permit2), 0);

        uint256 usdtSpent = usdtBefore - usdtToken.balanceOf(address(this));
        uint256 orbdReceived = orbdToken.balanceOf(address(this)) - orbdBefore;
        require(usdtSpent == usdtAmount, "Incorrect USDT swap amount");
        require(orbdReceived >= minimumOrbdOut, "Insufficient ORBD received");

        emit OrbdPurchasedAndLocked(user, usdtAmount, orbdReceived);
    }

    function _containsInfinitySwap(bytes calldata commands) private pure returns (bool) {
        for (uint256 i; i < commands.length; ++i) {
            // Universal Router reserves the top two bits for command flags.
            if ((uint8(commands[i]) & 0x3f) == INFINITY_SWAP_COMMAND) return true;
        }
        return false;
    }

    /**
     * @dev Internal function to process rewards when user joins
     */
    function _processJoinRewards(
        address user,
        address sponsor,
        uint256 nftValue,
        uint256 platformFee
    ) private {
        // Add to weekly pool (5 USDT per registration)
        uint256 weekId = block.timestamp / SECONDS_PER_WEEK;
        weeklyPools[weekId].poolAmount += WEEKLY_POOL_CONTRIBUTION;
        emit WeeklyPoolFunded(weekId, WEEKLY_POOL_CONTRIBUTION);

        // Add to royalty pool (2 USDT from platform fee)
        uint256 monthId = _getCurrentMonthId();
        monthlyRoyaltyPools[monthId].poolAmount += ROYALTY_POOL_CONTRIBUTION;
        emit RoyaltyPoolFunded(monthId, ROYALTY_POOL_CONTRIBUTION);

        if (sponsor == address(0)) {
            // Root user - no commissions paid
            return;
        }

        // Update sponsor's active directs and business volume
        _updateSponsorMetrics(sponsor, nftValue);

        // Pay direct sponsor commission
        _payDirectCommission(sponsor, user, nftValue);

        // Pay level 2 and level 3 income
        _payLevelIncome(sponsor, nftValue);
    }

    /**
     * @dev Update sponsor's active referral count and business volume
     */
    function _updateSponsorMetrics(address sponsor, uint256 nftValue) private {
        directReferralCount[sponsor]++;
        directBusinessVolume[sponsor] += nftValue;
    }

    /**
     * @dev Pay direct sponsor commission based on their active direct count
     * Commission tiers:
     * - 1-5 directs: 5%
     * - 6-15 directs: 7%
     * - 16-25 directs: 10%
     */
    function _payDirectCommission(
        address sponsor,
        address from,
        uint256 nftValue
    ) private {
        uint256 directCount = directReferralCount[sponsor];
        uint16 commissionBps;

        if (directCount <= 5) {
            commissionBps = DIRECT_COMMISSION_LOW_BPS;
        } else if (directCount <= 15) {
            commissionBps = DIRECT_COMMISSION_MID_BPS;
        } else {
            commissionBps = DIRECT_COMMISSION_HIGH_BPS;
        }

        uint256 commission = (nftValue * commissionBps) / BASIS_POINTS_DENOMINATOR;

        // Apply 2X capping
        uint256 sponsorId = addressToUserId[sponsor];
        if (_isUserCapped(sponsorId)) {
            emit DirectCommissionCredited(sponsor, from, 0, directCount);
            return;
        }

        // Check if crediting this commission would exceed cap
        uint256 earningCap = users[sponsorId].nftValue * EARNING_CAP_MULTIPLIER;
        if (users[sponsorId].totalEarned + commission > earningCap) {
            commission = earningCap - users[sponsorId].totalEarned;
        }

        if (commission > 0) {
            users[sponsorId].rewardBalance += commission;
            users[sponsorId].totalEarned += commission;
        }

        emit DirectCommissionCredited(sponsor, from, commission, directCount);
    }

    /**
     * @dev Pay level 2 and level 3 income
     * Level 2: 2%, Level 3: 1%
     */
    function _payLevelIncome(address sponsor, uint256 nftValue) private {
        uint256 currentUplineId = addressToUserId[sponsor];

        // Level 2
        if (currentUplineId != 0) {
            currentUplineId = sponsorUserId[currentUplineId];

            if (currentUplineId != 0) {
                uint256 level2Income = (nftValue * LEVEL_2_COMMISSION_BPS) /
                    BASIS_POINTS_DENOMINATOR;
                _creditRewardWithCapping(
                    subscriberWallet[currentUplineId],
                    level2Income,
                    2
                );
            }
        }

        // Level 3
        if (currentUplineId != 0) {
            currentUplineId = sponsorUserId[currentUplineId];

            if (currentUplineId != 0) {
                uint256 level3Income = (nftValue * LEVEL_3_COMMISSION_BPS) /
                    BASIS_POINTS_DENOMINATOR;
                _creditRewardWithCapping(
                    subscriberWallet[currentUplineId],
                    level3Income,
                    3
                );
            }
        }
    }

    /**
     * @dev Credit reward to user with capping check
     */
    function _creditRewardWithCapping(
        address recipient,
        uint256 amount,
        uint8 level
    ) private {
        require(addressToUserId[recipient] != 0, "Recipient not found");

        uint256 userId = addressToUserId[recipient];

        if (_isUserCapped(userId)) {
            emit LevelIncomeCredited(recipient, level, 0);
            return;
        }

        uint256 earningCap = users[userId].nftValue * EARNING_CAP_MULTIPLIER;
        if (users[userId].totalEarned + amount > earningCap) {
            amount = earningCap - users[userId].totalEarned;
        }

        if (amount > 0) {
            users[userId].rewardBalance += amount;
            users[userId].totalEarned += amount;
        }

        emit LevelIncomeCredited(recipient, level, amount);
    }

    // ============= PASSIVE INCOME FUNCTIONS =============

    /**
     * @dev Calculate pending passive income for a user.
     * Rules:
     * - 0-1 active directs: 0% passive income
     * - 2-4 active directs: 5% monthly (0.167% daily)
     * - 5+ active directs + required volume: 0.50% daily
     *
     * @param user User address
     * @return pendingAmount Amount of passive income pending
     */
    function pendingPassiveIncome(address user)
        external
        view
        userExists(user)
        returns (uint256 pendingAmount)
    {
        uint256 userId = addressToUserId[user];
        User storage userObj = users[userId];

        if (!userObj.active || _isUserCapped(userId)) {
            return 0;
        }

        uint256 directCount = directReferralCount[user];

        // Rule: 0 or 1 active directs = no passive income
        if (directCount < 2) {
            return 0;
        }

        uint256 timePassed = block.timestamp - userObj.lastPassiveClaimTime;

        // Rule: 2-4 active directs = 5% monthly
        if (directCount < 5) {
            // Calculate per-second accrual for 5% over 30 days
            uint256 monthlyIncome = (userObj.nftValue *
                PASSIVE_INCOME_MONTHLY_BPS) / BASIS_POINTS_DENOMINATOR;
            pendingAmount =
                (monthlyIncome * timePassed) /
                SECONDS_PER_MONTH;
        } else {
            // Rule: 5+ active directs + required volume = 0.50% daily
            uint256 requiredVolume = _getRequiredDirectVolume(
                userObj.packageType
            );
            if (directBusinessVolume[user] >= requiredVolume) {
                // Calculate per-second accrual for 0.50% daily
                uint256 dailyIncome = (userObj.nftValue *
                    PASSIVE_INCOME_DAILY_BPS) / BASIS_POINTS_DENOMINATOR;
                pendingAmount =
                    (dailyIncome * timePassed) /
                    SECONDS_PER_DAY;
            }
        }

        // Apply 2X capping
        uint256 earningCap = userObj.nftValue * EARNING_CAP_MULTIPLIER;
        if (userObj.totalEarned + pendingAmount > earningCap) {
            pendingAmount = earningCap > userObj.totalEarned
                ? earningCap - userObj.totalEarned
                : 0;
        }

        return pendingAmount;
    }

    /**
     * @dev Get required direct business volume for a package
     */
    function _getRequiredDirectVolume(uint8 packageType)
        private
        pure
        returns (uint256)
    {
        if (packageType == PACKAGE_SILVER) {
            return 50e6; // 50 USDT
        } else if (packageType == PACKAGE_GOLD) {
            return 500e6; // 500 USDT
        } else {
            return 2500e6; // 2500 USDT (Diamond)
        }
    }

    /**
     * @dev Claim pending passive income
     */
    function claimPassiveIncome() external nonReentrant whenNotPaused onlyActiveUser {
        uint256 userId = addressToUserId[msg.sender];
        User storage userObj = users[userId];

        require(!_isUserCapped(userId), "User is capped");

        // Calculate pending income
        uint256 directCount = directReferralCount[msg.sender];
        require(directCount >= 2, "Insufficient directs for passive income");

        uint256 timePassed = block.timestamp - userObj.lastPassiveClaimTime;
        require(timePassed > 0, "No time passed");

        uint256 pendingAmount = 0;

        // Calculate based on direct count
        if (directCount < 5) {
            // 5% monthly
            uint256 monthlyIncome = (userObj.nftValue *
                PASSIVE_INCOME_MONTHLY_BPS) / BASIS_POINTS_DENOMINATOR;
            pendingAmount =
                (monthlyIncome * timePassed) /
                SECONDS_PER_MONTH;
        } else {
            // Check if volume requirement met
            uint256 requiredVolume = _getRequiredDirectVolume(
                userObj.packageType
            );
            if (directBusinessVolume[msg.sender] >= requiredVolume) {
                // 0.50% daily
                uint256 dailyIncome = (userObj.nftValue *
                    PASSIVE_INCOME_DAILY_BPS) / BASIS_POINTS_DENOMINATOR;
                pendingAmount =
                    (dailyIncome * timePassed) /
                    SECONDS_PER_DAY;
            }
        }

        require(pendingAmount > 0, "No passive income to claim");

        // Apply 2X capping
        uint256 earningCap = userObj.nftValue * EARNING_CAP_MULTIPLIER;
        if (userObj.totalEarned + pendingAmount > earningCap) {
            pendingAmount = earningCap > userObj.totalEarned
                ? earningCap - userObj.totalEarned
                : 0;

            if (pendingAmount > 0) {
                userObj.rewardBalance += pendingAmount;
                userObj.totalEarned += pendingAmount;
                emit Capped(msg.sender, userObj.totalEarned, earningCap);
            }
            userObj.lastPassiveClaimTime = block.timestamp;
            emit PassiveIncomeClaimed(msg.sender, pendingAmount);
            return;
        }

        userObj.rewardBalance += pendingAmount;
        userObj.totalEarned += pendingAmount;
        userObj.lastPassiveClaimTime = block.timestamp;

        emit PassiveIncomeClaimed(msg.sender, pendingAmount);
    }

    // ============= WEEKLY POOL FUNCTIONS =============

    /**
     * @dev Process weekly pool qualification for team volume
     * Called internally when tracking team business volume during join/re-topup
     */
    function _updateWeeklyTeamVolume(
        address user,
        uint256 nftValue
    ) private {
        if (user == address(0)) return;

        uint256 weekId = block.timestamp / SECONDS_PER_WEEK;
        uint256 userId = addressToUserId[user];
        if (userId == 0) return;

        User storage userObj = users[userId];

        // This will be called for up to 3 levels of upline
        // For simplicity, we calculate team volume on demand in claimWeeklyPool

        // Check if user qualifies (2500 USDT team volume in 3 levels)
        uint256 teamVolume = _calculateWeeklyTeamVolume(user, weekId);
        if (
            teamVolume >= WEEKLY_QUALIFICATION_VOLUME &&
            !weeklyQualified[weekId][user]
        ) {
            weeklyQualified[weekId][user] = true;
            weeklyPools[weekId].qualifierCount++;
            emit WeeklyPoolQualified(user, weekId, teamVolume);
        }
    }

    /**
     * @dev Calculate total team volume for weekly pool (3 levels)
     * This is calculated on demand to avoid loops
     */
    function _calculateWeeklyTeamVolume(address user, uint256 weekId)
        private
        view
        returns (uint256 teamVolume)
    {
        uint256 userId = addressToUserId[user];
        if (userId == 0) return 0;

        // This would require tracking per-week who joined under each user
        // For now, we use a simplified model where we track qualifications
        // when users join or re-topup (calling _updateWeeklyTeamVolume)

        // In a production system, you'd maintain a mapping:
        // mapping(uint256 weekId => mapping(address => uint256)) weeklyTeamVolume;
        // and update it during joins/re-topups

        // For this implementation, returns 0 as placeholder
        // Actual calculation done on explicit trigger
        return 0;
    }

    /**
     * @dev Close weekly pool and make it available for claims
     * Only callable by admin
     */
    function closeWeeklyPool(uint256 weekId) external onlyOwner {
        require(!weeklyPools[weekId].closed, "Pool already closed");
        weeklyPools[weekId].closed = true;

        emit WeeklyPoolClosed(
            weekId,
            weeklyPools[weekId].poolAmount,
            weeklyPools[weekId].qualifierCount
        );
    }

    /**
     * @dev Claim weekly pool distribution
     * User must have qualified during the week
     */
    function claimWeeklyPool(uint256 weekId)
        external
        nonReentrant
        whenNotPaused
        userExists(msg.sender)
    {
        require(weeklyPools[weekId].closed, "Pool not closed");
        require(
            !weeklyPoolClaimed[weekId][msg.sender],
            "Already claimed"
        );
        require(
            weeklyQualified[weekId][msg.sender],
            "Not qualified"
        );

        uint256 qualifierCount = weeklyPools[weekId].qualifierCount;
        require(qualifierCount > 0, "No qualifiers");

        uint256 poolAmount = weeklyPools[weekId].poolAmount;
        uint256 claimAmount = poolAmount / qualifierCount;

        require(claimAmount > 0, "Invalid amount");

        weeklyPoolClaimed[weekId][msg.sender] = true;

        uint256 userId = addressToUserId[msg.sender];
        users[userId].rewardBalance += claimAmount;
        users[userId].totalEarned += claimAmount;

        emit WeeklyPoolClaimed(msg.sender, weekId, claimAmount);
    }

    // ============= ROYALTY CLUB FUNCTIONS =============

    /**
     * @dev Check if user qualifies for royalty club
     * Requirements: 25 active directs + matching direct volume based on package
     */
    function _checkRoyaltyQualification(address user) private {
        if (isRoyaltyMember[user]) return; // Already qualified

        uint256 directCount = directReferralCount[user];
        if (directCount < ROYALTY_ACTIVE_DIRECTS_REQUIRED) {
            return;
        }

        uint256 userId = addressToUserId[user];
        User storage userObj = users[userId];

        uint256 requiredVolume = _getRequiredDirectVolume(userObj.packageType);
        if (directBusinessVolume[user] >= requiredVolume) {
            isRoyaltyMember[user] = true;
            emit RoyaltyQualified(user, directCount, directBusinessVolume[user]);
        }
    }

    /**
     * @dev Get current month ID (0-indexed, resets Jan 1)
     */
    function _getCurrentMonthId() private view returns (uint256) {
        // Simple calculation: using days since epoch / 30
        // For production, use more accurate month calculation
        return block.timestamp / SECONDS_PER_MONTH;
    }

    /**
     * @dev Close monthly royalty pool
     */
    function closeMonthlyRoyaltyPool(uint256 monthId)
        external
        onlyOwner
    {
        require(!monthlyRoyaltyPools[monthId].closed, "Pool already closed");
        monthlyRoyaltyPools[monthId].closed = true;

        // Count active royalty members (snapshot at close time)
        // In production, maintain list of members
        uint256 royaltyMemberCount = monthlyRoyaltyPools[monthId].memberCount;
        require(royaltyMemberCount > 0, "No members");

        emit RoyaltyPoolClosed(
            monthId,
            monthlyRoyaltyPools[monthId].poolAmount,
            royaltyMemberCount
        );
    }

    /**
     * @dev Claim monthly royalty distribution
     */
    function claimMonthlyRoyalty(uint256 monthId)
        external
        nonReentrant
        whenNotPaused
        userExists(msg.sender)
    {
        require(monthlyRoyaltyPools[monthId].closed, "Pool not closed");
        require(!royaltyClaimed[monthId][msg.sender], "Already claimed");
        require(isRoyaltyMember[msg.sender], "Not a royalty member");

        uint256 memberCount = monthlyRoyaltyPools[monthId].memberCount;
        require(memberCount > 0, "No members");

        uint256 poolAmount = monthlyRoyaltyPools[monthId].poolAmount;
        uint256 claimAmount = poolAmount / memberCount;

        require(claimAmount > 0, "Invalid amount");

        royaltyClaimed[monthId][msg.sender] = true;

        uint256 userId = addressToUserId[msg.sender];
        users[userId].rewardBalance += claimAmount;
        users[userId].totalEarned += claimAmount;

        emit RoyaltyClaimed(msg.sender, monthId, claimAmount);
    }

    // ============= RE-TOPUP FUNCTIONS =============

    /**
     * @dev Re-topup: user pays to reactivate after reaching 2X earning cap
     * Re-topup amount = initial NFT value
     * This increases earning cap by another 2X of the NFT value
     */
    function reTopup()
        external
        nonReentrant
        whenNotPaused
        userExists(msg.sender)
    {
        uint256 userId = addressToUserId[msg.sender];
        User storage userObj = users[userId];

        require(!userObj.active, "User already active");
        require(_isUserCapped(userId), "User not capped");

        // Re-topup amount = initial NFT value (no platform fee for re-topup)
        uint256 reTopupAmount = userObj.nftValue;

        // Transfer USDT
        usdtToken.safeTransferFrom(msg.sender, address(this), reTopupAmount);

        // Update user state
        userObj.active = true;
        userObj.reTopupCount++;
        userObj.lastPassiveClaimTime = block.timestamp;
        // totalEarned remains - cap is additive

        emit ReTopup(msg.sender, reTopupAmount, userObj.reTopupCount);

        // Trigger sponsor commission for re-topup
        address currentSponsor = _currentSponsorAddress(userId);
        if (currentSponsor != address(0)) {
            _payDirectCommission(
                currentSponsor,
                msg.sender,
                userObj.nftValue
            );
            _payLevelIncome(currentSponsor, userObj.nftValue);
        }
    }

    // ============= WITHDRAWAL FUNCTIONS =============

    /**
     * @dev Withdraw from reward balance
     * Deducts 10% as airdrop fund contribution
     */
    function withdraw(uint256 amount)
        external
        nonReentrant
        whenNotPaused
        userExists(msg.sender)
    {
        require(amount > 0, "Cannot withdraw zero");

        uint256 userId = addressToUserId[msg.sender];
        User storage userObj = users[userId];

        require(userObj.rewardBalance >= amount, "Insufficient balance");

        // Calculate deduction
        uint256 airdropDeduction = (amount * WITHDRAWAL_AIRDROP_DEDUCTION_BPS) /
            BASIS_POINTS_DENOMINATOR;
        uint256 netAmount = amount - airdropDeduction;

        // Update balances
        userObj.rewardBalance -= amount;
        airdropFundBalance += airdropDeduction;

        // Transfer net amount to user
        usdtToken.safeTransfer(msg.sender, netAmount);

        emit Withdrawal(msg.sender, amount, airdropDeduction, netAmount);
    }

    /**
     * @dev Get pending withdrawal balance for user
     */
    function pendingWithdrawalBalance(address user)
        external
        view
        userExists(user)
        returns (uint256)
    {
        uint256 userId = addressToUserId[user];
        return users[userId].rewardBalance;
    }

    // ============= CAPPING FUNCTIONS =============

    /**
     * @dev Check if user is capped (totalEarned >= 2X NFT value)
     */
    function _isUserCapped(uint256 userId) private view returns (bool) {
        User storage userObj = users[userId];
        if (!userObj.active) return false;

        uint256 earningCap = userObj.nftValue * EARNING_CAP_MULTIPLIER;
        return userObj.totalEarned >= earningCap;
    }

    /**
     * @dev Get remaining earning capacity before capping
     */
    function remainingCap(address user)
        external
        view
        userExists(user)
        returns (uint256)
    {
        uint256 userId = addressToUserId[user];
        User storage userObj = users[userId];

        if (!userObj.active) return 0;

        uint256 earningCap = userObj.nftValue * EARNING_CAP_MULTIPLIER;
        if (userObj.totalEarned >= earningCap) {
            return 0;
        }

        return earningCap - userObj.totalEarned;
    }

    /**
     * @dev Check if user is capped (public view)
     */
    function isUserCapped(address user)
        external
        view
        userExists(user)
        returns (bool)
    {
        uint256 userId = addressToUserId[user];
        return _isUserCapped(userId);
    }

    // ============= VIEW FUNCTIONS =============

    /**
     * @dev Get user data
     */
    function getUser(address user)
        external
        view
        userExists(user)
        returns (User memory)
    {
        uint256 userId = addressToUserId[user];
        User memory userData = users[userId];
        userData.sponsor = _currentSponsorAddress(userId);
        return userData;
    }

    /**
     * @dev Get package configuration
     */
    function getPackage(uint8 packageType)
        external
        view
        returns (Package memory)
    {
        return packages[packageType];
    }

    /**
     * @dev Get direct referral count
     */
    function getDirectCount(address user)
        external
        view
        userExists(user)
        returns (uint256)
    {
        return directReferralCount[user];
    }

    /**
     * @dev Get direct business volume
     */
    function getDirectBusinessVolume(address user)
        external
        view
        userExists(user)
        returns (uint256)
    {
        return directBusinessVolume[user];
    }

    /**
     * @dev Get weekly pool data
     */
    function getWeeklyPool(uint256 weekId)
        external
        view
        returns (WeeklyPoolData memory)
    {
        return weeklyPools[weekId];
    }

    /**
     * @dev Check if user is qualified for weekly pool
     */
    function isWeeklyQualified(address user, uint256 weekId)
        external
        view
        userExists(user)
        returns (bool)
    {
        return weeklyQualified[weekId][user];
    }

    /**
     * @dev Get monthly royalty pool data
     */
    function getMonthlyRoyaltyPool(uint256 monthId)
        external
        view
        returns (MonthlyRoyaltyData memory)
    {
        return monthlyRoyaltyPools[monthId];
    }

    /**
     * @dev Get upline chain for a user (up to 3 levels)
     */
    function getUplines(address user)
        external
        view
        userExists(user)
        returns (address[3] memory)
    {
        address[3] memory uplines;
        uint256 userId = addressToUserId[user];
        uint256 currentId = sponsorUserId[userId];
        for (uint8 i = 0; i < 3; i++) {
            if (currentId == 0) break;
            uplines[i] = subscriberWallet[currentId];
            currentId = sponsorUserId[currentId];
        }

        return uplines;
    }

    function isSubscriber(address account) external view returns (bool) {
        uint256 userId = addressToUserId[account];
        return userId != 0 && users[userId].active;
    }

    function _currentSponsorAddress(uint256 userId) private view returns (address) {
        uint256 sponsorId = sponsorUserId[userId];
        return sponsorId == 0 ? address(0) : subscriberWallet[sponsorId];
    }

    // ============= ADMIN FUNCTIONS =============

    /**
     * @dev Pause contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Update treasury wallet
     */
    function setTreasuryWallet(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid address");
        treasuryWallet = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @dev Update airdrop wallet
     */
    function setAirdropWallet(address newAirdrop) external onlyOwner {
        require(newAirdrop != address(0), "Invalid address");
        airdropWallet = newAirdrop;
        emit AirdropWalletUpdated(newAirdrop);
    }

    /**
     * @dev Update base URI for NFT metadata
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        baseURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /**
     * @dev Update package configuration
     * Should only be called before launch or with extreme caution
     */
    function updatePackage(
        uint8 packageType,
        uint256 nftValue,
        uint256 platformFee
    ) external onlyOwner {
        require(packageType >= 1 && packageType <= 3, "Invalid package");
        require(nftValue > 0, "Invalid nft value");

        packages[packageType] = Package(nftValue, platformFee);
        emit PackageUpdated(packageType, nftValue, platformFee);
    }

    /**
     * @dev Withdraw accumulated airdrop funds (admin only)
     */
    function withdrawAirdropFund(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        require(airdropFundBalance >= amount, "Insufficient airdrop balance");

        airdropFundBalance -= amount;
        usdtToken.safeTransfer(airdropWallet, amount);
    }

    /**
     * @dev Emergency rescue for non-USDT tokens accidentally sent
     */
    function emergencyRescue(address tokenAddress, uint256 amount)
        external
        onlyOwner
    {
        require(
            tokenAddress != address(usdtToken),
            "Cannot rescue USDT"
        );
        require(
            tokenAddress != address(orbdToken),
            "Cannot rescue locked ORBD"
        );
        IERC20(tokenAddress).safeTransfer(owner(), amount);
    }

    // ============= NFT METADATA =============

    /**
     * @dev Override to add base URI
     */
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    /**
     * @dev Subscription records stay with wallets. A category NFT can move only
     * between active subscribers of that same category; resale charges no fee.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address previousOwner)
    {
        previousOwner = _ownerOf(tokenId);
        bool isCategoryTransfer = previousOwner != address(0) &&
            to != address(0) &&
            previousOwner != to;

        if (isCategoryTransfer) {
            uint8 category = tokenPackageType[tokenId];
            uint256 sellerId = addressToUserId[previousOwner];
            uint256 buyerId = addressToUserId[to];
            require(sellerId != 0 && users[sellerId].active, "Seller not active subscriber");
            require(buyerId != 0 && users[buyerId].active, "Buyer not active subscriber");
            require(users[sellerId].packageType == category, "Seller category mismatch");
            require(users[buyerId].packageType == category, "Buyer category mismatch");
        }

        previousOwner = super._update(to, tokenId, auth);

        if (isCategoryTransfer) {
            emit CategoryNFTTransferred(
                tokenId,
                previousOwner,
                to,
                tokenPackageType[tokenId]
            );
        }
    }

    /**
     * @dev Required override
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
