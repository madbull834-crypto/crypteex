import { useEffect, useState } from "react";
import { Card, StatCard } from "../Card";
import { TxButton } from "../TxButton";
import { useWeb3 } from "../../context/Web3Context";
import { formatUsdt } from "../../utils/format";

const WEEK = 7 * 86400;
const MONTH = 30 * 86400;

export function TeamPools() {
  const { ecosystem, ecosystemRead, account } = useWeb3();
  const [directCount, setDirectCount] = useState<bigint>(0n);
  const [directBusiness, setDirectBusiness] = useState<bigint>(0n);
  const [teamBusiness, setTeamBusiness] = useState<bigint>(0n);
  const [boostBps, setBoostBps] = useState<number>(0);
  const [isRoyalty, setIsRoyalty] = useState(false);
  const [weekId, setWeekId] = useState(String(Math.floor(Date.now() / 1000 / WEEK)));
  const [monthId, setMonthId] = useState(String(Math.floor(Date.now() / 1000 / MONTH)));

  useEffect(() => {
    if (!ecosystemRead || !account) return;
    (async () => {
      const [dc, db, tb, boost, royalty] = await Promise.all([
        ecosystemRead.getDirectCount(account),
        ecosystemRead.getDirectBusiness(account),
        ecosystemRead.getTeamBusiness(account),
        ecosystemRead.getUserRewardBoost(account),
        ecosystemRead.isRoyaltyMember(account),
      ]);
      setDirectCount(dc);
      setDirectBusiness(db);
      setTeamBusiness(tb);
      setBoostBps(Number(boost));
      setIsRoyalty(royalty);
    })();
  }, [ecosystemRead, account]);

  if (!account) return null;

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-neutral-900">Team &amp; Leadership Rewards</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Direct Referrals" value={directCount.toString()} />
        <StatCard label="Direct Business" value={`${formatUsdt(directBusiness)} USDT`} />
        <StatCard label="Team Business" value={`${formatUsdt(teamBusiness)} USDT`} />
        <StatCard
          label="Reward Boost"
          value={`+${(boostBps / 100).toFixed(2)}%`}
          hint={isRoyalty ? "Royalty club member" : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
          <span className="text-sm font-medium text-neutral-800">Weekly Leadership Pool</span>
          <input
            type="number"
            value={weekId}
            onChange={(e) => setWeekId(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-500"
          />
          <TxButton
            variant="secondary"
            onClick={() => ecosystem!.claimWeeklyLeadershipPool(BigInt(weekId || "0"))}
            successMessage="Weekly pool claimed"
          >
            Claim Week #{weekId}
          </TxButton>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
          <span className="text-sm font-medium text-neutral-800">Monthly Royalty Pool</span>
          <input
            type="number"
            value={monthId}
            onChange={(e) => setMonthId(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-500"
          />
          <TxButton
            variant="secondary"
            onClick={() => ecosystem!.claimMonthlyRoyalty(BigInt(monthId || "0"))}
            successMessage="Royalty pool claimed"
          >
            Claim Month #{monthId}
          </TxButton>
        </div>
      </div>
    </Card>
  );
}
