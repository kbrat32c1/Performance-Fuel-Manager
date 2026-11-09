export interface DeletedLog {
  weight: number;
  date: Date | string;
  type: string;
  duration?: number;
  sleepHours?: number;
}

type AddLog = (log: { weight: number; date: Date; type: string; duration?: number; sleepHours?: number }) => void;

/**
 * An Undo for one deletion. It holds its own copy of what was deleted, so two Undos
 * waiting in line can't restore each other's weigh-in, and it only works once.
 */
export function makeUndoDelete(deleted: { log: DeletedLog; afterLog?: DeletedLog } | null, addLog: AddLog): () => boolean {
  let pending = deleted;
  return () => {
    if (!pending) return false;
    const { log, afterLog } = pending;
    pending = null;
    addLog({ weight: log.weight, date: new Date(log.date), type: log.type, duration: log.duration, sleepHours: log.sleepHours });
    if (afterLog) {
      addLog({ weight: afterLog.weight, date: new Date(afterLog.date), type: afterLog.type, duration: afterLog.duration });
    }
    return true;
  };
}
