import { useCallback, useEffect, useState } from "react";
import type { Contract } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { PLATFORM_FIRST_TOKEN_ID, PLATFORM_LAST_TOKEN_ID } from "../config/contracts";
import { queryRecentEvents } from "../utils/queryEvents";

export interface FixedSaleListing {
  tokenId: bigint;
  packageId: number;
  price: bigint;
  platformFee: bigint;
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

let fixedListingsCache: FixedSaleListing[] | null = null;
let fixedListingsPromise: Promise<FixedSaleListing[]> | null = null;

async function withRetry<T>(fn: () => Promise<T>, retries = 1) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await sleep(500);
    return withRetry(fn, retries - 1);
  }
}

async function mapInBatches<T, R>(items: T[], batchSize: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map((item) => withRetry(() => mapper(item))))));
    if (i + batchSize < items.length) await sleep(150);
  }
  return results;
}

async function loadFixedSaleListings(ecosystemRead: Contract) {
  if (fixedListingsCache) return fixedListingsCache;
  if (fixedListingsPromise) return fixedListingsPromise;

  fixedListingsPromise = (async () => {
    const candidateIds =
      PLATFORM_FIRST_TOKEN_ID > 0 && PLATFORM_LAST_TOKEN_ID >= PLATFORM_FIRST_TOKEN_ID
        ? Array.from(
            { length: PLATFORM_LAST_TOKEN_ID - PLATFORM_FIRST_TOKEN_ID + 1 },
            (_, i) => BigInt(PLATFORM_FIRST_TOKEN_ID + i)
          )
        : Array.from(
            new Set(
              (await queryRecentEvents(ecosystemRead, ecosystemRead.filters.NFTListed())).map(
                (e) => (e as unknown as { args: { tokenId: bigint } }).args.tokenId
              )
            )
          );

    const sales = await mapInBatches(candidateIds, 1, (id) => ecosystemRead.nftSales(id));
    const active: FixedSaleListing[] = [];
    candidateIds.forEach((tokenId, i) => {
      if (sales[i].active) {
        active.push({ tokenId, packageId: Number(sales[i].packageId), price: 0n, platformFee: 0n });
      }
    });

    const packageIds = Array.from(new Set(active.map((listing) => listing.packageId)));
    const packages = await mapInBatches(packageIds, 1, async (packageId) => {
      const pkg = await ecosystemRead.fixedPackages(packageId);
      return [packageId, pkg] as const;
    });
    const packageById = new Map(packages);

    fixedListingsCache = active.map((listing) => {
      const pkg = packageById.get(listing.packageId);
      return {
        ...listing,
        price: pkg?.nftValue ?? 0n,
        platformFee: pkg?.platformFee ?? 0n,
      };
    });
    return fixedListingsCache;
  })().catch((err) => {
    fixedListingsCache = null;
    throw err;
  }).finally(() => {
    fixedListingsPromise = null;
  });

  return fixedListingsPromise;
}

export function useFixedSaleListings() {
  const { ecosystemRead } = useWeb3();
  const [listings, setListings] = useState<FixedSaleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    fixedListingsCache = null;
    fixedListingsPromise = null;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!ecosystemRead) return;
    const readContract = ecosystemRead;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const loadedListings = await loadFixedSaleListings(readContract);
        if (!cancelled) setListings(loadedListings);
      } catch (err) {
        console.error("Could not load fixed NFT listings", err);
        if (!cancelled) setListings([]);
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
