import type { ProgressEvent } from "./types";

export const buildStages = [
  "Reading the page",
  "Finding creators",
  "Gathering their channels",
  "Polishing your roster",
  "Checking audience size",
] as const;

export type BuildProgress = { stage: number; foundCount: number | null; sources?: string[]; creatorLimit?: number; incomplete?: boolean; searching?: boolean };
export const initialProgress: BuildProgress = { stage: 0, foundCount: null };

export function updateBuildProgress(previous: BuildProgress, event: ProgressEvent): BuildProgress {
  if (event.type !== "progress") return previous;
  const stageByStep: Record<string, number> = { discover:0, fetch: 0, triage: 0, extract: 1, enrich: 2, verify: 3, audience:4 };
  const stage = stageByStep[event.step || ""];
  const count = event.step === "extract" ? event.message?.match(/^Extracted (\d+) creators?\b/) : null;
  return {
    ...previous,
    stage: Math.max(previous.stage, stage ?? previous.stage),
    foundCount: count ? Number(count[1]) : previous.foundCount,
    ...(event.sources?{sources:event.sources}:{}),
    ...(event.creatorLimit?{creatorLimit:event.creatorLimit}:{}),
    ...(event.incomplete?{incomplete:true}:{}),
    ...(event.step==="discover"?{searching:true}:event.step==="fetch"&&previous.searching?{searching:false}:{}),
  };
}

export function friendlyBuildError(message: string): string {
  if (/already running|already building/i.test(message)) return "Another roster is still being built. Please give it a moment, then try again.";
  if (/valid.*url|public.*url|private.*network|credentials|custom ports/i.test(message)) return "Please use a public page link, such as a creator’s website or an agency roster.";
  if (/no.*creator|no accessible.*content|empty.*roster/i.test(message)) return "We couldn’t find any creators on that page. Try a direct roster or creator profile link.";
  if (/page returned|browser returned|blocked|login wall|not return a web page/i.test(message)) return "We couldn’t read that page. It may be private or unavailable. Please try another public link.";
  if (/connection|network|fetch failed|timeout|timed out|aborted/i.test(message)) return "We lost touch with the page before your roster was ready. Please try again in a moment.";
  return "We couldn’t finish your roster this time. Please try again, or choose another public page.";
}
