"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Check, ChevronRight, CircleHelp, ExternalLink, Link2, LoaderCircle, Plus, ScanLine, ShieldCheck, Sparkles, Table2, Users, X } from "lucide-react";
import { columns, socialPlatforms, type Column, type ProgressEvent, type RosterRow } from "@/lib/types";
import { toCsv } from "@/lib/export";
import { buildStages, friendlyBuildError, initialProgress, updateBuildProgress } from "@/lib/build-presentation";

const visibleColumns=columns.filter(c=>!["niche_confidence","brand_safety_score","review_reasons"].includes(c));
const labels:Partial<Record<Column,string>>={name:"Creator",primary_handle:"Handle",niche:"Category",bio:"About",source_profile_url:"Creator profile",needs_review:"Needs review",source_url:"Original page",link_in_bio:"Link in bio",other_links:"Other links",avatar_url:"Profile image",management_contact:"Management contact"};
const shortNames:Record<string,string>={instagram:"IG",tiktok:"TK",youtube:"YT",x:"𝕏",twitch:"TW",threads:"TH",snapchat:"SC",pinterest:"PI",linkedin:"IN",facebook:"FB",substack:"SU",podcast:"PD",website:"WEB",link_in_bio:"BIO"};
function download(content:string,type:string,extension:string){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=u;a.download=`rosterkit.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function safeLink(url:string){try{return ["http:","https:"].includes(new URL(url).protocol);}catch{return false;}}

export default function Home(){
  const [url,setUrl]=useState("");const [busy,setBusy]=useState(false);const [started,setStarted]=useState(false);const [progress,setProgress]=useState(initialProgress);const [rows,setRows]=useState<RosterRow[]>([]);const [error,setError]=useState("");const [editing,setEditing]=useState<string>();const [filter,setFilter]=useState("");const [showHelp,setShowHelp]=useState(false);const inputRef=useRef<HTMLInputElement>(null);
  const reviewCount=rows.filter(r=>r.needs_review==="true").length;
  const complete=started&&!busy&&!error;
  async function build(e:React.FormEvent){
    e.preventDefault();if(busy)return;setBusy(true);setStarted(true);setProgress(initialProgress);setError("");setRows([]);setEditing(undefined);setFilter("");
    try{
      const response=await fetch("/api/build",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
      if(!response.ok){const body=await response.json();throw new Error(body.error||"Could not start the build.");}
      const reader=response.body?.getReader();if(!reader)throw new Error("Progress stream unavailable.");
      const decoder=new TextDecoder();let buffer="";let finished=false;
      const consume=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line) as ProgressEvent;if(event.type==="progress")setProgress(previous=>updateBuildProgress(previous,event));if(event.type==="error"){setError(friendlyBuildError(event.message||""));finished=true;}if(event.type==="result"){if(event.rows?.length)setRows(event.rows);else setError(friendlyBuildError("No creators found"));finished=true;}};
      while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()||"";lines.forEach(consume);}
      if(buffer.trim())consume(buffer);if(!finished)throw new Error("The connection ended before the roster was ready. Please try again.");
    }catch(e){setError(friendlyBuildError(e instanceof Error?e.message:""));}finally{setBusy(false);}
  }
  function reset(){if(busy)return;setRows([]);setStarted(false);setProgress(initialProgress);setError("");setEditing(undefined);setUrl("");inputRef.current?.focus();}
  function edit(index:number,column:Column,value:string){setRows(prev=>prev.map((r,i)=>i===index?{...r,[column]:value}:r));}
  return <div className="app-shell">
    <header className="nav"><Link className="wordmark" href="/" aria-label="rosterkit home"><span className="brand-icon"><i/><i/><i/><i/></span>rosterkit<span className="badge">BETA</span></Link><div className="nav-right"><span>Creator research workspace</span><button className="help-button" onClick={()=>setShowHelp(!showHelp)} aria-label="How rosterkit works"><CircleHelp size={18}/></button></div></header>
    <main>
      <div className="workspace-bar"><div><span className="workspace-dot"/> Workspace <ChevronRight size={14}/><span className="ink">New roster</span></div><button className="text-button" onClick={reset} disabled={busy}><Plus size={15}/> New build</button></div>
      <section className="hero"><div className="eyebrow">— ONE SOURCE. ONE ROSTER.</div><h1>A starting point for<br/>your next creator roster.</h1><p>Paste a public URL. Extract creators, connect their channels,<br className="desktop-break"/> and review the details before you export.</p>
        <form onSubmit={build} className="source-card"><label htmlFor="source-url">Source URL <span>Roster, link-in-bio, website or social profile</span></label><div className="input-row"><div className="url-input"><Link2 size={18}/><input ref={inputRef} id="source-url" type="url" placeholder="https://agency.com/talent" value={url} onChange={e=>setUrl(e.target.value)} required disabled={busy} autoComplete="url"/></div><button className="primary-button" disabled={busy||!url}>{busy?<LoaderCircle size={16} className="spin"/>:null}{busy?"Building…":"Build roster"}{!busy&&<ArrowRight size={16}/>}</button></div><div className="input-note"><ShieldCheck size={13}/> Public pages only. Missing information stays empty.<span>Up to 60 creators / build</span></div></form>
      </section>
      {showHelp&&<aside className="help-panel"><button className="dismiss" onClick={()=>setShowHelp(false)} aria-label="Close help"><X size={16}/></button><h3>From page to spreadsheet.</h3><p>Start with a public roster or creator page. We’ll gather the creators and their channels into one editable list.</p><p>Review highlighted details, make any changes, then download your roster. Missing information stays empty. Your roster stays in this tab until you leave or reload the page.</p></aside>}
      {error&&<div className="error-panel" role="alert"><X size={18}/><div><strong>Couldn’t complete this build.</strong><p>{error}</p></div></div>}
      {started&&<section className={`activity-panel build-status ${complete?"is-complete":""}`} aria-label="Build progress">
        <div className="section-title"><div><span className="eyebrow">YOUR ROSTER</span><h2>{busy?"A little closer with every step.":error?"Let’s try another way.":"Your roster is ready."}</h2></div><span className={busy?"status-tag running":"status-tag"}>{busy?<><LoaderCircle size={14} className="spin"/> Building</>:error?"Not completed":<><Check size={14}/> Complete</>}</span></div>
        <div className="build-body">
          <div className={`build-track ${busy?"is-running":""}`} role="progressbar" aria-label="Roster build progress" aria-valuetext={busy?buildStages[progress.stage]:error?"Not completed":"Complete"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={complete?100:undefined}><span className="build-fill" style={{width:`${complete?100:[12,36,64,88][progress.stage]}%`}}/></div>
          <ol className="friendly-stages">{buildStages.map((label,index)=>{const done=complete||index<progress.stage;const active=busy&&index===progress.stage;return <li key={label} className={`${done?"done":""} ${active?"active":""}`} aria-current={active?"step":undefined}><span className="stage-marker">{done?<Check size={14}/>:active?<LoaderCircle size={14} className="spin"/>:index+1}</span><span>{label}</span></li>;})}</ol>
          <p className="build-summary" role="status" aria-live="polite">{busy?<>{progress.foundCount!==null?`Found ${progress.foundCount} creator${progress.foundCount===1?"":"s"}. `:""}Your roster is on its way. You can keep this page open.</>:error?"Your next roster is just a link away.":`${rows.length} creator${rows.length===1?"":"s"}, ready to review, edit and download.`}</p>
        </div>
      </section>}
      <section className="results-panel" aria-label="Creator roster" aria-busy={busy}><div className="results-top"><div><div className="eyebrow">YOUR DATASET</div><h2>Creator roster <span className="count">{busy?<LoaderCircle size={12} className="spin"/>:rows.length}</span></h2></div><div className="export-actions"><button className="secondary-button" disabled={busy||!rows.length} onClick={()=>download(JSON.stringify(rows,null,2),"application/json","json")}><ArrowDownToLine size={14}/> JSON</button><button className="secondary-button" disabled={busy||!rows.length} onClick={()=>download(toCsv(rows),"text/csv;charset=utf-8","csv")}><ArrowDownToLine size={14}/> Download CSV</button></div></div>
      {busy?<div className="loading-roster">
        <div className="loading-caption"><LoaderCircle size={14} className="spin"/> Building your list. Creators will appear here when it’s ready.</div>
        <div className="table-scroll" aria-hidden="true"><table className="skeleton-table"><thead><tr>{["Creator","Handle","Category","Channels","About"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{Array.from({length:6},(_,index)=><tr key={index}>{[0,1,2,3,4].map(column=><td key={column}><div className="skeleton-cell">{column===0&&<span className="skeleton skeleton-avatar"/>}<span className={`skeleton skeleton-line skeleton-width-${(index+column)%3}`}/></div></td>)}</tr>)}</tbody></table></div>
      </div>:rows.length>0?<>
        <div className="table-toolbar"><div><span className="table-label"><Users size={14}/>{rows.length} creators</span><span className="review-tag">{reviewCount} need review</span><span className="muted">Click any cell to edit</span></div><input aria-label="Filter creators" placeholder="Filter creators…" value={filter} onChange={e=>setFilter(e.target.value)}/></div>
        <div className="table-scroll"><table><thead><tr><th className="row-number">#</th>{visibleColumns.map(c=><th key={c}>{labels[c]||c.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{rows.map((row,index)=>({row,index})).filter(({row})=>!filter||[row.name,row.primary_handle,row.niche].some(s=>s.toLowerCase().includes(filter.toLowerCase()))).map(({row,index})=><tr key={index}><td className="row-number">{String(index+1).padStart(2,"0")}</td>{visibleColumns.map(column=>{
          const id=`${index}-${column}`;const social=socialPlatforms.some(p=>p===column);const low=column==="niche"&&Number(row.niche_confidence)<0.75 || row.review_reasons.toLowerCase().includes(`low-confidence ${column}`);const label=labels[column]||column.replaceAll("_"," ");
          return <td key={column} className={`${column==="name"?"name-cell ":""}${low?"low-confidence":""}`} title={low?"Worth a quick review":"Click to edit"}>{editing===id?<input className="cell-editor" aria-label={`Edit ${label} for ${row.name}`} autoFocus value={row[column]} onChange={e=>edit(index,column,e.target.value)} onBlur={()=>setEditing(undefined)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setEditing(undefined);}}/>:<div className="cell-content"><button className={`cell-value ${social&&row[column]?"social-chip":""} ${column==="needs_review"&&row[column]==="true"?"review-value":""}`} onClick={()=>setEditing(id)}>{social&&row[column]?<><Link2 size={12}/>{shortNames[column]}</>:column==="needs_review"&&row[column]?row[column]==="true"?"Yes":"No":row[column]||<span className="empty-value">—</span>}</button>{social&&safeLink(row[column])&&<a className="external-link" href={row[column]} target="_blank" rel="noreferrer" aria-label={`Open ${label} for ${row.name}`}><ExternalLink size={12}/></a>}</div>}</td>;
        })}</tr>)}</tbody></table></div><div className="table-footer"><span><i/> Highlighted values need a closer look.</span><span>Follower counts stay empty · {visibleColumns.length} visible columns</span></div>
      </>:<div className="empty-state"><div className="empty-illustration"><div className="mock-table"><div><span/><span/><span/></div>{[0,1,2].map(n=><div key={n}><i/><b/><em/></div>)}</div><div className="table-symbol"><Table2 size={20}/></div></div><h3>Your roster starts with a URL.</h3><p>Creators and their channels will appear here.<br/>Review, edit, then take your data with you.</p><div className="empty-formats"><span>CSV</span><Plus size={10}/><span>JSON</span></div></div>}
      </section>
      {!started&&<section className="how-it-works"><div><ScanLine size={18}/><h3>Start with a page.</h3><p>Choose a public roster, creator website or profile.</p></div><div><Sparkles size={18}/><h3>Bring it together.</h3><p>Find creators and gather their public channels in one place.</p></div><div><Table2 size={18}/><h3>Make it yours.</h3><p>Edit the roster and export a straightforward dataset.</p></div></section>}
      <footer><span>rosterkit <span className="footer-separator">/</span> Public evidence, editable data.</span><button onClick={()=>setShowHelp(!showHelp)}>How it works <ArrowRight size={12}/></button></footer>
    </main>
  </div>;
}
