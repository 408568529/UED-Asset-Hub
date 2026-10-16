// Opt-in shared demo access. Configuration and unlisted native RPCs remain administrator-only.
const guestRpc = new Set([
  'session.list', 'session.search', 'session.create', 'session.history', 'session.models',
  'session.rename', 'session.fork', 'session.prompt', 'session.attachment', 'session.updateQueue', 'session.cancel',
  'subagent.list', 'subagent.history', 'subagent.prompt', 'subagent.interrupt',
  'host.describe', 'host.listDirectory', 'host.createDirectory',
  'workspace.list', 'workspace.create', 'workspace.rename', 'workspace.insertBefore', 'workspace.insertSessionBefore',
  'skill.list', 'agentPreset.list', 'agentPreset.select', 'llm.providers', 'llm.models', 'messageFeedback/list', 'messageFeedback/put', 'messageFeedback/delete', 'respond'
]);
export function allowsPublicAgentRequest(request, url, environment = process.env) {
  if (environment.AGENT_PUBLIC_ACCESS !== 'true') return false;
  const origin = request.headers.origin;
  // Sandbox API calls still require GenUI's existing artifact capability; no management routes qualify.
  if (/^\/genui\/api\/[^/]+\/(state\/(read|write)|tool|external|permission\/[^/]+)$/.test(url.pathname)) {
    return (request.method === 'POST' || request.method === 'OPTIONS') && (origin === 'null' || origin === environment.PUBLIC_ORIGIN);
  }
  const publicDocument = (request.method === 'GET' || request.method === 'HEAD') && (
    url.pathname === '/' || url.pathname === '/index.html'
    || url.pathname === '/favicon.svg' || url.pathname === '/manifest.webmanifest'
    || url.pathname.startsWith('/assets/')
    || /^\/plugins\/(?:@[^/]+\/)?[^/]+\/client\.js$/.test(url.pathname)
    || url.pathname === '/asset-hub-agent-theme.css' || url.pathname === '/asset-hub-agent-brand.js'
    || /^\/genui\/preview\/[^/]+\/[^/]+$/.test(url.pathname)
  );
  if (request.headers['sec-fetch-site'] === 'cross-site' && !publicDocument) return false;
  if (origin && origin !== environment.PUBLIC_ORIGIN && !publicDocument) return false;
  if (request.method === 'POST') {
    return (url.pathname.startsWith('/api/') && guestRpc.has(url.pathname.slice(5)))
      || url.pathname === '/genui/host-control/preview-access';
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  return url.pathname === '/' || url.pathname === '/index.html'
    || url.pathname === '/favicon.svg' || url.pathname === '/manifest.webmanifest'
    || url.pathname.startsWith('/assets/')
    || /^\/plugins\/(?:@[^/]+\/)?[^/]+\/client\.js$/.test(url.pathname)
    || url.pathname === '/asset-hub-agent-theme.css' || url.pathname === '/asset-hub-agent-brand.js'
    || url.pathname === '/api/events.mux' || url.pathname === '/api/events.host' || url.pathname === '/api/session.export'
    || url.pathname === '/.well-known/dsh-genui'
    || /^\/genui\/(preview\/[^/]+\/[^/]+|app\/[^/]+|standalone\.js)$/.test(url.pathname);
}
