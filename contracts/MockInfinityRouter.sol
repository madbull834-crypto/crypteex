// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IPancakeInfinityRouter,
    IPermit2AllowanceTransfer
} from "./interfaces/IPancakeInfinity.sol";

/** @dev Test-only stand-in for PancakeSwap's Universal Router. */
contract MockInfinityRouter is IPancakeInfinityRouter {
    using SafeERC20 for IERC20;

    IPermit2AllowanceTransfer public immutable permit2;
    IERC20 public immutable usdt;
    IERC20 public immutable orbd;
    uint256 public immutable rate;

    constructor(address _permit2, address _usdt, address _orbd, uint256 _rate) {
        permit2 = IPermit2AllowanceTransfer(_permit2);
        usdt = IERC20(_usdt);
        orbd = IERC20(_orbd);
        rate = _rate;
    }

    function execute(bytes calldata commands, bytes[] calldata inputs) external payable {
        require(commands.length > 0 && uint8(commands[0]) == 0x10, "Missing Infinity command");
        (uint160 amountIn, uint256 amountOutMinimum) = abi.decode(inputs[0], (uint160, uint256));
        uint256 amountOut = uint256(amountIn) * rate;
        require(amountOut >= amountOutMinimum, "Insufficient output");

        permit2.transferFrom(msg.sender, address(this), amountIn, address(usdt));
        orbd.safeTransfer(msg.sender, amountOut);
    }
}
