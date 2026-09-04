import type { WeeklyMissionInput } from "../../../../hub/src/contracts";

export function publicHttpsUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a complete HTTPS URL for each source."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || !host.includes(".") || host.endsWith(".") || host.includes(":") || /^[\d.]+$/.test(host) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw new Error("Use public HTTPS websites with DNS names, without credentials or local addresses.");
  return url;
}
export function prepareWeeklyInput(offer: string, buyer: string, products: { name: string; url: string }[], sourceText: string): WeeklyMissionInput {
  if (!offer.trim() || !buyer.trim()) throw new Error("Describe your offer and the buyer whose decision matters.");
  const selected = products.filter(product => product.name.trim() || product.url.trim());
  if (selected.length > 3) throw new Error("Choose up to three products.");
  const normalized = selected.map(product => {
    if (!product.name.trim()) throw new Error("Give each selected product a name.");
    return { name: product.name.trim(), url: publicHttpsUrl(product.url).href };
  });
  const seedUrls = [...new Set(sourceText.split(/\r?\n/).map(value => value.trim()).filter(Boolean).map(value => publicHttpsUrl(value).href))];
  if (!seedUrls.length || seedUrls.length > 20) throw new Error("Choose between one and twenty starting URLs, one per line.");
  const approvedOrigins = [...new Set([...seedUrls, ...normalized.map(product => product.url)].map(value => new URL(value).origin))].sort();
  return { offer: offer.trim(), buyer: buyer.trim(), products: normalized, seedUrls, approvedOrigins };
}
export function dateInSevenDays(now = new Date()): string {
  const date = new Date(now); date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function reviewDateToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid next review date.");
  return date.toISOString();
}
