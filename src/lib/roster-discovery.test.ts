import { beforeEach, expect, it, vi } from "vitest";
import { discoverAgencyRosters, isSoft404, rosterCandidates } from "./roster-discovery";
import { publicFetch } from "./network";
import { jev } from "./jev";
import { parseStructuredRoster } from "./adapters";
import fixture from "./adapters/july.fixture.json";
vi.mock("./network",()=>({publicFetch:vi.fn()}));
vi.mock("./jev",()=>({jev:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
it("generates bounded same-origin candidate paths, navigation links, footer links and sitemap URLs",()=>{
  const urls=rosterCandidates("https://agency.com/",'<nav><a href="/our-influencers?category=food">Creators</a></nav><footer><a href="/talent">Talent</a><a href="https://evil.example/roster">Roster</a></footer>',["https://agency.com/hidden-roster","https://evil.example/creators","http://[bad"]);
  expect(urls).toContain("https://agency.com/our-influencers");expect(urls).toContain("https://agency.com/hidden-roster");expect(urls).toContain("https://agency.com/roster");expect(urls).toContain("https://agency.com/team");expect(urls.some(url=>url.includes("evil"))).toBe(false);expect(urls.length).toBeLessThanOrEqual(24);
});
it("rejects identical homepages, near-identical soft 404s and explicit missing-page messages",()=>{
  const home="<body>Agency home. We connect brands with creative talent and build partnerships.</body>";
  expect(isSoft404(home,home)).toBe(true);expect(isSoft404(home,"<body>Page not found</body>")).toBe(true);expect(isSoft404(home,"<body>Jane Doe Instagram 450K. Alex Smith TikTok 1.2M. Our creators.</body>")).toBe(false);expect(isSoft404(home,"")).toBe(true);
});
it("discovers an unlisted /roster → July embed and rejects homepage soft-404 paths",async()=>{
  const home='<body><h1>Evolved Talent</h1><p>We help creators build their businesses and partner with leading brands around the world.</p></body>';
  const july=`<script id="__NEXT_DATA__">${JSON.stringify(fixture)}</script>`;
  vi.mocked(publicFetch).mockImplementation(async url=>({url,contentType:"text/html",bytes:Buffer.from(url==="https://agency.com/roster"?'<body><h1>Our roster</h1><iframe src="https://july.bio/evolved"></iframe></body>':url==="https://july.bio/evolved"?july:url.endsWith("sitemap.xml")?"<urlset/>":url.endsWith("robots.txt")?"":home)}));
  vi.mocked(jev).mockResolvedValue({page_0:{type:"noul",noul:.1}});
  const candidates=await discoverAgencyRosters("https://agency.com/");
  expect(candidates[0].roster?.creators).toHaveLength(2);expect(candidates[0].url).toBe("https://july.bio/evolved");expect(candidates[0].sourceUrl).toBe("https://agency.com/roster");expect(candidates.filter(candidate=>!candidate.roster)).toHaveLength(0);
});
it("recognizes a conservative creators-like embedded JSON array without making up metrics",()=>{
  const html='<script type="application/ld+json">{"creators":[{"name":"Jane","platforms":[{"platform":"instagram","followers":1234,"url":"https://instagram.com/jane"},{"platform":"youtube","views":9000000,"url":"https://youtube.com/@jane"}]}]}</script>';
  const roster=parseStructuredRoster({url:"https://agency.com/roster",html})!;expect(roster.creators[0].audience.instagram?.count).toBe(1234);expect(roster.creators[0].audience.youtube).toBeUndefined();expect(roster.creators[0].creator.source_profile_url).toBe("");
});
