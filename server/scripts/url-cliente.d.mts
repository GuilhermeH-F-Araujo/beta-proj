export function resolveClientUrl(env?: NodeJS.ProcessEnv): string;
export function trustedClientOrigins(env?: NodeJS.ProcessEnv): Set<string>;
export function isTrustedPanelMutation(origin: string | undefined, fetchSite: string | undefined, env?: NodeJS.ProcessEnv): boolean;
