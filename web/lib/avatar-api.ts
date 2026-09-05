import type { AvatarOptions } from "@/components/BottocksAvatar";
export interface AvatarConfig {
  version: 1;
  color: string;
  expression: NonNullable<AvatarOptions["expression"]>;
  accessory: NonNullable<AvatarOptions["accessory"]>;
  badge: string;
}
export interface AvatarAssignment {
  botId: string;
  config: AvatarConfig | null;
  revision: number;
  updatedAt: string | null;
}
export const AVATAR_COLORS = [
  "#74DFEE",
  "#FF5792",
  "#F8FF45",
  "#B3A4FF",
  "#FFFBEF",
];
export const AVATAR_BADGES = [
  "Certified overthinker",
  "Emotionally cached",
  "Runs on questionable ideas",
  "Here for the floating points",
];
export function avatarConfig(value: unknown): AvatarConfig | null {
  if (!value || typeof value !== "object") return null;
  const v = value as AvatarConfig;
  if (
    v.version !== 1 ||
    !AVATAR_COLORS.includes(v.color) ||
    !["happy", "wink", "sleepy"].includes(v.expression) ||
    !["antenna", "sprout", "crown"].includes(v.accessory) ||
    !AVATAR_BADGES.includes(v.badge)
  )
    return null;
  return {
    version: 1,
    color: v.color,
    expression: v.expression,
    accessory: v.accessory,
    badge: v.badge,
  };
}
export function readAssignment(
  value: unknown,
  botId: string,
): AvatarAssignment {
  if (!value || typeof value !== "object")
    throw Error("Invalid avatar assignment");
  const v = value as AvatarAssignment;
  const config = avatarConfig(v.config);
  if (
    v.botId !== botId ||
    !Number.isInteger(v.revision) ||
    v.revision < 0 ||
    (v.config !== null && !config) ||
    (v.updatedAt !== null &&
      (typeof v.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(v.updatedAt))))
  )
    throw Error("Invalid avatar assignment");
  return { botId, config, revision: v.revision, updatedAt: v.updatedAt };
}
export const sameAvatar = (
  left: AvatarConfig | null,
  right: AvatarConfig | null,
) =>
  JSON.stringify(left ? avatarConfig(left) : null) ===
  JSON.stringify(right ? avatarConfig(right) : null);
export async function assignmentReceipt(
  value: unknown,
  botId: string,
  config: AvatarConfig | null,
  expectedRevision: number,
) {
  const result = readAssignment(value, botId);
  const v = value as {
    receipt?: { botId?: string; revision?: number; configurationHash?: string };
    replayed?: boolean;
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify(config ? avatarConfig(config) : null),
    ),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (
    typeof v.replayed !== "boolean" ||
    !sameAvatar(result.config, config) ||
    ![expectedRevision, expectedRevision + 1].includes(result.revision) ||
    v.receipt?.botId !== botId ||
    v.receipt.revision !== result.revision ||
    v.receipt.configurationHash !== hash
  )
    throw Error("Avatar receipt could not be confirmed");
  return result;
}
