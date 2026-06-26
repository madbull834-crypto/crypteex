const TIER_GRADIENTS: Record<number, string> = {
  1: "from-neutral-300 via-neutral-100 to-neutral-400",
  2: "from-amber-300 via-yellow-400 to-amber-600",
  3: "from-cyan-200 via-sky-300 to-blue-500",
};

const TIER_GLOW: Record<number, string> = {
  1: "shadow-neutral-300/40",
  2: "shadow-amber-400/40",
  3: "shadow-cyan-300/40",
};

const TIER_NAMES: Record<number, string> = {
  1: "Silver",
  2: "Gold",
  3: "Diamond",
};

const TIER_IMAGES: Record<number, string> = {
  1: "/nfts/nft-silver.png",
  2: "/nfts/nft-gold.png",
  3: "/nfts/nft-diamond.png",
};

export function NftArt({ packageId, tokenId }: { packageId: number; tokenId?: bigint }) {
  const gradient = TIER_GRADIENTS[packageId] ?? TIER_GRADIENTS[1];
  const glow = TIER_GLOW[packageId] ?? TIER_GLOW[1];
  const tierName = TIER_NAMES[packageId] ?? "Crypteex";
  const imageUri = TIER_IMAGES[packageId] ?? TIER_IMAGES[1];

  return (
    <div
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${gradient} shadow-inner ${glow}`}
    >
      <img
        src={imageUri}
        alt={`${tierName} NFT${tokenId === undefined ? "" : ` #${tokenId.toString()}`}`}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,0.18),transparent_38%)]" />
      <span className="absolute bottom-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-900 shadow-sm">
        {tierName}
      </span>
      {tokenId !== undefined && (
        <span className="absolute top-2 right-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-mono text-neutral-900 shadow-sm">
          #{tokenId.toString()}
        </span>
      )}
    </div>
  );
}
