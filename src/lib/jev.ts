import sharp from "sharp";
import { publicFetch } from "./network";
export type Question = {type:"choice"|"noul"|"score";instructions:string;criteria?:Record<string,string>|string[]};
export type Answer = {type:string;choice?:string;confidence?:number;probabilities?:Record<string,number>;noul?:number;score?:number};
export async function jev(state:unknown, questions:Record<string,Question>, images:string[]=[]):Promise<Record<string,Answer>> {
  const assets=Object.fromEntries(images.map((data,i)=>[`image_${i}`,{type:"image",format:"jpg",data_base64:data}]));
  const response=await fetch("https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{Authorization:`Bearer ${process.env.TYPESAFE_API_KEY}`,"Content-Type":"application/json",...(images.length?{"TypeSafe-Danger-Zone-Images":"true"}:{})},body:JSON.stringify({model:"jev-latest",state:{evidence:state,images:images.map((_,i)=>`image_${i}`)},questions,...(images.length?{assets}:{})}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(`Jev request failed (HTTP ${response.status}).`);
  const result=await response.json();
  if(!result.answers)throw new Error("Jev returned no judgments.");
  return result.answers;
}
export async function avatarImage(url:string):Promise<string|undefined> {
  if(!url)return;
  try {const {bytes,contentType}=await publicFetch(url,5_000_000);if(!contentType.startsWith("image/"))return;return (await sharp(bytes,{limitInputPixels:16_000_000}).resize({width:512,height:512,fit:"inside",withoutEnlargement:true}).jpeg({quality:80}).toBuffer()).toString("base64");}catch{return;}
}
