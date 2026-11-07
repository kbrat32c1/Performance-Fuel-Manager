import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import type { DescentInput } from '@/lib/descent-plan';

const hook = vi.hoisted(() => ({
  plan: null as DescentInput | null,
  status: 'ready' as 'ready' | 'unavailable' | 'loading',
  save: vi.fn(),
}));

vi.mock('@/hooks/use-descent-plan', () => ({ useDescentPlan: () => hook }));
vi.mock('@/lib/store', () => ({
  useStore: () => ({
    profile: { simulatedDate: new Date(2026, 10, 7, 12) },
    logs: [{ id: 'm', type: 'morning', weight: 118.6, date: new Date(2026, 10, 7, 6) }],
  }),
}));
vi.mock('@/components/mobile-layout', () => ({
  MobileLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import Descent from '../descent';

// Made-up wrestler with Jackson-like numbers
const plan: DescentInput = { assessmentDate: '2026-09-14', initialWeight: 128, minimumWeight: 114.41, weighIns: [] };

beforeEach(() => {
  hook.plan = { ...plan, weighIns: [] };
  hook.status = 'ready';
  hook.save.mockReset().mockResolvedValue(null);
});

describe('Descent plan page', () => {
  it('asks for the certification numbers when there is no plan', async () => {
    hook.plan = null;
    render(<Descent />);
    fireEvent.change(screen.getByLabelText('Assessment date'), { target: { value: '2026-09-14' } });
    fireEvent.change(screen.getByLabelText('Initial weight (lb)'), { target: { value: '128' } });
    fireEvent.change(screen.getByLabelText('Minimum weight (lb)'), { target: { value: '114.41' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(hook.save).toHaveBeenCalledWith({ assessmentDate: '2026-09-14', initialWeight: 128, minimumWeight: 114.41, weighIns: [] });
  });

  it('shows today as facts: lowest allowed weight, lightest class, and the morning weight against the line', () => {
    render(<Descent />);
    const today = within(screen.getByRole('region', { name: 'Today' }));
    expect(today.getByText('114.41 lb')).toBeInTheDocument();
    expect(today.getByText('125')).toBeInTheDocument();
    expect(screen.getByText(/This morning 118.6 lb · 4.19 above the line/)).toBeInTheDocument();
  });

  function openRow(label: string) {
    fireEvent.click(screen.getByRole('button', { name: label }));
  }

  it('previews a weigh-in typed into a date row without saving, matching TrackWrestling', () => {
    render(<Descent />);
    openRow('Sat, Nov 14');
    fireEvent.change(screen.getByLabelText('Weight (lb)'), { target: { value: '133.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(preview).toHaveTextContent('next day 132.70 (class 133)');
    expect(preview).toHaveTextContent('125 opens again Mon, Dec 14');
    expect(hook.save).not.toHaveBeenCalled();
  });

  it('only offers previews for future dates', () => {
    render(<Descent />);
    openRow('Sat, Nov 14');
    expect(screen.queryByRole('button', { name: 'Save as official' })).toBeNull();
    expect(screen.getByText(/Future dates are previews only/)).toBeInTheDocument();
  });

  it('saves an official weigh-in only after confirming', async () => {
    render(<Descent />);
    openRow('Fri, Nov 6');
    fireEvent.change(screen.getByLabelText('Weight (lb)'), { target: { value: '124.8' } });
    fireEvent.change(screen.getByLabelText('Allowance'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as official' }));
    expect(hook.save).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Confirm official weigh-in' })).toHaveTextContent('124.80 lb (+1) on Fri, Nov 6');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save official' })); });
    expect(hook.save).toHaveBeenCalledWith({ ...plan, weighIns: [{ date: '2026-11-06', weight: 124.8, allowance: 1, secondDay: false }] });
  });

  it('only asks about day 2 of a tournament when the day before has a weigh-in', () => {
    hook.plan = { ...plan, weighIns: [{ date: '2026-11-05', weight: 124.8, allowance: 0 }] };
    render(<Descent />);
    openRow('Fri, Nov 6');
    expect(screen.getByLabelText(/Day 2 of the same tournament/)).toBeInTheDocument();
    openRow('Fri, Nov 6');
    openRow('Mon, Nov 2');
    expect(screen.queryByLabelText(/Day 2 of the same tournament/)).toBeNull();
  });

  it('says why a previewed weigh-in would not count', () => {
    render(<Descent />);
    openRow('Fri, Nov 6');
    fireEvent.change(screen.getByLabelText('Weight (lb)'), { target: { value: '110' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveTextContent('would not count (below the');
  });

  it('asks before removing an official weigh-in', async () => {
    hook.plan = { ...plan, weighIns: [{ date: '2026-11-06', weight: 124.8, allowance: 0 }] };
    render(<Descent />);
    openRow('Fri, Nov 6');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(hook.save).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirm removal' })).getByRole('button', { name: 'Remove' }));
    });
    expect(hook.save).toHaveBeenCalledWith({ ...plan, weighIns: [] });
  });

  it('explains when the database table is missing', () => {
    hook.status = 'unavailable';
    render(<Descent />);
    expect(screen.getByText(/one-time database update/)).toBeInTheDocument();
  });
});
