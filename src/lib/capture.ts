import { load } from "cheerio";
import sharp from "sharp";
import type { BrowserContext } from "playwright-core";
import { publicFetch, publicUrl } from "./network";
import { renderPage } from "./renderers";
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
async function captureContext(context:BrowserContext,url:string):Promise<Capture> {
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
    if(new URL(url).hostname==="app.the-thread.co"&&new URL(url).pathname.startsWith("/media-kit/"))await page.getByText("Total Following",{exact:true}).waitFor({timeout:25000});
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
}
async function browserCapture(url:string):Promise<Capture>{return renderPage(url,context=>captureContext(context,url));}
export async function capture(url:string, browserFirst=false):Promise<Capture> {
  let warning="";
  if(browserFirst) {try{return await browserCapture(url);}catch{warning="Rendered page unavailable; using public page text.";}}
  const raw=await publicFetch(url);
  if(!raw.contentType.includes("html"))throw new Error("This URL did not return a web page. Please paste a roster, creator site, or social profile URL.");
  const data=parseHtml(raw.bytes.toString("utf8"),raw.url);
  if(!browserFirst && (data.text.length<250 || data.anchors.length<3)) {try{return await browserCapture(url);}catch{data.warning="Rendered page unavailable; using public page text.";}}
  console.info("[capture] renderer=plain-fetch");
  return {...data,warning:warning||data.warning};
}
