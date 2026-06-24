const TIER_GRADIENTS: Record<number, string> = {
  1: "from-neutral-300 via-neutral-100 to-neutral-400",
  2: "from-amber-300 via-yellow-400 to-amber-600",
  3: "from-emerald-300 via-green-400 to-emerald-600",
};

const TIER_GLOW: Record<number, string> = {
  1: "shadow-neutral-300/40",
  2: "shadow-amber-400/40",
  3: "shadow-emerald-400/40",
};

const TIER_NAMES: Record<number, string> = {
  1: "Silver",
  2: "Gold",
  3: "Diamond",
};

export function NftArt({ packageId, tokenId }: { packageId: number; tokenId?: bigint }) {
  const gradient = TIER_GRADIENTS[packageId] ?? TIER_GRADIENTS[1];
  const glow = TIER_GLOW[packageId] ?? TIER_GLOW[1];
  const imageUri = tokenId === undefined
    ? null
    : `https://api.dicebear.com/9.x/adventurer/svg?seed=metacrown-${tokenId.toString()}`;

  return (
    <div
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${gradient} shadow-inner ${glow}`}
    >
      {imageUri ? (
        <img src={imageUri} alt={`${TIER_NAMES[packageId] ?? "Crypteex"} NFT #${tokenId?.toString() ?? ""}`} className="h-full w-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.05)_0px,rgba(0,0,0,0.05)_2px,transparent_2px,transparent_8px)]" />
          <span className="relative text-6xl drop-shadow-lg">👑</span>
        </>
      )}
      <span className="absolute bottom-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-900 shadow-sm">
        {TIER_NAMES[packageId] ?? "Crypteex"}
      </span>
      {tokenId !== undefined && (
        <span className="absolute top-2 right-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-mono text-neutral-900 shadow-sm">
          #{tokenId.toString()}
        </span>
      )}
    </div>
  );
}
