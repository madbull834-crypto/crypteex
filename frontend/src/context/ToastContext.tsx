import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
}

const ToastCtx = createContext<ToastState | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toasts, push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              t.kind === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : t.kind === "error"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function parseTxError(err: unknown): string {
  const e = err as { shortMessage?: string; reason?: string; message?: string };
  return e?.shortMessage || e?.reason || e?.message || "Transaction failed";
}
