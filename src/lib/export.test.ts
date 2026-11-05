import { expect,it } from "vitest";
import { toCsv } from "./export";
import { columns,type RosterRow } from "./types";
it("exports empty rows with headers",()=>{expect(toCsv([])).toBe("\uFEFF"+columns.join(","));});
it("escapes quotes, newlines, commas and spreadsheet formulas",()=>{const row={name:'=HYPERLINK("evil")',bio:'hello, "there"\nfriend'} as RosterRow;const csv=toCsv([row]);expect(csv).toContain('"\'=HYPERLINK(""evil"")"');expect(csv).toContain('"hello, ""there""\nfriend"');});
