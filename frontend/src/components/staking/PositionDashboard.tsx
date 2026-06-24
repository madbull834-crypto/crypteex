import { useMemo, useState } from "react";
import { Card, StatCard } from "../Card";
import { TxButton } from "../TxButton";
import { useWeb3 } from "../../context/Web3Context";
import { useUserPosition } from "../../hooks/useUserPosition";
import { formatUsdt, formatTimestamp, formatDuration, parseUsdt } from "../../utils/format";
import { PACKAGE_NAMES, POSITION_NAMES } from "../../config/contracts";

const DAY = 86400;
const TERM_DAYS = 365;

function penaltyTier(elapsedSeconds: number) {
  if (elapsedSeconds < 90 * DAY) return { pct: 25, label: "Before 90 days" };
  if (elapsedSeconds < 180 * DAY) return { pct: 15, label: "Before 180 days" };
  return { pct: 5, label: "From 180 days onward" };
}

export function PositionDashboard() {
  const { ecosystem } = useWeb3();
  const position = useUserPosition();
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const { user, rewardBalance, pendingRoi, pendingPassive, exitDeduction, remainingCap, isCapped, roiClaimsCount } =
    position;

  const elapsedSeconds = user ? Math.max(0, Math.floor(Date.now() / 1000) - Number(user.activationTime)) : 0;
  const tier = penaltyTier(elapsedSeconds);
  const isStake = user?.positionType === 2;
  const isFixed = user?.positionType === 1;
  const termProgress = Math.min(100, (elapsedSeconds / (TERM_DAYS * DAY)) * 100);
  const principal = isStake ? user!.stakeAmount : user?.nftValue ?? 0n;
  const netOnExit = principal - exitDeduction;

  const withdrawWei = useMemo(() => {
    try {
      return parseUsdt(withdrawAmount || "0");
    } catch {
      return 0n;
    }
  }, [withdrawAmount]);
  const withdrawDeduction = withdrawWei / 10n;
  const withdrawNet = withdrawWei - withdrawDeduction;

  if (!user || !user.active) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-neutral-900">No Active Position</h3>
        <p className="mt-2 text-sm text-neutral-600">
          Join a stake package below to start earning ROI, or visit the marketplace to buy a fixed NFT package.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Position"
          value={`${POSITION_NAMES[user.positionType]}`}
          hint={`Package: ${PACKAGE_NAMES[user.packageId] ?? "-"}`}
        />
        <StatCard label="Principal" value={`${formatUsdt(principal)} USDT`} />
        <StatCard label="Reward Balance" value={`${formatUsdt(rewardBalance)} USDT`} />
        <StatCard label="Remaining Cap" value={`${formatUsdt(remainingCap)} USDT`} hint={isCapped ? "Capped" : undefined} />
      </div>

      {isStake && (
        <Card className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between text-sm text-neutral-600">
              <span>365-day term progress</span>
              <span>{roiClaimsCount}/12 ROI periods claimed</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-500" style={{ width: `${termProgress}%` }} />
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Activated {formatTimestamp(user.activationTime)} &middot; {formatDuration(elapsedSeconds)} elapsed
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-50 p-4">
            <div>
              <div className="text-sm text-neutral-600">Claimable ROI now</div>
              <div className="text-xl font-semibold text-neutral-900">{formatUsdt(pendingRoi)} USDT</div>
              <div className="text-xs text-neutral-500">Claim once every completed 30-day period, up to 12 times.</div>
            </div>
            <TxButton
              disabled={pendingRoi === 0n}
              onClick={() => ecosystem!.claimROIReward()}
              successMessage="ROI claimed"
              onSuccess={position.refetch}
            >
              Claim ROI
            </TxButton>
          </div>
        </Card>
      )}

      {isFixed && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-neutral-600">Pending passive income</div>
            <div className="text-xl font-semibold text-neutral-900">{formatUsdt(pendingPassive)} USDT</div>
          </div>
          <TxButton
            disabled={pendingPassive === 0n}
            onClick={() => ecosystem!.claimPassiveIncome()}
            successMessage="Passive income claimed"
            onSuccess={position.refetch}
          >
            Claim Passive Income
          </TxButton>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-neutral-900">Withdraw Reward Balance</h3>
        <p className="text-sm text-neutral-600">A 10% withdrawal deduction applies to the gross amount withdrawn.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Amount (USDT)
            <input
              type="number"
              min="0"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-48 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-amber-500"
            />
          </label>
          <TxButton
            disabled={withdrawWei === 0n || withdrawWei > rewardBalance}
            onClick={() => ecosystem!.withdrawRewards(withdrawWei)}
            successMessage="Rewards withdrawn"
            onSuccess={() => {
              setWithdrawAmount("");
              position.refetch();
            }}
          >
            Withdraw
          </TxButton>
        </div>
        {withdrawWei > 0n && (
          <div className="text-xs text-neutral-500">
            You receive {formatUsdt(withdrawNet)} USDT net ({formatUsdt(withdrawDeduction)} USDT deduction)
          </div>
        )}
      </Card>

      {isStake && (
        <Card className="flex flex-col gap-3 border-amber-300">
          <h3 className="text-lg font-semibold text-neutral-900">Exit Stake</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Before 90 days", pct: 25 },
              { label: "Before 180 days", pct: 15 },
              { label: "From 180 days onward", pct: 5 },
            ].map((row) => (
              <div
                key={row.label}
                className={`rounded-lg border p-3 text-sm ${
                  row.label === tier.label
                    ? "border-amber-500 bg-amber-50 text-amber-800"
                    : "border-neutral-200 text-neutral-500"
                }`}
              >
                <div>{row.label}</div>
                <div className="text-lg font-semibold">{row.pct}% penalty</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-700">
            <div>Current penalty: <span className="text-neutral-900">{formatUsdt(exitDeduction)} USDT ({tier.pct}%)</span></div>
            <div>You would receive: <span className="text-neutral-900">{formatUsdt(netOnExit)} USDT</span></div>
          </div>
          <TxButton
            variant="danger"
            onClick={() => ecosystem!.exitStake()}
            successMessage="Stake exited"
            onSuccess={position.refetch}
          >
            Exit Stake &amp; Withdraw Principal
          </TxButton>
        </Card>
      )}

      {isCapped && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-300 bg-emerald-50/40">
          <div>
            <div className="text-sm text-neutral-600">Position capped at 2x earnings</div>
            <div className="text-sm text-neutral-700">Re-topup the same principal amount to resume earning.</div>
          </div>
          <TxButton onClick={() => ecosystem!.reTopup()} successMessage="Re-topup complete" onSuccess={position.refetch}>
            Re-topup
          </TxButton>
        </Card>
      )}
    </div>
  );
}
