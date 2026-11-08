import { describe, it, expect } from "vitest";
import { sleepSourceName } from "../sleep-source";

describe("sleepSourceName", () => {
  it("names the real wearable", () => {
    expect(sleepSourceName("whoop", "2026-11-08", "2026-11-08")).toBe("from WHOOP");
    expect(sleepSourceName("v5-direct", "2026-11-08", "2026-11-08")).toBe("from V5 band");
    expect(sleepSourceName("healthkit", "2026-11-08", "2026-11-08")).toBe("from Apple Health");
  });

  it("shows the date when the sleep isn't last night's", () => {
    expect(sleepSourceName("whoop", "2026-11-06", "2026-11-08")).toBe("from WHOOP · 11/6");
  });
});
