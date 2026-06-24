import { Card } from "../Card";
import { formatUsdt, bpsToPercent } from "../../utils/format";
import type { StakePackageInfo } from "../../hooks/usePackages";

const TIER_STYLES: Record<number, string> = {
  1: "border-neutral-300",
  2: "border-amber-300",
  3: "border-emerald-300",
};

const TIER_NAMES: Record<number, string> = {
  1: "Silver",
  2: "Gold",
  3: "Diamond",
};

export function PackageCard({ pkg, onSelect }: { pkg: StakePackageInfo; onSelect?: () => void }) {
  const isUncapped = pkg.maxStake > 10_000_000_000_000n;
  return (
    <Card className={`border-2 ${TIER_STYLES[pkg.id]} flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">{TIER_NAMES[pkg.id]}</h3>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          {bpsToPercent(pkg.rewardRateBps)} / month
        </span>
      </div>
      <div className="text-sm text-neutral-600">
        Stake range:{" "}
        <span className="text-neutral-800">
          {formatUsdt(pkg.minStake)} - {isUncapped ? "∞" : formatUsdt(pkg.maxStake)} USDT
        </span>
      </div>
      <div className="text-sm text-neutral-600">
        Platform fee: <span className="text-neutral-800">{formatUsdt(pkg.platformFee)} USDT</span>
      </div>
      {!pkg.active && <div className="text-xs text-rose-600">Currently inactive</div>}
      {onSelect && (
        <button
          onClick={onSelect}
          disabled={!pkg.active}
          className="mt-2 rounded-lg border border-amber-500 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-40"
        >
          Stake {TIER_NAMES[pkg.id]}
        </button>
      )}
    </Card>
  );
}
