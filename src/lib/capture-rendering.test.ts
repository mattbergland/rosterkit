import { beforeEach, afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { BrowserContext } from "playwright-core";
import { capture } from "./capture";
import { renderPage } from "./renderers";
import { publicFetch, publicUrl } from "./network";
vi.mock("./renderers",()=>({renderPage:vi.fn()}));
vi.mock("./network",()=>({publicFetch:vi.fn(),publicUrl:vi.fn(async value=>new URL(value))}));
beforeEach(()=>{vi.resetAllMocks();vi.spyOn(console,"info").mockImplementation(()=>{});});
afterEach(()=>vi.restoreAllMocks());
it("captures rendered HTML, visible text, contextual anchors, images and screenshot tiles through the shared renderer callback",async()=>{
  const full=await sharp({create:{width:1280,height:1800,channels:3,background:"white"}}).jpeg().toBuffer();
  const page={setViewportSize:vi.fn(),goto:vi.fn(async()=>({status:()=>200})),waitForTimeout:vi.fn(),evaluate:vi.fn(async fn=>String(fn).includes("document.body.innerText")?{text:"Jane\nInstagram 450K",anchors:[{href:"https://instagram.com/jane",text:"Jane",context:"Jane Instagram 450K",sitewide:false}],images:[{src:"https://agency.com/jane.jpg",alt:"Jane"}]}:undefined),content:vi.fn(async()=>"<body>rendered</body>"),screenshot:vi.fn(async()=>full),url:()=>"https://agency.com/roster",getByText:vi.fn(()=>({waitFor:vi.fn()}))};
  const context={route:vi.fn(),pages:()=>[page]};vi.mocked(renderPage).mockImplementation(async(_,read)=>read(context as unknown as BrowserContext));
  const result=await capture("https://agency.com/roster",true);expect(result).toMatchObject({html:"<body>rendered</body>",text:"Jane\nInstagram 450K",anchors:[{context:"Jane Instagram 450K"}],images:[{alt:"Jane"}]});expect(result.screenshots).toHaveLength(2);expect((await sharp(Buffer.from(result.screenshots[0],"base64")).metadata()).height).toBe(900);expect(publicFetch).not.toHaveBeenCalled();
  const handler=context.route.mock.calls[0][1];const route={request:()=>({url:()=>"http://127.0.0.1/private"}),abort:vi.fn(),continue:vi.fn()};vi.mocked(publicUrl).mockRejectedValueOnce(new Error("private address"));await handler(route);expect(route.abort).toHaveBeenCalledOnce();
});
it("preserves Thread share tokens and waits for the asynchronously rendered audience labels",async()=>{
  const waitFor=vi.fn();const page={setViewportSize:vi.fn(),goto:vi.fn(async()=>({status:()=>200})),getByText:vi.fn(()=>({waitFor})),waitForTimeout:vi.fn(async()=>{throw new Error("stop after readiness check");})};const context={route:vi.fn(),pages:()=>[page]};vi.mocked(renderPage).mockImplementation(async(_,read)=>read(context as unknown as BrowserContext));vi.mocked(publicFetch).mockResolvedValue({bytes:Buffer.from("<body>shell</body>"),url:"https://app.the-thread.co/media-kit/talent/1?token=test-token",contentType:"text/html"});
  const url="https://app.the-thread.co/media-kit/talent/1?token=test-token";await capture(url,true);expect(page.goto).toHaveBeenCalledWith(url,expect.anything());expect(page.getByText).toHaveBeenCalledWith("Total Following",{exact:true});expect(waitFor).toHaveBeenCalledWith({timeout:25000});
});
it("falls back to public HTML only after both renderers fail, with no renderer details in returned warnings",async()=>{
  vi.mocked(renderPage).mockRejectedValue(new Error("Browserbase and Chromium unavailable"));vi.mocked(publicFetch).mockResolvedValue({bytes:Buffer.from("<body>Public text</body>"),url:"https://agency.com",contentType:"text/html"});const result=await capture("https://agency.com",true);expect(result.text).toBe("Public text");expect(result.screenshots).toEqual([]);expect(result.warning).toBe("Rendered page unavailable; using public page text.");
});
it("propagates public fetch errors and rejects non-HTML after renderer exhaustion",async()=>{
  vi.mocked(renderPage).mockRejectedValue(new Error("no renderer"));vi.mocked(publicFetch).mockRejectedValueOnce(new Error("HTTP 403"));await expect(capture("https://agency.com",true)).rejects.toThrow("HTTP 403");vi.mocked(publicFetch).mockResolvedValue({bytes:Buffer.from("image"),url:"https://agency.com",contentType:"image/png"});await expect(capture("https://agency.com",true)).rejects.toThrow("did not return a web page");
});
