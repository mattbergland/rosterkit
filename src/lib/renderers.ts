import Browserbase from "@browserbasehq/sdk";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BrowserContext } from "playwright-core";
import { publicUrl } from "./network";

let project:string|undefined;
let localQueue:Promise<void>=Promise.resolve();
function failure(error:unknown){
  if(error&&typeof error==="object"&&"status" in error)return `HTTP ${error.status}`;
  return error instanceof Error?error.message.split("\n")[0].replace(/https?:\/\/\S+/g,"[page]").slice(0,240):"capture failed";
}
async function installedExecutable(expected:string):Promise<string>{
  if(process.env.CHROME_PATH)return process.env.CHROME_PATH;
  try{await access(expected);return expected;}catch{}
  const cache=process.env.PLAYWRIGHT_BROWSERS_PATH||join(homedir(),".cache","ms-playwright");
  const versions=(await readdir(/*turbopackIgnore: true*/ cache)).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.split("-")[1])-Number(a.split("-")[1]));
  for(const version of versions)for(const suffix of ["chrome-linux64/chrome","chrome-linux/chrome","chrome-mac/Chromium.app/Contents/MacOS/Chromium","chrome-win64/chrome.exe","chrome-win/chrome.exe"]){
    const path=join(/*turbopackIgnore: true*/ cache,version,suffix);try{await access(path);return path;}catch{}
  }
  throw new Error("No installed Playwright Chromium found. Install Chromium or set CHROME_PATH.");
}
async function localRender<T>(read:(context:BrowserContext)=>Promise<T>):Promise<T>{
  const previous=localQueue;let release!:()=>void;localQueue=new Promise(resolve=>{release=resolve;});
  await previous;
  try{
    const {chromium}=await import("playwright-core");
    const serverless=process.env.VERCEL==="1";
    const binary=serverless?(await import("@sparticuz/chromium")).default:undefined;
    const browser=await chromium.launch({executablePath:binary?await binary.executablePath():await installedExecutable(chromium.executablePath()),args:binary?binary.args:["--no-sandbox","--disable-dev-shm-usage"],headless:true,timeout:20000});
    try{return await read(await browser.newContext());}finally{await browser.close().catch(()=>{});}
  }finally{release();}
}
export async function renderPage<T>(url:string,read:(context:BrowserContext)=>Promise<T>):Promise<T>{
  await publicUrl(url);
  if(process.env.BROWSERBASE_API_KEY){
    const bb=new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY,timeout:12000,maxRetries:0});
    try{
      const id=process.env.BROWSERBASE_PROJECT_ID||project||(project=(await bb.projects.list())[0]?.id);
      if(!id)throw new Error("Browserbase project unavailable");
      const session=await bb.sessions.create({projectId:id,api_timeout:90});
      let browser;
      try{
        const {chromium}=await import("playwright-core");
        browser=await chromium.connectOverCDP(session.connectUrl,{timeout:15000});
        const result=await read(browser.contexts()[0]||await browser.newContext());
        console.info("[capture] renderer=browserbase");return result;
      }finally{await browser?.close().catch(()=>{});await bb.sessions.update(session.id,{projectId:id,status:"REQUEST_RELEASE"}).catch(()=>{});}
    }catch(error){console.warn(`[capture] renderer=browserbase unavailable: ${failure(error)}`);}
  }else console.info("[capture] renderer=browserbase not configured");
  try{const result=await localRender(read);console.info("[capture] renderer=self-hosted-chromium");return result;}
  catch(error){console.warn(`[capture] renderer=self-hosted-chromium unavailable: ${failure(error)}`);throw new Error("Rendered page unavailable; using public page text.");}
}
