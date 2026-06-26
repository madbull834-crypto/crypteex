// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockOrbdSwapLocker {
    IERC20 public immutable usdt;

    address public lastBuyer;
    uint256 public lastUsdtAmount;
    uint256 public lastMinimumOrbdOut;
    bytes public lastCommands;
    uint256 public calls;

    event MockSwapAndLock(address indexed buyer, uint256 usdtAmount, uint256 minimumOrbdOut);

    constructor(address usdt_) {
        usdt = IERC20(usdt_);
    }

    function swapAndLock(
        address buyer,
        uint256 usdtAmount,
        uint256 minimumOrbdOut,
        bytes calldata commands,
        bytes[] calldata
    ) external returns (uint256) {
        require(usdt.balanceOf(address(this)) >= usdtAmount, "USDT_NOT_FUNDED");
        lastBuyer = buyer;
        lastUsdtAmount = usdtAmount;
        lastMinimumOrbdOut = minimumOrbdOut;
        lastCommands = commands;
        calls += 1;
        emit MockSwapAndLock(buyer, usdtAmount, minimumOrbdOut);
        return minimumOrbdOut;
    }
}
