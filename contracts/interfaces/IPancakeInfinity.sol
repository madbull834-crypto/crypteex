// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPancakeInfinityRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs) external payable;
}

interface IPermit2AllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;

    function transferFrom(address from, address to, uint160 amount, address token) external;
}
