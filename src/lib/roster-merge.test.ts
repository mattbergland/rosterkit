import { expect,it } from "vitest";
import { mergeRosterRows } from "./roster-merge";
import { columns, type RosterRow } from "./types";
const row=(values:Partial<RosterRow>)=>({...Object.fromEntries(columns.map(column=>[column,""])),...values}) as RosterRow;
it("merges distinct roster pages by normalized account, preserves site priority and provenance, and avoids double counting",()=>{
  const rows=mergeRosterRows([row({name:"Jane Doe",instagram:"https://www.instagram.com/jane/",instagram_followers:"100",metrics_source:"instagram:profile",needs_review:"true",review_reasons:"Check bio"}),row({name:"Jane",instagram:"https://instagram.com/jane",instagram_followers:"120",youtube_subscribers:"450",metrics_source:"instagram:site | youtube:profile",needs_review:"false"}),row({name:"Alex",tiktok_followers:"50",metrics_source:"tiktok:site"})]);
  expect(rows).toHaveLength(2);expect(rows[0].instagram_followers).toBe("120");expect(rows[0].youtube_subscribers).toBe("450");expect(rows[0].total_reach).toBe("570");expect(rows[0].metrics_source).toBe("instagram:site | youtube:profile");expect(rows[0].needs_review).toBe("true");
});
it("handles empty input",()=>expect(mergeRosterRows([])).toEqual([]));
it("keeps distinct creators who share an account",()=>{
  expect(mergeRosterRows([row({name:"Andrea Botez",primary_handle:"andrea",twitch:"https://twitch.tv/botezlive"}),row({name:"Alexandra Botez",primary_handle:"alexandra",twitch:"https://twitch.tv/botezlive"}),row({name:"BotezLive",primary_handle:"botezlive",twitch:"https://twitch.tv/botezlive"})])).toHaveLength(3);
});
