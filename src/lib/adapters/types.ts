import type { AudienceMetrics } from "../audience";
import type { Capture } from "../capture";
import type { AudiencePlatform, ExtractedCreator, RosterRow } from "../types";

export type StructuredCreator = {
  creator: ExtractedCreator;
  audience: AudienceMetrics;
  engagement: Partial<Record<AudiencePlatform, number>>;
  reviewReasons: string[];
  extra?: Partial<RosterRow>;
};
export type StructuredRoster = { adapter: string; url: string; creators: StructuredCreator[] };
export type RosterAdapter = { name: string; parse: (page: Pick<Capture, "html" | "url"> & {text?:string}) => StructuredRoster | null };
