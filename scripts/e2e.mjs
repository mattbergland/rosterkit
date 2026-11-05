import fs from "node:fs/promises";
import path from "node:path";
const [base="http://localhost:3000",url="https://linktr.ee/colinandsamir",name="run"]=process.argv.slice(2);
const folder=path.join(process.env.HOME,"rosterkit-evidence");
await fs.mkdir(folder,{recursive:true});
const started=Date.now();
const response=await fetch(`${base}/api/build`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url}),signal:AbortSignal.timeout(310000)});
if(!response.ok){console.log(`HTTP ${response.status}: ${await response.text()}`);process.exitCode=1;}else{
const decoder=new TextDecoder();let pending="";const events=[];
function consume(line){if(!line.trim())return;const event=JSON.parse(line);events.push(event);if(event.type==="progress"||event.type==="error")console.log(event.type.toUpperCase()+": "+event.message);if(event.type==="result"){const rows=event.rows||[];console.log("RESULT: "+JSON.stringify({url,rows:rows.length,filledColumns:[...new Set(rows.flatMap(row=>Object.entries(row).filter(([k,v])=>v&&typeof v==="string"&&!k.endsWith("followers")).map(([k])=>k)))],needsReview:rows.filter(r=>r.needs_review==="true").length,elapsedSeconds:event.elapsed}));}}
for await(const bytes of response.body){pending+=decoder.decode(bytes,{stream:true});let index;while((index=pending.indexOf("\n"))>=0){consume(pending.slice(0,index));pending=pending.slice(index+1);}}
if(pending)consume(pending);
await fs.writeFile(path.join(folder,`${name}.json`),JSON.stringify({url,elapsedSeconds:Math.round((Date.now()-started)/1000),events},null,2));
console.log(`TOTAL: ${Math.round((Date.now()-started)/1000)}s; evidence ${path.join(folder,`${name}.json`)}`);
}
