/**
 * Which weigh-in comes next today. The + button, the Today button and the highlighted
 * slot all read this, so they can't disagree.
 */
import { STORAGE_KEYS } from "@/lib/storage-keys";

export type LogTypeOption = 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'extra-workout' | 'check-in' | 'weigh-in';
export type CoreWeighIn = 'morning' | 'pre-practice' | 'post-practice' | 'before-bed';

export const CORE_TYPES: CoreWeighIn[] = ['morning', 'pre-practice', 'post-practice', 'before-bed'];

export function getTimeBasedType(hour = new Date().getHours()): CoreWeighIn {
  if (hour >= 5 && hour < 14) return 'morning';     // 5am–2pm: morning weigh-in
  if (hour >= 14 && hour < 16) return 'pre-practice'; // 2pm–4pm: heading to practice
  if (hour >= 16 && hour < 19) return 'post-practice'; // 4pm–7pm: practice wrapping up
  return 'before-bed';                                  // 7pm+: wind down
}

export function getDefaultType(loggedTypes?: Set<string>, hour = new Date().getHours()): LogTypeOption {
  // First check if user has a stored preference from today
  try {
    const storedType = localStorage.getItem(STORAGE_KEYS.LAST_WEIGHT_TYPE) as CoreWeighIn | null;
    const storedDate = localStorage.getItem(STORAGE_KEYS.LAST_WEIGHT_TYPE_DATE);
    const today = new Date().toDateString();

    // If user overrode the suggestion today, use their preference
    if (storedType && storedDate === today && CORE_TYPES.includes(storedType)) {
      // But only if they haven't already logged this type today
      if (!loggedTypes?.has(storedType)) {
        return storedType;
      }
    }
  } catch {
    // localStorage not available, fall through to time-based
  }

  // Check for next unlogged type in order
  if (loggedTypes) {
    const timeBased = getTimeBasedType(hour);
    const hasExtraWorkout = loggedTypes.has('extra-workout');

    // Start at the slot for the current time of day, so a 4:30 PM log isn't
    // offered as "Morning" just because the morning weigh-in was skipped.
    const fromNow = CORE_TYPES.indexOf(timeBased);
    const ordered = fromNow > 0 ? [...CORE_TYPES.slice(fromNow), ...CORE_TYPES.slice(0, fromNow)] : CORE_TYPES;
    for (const t of ordered) {
      if (loggedTypes.has(t)) continue;

      // If user logged an extra workout but skipped regular practice,
      // don't suggest pre/post-practice if it's already past that time window.
      // They clearly chose an extra workout instead of regular practice today.
      if (hasExtraWorkout && !loggedTypes.has('pre-practice') && !loggedTypes.has('post-practice')) {
        if (t === 'pre-practice' && (timeBased === 'post-practice' || timeBased === 'before-bed')) continue;
        if (t === 'post-practice' && timeBased === 'before-bed') continue;
      }

      return t;
    }
  }

  // Fall back to time-based default
  return getTimeBasedType(hour);
}

/** On a day with no practice, the practice weigh-ins count as done, unless one was logged anyway. */
export function effectiveLoggedTypes(loggedTypes: Set<string>, skipPractice: boolean): Set<string> {
  if (!skipPractice || loggedTypes.has('pre-practice') || loggedTypes.has('post-practice')) return loggedTypes;
  return new Set([...Array.from(loggedTypes), 'pre-practice', 'post-practice']);
}

/** The next weigh-in to ask for today. Null once they're all in. */
export function nextWeighIn(loggedTypes: Set<string>, skipPractice: boolean, hour = new Date().getHours()): CoreWeighIn | null {
  const effective = effectiveLoggedTypes(loggedTypes, skipPractice);
  if (CORE_TYPES.every(t => effective.has(t))) return null;
  const next = getDefaultType(effective, hour);
  return CORE_TYPES.includes(next as CoreWeighIn) && !effective.has(next) ? (next as CoreWeighIn) : null;
}

const STEP_LABEL: Record<CoreWeighIn, string> = {
  morning: 'Log morning weight',
  'pre-practice': 'Log pre-practice weight',
  'post-practice': 'Log post-practice weight',
  'before-bed': 'Log before-bed weight',
};

export function nextStepLabel(type: CoreWeighIn): string {
  return STEP_LABEL[type];
}
