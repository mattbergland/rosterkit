import { beforeEach,expect,it,vi } from "vitest";
import { capture } from "./capture";
import { extract } from "./extract";
import { jev } from "./jev";
import { runPipeline } from "./pipeline";
import { discoverAgencyRosters } from "./roster-discovery";
import { friendlyBuildError } from "./build-presentation";
import type { ProgressEvent } from "./types";
vi.mock("./capture",()=>({capture:vi.fn()}));
vi.mock("./extract",()=>({extract:vi.fn()}));
vi.mock("./jev",()=>({jev:vi.fn(),avatarImage:vi.fn()}));
vi.mock("./adapters",()=>({discoverRoster:vi.fn(async()=>({})),parseStructuredRoster:vi.fn(()=>null)}));
vi.mock("./roster-discovery",()=>({discoverAgencyRosters:vi.fn(async()=>[])}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(capture).mockResolvedValue({url:"https://agency.com/",html:"",text:"Jane Lifestyle",anchors:[],images:[],screenshots:[]});vi.mocked(jev).mockResolvedValueOnce({page:{type:"choice",choice:"roster",confidence:0.9},present:{type:"noul",noul:0.99}});});
it("does not export a roster homepage as every creator’s detail page and preserves review evidence",async()=>{
  vi.mocked(extract).mockResolvedValue([{name:"Jane",primary_handle:"",bio:"",categories:"Lifestyle",location:"",email:"",management_contact:"",source_profile_url:"https://agency.com/",avatar_url:"",urls:[]}]);
  vi.mocked(jev).mockResolvedValueOnce({niche:{type:"choice",choice:"lifestyle",confidence:0.6,probabilities:{lifestyle:0.6,other:0.4}},safety:{type:"score",score:2,confidence:0.9}});
  const events:ProgressEvent[]=[];await runPipeline("https://agency.com/",e=>events.push(e));
  const row=events.find(e=>e.type==="result")?.rows?.[0];expect(row?.source_profile_url).toBe("");expect(row?.source_url).toBe("https://agency.com/");expect(row?.needs_review).toBe("true");expect(row?.review_reasons).toContain("Low-confidence niche");expect(row?.probabilities?.niche.lifestyle).toBe(0.6);
});
it("reports an empty extracted roster",async()=>{vi.mocked(extract).mockResolvedValue([]);await expect(runPipeline("https://agency.com/",()=>{})).rejects.toThrow("No creators could be extracted");});
it("propagates capture failure for the route to stream gracefully",async()=>{vi.mocked(capture).mockRejectedValue(new Error("HTTP 403"));await expect(runPipeline("https://agency.com/",()=>{})).rejects.toThrow("HTTP 403");});
const jane={name:"Jane",primary_handle:"",bio:"",categories:"Lifestyle",location:"",email:"",management_contact:"",source_profile_url:"https://agency.com/",avatar_url:"",urls:[]};
const verification={niche:{type:"choice",choice:"lifestyle",confidence:0.9},safety:{type:"score",score:2,confidence:0.9}} as const;
it.each([
  {choice:"unrelated",noul:0.99},
  {choice:"roster",noul:0.01},
])("extracts and discovers despite negative triage $choice / $noul, retaining it as a review flag",async({choice,noul})=>{
  vi.mocked(jev).mockReset().mockResolvedValueOnce({page:{type:"choice",choice,confidence:0.99},present:{type:"noul",noul}}).mockResolvedValue(verification);
  vi.mocked(extract).mockResolvedValue([jane]);
  const events:ProgressEvent[]=[];await runPipeline("https://agency.com/landing",event=>events.push(event));
  expect(extract).toHaveBeenCalledWith(expect.anything(),"unknown",60);expect(discoverAgencyRosters).toHaveBeenCalledOnce();
  const row=events.find(event=>event.type==="result")?.rows?.[0];expect(row?.name).toBe("Jane");expect(row?.needs_review).toBe("true");expect(row?.review_reasons).toContain("Page classification did not identify creators");
});
it("uses a discovered roster when negative-triage source extraction is empty",async()=>{
  vi.mocked(jev).mockReset().mockResolvedValueOnce({page:{type:"choice",choice:"unrelated",confidence:0.99},present:{type:"noul",noul:0.01}}).mockResolvedValueOnce({page:{type:"choice",choice:"roster",confidence:0.9},present:{type:"noul",noul:0.99}}).mockResolvedValue(verification);
  vi.mocked(discoverAgencyRosters).mockResolvedValueOnce([{url:"https://agency.com/talent",page:{url:"https://agency.com/talent",html:"",text:"Jane Lifestyle",anchors:[],images:[],screenshots:[]}}]);
  vi.mocked(extract).mockResolvedValueOnce([]).mockResolvedValueOnce([jane]);
  const events:ProgressEvent[]=[];await runPipeline("https://agency.com/landing",event=>events.push(event));
  expect(capture).toHaveBeenCalledWith("https://agency.com/talent",true);expect(extract).toHaveBeenCalledTimes(2);expect(events.find(event=>event.type==="result")?.rows).toHaveLength(1);expect(events.some(event=>event.type==="error")).toBe(false);
});
it.each([false,true])("shows the friendly no-creators error only after all extraction and discovery are empty (alternative: %s)",async alternative=>{
  vi.mocked(jev).mockReset().mockResolvedValue({page:{type:"choice",choice:"unrelated",confidence:0.99},present:{type:"noul",noul:0.01}});vi.mocked(extract).mockResolvedValue([]);
  if(alternative)vi.mocked(discoverAgencyRosters).mockResolvedValueOnce([{url:"https://agency.com/talent",page:{url:"https://agency.com/talent",html:"",text:"",anchors:[],images:[],screenshots:[]}}]);
  let failure="";try{await runPipeline("https://agency.com/landing",()=>{});}catch(error){failure=(error as Error).message;}
  expect(extract).toHaveBeenCalledTimes(alternative?2:1);expect(discoverAgencyRosters).toHaveBeenCalledOnce();expect(friendlyBuildError(failure)).toBe("We couldn’t find any creators on that page. Try a direct roster or creator profile link.");
});
it("does not retain invented creators after negative triage",async()=>{
  vi.mocked(jev).mockReset().mockResolvedValue({page:{type:"choice",choice:"unrelated",confidence:0.99},present:{type:"noul",noul:0.01}});vi.mocked(extract).mockResolvedValue([{...jane,name:"Not in the evidence"}]);await expect(runPipeline("https://agency.com/landing",()=>{})).rejects.toThrow("No creators could be extracted");expect(discoverAgencyRosters).toHaveBeenCalledOnce();
});
