import { describe, it, expect } from 'vitest';
import fixtures from './fixtures/trackwrestling-descent.json';
import {
  buildDescentPlan, whatIf, firstOpenDate, rowOn, validateDescentInput, eligibleClass, collapseFlat, type DescentInput,
} from '../descent-plan';

type Fixture = (typeof fixtures.scenarios)[number] & { weighIns: Array<{ date: string; weight: number; allowance: number; counted: boolean; secondDay?: boolean }> };

describe('matches TrackWrestling day for day', () => {
  for (const s of fixtures.scenarios as Fixture[]) {
    it(s.name, () => {
      const input: DescentInput = {
        assessmentDate: s.assessmentDate,
        initialWeight: s.initialWeight,
        minimumWeight: s.minimumWeight,
        weighIns: s.weighIns.map(w => ({ date: w.date, weight: w.weight, allowance: w.allowance, secondDay: w.secondDay })),
      };
      const plan = buildDescentPlan(input, s.through);
      const expected = s.expected.split(',').map(Number);
      const classes = s.classes.split(',').map(Number);

      expect(plan.rows.map(r => Math.round(r.allowed * 100))).toEqual(expected);
      expect(plan.rows.map(r => r.eligibleClass)).toEqual(classes);
      for (const w of s.weighIns) {
        expect(rowOn(plan, w.date)?.weighIn?.counted).toBe(w.counted);
      }
    });
  }
});

describe('reasons a weigh-in does not count', () => {
  const base: DescentInput = { assessmentDate: '2026-09-14', initialWeight: 128, minimumWeight: 114.41, weighIns: [] };
  it('below the line', () => {
    const plan = buildDescentPlan({ ...base, weighIns: [{ date: '2026-10-01', weight: 122, allowance: 0 }] });
    expect(rowOn(plan, '2026-10-01')?.weighIn).toMatchObject({ counted: false, reason: 'below-line' });
  });
  it('day 2 of the same tournament', () => {
    const plan = buildDescentPlan({ ...base, weighIns: [
      { date: '2026-11-13', weight: 124.8, allowance: 0 },
      { date: '2026-11-14', weight: 125.6, allowance: 1, secondDay: true },
    ] });
    expect(rowOn(plan, '2026-11-14')?.weighIn).toMatchObject({ counted: false, reason: 'second-day' });
  });
});

describe('what-if preview', () => {
  const jackson: DescentInput = { assessmentDate: '2026-09-14', initialWeight: 128, minimumWeight: 114.41, weighIns: [] };

  it('a 133.0 weigh-in on Nov 14 closes 125 until Dec 14, matching TrackWrestling', () => {
    const preview = whatIf(jackson, { date: '2026-11-14', weight: 133, allowance: 0 }, '2027-01-10');
    expect(rowOn(preview, '2026-11-15')?.allowed).toBe(132.7);
    expect(rowOn(preview, '2026-11-21')?.allowed).toBe(131.1);
    expect(firstOpenDate(preview, 125, '2026-11-15')).toBe('2026-12-14');
  });

  it('weighing in at 125 keeps 125 open the next day', () => {
    const preview = whatIf(jackson, { date: '2026-11-14', weight: 124.8, allowance: 0 }, '2026-12-31');
    expect(firstOpenDate(preview, 125, '2026-11-15')).toBe('2026-11-15');
  });

  it('never changes the saved plan', () => {
    whatIf(jackson, { date: '2026-11-14', weight: 133, allowance: 0 });
    expect(jackson.weighIns).toEqual([]);
  });
});

describe('collapseFlat', () => {
  const plan = buildDescentPlan({ assessmentDate: '2026-09-14', initialWeight: 128, minimumWeight: 114.41, weighIns: [] }, '2026-12-31');

  it('folds the quiet days at the minimum into one item', () => {
    const items = collapseFlat(plan.rows);
    const runs = items.filter(i => i.kind === 'run');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ from: '2026-11-04', to: '2026-12-31', allowed: 114.41, eligibleClass: 125 });
    expect(items.filter(i => i.kind === 'row')).toHaveLength(51);
  });

  it('keeps chosen days as their own rows', () => {
    const items = collapseFlat(plan.rows, r => r.date === '2026-11-14');
    expect(items.some(i => i.kind === 'row' && i.row.date === '2026-11-14')).toBe(true);
    expect(items.filter(i => i.kind === 'run')).toHaveLength(2);
  });
});

describe('classes and validation', () => {
  it('never opens a class below the minimum class', () => {
    expect(eligibleClass(114.41, 114.41)).toBe(125);
    expect(eligibleClass(132.6, 132.58)).toBe(133);
  });
  it('rejects impossible setups', () => {
    expect(validateDescentInput({ assessmentDate: '2026-09-14', initialWeight: 128, minimumWeight: 130, weighIns: [] })).toMatch(/minimum/);
    expect(validateDescentInput({ assessmentDate: '2026-09-14', initialWeight: 128, minimumWeight: 114.41, weighIns: [{ date: '2026-09-01', weight: 128, allowance: 0 }] })).toMatch(/after the assessment/);
    expect(validateDescentInput({ assessmentDate: '2026-09-14', initialWeight: 128, minimumWeight: 114.41, weighIns: [] })).toBeNull();
  });
});
