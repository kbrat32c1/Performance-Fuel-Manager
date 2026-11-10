import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("coach weight targets", () => {
  const prompt = readFileSync(resolve(process.cwd(), "api/_coach-prompt.ts"), "utf8");

  it("has no water-loading bonus on targets", () => {
    expect(prompt).not.toMatch(/water loading bonus/i);
    expect(prompt).not.toMatch(/\+ ?2-4 ?lbs/i);
  });
  it("says water loading doesn't raise them", () => {
    expect(prompt).toMatch(/Water loading does not raise these targets/);
  });
});
