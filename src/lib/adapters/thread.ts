import { load } from "cheerio";
import { parseAudienceCount } from "../audience";
import { metricColumns, type AudiencePlatform, type RichMetricColumn, type RosterRow } from "../types";
import { plausibleEngagement } from "./july";
import type { RosterAdapter, StructuredCreator } from "./types";

export function isThreadKit(value: string): boolean {
  try { const url=new URL(value);return url.hostname==="app.the-thread.co"&&url.pathname.startsWith("/media-kit/"); } catch { return false; }
}
function labeledText(html:string):string{
  const $=load(html);$("script,style,noscript").remove();
  $("br").replaceWith("\n");$("h1,h2,h3,h4,p,div,section,li,span").each((_,node)=>{$(node).append("\n");});
  return $("body").text();
}
function distribution(lines:string[],startLabel:RegExp,endLabel:RegExp):{label:string;value:number}[]{
  const start=lines.findIndex(line=>startLabel.test(line));if(start<0)return [];
  let end=lines.findIndex((line,index)=>index>start&&endLabel.test(line));if(end<0)end=lines.length;
  const entries:{label:string;value:number}[]=[];
  for(let index=start+1;index<end-1;index++){
    const match=lines[index+1].match(/^(\d+(?:\.\d+)?)%$/);if(!match)continue;
    const value=plausibleEngagement(match[1]);if(value!==null)entries.push({label:lines[index],value});
  }
  return entries.sort((a,b)=>b.value-a.value);
}
export const threadAdapter:RosterAdapter={
  name:"the-thread",
  parse(page){
    if(!isThreadKit(page.url))return null;
    const lines=(page.text||labeledText(page.html)).split(/\n+/).map(line=>line.trim()).filter(Boolean);
    const totalAt=lines.findIndex(line=>/^Total Following$/i.test(line));
    const aboutAt=lines.findIndex(line=>/^About$/i.test(line));
    const handleAt=lines.findIndex(line=>/^@[\w.]+$/.test(line));
    if(totalAt<0||handleAt<0||handleAt>totalAt)return null;
    const managerAt=lines.findIndex(line=>/^Talent Manager$/i.test(line));
    const name=lines[handleAt-1]||"";const handle=lines[handleAt].slice(1);
    const platformAt=lines.map((line,index)=>({line,index})).filter(({line})=>/^(?:Instagram|TikTok|YouTube|Twitter|X|Twitch|Threads|Facebook|Snapchat|Pinterest|LinkedIn|Substack|Kick) Stats$/i.test(line));
    const firstStats=platformAt[0]?.index??lines.length;
    const extra:Partial<RosterRow>={};const reasons:string[]=[];
    if(managerAt>=0){extra.manager_name=lines[managerAt+1]||"";extra.manager_email=lines.slice(managerAt+1,firstStats).find(line=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line))||"";}
    const item:StructuredCreator={creator:{name,primary_handle:handle,bio:aboutAt>=0?lines.slice(aboutAt+1,managerAt>aboutAt?managerAt:firstStats).join("\n"):"",categories:lines.slice(handleAt+1,totalAt).join(", "),location:"",email:"",management_contact:[extra.manager_name,extra.manager_email].filter(Boolean).join(" · "),source_profile_url:page.url,avatar_url:"",urls:[]},audience:{},engagement:{},reviewReasons:reasons,extra};
    const total=parseAudienceCount(lines[totalAt+1]||"");if(total!==null)item.audience.total_reach={count:total,source:"site"};
    const $=load(page.html);$("a[href]").each((_,node)=>{const href=$(node).attr("href")||"";if(/^https?:/i.test(href))item.creator.urls.push(href);});
    const dates:string[]=[];
    for(let index=0;index<platformAt.length;index++){
      const block=lines.slice(platformAt[index].index+1,platformAt[index+1]?.index??lines.length);
      const label=platformAt[index].line.replace(/ Stats$/i,"").toLowerCase();const platform=(label==="twitter"?"x":label) as AudiencePlatform;
      if(!(platform in metricColumns))continue;
      const dateLine=block.find(line=>/^Last updated on /i.test(line));
      const date=dateLine?.match(/Last updated on (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
      if(date){const month=Number(date[1]);const day=Number(date[2]);if(month>=1&&month<=12&&day>=1&&day<=31)dates.push(`${date[3]}-${date[1].padStart(2,"0")}-${date[2].padStart(2,"0")}`);}
      const read=(label:RegExp)=>{const at=block.findIndex(line=>label.test(line));if(at<0)return null;return parseAudienceCount(block[at-1]||"");};
      const followers=read(/^Followers$/i);if(followers!==null)item.audience[platform]={count:followers,source:"site"};
      for(const [metric,label] of [["avg_views",/^Avg\. Views per Video$/i],["avg_likes",/^Avg\. Likes per Video$/i],["avg_comments",/^Avg\. Comments per Video$/i],["avg_shares",/^Avg\. Shares per Video$/i]] as const){const count=read(label);if(count!==null)extra[`${platform}_${metric}` as RichMetricColumn]=String(count);}
      const rateAt=block.findIndex(line=>/^Avg\. Engagement Rate$/i.test(line));
      const rateText=rateAt>=0?[block[rateAt-1],block[rateAt+1]].find(value=>/^\d+(?:\.\d+)?%$/.test(value||"")):undefined;
      const rate=rateText?plausibleEngagement(rateText.replace("%","")):null;if(rate!==null)item.engagement[platform]=rate;
      const genders=distribution(block,/^Gender Distribution/i,/^Audience Location|^Top Posts/i);
      const ages=distribution(block,/^Age Distribution/i,/^Gender Distribution/i);
      const countries=distribution(block,/^Audience Location/i,/^Top Posts/i);
      const gender=genders.map(entry=>`${/^Female$/i.test(entry.label)?"F":/^Male$/i.test(entry.label)?"M":entry.label} ${entry.value}%`).join(" / ");
      const age=ages.slice(0,3).map(entry=>`${entry.label} ${entry.value}%`).join(" / ");
      const country=countries.slice(0,3).map(entry=>`${entry.label} ${entry.value}%`).join(" / ");
      if(gender){extra[`${platform}_audience_gender`]=gender;if(!extra.audience_gender)extra.audience_gender=gender;}
      if(age){extra[`${platform}_audience_age_top`]=age;if(!extra.audience_age_top)extra.audience_age_top=age;}
      if(country){extra[`${platform}_audience_top_countries`]=country;if(!extra.audience_top_countries)extra.audience_top_countries=country;}
    }
    if(dates.length)extra.metrics_as_of=dates.sort()[0];
    if(!item.creator.bio)reasons.push("Bio missing");
    if(!platformAt.length)reasons.push("Audience details unavailable");
    return {adapter:"the-thread",url:page.url,creators:[item]};
  },
};
