import { useEffect, useState } from "react";
import { Card } from "../Card";
import { useWeb3 } from "../../context/Web3Context";
import { useToast, parseTxError } from "../../context/ToastContext";
import { PACKAGE_NAMES } from "../../config/contracts";

const PACKAGE_IDS = [1, 2, 3];

export function AdminMintPanel({ onMinted }: { onMinted: () => void }) {
  const { ecosystem, ecosystemRead, account } = useWeb3();
  const { push } = useToast();
  const [isOwner, setIsOwner] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, string>>({ 1: "1", 2: "1", 3: "1" });
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!ecosystemRead || !account) {
      setIsOwner(false);
      return;
    }
    ecosystemRead
      .owner()
      .then((owner: string) => setIsOwner(owner.toLowerCase() === account.toLowerCase()))
      .catch(() => setIsOwner(false));
  }, [ecosystemRead, account]);

  if (!isOwner) return null;

  const mintMany = async (packageId: number, count: number) => {
    setPendingId(packageId);
    try {
      for (let i = 0; i < count; i++) {
        const tx = await ecosystem!.adminMintFixedNFTForSale(packageId);
        await tx.wait();
      }
      push("success", `${count} ${PACKAGE_NAMES[packageId]} NFT${count > 1 ? "s" : ""} minted and listed`);
      onMinted();
    } catch (err) {
      push("error", parseTxError(err));
    } finally {
      setPendingId(null);
    }
  };

  const seedExamples = async () => {
    setSeeding(true);
    try {
      for (const id of PACKAGE_IDS) {
        const tx = await ecosystem!.adminMintFixedNFTForSale(id);
        await tx.wait();
      }
      push("success", "Seeded one example NFT per tier");
      onMinted();
    } catch (err) {
      push("error", parseTxError(err));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 border-amber-300 bg-gradient-to-br from-amber-50 to-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Admin: Mint Sample NFTs</h3>
          <p className="mt-1 text-sm text-neutral-600">
            You are the contract owner. Mint fixed package NFTs and list them for primary sale instantly.
          </p>
        </div>
        <button
          onClick={seedExamples}
          disabled={seeding || pendingId !== null}
          className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-neutral-900 shadow shadow-amber-300/50 hover:from-amber-300 hover:to-yellow-400 disabled:opacity-50"
        >
          {seeding ? "Seeding..." : "Seed 1 of Each Tier"}
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        {PACKAGE_IDS.map((id) => (
          <div key={id} className="flex items-center gap-2 rounded-lg border border-neutral-200 p-2">
            <span className="px-1 text-sm font-medium text-neutral-700">{PACKAGE_NAMES[id]}</span>
            <input
              type="number"
              min="1"
              max="20"
              value={quantities[id]}
              onChange={(e) => setQuantities((q) => ({ ...q, [id]: e.target.value }))}
              className="w-16 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-amber-500"
            />
            <button
              onClick={() => mintMany(id, Math.max(1, Math.min(20, Number(quantities[id]) || 1)))}
              disabled={pendingId !== null || seeding}
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-50"
            >
              {pendingId === id ? "Minting..." : "Mint"}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
