import { useEffect, useState } from "react";
import { useWeb3 } from "../context/Web3Context";

export interface StakePackageInfo {
  id: number;
  minStake: bigint;
  maxStake: bigint;
  platformFee: bigint;
  rewardRateBps: number;
  active: boolean;
}

export interface FixedPackageInfo {
  id: number;
  nftValue: bigint;
  platformFee: bigint;
  active: boolean;
}

const PACKAGE_IDS = [1, 2, 3];

export function usePackages() {
  const { rewardPoolsRead } = useWeb3();
  const [stakePackages, setStakePackages] = useState<StakePackageInfo[]>([]);
  const [fixedPackages, setFixedPackages] = useState<FixedPackageInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rewardPoolsRead) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const stakeResults = await Promise.all(
          PACKAGE_IDS.map((id) => rewardPoolsRead!.stakePackages(id))
        );
        const fixedResults = await Promise.all(
          PACKAGE_IDS.map((id) => rewardPoolsRead!.fixedPackages(id))
        );
        if (cancelled) return;
        setStakePackages(
          stakeResults.map((r, i) => ({
            id: PACKAGE_IDS[i],
            minStake: r.minStake,
            maxStake: r.maxStake,
            platformFee: r.platformFee,
            rewardRateBps: Number(r.rewardRateBps),
            active: r.active,
          }))
        );
        setFixedPackages(
          fixedResults.map((r, i) => ({
            id: PACKAGE_IDS[i],
            nftValue: r.nftValue,
            platformFee: r.platformFee,
            active: r.active,
          }))
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [rewardPoolsRead]);

  return { stakePackages, fixedPackages, loading };
}
