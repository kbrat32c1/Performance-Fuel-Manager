import { describe, it, expect } from "vitest";
import { shouldDismissSwipe } from "../../hooks/use-swipe-to-close";

describe("swipe down to close", () => {
  it("closes after a long drag, however slow", () => expect(shouldDismissSwipe(120, 2000)).toBe(true));
  it("closes on a quick flick", () => expect(shouldDismissSwipe(50, 60)).toBe(true));
  it("stays open for a small slow drag", () => expect(shouldDismissSwipe(40, 800)).toBe(false));
  it("stays open for a tiny flick", () => expect(shouldDismissSwipe(10, 10)).toBe(false));
});
