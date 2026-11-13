import { load } from "cheerio";
import { parseAudienceCount } from "../audience";
import { parseSocial } from "../social";
import { metricColumns, type AudiencePlatform } from "../types";
import type { RosterAdapter, StructuredCreator } from "./types";

type Json = Record<string, unknown>;
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function publicLink(value: unknown): string { try { const url = new URL(text(value)); return ["http:","https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; } }
export function plausibleEngagement(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string" || value === "") return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? Number(rate.toFixed(4)) : null;
}
export const julyAdapter: RosterAdapter = {
  name: "july",
  parse(page) {
    if (!/(^|\.)july\.bio$/i.test(new URL(page.url).hostname)) return null;
    const $ = load(page.html);
    let data: Json;
    try { data = object(object(object(object(JSON.parse($("script#__NEXT_DATA__").text())).props).pageProps).data); } catch { return null; }
    let roster = object(object(data.roster).json);
    if (typeof object(data.roster).json === "string") { try { roster = object(JSON.parse(String(object(data.roster).json))); } catch { return null; } }
    if (!Array.isArray(roster.creators)) {
      const mediaKit = object(object(data.mediaKit).json);
      const kit = object(mediaKit.data);
      if (mediaKit.isLocked === true || !text(kit.username)) return null;
      const platforms = (Array.isArray(kit.blocks) ? kit.blocks : []).flatMap(entry => {
        const block = object(entry); if (block.enabled !== true) return [];
        const fields = object(block.fields);
        const stats = Array.isArray(fields.stats) ? fields.stats.map(object) : [];
        const count = stats.find(stat => ["followers","subscribers","subscriber_count","follower_count"].includes(text(stat.name)) && stat.enabled !== false)?.value;
        const rate = stats.find(stat => text(stat.name) === "engagement_rate" && stat.display === "percent" && stat.enabled !== false)?.value;
        return [{ platform:block.type, platformUrl:fields.accountUrl, size:count, engagementRate:rate }];
      });
      roster = { creators:[{ ...kit, tags:text(kit.tags).split(",").filter(Boolean), bio:text(kit.bio)||text(kit.about), email:text(kit.contact).includes("@")?text(kit.contact):"", platforms }] };
    }
    const creators: StructuredCreator[] = [];
    for (const entry of Array.isArray(roster.creators)?roster.creators:[]) {
      const item = object(entry); const name = text(item.name); const username = text(item.username);
      if (!name && !username) continue;
      const result: StructuredCreator = {
        creator: { name, primary_handle: username, bio: text(item.bio) || text(item.description), categories: strings(item.tags).join(", "), location: [item.city,item.state,item.country].map(text).filter(Boolean).join(", "), email: text(item.email), management_contact: text(roster.email), source_profile_url: /^[a-z0-9_.-]+$/i.test(username)?`https://july.bio/${encodeURIComponent(username)}`:"", avatar_url: publicLink(item.profilePictureUrl), urls: [] },
        audience: {}, engagement: {}, reviewReasons: [],
      };
      const seen = new Set<string>();
      for (const entry of Array.isArray(item.platforms) ? item.platforms : []) {
        const channel = object(entry);
        const label = text(channel.platform).toLowerCase();
        const platform = (label === "twitter" ? "x" : label) as AudiencePlatform;
        if (!(platform in metricColumns)) continue;
        if (seen.has(platform)) { delete result.audience[platform]; delete result.engagement[platform]; result.reviewReasons.push(`Multiple ${platform} accounts; audience requires review`); continue; }
        seen.add(platform);
        const count = typeof channel.size === "number" && Number.isSafeInteger(channel.size) && channel.size >= 0 ? channel.size : typeof channel.size === "string" ? parseAudienceCount(channel.size) : null;
        if (count !== null) result.audience[platform] = { count, source: "site" };
        const rate = plausibleEngagement(channel.engagementRate);
        if (rate !== null) result.engagement[platform] = rate;
        else if (channel.engagementRate !== undefined && channel.engagementRate !== null) result.reviewReasons.push(`Unusable ${platform} engagement rate`);
        const candidate = parseSocial(publicLink(channel.platformUrl));
        if (candidate?.platform === platform) result.creator.urls.push(candidate.href);
        else if (channel.platformUrl) result.reviewReasons.push(`Unrecognized ${platform} account URL`);
      }
      if (!result.creator.bio) result.reviewReasons.push("Bio missing");
      creators.push(result);
    }
    return { adapter: "july", url: page.url, creators };
  },
};
