import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { load } from "cheerio";
import sharp from "sharp";
import { publicFetch, publicUrl } from "./network";
import type { Anchor } from "./types";

export type Capture = { url: string; html: string; text: string; anchors: Anchor[]; images: {src:string;alt:string}[]; screenshots: string[]; warning?: string };
export function parseHtml(html:string, url:string): Capture {
  const $ = load(html);
  $("script,style,noscript,svg").remove();
  const anchors: Anchor[] = [];
  $("a[href]").each((_,el)=>{ const a=$(el); try { anchors.push({href:new URL(a.attr("href")!,url).href,text:a.text().trim().slice(0,160),context:a.parent().text().replace(/\s+/g," ").trim().slice(0,500),sitewide:!!a.closest("footer,header,nav,[role=navigation],[role=contentinfo]").length}); } catch {} });
  const images: Capture["images"] = [];
  $("img").each((_,el)=>{const a=$(el);const src=a.attr("src")||a.attr("data-src");if(src) try{images.push({src:new URL(src,url).href,alt:a.attr("alt")||""});}catch{}});
  return {url,html,text:$("body").text().replace(/\s+/g," ").trim().slice(0,100000),anchors:dedupe(anchors),images:images.slice(0,200),screenshots:[]};
}
function dedupe(anchors:Anchor[]) {const seen=new Set<string>(); return anchors.filter(a=>{const k=a.href+"|"+a.sitewide+"|"+a.text;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,1500);}
let project: string | undefined;
async function projectId(bb:Browserbase) {
  if (process.env.BROWSERBASE_PROJECT_ID) return process.env.BROWSERBASE_PROJECT_ID;
  if (!project) {const projects=await bb.projects.list();project=projects[0]?.id;}
  if (!project) throw new Error("Browserbase requires a project. Set BROWSERBASE_PROJECT_ID.");
  return project;
}
async function browserCapture(url:string):Promise<Capture> {
  await publicUrl(url);
  const bb=new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY});
  const id=await projectId(bb);
  const session=await bb.sessions.create({projectId:id,api_timeout:90});
  let browser;
  try {
    browser=await chromium.connectOverCDP(session.connectUrl);
    const context=browser.contexts()[0];
    const checked=new Map<string,boolean>();
    await context.route("**/*",async route=>{
      const target=route.request().url();
      if(!target.startsWith("http"))return route.continue();
      const host=new URL(target).host;
      try {if(!checked.has(host)){await publicUrl(target);checked.set(host,true);} await route.continue();}catch{await route.abort();}
    });
    const page=context.pages()[0]||await context.newPage();
    await page.setViewportSize({width:1280,height:900});
    const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:35000});
    if(response && response.status()>=400)throw new Error(`Browser returned HTTP ${response.status()}`);
    await page.waitForTimeout(1800);
    for(let i=0;i<8;i++){await page.evaluate(()=>window.scrollBy(0,window.innerHeight));await page.waitForTimeout(250);}
    await page.evaluate(()=>window.scrollTo(0,0));
    const data=await page.evaluate(()=>({text:document.body.innerText,anchors:Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map(a=>({href:a.href,text:(a.innerText||a.getAttribute("aria-label")||"").trim().slice(0,160),context:(a.parentElement?.innerText||"").replace(/\s+/g," ").slice(0,500),sitewide:!!a.closest("header,footer,nav,[role=navigation],[role=contentinfo]")})),images:Array.from(document.images).map(img=>({src:img.currentSrc||img.src,alt:img.alt}))}));
    const html=await page.content();
    const full=await page.screenshot({fullPage:true,type:"jpeg",quality:65,timeout:15000});
    const meta=await sharp(full).metadata();
    const height=meta.height||900;const width=meta.width||1280;
    const offsets=height<=2700?Array.from({length:Math.ceil(height/900)},(_,i)=>i*900):[0,Math.floor((height-900)/2),height-900];
    const screenshots=await Promise.all(offsets.map(async top=>(await sharp(full).extract({left:0,top,width,height:Math.min(900,height-top)}).jpeg({quality:65}).toBuffer()).toString("base64")));
    return {url:page.url(),html,text:data.text.slice(0,100000),anchors:dedupe(data.anchors),images:data.images.slice(0,200),screenshots};
  } finally {await browser?.close().catch(()=>{});await bb.sessions.update(session.id,{projectId:id,status:"REQUEST_RELEASE"}).catch(()=>{});}
}
export async function capture(url:string, browserFirst=false):Promise<Capture> {
  let warning="";
  if(browserFirst) {try{return await browserCapture(url);}catch(e){warning=`Browserbase unavailable: ${e instanceof Error?e.message:"capture failed"}. Using plain fetch; visual triage unavailable.`;}}
  const raw=await publicFetch(url);
  if(!raw.contentType.includes("html"))throw new Error("This URL did not return a web page. Please paste a roster, creator site, or social profile URL.");
  const data=parseHtml(raw.bytes.toString("utf8"),raw.url);
  if(!browserFirst && (data.text.length<250 || data.anchors.length<3)) {try{return await browserCapture(url);}catch(e){data.warning=`Dynamic page could not be rendered: ${e instanceof Error?e.message:"capture failed"}`;}}
  return {...data,warning:warning||data.warning};
}
