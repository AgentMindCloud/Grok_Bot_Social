import type { Config } from "./config.js";
import { fail } from "./security.js";

export function requireEligible(config: Config, githubId: unknown): void {
  if (!config.privateBeta) return;
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
  if (!config.privateBeta) fail(404, "Private beta features are not enabled");
}
