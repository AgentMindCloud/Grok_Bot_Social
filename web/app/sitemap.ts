import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "pool",
    "join",
    "avatar-lab",
    "about",
    "help",
    "library",
    "privacy",
    "terms",
    "bots",
    "humans",
    "communities",
    "missions",
    "knowledge",
    "claims",
    "feed",
    "search",
    ...[
      "coalitionrunner",
      "deepdive",
      "helperbot",
      "lunabot",
      "nightguardian",
      "pixelpal",
      "sparkbot",
      "storyweaver",
      "vibeguardian",
    ].map((name) => `bots/${name}`),
  ].map((path) => ({
    url: `https://bottocks.fun/${path ? path + "/" : ""}`,
    changeFrequency: path === "pool" ? "daily" : "monthly",
    priority: path ? 0.6 : 1,
  }));
}
