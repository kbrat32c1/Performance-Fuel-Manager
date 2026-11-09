import { beforeEach, describe, expect, it } from "vitest";
import { effectiveLoggedTypes, getDefaultType, nextStepLabel, nextWeighIn } from "../next-weigh-in";

const set = (...t: string[]) => new Set(t);
beforeEach(() => { try { localStorage.clear(); } catch { /* not available */ } });

describe("nextWeighIn", () => {
  it("asks for the morning weight first thing", () => expect(nextWeighIn(set(), false, 6)).toBe("morning"));
  it("moves on once morning is in", () => expect(nextWeighIn(set("morning"), false, 8)).toBe("pre-practice"));
  it("doesn't ask for a missed morning weight at night", () => expect(nextWeighIn(set(), false, 21)).toBe("before-bed"));
  it("is done when all four are in", () => {
    expect(nextWeighIn(set("morning", "pre-practice", "post-practice", "before-bed"), false, 21)).toBeNull();
  });
  it("skips practice weigh-ins on a rest day", () => {
    expect(nextWeighIn(set("morning"), true, 15)).toBe("before-bed");
    expect(nextWeighIn(set("morning", "before-bed"), true, 21)).toBeNull();
  });
  it("still asks for post-practice if practice was logged on a rest day", () => {
    expect(nextWeighIn(set("morning", "pre-practice"), true, 17)).toBe("post-practice");
  });
  it("never disagrees with the + button", () => {
    for (const hour of [3, 6, 13, 15, 17, 22]) {
      for (const logged of [set(), set("morning"), set("morning", "pre-practice")]) {
        expect(nextWeighIn(logged, false, hour)).toBe(getDefaultType(effectiveLoggedTypes(logged, false), hour));
      }
    }
  });
  it("reads plainly", () => {
    expect(nextStepLabel("morning")).toBe("Log morning weight");
    expect(nextStepLabel("before-bed")).toBe("Log before-bed weight");
  });
});
