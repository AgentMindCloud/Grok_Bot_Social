export function ageLabel(iso: string | null, nowMs: number): string {
  if (!iso) return "not recorded";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "time unavailable";
  const delta = Math.max(0, nowMs - then);
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function sourceLabel(source: string | null): string {
  switch (source) {
    case "hub-recorded":
      return "Hub recorded";
    case "adapter-observed":
      return "Adapter observed";
    case "bot-reported":
      return "Bot reported";
    case "external-confirmation":
      return "External confirmation";
    default:
      return "Source unknown";
  }
}

export function storageKey(ownerId: string, name: string) {
  return `gbs.bot-activity.${ownerId}.${name}`;
}
