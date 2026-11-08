import { describe, it, expect } from "vitest";
import { classifyFood, copyEntry, nextTotals, totalsFromFoodLog, withSliceCount, gramsToSlices } from "../food-totals";
import type { FoodLogEntry } from "../stores/types";

const spar = (over: Partial<FoodLogEntry>): FoodLogEntry =>
  ({ id: "a", name: "food", timestamp: "2026-11-08T12:00:00Z", mode: "spar", ...over });

describe("food totals come from the entries", () => {
  it("deleting a 20 g protein / 4 g carb food leaves nothing behind", () => {
    const chicken = spar({ id: "c", sliceType: "protein", sliceCount: 1, protein: 20, carbs: 4 });
    expect(totalsFromFoodLog([chicken])).toMatchObject({ proteinConsumed: 20, carbsConsumed: 4 });
    expect(totalsFromFoodLog([])).toMatchObject({ proteinConsumed: 0, carbsConsumed: 0, proteinSlices: 0 });
  });

  it("changing one 25 g protein portion to two updates the grams too", () => {
    const e = spar({ sliceType: "protein", sliceCount: 1, protein: 25, carbs: 0 });
    const t = totalsFromFoodLog([withSliceCount(e, 2)]);
    expect(t.proteinSlices).toBe(2);
    expect(t.proteinConsumed).toBe(50);
  });

  it("counts the same 12 g protein serving the same way from search and from photo/voice", () => {
    const fromSearch = classifyFood({ carbs: 0, protein: 12, fat: 3 });
    const fromPhoto = classifyFood({ carbs: 0, protein: 12 }, "protein");
    expect(fromSearch).toEqual(fromPhoto);
    expect(fromSearch).toEqual({ sliceType: "protein", sliceCount: 0.5 });
  });

  it("repeating yesterday copies each entry's grams once, not once per portion", () => {
    const legacy = spar({ sliceType: "protein", sliceCount: 2, gramAmount: 50 });
    const copy = copyEntry(legacy, "new", "2026-11-09T12:00:00Z");
    expect(totalsFromFoodLog([copy])).toMatchObject({ proteinConsumed: 50, proteinSlices: 2 });
  });

  it("a scanned fat-only food adds a fat portion", () => {
    expect(classifyFood({ carbs: 0, protein: 0, fat: 14 })).toEqual({ sliceType: "fat", sliceCount: 1 });
  });

  it("gram-mode entries count toward portions with the same rule", () => {
    const g = (macroType: "carbs" | "protein", amount: number): FoodLogEntry =>
      ({ id: macroType, name: "x", timestamp: "", mode: "sugar", macroType, amount });
    expect(totalsFromFoodLog([g("protein", 12), g("carbs", 52)])).toMatchObject({
      proteinConsumed: 12, carbsConsumed: 52, proteinSlices: 0.5, carbSlices: 2,
    });
  });

  it("rounds grams to the nearest half portion", () => {
    expect(gramsToSlices(4, 26)).toBe(0);
    expect(gramsToSlices(37, 25)).toBe(1.5);
  });

  it("keeps a day's recorded grams when it has older entries, and applies only the change", () => {
    // Older entry: 20 g protein + 4 g carbs, but only gramAmount 4 was saved.
    const legacy = spar({ id: "old", sliceType: "protein", sliceCount: 1, gramAmount: 4 });
    const prev = { carbsConsumed: 4, proteinConsumed: 20, foodLog: [legacy] };
    const rice = spar({ id: "rice", sliceType: "carb", sliceCount: 1, carbs: 26, protein: 2 });
    const t = nextTotals(prev, [legacy, rice]);
    expect(t).toMatchObject({ proteinConsumed: 22, carbsConsumed: 30, proteinSlices: 1, carbSlices: 1 });
  });

  it("rebuilds grams from scratch when every entry carries its own grams", () => {
    const a = spar({ id: "a", sliceType: "protein", sliceCount: 1, protein: 20, carbs: 4 });
    expect(nextTotals({ carbsConsumed: 99, proteinConsumed: 99, foodLog: [a] }, [])).toMatchObject({ carbsConsumed: 0, proteinConsumed: 0 });
  });

  it("editing a 0-portion entry keeps its grams", () => {
    const e = spar({ sliceType: "carb", sliceCount: 0, carbs: 4, protein: 0 });
    expect(totalsFromFoodLog([withSliceCount(e, 1)])).toMatchObject({ carbSlices: 1, carbsConsumed: 4 });
  });
});
