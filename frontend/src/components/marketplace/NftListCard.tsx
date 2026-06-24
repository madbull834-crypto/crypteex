import { useEffect, useState } from "react";
import { MaxUint256 } from "ethers";
import { Card } from "../Card";
import { TxButton } from "../TxButton";
import { NftArt } from "./NftArt";
import { useWeb3 } from "../../context/Web3Context";
import { useUserPosition } from "../../hooks/useUserPosition";
import { formatUsdt, parseUsdt, shortenAddress } from "../../utils/format";
import { PACKAGE_NAMES, STAKE_ECOSYSTEM_ADDRESS, MARKETPLACE_ADDRESS } from "../../config/contracts";
import type { NftCatalogEntry } from "../../hooks/useNftCatalog";

const STATUS_BADGE: Record<NftCatalogEntry["status"], string> = {
  platform: "bg-emerald-100 text-emerald-700",
  resale: "bg-amber-100 text-amber-700",
  owned: "bg-neutral-100 text-neutral-700",
};

const STATUS_LABEL: Record<NftCatalogEntry["status"], string> = {
  platform: "Platform Listing",
  resale: "Resale",
  owned: "Your NFT",
};

export function NftListCard({
  entry,
  onChanged,
  highlight = false,
  isSubscribed = false,
}: {
  entry: NftCatalogEntry;
  onChanged: () => void;
  highlight?: boolean;
  isSubscribed?: boolean;
}) {
  const { account, ecosystem, marketplace, usdt, usdtRead, connect } = useWeb3();
  const { user } = useUserPosition();
  const [allowance, setAllowance] = useState(0n);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [allowanceTick, setAllowanceTick] = useState(0);

  const spender = entry.status === "platform" ? STAKE_ECOSYSTEM_ADDRESS : MARKETPLACE_ADDRESS;

  useEffect(() => {
    if (!usdtRead || !account) {
      setAllowance(0n);
      return;
    }
    usdtRead
      .allowance(account, spender)
      .then((a: bigint) => setAllowance(a))
      .catch(() => setAllowance(0n));
  }, [usdtRead, account, spender, allowanceTick]);

  const isSelfListed = entry.status === "resale" && account?.toLowerCase() === entry.seller.toLowerCase();
  const isOwnedUnlisted = entry.status === "owned";
  const isMine = isSelfListed || isOwnedUnlisted;
  const hasActivePosition = Boolean(user?.active);
  const canBuy = !isMine && !hasActivePosition && isSubscribed;
  const needsApproval = canBuy && allowance < entry.price;
  const canSell = isOwnedUnlisted;
  const canCancel = isSelfListed;

  const sellPriceWei = (() => {
    try {
      return parseUsdt(sellPrice || "0");
    } catch {
      return 0n;
    }
  })();

  if (!account) {
    return (
      <Card className="flex flex-col gap-3">
        <NftArt packageId={entry.packageId} tokenId={entry.tokenId} />
        <h3 className="text-lg font-semibold text-neutral-900">Crypteex {PACKAGE_NAMES[entry.packageId]}</h3>
        <button
          onClick={connect}
          className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-neutral-900 hover:from-amber-300 hover:to-yellow-400"
        >
          Connect Wallet
        </button>
      </Card>
    );
  }

  return (
    <Card
      className={`flex flex-col gap-3 transition hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-200/60 ${
        highlight ? "border-amber-400 ring-1 ring-amber-300" : "hover:border-amber-400"
      }`}
    >
      <div className="relative">
        <NftArt packageId={entry.packageId} tokenId={entry.tokenId} />
        {highlight && (
          <span className="absolute -top-2 -left-2 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2 py-0.5 text-[10px] font-semibold text-neutral-900 shadow">
            🔥 Best Price
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">Crypteex {PACKAGE_NAMES[entry.packageId]}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_BADGE[entry.status]}`}>
          {entry.status === "platform" && <span title="Verified platform listing">✓</span>}
          {STATUS_LABEL[entry.status]}
        </span>
      </div>

      {entry.status === "owned" ? (
        <div className="text-sm text-neutral-500">Not currently listed for sale</div>
      ) : (
        <div className="flex items-baseline gap-1 text-sm text-neutral-500">
          Price
          <span className="text-lg font-semibold text-amber-600">{formatUsdt(entry.price)}</span>
          USDT
        </div>
      )}

      {entry.status === "resale" && (
        <div className="text-xs text-neutral-500">Seller: {shortenAddress(entry.seller)}</div>
      )}

      <div className="flex gap-2">
        {isMine ? (
          <button disabled className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-400">
            Owned by You
          </button>
        ) : !isSubscribed ? (
          <button disabled className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-700">
            Subscribe First
          </button>
        ) : !canBuy ? (
          <button
            disabled
            title="You already have an active position"
            className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-400"
          >
            Buy
          </button>
        ) : needsApproval ? (
          <TxButton
            variant="secondary"
            className="flex-1"
            onClick={() => usdt!.approve(spender, MaxUint256)}
            successMessage="USDT approved"
            onSuccess={() => setAllowanceTick((t) => t + 1)}
          >
            Approve USDT
          </TxButton>
        ) : (
          <TxButton
            className="flex-1"
            onClick={() =>
              entry.status === "platform"
                ? ecosystem!.buyListedFixedNFT(entry.tokenId)
                : marketplace!.buy(entry.tokenId)
            }
            successMessage="NFT purchased"
            onSuccess={onChanged}
          >
            Buy
          </TxButton>
        )}

        {canCancel ? (
          <TxButton
            variant="secondary"
            className="flex-1"
            onClick={() => marketplace!.cancel(entry.tokenId)}
            successMessage="Listing cancelled"
            onSuccess={onChanged}
          >
            Cancel Listing
          </TxButton>
        ) : canSell ? (
          sellOpen ? (
            <div className="flex flex-1 gap-2">
              <input
                type="number"
                min="0"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="Price"
                className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-900 outline-none focus:border-amber-500"
              />
              <TxButton
                disabled={sellPriceWei === 0n}
                onClick={() => marketplace!.list(entry.tokenId, sellPriceWei)}
                successMessage="NFT listed for sale"
                onSuccess={() => {
                  setSellOpen(false);
                  setSellPrice("");
                  onChanged();
                }}
              >
                Confirm
              </TxButton>
            </div>
          ) : (
            <button
              onClick={() => setSellOpen(true)}
              className="flex-1 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
            >
              Sell
            </button>
          )
        ) : (
          <button disabled className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-400">
            Sell
          </button>
        )}
      </div>
    </Card>
  );
}
