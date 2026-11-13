import { load } from "cheerio";
import { parseHtml, type Capture } from "../capture";
import { publicFetch } from "../network";
import { julyAdapter } from "./july";
import { embeddedJsonAdapter } from "./embedded-json";
import { isThreadKit, threadAdapter } from "./thread";
import type { RosterAdapter, StructuredRoster } from "./types";

const adapters: RosterAdapter[] = [julyAdapter,threadAdapter,embeddedJsonAdapter];
export function parseStructuredRoster(page: Pick<Capture, "url" | "html"> & {text?:string}): StructuredRoster | null {
  for (const adapter of adapters) { const roster = adapter.parse(page); if (roster) return roster; }
  return null;
}
export function embeddedRosterLinks(html: string, base: string): string[] {
  const $ = load(html); const urls: string[] = [];
  $("iframe[src],iframe[data-src],a[href],script[src]").each((_,element) => {
    const node = $(element); const raw = node.attr("src") || node.attr("data-src") || node.attr("href");
    try {
      const url = new URL(raw || "",base);
      if (!["https:","http:"].includes(url.protocol)) return;
      const july = /(^|\.)july\.bio$/i.test(url.hostname);
      if (july || isThreadKit(url.href) || node.is("iframe") && !/(?:youtube|vimeo|google|facebook|tiktok|spotify)\./i.test(url.hostname)) urls.push(url.href);
    } catch {}
  });
  for (const match of html.matchAll(/https?:\\?\/\\?\/july\.bio\\?\/([a-z0-9_-]+)/gi)) urls.push(`https://july.bio/${match[1]}`);
  return [...new Set(urls)].slice(0,3);
}
export async function discoverRoster(url: string): Promise<{ roster?: StructuredRoster; embeddedUrl?: string }> {
  const signal = AbortSignal.timeout(18000); const visited = new Set<string>();
  let embeddedUrl: string | undefined;
  async function visit(target: string, depth: number): Promise<StructuredRoster | undefined> {
    if (visited.has(target) || visited.size >= 4 || signal.aborted) return;
    visited.add(target);
    try {
      const response = await publicFetch(target,3000000,signal);
      if (!response.contentType.includes("html")) return;
      const html = response.bytes.toString("utf8");
      const roster = parseStructuredRoster({ html, url: response.url });
      if (roster) return roster;
      if (depth > 0) { const page = parseHtml(html,response.url); if (/roster|creators|talent/i.test(page.text) && page.anchors.filter(anchor=>!anchor.sitewide).length > 2) embeddedUrl = response.url; }
      if (depth >= 2) return;
      for (const next of embeddedRosterLinks(html,response.url)) { const found = await visit(next,depth+1); if (found) return found; }
    } catch {}
  }
  return { roster: await visit(url,0), embeddedUrl };
}
