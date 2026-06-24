import { useState, type ReactNode } from "react";
import type { ContractTransactionResponse } from "ethers";
import { useToast, parseTxError } from "../context/ToastContext";

interface TxButtonProps {
  onClick: () => Promise<ContractTransactionResponse>;
  children: ReactNode;
  successMessage?: string;
  onSuccess?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}

const variantClasses: Record<string, string> = {
  primary:
    "bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-neutral-900 shadow shadow-amber-300/50",
  secondary: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300",
  danger: "bg-rose-600 hover:bg-rose-500 text-white",
};

export function TxButton({
  onClick,
  children,
  successMessage = "Transaction confirmed",
  onSuccess,
  disabled,
  variant = "primary",
  className = "",
}: TxButtonProps) {
  const [pending, setPending] = useState(false);
  const { push } = useToast();

  const handleClick = async () => {
    setPending(true);
    try {
      const tx = await onClick();
      push("info", "Transaction submitted...");
      await tx.wait();
      push("success", successMessage);
      onSuccess?.();
    } catch (err) {
      push("error", parseTxError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || pending}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
    >
      {pending ? "Processing..." : children}
    </button>
  );
}
