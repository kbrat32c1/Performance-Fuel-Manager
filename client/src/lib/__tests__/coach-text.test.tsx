import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoachText } from "@/components/coach-text";

const html = (text: string) => renderToStaticMarkup(<CoachText text={text} />);

describe("CoachText", () => {
  it("shows bold without the asterisks", () => {
    const out = html("**Measured:** 174 lbs");
    expect(out).toContain('<strong class="font-semibold">Measured:</strong> 174 lbs');
    expect(out).not.toContain("**");
  });
  it("turns headings and lists into real elements", () => {
    const out = html("# Where You Stand\n- one\n- two\n1. first\n2. second");
    expect(out).not.toContain("#");
    expect(out.match(/<ul/g)).toHaveLength(1);
    expect(out.match(/<ol/g)).toHaveLength(1);
    expect(out.match(/<li>/g)).toHaveLength(4);
  });
  it("keeps paragraphs on separate lines", () => {
    expect(html("one\n\ntwo").match(/<p>/g)).toHaveLength(2);
  });
  it("never treats the reply as HTML", () => {
    expect(html("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });
  it("leaves a lone multiplication or minus alone", () => {
    expect(html("157 * 1.05 is about 165")).toContain("157 * 1.05");
    expect(html("-1.5 lb overnight")).toContain("-1.5 lb");
  });
  it("reads a table row without the pipes", () => {
    const out = html("| Date | Loss |\n|------|------|\n| 11/1 | -2.5 lb |");
    expect(out).not.toContain("|");
    expect(out).toContain("11/1");
  });
});
