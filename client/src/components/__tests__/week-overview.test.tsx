import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekOverview } from '../dashboard/week-overview';

const day = (i: number, phase: string) => ({
  day: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i],
  date: new Date(2026, 10, 7 + i).toISOString(),
  phase,
  weightTarget: 168 - i,
  water: { amount: '1 gal', type: 'Regular' },
  carbs: { min: 300, max: 450 },
  protein: { min: 100, max: 120 },
  isToday: i === 0,
  isTomorrow: i === 1,
});

describe('WeekOverview', () => {
  it('gives every day its own column, with its phase bar above it, even past 7 days', () => {
    const phases = ['Train', 'Train', 'Load', 'Load', 'Load', 'Cut', 'Cut', 'Compete', 'Recover'];
    const plan = phases.map((p, i) => day(i, p));
    render(<WeekOverview getWeeklyPlan={() => plan} />);

    const buttons = screen.getAllByRole('button').filter(b => /\d+\/\d+/.test(b.textContent || ''));
    expect(buttons).toHaveLength(9);

    const grid = buttons[0].parentElement!;
    expect(grid.style.gridTemplateColumns).toBe('repeat(9, minmax(2.75rem, 1fr))');
    // 9 bar segments + 9 day cards share the same grid, so each bar sits over its day
    expect(grid.children).toHaveLength(18);
  });
});
