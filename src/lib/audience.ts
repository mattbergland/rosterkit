import { metricColumns, type AudiencePlatform, type MetricProposal, type RosterRow } from "./types";

export type AudienceMetrics = Partial<Record<AudiencePlatform | "total_reach", { count: number; source: "site" | "profile" }>>;
export function parseAudienceCount(raw: string): number | null {
  const value = raw.trim().replace(/\u00a0|\u202f/g, " ").replace(/^(?:about|approximately|~)\s*/i, "").replace(/\s*(?:followers?|subscribers?|subs|fans|total reach|reach)\s*$/i, "").replace(/\+$/, "").trim();
  const match = value.match(/^(\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+|\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?$/i);
  if (!match || !match[2] && match[1].includes(".")) return null;
  const multipliers: Record<string, number> = { k: 1000, thousand: 1000, m: 1000000, million: 1000000, b: 1000000000, billion: 1000000000 };
  const count = Number(match[1].replace(/[, ]/g, "")) * (multipliers[match[2]?.toLowerCase()] || 1);
  return Number.isSafeInteger(Math.round(count)) && count >= 0 ? Math.round(count) : null;
}

export function compactAudienceCount(raw: string): string {
  const count = parseAudienceCount(raw);
  return count === null ? raw : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

function normalized(value: string) { return value.replace(/\s+/g, " ").trim().toLowerCase(); }
const platformWords: Record<AudiencePlatform | "total_reach", RegExp> = {
  instagram: /\b(?:instagram|ig|insta)\b/i, tiktok: /\btik\s?tok\b/i, youtube: /\b(?:youtube|yt)\b/i,
  x: /\b(?:twitter|x(?:\.com)?)\b/i, twitch: /\btwitch\b/i, threads: /\bthreads\b/i,
  snapchat: /\bsnapchat\b/i, pinterest: /\bpinterest\b/i, linkedin: /\blinkedin\b/i,
  facebook: /\b(?:facebook|fb)\b/i, substack: /\bsubstack\b/i, kick: /\bkick\b/i,
  total_reach: /\b(?:total\s+(?:reach|audience|followers)|combined\s+(?:reach|audience|following)|social\s+reach|across\s+(?:all\s+)?platforms)\b/i,
};

export function attributeSiteMetrics(proposals: MetricProposal[], evidence: string[], identity: { name: string; primary_handle: string }, singleCreator: boolean): AudienceMetrics {
  const metrics: AudienceMetrics = {};
  const conflicts = new Set<string>();
  for (const proposal of proposals) {
    const count = parseAudienceCount(proposal.raw_count);
    const excerpt = normalized(proposal.evidence);
    if (count === null || !excerpt || !excerpt.includes(normalized(proposal.raw_count)) || !platformWords[proposal.platform]?.test(excerpt)) continue;
    if (!evidence.some(text => normalized(text).includes(excerpt))) continue;
    if (!singleCreator && ![identity.name, identity.primary_handle].some(name => name.trim() && excerpt.includes(normalized(name)))) continue;
    const countAt = excerpt.indexOf(normalized(proposal.raw_count));
    if (/^\s*(?:likes?|views?|posts?|following)\b/i.test(excerpt.slice(countAt + proposal.raw_count.length))) continue;
    const before = excerpt.slice(Math.max(0,countAt-80),countAt);
    const after = excerpt.slice(countAt+normalized(proposal.raw_count).length,countAt+normalized(proposal.raw_count).length+50);
    const attributed = Object.entries(platformWords).filter(([,pattern])=>{
      const preceding=[...before.matchAll(new RegExp(pattern.source,"gi"))].at(-1);
      return preceding&&!/[\d;,|]/.test(before.slice(preceding.index!+preceding[0].length));
    }).map(([platform])=>platform);
    if (!attributed.length) for(const [platform,pattern] of Object.entries(platformWords)) { const match=pattern.exec(after);if(match&&match.index<20&&!/[\d;,|]/.test(after.slice(0,match.index)))attributed.push(platform); }
    if (attributed.length!==1||attributed[0]!==proposal.platform||conflicts.has(proposal.platform))continue;
    const existing = metrics[proposal.platform];
    if (!existing) metrics[proposal.platform] = { count, source: "site" };
    else if (existing.count !== count) { delete metrics[proposal.platform]; conflicts.add(proposal.platform); }
  }
  return metrics;
}

export function applyAudienceMetrics(row: RosterRow, metrics: AudienceMetrics, asOf = new Date().toISOString().slice(0, 10)): void {
  const sources: string[] = [];
  let total = 0; let found = false;
  for (const [platform, column] of Object.entries(metricColumns)) {
    const metric = metrics[platform as AudiencePlatform];
    row[column] = metric ? String(metric.count) : "";
    if (metric) { total += metric.count; found = true; sources.push(`${platform}:${metric.source}`); }
  }
  row.youtube_followers=row.youtube_subscribers;
  row.total_reach = found ? String(total) : metrics.total_reach ? String(metrics.total_reach.count) : "";
  if (!found && metrics.total_reach) sources.push(`total_reach:${metrics.total_reach.source}`);
  row.metrics_source = sources.join(" | ");
  row.metrics_as_of = sources.length ? asOf : "";
}
