import { expect,it } from "vitest";
import { parseHtml } from "./capture";
it("extracts text, contextual anchors, relative images and marks agency navigation",()=>{
  const result=parseHtml('<html><body><script>ignore me</script><nav><a href="https://instagram.com/agency">Agency</a></nav><article>Jane creator <a href="/jane">Profile</a><img src="/jane.jpg" alt="Jane"></article></body></html>',"https://agency.com");
  expect(result.text).not.toContain("ignore me");expect(result.anchors[0].sitewide).toBe(true);expect(result.anchors[1]).toMatchObject({href:"https://agency.com/jane",context:"Jane creator Profile",sitewide:false});expect(result.images).toEqual([{src:"https://agency.com/jane.jpg",alt:"Jane"}]);expect(result.screenshots).toEqual([]);
});
it("handles empty and malformed HTML safely",()=>{expect(parseHtml("","https://agency.com").anchors).toEqual([]);expect(parseHtml('<body><a href="http://[broken">bad</a><img src="http://[broken">',"https://agency.com").images).toEqual([]);});
