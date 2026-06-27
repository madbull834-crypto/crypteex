// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPancakeInfinityRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs) external payable;
}

interface IPermit2AllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/**
 * @title OrbdSwapLocker
 * @notice Receives USDT from the ecosystem contract, swaps it to ORBD through
 * PancakeSwap Infinity/Universal Router, and permanently holds the ORBD.
 *
 * The Pancake router route is built off-chain and passed as commands/inputs.
 * This keeps route logic upgradeable off-chain while enforcing on-chain that
 * the configured USDT amount is spent and minimum ORBD is received.
 */
contract OrbdSwapLocker is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error BadAmount();
    error OnlyEcosystem();
    error InfinitySwapRequired();
    error IncorrectUsdtSpent();
    error InsufficientOrbdReceived();
    error CannotRescueOrbd();

    uint8 private constant INFINITY_SWAP_COMMAND = 0x10;

    IERC20 public immutable usdt;
    IERC20 public immutable orbd;
    IPancakeInfinityRouter public immutable infinityRouter;
    IPermit2AllowanceTransfer public immutable permit2;
    address public ecosystem;

    event EcosystemUpdated(address indexed ecosystem);
    event OrbdPurchasedAndLocked(address indexed buyer, uint256 usdtAmount, uint256 orbdReceived);
    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    constructor(address usdt_, address orbd_, address infinityRouter_, address permit2_) Ownable(msg.sender) {
        if (usdt_ == address(0) || orbd_ == address(0) || infinityRouter_ == address(0) || permit2_ == address(0)) {
            revert ZeroAddress();
        }
        usdt = IERC20(usdt_);
        orbd = IERC20(orbd_);
        infinityRouter = IPancakeInfinityRouter(infinityRouter_);
        permit2 = IPermit2AllowanceTransfer(permit2_);
    }

    function updateEcosystem(address ecosystem_) external onlyOwner {
        if (ecosystem_ == address(0)) revert ZeroAddress();
        ecosystem = ecosystem_;
        emit EcosystemUpdated(ecosystem_);
    }

    function swapAndLock(
        address buyer,
        uint256 usdtAmount,
        uint256 minimumOrbdOut,
        bytes calldata commands,
        bytes[] calldata inputs
    ) external nonReentrant returns (uint256 orbdReceived) {
        if (msg.sender != ecosystem) revert OnlyEcosystem();
        if (usdtAmount == 0 || minimumOrbdOut == 0 || usdtAmount > type(uint160).max) revert BadAmount();
        if (!_containsInfinitySwap(commands)) revert InfinitySwapRequired();

        uint256 usdtBefore = usdt.balanceOf(address(this));
        uint256 orbdBefore = orbd.balanceOf(address(this));

        usdt.forceApprove(address(permit2), usdtAmount);
        permit2.approve(address(usdt), address(infinityRouter), uint160(usdtAmount), uint48(block.timestamp + 1));
        infinityRouter.execute(commands, inputs);
        permit2.approve(address(usdt), address(infinityRouter), 0, 0);
        usdt.forceApprove(address(permit2), 0);

        uint256 usdtSpent = usdtBefore - usdt.balanceOf(address(this));
        orbdReceived = orbd.balanceOf(address(this)) - orbdBefore;
        if (usdtSpent != usdtAmount) revert IncorrectUsdtSpent();
        if (orbdReceived < minimumOrbdOut) revert InsufficientOrbdReceived();

        emit OrbdPurchasedAndLocked(buyer, usdtAmount, orbdReceived);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(orbd)) revert CannotRescueOrbd();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, to, amount);
    }

    function _containsInfinitySwap(bytes calldata commands) private pure returns (bool) {
        for (uint256 i; i < commands.length; ++i) {
            if ((uint8(commands[i]) & 0x3f) == INFINITY_SWAP_COMMAND) return true;
        }
        return false;
    }
}
