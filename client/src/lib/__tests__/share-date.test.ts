import { describe, it, expect } from "vitest";
import { resolveShareDate, localDateIn } from "../../../../api/_share-date";

// 9pm in Connecticut on Nov 7 = 02:00 UTC on Nov 8
const ctEvening = new Date("2026-11-08T02:00:00Z");

describe("coach share date", () => {
  it("uses the team's day, not UTC, when the coach sends nothing", () => {
    expect(localDateIn("America/New_York", ctEvening)).toBe("2026-11-07");
    expect(resolveShareDate(undefined, ctEvening)).toBe("2026-11-07");
  });

  it("trusts the coach's local date when it is today somewhere", () => {
    expect(resolveShareDate("2026-11-07", ctEvening)).toBe("2026-11-07");
    expect(resolveShareDate("2026-11-08", ctEvening)).toBe("2026-11-08");
  });

  it("ignores dates far from today and junk", () => {
    expect(resolveShareDate("2026-10-01", ctEvening)).toBe("2026-11-07");
    expect(resolveShareDate("tomorrow", ctEvening)).toBe("2026-11-07");
    expect(resolveShareDate(["2026-11-07"], ctEvening)).toBe("2026-11-07");
  });
});
