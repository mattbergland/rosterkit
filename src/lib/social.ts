import type { Anchor, Candidate, Platform } from "./types";

const bioHosts = ["linktr.ee", "beacons.ai", "stan.store", "lnk.bio", "bio.site", "hoo.be", "solo.to", "campsite.bio", "taplink.cc", "snipfeed.co", "linkin.bio", "allmylinks.com", "msha.ke", "withkoji.com"];
const reserved = new Set(["share", "sharing", "intent", "sharer", "sharer.php", "login", "signup", "accounts", "explore", "search", "home", "watch", "reel", "reels", "p", "shorts", "status", "hashtag", "tag", "tags", "embed", "privacy", "legal", "terms"]);
export function parseSocial(input: string, base?: string): Omit<Candidate, "text" | "context"> | null {
  const value = input.trim();
  if (!value) return null;
  if (/^(mailto:)?[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.split("?")[0])) {
    const email = value.replace(/^mailto:/i, "").split("?")[0];
    return { href: `mailto:${email}`, platform: "email", handle: email };
  }
  if (value.startsWith("@")) return null;
  let u: URL;
  try { u = new URL(value.startsWith("www.") ? `https://${value}` : value, base); } catch { return null; }
  if (!["http:", "https:"].includes(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  let parts: string[];
  try { parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch { return null; }
  if (parts.some(p => ["share", "intent", "sharer", "sharer.php", "sharing"].includes(p.toLowerCase()))) return null;
  let platform: Platform = "website";
  let handle = parts[0] || host;
  if (is("instagram.com")) platform = "instagram";
  else if (is("tiktok.com")) platform = "tiktok";
  else if (is("youtube.com") || is("youtu.be")) {
    platform = "youtube";
    if (is("youtu.be") || !parts.length || !["channel", "c", "user"].includes(parts[0]) && !parts[0].startsWith("@")) return null;
    handle = ["channel", "c", "user"].includes(parts[0]) ? parts[1] : parts[0];
    parts = parts.slice(0, parts[0].startsWith("@") ? 1 : 2);
  }
  else if (is("twitter.com") || is("x.com")) platform = "x";
  else if (is("twitch.tv")) platform = "twitch";
  else if (is("threads.net") || is("threads.com")) platform = "threads";
  else if (is("snapchat.com")) { platform = "snapchat"; if (parts[0] !== "add") return null; handle = parts[1]; parts = parts.slice(0, 2); }
  else if (is("pinterest.com") || is("pinterest.co.uk")) platform = "pinterest";
  else if (is("linkedin.com")) { platform = "linkedin"; if (!["in", "company"].includes(parts[0])) return null; handle = parts[1]; parts = parts.slice(0, 2); }
  else if (is("facebook.com") || is("fb.com")) { platform = "facebook"; if (parts[0] === "profile.php") handle = u.searchParams.get("id") || ""; }
  else if (is("substack.com")) { platform = "substack"; handle = host === "substack.com" ? parts[0] : host.slice(0, -13); }
  else if (is("spotify.com") || is("podcasts.apple.com") || is("podcasts.google.com")) { platform = "podcast"; handle = parts.at(-1) || ""; }
  else if (is("kick.com")) platform = "kick";
  else if (bioHosts.some(is)) platform = "link_in_bio";
  if (platform === "link_in_bio" && ["help", "s", "privacy", "blog", "tools", "features", "solutions", "marketplace", "link-in-bio", "login", "signup", "about"].includes(parts[0]?.toLowerCase())) return null;
  if (platform !== "website" && platform !== "substack" && (!parts.length || reserved.has(parts[0].toLowerCase()) || !handle)) return null;
  if (["instagram", "tiktok", "x", "twitch", "threads", "pinterest", "kick", "link_in_bio"].includes(platform)) parts = parts.slice(0, 1);
  const path = parts.length ? `/${parts.join("/")}` : "";
  const query = platform === "facebook" && parts[0] === "profile.php" ? `?id=${encodeURIComponent(handle)}` : "";
  return { platform, handle: handle.replace(/^@/, ""), href: `https://${platform === "x" ? "x.com" : host}${path}${query}` };
}

export function parseCandidates(anchors: Anchor[], source: string, exclude: Set<string> = new Set(), excludeSourceWebsite = true): Candidate[] {
  const seen = new Set<string>();
  return anchors.flatMap(anchor => {
    const parsed = parseSocial(anchor.href, source);
    if (!parsed || anchor.sitewide || exclude.has(parsed.href) || seen.has(parsed.href)) return [];
    if (excludeSourceWebsite && parsed.platform === "website" && new URL(parsed.href).hostname === new URL(source).hostname) return [];
    seen.add(parsed.href);
    return [{ ...anchor, ...parsed }];
  });
}
