import { describe, expect, it } from "vitest";
import { applyAudienceMetrics, attributeSiteMetrics, compactAudienceCount, parseAudienceCount } from "./audience";
import type { MetricProposal, RosterRow } from "./types";

describe("audience count parsing",()=>{
  it.each([["1.2M",1200000],["450K",450000],["350K subs",350000],["1,234",1234],["1 234",1234],["1.2 million followers",1200000],["900K+",900000],["0",0],["2.5B",2500000000],["~ 2K followers",2000]])("parses %s in code",(raw,count)=>expect(parseAudienceCount(String(raw))).toBe(count));
  it.each(["","unknown","-1","1.2","1,2M","1-2M","10%","12 views","450 following","Infinity","1e6","9,99","10000000000000000"])("rejects ambiguous/non-audience counts %s",raw=>expect(parseAudienceCount(raw)).toBeNull());
  it("formats counts without discarding the exported precision",()=>{expect(compactAudienceCount("1234567")).toBe("1.2M");expect(compactAudienceCount("0")).toBe("0");expect(compactAudienceCount("")).toBe("");});
});
describe("site attribution",()=>{
  const identity={name:"Jane Doe",primary_handle:"jane"};
  const excerpt="Jane Doe Instagram 450K TikTok 1.2M Total reach 1.65M";
  const proposal=(platform:MetricProposal["platform"],raw_count:string,evidence=excerpt):MetricProposal=>({platform,raw_count,evidence});
  it("attaches an observed count only to the proposed, locally labelled platform and creator",()=>{
    expect(attributeSiteMetrics([proposal("instagram","450K"),proposal("tiktok","1.2M")],[excerpt],identity,false)).toEqual({instagram:{count:450000,source:"site"},tiktok:{count:1200000,source:"site"}});
  });
  it("rejects wrong creators, invented evidence, wrong platforms and view counts",()=>{
    expect(attributeSiteMetrics([proposal("instagram","450K")],[excerpt],{name:"Alex",primary_handle:"alex"},false)).toEqual({});
    expect(attributeSiteMetrics([proposal("instagram","999K")],[excerpt],identity,false)).toEqual({});
    expect(attributeSiteMetrics([proposal("tiktok","450K")],[excerpt],identity,false)).toEqual({});
    expect(attributeSiteMetrics([proposal("instagram","450K","Jane Doe Instagram 450K views")],["Jane Doe Instagram 450K views"],identity,false)).toEqual({});
  });
  it("allows single-creator headings and counts before platform names",()=>{
    const evidence="1.2m Instagram followers";
    expect(attributeSiteMetrics([proposal("instagram","1.2m",evidence)],[evidence],identity,true).instagram?.count).toBe(1200000);
    expect(attributeSiteMetrics([proposal("instagram","1.2m",evidence)],[evidence],identity,false)).toEqual({});
  });
  it("leaves conflicting counts blank, even if a third proposal repeats the first",()=>{
    const evidence="Jane Doe Instagram 450K; Jane Doe Instagram 400K";
    expect(attributeSiteMetrics([proposal("instagram","450K",evidence),proposal("instagram","400K",evidence),proposal("instagram","450K",evidence)],[evidence],identity,false)).toEqual({});
  });
  it("does not invent missing platforms and accepts empty input",()=>expect(attributeSiteMetrics([],[],identity,true)).toEqual({}));
  it("sums found channels, not a stated total on top, preserving sources and zero",()=>{
    const row={} as RosterRow;applyAudienceMetrics(row,{instagram:{count:450000,source:"site"},youtube:{count:100000,source:"profile"},x:{count:0,source:"site"},total_reach:{count:900000,source:"site"}},"2026-11-13");
    expect(row.total_reach).toBe("550000");expect(row.youtube_subscribers).toBe("100000");expect(row.x_followers).toBe("0");expect(row.tiktok_followers).toBe("");expect(row.metrics_source).toBe("instagram:site | youtube:profile | x:site");expect(row.metrics_as_of).toBe("2026-11-13");
  });
  it("retains only a stated total when there are no channel counts; leaves all unknown values blank",()=>{
    const row={} as RosterRow;applyAudienceMetrics(row,{total_reach:{count:1000000,source:"site"}});expect(row.total_reach).toBe("1000000");expect(row.metrics_source).toBe("total_reach:site");
    applyAudienceMetrics(row,{});expect(row.total_reach).toBe("");expect(row.metrics_source).toBe("");expect(row.metrics_as_of).toBe("");
  });
});
