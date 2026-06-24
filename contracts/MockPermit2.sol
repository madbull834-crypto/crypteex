// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPermit2AllowanceTransfer} from "./interfaces/IPancakeInfinity.sol";

contract MockPermit2 is IPermit2AllowanceTransfer {
    using SafeERC20 for IERC20;

    struct Allowance {
        uint160 amount;
        uint48 expiration;
    }

    mapping(address => mapping(address => mapping(address => Allowance))) public allowances;

    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        allowances[msg.sender][token][spender] = Allowance(amount, expiration);
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        Allowance storage allowed = allowances[from][token][msg.sender];
        require(block.timestamp <= allowed.expiration, "Permit2 allowance expired");
        require(allowed.amount >= amount, "Permit2 allowance exceeded");
        allowed.amount -= amount;
        IERC20(token).safeTransferFrom(from, to, amount);
    }
}
