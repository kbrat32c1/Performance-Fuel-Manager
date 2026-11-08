import { describe, it, expect } from "vitest";
import { alignGuideWithProtein, getTodaysFuelGuide } from "../food-data";

describe("Grams food guide follows the protein target", () => {
  it("does not tell an Optimal athlete 'zero protein' when the target is above zero", () => {
    const g = alignGuideWithProtein(getTodaysFuelGuide("3", 4), 4, { min: 25, max: 75 });
    expect(g.proteinStatus).toBe("full");
    expect(g.proteinTip).toContain("25-75 g");
    expect(g.proteinTip).not.toMatch(/zero/i);
    expect(g.eatProtein.length).toBeGreaterThan(0);
    expect(g.eatProtein.map(f => f.name).join(" ")).not.toMatch(/yogurt|dairy|milk/i);
  });

  it("keeps zero protein when the target really is zero", () => {
    const g = alignGuideWithProtein(getTodaysFuelGuide("1", 4), 4, { min: 0, max: 0 });
    expect(g.proteinStatus).toBe("blocked");
  });

  it("removes protein foods when a collagen/seafood day has a zero target", () => {
    const g = alignGuideWithProtein(getTodaysFuelGuide("1", 2), 2, { min: 0, max: 0 });
    expect(g.proteinStatus).toBe("blocked");
    expect(g.eatProtein).toEqual([]);
  });

  it("leaves a real collagen-only day alone", () => {
    const g = alignGuideWithProtein(getTodaysFuelGuide("2", 3), 3, { min: 25, max: 25 });
    expect(g.proteinStatus).toBe("collagen-only");
  });

  it("doesn't say 'no fiber' on a day it recommends whole fruit", () => {
    const g = getTodaysFuelGuide("1", 4);
    expect(g.eatCarbs.some(f => f.name === "Apples")).toBe(true);
    expect(g.avoidSummary).not.toMatch(/fiber/i);
  });

  it("recommends no whole fruit on the no-fiber days", () => {
    const g = getTodaysFuelGuide("2", 1);
    expect(g.avoidSummary).toMatch(/fiber/i);
    expect(g.eatCarbs.some(f => /^(apples|pears|grapes|mango|watermelon|bananas|blueberries)/i.test(f.name))).toBe(false);
  });
});

