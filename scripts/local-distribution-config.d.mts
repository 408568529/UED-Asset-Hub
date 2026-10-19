export function isLocalDistributionEnvironment(environment?: NodeJS.ProcessEnv): boolean;
export function acceptsLocalDistributionRequest(request: { headers: { get(name: string): string | null }; method?: string }, environment?: NodeJS.ProcessEnv): boolean;
