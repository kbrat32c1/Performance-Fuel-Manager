import type { AthleteProfile } from './stores/types';

/**
 * The setup wizard saves each choice to the profile as it is made. When an athlete
 * re-runs it from Settings, these are the fields it can change; a snapshot taken on
 * entry lets Cancel put them back exactly as they were.
 */
export const WIZARD_EDITABLE_FIELDS = [
  'name', 'lastName', 'currentWeight', 'protocol', 'targetWeightClass',
  'weighInDate', 'weighInTime', 'heightInches', 'age', 'gender',
  'trainingSessions', 'workdayActivity', 'sparGoal', 'goalIntensity',
  'maintainPriority', 'goalWeightLbs',
] as const satisfies readonly (keyof AthleteProfile)[];

const SNAPSHOT_KEY = 'pwm-wizard-profile-snapshot';

type WizardSnapshot = Partial<Pick<AthleteProfile, typeof WIZARD_EDITABLE_FIELDS[number]>>;

/** Record the wizard-editable fields once per wizard run (a reload keeps the original). */
export function takeWizardSnapshot(profile: AthleteProfile): void {
  try {
    if (sessionStorage.getItem(SNAPSHOT_KEY)) return;
    const snapshot: Record<string, unknown> = {};
    for (const field of WIZARD_EDITABLE_FIELDS) {
      const value = profile[field];
      // null keeps "was empty" through JSON so restoring clears values the wizard added
      snapshot[field] = value instanceof Date ? value.toISOString() : value ?? null;
    }
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {}
}

/** The profile values from before the wizard run, ready to pass to updateProfile. */
export function readWizardSnapshot(): WizardSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const restored: Record<string, unknown> = {};
    for (const field of WIZARD_EDITABLE_FIELDS) {
      if (!(field in parsed)) continue;
      const value = parsed[field];
      if (field === 'weighInDate') {
        if (typeof value === 'string') restored[field] = new Date(value);
        continue;
      }
      restored[field] = value === null ? undefined : value;
    }
    return restored as WizardSnapshot;
  } catch {
    return null;
  }
}

export function clearWizardSnapshot(): void {
  try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch {}
}
