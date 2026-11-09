import { describe, expect, it } from "vitest";
import { reducer } from "@/hooks/use-toast";

describe("toasts", () => {
  const plain = (id: string) => ({ id, title: id, open: true });
  const error = (id: string) => ({ id, title: id, open: true, variant: "destructive" as const });
  const undo = (id: string) => ({ id, title: id, open: true, action: {} as never });
  const add = (toasts: any[], toast: any) => reducer({ toasts }, { type: "ADD_TOAST", toast }).toasts;
  const ids = (toasts: { id: string }[]) => toasts.map(t => t.id);

  it("replaces one plain message with the next", () => {
    expect(ids(add([plain("saved")], plain("synced")))).toEqual(["synced"]);
  });
  it("never lets a plain message replace an error", () => {
    expect(ids(add([error("failed")], plain("saved")))).toEqual(["failed", "saved"]);
  });
  it("never lets a plain message replace an Undo", () => {
    expect(ids(add([undo("removed")], plain("saved")))).toEqual(["removed", "saved"]);
  });
  it("shows an error right away over a plain message", () => {
    expect(ids(add([plain("saved")], error("failed")))).toEqual(["failed"]);
  });
  it("keeps every error in line", () => {
    expect(ids(add(add([error("a")], error("b")), error("c")))).toEqual(["a", "b", "c"]);
  });
  it("only keeps the newest plain message waiting", () => {
    expect(ids(add(add([error("a")], plain("b")), plain("c")))).toEqual(["a", "c"]);
  });
  it("shows the next one once the first is dismissed", () => {
    const toasts = reducer({ toasts: add([error("a")], plain("b")) }, { type: "DISMISS_TOAST", toastId: "a" }).toasts;
    expect(ids(toasts.filter(t => t.open !== false))).toEqual(["b"]);
  });
});
