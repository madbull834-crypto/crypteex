// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT18 is ERC20 {
    constructor() ERC20("Mock USDT 18", "USDT") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
