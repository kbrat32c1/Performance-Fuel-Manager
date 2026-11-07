import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { WeightLog } from '@/lib/stores/types';

const store = vi.hoisted(() => ({
  logs: [] as WeightLog[],
  addLog: vi.fn(),
  updateLog: vi.fn(),
}));

vi.mock('@/lib/store', () => ({
  useStore: () => ({
    profile: { simulatedDate: null },
    logs: store.logs,
    addLog: store.addLog,
    updateLog: store.updateLog,
  }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'athlete-1' } }) }));
vi.mock('@/components/mobile-layout', () => ({
  MobileLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import WeighIn from '../weigh-in';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
const DRAFTS = 'pwm-weigh-in-drafts-athlete-1';

function enter(label: string, value: string) {
  const input = screen.getByLabelText(`${label} weight in pounds`) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  return input;
}

beforeEach(() => {
  localStorage.clear();
  store.logs = [];
  store.addLog.mockReset().mockResolvedValue('new-id');
  store.updateLog.mockReset().mockResolvedValue(true);
});

describe('Weigh-ins page', () => {
  it('saves a new weight when the athlete leaves the field', async () => {
    render(<WeighIn />);
    const input = enter('Morning', '157.4');
    await act(async () => { fireEvent.blur(input); });

    expect(store.addLog).toHaveBeenCalledTimes(1);
    expect(store.addLog.mock.calls[0][0]).toMatchObject({ weight: 157.4, type: 'morning' });
    expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
    expect(localStorage.getItem(DRAFTS)).toBeNull();
  });

  it('keeps a weight that failed to save on the phone and retries it', async () => {
    store.addLog.mockResolvedValueOnce(null);
    render(<WeighIn />);
    const input = enter('Before practice', '160.0');
    await act(async () => { fireEvent.blur(input); });

    expect(screen.getByText('Not saved — kept on this phone')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(DRAFTS)!)[`${todayKey()}|pre-practice`]).toBe('160.0');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Retry/ })); });
    expect(store.addLog).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(DRAFTS)).toBeNull();
  });

  it('brings back an unsaved weight after the app is closed', () => {
    localStorage.setItem(DRAFTS, JSON.stringify({ [`${todayKey()}|before-bed`]: '158.2' }));
    render(<WeighIn />);
    expect((screen.getByLabelText('Before bed weight in pounds') as HTMLInputElement).value).toBe('158.2');
    expect(screen.getByText('Not saved yet — check it')).toBeInTheDocument();
    expect(store.addLog).not.toHaveBeenCalled();
  });

  it('updates an existing reading instead of adding a second one', async () => {
    store.logs = [{ id: 'm1', type: 'morning', weight: 158, date: at(6) }];
    render(<WeighIn />);
    const input = enter('Morning', '157.6');
    await act(async () => { fireEvent.blur(input); });

    expect(store.updateLog).toHaveBeenCalledWith('m1', { weight: 157.6 });
    expect(store.addLog).not.toHaveBeenCalled();
  });

  it('never deletes a saved weight when the field is cleared', async () => {
    store.logs = [{ id: 'm1', type: 'morning', weight: 158, date: at(6) }];
    render(<WeighIn />);
    const input = enter('Morning', '');
    await act(async () => { fireEvent.blur(input); });

    expect(store.updateLog).not.toHaveBeenCalled();
    expect(input.value).toBe('158.0');
  });

  it('does not save a number that is still being typed', async () => {
    render(<WeighIn />);
    const input = enter('Morning', '15');
    await act(async () => { fireEvent.blur(input); });
    expect(store.addLog).not.toHaveBeenCalled();
    expect(screen.getByText('Finish the weight, like 157.4')).toBeInTheDocument();
  });

  it('shows the practice change once Before and After are in', () => {
    store.logs = [
      { id: 'p1', type: 'pre-practice', weight: 160, date: at(15) },
      { id: 'p2', type: 'post-practice', weight: 157.6, date: at(17) },
    ];
    render(<WeighIn />);
    expect(screen.getByText('Practice change −2.4 lb (1.5%)')).toBeInTheDocument();
    expect(screen.getByText(/2 of 4 recorded/)).toBeInTheDocument();
  });

  it('sends the newest value when the athlete edits during a save', async () => {
    let finish!: (id: string) => void;
    store.addLog.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    render(<WeighIn />);
    const input = enter('Morning', '157');
    await act(async () => { fireEvent.blur(input); });
    enter('Morning', '157.2');
    await act(async () => { fireEvent.blur(input); });
    expect(store.addLog).toHaveBeenCalledTimes(1);

    await act(async () => { finish('new-id'); });
    await waitFor(() => expect(store.updateLog).toHaveBeenCalledWith('new-id', { weight: 157.2 }));
  });
});
