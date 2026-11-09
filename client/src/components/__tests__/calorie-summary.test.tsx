import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalorieSummary } from "../calorie-summary";
import { nutritionFromLog } from "@/lib/food-totals";
import type { FoodLogEntry } from "@/lib/stores/types";

const entry = (over: Partial<FoodLogEntry>): FoodLogEntry =>
  ({ id: "a", name: "food", timestamp: "2026-11-08T12:00:00Z", mode: "spar", ...over });

describe("CalorieSummary", () => {
  it("says incomplete and names the portions left out", () => {
    const log = [
      entry({ calories: 206, fat: 1, nutrientSource: "database" }),
      entry({ id: "b", sliceType: "carb", sliceCount: 3, nutrientSource: "portion" }),
    ];
    render(<CalorieSummary nutrition={nutritionFromLog(log)} />);
    expect(screen.getByText("206 cal")).toBeInTheDocument();
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(screen.getByText(/3 portions not included in calorie total/)).toBeInTheDocument();
  });

  it("shows no goal, and no incomplete label on a full day", () => {
    render(<CalorieSummary nutrition={nutritionFromLog([entry({ calories: 500, fat: 10 })])} />);
    expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
    expect(screen.queryByText(/Goal/)).not.toBeInTheDocument();
  });

  it("marks a very old day with totals but no entries as incomplete", () => {
    render(<CalorieSummary nutrition={nutritionFromLog([])} hasTotalsWithoutEntries />);
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
  });
});
