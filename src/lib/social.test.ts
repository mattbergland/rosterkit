import { describe, expect, it } from "vitest";
import { parseCandidates, parseSocial } from "./social";
describe("social URL parser", () => {
  it.each([
    ["https://www.instagram.com/jane/?utm_source=x", "instagram", "jane"],
    ["https://tiktok.com/@jane/video/12", "tiktok", "jane"],
    ["https://youtube.com/@jane/videos", "youtube", "jane"],
    ["https://youtube.com/channel/UC123", "youtube", "UC123"],
    ["https://twitter.com/jane/status/12", "x", "jane"],
    ["https://twitch.tv/jane", "twitch", "jane"],
    ["https://threads.net/@jane", "threads", "jane"],
    ["https://snapchat.com/add/jane", "snapchat", "jane"],
    ["https://pinterest.com/jane/", "pinterest", "jane"],
    ["https://linkedin.com/in/jane/", "linkedin", "jane"],
    ["https://facebook.com/profile.php?id=123", "facebook", "123"],
    ["https://jane.substack.com", "substack", "jane"],
    ["https://open.spotify.com/show/123", "podcast", "123"],
    ["https://kick.com/jane", "kick", "jane"],
    ["https://linktr.ee/jane", "link_in_bio", "jane"],
    ["https://beacons.ai/jane", "link_in_bio", "jane"],
    ["https://stan.store/jane", "link_in_bio", "jane"],
    ["https://lnk.bio/jane", "link_in_bio", "jane"],
    ["https://jane.com/about", "website", "about"],
    ["mailto:jane@example.com?subject=Hi", "email", "jane@example.com"],
    ["jane@example.com", "email", "jane@example.com"],
  ])("classifies %s", (url, platform, handle) => { expect(parseSocial(url)).toMatchObject({ platform, handle }); });
  it.each(["", "@jane", "not a url", "javascript:alert(1)", "https://instagram.com/p/123", "https://x.com/intent/tweet", "https://facebook.com/sharer/sharer.php", "https://youtube.com/watch?v=x", "https://youtu.be/123", "https://tiktok.com/", "https://instagram.com/%ZZ"])("rejects empty, unsafe, malformed or non-profile %s", url => { expect(parseSocial(url)).toBeNull(); });
  it("normalizes, deduplicates, resolves relative URLs, and removes site footer accounts", () => {
    const anchors = [
      {href:"https://instagram.com/jane/?utm_source=one",text:"Jane",context:"Jane"},
      {href:"https://instagram.com/jane",text:"Jane",context:"Jane"},
      {href:"https://instagram.com/agency",text:"Agency",context:"footer",sitewide:true},
      {href:"/about",text:"About",context:"navigation"},
    ];
    expect(parseCandidates(anchors, "https://agency.com")).toHaveLength(1);
    expect(parseCandidates([], "https://agency.com")).toEqual([]);
    expect(parseSocial("/about", "https://jane.com")?.href).toBe("https://jane.com/about");
  });
  it("rejects link-in-bio service help and marketing pages",()=>{expect(parseSocial("https://linktr.ee/help/en/articles/123")).toBeNull();expect(parseSocial("https://linktr.ee/s/about/trust-center/report")).toBeNull();});
  it("allows the creator’s own source website when requested",()=>{expect(parseCandidates([{href:"https://jane.com/",text:"Jane",context:"Jane’s own site"}],"https://jane.com/",new Set(),false)[0]).toMatchObject({platform:"website",href:"https://jane.com"});});
});
