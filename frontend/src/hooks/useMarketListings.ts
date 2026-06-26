import { useCallback, useEffect, useState } from "react";
import { useWeb3 } from "../context/Web3Context";
import { ENABLE_RESALE_SCAN } from "../config/contracts";
import { queryRecentEvents } from "../utils/queryEvents";

export interface MarketListing {
  tokenId: bigint;
  seller: string;
  price: bigint;
  packageId: number | null;
}

export function useMarketListings() {
  const { marketplaceRead, ecosystemRead } = useWeb3();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!marketplaceRead || !ecosystemRead) return;
    let cancelled = false;

    async function load() {
      if (!ENABLE_RESALE_SCAN) {
        setListings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const listedEvents = await queryRecentEvents(marketplaceRead!, marketplaceRead!.filters.Listed());
        const candidateIds = Array.from(
          new Set(listedEvents.map((e) => (e as unknown as { args: { tokenId: bigint } }).args.tokenId))
        );
        const onChainListings = await Promise.all(candidateIds.map((id) => marketplaceRead!.listings(id)));
        const active: MarketListing[] = [];
        candidateIds.forEach((tokenId, i) => {
          if (onChainListings[i].active) {
            active.push({
              tokenId,
              seller: onChainListings[i].seller,
              price: onChainListings[i].price,
              packageId: null,
            });
          }
        });

        const withPackages = await Promise.all(
          active.map(async (listing) => {
            try {
              const owner = await ecosystemRead!.ownerOf(listing.tokenId);
              const user = await ecosystemRead!.getUser(owner);
              return { ...listing, packageId: Number(user.packageId) };
            } catch {
              return listing;
            }
          })
        );

        if (!cancelled) setListings(withPackages);
      } catch (err) {
        console.error("Could not load marketplace listings", err);
        if (!cancelled) setListings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [marketplaceRead, ecosystemRead, tick]);

  return { listings, loading, refetch };
}
