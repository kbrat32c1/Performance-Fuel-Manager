import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { format } from "date-fns";
import type { ReactNode } from "react";
import Reports from "../reports";

const store = vi.hoisted(() => ({ day: {} as Record<string, unknown>, preference: "sugar" }));

vi.mock("@/lib/store", () => ({
  inferMealSection: () => "lunch",
  useStore: () => ({
    profile: { simulatedDate: null, nutritionPreference: store.preference },
    isLoading: false,
    getDailyTracking: (date: string) => (date === format(new Date(), "yyyy-MM-dd") ? store.day : { foodLog: [] }),
    getMacroTargets: () => ({ carbs: { min: 0, max: 300 }, protein: { min: 0, max: 150 } }),
    getSliceTargets: () => ({ isV2: true, totalCalories: 2400, fatGrams: 70, protein: 5, carb: 6, veg: 2, fruit: 2, fat: 3 }),
    getHydrationTarget: () => ({ targetOz: 100 }),
    getNutritionMode: () => "sugar",
  }),
}));
vi.mock("@/components/mobile-layout", () => ({ MobileLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/back-to-today", () => ({ BackToToday: () => null }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const entry = (over: object) => ({ id: "a", name: "food", timestamp: new Date().toISOString(), mode: "spar", ...over });

describe("Reports in the Calories diary", () => {
  beforeEach(() => { store.day = { foodLog: [] }; });

  it("says no data only when the week is truly empty", () => {
    render(<Reports />);
    expect(screen.getByText("No Data This Week")).toBeInTheDocument();
  });

  it("shows incomplete, not no data, when only portions exist", () => {
    store.day = { foodLog: [entry({ sliceType: "carb", sliceCount: 3, nutrientSource: "portion" })] };
    render(<Reports />);
    expect(screen.queryByText("No Data This Week")).not.toBeInTheDocument();
    expect(screen.getByText(/Incomplete/)).toBeInTheDocument();
    expect(screen.getByText("Not tracked")).toBeInTheDocument();
  });

  it("shows incomplete when an older entry sits next to tracked food", () => {
    store.day = { foodLog: [entry({ calories: 500, fat: 10 }), entry({ id: "b", sliceType: "protein", sliceCount: 1, gramAmount: 25 })] };
    render(<Reports />);
    expect(screen.getByText(/Incomplete/)).toBeInTheDocument();
  });

  it("shows incomplete for an old day with totals but no entries", () => {
    store.day = { foodLog: [], carbSlices: 2 };
    render(<Reports />);
    expect(screen.queryByText("No Data This Week")).not.toBeInTheDocument();
    expect(screen.getByText(/Incomplete/)).toBeInTheDocument();
  });

  it("shows incomplete when a counted food has no fat value, like the diary", () => {
    store.day = { foodLog: [entry({ calories: 500 })] };
    render(<Reports />);
    expect(screen.getByText(/Incomplete/)).toBeInTheDocument();
  });

  it("Hydration's empty state depends on water, not food", () => {
    store.day = { foodLog: [entry({ sliceType: "carb", sliceCount: 3, nutrientSource: "portion" })] };
    render(<Reports />);
    fireEvent.click(screen.getByRole("button", { name: "Hydration" }));
    expect(screen.getByText("No Data This Week")).toBeInTheDocument();
  });

  it("never shows a calorie goal, even on a SPAR plan", () => {
    store.day = { foodLog: [entry({ calories: 500, fat: 10 })] };
    render(<Reports />);
    expect(screen.queryByText(/Goal:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Incomplete/)).not.toBeInTheDocument();
  });
});
