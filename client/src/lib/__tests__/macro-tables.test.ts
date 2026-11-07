import { describe, expect, it } from 'vitest';
import { baseMacroTargets } from '../store';

// Protein by days until a Saturday weigh-in (5=Mon … 1=Fri), from FGF21 FINAL 13.
const protein = (protocol: string, d: number, w = 175) => baseMacroTargets(protocol, w, d).protein.max;

describe('protocol protein tables match FINAL 13', () => {
  it('Rapid Cut (2): Mon–Tue 0, Wed 25, Thu–Fri 60, Sat 0.5 g/lb, Sun 1.4 g/lb', () => {
    expect([5, 4, 3, 2, 1].map(d => protein('2', d))).toEqual([0, 0, 25, 60, 60]);
    expect(protein('2', 0)).toBe(88);
    expect(protein('2', -1)).toBe(245);
  });

  it('Maintain (3): Mon 25, Tue–Wed 75, Thu–Fri 100', () => {
    expect([5, 4, 3, 2, 1].map(d => protein('3', d))).toEqual([25, 75, 75, 100, 100]);
  });

  it('Gain (4): Mon 100, Tue–Fri 125, Sat 0.8 g/lb, Sun 1.6 g/lb', () => {
    expect([5, 4, 3, 2, 1].map(d => protein('4', d))).toEqual([100, 125, 125, 125, 125]);
    expect(protein('4', 0)).toBe(140);
    expect(protein('4', -1)).toBe(280);
  });
});
