import { isAdminRequest } from "@/lib/adminAuth";

export type HaldurCapability = "haldur.read" | "haldur.write" | "haldur.delete" | "haldur.overwrite" | "haldur.export" | "haldur.admin";
const administratorCapabilities: HaldurCapability[] = ["haldur.read", "haldur.write", "haldur.delete", "haldur.overwrite", "haldur.export", "haldur.admin"];

// Skill browsing and downloads are public; management capabilities use the existing administrator session.
export function haldurCapabilities(request: Request) { return isAdminRequest(request) ? administratorCapabilities : ["haldur.read", "haldur.export"]; }
export function hasHaldurCapability(request: Request, capability: HaldurCapability) { return haldurCapabilities(request).includes(capability); }
