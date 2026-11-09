import { describe, it, expect } from "vitest";
import { canStartSheetSwipe, shouldDismissSwipe, swipeIntent } from "../../hooks/use-swipe-to-close";

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

describe("where a sheet swipe can start", () => {
  const build = () => {
    const sheet = document.createElement("div");
    const inner = document.createElement("div");
    sheet.appendChild(inner);
    document.body.appendChild(sheet);
    return { sheet, inner };
  };

  it("starts on the sheet's own content at the top", () => {
    const { sheet, inner } = build();
    expect(canStartSheetSwipe(inner, sheet)).toBe(true);
  });
  it("ignores an overlay portaled outside the sheet", () => {
    const { sheet } = build();
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);
    expect(canStartSheetSwipe(overlay, sheet)).toBe(false);
  });
  it("waits until the content is scrolled to the top", () => {
    const { sheet, inner } = build();
    inner.scrollTop = 40;
    Object.defineProperty(inner, "scrollTop", { value: 40 });
    expect(canStartSheetSwipe(inner, sheet)).toBe(false);
  });
  it("leaves form fields and the time wheel alone", () => {
    const { sheet, inner } = build();
    const input = document.createElement("input");
    const wheel = document.createElement("div");
    wheel.setAttribute("data-no-swipe", "");
    inner.append(input, wheel);
    expect(canStartSheetSwipe(input, sheet)).toBe(false);
    expect(canStartSheetSwipe(wheel, sheet)).toBe(false);
  });
});
