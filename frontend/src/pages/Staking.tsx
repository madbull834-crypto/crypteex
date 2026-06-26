import { useState } from "react";
import { usePackages } from "../hooks/usePackages";
import { PackageCard } from "../components/staking/PackageCard";
import { JoinStakeForm } from "../components/staking/JoinStakeForm";
import { PositionDashboard } from "../components/staking/PositionDashboard";
import { TeamPools } from "../components/staking/TeamPools";
import { formatUsdt } from "../utils/format";
import { ReferralPanel } from "../components/ReferralPanel";
import { AdminOfflineStakePanel } from "../components/staking/AdminOfflineStakePanel";

export default function Staking() {
  const { stakePackages, loading } = usePackages();
  const [presetAmount, setPresetAmount] = useState<string | undefined>(undefined);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
          Crypteex Staking
        </span>
        <h1 className="mt-3 text-3xl font-semibold text-neutral-900">Staking Program</h1>
        <p className="mt-2 max-w-3xl text-neutral-600">
          Stake USDT for a fixed 365-day term. ROI accrues monthly and can be claimed every completed 30-day
          period, for up to 12 periods. Exiting your principal early carries a stability deduction: 25% before
          90 days, 15% before 180 days, and a flat 5% from day 180 onward for the remainder of the term.
        </p>
      </section>

      <ReferralPanel />

      <section>
        <h2 className="mb-4 text-xl font-semibold text-neutral-900">Stake Packages</h2>
        {loading ? (
          <div className="text-neutral-500">Loading packages...</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {stakePackages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onSelect={() => setPresetAmount(formatUsdt(pkg.minStake, 0).replace(/,/g, ""))}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-neutral-900">My Position</h2>
        <PositionDashboard />
      </section>

      <section>
        <AdminOfflineStakePanel stakePackages={stakePackages} />
      </section>

      <section>
        <JoinStakeForm stakePackages={stakePackages} presetAmount={presetAmount} />
      </section>

      <section>
        <TeamPools />
      </section>
    </div>
  );
}
