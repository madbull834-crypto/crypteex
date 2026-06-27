import { useMemo, useState } from "react";
import { useNftCatalog } from "../hooks/useNftCatalog";
import { NftListCard } from "../components/marketplace/NftListCard";
import { AdminMintPanel } from "../components/marketplace/AdminMintPanel";
import { SubscriptionPanel } from "../components/marketplace/SubscriptionPanel";
import { StatCard } from "../components/Card";
import { formatUsdt } from "../utils/format";
import { PACKAGE_NAMES } from "../config/contracts";
import { usePackages } from "../hooks/usePackages";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { ReferralPanel } from "../components/ReferralPanel";

type StatusFilter = "all" | "platform" | "resale" | "owned";
type SortMode = "price-asc" | "price-desc" | "newest";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "platform", label: "Platform" },
  { value: "resale", label: "Resale" },
  { value: "owned", label: "My NFTs" },
];

export default function Marketplace() {
  const { entries, loading, refetch } = useNftCatalog();
  const { fixedPackages } = usePackages();
  const { subscriptions, refetch: refetchSubscriptions } = useSubscriptions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const platformCount = entries.filter((e) => e.status === "platform").length;
  const resaleCount = entries.filter((e) => e.status === "resale").length;
  const floorPrice = entries
    .filter((e) => e.status === "platform" || e.status === "resale")
    .reduce<bigint | null>((min, e) => (min === null || e.price < min ? e.price : min), null);
  const lowestForSaleTokenId = (() => {
    const forSale = entries.filter((e) => e.status === "platform" || e.status === "resale");
    if (forSale.length === 0) return null;
    return forSale.reduce((best, e) => (e.price < best.price ? e : best), forSale[0]).tokenId;
  })();

  const visibleEntries = useMemo(() => {
    let result = entries;
    if (statusFilter !== "all") {
      result = result.filter((e) => e.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((e) => {
        const name = (PACKAGE_NAMES[e.packageId] ?? "").toLowerCase();
        return name.includes(q) || e.tokenId.toString().includes(q);
      });
    }
    const sorted = [...result];
    if (sortMode === "price-asc") sorted.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
    else if (sortMode === "price-desc") sorted.sort((a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : 0));
    else sorted.sort((a, b) => Number(b.tokenId - a.tokenId));
    return sorted;
  }, [entries, statusFilter, search, sortMode]);

  return (
    <div className="flex flex-col gap-10">
      <section className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 px-6 py-10 text-center sm:px-12">
        <span className="rounded-full border border-amber-300 bg-amber-50 px-4 py-1 text-xs font-medium uppercase tracking-wide text-amber-700">
          Crypteex Marketplace
        </span>
        <h1 className="mt-4 text-3xl font-bold text-neutral-900 sm:text-4xl">Buy, Sell &amp; Collect Crypteex NFTs</h1>
        <p className="mx-auto mt-3 max-w-2xl text-neutral-600">
          Crypteex is the only source of new NFTs: every position starts as a platform listing. Buy one to
          activate your position after purchasing the matching one-time category subscription.
        </p>
      </section>

      <section id="subscription-panel">
        <SubscriptionPanel packages={fixedPackages} subscriptions={subscriptions} onChanged={refetchSubscriptions} />
      </section>

      <ReferralPanel />

      <section className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Platform Listings" value={platformCount} />
        <StatCard label="Resale Listings" value={resaleCount} />
        <StatCard label="Floor Price" value={floorPrice !== null ? `${formatUsdt(floorPrice)} USDT` : "—"} />
        <StatCard label="Collections" value="Silver · Gold · Diamond" />
      </section>

      <AdminMintPanel onMinted={refetch} />

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-neutral-900">NFT Listings</h2>
          <span className="text-sm text-neutral-500">Buy an available NFT, or sell the one you own</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tier or token #..."
            className="w-full max-w-xs rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-500"
          />
          <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  statusFilter === f.value
                    ? "bg-amber-100 text-amber-800"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-500"
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>

        {loading ? (
          <div className="text-neutral-500">Loading listings...</div>
        ) : visibleEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
            {entries.length === 0
              ? "No NFTs are listed yet. As the contract owner, use the admin panel above to seed example listings."
              : "No NFTs match your search or filter."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleEntries.map((entry) => (
              <NftListCard
                key={entry.tokenId.toString()}
                entry={entry}
                onChanged={refetch}
                highlight={lowestForSaleTokenId !== null && entry.tokenId === lowestForSaleTokenId}
                isSubscribed={Boolean(subscriptions[entry.packageId])}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
