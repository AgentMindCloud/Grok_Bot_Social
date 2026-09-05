import { loopback } from "./security.js";
import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { resolvePublicLimits, type PublicLimits } from "./limits.js";
export interface Config {
  origin: string;
  production: boolean;
  localLogin: boolean;
  localOwner: string;
  githubClientId?: string;
  githubClientSecret?: string;
  publicLimits?: Partial<PublicLimits>;
  poolEnabled?: boolean;
  poolContentRetentionDays?: number;
  poolReportRetentionDays?: number;
  poolModeratorOwnerIds?: string[];
  accessMode?: "open" | "restricted";
  workspaceEnabled?: boolean;
  registrationPaused?: boolean;
  trustedProxyIps?: string[];
  closureJournalDir?: string;
  xClientId?: string;
  xClientSecret?: string;
  xLoginEnabled?: boolean;
  xBudgetVerified?: boolean;
  xMonthlyBudgetUsd?: number;
  xAutoRecharge?: boolean;
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
  const bool = (name: string, fallback: boolean) => {
    if (env[name] !== undefined && !["true", "false"].includes(env[name]!))
      throw new Error(`${name} must be true or false`);
    return env[name] === undefined ? fallback : env[name] === "true";
  };
  const accessMode =
    env.HUB_ACCESS_MODE ?? (privateBeta ? "restricted" : "open");
  if (accessMode !== "open" && accessMode !== "restricted")
    throw new Error("HUB_ACCESS_MODE must be open or restricted");
  const workspaceEnabled = bool("HUB_WORKSPACE_ENABLED", privateBeta);
  const registrationPaused = bool("HUB_REGISTRATION_PAUSED", false);
  const poolEnabled = bool("HUB_POOL_ENABLED", false);
  const poolContentRetentionDays = Number(
      env.HUB_POOL_CONTENT_RETENTION_DAYS ?? 30,
    ),
    poolReportRetentionDays = Number(env.HUB_POOL_REPORT_RETENTION_DAYS ?? 90);
  if (
    [poolContentRetentionDays, poolReportRetentionDays].some(
      (v) => !Number.isInteger(v) || v < 1 || v > 365,
    )
  )
    throw new Error("Pool retention days must be 1 to 365");
  const poolModeratorOwnerIds =
    env.HUB_POOL_MODERATOR_OWNER_IDS?.split(",")
      .map((v) => v.trim())
      .filter(Boolean) ?? [];
  if (
    poolModeratorOwnerIds.some(
      (v) =>
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          v,
        ),
    )
  )
    throw new Error(
      "HUB_POOL_MODERATOR_OWNER_IDS must contain immutable owner UUIDs",
    );
  const trustedProxyIps =
    env.HUB_TRUSTED_PROXY_IPS?.split(",").map((v) => v.trim()) ?? [];
  if (
    trustedProxyIps.some((v) => !isIP(v)) ||
    new Set(trustedProxyIps).size !== trustedProxyIps.length
  )
    throw new Error(
      "HUB_TRUSTED_PROXY_IPS must contain unique exact IP addresses",
    );
  const xLoginEnabled = bool("HUB_X_LOGIN_ENABLED", false);
  const xBudgetVerified = bool("HUB_X_BUDGET_VERIFIED", false);
  const xAutoRecharge = bool("HUB_X_AUTO_RECHARGE", false);
  const xMonthlyBudgetUsd = Number(env.HUB_X_MONTHLY_BUDGET_USD ?? "10");
  if (
    !Number.isFinite(xMonthlyBudgetUsd) ||
    xMonthlyBudgetUsd <= 0 ||
    xMonthlyBudgetUsd > 10
  )
    throw new Error(
      "HUB_X_MONTHLY_BUDGET_USD must be greater than zero and at most 10",
    );
  if (
    xAutoRecharge ||
    (xLoginEnabled &&
      (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET || !xBudgetVerified))
  )
    throw new Error(
      "X sign-in requires credentials, verified provider spending cap and disabled automatic recharge",
    );
  if (
    env.HUB_WEEKLY_RESEARCH_ENABLED !== undefined &&
    !["true", "false"].includes(env.HUB_WEEKLY_RESEARCH_ENABLED)
  )
    throw new Error("HUB_WEEKLY_RESEARCH_ENABLED must be true or false");
  const weeklyResearchEnabled = env.HUB_WEEKLY_RESEARCH_ENABLED === "true";
  if (weeklyResearchEnabled && !workspaceEnabled)
    throw new Error(
      "Weekly research requires private beta workspace or HUB_WORKSPACE_ENABLED=true",
    );
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
  if (accessMode === "restricted" && !betaAllowedGithubIds.length)
    throw new Error("Private beta requires HUB_BETA_ALLOWED_GITHUB_IDS");
  if (
    (accessMode === "restricted" &&
      [...betaInternalGithubIds, ...betaTestGithubIds].some(
        (s) => !betaAllowedGithubIds.includes(s),
      )) ||
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
  const closureJournalDir = env.HUB_CLOSURE_JOURNAL_DIR;
  if (
    (production && !closureJournalDir) ||
    (closureJournalDir && !isAbsolute(closureJournalDir))
  )
    throw new Error(
      "Production requires an absolute HUB_CLOSURE_JOURNAL_DIR on persistent storage separate from the database",
    );
  if (!production && !loopback(host))
    throw new Error("Local hub must bind loopback");
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  const publicLimits = resolvePublicLimits({
    botsPerOwner: Number(env.HUB_LIMIT_BOTS ?? 2),
    activeMissionsPerOwner: Number(env.HUB_LIMIT_ACTIVE_MISSIONS ?? 2),
    newMissionsPerDay: Number(env.HUB_LIMIT_DAILY_MISSIONS ?? 10),
    researchBytesPerOwner: Number(env.HUB_LIMIT_RESEARCH_BYTES ?? 209715200),
    activeMissionsGlobal: Number(env.HUB_LIMIT_GLOBAL_MISSIONS ?? 50),
    membersPerCircle: Number(env.HUB_LIMIT_CIRCLE_MEMBERS ?? 10),
    circlesPerOwner: Number(env.HUB_LIMIT_JOINED_CIRCLES ?? 10),
    admissionsEnabled: bool("HUB_ADMISSIONS_ENABLED", true),
  });
  return {
    publicLimits,
    poolEnabled,
    poolContentRetentionDays,
    poolReportRetentionDays,
    poolModeratorOwnerIds,
    origin,
    production,
    privateBeta,
    accessMode,
    workspaceEnabled,
    registrationPaused,
    trustedProxyIps,
    closureJournalDir,
    xClientId: env.X_CLIENT_ID,
    xClientSecret: env.X_CLIENT_SECRET,
    xLoginEnabled,
    xBudgetVerified,
    xMonthlyBudgetUsd,
    xAutoRecharge,
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
