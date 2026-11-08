import { describe, it, expect } from "vitest";
import {
  buildFoodEntries, classifyFood, copyEntry, entryCalorieLabel, establishedNutritionGoals, gramsToSlices, incompleteReasons, nextTotals,
  nutritionFromLog, totalsFromFoodLog, withGramAmount, withServings, withSliceCount,
} from "../food-totals";
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

describe("calorie diary", () => {
  const ctx = { mealSection: "lunch" as const, nowMs: 1_800_000_000_000 };
  const rice = { name: "Rice", carbs: 45, protein: 4, calories: 206, fat: 1, fiber: 1, nutrientSource: "database" as const };

  it("saves one row with calories, fat and fiber in the Calories view and in Slices", () => {
    for (const view of ["calories", "spar"] as const) {
      const rows = buildFoodEntries(rice, { ...ctx, view });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ calories: 206, fat: 1, fiber: 1, carbs: 45, protein: 4, nutrientSource: "database" });
    }
  });

  it("splits a food across the two Grams rows so they add back up exactly", () => {
    const rows = buildFoodEntries({ ...rice, calories: 205, fat: 3 }, { ...ctx, view: "sugar" });
    expect(rows.map(r => r.macroType)).toEqual(["carbs", "protein"]);
    const n = nutritionFromLog(rows);
    expect(n).toMatchObject({ calories: 205, fat: 3, fiber: 1, incomplete: false });
    expect(nutritionFromLog(rows.slice(1)).calories).toBeLessThan(205);
  });

  it("keeps a food with no carbs or protein, like butter, in Grams", () => {
    const rows = buildFoodEntries({ name: "Butter", carbs: 0, protein: 0, calories: 102, fat: 12, nutrientSource: "estimate" }, { ...ctx, view: "sugar" });
    expect(rows).toHaveLength(1);
    expect(nutritionFromLog(rows)).toMatchObject({ calories: 102, fat: 12 });
  });

  it("gives a quick portion no calories and leaves it out of the total", () => {
    const rows = buildFoodEntries({ name: "Rice", carbs: 0, protein: 0, sliceType: "carb", sliceCount: 3, nutrientSource: "portion" }, { ...ctx, view: "spar" });
    expect(rows[0].calories).toBeUndefined();
    const n = nutritionFromLog(rows);
    expect(n).toMatchObject({ calories: 0, portions: 3, incomplete: true });
    expect(incompleteReasons(n)).toEqual(["3 portions not included in calorie total"]);
  });

  it("shows older entries as not tracked, never as zero, and leaves them untouched", () => {
    const old = spar({ sliceType: "protein", sliceCount: 1, gramAmount: 25 });
    const before = JSON.stringify(old);
    const n = nutritionFromLog([old, ...buildFoodEntries(rice, { ...ctx, view: "calories" })]);
    expect(n).toMatchObject({ calories: 206, notTracked: 1, portions: 0, incomplete: true });
    expect(incompleteReasons(n)).toEqual(["1 entry not tracked"]);
    expect(JSON.stringify(old)).toBe(before);
  });

  it("marks the total incomplete when a counted food has no fat value", () => {
    const rows = buildFoodEntries({ name: "Bar", carbs: 20, protein: 5, calories: 200, nutrientSource: "estimate" }, { ...ctx, view: "calories" });
    const n = nutritionFromLog(rows);
    expect(n).toMatchObject({ calories: 200, fat: 0, missingFat: 1, estimates: 1, incomplete: true });
  });

  it("is complete only when every entry has its numbers", () => {
    expect(nutritionFromLog(buildFoodEntries(rice, { ...ctx, view: "calories" })).incomplete).toBe(false);
    expect(nutritionFromLog([]).incomplete).toBe(false);
  });

  it("scales every number when servings change, and blanks stay blank", () => {
    const [row] = buildFoodEntries({ ...rice, fiber: undefined, servings: 1 }, { ...ctx, view: "calories" });
    const edited = withServings(row, 2);
    expect(edited).toMatchObject({ calories: 412, fat: 2, carbs: 90, protein: 8, servings: 2 });
    expect(edited.fiber).toBeUndefined();
    expect(withServings(edited, 1)).toMatchObject({ calories: 206, fat: 1, carbs: 45 });
  });

  it("scales a Grams row with its calories when the gram amount changes", () => {
    const [carbRow] = buildFoodEntries({ name: "Oats", carbs: 30, protein: 0, calories: 150, fat: 3 }, { ...ctx, view: "sugar" });
    expect(withGramAmount(carbRow, 60)).toMatchObject({ amount: 60, calories: 300, fat: 6 });
  });

  it("scales calories when a portion count changes in Slices", () => {
    const [row] = buildFoodEntries({ name: "Chicken", carbs: 0, protein: 25, calories: 165, fat: 4, sliceType: "protein", sliceCount: 1 }, { ...ctx, view: "spar" });
    expect(withSliceCount(row, 2)).toMatchObject({ calories: 330, fat: 8, protein: 50 });
  });

  it("copies numbers unchanged when repeating yesterday, and reloads them intact", () => {
    const rows = buildFoodEntries(rice, { ...ctx, view: "calories" });
    const copied = rows.map((r, i) => copyEntry(r, `c${i}`, "2026-11-09T12:00:00Z"));
    expect(copied[0]).toMatchObject({ calories: 206, fat: 1, fiber: 1, nutrientSource: "database" });
    const reloaded = JSON.parse(JSON.stringify(copied));
    expect(nutritionFromLog(reloaded)).toEqual(nutritionFromLog(rows));
  });

  it("keeps carb and protein day totals correct for calorie rows, including delete", () => {
    const rows = buildFoodEntries(rice, { ...ctx, view: "calories" });
    expect(totalsFromFoodLog(rows)).toMatchObject({ carbsConsumed: 45, proteinConsumed: 4 });
    expect(nextTotals({ carbsConsumed: 45, proteinConsumed: 4, foodLog: rows }, [])).toMatchObject({ carbsConsumed: 0, proteinConsumed: 0 });
    expect(nutritionFromLog([])).toMatchObject({ calories: 0 });
  });

  it("reads the same saved entry the same way whichever view it was logged in", () => {
    const rows = buildFoodEntries(rice, { ...ctx, view: "spar" });
    const before = JSON.stringify(rows);
    expect(nutritionFromLog(rows).calories).toBe(206);
    expect(totalsFromFoodLog(rows).carbSlices).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("labels barcode, photo and voice as about, and never puts a number on a portion or older entry", () => {
    expect(entryCalorieLabel(spar({ calories: 320, nutrientSource: "estimate" }))).toBe("about 320 cal");
    expect(entryCalorieLabel(spar({ calories: 206, nutrientSource: "database" }))).toBe("206 cal");
    expect(entryCalorieLabel(spar({ sliceCount: 2, nutrientSource: "portion" }))).toBe("2 portions");
    expect(entryCalorieLabel(spar({ sliceCount: 1, gramAmount: 25 }))).toBe("Not tracked");
  });

  it("only gives calorie and fat goals where the calculator sets them", () => {
    expect(establishedNutritionGoals({ isV2: true, totalCalories: 2400, fatGrams: 70 })).toEqual({ calories: 2400, fat: 70 });
    expect(establishedNutritionGoals({ isV2: false, totalCalories: 900 })).toBeNull();
  });
});
