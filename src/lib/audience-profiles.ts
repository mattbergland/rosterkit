import { load } from "cheerio";
import { parseAudienceCount, type AudienceMetrics, applyAudienceMetrics } from "./audience";
import { publicFetch } from "./network";
import { parseSocial } from "./social";
import { metricColumns, type AudiencePlatform, type RosterRow } from "./types";

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function integer(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : typeof value === "string" ? parseAudienceCount(value) : null; }
function sameHandle(value: unknown, handle: string) { return typeof value === "string" && value.replace(/^@/, "").toLowerCase() === handle.toLowerCase(); }
function walk(value: unknown, visit: (node: JsonObject) => void, depth = 0) {
  if (depth > 35 || !value || typeof value !== "object") return;
  if (!Array.isArray(value)) visit(object(value));
  for (const child of Object.values(value)) walk(child, visit, depth + 1);
}
function assignedJson(script: string): unknown {
  const assignment = /(?:\bytInitialData|window\[["']ytInitialData["']\])\s*=\s*(\{)/.exec(script);
  if (!assignment) return null;
  const start = assignment.index + assignment[0].length - 1;
  let depth = 0; let quoted = false; let escape = false;
  for (let index = start; index < script.length; index++) {
    const char = script[index];
    if (quoted) { if (escape) escape = false; else if (char === "\\") escape = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) { try { return JSON.parse(script.slice(start, index + 1)); } catch { return null; } }
  }
  return null;
}

export function publicProfileCount(html: string, platform: AudiencePlatform, handle: string): number | null {
  const $ = load(html);
  const counts = new Set<number>();
  const add = (value: unknown) => { const count = integer(value); if (count !== null) counts.add(count); };
  $("script").each((_, element) => {
    const script = $(element).text();
    let data: unknown;
    try { data = JSON.parse(script); } catch { data = platform === "youtube" ? assignedJson(script) : null; }
    if (!data) return;
    if (platform === "youtube") {
      const header = object(data).header;
      walk(header, node => {
        for (const value of Object.values(node)) if (typeof value === "string" && /\bsubscribers?\b/i.test(value)) {
          const match = value.match(/([\d,.]+\s*(?:[KMB]|thousand|million|billion)?)\s+subscribers?\b/i);
          if (match) add(match[1]);
        }
      });
      return;
    }
    if (platform === "tiktok") {
      const scope = object(object(data).__DEFAULT_SCOPE__);
      const info = object(object(scope["webapp.user-detail"]).userInfo);
      if (sameHandle(object(info.user).uniqueId, handle)) add(object(info.stats).followerCount);
      const users = object(object(data).UserModule);
      for (const [id, user] of Object.entries(object(users.users))) if (sameHandle(object(user).uniqueId, handle)) add(object(object(users.stats)[id]).followerCount);
      return;
    }
    walk(data, node => {
      if (platform === "instagram" && sameHandle(node.username, handle)) add(object(node.edge_followed_by).count ?? node.follower_count);
      if (platform === "x" && sameHandle(node.screen_name, handle)) add(node.followers_count);
      if (platform === "threads" && sameHandle(node.username, handle)) add(node.follower_count);
      if (platform === "twitch" && sameHandle(node.login, handle)) add(object(node.followers).totalCount);
    });
  });
  const description = $("meta[name=description]").attr("content") || $("meta[property='og:description']").attr("content") || "";
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`@${escaped}(?![\\w.])`, "i").test(description)) {
    const match = description.match(/([\d,.]+\s*(?:[KMB]|thousand|million|billion)?)\s+(followers|subscribers)\b/i);
    if (match && (platform === "youtube" ? /subscribers/i.test(match[2]) : /followers/i.test(match[2]))) add(match[1]);
  }
  return counts.size === 1 ? [...counts][0] : null;
}

export async function fillPublicAudience(rows: RosterRow[], deadline: number): Promise<void> {
  const remaining = Math.min(35000, deadline - Date.now());
  if (remaining < 1000) return;
  const runSignal = AbortSignal.timeout(remaining);
  const supported: AudiencePlatform[] = ["youtube", "tiktok", "twitch", "instagram", "x", "threads"];
  const tasks = supported.flatMap(platform => rows.flatMap((row, index) => !row[metricColumns[platform]] && row[platform as keyof RosterRow] ? [{ index, platform, url: String(row[platform as keyof RosterRow]) }] : [])).slice(0, 120);
  const found = new Map<number, AudienceMetrics>();
  const cache = new Map<string, Promise<number | null>>();
  let next = 0;
  async function read(url: string, platform: AudiencePlatform): Promise<number | null> {
    const expected = parseSocial(url);
    if (!expected || expected.platform !== platform || runSignal.aborted) return null;
    try {
      const response = await publicFetch(expected.href, 3000000, AbortSignal.any([runSignal, AbortSignal.timeout(7000)]));
      const actual = parseSocial(response.url);
      if (actual?.platform !== platform || !sameHandle(actual.handle, expected.handle) || !response.contentType.includes("html")) return null;
      return publicProfileCount(response.bytes.toString("utf8"), platform, expected.handle);
    } catch { return null; }
  }
  await Promise.all(Array.from({ length: Math.min(5, tasks.length) }, async () => {
    while (next < tasks.length && !runSignal.aborted) {
      const task = tasks[next++];
      const key = `${task.platform}:${task.url}`;
      if (!cache.has(key)) cache.set(key, read(task.url, task.platform));
      const count = await cache.get(key)!;
      if (count !== null) { const metrics = found.get(task.index) || {}; metrics[task.platform] = { count, source: "profile" }; found.set(task.index, metrics); }
    }
  }));
  for (const [index, additions] of found) {
    const row = rows[index]; const metrics: AudienceMetrics = { ...additions };
    for (const [platform, column] of Object.entries(metricColumns)) {
      const count = row[column] === "" ? null : parseAudienceCount(row[column]);
      if (count !== null) metrics[platform as AudiencePlatform] = { count, source: row.metrics_source.includes(`${platform}:profile`) ? "profile" : "site" };
    }
    if (row.total_reach && row.metrics_source.includes("total_reach:site")) metrics.total_reach = { count: Number(row.total_reach), source: "site" };
    applyAudienceMetrics(row, metrics, row.metrics_as_of || undefined);
  }
}
