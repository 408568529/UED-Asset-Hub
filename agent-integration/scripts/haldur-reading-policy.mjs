// Existing Haldur read tools only; no tool registration, routes or permissions.
export const readingPolicyUrl = new URL(import.meta.url);
export const READ = 'mcp__asset_hub__get_haldur_skill_document';
export const SEARCH = 'mcp__asset_hub__search_haldur_skill';
export const isHaldurRead = name => name === READ || name === SEARCH;
const stop = 'Haldur evidence incomplete: do not create/update a design or invent fallback styles. ';
const done = doc => doc?.complete === true;
function requirements(body) {
  const flow = body.split('## 核心流程')[1]?.split('## 视觉来源优先级')[0];
  const links = [...(flow ?? '').matchAll(/\[[^\]]+\]\(\.\/([^)#]+\.md)\)/g)].map(match => match[1]);
  // Recognize the accepted entry's page-flow contract, fail closed on changes.
  return links.length === 4 ? { ordered: links.slice(0, 3), review: links[3] } : null;
}
export class HaldurReadingPolicy {
  usage = new WeakMap();
  reset(agent) { this.usage.delete(agent); }
  activate(agent) {
    if (!this.usage.has(agent)) this.usage.set(agent, { pages: 0, searches: 0, documents: new Map(), requirements: null });
    return this.usage.get(agent);
  }
  beginTurn(agent, messages) {
    const users = messages.filter(message => message.source.kind === 'user');
    if (!users.length) return;
    this.reset(agent);
    const text = users.flatMap(message => message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
    if (/Haldur|极光/iu.test(text)) this.activate(agent);
  }
  check(exec) {
    if (!exec.agent) return;
    let state = this.usage.get(exec.agent);
    if (!isHaldurRead(exec.name)) {
      if (!state || !['genui_create', 'genui_update'].includes(exec.name)) return;
      if (!state.requirements) return stop + 'Read complete SKILL.md and its supported core-flow contract first.';
      const missing = ['SKILL.md', ...state.requirements.ordered, state.requirements.review,
        ...state.documents.keys()].filter(path => !done(state.documents.get(path)));
      if (missing.length) return stop + 'Finish reading: ' + [...new Set(missing)].join(', ') + '. Continue nextOffset with unchanged sha256, or report the gap and stop generation.';
      return;
    }
    state = this.activate(exec.agent);
    if (exec.name === SEARCH) {
      if (state.searches >= 6) return stop + 'Discovery budget (6 per turn) reached; report gaps, do not use another endpoint.';
      state.searches++; return;
    }
    if (state.pages >= 64) return stop + 'Page budget (64 per turn) reached; report gaps, do not use another endpoint.';
    state.pages++;
    const { path, offset = 0, sha256 } = exec.arguments ?? {};
    if (path !== 'SKILL.md') {
      if (!done(state.documents.get('SKILL.md')) || !state.requirements) return stop + 'Read SKILL.md first.';
      const next = state.requirements.ordered.find(item => !done(state.documents.get(item)));
      if (next && next !== path) return stop + 'Next required document: ' + next + '. Complete its pages before the next document.';
    }
    const previous = state.documents.get(path);
    if (offset > 0 && (!previous || previous.nextOffset !== offset || previous.sha256 !== sha256)) return stop + 'Continuation must use preceding nextOffset and unchanged sha256; restart offset 0 after a change.';
    if (offset === 0) {
      state.documents.set(path, { complete: false, nextOffset: 0 });
      if (path === 'SKILL.md') state.requirements = null;
    }
  }
  observe(exec, result) {
    if (exec.name !== READ || !exec.agent) return;
    const state = this.usage.get(exec.agent);
    if (!state) return;
    const path = exec.arguments?.path;
    if (result.isError) { state.documents.set(path, { complete: false }); return; }
    let doc;
    try { doc = JSON.parse(result.value.content.find(block => block.type === 'text').text); }
    catch { state.documents.set(path, { complete: false }); return; }
    const offset = exec.arguments.offset ?? 0, previous = state.documents.get(path);
    const valid = doc.relativePath === path && doc.hasContent === true && /^[a-f0-9]{64}$/.test(doc.sha256)
      && doc.offset === offset && Number.isInteger(doc.end) && doc.end > offset
      && Array.from(doc.content ?? '').length === doc.end - offset && doc.end <= doc.totalCharacters
      && (offset === 0 || (previous?.nextOffset === offset && previous.sha256 === doc.sha256))
      && (doc.nextOffset === null ? doc.end === doc.totalCharacters : doc.nextOffset === doc.end);
    state.documents.set(path, valid ? { sha256: doc.sha256, nextOffset: doc.nextOffset, complete: doc.nextOffset === null } : { complete: false });
    if (path === 'SKILL.md' && valid && doc.nextOffset === null) state.requirements = requirements(doc.content);
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
  ctx.on('tools/post-execute', (exec, result, next) => { policy.observe(exec, result); return next(); });
}
