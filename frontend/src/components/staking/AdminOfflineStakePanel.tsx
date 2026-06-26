import { useEffect, useMemo, useState } from "react";
import { isAddress, ZeroAddress } from "ethers";
import { Card } from "../Card";
import { useWeb3 } from "../../context/Web3Context";
import { useToast, parseTxError } from "../../context/ToastContext";
import type { StakePackageInfo } from "../../hooks/usePackages";
import { formatUsdt, parseUsdt } from "../../utils/format";
import { PACKAGE_NAMES } from "../../config/contracts";

export function AdminOfflineStakePanel({ stakePackages }: { stakePackages: StakePackageInfo[] }) {
  const { account, ecosystem, ecosystemRead } = useWeb3();
  const { push } = useToast();
  const [isOwner, setIsOwner] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [sponsorInitialized, setSponsorInitialized] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!ecosystemRead || !account) {
      setIsOwner(false);
      return;
    }
    ecosystemRead
      .owner()
      .then((owner: string) => {
        const ownerMatch = owner.toLowerCase() === account.toLowerCase();
        setIsOwner(ownerMatch);
        if (ownerMatch && !sponsorInitialized) {
          setSponsor(account);
          setSponsorInitialized(true);
        }
      })
      .catch(() => setIsOwner(false));
  }, [ecosystemRead, account, sponsorInitialized]);

  const amountWei = useMemo(() => {
    try {
      return parseUsdt(amount || "0");
    } catch {
      return 0n;
    }
  }, [amount]);

  const matchedPackage = useMemo(() => {
    if (amountWei === 0n) return null;
    return stakePackages.find((pkg) => amountWei >= pkg.minStake && amountWei <= pkg.maxStake) ?? null;
  }, [amountWei, stakePackages]);

  const userValid = isAddress(userAddress);
  const sponsorValid = sponsor === "" || isAddress(sponsor);
  const canActivate = Boolean(ecosystem && userValid && sponsorValid && matchedPackage && amountWei > 0n);

  if (!isOwner) return null;

  const activateOfflineStake = async () => {
    setPending(true);
    try {
      const tx = await ecosystem!.adminActivateStakePosition(
        userAddress,
        amountWei,
        1,
        sponsor || ZeroAddress
      );
      await tx.wait();
      push("success", "Offline stake position activated");
      setUserAddress("");
      setAmount("");
    } catch (err) {
      push("error", parseTxError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 border-amber-300 bg-gradient-to-br from-amber-50 to-white">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900">Admin: Add Offline Stake</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Use this when a user paid USDT offline. The contract will create their staking NFT and start ROI from the
          transaction time. No USDT is pulled from the user wallet.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          User wallet
          <input
            type="text"
            value={userAddress}
            onChange={(e) => setUserAddress(e.target.value)}
            placeholder="0x..."
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 outline-none focus:border-amber-500"
          />
          {userAddress && !userValid && <span className="text-xs text-rose-600">Invalid user address</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Offline stake amount
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-amber-500"
          />
          {matchedPackage ? (
            <span className="text-xs text-neutral-500">
              {PACKAGE_NAMES[matchedPackage.id]} · ROI {matchedPackage.rewardRateBps / 100}% monthly
            </span>
          ) : (
            amount && <span className="text-xs text-amber-600">No staking tier matches this amount</span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Sponsor
          <input
            type="text"
            value={sponsor}
            onChange={(e) => setSponsor(e.target.value)}
            placeholder={account ?? "0x..."}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 outline-none focus:border-amber-500"
          />
          {!sponsorValid && <span className="text-xs text-rose-600">Invalid sponsor address</span>}
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/70 p-3 text-sm text-neutral-700">
        <div>
          Recorded principal: <span className="font-medium text-neutral-900">{formatUsdt(amountWei)} USDT</span>
        </div>
        <button
          onClick={activateOfflineStake}
          disabled={!canActivate || pending}
          className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-neutral-900 shadow shadow-amber-300/50 hover:from-amber-300 hover:to-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Activating..." : "Activate Offline Stake"}
        </button>
      </div>
    </Card>
  );
}
