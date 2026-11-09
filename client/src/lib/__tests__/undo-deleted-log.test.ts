import { describe, expect, it, vi } from "vitest";
import { makeUndoDelete } from "../undo-deleted-log";

const log = (weight: number, type = "morning") => ({ weight, type, date: "2026-11-09T12:00:00Z" });

const gone = Promise.resolve(true);
const kept = Promise.resolve(false);

describe("undoing a deleted weigh-in", () => {
  const saves = () => vi.fn(async () => "saved-id" as string | null);
  const saved = (addLog: ReturnType<typeof saves>) => addLog.mock.calls.map(c => (c as any)[0].weight);

  it("restores its own reading when two are deleted", async () => {
    const addLog = saves();
    const undoFirst = makeUndoDelete([{ log: log(170), deletion: gone }], addLog);
    const undoSecond = makeUndoDelete([{ log: log(165, "before-bed"), deletion: gone }], addLog);
    await undoFirst();
    await undoSecond();
    expect(saved(addLog)).toEqual([170, 165]);
  });
  it("only restores once", async () => {
    const addLog = saves();
    const undo = makeUndoDelete([{ log: log(170), deletion: gone }], addLog);
    expect(await undo()).toBe(true);
    expect(await undo()).toBe(false);
    expect(addLog).toHaveBeenCalledTimes(1);
  });
  it("restores both halves of a pair", async () => {
    const addLog = saves();
    await makeUndoDelete([{ log: log(170, "extra-before"), deletion: gone }, { log: log(168, "extra-after"), deletion: gone }], addLog)();
    expect(saved(addLog)).toEqual([170, 168]);
  });
  it("does nothing if the log wasn't found", async () => {
    const addLog = saves();
    expect(await makeUndoDelete([], addLog)()).toBe(false);
    expect(addLog).not.toHaveBeenCalled();
  });
  it("reports a failed save, and can be tried again", async () => {
    const addLog = saves().mockResolvedValueOnce(null);
    const undo = makeUndoDelete([{ log: log(170), deletion: gone }], addLog);
    expect(await undo()).toBe(false);
    expect(await undo()).toBe(true);
    expect(addLog).toHaveBeenCalledTimes(2);
  });
  it("retries only the half that didn't save", async () => {
    const addLog = saves().mockResolvedValueOnce("id").mockResolvedValueOnce(null);
    const undo = makeUndoDelete([{ log: log(170, "extra-before"), deletion: gone }, { log: log(168, "extra-after"), deletion: gone }], addLog);
    expect(await undo()).toBe(false);
    expect(await undo()).toBe(true);
    expect(saved(addLog)).toEqual([170, 168, 168]);
  });
  it("ignores a double tap while saving", async () => {
    const addLog = saves();
    const undo = makeUndoDelete([{ log: log(170), deletion: gone }], addLog);
    await Promise.all([undo(), undo()]);
    expect(addLog).toHaveBeenCalledTimes(1);
  });
  it("waits for the delete to finish before restoring", async () => {
    const addLog = saves();
    let finishDelete: (ok: boolean) => void = () => {};
    const deletion = new Promise<boolean>(r => { finishDelete = r; });
    const result = makeUndoDelete([{ log: log(170), deletion }], addLog)();
    await Promise.resolve();
    expect(addLog).not.toHaveBeenCalled();
    finishDelete(true);
    expect(await result).toBe(true);
    expect(addLog).toHaveBeenCalledTimes(1);
  });
  it("doesn't add a second copy when the delete failed", async () => {
    const addLog = saves();
    expect(await makeUndoDelete([{ log: log(170), deletion: kept }], addLog)()).toBe(true);
    expect(addLog).not.toHaveBeenCalled();
  });
  it("restores only the half actually deleted, in either order", async () => {
    const before = { log: log(170, "extra-before") };
    const after = { log: log(168, "extra-after") };
    let addLog = saves();
    await makeUndoDelete([{ ...before, deletion: gone }, { ...after, deletion: kept }], addLog)();
    expect(saved(addLog)).toEqual([170]);
    addLog = saves();
    await makeUndoDelete([{ ...before, deletion: kept }, { ...after, deletion: gone }], addLog)();
    expect(saved(addLog)).toEqual([168]);
  });
});
