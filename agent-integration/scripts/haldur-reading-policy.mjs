// Existing Haldur read tools only; no tool registration, routes or permissions.
export const readingPolicyUrl = new URL(import.meta.url);
export const READ = 'mcp__asset_hub__get_haldur_skill_document';
export const SEARCH = 'mcp__asset_hub__search_haldur_skill';
export const isHaldurRead = name => name === READ || name === SEARCH;
// Compatibility API for the pinned GenUI integration. Skill access is governed
// by the source provider's per-file/path/hash limits, not a second turn quota.
export class HaldurReadingPolicy {
  reset() {}
  beginTurn() {}
  check() { return undefined; }
}
export function registerHaldurReadingPolicy() {}
