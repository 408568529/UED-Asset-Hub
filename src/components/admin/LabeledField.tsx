import type { ReactNode } from "react";

export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold">{label}</span>
      {children}
    </label>
  );
}
