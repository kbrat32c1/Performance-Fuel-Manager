import { describe, expect, it } from "vitest";
import { shouldAutoStartTour } from "../tour";

describe("shouldAutoStartTour", () => {
  it("shows for a new account", () => expect(shouldAutoStartTour(false, 0)).toBe(true));
  it("doesn't show again once seen", () => expect(shouldAutoStartTour(true, 0)).toBe(false));
  it("doesn't show to an existing athlete on a new browser", () => expect(shouldAutoStartTour(false, 30)).toBe(false));
});
