import { beforeEach,expect,it,vi } from "vitest";
import { capture } from "./capture";
import { extract } from "./extract";
import { jev } from "./jev";
import { runPipeline } from "./pipeline";
import type { ProgressEvent } from "./types";
vi.mock("./capture",()=>({capture:vi.fn()}));
vi.mock("./extract",()=>({extract:vi.fn()}));
vi.mock("./jev",()=>({jev:vi.fn(),avatarImage:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(capture).mockResolvedValue({url:"https://agency.com/",html:"",text:"Jane Lifestyle",anchors:[],images:[],screenshots:[]});vi.mocked(jev).mockResolvedValueOnce({page:{type:"choice",choice:"roster",confidence:0.9},present:{type:"noul",noul:0.99}});});
it("does not export a roster homepage as every creator’s detail page and preserves review evidence",async()=>{
  vi.mocked(extract).mockResolvedValue([{name:"Jane",primary_handle:"",bio:"",categories:"Lifestyle",location:"",email:"",management_contact:"",source_profile_url:"https://agency.com/",avatar_url:"",urls:[]}]);
  vi.mocked(jev).mockResolvedValueOnce({niche:{type:"choice",choice:"lifestyle",confidence:0.6,probabilities:{lifestyle:0.6,other:0.4}},safety:{type:"score",score:2,confidence:0.9}});
  const events:ProgressEvent[]=[];await runPipeline("https://agency.com/",e=>events.push(e));
  const row=events.find(e=>e.type==="result")?.rows?.[0];expect(row?.source_profile_url).toBe("");expect(row?.source_url).toBe("https://agency.com/");expect(row?.needs_review).toBe("true");expect(row?.review_reasons).toContain("Low-confidence niche");expect(row?.probabilities?.niche.lifestyle).toBe(0.6);
});
it("reports an empty extracted roster",async()=>{vi.mocked(extract).mockResolvedValue([]);await expect(runPipeline("https://agency.com/",()=>{})).rejects.toThrow("No creators could be extracted");});
it("propagates capture failure for the route to stream gracefully",async()=>{vi.mocked(capture).mockRejectedValue(new Error("HTTP 403"));await expect(runPipeline("https://agency.com/",()=>{})).rejects.toThrow("HTTP 403");});
