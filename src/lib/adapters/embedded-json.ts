import { load } from "cheerio";
import { julyAdapter } from "./july";
import type { RosterAdapter } from "./types";

export const embeddedJsonAdapter:RosterAdapter={
  name:"embedded-json",
  parse(page){
    const $=load(page.html);let creators:Record<string,unknown>[]|undefined;
    function search(value:unknown,depth=0){
      if(creators||depth>7||!value||typeof value!=="object")return;
      for(const [key,child] of Object.entries(value)){
        if(key==="creators"&&Array.isArray(child)&&child.length&&child.every(item=>item&&typeof item==="object"&&typeof item.name==="string"&&Array.isArray(item.platforms))){creators=child;return;}
        search(child,depth+1);
      }
    }
    $("script#__NEXT_DATA__,script[type='application/ld+json']").each((_,node)=>{try{search(JSON.parse($(node).text()));}catch{}});
    if(!creators)return null;
    const source=creators as Record<string,unknown>[];
    const adapted=source.map(creator=>({...creator,username:typeof creator.username==="string"?creator.username:"",platforms:(creator.platforms as Record<string,unknown>[]).map(platform=>({...platform,size:platform.followers??platform.subscribers,platformUrl:platform.platformUrl??platform.url}))}));
    const data={props:{pageProps:{data:{roster:{json:{creators:adapted}}}}}};
    const roster=julyAdapter.parse({url:"https://july.bio/embedded",html:`<script id="__NEXT_DATA__">${JSON.stringify(data).replace(/</g,"\\u003c")}</script>`});
    if(!roster)return null;
    roster.adapter="embedded-json";roster.url=page.url;
    roster.creators.forEach((item,index)=>{const raw=source[index].profile_url;try{const url=new URL(typeof raw==="string"?raw:"",page.url);item.creator.source_profile_url=raw&&["https:","http:"].includes(url.protocol)?url.href:"";}catch{item.creator.source_profile_url="";}});
    return roster;
  },
};
