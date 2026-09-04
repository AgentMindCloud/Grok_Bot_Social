import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};
export const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function loopback(ip: string): boolean {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
}
export function object(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(400, "Expected a JSON object");
  if (Object.keys(value).some((key) => !keys.includes(key)))
    return fail(400, "Unexpected field");
  return value as Record<string, unknown>;
}
export function string(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    return fail(
      400,
      `${label} is required and must be at most ${max} characters`,
    );
  return value.trim();
}
export function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  label: string,
): T {
  if (!choices.includes(value as T)) return fail(400, `Invalid ${label}`);
  return value as T;
}
export function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    return fail(400, `Invalid ${label}`);
  return value as number;
}
export function publicUrl(value: unknown): string {
  const input = string(value, "Source URL", 2048);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail(400, "Invalid source URL");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".") ||
    host.includes(":") ||
    /^[\d.]+$/.test(host)
  )
    return fail(
      400,
      "Sources must use public HTTPS DNS names without credentials",
    );
  if (url.href.length > 2048)
    return fail(400, "Normalized source URL exceeds 2048 characters");
  return url.href;
}
