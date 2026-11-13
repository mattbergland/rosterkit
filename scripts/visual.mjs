import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base=process.argv[2]||"http://localhost:3000";
const prefix=process.argv[3]||"rosterkit-progress";
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||`${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
await fs.mkdir(`${process.env.HOME}/screens`,{recursive:true});
await page.goto(base);
await page.getByLabel("Source URL").fill("https://www.outloudtalent.com");
await page.getByRole("button",{name:"Build roster",exact:true}).click();
await expect(page.getByRole("button",{name:"Building…",exact:true})).toBeDisabled();
await expect(page.locator(".skeleton-table tbody tr")).toHaveCount(6);
await page.waitForFunction(()=>document.querySelectorAll('.friendly-stages .done').length>0||document.querySelector('.error-panel[role=alert]'),undefined,{timeout:300000});
if(await page.locator('.error-panel[role=alert]').count())throw new Error(await page.locator('.error-panel[role=alert]').innerText());
await expect(page.locator(".friendly-stages li.active")).toHaveCount(1);
await expect(page.locator(".build-track.is-running")).toBeVisible();
await expect(page.locator(".results-panel")).toHaveAttribute("aria-busy","true");
async function assertPlainCopy(){
  const copy=await page.locator("main").innerText();
  if(/Jev|OpenAI|Browserbase|screenshot tiles|visual_assessment|visual triage|enriching \d|verify accounts|\d+% confidence/i.test(copy))throw new Error("Technical details leaked into the UI");
}
async function capture(state){
  for(const [size,width,height] of [["desktop",1280,900],["mobile",390,844]]){
    await page.setViewportSize({width,height});
    await page.locator(state==="loading"?".source-card":".activity-panel").evaluate((el,loading)=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top+(loading?el.offsetHeight-120:-16)),state==="loading");
    await assertPlainCopy();
    if(state==="loading")await expect(page.locator(".skeleton-table")).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    if(overflow)throw new Error(`${size} ${state}: horizontal page overflow`);
    const path=`${process.env.HOME}/screens/${prefix}-${state}-${size}-${width}x${height}.png`;
    await page.screenshot({path});
    console.log(`SCREENSHOT: ${path}`);
  }
}
await capture("loading");
await page.emulateMedia({reducedMotion:"reduce"});
const reduced=await page.locator(".skeleton").first().evaluate(el=>({animation:getComputedStyle(el,":after").animationName,transition:getComputedStyle(document.querySelector(".build-fill")).transitionDuration,spinner:getComputedStyle(document.querySelector(".active .spin")).animationName}));
if(reduced.animation!=="none"||reduced.spinner!=="none"||reduced.transition!=="0s")throw new Error(`Reduced motion failed: ${JSON.stringify(reduced)}`);
console.log("LOADING: disabled spinner button; animated active stage; completed checks; progress shimmer; 6 skeleton rows; no technical copy; no page overflow");
console.log("REDUCED MOTION: shimmer, spinner and progress transition disabled");
await page.emulateMedia({reducedMotion:"no-preference"});
await page.waitForFunction(()=>document.querySelector('.error-panel[role=alert]')||!document.querySelector('.export-actions button:last-child')?.disabled,undefined,{timeout:300000});
if(await page.locator('.error-panel[role=alert]').count())throw new Error(await page.locator('.error-panel[role=alert]').innerText());
const rowCount=await page.locator("tbody tr").count();
console.log(`UI BUILD: ${rowCount} rows; page errors: ${errors.length}`);
await expect(page.locator(".skeleton-table")).toHaveCount(0);
await expect(page.locator(".friendly-stages .done")).toHaveCount(4);
await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow","100");
await expect(page.getByText("Your roster is ready.",{exact:true})).toBeVisible();
await page.locator(".build-fill").evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished));});
await capture("complete");
console.log("COMPLETED: four checkmarks; full progress bar; real creator rows; enabled downloads; no technical copy; no page overflow");
const name=page.locator("tbody tr").first().locator("td").nth(1).getByRole("button");
const original=await name.innerText();await name.click();const editor=page.locator(".cell-editor");await editor.fill(original+" (edited)");await editor.press("Enter");
if(!await page.getByRole("button",{name:original+" (edited)",exact:true}).isVisible())throw new Error("Inline edit did not persist");
await page.getByRole("button",{name:original+" (edited)",exact:true}).click();await page.locator(".cell-editor").fill(original);await page.locator(".cell-editor").press("Enter");
console.log("INLINE EDIT: persisted and restored");
for(const name of ["Download CSV","JSON"]){const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name,exact:true}).click()]);await download.saveAs(`${process.env.HOME}/rosterkit-evidence/${download.suggestedFilename()}`);console.log(`DOWNLOAD: ${download.suggestedFilename()}`);}
await page.getByRole("button",{name:"How rosterkit works",exact:true}).click();
await assertPlainCopy();
console.log("HELP: plain copy, no implementation details");
await page.getByRole("button",{name:"Close help",exact:true}).click();
await page.getByRole("button",{name:"New build",exact:true}).click();
await expect(page.locator(".activity-panel")).toHaveCount(0);
await page.getByLabel("Source URL").fill("http://127.0.0.1");
await page.getByRole("button",{name:"Build roster",exact:true}).click();
await expect(page.locator('.error-panel[role=alert]')).toBeVisible();
await assertPlainCopy();
await expect(page.getByRole("button",{name:"Build roster",exact:true})).toBeEnabled();
console.log(`FRIENDLY ERROR: ${await page.locator('.error-panel p').innerText()}`);
for(const event of [{type:"result",rows:[]},{type:"error",message:"Jev / OpenAI / Browserbase HTTP 500"}]){
  await page.route("**/api/build",route=>route.fulfill({contentType:"application/x-ndjson",body:JSON.stringify(event)+"\n"}),{times:1});
  await page.getByRole("button",{name:"Build roster",exact:true}).click();
  await expect(page.locator('.error-panel[role=alert]')).toBeVisible();
  await expect(page.getByRole("button",{name:"Build roster",exact:true})).toBeEnabled();
  await expect(page.locator(".skeleton-table")).toHaveCount(0);
  await expect(page.locator(".is-complete")).toHaveCount(0);
  await assertPlainCopy();
  console.log(`MOCKED ${event.type==="result"?"EMPTY RESULT":"STREAM ERROR"}: ${await page.locator('.error-panel p').innerText()}`);
}
if(errors.length)throw new Error("UI check failed");
await browser.close();
