export type {
  Bot,
  Mission,
  Evidence,
  Approval,
  Workspace,
  Session,
  Circle,
} from "../../hub/src/contracts";
export const API_ORIGIN = (process.env.NEXT_PUBLIC_HUB_API_URL || "").replace(
  /\/$/,
  "",
);
export class HubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function hub<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    csrf?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await fetch(API_ORIGIN + path, {
    method: options.method || "GET",
    credentials: "include",
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(12000)])
      : AbortSignal.timeout(12000),
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.csrf ? { "X-CSRF-Token": options.csrf } : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json"))
    throw new HubError(
      "The workspace service is not available at this address yet.",
      response.status,
    );
  const data = await response.json();
  if (!response.ok)
    throw new HubError(
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : "The request could not be completed.",
      response.status,
    );
  return data as T;
}
export function readableError(error: unknown) {
  if (error instanceof HubError) return error.message;
  if (error instanceof Error && error.name === "TimeoutError")
    return "The workspace took too long to respond. Please try again.";
  return "We could not confirm the result of this request. Refresh your workspace before repeating a change.";
}
export function when(value: string | null) {
  if (!value) return "No check-in yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
