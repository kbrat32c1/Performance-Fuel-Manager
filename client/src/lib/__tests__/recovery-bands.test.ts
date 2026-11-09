import { describe, expect, it } from "vitest";
import { recoveryBand, recoveryLabel, recoveryTextClass, whoopRecoveryAdvice } from "../recovery-bands";

describe("WHOOP scores use WHOOP's ranges", () => {
  it.each([[100, "green"], [70, "green"], [67, "green"], [66, "yellow"], [34, "yellow"], [33, "red"], [0, "red"]] as const)(
    "%i is %s", (score, band) => expect(recoveryBand(score, "whoop")).toBe(band),
  );
  it("makes a 70 green, with one consistent message", () => {
    expect(recoveryTextClass(70, "whoop")).toBe("text-green-500");
    expect(recoveryLabel(70, "whoop")).toBe("Green recovery");
    expect(whoopRecoveryAdvice(70)).toMatch(/green/);
  });
  it("never uses orange", () => {
    for (let s = 0; s <= 100; s++) expect(recoveryBand(s, "whoop")).not.toBe("orange");
  });
  it("doesn't tell athletes to train harder or easier off one number", () => {
    for (const s of [10, 50, 90]) expect(whoopRecoveryAdvice(s)).not.toMatch(/go hard|push|reduce|lighter|easy/i);
  });
});

describe("SPAR's calculated scores keep SPAR's ranges", () => {
  it.each([[80, "green"], [70, "yellow"], [60, "yellow"], [50, "orange"], [39, "red"]] as const)(
    "%i is %s", (score, band) => expect(recoveryBand(score, "spar")).toBe(band),
  );
});
