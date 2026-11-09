export interface DeletedLog<T extends string = string> {
  weight: number;
  date: Date | string;
  type: T;
  duration?: number;
  sleepHours?: number;
}

type AddLog<T extends string> = (log: { weight: number; date: Date; type: T; duration?: number; sleepHours?: number }) => Promise<string | null>;

export interface DeletedReading<T extends string = string> {
  log: DeletedLog<T>;
  /** Resolves true once this reading is really gone, false if its delete failed. */
  deletion: Promise<boolean>;
}

/**
 * An Undo for one delete action, which can cover a before-and-after pair. It holds its own
 * copy of what was deleted, so two Undos waiting in line can't restore each other's weigh-in.
 *
 * It waits for every delete to finish, then restores only the readings actually removed:
 * on a slow connection a restored row could otherwise be taken out by a delete still on its
 * way, and a reading whose delete failed is still there. It reports whether the saves really
 * worked, and if they didn't, can be tried again without restoring anything twice.
 */
export function makeUndoDelete<T extends string>(readings: DeletedReading<T>[], addLog: AddLog<T>): () => Promise<boolean> {
  let pending: DeletedLog<T>[] | null = null;
  let finished = readings.length === 0;
  let running = false;
  return async () => {
    if (running || finished) return false;
    running = true;
    try {
      if (pending === null) {
        const removed = await Promise.all(readings.map(r => r.deletion));
        pending = readings.filter((_, i) => removed[i]).map(r => r.log);
      }
      while (pending.length > 0) {
        const log = pending[0];
        const saved = await addLog({ weight: log.weight, date: new Date(log.date), type: log.type, duration: log.duration, sleepHours: log.sleepHours });
        if (saved === null) return false;
        pending = pending.slice(1);
      }
      finished = true;
      return true;
    } finally {
      running = false;
    }
  };
}
