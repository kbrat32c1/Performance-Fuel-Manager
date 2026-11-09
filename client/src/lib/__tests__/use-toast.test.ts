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
  it("never drops an error or Undo, however many are waiting", () => {
    let toasts: any[] = [];
    for (const id of ["1", "2", "3", "4", "5", "6"]) toasts = add(toasts, undo(id));
    toasts = add(toasts, { ...error("7"), title: "different" });
    expect(ids(toasts)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });
  it("skips an error that's already showing or waiting", () => {
    const failed = (id: string) => ({ ...error(id), title: "Sync failed", description: "Try again" });
    expect(ids(add([failed("a")], failed("b")))).toEqual(["a"]);
  });
  it("keeps two Undos even when they read the same", () => {
    const removed = (id: string) => ({ ...undo(id), title: "Deleted", description: "Morning removed" });
    expect(ids(add([removed("a")], removed("b")))).toEqual(["a", "b"]);
  });
  it("shows the next one once the first is dismissed", () => {
    const toasts = reducer({ toasts: add([error("a")], plain("b")) }, { type: "DISMISS_TOAST", toastId: "a" }).toasts;
    expect(ids(toasts.filter(t => t.open !== false))).toEqual(["b"]);
  });
});
