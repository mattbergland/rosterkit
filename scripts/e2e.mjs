import fs from "node:fs/promises";
import path from "node:path";
const [base="http://localhost:3000",url="https://linktr.ee/colinandsamir",name="run"]=process.argv.slice(2);
const folder=path.join(process.env.HOME,"rosterkit-evidence");
await fs.mkdir(folder,{recursive:true});
const started=Date.now();
const response=await fetch(`${base}/api/build`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url}),signal:AbortSignal.timeout(310000)});
if(!response.ok){console.log(`HTTP ${response.status}: ${await response.text()}`);process.exitCode=1;}else{
const decoder=new TextDecoder();let pending="";const events=[];
function consume(line){if(!line.trim())return;const event=JSON.parse(line);events.push(event);if(event.type==="progress"&&event.message||event.type==="error")console.log(event.type.toUpperCase()+": "+event.message);if(event.type==="error")process.exitCode=1;if(event.type==="result"){const rows=event.rows||[];console.log("RESULT: "+JSON.stringify({url,rows:rows.length,filledColumns:[...new Set(rows.flatMap(row=>Object.entries(row).filter(([,v])=>v&&typeof v==="string").map(([k])=>k)))],needsReview:rows.filter(r=>r.needs_review==="true").length,elapsedSeconds:event.elapsed}));const columns=[...new Set(rows.flatMap(row=>Object.keys(row).filter(key=>/_(followers|subscribers)$/.test(key))))];console.log("METRICS: "+JSON.stringify(Object.fromEntries(columns.map(column=>{const platform=column.replace(/_(followers|subscribers)$/,"");const filled=rows.filter(row=>row[column]!==""&&row[column]!==undefined);return [platform,{rows:filled.length,site:filled.filter(row=>row.metrics_source?.includes(`${platform}:site`)).length,profile:filled.filter(row=>row.metrics_source?.includes(`${platform}:profile`)).length}];}))));console.log("AUDIENCE: "+JSON.stringify({withCounts:rows.filter(row=>row.total_reach!=="").length,withDate:rows.filter(row=>row.metrics_as_of).length,engagement:Object.fromEntries([...new Set(rows.flatMap(row=>Object.keys(row).filter(key=>key.endsWith("_engagement_rate"))))].map(column=>[column,rows.filter(row=>row[column]!==""&&row[column]!==undefined).length]))}));}}
for await(const bytes of response.body){pending+=decoder.decode(bytes,{stream:true});let index;while((index=pending.indexOf("\n"))>=0){consume(pending.slice(0,index));pending=pending.slice(index+1);}}
if(pending)consume(pending);
await fs.writeFile(path.join(folder,`${name}.json`),JSON.stringify({url,elapsedSeconds:Math.round((Date.now()-started)/1000),events},null,2));
console.log(`TOTAL: ${Math.round((Date.now()-started)/1000)}s; evidence ${path.join(folder,`${name}.json`)}`);
}
