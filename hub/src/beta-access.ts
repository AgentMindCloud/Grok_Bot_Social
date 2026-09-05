import type { Config } from "./config.js";
import { fail } from "./security.js";
import { journalBlocksOwner } from "./closure-journal.js";

export function requireEligible(config: Config, githubId: unknown): void {
  if (accessMode(config) === "open") return;
  // Explicit developer fixture only; createApp separately enforces loopback.
  if (
    !config.production &&
    config.localLogin &&
    githubId === `local:${config.localOwner}`
  )
    return;
  if (
    typeof githubId !== "string" ||
    !config.betaAllowedGithubIds?.includes(githubId)
  )
    fail(403, "This GitHub account is not invited to the private beta");
}

export function requireBeta(config: Config): void {
  if (!workspaceEnabled(config))
    fail(404, "Private beta features are not enabled");
}

export const accessMode = (config: Config) =>
  config.accessMode ?? (config.privateBeta ? "restricted" : "open");
export const workspaceEnabled = (config: Config) =>
  config.workspaceEnabled ?? !!config.privateBeta;
export function requireActive(
  owner:
    | {
        id?: unknown;
        owner_id?: unknown;
        status?: unknown;
        owner_status?: unknown;
      }
    | undefined,
) {
  if (
    !owner ||
    journalBlocksOwner(owner.owner_id ?? owner.id) ||
    (owner.owner_status ?? owner.status ?? "active") !== "active"
  )
    fail(403, "Account access is unavailable");
}
