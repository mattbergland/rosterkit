import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { BrowserContext } from "playwright-core";
import { renderPage } from "./renderers";
const mocks=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),projects:vi.fn(),launch:vi.fn(),connect:vi.fn(),executable:vi.fn(),access:vi.fn(),readdir:vi.fn(),unpack:vi.fn()}));
vi.mock("@browserbasehq/sdk",()=>({default:vi.fn(function(){return {projects:{list:mocks.projects},sessions:{create:mocks.create,update:mocks.update}};})}));
vi.mock("playwright-core",()=>({chromium:{launch:mocks.launch,connectOverCDP:mocks.connect,executablePath:mocks.executable}}));
vi.mock("@sparticuz/chromium",()=>({default:{args:["--serverless"],executablePath:mocks.unpack}}));
vi.mock("node:fs/promises",()=>({access:mocks.access,readdir:mocks.readdir}));
vi.mock("./network",()=>({publicUrl:vi.fn(async value=>new URL(value))}));
let remoteClose:ReturnType<typeof vi.fn>;let localClose:ReturnType<typeof vi.fn>;
const context={} as BrowserContext;
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("BROWSERBASE_API_KEY","test-key");vi.stubEnv("BROWSERBASE_PROJECT_ID","project");vi.stubEnv("VERCEL","");vi.stubEnv("CHROME_PATH","/installed/chrome");
  vi.spyOn(console,"info").mockImplementation(()=>{});vi.spyOn(console,"warn").mockImplementation(()=>{});
  remoteClose=vi.fn(async()=>{});localClose=vi.fn(async()=>{});
  mocks.create.mockResolvedValue({id:"session",connectUrl:"wss://browser.example"});mocks.update.mockResolvedValue({});
  mocks.connect.mockResolvedValue({contexts:()=>[context],close:remoteClose});mocks.launch.mockResolvedValue({newContext:async()=>context,close:localClose});mocks.unpack.mockResolvedValue("/tmp/chromium");mocks.executable.mockReturnValue("/missing/chrome");
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("prefers Browserbase and releases its browser/session without launching Chromium",async()=>{
  const read=vi.fn(async()=>"rendered");expect(await renderPage("https://agency.com",read)).toBe("rendered");expect(read).toHaveBeenCalledWith(context);expect(mocks.launch).not.toHaveBeenCalled();expect(remoteClose).toHaveBeenCalledOnce();expect(mocks.update).toHaveBeenCalledWith("session",{projectId:"project",status:"REQUEST_RELEASE"});
});
it.each([402,429,500,503])("falls back immediately after Browserbase HTTP %s",async status=>{
  mocks.create.mockRejectedValue(Object.assign(new Error("unavailable"),{status}));expect(await renderPage("https://agency.com",async()=>"local")).toBe("local");expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({executablePath:"/installed/chrome",headless:true}));expect(localClose).toHaveBeenCalledOnce();expect(mocks.create).toHaveBeenCalledOnce();
});
it("releases a session after CDP connect failure, then launches the fallback",async()=>{
  mocks.connect.mockRejectedValue(new Error("connection refused"));await renderPage("https://agency.com",async()=>"local");expect(mocks.update).toHaveBeenCalledOnce();expect(localClose).toHaveBeenCalledOnce();
});
it("uses packaged Chromium and its recommended args inside Vercel without relying on local browser files",async()=>{
  vi.stubEnv("BROWSERBASE_API_KEY","");vi.stubEnv("VERCEL","1");await renderPage("https://agency.com",async()=>"local");expect(mocks.create).not.toHaveBeenCalled();expect(mocks.unpack).toHaveBeenCalledOnce();expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({executablePath:"/tmp/chromium",args:["--serverless"]}));
});
it("discovers an already-installed Playwright Chromium locally",async()=>{
  vi.stubEnv("BROWSERBASE_API_KEY","");vi.stubEnv("CHROME_PATH","");mocks.access.mockImplementation(async path=>{if(path==="/missing/chrome")throw new Error("missing");});mocks.readdir.mockResolvedValue(["ffmpeg-1","chromium-1248"]);
  await renderPage("https://agency.com",async()=>"local");expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({executablePath:expect.stringContaining("chromium-1248/chrome-linux64/chrome")}));
});
it("reuses the same extraction callback after a remote capture failure",async()=>{
  const read=vi.fn().mockRejectedValueOnce(new Error("page failed")).mockResolvedValueOnce("local page");expect(await renderPage("https://agency.com",read)).toBe("local page");expect(read).toHaveBeenCalledTimes(2);expect(remoteClose).toHaveBeenCalledOnce();expect(localClose).toHaveBeenCalledOnce();
});
it("serializes self-hosted browsers and releases the queue after capture errors",async()=>{
  vi.stubEnv("BROWSERBASE_API_KEY","");let active=0;let peak=0;
  const read=async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return "page";};
  await Promise.all([renderPage("https://agency.com",read),renderPage("https://agency.com",read)]);expect(peak).toBe(1);
  await expect(renderPage("https://agency.com",async()=>{throw new Error("bad page");})).rejects.toThrow("Rendered page unavailable");expect(await renderPage("https://agency.com",read)).toBe("page");expect(localClose).toHaveBeenCalledTimes(4);
});
it("reports generic renderer exhaustion instead of exposing a share token",async()=>{
  mocks.create.mockRejectedValue(new Error("connect failed"));mocks.launch.mockRejectedValue(new Error("failed https://example.com?token=private"));await expect(renderPage("https://agency.com",async()=>"")).rejects.toThrow("Rendered page unavailable; using public page text.");expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private");
});
