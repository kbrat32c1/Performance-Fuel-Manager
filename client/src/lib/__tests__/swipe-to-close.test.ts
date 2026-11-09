import { describe, it, expect } from "vitest";
import { shouldDismissSwipe, swipeIntent } from "../../hooks/use-swipe-to-close";

describe("swipe down to close", () => {
  it("closes after a long drag, however slow", () => expect(shouldDismissSwipe(120, 2000)).toBe(true));
  it("closes on a quick flick", () => expect(shouldDismissSwipe(50, 60)).toBe(true));
  it("stays open for a small slow drag", () => expect(shouldDismissSwipe(40, 800)).toBe(false));
  it("stays open for a tiny flick", () => expect(shouldDismissSwipe(10, 10)).toBe(false));
});

describe("swiping anywhere on a sheet", () => {
  it("waits until the finger has really moved", () => expect(swipeIntent(3, 5)).toBe("wait"));
  it("takes a pull down", () => expect(swipeIntent(4, 20)).toBe("drag"));
  it("leaves scrolling up and sideways drags alone", () => {
    expect(swipeIntent(0, -20)).toBe("cancel");
    expect(swipeIntent(30, 12)).toBe("cancel");
  });
});
