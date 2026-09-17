import { isAdminRequest } from "@/lib/adminAuth";

export type HaldurCapability = "haldur.read" | "haldur.write" | "haldur.delete" | "haldur.overwrite" | "haldur.export" | "haldur.admin";
const administratorCapabilities: HaldurCapability[] = ["haldur.read", "haldur.write", "haldur.delete", "haldur.overwrite", "haldur.export", "haldur.admin"];

// Asset Hub currently has one authenticated administrator session. This maps that
// existing identity to capabilities without introducing a parallel user system.
export function haldurCapabilities(request: Request) { return isAdminRequest(request) ? administratorCapabilities : []; }
export function hasHaldurCapability(request: Request, capability: HaldurCapability) { return haldurCapabilities(request).includes(capability); }
