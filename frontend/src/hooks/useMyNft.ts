import { useCallback, useEffect, useState } from "react";
import { useWeb3 } from "../context/Web3Context";

export interface MyNftInfo {
  tokenId: bigint;
  packageId: number;
  active: boolean;
  listing: { price: bigint; active: boolean } | null;
}

export function useMyNft() {
  const { ecosystemRead, marketplaceRead, account } = useWeb3();
  const [info, setInfo] = useState<MyNftInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!ecosystemRead || !account) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const tokenId: bigint = await ecosystemRead!.tokenOfUser(account);
        if (tokenId === 0n) {
          if (!cancelled) setInfo(null);
          return;
        }
        const user = await ecosystemRead!.getUser(account);
        let listing = null;
        if (marketplaceRead) {
          const raw = await marketplaceRead.listings(tokenId);
          if (raw.active) listing = { price: raw.price, active: raw.active };
        }
        if (!cancelled) {
          setInfo({
            tokenId,
            packageId: Number(user.packageId),
            active: user.active && user.positionType === 1,
            listing,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ecosystemRead, marketplaceRead, account, tick]);

  return { info, loading, refetch };
}
