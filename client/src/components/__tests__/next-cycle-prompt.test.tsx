import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DescentInput } from '@/lib/descent-plan';

const descent = vi.hoisted(() => ({
  plan: null as DescentInput | null,
  save: vi.fn(async (_next: unknown) => null as string | null),
}));

vi.mock('@/hooks/use-descent-plan', () => ({
  useDescentPlan: () => ({ plan: descent.plan, status: 'ready', save: descent.save }),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { NextCyclePrompt } from '../dashboard/next-cycle-prompt';

const noon = (offsetDays: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays, 12, 0, 0);
};
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const baseProfile = (weighInDate: Date, extra: Record<string, unknown> = {}) => ({
  weighInDate, targetWeightClass: 125, protocol: '3', currentWeight: 128, ...extra,
});

describe('NextCyclePrompt', () => {
  beforeEach(() => {
    descent.plan = null;
    descent.save.mockClear();
  });

  it('stays hidden before the weigh-in has passed', () => {
    const { container } = render(
      <NextCyclePrompt profile={baseProfile(noon(0))} updateProfile={vi.fn()} daysUntilWeighIn={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('comes back for a new weigh-in after being finished for an earlier one', () => {
    const lastWeek = noon(-7);
    const yesterday = noon(-1);
    const { container, rerender } = render(
      <NextCyclePrompt profile={baseProfile(lastWeek, { nextCyclePromptDismissed: key(lastWeek) })} updateProfile={vi.fn()} daysUntilWeighIn={-7} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <NextCyclePrompt profile={baseProfile(yesterday, { nextCyclePromptDismissed: key(lastWeek) })} updateProfile={vi.fn()} daysUntilWeighIn={-1} />,
    );
    expect(screen.getByText(/next weigh-in/i)).toBeInTheDocument();
  });

  it('still shows for athletes whose browser holds the old one-time flag', () => {
    render(
      <NextCyclePrompt profile={baseProfile(noon(-1), { nextCyclePromptDismissed: true })} updateProfile={vi.fn()} daysUntilWeighIn={-1} />,
    );
    expect(screen.getByText(/next weigh-in/i)).toBeInTheDocument();
  });

  it('offers day 2 the morning after day 1 and moves the weigh-in to today', () => {
    const updateProfile = vi.fn();
    render(<NextCyclePrompt profile={baseProfile(noon(-1))} updateProfile={updateProfile} daysUntilWeighIn={-1} />);
    fireEvent.click(screen.getByRole('button', { name: /day 2 of the tournament is today/i }));
    const update = updateProfile.mock.calls[0][0];
    expect(key(update.weighInDate)).toBe(key(noon(0)));
    expect(update.nextCyclePromptDismissed).toBeUndefined();
  });

  it('asks for the official weight first and saves it to the descent plan', async () => {
    const yesterday = noon(-1);
    descent.plan = { assessmentDate: key(noon(-30)), initialWeight: 140, minimumWeight: 125, weighIns: [] };
    render(<NextCyclePrompt profile={baseProfile(yesterday)} updateProfile={vi.fn()} daysUntilWeighIn={-1} />);

    fireEvent.change(screen.getByLabelText(/official weight/i), { target: { value: '131.4' } });
    fireEvent.click(screen.getByRole('button', { name: /save official weigh-in/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save official$/i }));

    await waitFor(() => expect(descent.save).toHaveBeenCalled());
    const saved = descent.save.mock.calls[0][0] as DescentInput;
    expect(saved.weighIns).toEqual([{ date: key(yesterday), weight: 131.4, allowance: 0, secondDay: false }]);
    expect(await screen.findByText(/next weigh-in/i)).toBeInTheDocument();
  });

  it('on a team, moves straight to the next weigh-in on the coach schedule', () => {
    const yesterday = noon(-1);
    const nextKey = key(noon(6));
    const updateProfile = vi.fn();
    render(
      <NextCyclePrompt
        profile={baseProfile(yesterday)}
        updateProfile={updateProfile}
        daysUntilWeighIn={-1}
        team={{ name: 'Roger Williams', next: { event: { id: 'd', name: 'Dual vs Bryant', eventDate: nextKey, days: 1, allowance: 0 }, date: nextKey, day: 1, allowance: 0 } }}
      />,
    );
    expect(screen.queryByRole('button', { name: /pick the next date/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Dual vs Bryant/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    const update = updateProfile.mock.calls[0][0];
    expect(key(update.weighInDate)).toBe(nextKey);
    expect(update.nextCyclePromptDismissed).toBe(key(yesterday));
  });

  it('fills in the allowance from the team schedule', async () => {
    const yesterday = noon(-1);
    descent.plan = { assessmentDate: key(noon(-30)), initialWeight: 140, minimumWeight: 125, weighIns: [] };
    render(<NextCyclePrompt profile={baseProfile(yesterday)} updateProfile={vi.fn()} daysUntilWeighIn={-1}
      team={{ name: 'Coast Guard', next: null, passedAllowance: 1 }} />);
    fireEvent.change(screen.getByLabelText(/official weight/i), { target: { value: '158.2' } });
    fireEvent.click(screen.getByRole('button', { name: /save official weigh-in/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save official$/i }));
    await waitFor(() => expect(descent.save).toHaveBeenCalled());
    expect((descent.save.mock.calls[0][0] as DescentInput).weighIns[0].allowance).toBe(1);
  });

  it('picks up the allowance when the team schedule loads after the prompt appears', async () => {
    const yesterday = noon(-1);
    descent.plan = { assessmentDate: key(noon(-30)), initialWeight: 140, minimumWeight: 125, weighIns: [] };
    const { rerender } = render(<NextCyclePrompt profile={baseProfile(yesterday)} updateProfile={vi.fn()} daysUntilWeighIn={-1} />);
    rerender(<NextCyclePrompt profile={baseProfile(yesterday)} updateProfile={vi.fn()} daysUntilWeighIn={-1}
      team={{ name: 'Coast Guard', next: null, passedAllowance: 1 }} />);
    fireEvent.change(screen.getByLabelText(/official weight/i), { target: { value: '158.2' } });
    fireEvent.click(screen.getByRole('button', { name: /save official weigh-in/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save official$/i }));
    await waitFor(() => expect(descent.save).toHaveBeenCalled());
    expect((descent.save.mock.calls[0][0] as DescentInput).weighIns[0].allowance).toBe(1);
  });

  it("keeps the athlete's own allowance choice when the schedule changes", async () => {
    const yesterday = noon(-1);
    descent.plan = { assessmentDate: key(noon(-30)), initialWeight: 140, minimumWeight: 125, weighIns: [] };
    const team = (a: number) => ({ name: 'Coast Guard', next: null, passedAllowance: a });
    const { rerender } = render(<NextCyclePrompt profile={baseProfile(yesterday)} updateProfile={vi.fn()} daysUntilWeighIn={-1} team={team(1)} />);
    fireEvent.change(screen.getByDisplayValue('+1 lb'), { target: { value: '0' } });
    rerender(<NextCyclePrompt profile={baseProfile(yesterday)} updateProfile={vi.fn()} daysUntilWeighIn={-1} team={team(2)} />);
    fireEvent.change(screen.getByLabelText(/official weight/i), { target: { value: '158.2' } });
    fireEvent.click(screen.getByRole('button', { name: /save official weigh-in/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save official$/i }));
    await waitFor(() => expect(descent.save).toHaveBeenCalled());
    expect((descent.save.mock.calls[0][0] as DescentInput).weighIns[0].allowance).toBe(0);
  });

  it('marks the prompt finished for this date when the athlete picks "Not right now"', () => {
    const yesterday = noon(-1);
    const updateProfile = vi.fn();
    render(<NextCyclePrompt profile={baseProfile(yesterday)} updateProfile={updateProfile} daysUntilWeighIn={-1} />);
    fireEvent.click(screen.getByRole('button', { name: /not right now/i }));
    expect(updateProfile).toHaveBeenCalledWith({ weighInCleared: true, nextCyclePromptDismissed: key(yesterday) });
  });
});
