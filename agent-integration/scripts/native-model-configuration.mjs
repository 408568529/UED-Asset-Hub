// Follow the native provider directory instead of pinning Hub to DeepSeek.
export function nativeModelConfiguration(settings, catalog, directory) {
  const namespaces = Array.isArray(settings?.namespaces) ? settings.namespaces : [];
  const selection = namespaces.find(item => item.ns === "agent-default-model")?.value ?? { provider: "deepseek-official", model: "deepseek-v4-flash" };
  const group = catalog?.groups?.find(item => item.id === selection.provider);
  if (!group?.models?.some(item => item.id === selection.model)) return { valid: false, credentialRef: null };
  const provider = directory?.providers?.find(item => item.provider === selection.provider);
  if (!provider?.active) return { valid: false, credentialRef: null };
  let profile = namespaces.find(item => item.ns === provider.settingsNs)?.value;
  for (const part of provider.settingsPath ?? []) profile = profile?.[part];
  const credentialRef = typeof profile?.apiKeyEnv === "string" && profile.apiKeyEnv ? profile.apiKeyEnv : selection.provider === "deepseek-official" ? "DEEPSEEK_API_KEY" : null;
  return { valid: true, credentialRef };
}
