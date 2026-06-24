// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMetaCrownEcosystem {
    function ownerOf(uint256 tokenId) external view returns (address);
    function marketplaceTransferFixedNFT(address seller, address buyer, uint256 tokenId, uint256 price) external;
}

contract MetaCrownNFTMarketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error BadAmount();
    error NotSeller();
    error NotListed();
    error NotOwner();

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    IERC20 public immutable usdt;
    IMetaCrownEcosystem public immutable ecosystem;
    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event Purchased(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);

    constructor(address usdt_, address ecosystem_) {
        usdt = IERC20(usdt_);
        ecosystem = IMetaCrownEcosystem(ecosystem_);
    }

    function list(uint256 tokenId, uint256 price) external {
        if (price == 0) revert BadAmount();
        if (ecosystem.ownerOf(tokenId) != msg.sender) revert NotOwner();
        listings[tokenId] = Listing(msg.sender, price, true);
        emit Listed(tokenId, msg.sender, price);
    }

    function cancel(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        if (!listing.active) revert NotListed();
        if (listing.seller != msg.sender) revert NotSeller();
        delete listings[tokenId];
        emit ListingCancelled(tokenId, msg.sender);
    }

    function buy(uint256 tokenId) external nonReentrant {
        Listing memory listing = listings[tokenId];
        if (!listing.active) revert NotListed();
        if (ecosystem.ownerOf(tokenId) != listing.seller) revert NotOwner();
        delete listings[tokenId];

        usdt.safeTransferFrom(msg.sender, listing.seller, listing.price);
        ecosystem.marketplaceTransferFixedNFT(listing.seller, msg.sender, tokenId, listing.price);

        emit Purchased(tokenId, listing.seller, msg.sender, listing.price);
    }
}
