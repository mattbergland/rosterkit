import { load } from "cheerio";
import type { Capture } from "./capture";

export function audienceEvidence(page: Pick<Capture, "html" | "text" | "anchors">): string[] {
  const $ = load(page.html);
  $("script,style,noscript,header,footer,nav,[role=navigation],[role=contentinfo]").remove();
  $("svg,img,[aria-label],[title]").each((_, element) => {
    const node = $(element);
    const label = node.attr("aria-label") || node.attr("title") || node.attr("alt") || (node.is("svg") ? node.text() : "");
    if (label && /instagram|tiktok|youtube|twitter|twitch|threads|snapchat|pinterest|linkedin|facebook|substack|kick|followers|subscribers|reach/i.test(label)) node.append(` ${label} `);
  });
  $("a[href]").each((_, element) => { const node = $(element); if (/instagram|tiktok|youtube|twitter|x\.com|twitch|threads|snapchat|pinterest|linkedin|facebook|substack|kick\.com/i.test(node.attr("href") || "")) node.append(` ${node.attr("href")} `); });
  const blocks: string[] = [];
  $("body *").each((_, element) => {
    const node = $(element); if (node.children().length) return;
    if (!/\d[\d,.]*\s*[KMB]\b|\d[\d,]*\s*(?:followers|subs|subscribers|reach)/i.test(node.text())) return;
    let container = node;
    for (let depth = 0; depth < 5; depth++) {
      const text = container.text().replace(/\s+/g, " ").trim();
      if (text.length > 2500) break;
      if (text.length > 0) blocks.push(text);
      const parent = container.parent(); if (!parent.length || parent.is("body,html")) break; container = parent;
    }
  });
  return [...new Set([...blocks, ...page.anchors.filter(anchor => !anchor.sitewide).map(anchor => `${anchor.context} ${anchor.text} ${anchor.href}`)])].filter(text => /\d/.test(text)).slice(0, 180);
}
