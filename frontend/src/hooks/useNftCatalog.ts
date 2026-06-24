import { useMemo } from "react";
import { useFixedSaleListings } from "./useFixedSaleListings";
import { useMarketListings } from "./useMarketListings";
import { useMyNft } from "./useMyNft";
import { useWeb3 } from "../context/Web3Context";

export type NftCatalogStatus = "platform" | "resale" | "owned";

export interface NftCatalogEntry {
  tokenId: bigint;
  packageId: number;
  price: bigint;
  platformFee: bigint;
  status: NftCatalogStatus;
  seller: string;
}

/**
 * Every NFT a wallet can see is the platform's own listing (status "platform",
 * sold via the ecosystem contract), someone reselling a position they bought
 * (status "resale", sold via the marketplace contract), or the connected
 * wallet's own unlisted position (status "owned", eligible to be sold).
 */
export function useNftCatalog() {
  const { account } = useWeb3();
  const primary = useFixedSaleListings();
  const secondary = useMarketListings();
  const myNft = useMyNft();

  const entries = useMemo<NftCatalogEntry[]>(() => {
    const byToken = new Map<string, NftCatalogEntry>();

    for (const listing of primary.listings) {
      byToken.set(listing.tokenId.toString(), {
        tokenId: listing.tokenId,
        packageId: listing.packageId,
        price: listing.price,
        platformFee: listing.platformFee,
        status: "platform",
        seller: "platform",
      });
    }

    for (const listing of secondary.listings) {
      byToken.set(listing.tokenId.toString(), {
        tokenId: listing.tokenId,
        packageId: listing.packageId ?? 0,
        price: listing.price,
        platformFee: 0n,
        status: "resale",
        seller: listing.seller,
      });
    }

    if (myNft.info && !myNft.info.listing && !byToken.has(myNft.info.tokenId.toString())) {
      byToken.set(myNft.info.tokenId.toString(), {
        tokenId: myNft.info.tokenId,
        packageId: myNft.info.packageId,
        price: 0n,
        platformFee: 0n,
        status: "owned",
        seller: account ?? "",
      });
    }

    return Array.from(byToken.values()).sort((a, b) => Number(a.tokenId - b.tokenId));
  }, [primary.listings, secondary.listings, myNft.info, account]);

  const loading = primary.loading || secondary.loading || myNft.loading;

  const refetch = () => {
    primary.refetch();
    secondary.refetch();
    myNft.refetch();
  };

  return { entries, loading, refetch };
}
