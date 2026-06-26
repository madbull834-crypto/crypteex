import { useCallback, useEffect, useState } from "react";
import { useWeb3 } from "../context/Web3Context";

export interface UserStruct {
  positionType: number;
  packageId: number;
  nftValue: bigint;
  stakeAmount: bigint;
  platformFeePaid: bigint;
  roiPlanId: bigint;
  sponsor: string;
  activationTime: bigint;
  active: boolean;
  earningActive: boolean;
  tokenId: bigint;
  lastPassiveClaimTime: bigint;
  roiClaimed: boolean;
  reTopupCount: bigint;
}

export interface UserPosition {
  user: UserStruct | null;
  rewardBalance: bigint;
  pendingRoi: bigint;
  pendingPassive: bigint;
  exitDeduction: bigint;
  remainingCap: bigint;
  isCapped: boolean;
  roiClaimsCount: number;
  usdtBalance: bigint;
  usdtAllowance: bigint;
  loading: boolean;
  refetch: () => void;
}

const DAY = 86400;

function calculateExitDeduction(user: UserStruct): bigint {
  if (!user.active || user.positionType !== 2) return 0n;
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - Number(user.activationTime));
  const bps = elapsed < 90 * DAY ? 2500n : elapsed < 180 * DAY ? 1500n : 500n;
  return (user.stakeAmount * bps) / 10000n;
}

const ZERO_USER: UserStruct = {
  positionType: 0,
  packageId: 0,
  nftValue: 0n,
  stakeAmount: 0n,
  platformFeePaid: 0n,
  roiPlanId: 0n,
  sponsor: "0x0000000000000000000000000000000000000000",
  activationTime: 0n,
  active: false,
  earningActive: false,
  tokenId: 0n,
  lastPassiveClaimTime: 0n,
  roiClaimed: false,
  reTopupCount: 0n,
};

export function useUserPosition(): UserPosition {
  const { ecosystemRead, usdtRead, account } = useWeb3();
  const [state, setState] = useState<Omit<UserPosition, "refetch">>({
    user: null,
    rewardBalance: 0n,
    pendingRoi: 0n,
    pendingPassive: 0n,
    exitDeduction: 0n,
    remainingCap: 0n,
    isCapped: false,
    roiClaimsCount: 0,
    usdtBalance: 0n,
    usdtAllowance: 0n,
    loading: true,
  });
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!ecosystemRead || !account) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true }));
      try {
        const rawUser = await ecosystemRead!.getUser(account);
        const user: UserStruct = {
          positionType: Number(rawUser.positionType),
          packageId: Number(rawUser.packageId),
          nftValue: rawUser.nftValue,
          stakeAmount: rawUser.stakeAmount,
          platformFeePaid: rawUser.platformFeePaid,
          roiPlanId: rawUser.roiPlanId,
          sponsor: rawUser.sponsor,
          activationTime: rawUser.activationTime,
          active: rawUser.active,
          earningActive: rawUser.earningActive,
          tokenId: rawUser.tokenId,
          lastPassiveClaimTime: rawUser.lastPassiveClaimTime,
          roiClaimed: rawUser.roiClaimed,
          reTopupCount: rawUser.reTopupCount,
        };

        const [rewardBalance, pendingRoi, pendingPassive, remainingCap, totalCap, totalEarned, roiClaimsCount] =
          await Promise.all([
            ecosystemRead!.userRewardBalance(account),
            ecosystemRead!.pendingROIReward(account),
            ecosystemRead!.pendingPassiveIncome(account),
            ecosystemRead!.remainingCap(account),
            ecosystemRead!.totalCap(account),
            ecosystemRead!.totalEarned(account),
            ecosystemRead!.roiClaimsCount(account),
          ]);

        const exitDeduction = calculateExitDeduction(user);

        let usdtBalance = 0n;
        let usdtAllowance = 0n;
        if (usdtRead) {
          [usdtBalance, usdtAllowance] = await Promise.all([
            usdtRead.balanceOf(account),
            usdtRead.allowance(account, await ecosystemRead!.getAddress()),
          ]);
        }

        if (cancelled) return;
        setState({
          user: user.active ? user : ZERO_USER,
          rewardBalance,
          pendingRoi,
          pendingPassive,
          exitDeduction,
          remainingCap,
          isCapped: totalCap > 0n && totalEarned >= totalCap,
          roiClaimsCount: Number(roiClaimsCount),
          usdtBalance,
          usdtAllowance,
          loading: false,
        });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    }

    load();
    const interval = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ecosystemRead, usdtRead, account, tick]);

  return { ...state, refetch };
}
