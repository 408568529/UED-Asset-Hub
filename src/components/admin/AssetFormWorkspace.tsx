import type { ReactNode } from "react";

export function AssetFormWorkspace({ children }: { children: ReactNode }) {
  return <div className="asset-form-workspace"><div className="asset-form-container">{children}</div></div>;
}
