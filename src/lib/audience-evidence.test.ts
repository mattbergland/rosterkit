import { expect, it } from "vitest";
import { audienceEvidence } from "./audience-evidence";

it("preserves platform icon labels, heading/count proximity and creator context",()=>{
  const evidence=audienceEvidence({html:'<body><article>Jane Doe <div><svg aria-label="Instagram"></svg><span>450K</span></div><a href="https://tiktok.com/@jane">1.2M</a></article><footer>Agency Instagram 5M</footer></body>',text:"Jane Doe 450K 1.2M",anchors:[]});
  expect(evidence.some(text=>/Jane Doe.*Instagram.*450K/.test(text))).toBe(true);expect(evidence.some(text=>/1.2M.*tiktok.com/.test(text))).toBe(true);expect(evidence.join(" ")).not.toContain("Agency");
});
it("handles no metrics without making any up",()=>expect(audienceEvidence({html:"",text:"",anchors:[]})).toEqual([]));
