import { useEffect, useMemo, useState } from "react";
import { isAddress, MaxUint256, ZeroAddress } from "ethers";
import { Card } from "../Card";
import { TxButton } from "../TxButton";
import { useWeb3 } from "../../context/Web3Context";
import { useUserPosition } from "../../hooks/useUserPosition";
import type { StakePackageInfo } from "../../hooks/usePackages";
import { formatUsdt, parseUsdt } from "../../utils/format";
import { STAKE_ECOSYSTEM_ADDRESS } from "../../config/contracts";
import { clearStoredReferral, isSelfReferral, referralFromUrl } from "../../utils/referral";

export function JoinStakeForm({
  stakePackages,
  presetAmount,
}: {
  stakePackages: StakePackageInfo[];
  presetAmount?: string;
}) {
  const { account, ecosystem, ecosystemRead, usdt, connect } = useWeb3();
  const { usdtAllowance, usdtBalance, refetch } = useUserPosition();
  const [amount, setAmount] = useState(presetAmount ?? "");
  const [sponsor, setSponsor] = useState(() => referralFromUrl());
  const [sponsorCanRefer, setSponsorCanRefer] = useState<boolean | null>(null);

  useEffect(() => {
    if (presetAmount !== undefined) setAmount(presetAmount);
  }, [presetAmount]);

  const matchedPackage = useMemo(() => {
    if (!amount) return null;
    try {
      const value = parseUsdt(amount);
      return stakePackages.find((p) => value >= p.minStake && value <= p.maxStake) ?? null;
    } catch {
      return null;
    }
  }, [amount, stakePackages]);

  const amountWei = useMemo(() => {
    try {
      return parseUsdt(amount || "0");
    } catch {
      return 0n;
    }
  }, [amount]);

  const totalDue = matchedPackage ? amountWei + matchedPackage.platformFee : 0n;
  const needsApproval = usdtAllowance < totalDue;
  const sponsorValid = sponsor === "" || (isAddress(sponsor) && !isSelfReferral(sponsor, account));
  const sponsorEligible = sponsor === "" || sponsorCanRefer === true;
  const canJoin = Boolean(matchedPackage) && amountWei > 0n && sponsorValid && sponsorEligible && !needsApproval;

  useEffect(() => {
    if (!sponsor || !sponsorValid || !ecosystemRead) {
      setSponsorCanRefer(null);
      return;
    }
    let cancelled = false;
    ecosystemRead
      .canRefer(sponsor)
      .then((eligible: boolean) => {
        if (!cancelled) setSponsorCanRefer(eligible);
      })
      .catch(() => {
        if (!cancelled) setSponsorCanRefer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sponsor, sponsorValid, ecosystemRead]);

  if (!account) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-neutral-900">Join a Stake Package</h3>
        <p className="mt-2 text-sm text-neutral-600">Connect your wallet to stake USDT and start earning monthly ROI.</p>
        <button
          onClick={() => connect()}
          className="mt-4 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-neutral-900 shadow shadow-amber-300/50 hover:from-amber-300 hover:to-yellow-400"
        >
          Connect Wallet
        </button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900">Join a Stake Package</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Stake USDT for a 365-day term. ROI accrues monthly and becomes claimable every completed 30-day period.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Stake amount (USDT)
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1000"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-amber-500"
        />
        <span className="text-xs text-neutral-500">Balance: {formatUsdt(usdtBalance)} USDT</span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Sponsor address (optional)
        <input
          type="text"
          value={sponsor}
          onChange={(e) => setSponsor(e.target.value)}
          placeholder="0x..."
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 outline-none focus:border-amber-500"
        />
        {!sponsorValid && (
          <span className="text-xs text-rose-600">
            {isSelfReferral(sponsor, account) ? "You cannot use your own wallet as sponsor" : "Invalid address"}
          </span>
        )}
        {sponsorValid && sponsor && sponsorCanRefer === false && (
          <span className="text-xs text-rose-600">
            This sponsor cannot refer yet. Ask them to confirm they are whitelisted and have an active NFT/stake position.
          </span>
        )}
        {sponsor && (
          <button
            type="button"
            onClick={() => {
              clearStoredReferral();
              setSponsor("");
            }}
            className="w-fit text-xs font-medium text-amber-700 hover:text-amber-800"
          >
            Clear sponsor
          </button>
        )}
      </label>

      {matchedPackage ? (
        <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
          <div>Matched tier: package #{matchedPackage.id}</div>
          <div>Platform fee: {formatUsdt(matchedPackage.platformFee)} USDT</div>
          <div className="font-medium text-neutral-900">Total due: {formatUsdt(totalDue)} USDT</div>
        </div>
      ) : (
        amount && <div className="text-sm text-amber-600">No package matches this amount.</div>
      )}

      {needsApproval ? (
        <TxButton
          variant="secondary"
          disabled={!matchedPackage}
          onClick={() => usdt!.approve(STAKE_ECOSYSTEM_ADDRESS, MaxUint256)}
          successMessage="USDT approved"
          onSuccess={refetch}
        >
          Approve USDT
        </TxButton>
      ) : (
        <TxButton
          disabled={!canJoin}
          onClick={() => ecosystem!.joinStakePackage(amountWei, 1, sponsor || ZeroAddress)}
          successMessage="Stake position activated"
          onSuccess={() => {
            setAmount("");
            refetch();
          }}
        >
          Join Stake Package
        </TxButton>
      )}
    </Card>
  );
}
