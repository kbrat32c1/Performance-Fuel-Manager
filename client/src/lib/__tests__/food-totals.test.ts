import { describe, it, expect } from "vitest";
import {
  buildFoodEntry, calorieText, classifyFood, barcodeMultiplier, copyEntry, entryCalorieLabel, gramsToSlices, hasTotalsWithoutEntries, incompleteReasons, isListed, nextTotals,
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
  const build = (f: Parameters<typeof buildFoodEntry>[0], c: typeof ctx) => [buildFoodEntry(f, c)];
  const rice = { name: "Rice", carbs: 45, protein: 4, calories: 206, fat: 1, fiber: 1, nutrientSource: "database" as const };

  it("saves one row per food with calories, fat and fiber", () => {
    const rows = build(rice, ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ calories: 206, fat: 1, fiber: 1, carbs: 45, protein: 4, nutrientSource: "database" });
  });

  it("reads old Grams rows without changing them: grams count, calories are not tracked", () => {
    const oldCarb: FoodLogEntry = { id: "o1", name: "Oats", timestamp: "2026-11-08T12:00:00Z", mode: "sugar", macroType: "carbs", amount: 30, category: "custom" };
    const oldProtein: FoodLogEntry = { ...oldCarb, id: "o2", macroType: "protein", amount: 12 };
    const before = JSON.stringify([oldCarb, oldProtein]);
    expect(nutritionFromLog([oldCarb, oldProtein])).toMatchObject({ calories: 0, carbs: 30, protein: 12, notTracked: 2, incomplete: true });
    expect(totalsFromFoodLog([oldCarb, oldProtein])).toMatchObject({ carbsConsumed: 30, proteinConsumed: 12 });
    expect(JSON.stringify([oldCarb, oldProtein])).toBe(before);
  });

  it("keeps known fat, carbs and protein when calories are missing, and stays incomplete", () => {
    const rows = build({ name: "Puffed rice", carbs: 84, protein: 7, fat: 1, nutrientSource: "database" }, ctx);
    expect(rows[0].calories).toBeUndefined();
    expect(nutritionFromLog(rows)).toMatchObject({ calories: 0, carbs: 84, protein: 7, fat: 1, notTracked: 1, incomplete: true });
    expect(entryCalorieLabel(rows[0])).toBe("Not tracked");
  });

  it("never shows missing calories as 0 before adding", () => {
    expect(calorieText(0, false)).toBe("Calories not listed");
    expect(calorieText(0, undefined)).toBe("Calories not listed");
    expect(calorieText(0, true)).toBe("0 cal");
    expect(calorieText(206.4, true)).toBe("206 cal");
  });

  it("keeps a food with no carbs or protein, like butter, in Grams", () => {
    const rows = build({ name: "Butter", carbs: 0, protein: 0, calories: 102, fat: 12, nutrientSource: "estimate" }, ctx);
    expect(rows).toHaveLength(1);
    expect(nutritionFromLog(rows)).toMatchObject({ calories: 102, fat: 12 });
  });

  it("gives a quick portion no calories and leaves it out of the total", () => {
    const rows = build({ name: "Rice", carbs: 0, protein: 0, sliceType: "carb", sliceCount: 3, nutrientSource: "portion" }, ctx);
    expect(rows[0].calories).toBeUndefined();
    const n = nutritionFromLog(rows);
    expect(n).toMatchObject({ calories: 0, portions: 3, incomplete: true });
    expect(incompleteReasons(n)).toEqual(["3 portions not included in calorie total"]);
  });

  it("shows older entries as not tracked, never as zero, and leaves them untouched", () => {
    const old = spar({ sliceType: "protein", sliceCount: 1, gramAmount: 25 });
    const before = JSON.stringify(old);
    const n = nutritionFromLog([old, ...build(rice, ctx)]);
    expect(n).toMatchObject({ calories: 206, notTracked: 1, portions: 0, incomplete: true });
    expect(incompleteReasons(n)).toEqual(["1 entry not tracked"]);
    expect(JSON.stringify(old)).toBe(before);
  });

  it("still counts carbs and protein from entries that have no calories", () => {
    const portion = build({ name: "Rice", carbs: 0, protein: 0, sliceType: "carb", sliceCount: 1, nutrientSource: "portion" }, ctx);
    const grams = build({ name: "Chicken", carbs: 0, protein: 30 }, ctx);
    expect(nutritionFromLog([...portion, ...grams])).toMatchObject({ calories: 0, carbs: 26, protein: 30, portions: 1, notTracked: 1, incomplete: true });
  });

  it("marks the total incomplete when a counted food has no fat value", () => {
    const rows = build({ name: "Bar", carbs: 20, protein: 5, calories: 200, nutrientSource: "estimate" }, ctx);
    const n = nutritionFromLog(rows);
    expect(n).toMatchObject({ calories: 200, fat: 0, missingFat: 1, estimates: 1, incomplete: true });
  });

  it("is complete only when every entry has its numbers", () => {
    expect(nutritionFromLog(build(rice, ctx)).incomplete).toBe(false);
    expect(nutritionFromLog([]).incomplete).toBe(false);
  });

  it("scales every number when servings change, and blanks stay blank", () => {
    const [row] = build({ ...rice, fiber: undefined, servings: 1 }, ctx);
    const edited = withServings(row, 2);
    expect(edited).toMatchObject({ calories: 412, fat: 2, carbs: 90, protein: 8, servings: 2 });
    expect(edited.fiber).toBeUndefined();
    expect(withServings(edited, 1)).toMatchObject({ calories: 206, fat: 1, carbs: 45 });
  });

  it("scales a Grams row with its calories when the gram amount changes", () => {
    const carbRow: FoodLogEntry = { id: "o", name: "Oats", timestamp: "2026-11-08T12:00:00Z", mode: "sugar", macroType: "carbs", amount: 30, calories: 150, fat: 3 };
    expect(withGramAmount(carbRow, 60)).toMatchObject({ amount: 60, calories: 300, fat: 6 });
  });

  it("scales calories when a portion count changes in Slices", () => {
    const [row] = build({ name: "Chicken", carbs: 0, protein: 25, calories: 165, fat: 4, sliceType: "protein", sliceCount: 1 }, ctx);
    expect(withSliceCount(row, 2)).toMatchObject({ calories: 330, fat: 8, protein: 50 });
  });

  it("copies numbers unchanged when repeating yesterday, and reloads them intact", () => {
    const rows = build(rice, ctx);
    const copied = rows.map((r, i) => copyEntry(r, `c${i}`, "2026-11-09T12:00:00Z"));
    expect(copied[0]).toMatchObject({ calories: 206, fat: 1, fiber: 1, nutrientSource: "database" });
    const reloaded = JSON.parse(JSON.stringify(copied));
    expect(nutritionFromLog(reloaded)).toEqual(nutritionFromLog(rows));
  });

  it("keeps carb and protein day totals correct for calorie rows, including delete", () => {
    const rows = build(rice, ctx);
    expect(totalsFromFoodLog(rows)).toMatchObject({ carbsConsumed: 45, proteinConsumed: 4 });
    expect(nextTotals({ carbsConsumed: 45, proteinConsumed: 4, foodLog: rows }, [])).toMatchObject({ carbsConsumed: 0, proteinConsumed: 0 });
    expect(nutritionFromLog([])).toMatchObject({ calories: 0 });
  });

  it("reads the same saved entry the same way whichever view it was logged in", () => {
    const rows = build(rice, ctx);
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

  it("treats unknown fat as unknown, and a listed 0 as a real zero", () => {
    expect(isListed(0, false)).toBe(false);
    expect(isListed(0, true)).toBe(true);
    expect(isListed(0, undefined)).toBe(false);
    expect(isListed(4, undefined)).toBe(true);
    const unknown = build({ name: "A", carbs: 20, protein: 2, calories: 100, nutrientSource: "database" }, ctx);
    const zero = build({ name: "B", carbs: 20, protein: 2, calories: 100, fat: 0, nutrientSource: "database" }, ctx);
    expect(nutritionFromLog(unknown)).toMatchObject({ missingFat: 1, incomplete: true });
    expect(incompleteReasons(nutritionFromLog(unknown))).toEqual(["1 food has no fat value"]);
    expect(nutritionFromLog(zero)).toMatchObject({ fat: 0, missingFat: 0, incomplete: false });
  });

  it("scales a barcode with no weight by servings, and a normal one by grams", () => {
    expect(barcodeMultiplier("serving", "1")).toBe(1);
    expect(barcodeMultiplier("serving", "2")).toBe(2);
    expect(barcodeMultiplier("serving", "")).toBe(1);
    expect(barcodeMultiplier("100g", "30")).toBeCloseTo(0.3);
    expect(barcodeMultiplier(undefined, "")).toBe(1);
  });

  it("spots a very old day that has totals but no food entries", () => {
    expect(hasTotalsWithoutEntries({ foodLog: [], carbSlices: 2 })).toBe(true);
    expect(hasTotalsWithoutEntries({ foodLog: [], carbsConsumed: 0 })).toBe(false);
    expect(hasTotalsWithoutEntries({ foodLog: [spar({})], carbSlices: 2 })).toBe(false);
  });
});
