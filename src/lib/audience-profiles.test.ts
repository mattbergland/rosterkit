import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillPublicAudience, publicProfileCount } from "./audience-profiles";
import { publicFetch } from "./network";
import { columns, type RosterRow } from "./types";
vi.mock("./network",()=>({publicFetch:vi.fn()}));
const script=(data:unknown)=>`<script type="application/json">${JSON.stringify(data)}</script>`;
function row(values:Partial<RosterRow>):RosterRow{return {...Object.fromEntries(columns.map(column=>[column,""])),...values} as RosterRow;}
beforeEach(()=>vi.resetAllMocks());
describe("public profile count readers",()=>{
  it("reads YouTube channel header subscribers but ignores video and recommendation counts",()=>{
    const data={header:{pageHeaderRenderer:{content:{metadata:{text:"1.23M subscribers"}}}},contents:{text:"9M subscribers"}};
    expect(publicProfileCount(`<script>var ytInitialData = ${JSON.stringify(data)}; window.other = {};</script>`,"youtube","jane")).toBe(1230000);
    expect(publicProfileCount(script({contents:{text:"9M subscribers"}}),"youtube","jane")).toBeNull();
  });
  it("reads TikTok JSON only when its user matches the requested account",()=>{
    const html=script({__DEFAULT_SCOPE__:{"webapp.user-detail":{userInfo:{user:{uniqueId:"Jane"},stats:{followerCount:123456,followingCount:450,heartCount:9000000}}}}});
    expect(publicProfileCount(html,"tiktok","jane")).toBe(123456);expect(publicProfileCount(html,"tiktok","alex")).toBeNull();
    expect(publicProfileCount(script({UserModule:{users:{id:{uniqueId:"jane"}},stats:{id:{followerCount:456}}}}),"tiktok","jane")).toBe(456);
  });
  it.each([["instagram",{username:"jane",edge_followed_by:{count:1234},edge_follow:{count:999}}],["x",{screen_name:"jane",followers_count:1234}],["threads",{username:"jane",follower_count:1234}],["twitch",{login:"jane",followers:{totalCount:1234}}]] as const)("reads only this account’s exposed %s data",(platform,data)=>{
    expect(publicProfileCount(script({user:data,other:{username:"other",follower_count:9000000}}),platform,"jane")).toBe(1234);expect(publicProfileCount(script({user:data}),platform,"someoneelse")).toBeNull();
  });
  it("can read a public description if the handle and follower label match",()=>{
    expect(publicProfileCount('<meta name="description" content="1.2M Followers, 20 Following - Jane (@jane)">',"instagram","jane")).toBe(1200000);
    expect(publicProfileCount('<meta name="description" content="2M views, 30 Following - Jane (@jane)">',"instagram","jane")).toBeNull();
    expect(publicProfileCount('<meta name="description" content="1M Followers - Jane (@jane.other)">',"instagram","jane")).toBeNull();
  });
  it.each(["","<h1>Sign in to continue</h1>","<script>malformed JSON</script>"])("returns unknown for empty, blocked and malformed pages",html=>expect(publicProfileCount(html,"youtube","jane")).toBeNull());
  it("rejects conflicting public counts rather than choosing the largest",()=>expect(publicProfileCount(script({users:[{username:"jane",follower_count:1},{username:"jane",follower_count:2}]}),"instagram","jane")).toBeNull());
});
describe("bounded profile fallback",()=>{
  it("never overwrites site metrics, fills only missing counts, and recomputes totals",async()=>{
    const rows=[row({instagram:"https://instagram.com/jane",instagram_followers:"450000",youtube:"https://youtube.com/@jane",total_reach:"450000",metrics_source:"instagram:site",metrics_as_of:"2026-11-12"})];
    vi.mocked(publicFetch).mockResolvedValue({bytes:Buffer.from(script({header:{subscriberCountText:{simpleText:"100K subscribers"}}})),url:"https://youtube.com/@jane",contentType:"text/html"});
    await fillPublicAudience(rows,Date.now()+50000);
    expect(rows[0].youtube_followers).toBe("100000");
    expect(publicFetch).toHaveBeenCalledTimes(1);expect(rows[0].instagram_followers).toBe("450000");expect(rows[0].youtube_subscribers).toBe("100000");expect(rows[0].metrics_source).toBe("instagram:site | youtube:profile");expect(rows[0].total_reach).toBe("550000");expect(rows[0].metrics_as_of).toBe("2026-11-12");
  });
  it("skips failures and account-changing redirects gracefully",async()=>{
    const rows=[row({youtube:"https://youtube.com/@jane"}),row({youtube:"https://youtube.com/@other"})];
    vi.mocked(publicFetch).mockRejectedValueOnce(new Error("HTTP 403")).mockResolvedValueOnce({bytes:Buffer.from(script({header:{text:"2M subscribers"}})),url:"https://youtube.com/@wrong",contentType:"text/html"});
    await fillPublicAudience(rows,Date.now()+50000);expect(rows.every(row=>!row.youtube_subscribers)).toBe(true);
  });
  it("does no network work after its budget is exhausted",async()=>{await fillPublicAudience([row({youtube:"https://youtube.com/@jane"})],Date.now()-1);expect(publicFetch).not.toHaveBeenCalled();});
  it("limits concurrency to five and caches duplicate profile requests",async()=>{
    let active=0;let peak=0;
    vi.mocked(publicFetch).mockImplementation(async url=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return {url,bytes:Buffer.from(script({header:{text:"2K subscribers"}})),contentType:"text/html"};});
    const rows=Array.from({length:16},(_,index)=>row({youtube:`https://youtube.com/@creator${index%8}`}));
    await fillPublicAudience(rows,Date.now()+50000);expect(peak).toBeLessThanOrEqual(5);expect(publicFetch).toHaveBeenCalledTimes(8);expect(rows.every(row=>row.youtube_subscribers==="2000")).toBe(true);
  });
});
