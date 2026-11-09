export interface DeletedLog<T extends string = string> {
  weight: number;
  date: Date | string;
  type: T;
  duration?: number;
  sleepHours?: number;
}

type AddLog<T extends string> = (log: { weight: number; date: Date; type: T; duration?: number; sleepHours?: number }) => Promise<string | null>;

/**
 * An Undo for one deletion. It holds its own copy of what was deleted, so two Undos waiting
 * in line can't restore each other's weigh-in. It reports whether the save really worked,
 * and if it didn't, can be tried again without restoring anything twice.
 *
 * It waits for the delete to finish first. Otherwise, on a slow connection, the restored row
 * could be removed by the delete that's still on its way. If the delete failed, the weigh-in
 * was never removed, so there's nothing to restore.
 */
export function makeUndoDelete<T extends string>(deleted: { log: DeletedLog<T>; afterLog?: DeletedLog<T> } | null, addLog: AddLog<T>, deletion: Promise<boolean> = Promise.resolve(true)): () => Promise<boolean> {
  let pending = deleted ? [deleted.log, ...(deleted.afterLog ? [deleted.afterLog] : [])] : [];
  let running = false;
  return async () => {
    if (running || pending.length === 0) return false;
    running = true;
    try {
      if (!(await deletion)) {
        pending = [];
        return true;
      }
      while (pending.length > 0) {
        const log = pending[0];
        const saved = await addLog({ weight: log.weight, date: new Date(log.date), type: log.type, duration: log.duration, sleepHours: log.sleepHours });
        if (saved === null) return false;
        pending = pending.slice(1);
      }
      return true;
    } finally {
      running = false;
    }
  };
}
