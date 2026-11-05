import { columns, type RosterRow } from "./types";
function csvCell(value:string) {
  const safe=/^[=+\-@\t\r]/.test(value)?`'${value}`:value;
  return `"${safe.replaceAll('"','""')}"`;
}
export function toCsv(rows:RosterRow[]) {return "\uFEFF"+[columns.join(","),...rows.map(r=>columns.map(c=>csvCell(r[c]||"")).join(","))].join("\r\n");}
