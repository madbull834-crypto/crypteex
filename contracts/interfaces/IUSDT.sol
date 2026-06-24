// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IUSDT
 * @dev Interface for USDT token (ERC20-compatible)
 * Note: USDT has 6 decimals (1 USDT = 10^6 units)
 */
interface IUSDT {
    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function allowance(address owner, address spender)
        external
        view
        returns (uint256);

    function decimals() external view returns (uint8);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
}
