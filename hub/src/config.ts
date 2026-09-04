import { loopback } from "./security.js";
export interface Config {
  origin: string;
  production: boolean;
  localLogin: boolean;
  localOwner: string;
  githubClientId?: string;
  githubClientSecret?: string;
  port: number;
  host: string;
  databaseUrl?: string;
  dataDir?: string;
  sessionHours: number;
  pairingMinutes: number;
  leaseSeconds: number;
  maxAttempts: number;
  fetch: typeof fetch;
  privateBeta?: boolean;
  weeklyResearchEnabled?: boolean;
  betaAllowedGithubIds?: string[];
  betaInternalGithubIds?: string[];
  betaTestGithubIds?: string[];
  betaCohort?: string;
}
export function config(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  if (
    env.HUB_PRIVATE_BETA !== undefined &&
    !["true", "false"].includes(env.HUB_PRIVATE_BETA)
  )
    throw new Error("HUB_PRIVATE_BETA must be true or false");
  const privateBeta = env.HUB_PRIVATE_BETA === "true";
  if (
    env.HUB_WEEKLY_RESEARCH_ENABLED !== undefined &&
    !["true", "false"].includes(env.HUB_WEEKLY_RESEARCH_ENABLED)
  )
    throw new Error("HUB_WEEKLY_RESEARCH_ENABLED must be true or false");
  const weeklyResearchEnabled = env.HUB_WEEKLY_RESEARCH_ENABLED === "true";
  if (weeklyResearchEnabled && !privateBeta)
    throw new Error("Weekly research requires private beta access controls");
  const ids = (name: string) => {
    if (!env[name]) return [];
    const values = env[name]!.split(",").map((s) => s.trim());
    if (
      values.some((s) => !/^[1-9][0-9]{0,19}$/.test(s)) ||
      new Set(values).size !== values.length
    )
      throw new Error(`${name} must contain unique numeric GitHub IDs`);
    return values;
  };
  const betaAllowedGithubIds = ids("HUB_BETA_ALLOWED_GITHUB_IDS");
  const betaInternalGithubIds = ids("HUB_BETA_INTERNAL_GITHUB_IDS");
  const betaTestGithubIds = ids("HUB_BETA_TEST_GITHUB_IDS");
  if (privateBeta && !betaAllowedGithubIds.length)
    throw new Error("Private beta requires HUB_BETA_ALLOWED_GITHUB_IDS");
  if (
    [...betaInternalGithubIds, ...betaTestGithubIds].some(
      (s) => !betaAllowedGithubIds.includes(s),
    ) ||
    betaInternalGithubIds.some((s) => betaTestGithubIds.includes(s))
  )
    throw new Error(
      "Beta classifications must be disjoint subsets of the allowlist",
    );
  const betaCohort = env.HUB_BETA_COHORT ?? "private-beta-1";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(betaCohort))
    throw new Error("Invalid HUB_BETA_COHORT");
  const origin = env.PUBLIC_ORIGIN ?? "http://127.0.0.1:3000";
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password)
    throw new Error("PUBLIC_ORIGIN must be an exact origin without path");
  const host = env.HUB_HOST ?? "127.0.0.1";
  const localLogin = env.HUB_LOCAL_OWNER_LOGIN === "true";
  if (
    localLogin &&
    (production ||
      !loopback(host) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  )
    throw new Error(
      "Local owner login requires non-production loopback host and origin",
    );
  if (
    production &&
    (!env.DATABASE_URL ||
      url.protocol !== "https:" ||
      !env.GITHUB_CLIENT_ID ||
      !env.GITHUB_CLIENT_SECRET)
  )
    throw new Error(
      "Production requires DATABASE_URL, HTTPS PUBLIC_ORIGIN, GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET",
    );
  if (!env.DATABASE_URL && env.HUB_EMBEDDED_DB !== "true")
    throw new Error(
      "Set DATABASE_URL, or explicitly set HUB_EMBEDDED_DB=true for local development",
    );
  if (!production && !loopback(host))
    throw new Error("Local hub must bind loopback");
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  return {
    origin,
    production,
    privateBeta,
    weeklyResearchEnabled,
    betaAllowedGithubIds,
    betaInternalGithubIds,
    betaTestGithubIds,
    betaCohort,
    localLogin,
    localOwner: env.HUB_LOCAL_OWNER_HANDLE ?? "local-owner",
    githubClientId: env.GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET,
    port,
    host,
    databaseUrl: env.DATABASE_URL,
    dataDir: env.HUB_DATA_DIR ?? ".data/postgres",
    sessionHours: 24,
    pairingMinutes: 10,
    leaseSeconds: 300,
    maxAttempts: 3,
    fetch,
  };
}
