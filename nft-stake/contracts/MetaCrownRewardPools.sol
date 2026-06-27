// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title MetaCrownRewardPools
 * @notice Weekly leadership pool, monthly royalty pool, and fixed/stake package configuration
 * for MetaCrownNFTStakeEcosystem.
 * @dev Split out of the main ecosystem contract purely to keep the upgradeable ecosystem
 * contract's runtime bytecode under the mainnet contract-size limit. Trusts a single
 * ecosystem contract address for all state-changing calls.
 */
contract MetaCrownRewardPools is Initializable, OwnableUpgradeable {
    error NotEcosystem();
    error AlreadyClosed();
    error NoQualifiers();
    error NoMembers();
    error NotClosed();
    error NotQualified();
    error AlreadyClaimed();
    error BadAmount();
    error ZeroAddress();
    error PeriodNotEnded();

    uint256 private constant SECONDS_PER_WEEK = 7 days;
    uint256 private constant SECONDS_PER_MONTH = 30 days;
    uint256 private constant ROYALTY_DIRECTS_REQUIRED = 25;

    uint8 private constant PACKAGE_SILVER = 1;
    uint8 private constant PACKAGE_GOLD = 2;
    uint8 private constant PACKAGE_DIAMOND = 3;

    address public ecosystem;
    uint256 public weeklyPoolContribution;
    uint256 public royaltyPoolContribution;
    uint256 public weeklyQualificationVolume;

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

    mapping(address => mapping(uint256 => uint256)) public weeklyTeamVolume;
    mapping(uint256 => WeeklyPool) public weeklyPools;
    mapping(address => mapping(uint256 => bool)) public weeklyQualified;
    mapping(address => mapping(uint256 => bool)) public weeklyClaimed;

    mapping(address => bool) public royaltyMember;
    mapping(uint256 => MonthlyRoyaltyPool) public monthlyRoyaltyPools;
    mapping(address => mapping(uint256 => bool)) public royaltyClaimed;
    uint256 public royaltyMembersCount;

    mapping(uint8 => FixedPackage) public fixedPackages;
    mapping(uint8 => StakePackage) public stakePackages;
    mapping(address => uint256) public royaltyQualifiedMonth;

    event WeeklyPoolFunded(uint256 indexed weekId, uint256 amount);
    event WeeklyPoolQualified(address indexed user, uint256 indexed weekId, uint256 teamVolume);
    event WeeklyPoolClosed(uint256 indexed weekId, uint256 poolAmount, uint256 qualifierCount, uint256 rewardPerQualifier);
    event RoyaltyQualified(address indexed user);
    event RoyaltyPoolFunded(uint256 indexed monthId, uint256 amount);
    event RoyaltyPoolClosed(uint256 indexed monthId, uint256 poolAmount, uint256 memberCount, uint256 rewardPerMember);
    event EcosystemUpdated(address indexed ecosystem);

    modifier onlyEcosystem() {
        if (msg.sender != ecosystem) revert NotEcosystem();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address ecosystem_, uint256 unit_) external initializer {
        if (ecosystem_ == address(0) || unit_ == 0) revert ZeroAddress();
        __Ownable_init(msg.sender);
        ecosystem = ecosystem_;
        weeklyPoolContribution = 5 * unit_;
        royaltyPoolContribution = 2 * unit_;
        weeklyQualificationVolume = 2_500 * unit_;

        fixedPackages[PACKAGE_SILVER] = FixedPackage(10 * unit_, 5 * unit_, true);
        fixedPackages[PACKAGE_GOLD] = FixedPackage(50 * unit_, 10 * unit_, true);
        fixedPackages[PACKAGE_DIAMOND] = FixedPackage(500 * unit_, 50 * unit_, true);

        stakePackages[PACKAGE_SILVER] = StakePackage(1_000 * unit_, 5_000 * unit_, 50 * unit_, 400, true);
        stakePackages[PACKAGE_GOLD] = StakePackage(5_001 * unit_, 10_000 * unit_, 100 * unit_, 500, true);
        stakePackages[PACKAGE_DIAMOND] = StakePackage(10_001 * unit_, type(uint256).max, 100 * unit_, 600, true);
    }

    function updateEcosystem(address ecosystem_) external onlyOwner {
        if (ecosystem_ == address(0)) revert ZeroAddress();
        ecosystem = ecosystem_;
        emit EcosystemUpdated(ecosystem_);
    }

    function findStakePackageId(uint256 stakeAmount) external view returns (uint8) {
        for (uint8 packageId = PACKAGE_SILVER; packageId <= PACKAGE_DIAMOND; ++packageId) {
            StakePackage memory pkg = stakePackages[packageId];
            if (pkg.active && stakeAmount >= pkg.minStake && stakeAmount <= pkg.maxStake) return packageId;
        }
        revert BadAmount();
    }

    function stakePackagePlatformFee(uint8 packageId) external view returns (uint256) {
        return stakePackages[packageId].platformFee;
    }

    function stakePackageRewardRateBps(uint8 packageId) external view returns (uint16) {
        return stakePackages[packageId].rewardRateBps;
    }

    function fundPools() external onlyEcosystem returns (uint256 weeklyAmount, uint256 royaltyAmount) {
        uint256 weekId = block.timestamp / SECONDS_PER_WEEK;
        uint256 monthId = block.timestamp / SECONDS_PER_MONTH;
        weeklyAmount = weeklyPoolContribution;
        royaltyAmount = royaltyPoolContribution;
        weeklyPools[weekId].poolAmount += weeklyAmount;
        monthlyRoyaltyPools[monthId].poolAmount += royaltyAmount;
        emit WeeklyPoolFunded(weekId, weeklyAmount);
        emit RoyaltyPoolFunded(monthId, royaltyAmount);
    }

    function recordBusiness(address account, uint256 weekId, uint256 businessValue) external onlyEcosystem {
        uint256 newVolume = weeklyTeamVolume[account][weekId] + businessValue;
        weeklyTeamVolume[account][weekId] = newVolume;
        if (!weeklyQualified[account][weekId] && newVolume >= weeklyQualificationVolume) {
            weeklyQualified[account][weekId] = true;
            weeklyPools[weekId].qualifierCount += 1;
            emit WeeklyPoolQualified(account, weekId, newVolume);
        }
    }

    function maybeUpdateRoyalty(address account, uint256 activeDirects, uint256 totalDirectBusinessAccount, uint256 requiredBusiness)
        external
        onlyEcosystem
    {
        if (!royaltyMember[account] && activeDirects >= ROYALTY_DIRECTS_REQUIRED && totalDirectBusinessAccount >= requiredBusiness) {
            royaltyMember[account] = true;
            royaltyQualifiedMonth[account] = block.timestamp / SECONDS_PER_MONTH;
            royaltyMembersCount += 1;
            emit RoyaltyQualified(account);
        }
    }

    function closeWeekly(uint256 weekId) external onlyEcosystem {
        if (weekId >= block.timestamp / SECONDS_PER_WEEK) revert PeriodNotEnded();
        WeeklyPool storage pool = weeklyPools[weekId];
        if (pool.closed) revert AlreadyClosed();
        if (pool.qualifierCount == 0) revert NoQualifiers();
        pool.closed = true;
        pool.rewardPerQualifier = pool.poolAmount / pool.qualifierCount;
        emit WeeklyPoolClosed(weekId, pool.poolAmount, pool.qualifierCount, pool.rewardPerQualifier);
    }

    function closeMonthly(uint256 monthId) external onlyEcosystem {
        if (monthId >= block.timestamp / SECONDS_PER_MONTH) revert PeriodNotEnded();
        MonthlyRoyaltyPool storage pool = monthlyRoyaltyPools[monthId];
        if (pool.closed) revert AlreadyClosed();
        if (royaltyMembersCount == 0) revert NoMembers();
        pool.closed = true;
        pool.memberCountSnapshot = royaltyMembersCount;
        pool.rewardPerMember = pool.poolAmount / royaltyMembersCount;
        emit RoyaltyPoolClosed(monthId, pool.poolAmount, royaltyMembersCount, pool.rewardPerMember);
    }

    function claimWeekly(address account, uint256 weekId) external onlyEcosystem returns (uint256 amount) {
        WeeklyPool memory pool = weeklyPools[weekId];
        if (!pool.closed) revert NotClosed();
        if (!weeklyQualified[account][weekId]) revert NotQualified();
        if (weeklyClaimed[account][weekId]) revert AlreadyClaimed();
        weeklyClaimed[account][weekId] = true;
        amount = pool.rewardPerQualifier;
    }

    function claimRoyalty(address account, uint256 monthId) external onlyEcosystem returns (uint256 amount) {
        MonthlyRoyaltyPool memory pool = monthlyRoyaltyPools[monthId];
        if (!pool.closed) revert NotClosed();
        if (!royaltyMember[account] || royaltyQualifiedMonth[account] > monthId) revert NotQualified();
        if (royaltyClaimed[account][monthId]) revert AlreadyClaimed();
        royaltyClaimed[account][monthId] = true;
        amount = pool.rewardPerMember;
    }
}
