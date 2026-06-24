import { useCallback, useEffect, useState } from "react";
import { useWeb3 } from "../context/Web3Context";

export interface FixedSaleListing {
  tokenId: bigint;
  packageId: number;
  price: bigint;
  platformFee: bigint;
}

export function useFixedSaleListings() {
  const { ecosystemRead } = useWeb3();
  const [listings, setListings] = useState<FixedSaleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!ecosystemRead) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const listedEvents = await ecosystemRead!.queryFilter(ecosystemRead!.filters.NFTListed());
        const candidateIds = Array.from(
          new Set(listedEvents.map((e) => (e as unknown as { args: { tokenId: bigint } }).args.tokenId))
        );
        const sales = await Promise.all(candidateIds.map((id) => ecosystemRead!.nftSales(id)));
        if (cancelled) return;
        const active: FixedSaleListing[] = [];
        candidateIds.forEach((tokenId, i) => {
          if (sales[i].active) {
            active.push({ tokenId, packageId: Number(sales[i].packageId), price: 0n, platformFee: 0n });
          }
        });
        const withPrices = await Promise.all(
          active.map(async (listing) => {
            const pkg = await ecosystemRead!.fixedPackages(listing.packageId);
            return { ...listing, price: pkg.nftValue, platformFee: pkg.platformFee };
          })
        );
        if (!cancelled) setListings(withPrices);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ecosystemRead, tick]);

  return { listings, loading, refetch };
}
