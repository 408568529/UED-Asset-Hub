// Existing Haldur read tools only; no tool registration, routes or permissions.
export const readingPolicyUrl = new URL(import.meta.url);
export const READ = 'mcp__asset_hub__get_haldur_skill_document';
export const SEARCH = 'mcp__asset_hub__search_haldur_skill';
export const isHaldurRead = name => name === READ || name === SEARCH;
export class HaldurReadingPolicy {
  usage = new WeakMap();
  reset(agent) { this.usage.delete(agent); }
  beginTurn(agent, messages) {
    if (messages.some(message => message.source.kind === 'user')) this.reset(agent);
  }
  check(exec) {
    if (!exec.agent || !isHaldurRead(exec.name)) return;
    let state = this.usage.get(exec.agent);
    if (!state) { state = { pages: 0, searches: 0 }; this.usage.set(exec.agent, state); }
    if (exec.name === SEARCH) {
      if (state.searches >= 6) return 'Haldur discovery budget (6 per turn) reached; narrow the task or continue next turn.';
      state.searches++;
    } else {
      if (state.pages >= 64) return 'Haldur page budget (64 per turn) reached; continue next turn with nextOffset and unchanged sha256.';
      state.pages++;
    }
  }
}
export function registerHaldurReadingPolicy(ctx) {
  const policy = new HaldurReadingPolicy();
  ctx.on('agent/pre-step', ({ agent, messages }, next) => {
    policy.beginTurn(agent, messages);
    return next();
  });
  ctx.on('tools/pre-execute', (exec, next) => {
    const reason = policy.check(exec);
    return reason ? { kind: 'deny', reason } : next();
  });
}
