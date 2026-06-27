import { useEffect, useMemo, useState } from "react";
import { isAddress, MaxUint256, ZeroAddress } from "ethers";
import { Card } from "../Card";
import { TxButton } from "../TxButton";
import { useWeb3 } from "../../context/Web3Context";
import { formatUsdt } from "../../utils/format";
import { PACKAGE_NAMES, STAKE_ECOSYSTEM_ADDRESS } from "../../config/contracts";
import type { FixedPackageInfo } from "../../hooks/usePackages";
import { clearStoredReferral, isSelfReferral, referralFromUrl } from "../../utils/referral";

export function SubscriptionPanel({
  packages,
  subscriptions,
  onChanged,
}: {
  packages: FixedPackageInfo[];
  subscriptions: Record<number, boolean>;
  onChanged: () => void;
}) {
  const { account, ecosystem, ecosystemRead, usdt, usdtRead, connect } = useWeb3();
  const detectedSponsor = useMemo(() => referralFromUrl(), []);
  const [sponsor, setSponsor] = useState(detectedSponsor);
  const [usdtAllowance, setUsdtAllowance] = useState(0n);
  const [allowanceTick, setAllowanceTick] = useState(0);
  const [sponsorCanRefer, setSponsorCanRefer] = useState<boolean | null>(null);
  const sponsorValid = sponsor === "" || (isAddress(sponsor) && !isSelfReferral(sponsor, account));
  const sponsorEligible = sponsor === "" || sponsorCanRefer === true;

  useEffect(() => {
    if (!account || !usdtRead) {
      setUsdtAllowance(0n);
      return;
    }
    let cancelled = false;
    usdtRead
      .allowance(account, STAKE_ECOSYSTEM_ADDRESS)
      .then((value: bigint) => {
        if (!cancelled) setUsdtAllowance(value);
      })
      .catch(() => {
        if (!cancelled) setUsdtAllowance(0n);
      });
    return () => {
      cancelled = true;
    };
  }, [account, usdtRead, allowanceTick]);

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
        <h2 className="text-xl font-semibold text-neutral-900">Choose Your Subscription</h2>
        <p className="mt-2 text-sm text-neutral-600">Connect your wallet before purchasing a category subscription.</p>
        <button onClick={() => connect()} className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-900">
          Connect Wallet
        </button>
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Step 1: Buy a One-Time Subscription</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Subscribe once to a category before buying or selling NFTs in that category. NFT purchases do not charge this fee again.
        </p>
      </div>
      <label className="flex max-w-md flex-col gap-1 text-sm text-neutral-700">
        Sponsor address (optional)
        <input
          value={sponsor}
          onChange={(event) => setSponsor(event.target.value)}
          placeholder="0x..."
          className="rounded-lg border border-neutral-300 px-3 py-2 font-mono outline-none focus:border-amber-500"
        />
        {!sponsorValid && (
          <span className="text-xs text-rose-600">
            {isSelfReferral(sponsor, account) ? "You cannot use your own wallet as sponsor" : "Invalid sponsor address"}
          </span>
        )}
        {sponsorValid && sponsor && sponsorCanRefer === false && (
          <span className="text-xs text-rose-600">
            This sponsor is not eligible yet. Clear the sponsor field or use an active referrer.
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
      <div className="grid gap-4 sm:grid-cols-3">
        {packages.map((pkg) => {
          const subscribed = Boolean(subscriptions[pkg.id]);
          const needsApproval = usdtAllowance < pkg.platformFee;
          return (
            <Card key={pkg.id} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">{PACKAGE_NAMES[pkg.id]} Subscription</h3>
              <div className="text-2xl font-bold text-amber-600">{formatUsdt(pkg.platformFee)} USDT</div>
              <p className="text-sm text-neutral-500">Permanent wallet subscription</p>
              {subscribed ? (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-700">Subscribed</div>
              ) : needsApproval ? (
                <TxButton
                  variant="secondary"
                  onClick={() => usdt!.approve(STAKE_ECOSYSTEM_ADDRESS, MaxUint256)}
                  successMessage="USDT approved for subscription"
                  onSuccess={() => setAllowanceTick((value) => value + 1)}
                >
                  Approve USDT
                </TxButton>
              ) : (
                <TxButton
                  disabled={!sponsorValid || !sponsorEligible}
                  onClick={() => ecosystem!.purchaseSubscription(pkg.id, sponsor || ZeroAddress)}
                  successMessage={`${PACKAGE_NAMES[pkg.id]} subscription activated`}
                  onSuccess={() => {
                    setAllowanceTick((value) => value + 1);
                    onChanged();
                  }}
                >
                  Subscribe
                </TxButton>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
