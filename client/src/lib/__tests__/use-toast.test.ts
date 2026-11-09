import { describe, expect, it } from "vitest";
import { reducer } from "@/hooks/use-toast";

describe("toasts", () => {
  it("shows only the newest", () => {
    const first = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: { id: "1", title: "Saved", open: true } });
    const second = reducer(first, { type: "ADD_TOAST", toast: { id: "2", title: "Synced", open: true } });
    expect(second.toasts.map(t => t.id)).toEqual(["2"]);
  });
});
