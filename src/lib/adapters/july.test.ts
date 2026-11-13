import { beforeEach, expect, it, vi } from "vitest";
import fixture from "./july.fixture.json";
import { julyAdapter, plausibleEngagement } from "./july";
import { embeddedRosterLinks, discoverRoster } from "./index";
import { structuredRows } from "./pipeline";
import { publicFetch } from "../network";
import { jev } from "../jev";
vi.mock("../network",()=>({publicFetch:vi.fn()}));
vi.mock("../jev",()=>({jev:vi.fn()}));
const html=(data:unknown)=>`<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
beforeEach(()=>{vi.resetAllMocks();vi.mocked(publicFetch).mockRejectedValue(new Error("not available"));vi.mocked(jev).mockResolvedValue({niche_0:{type:"choice",choice:"gaming",confidence:.95}});});
it("reads the saved, sanitized July fixture with exact audience attribution",()=>{
  const roster=julyAdapter.parse({url:"https://july.bio/evolved",html:html(fixture)})!;
  expect(roster.creators).toHaveLength(2);const first=roster.creators[0];
  expect(first.audience.youtube).toEqual({count:2410000,source:"site"});expect(first.audience.x?.count).toBe(294000);expect(first.creator.urls).toContain("https://x.com/MrRoflWaffles");expect(first.creator.categories).toBe("Call of Duty, Variety Gaming");expect(first.creator.categories).not.toContain("Beauty");expect(first.creator.avatar_url).not.toContain("?");
  expect(first.engagement.twitch).toBeUndefined();expect(first.engagement.instagram).toBe(6.9066);expect(first.engagement.youtube).toBe(0);expect(first.reviewReasons).toContain("Unusable twitch engagement rate");
});
it.each([[0,0],[.058,.058],[100,100],[5010,null],[-1,null],[null,null],["",null],["n/a",null]])("accepts only plausible engagement percentages %s",(input,expected)=>expect(plausibleEngagement(input)).toBe(expected));
it("does not parse unrelated, malformed, empty or locked pages as rosters",()=>{
  expect(julyAdapter.parse({url:"https://example.com/",html:html(fixture)})).toBeNull();expect(julyAdapter.parse({url:"https://july.bio/evolved",html:"<script id=__NEXT_DATA__>bad</script>"})).toBeNull();expect(julyAdapter.parse({url:"https://july.bio/evolved",html:html({})})).toBeNull();
  expect(julyAdapter.parse({url:"https://july.bio/jane",html:html({props:{pageProps:{data:{mediaKit:{json:{isLocked:true,data:{username:"jane"}}}}}}})})).toBeNull();
});
it("reads a public individual media kit without mistaking views for followers",()=>{
  const data={props:{pageProps:{data:{mediaKit:{json:{isLocked:false,data:{name:"Jane",username:"jane",about:"A creator",tags:"Gaming,Technology",blocks:[{type:"youtube",enabled:true,fields:{accountUrl:"https://youtube.com/@jane",stats:[{name:"subscribers",value:1234},{name:"views",value:90000000}]}},{type:"tiktok",enabled:false,fields:{stats:[{name:"followers",value:999}]}}]}}}}}}};
  const creator=julyAdapter.parse({url:"https://july.bio/jane",html:html(data)})!.creators[0];expect(creator.creator.bio).toBe("A creator");expect(creator.audience.youtube?.count).toBe(1234);expect(creator.audience.tiktok).toBeUndefined();
});
it("follows the Evolved-style iframe, including an iframe at another host",async()=>{
  vi.mocked(publicFetch).mockResolvedValueOnce({url:"https://evolvedtalent.com/roster",bytes:Buffer.from('<iframe src="https://july.bio/evolved" name="rosterEmbed"></iframe>'),contentType:"text/html"}).mockResolvedValueOnce({url:"https://july.bio/evolved",bytes:Buffer.from(html(fixture)),contentType:"text/html"});
  expect((await discoverRoster("https://evolvedtalent.com/roster")).roster?.creators).toHaveLength(2);
  expect(embeddedRosterLinks('<iframe src="/talent"></iframe><a href="https://july.bio/evolved">Roster</a><iframe src="https://youtube.com/embed/abc"></iframe>',"https://agency.com")).toEqual(["https://agency.com/talent","https://july.bio/evolved"]);
});
it("keeps all 92 structured creators, while bounding detail and judgment requests",async()=>{
  const parsed=julyAdapter.parse({url:"https://july.bio/evolved",html:html(fixture)})!;
  parsed.creators=Array.from({length:92},(_,index)=>({...parsed.creators[index%2],creator:{...parsed.creators[index%2].creator,name:`Creator ${index}`,primary_handle:`creator${index}`,source_profile_url:`https://july.bio/creator${index}`}}));
  const rows=await structuredRows(parsed,"https://evolvedtalent.com/roster",()=>{});expect(rows).toHaveLength(92);expect(publicFetch).toHaveBeenCalledTimes(8);expect(jev).toHaveBeenCalledTimes(1);expect(rows[0].youtube_subscribers).toBe("2410000");expect(rows[0].twitch_engagement_rate).toBe("");expect(rows[0].instagram_engagement_rate).toBe("6.9066");expect(rows[0].metrics_source).toContain("youtube:site");expect(rows[0].source_url).toBe("https://evolvedtalent.com/roster");
});
