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
}
export function config(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
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
