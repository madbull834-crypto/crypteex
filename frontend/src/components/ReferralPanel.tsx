import { useEffect, useMemo, useState } from "react";
import { Card } from "./Card";
import { useWeb3 } from "../context/Web3Context";
import { useToast } from "../context/ToastContext";
import { buildReferralLink, referralFromUrl } from "../utils/referral";
import { shortenAddress } from "../utils/format";
import { useSubscriptions } from "../hooks/useSubscriptions";

export function ReferralPanel() {
  const { account, connect, ecosystemRead } = useWeb3();
  const { push } = useToast();
  const { subscriptions } = useSubscriptions();
  const [nftBalance, setNftBalance] = useState(0n);
  const [isOwner, setIsOwner] = useState(false);
  const detectedSponsor = useMemo(() => referralFromUrl(), []);
  const hasSubscription = Object.values(subscriptions).some(Boolean);
  const canRefer = Boolean(account && (isOwner || (hasSubscription && nftBalance > 0n)));
  const referralLink = useMemo(() => (account && canRefer ? buildReferralLink(account) : ""), [account, canRefer]);

  useEffect(() => {
    if (!account || !ecosystemRead) {
      setNftBalance(0n);
      setIsOwner(false);
      return;
    }
    Promise.all([ecosystemRead.balanceOf(account), ecosystemRead.owner()])
      .then(([balance, owner]: [bigint, string]) => {
        setNftBalance(balance);
        setIsOwner(owner.toLowerCase() === account.toLowerCase());
      })
      .catch(() => {
        setNftBalance(0n);
        setIsOwner(false);
      });
  }, [account, ecosystemRead]);

  const copyReferralLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    push("success", "Referral link copied");
  };

  return (
    <Card className="flex flex-col gap-3 border-emerald-200 bg-emerald-50/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Referral Earnings</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Referral links unlock after your wallet has at least one subscription and holds at least one Crypteex NFT.
            The admin wallet can refer without subscription/NFT status.
          </p>
          {detectedSponsor && (
            <p className="mt-2 text-xs text-emerald-700">
              Referral sponsor detected from link: <span className="font-mono">{shortenAddress(detectedSponsor, 6)}</span>
            </p>
          )}
        </div>
        {!account && (
          <button
            onClick={() => connect()}
            className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-neutral-900 hover:from-amber-300 hover:to-yellow-400"
          >
            Connect to Get Link
          </button>
        )}
      </div>

      {account && !canRefer && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You cannot refer yet. Buy a category subscription and hold a Crypteex NFT first, or connect the admin wallet.
        </div>
      )}

      {account && canRefer && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={referralLink}
            className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-neutral-700"
          />
          <button
            onClick={copyReferralLink}
            className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            Copy Referral Link
          </button>
        </div>
      )}
    </Card>
  );
}
