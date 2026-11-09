import { describe, expect, it, vi } from "vitest";
import { makeUndoDelete } from "../undo-deleted-log";

const log = (weight: number, type = "morning") => ({ weight, type, date: "2026-11-09T12:00:00Z" });

describe("undoing a deleted weigh-in", () => {
  it("restores its own reading when two are deleted", () => {
    const addLog = vi.fn();
    const undoFirst = makeUndoDelete({ log: log(170) }, addLog);
    const undoSecond = makeUndoDelete({ log: log(165, "before-bed") }, addLog);
    undoFirst();
    expect(addLog.mock.calls[0][0]).toMatchObject({ weight: 170, type: "morning" });
    undoSecond();
    expect(addLog.mock.calls[1][0]).toMatchObject({ weight: 165, type: "before-bed" });
  });
  it("only restores once", () => {
    const addLog = vi.fn();
    const undo = makeUndoDelete({ log: log(170) }, addLog);
    expect(undo()).toBe(true);
    expect(undo()).toBe(false);
    expect(addLog).toHaveBeenCalledTimes(1);
  });
  it("restores both halves of an extra workout", () => {
    const addLog = vi.fn();
    makeUndoDelete({ log: log(170, "extra-before"), afterLog: log(168, "extra-after") }, addLog)();
    expect(addLog).toHaveBeenCalledTimes(2);
  });
  it("does nothing if the log wasn't found", () => {
    const addLog = vi.fn();
    expect(makeUndoDelete(null, addLog)()).toBe(false);
    expect(addLog).not.toHaveBeenCalled();
  });
});
