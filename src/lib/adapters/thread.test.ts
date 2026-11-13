import { readFileSync } from "node:fs";
import { expect,it } from "vitest";
import { isThreadKit,threadAdapter } from "./thread";
import { embeddedRosterLinks } from "./index";
const text=readFileSync(new URL("./thread.fixture.txt",import.meta.url),"utf8");
const url="https://app.the-thread.co/media-kit/talent/11211?token=test-share-token";
it("parses the saved rendered kit labels, never using top-post views as audience",()=>{
  const roster=threadAdapter.parse({url,html:"",text})!;const item=roster.creators[0];
  expect(item.creator.name).toBe("Olivia Pentell");expect(item.creator.primary_handle).toBe("the.olivia.sage");expect(item.creator.categories).toBe("Fashion, Fragrance");expect(item.creator.source_profile_url).toBe(url);expect(item.audience.tiktok).toEqual({count:51200,source:"site"});expect(item.engagement.tiktok).toBe(7.09);expect(item.extra).toMatchObject({tiktok_avg_views:"2080",tiktok_avg_likes:"126",tiktok_avg_comments:"9",tiktok_avg_shares:"4",manager_name:"Brooke Gannon",manager_email:"brooke.gannon@shinetalentgroup.com",metrics_as_of:"2026-11-12",tiktok_audience_gender:"F 96% / M 4%",tiktok_audience_age_top:"18-24 52.1% / 25-34 35.8% / 13-17 5.5%",tiktok_audience_top_countries:"US 58.2% / CA 5.6% / GB 3.2%"});
});
it("can parse labeled DOM and keeps the complete share URL intact",()=>{
  const html=`<body>${text.split("\n").map(line=>`<div>${line}</div>`).join("")}</body>`;
  expect(threadAdapter.parse({url,html})?.creators[0].audience.tiktok?.count).toBe(51200);
  expect(embeddedRosterLinks(`<a href="${url}">Media kit</a>`,"https://agency.com")).toEqual([url]);
});
it("does not fabricate data from a shell, missing metrics or an unrelated domain",()=>{
  expect(threadAdapter.parse({url,html:"<body>Loading...</body>"})).toBeNull();expect(threadAdapter.parse({url:"https://evil.example/media-kit/",html:"",text})).toBeNull();
  const item=threadAdapter.parse({url,html:"",text:text.replace("51.20K\nFollowers","Unknown\nFollowers").replace("7.09%","5010%")})!.creators[0];expect(item.audience.tiktok).toBeUndefined();expect(item.engagement.tiktok).toBeUndefined();
  expect(isThreadKit("https://app.the-thread.co.evil.test/media-kit/talent/1")).toBe(false);
});
