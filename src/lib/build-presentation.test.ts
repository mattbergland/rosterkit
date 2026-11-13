import { describe, expect, it } from "vitest";
import { buildStages, friendlyBuildError, initialProgress, updateBuildProgress } from "./build-presentation";

describe("friendly build progress", () => {
  it("maps internal steps to a small set of plain stages without exposing messages", () => {
    let progress = initialProgress;
    for (const [step, expected] of [["fetch", 0], ["triage", 0], ["extract", 1], ["enrich", 2], ["verify", 3],["audience",4]] as const) {
      progress = updateBuildProgress(progress, { type: "progress", step, message: "Jev / OpenAI / Browserbase 93%" });
      expect(progress.stage).toBe(expected);
      expect(JSON.stringify(progress)).not.toMatch(/Jev|OpenAI|Browserbase|93%/);
    }
    expect(buildStages).toHaveLength(5);
  });
  it("keeps stages moving forward when parallel workers report earlier steps", () => {
    expect(updateBuildProgress({ stage: 3, foundCount: 12 }, { type: "progress", step: "enrich", message: "Enriching 3/12: Name" })).toEqual({ stage: 3, foundCount: 12 });
  });
  it.each([1, 12, 60])("preserves only a coarse extracted count (%i)", count => {
    expect(updateBuildProgress(initialProgress, { type: "progress", step: "extract", message: `Extracted ${count} creator${count === 1 ? "" : "s"}.` }).foundCount).toBe(count);
  });
  it("handles empty, unknown, image and error events without displaying them", () => {
    for (const event of [{ type: "progress" }, { type: "progress", step: "unknown", message: "12%" }, { type: "screenshot" }, { type: "error", message: "Jev request failed (HTTP 401)." }] as const) {
      expect(updateBuildProgress(initialProgress, event)).toEqual(initialProgress);
    }
  });
  it("preserves friendly limits, discovered pages and incomplete-run notes",()=>{
    const progress=updateBuildProgress(initialProgress,{type:"progress",step:"audience",sources:["https://agency.com/roster"],creatorLimit:60,incomplete:true});
    expect(progress).toMatchObject({stage:4,sources:["https://agency.com/roster"],creatorLimit:60,incomplete:true});
  });
});

describe("friendly build errors", () => {
  it.each(["", "Jev request failed (HTTP 401).", "OpenAI returned no roster.", "Browserbase unavailable", "Unexpected token", "No creators could be extracted", "Page returned HTTP 403", "Use a valid publicly accessible URL", "A build is already running", "fetch failed", "connection ended", "timeout"])("never exposes raw implementation errors: %s", message => {
    const friendly = friendlyBuildError(message);
    expect(friendly.length).toBeGreaterThan(20);
    expect(friendly).not.toMatch(/Jev|OpenAI|Browserbase|HTTP|401|403|Unexpected token|timeout/i);
  });
  it("gives actionable advice for unavailable content", () => {
    expect(friendlyBuildError("Page returned HTTP 403")).toContain("another public link");
    expect(friendlyBuildError("No creators could be extracted")).toContain("direct roster");
  });
});
