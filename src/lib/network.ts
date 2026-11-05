import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateIP(ip: string) {
  if (ip.includes(":")) return /^(::|fc|fd|fe[89ab])/i.test(ip) || ip.toLowerCase().startsWith("::ffff:");
  const [a,b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && [18,19].includes(b);
}
export async function publicUrl(value: string): Promise<URL> {
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password || u.port && !["80","443"].includes(u.port)) throw new Error("Use a public http or https URL without credentials or custom ports.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{address:host}] : await lookup(host, {all:true});
  if (!addresses.length || addresses.some(a => privateIP(a.address))) throw new Error("Private and local network URLs are not allowed.");
  return u;
}
export async function publicFetch(value: string, maxBytes = 3_000_000): Promise<{bytes: Buffer; url: string; contentType: string}> {
  let url = value;
  for (let i=0;i<6;i++) {
    await publicUrl(url);
    const response = await fetch(url, {redirect:"manual", signal:AbortSignal.timeout(15000), headers:{"User-Agent":"Rosterkit/1.0 (public creator roster research)", Accept:"text/html,image/*"}});
    if ([301,302,303,307,308].includes(response.status)) { const next = response.headers.get("location"); if (!next) throw new Error("Redirect without location"); url = new URL(next,url).href; continue; }
    if (!response.ok) throw new Error(`Page returned HTTP ${response.status}. It may block automated access.`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The page returned an empty response.");
    const chunks: Uint8Array[] = []; let size=0;
    while (true) { const {done,value} = await reader.read(); if(done) break; size+=value.length; if(size>maxBytes) { await reader.cancel(); throw new Error("Response is too large."); } chunks.push(value); }
    return {bytes:Buffer.concat(chunks),url,contentType:response.headers.get("content-type") || ""};
  }
  throw new Error("Too many redirects.");
}
