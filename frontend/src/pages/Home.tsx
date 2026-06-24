import { Link } from "react-router-dom";
import { Card } from "../components/Card";

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
          Premium NFT Marketplace &amp; Staking
        </span>
        <h1 className="bg-gradient-to-r from-amber-500 via-yellow-500 to-emerald-600 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
          Crypteex
        </h1>
        <p className="max-w-2xl text-neutral-600">
          Stake USDT for guaranteed monthly ROI over a 365-day term, or buy, sell, and trade Crypteex position
          NFTs on the marketplace. Every position is minted as a real ERC-721 token on-chain.
        </p>
        <div className="flex gap-4">
          <Link
            to="/staking"
            className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-3 text-sm font-semibold text-neutral-900 shadow shadow-amber-300/50 hover:from-amber-300 hover:to-yellow-400"
          >
            Start Staking
          </Link>
          <Link
            to="/marketplace"
            className="rounded-lg border border-emerald-300 px-5 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Browse Marketplace
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <h3 className="text-lg font-semibold text-neutral-900">365-Day Term</h3>
          <p className="mt-2 text-sm text-neutral-600">
            ROI accrues monthly and is claimable every completed 30-day period, up to 12 times per stake.
          </p>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-neutral-900">Exit Stability Schedule</h3>
          <p className="mt-2 text-sm text-neutral-600">
            Early exits carry a 25% penalty before 90 days, 15% before 180 days, and a flat 5% from day 180
            onward.
          </p>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-neutral-900">NFT Marketplace</h3>
          <p className="mt-2 text-sm text-neutral-600">
            Buy Crypteex package NFTs at primary sale or trade existing position NFTs with other members.
          </p>
        </Card>
      </section>
    </div>
  );
}
