import { describe, it, expect, beforeEach } from 'vitest';
import { takeWizardSnapshot, readWizardSnapshot, clearWizardSnapshot } from '../wizard-snapshot';
import { defaultProfile, type AthleteProfile } from '../stores/types';

const profile = (overrides: Partial<AthleteProfile> = {}): AthleteProfile => ({
  ...defaultProfile,
  name: 'Sam',
  lastName: 'Rivera',
  currentWeight: 162,
  protocol: '3',
  targetWeightClass: 157,
  weighInDate: new Date(2026, 10, 14, 12, 0, 0),
  weighInTime: '07:00',
  goalIntensity: undefined,
  ...overrides,
});

beforeEach(() => {
  sessionStorage.clear();
});

describe('wizard snapshot', () => {
  it('restores the protocol and other wizard fields to their values before the run', () => {
    takeWizardSnapshot(profile());
    const restored = readWizardSnapshot()!;
    expect(restored.protocol).toBe('3');
    expect(restored.targetWeightClass).toBe(157);
    expect(restored.currentWeight).toBe(162);
    expect(restored.name).toBe('Sam');
  });

  it('brings weigh-in dates back as Date objects at the same moment', () => {
    const original = profile();
    takeWizardSnapshot(original);
    const restored = readWizardSnapshot()!;
    expect(restored.weighInDate).toBeInstanceOf(Date);
    expect((restored.weighInDate as Date).getTime()).toBe((original.weighInDate as Date).getTime());
  });

  it('clears fields the wizard filled in that were empty before', () => {
    takeWizardSnapshot(profile({ goalIntensity: undefined, sparGoal: undefined }));
    const restored = readWizardSnapshot()!;
    expect('goalIntensity' in restored).toBe(true);
    expect(restored.goalIntensity).toBeUndefined();
    expect(restored.sparGoal).toBeUndefined();
  });

  it('keeps the first snapshot if the wizard page reloads mid-run', () => {
    takeWizardSnapshot(profile({ protocol: '3' }));
    takeWizardSnapshot(profile({ protocol: '1' })); // profile already edited by the wizard
    expect(readWizardSnapshot()!.protocol).toBe('3');
  });

  it('only touches wizard fields', () => {
    takeWizardSnapshot(profile({ hasCompletedOnboarding: true, sparV2: true }));
    const restored = readWizardSnapshot()! as Record<string, unknown>;
    expect('hasCompletedOnboarding' in restored).toBe(false);
    expect('sparV2' in restored).toBe(false);
  });

  it('returns nothing once cleared', () => {
    takeWizardSnapshot(profile());
    clearWizardSnapshot();
    expect(readWizardSnapshot()).toBeNull();
  });
});
