import { publicUrl } from "@/lib/network";
import { runPipeline } from "@/lib/pipeline";
export const maxDuration = 300;
const active = new Set<string>();
export async function POST(request:Request) {
  let url:string;
  try {const body=await request.json();url=(await publicUrl(String(body.url||""))).href;}catch{return Response.json({error:"Enter a valid, publicly accessible http or https URL. Private network addresses are not supported."},{status:400});}
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]||"local";
  if(active.has(ip))return Response.json({error:"A build is already running. Please wait for it to finish."},{status:429});
  active.add(ip);
  const encoder=new TextEncoder();
  const stream=new ReadableStream({async start(controller){
    let open=true;
    const emit=(event:unknown)=>{if(open)try{controller.enqueue(encoder.encode(JSON.stringify(event)+"\n"));}catch{open=false;}};
    try{await runPipeline(url,emit);}catch(e){emit({type:"error",message:e instanceof Error?e.message:"The build failed. Please try another public URL."});}
    finally{active.delete(ip);if(open)controller.close();}
  }});
  return new Response(stream,{headers:{"Content-Type":"application/x-ndjson","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"}});
}
