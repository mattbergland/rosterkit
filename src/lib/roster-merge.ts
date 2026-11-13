import { parseSocial } from "./social";
import { applyAudienceMetrics, type AudienceMetrics } from "./audience";
import { metricColumns, socialPlatforms, type AudiencePlatform, type RosterRow } from "./types";

export function mergeRosterRows(rows: RosterRow[]): RosterRow[] {
  const result:RosterRow[]=[];
  const keys=new Map<string,RosterRow>();
  for(const row of rows){
    const identities=[...socialPlatforms.flatMap(platform=>{const raw=platform==="kick"?"":row[platform];const account=parseSocial(raw||"");return account&&!["website","link_in_bio","podcast"].includes(platform)?[`social:${account.href.toLowerCase()}`]:[];}),...(row.primary_handle?[`handle:${row.primary_handle.replace(/^@/,"").toLowerCase()}`]:[]),...(row.name?[`name:${row.name.toLowerCase().replace(/\s+/g," ").trim()}`]:[])];
    const existing=identities.map(key=>keys.get(key)).find(candidate=>candidate&&(!candidate.primary_handle||!row.primary_handle||candidate.primary_handle.replace(/^@/,"").toLowerCase()===row.primary_handle.replace(/^@/,"").toLowerCase()));
    if(!existing){result.push(row);identities.forEach(key=>keys.set(key,row));continue;}
    const metrics:AudienceMetrics={};
    for(const [platform,column] of Object.entries(metricColumns)){
      const original=existing[column]!==""&&existing[column]!==undefined;const incoming=row[column]!==""&&row[column]!==undefined;
      const preferIncoming=incoming&&(!original||existing.metrics_source.includes(`${platform}:profile`)&&row.metrics_source.includes(`${platform}:site`));
      const selected=preferIncoming?row:existing;
      if(original||incoming)metrics[platform as AudiencePlatform]={count:Number(selected[column]),source:selected.metrics_source.includes(`${platform}:profile`)?"profile":"site"};
    }
    for(const [column,value] of Object.entries(row))if(value&&!existing[column as keyof RosterRow])Object.assign(existing,{[column]:value});
    existing.review_reasons=[...new Set([...existing.review_reasons.split("; "),...row.review_reasons.split("; ")].filter(Boolean))].join("; ");
    existing.needs_review=existing.needs_review==="true"||row.needs_review==="true"?"true":"false";
    if(existing.total_reach&&existing.metrics_source.includes("total_reach:site"))metrics.total_reach={count:Number(existing.total_reach),source:"site"};
    applyAudienceMetrics(existing,metrics,existing.metrics_as_of||undefined);
    identities.forEach(key=>keys.set(key,existing));
  }
  return result;
}
