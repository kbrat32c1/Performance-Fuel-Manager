import { describe, expect, it, vi } from "vitest";
import { makeUndoDelete } from "../undo-deleted-log";

const log = (weight: number, type = "morning") => ({ weight, type, date: "2026-11-09T12:00:00Z" });

describe("undoing a deleted weigh-in", () => {
  const saves = () => vi.fn(async () => "saved-id" as string | null);

  it("restores its own reading when two are deleted", async () => {
    const addLog = saves();
    const undoFirst = makeUndoDelete({ log: log(170) }, addLog);
    const undoSecond = makeUndoDelete({ log: log(165, "before-bed") }, addLog);
    await undoFirst();
    expect(addLog.mock.calls[0][0 as never]).toMatchObject({ weight: 170, type: "morning" });
    await undoSecond();
    expect(addLog.mock.calls[1][0 as never]).toMatchObject({ weight: 165, type: "before-bed" });
  });
  it("only restores once", async () => {
    const addLog = saves();
    const undo = makeUndoDelete({ log: log(170) }, addLog);
    expect(await undo()).toBe(true);
    expect(await undo()).toBe(false);
    expect(addLog).toHaveBeenCalledTimes(1);
  });
  it("restores both halves of an extra workout", async () => {
    const addLog = saves();
    expect(await makeUndoDelete({ log: log(170, "extra-before"), afterLog: log(168, "extra-after") }, addLog)()).toBe(true);
    expect(addLog).toHaveBeenCalledTimes(2);
  });
  it("does nothing if the log wasn't found", async () => {
    const addLog = saves();
    expect(await makeUndoDelete(null, addLog)()).toBe(false);
    expect(addLog).not.toHaveBeenCalled();
  });
  it("reports a failed save, and can be tried again", async () => {
    const addLog = vi.fn(async () => "id" as string | null).mockResolvedValueOnce(null);
    const undo = makeUndoDelete({ log: log(170) }, addLog);
    expect(await undo()).toBe(false);
    expect(await undo()).toBe(true);
    expect(addLog).toHaveBeenCalledTimes(2);
  });
  it("retries only the half that didn't save", async () => {
    const addLog = vi.fn(async () => "id" as string | null).mockResolvedValueOnce("id").mockResolvedValueOnce(null);
    const undo = makeUndoDelete({ log: log(170, "extra-before"), afterLog: log(168, "extra-after") }, addLog);
    expect(await undo()).toBe(false);
    expect(await undo()).toBe(true);
    expect(addLog).toHaveBeenCalledTimes(3);
    expect((addLog.mock.calls[2] as any)[0]).toMatchObject({ weight: 168 });
  });
  it("waits for the delete to finish before restoring", async () => {
    const addLog = saves();
    let finishDelete: (ok: boolean) => void = () => {};
    const deletion = new Promise<boolean>(r => { finishDelete = r; });
    const undo = makeUndoDelete({ log: log(170) }, addLog, deletion);
    const result = undo();
    await Promise.resolve();
    expect(addLog).not.toHaveBeenCalled();
    finishDelete(true);
    expect(await result).toBe(true);
    expect(addLog).toHaveBeenCalledTimes(1);
  });
  it("doesn't add a second copy when the delete failed", async () => {
    const addLog = saves();
    expect(await makeUndoDelete({ log: log(170) }, addLog, Promise.resolve(false))()).toBe(true);
    expect(addLog).not.toHaveBeenCalled();
  });
  it("ignores a double tap while saving", async () => {
    const addLog = saves();
    const undo = makeUndoDelete({ log: log(170) }, addLog);
    await Promise.all([undo(), undo()]);
    expect(addLog).toHaveBeenCalledTimes(1);
  });
});
