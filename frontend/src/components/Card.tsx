import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/60 ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-emerald-700">{label}</span>
      <span className="text-2xl font-semibold text-neutral-900">{value}</span>
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </Card>
  );
}
