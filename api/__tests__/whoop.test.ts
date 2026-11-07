import { describe, it, expect } from 'vitest';
import { signState, verifyState, authorizeUrl, returnUrl, localDate, toDailyRows, WHOOP_SCOPES } from '../_whoop';

const SECRET = 'test-secret';

describe('OAuth state', () => {
  it('round-trips the athlete and platform', () => {
    const s = signState('user-1', 'native', SECRET, 1_000_000);
    expect(verifyState(s, SECRET, 1_000_000 + 60_000)).toEqual({ userId: 'user-1', platform: 'native' });
  });

  it('rejects a tampered, wrong-secret or expired state', () => {
    const s = signState('user-1', 'web', SECRET, 1_000_000);
    const [body, sig] = s.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'someone-else', p: 'web', t: 1_000_000 })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, SECRET, 1_000_000)).toBeNull();
    expect(verifyState(s, 'other-secret', 1_000_000)).toBeNull();
    expect(verifyState(s, SECRET, 1_000_000 + 11 * 60_000)).toBeNull();
    expect(verifyState(`${body}`, SECRET, 1_000_000)).toBeNull();
  });
});

describe('URLs', () => {
  it('asks WHOOP for read-only scopes plus offline', () => {
    const url = new URL(authorizeUrl({ clientId: 'cid', clientSecret: SECRET, redirectUri: 'https://x/cb' }, 'st'));
    expect(url.searchParams.get('scope')).toBe(WHOOP_SCOPES);
    expect(WHOOP_SCOPES).toContain('offline');
    expect(WHOOP_SCOPES).not.toMatch(/write/);
    expect(url.searchParams.get('redirect_uri')).toBe('https://x/cb');
  });

  it('sends web users to the dashboard and app users back into the app', () => {
    expect(returnUrl('web', 'connected')).toBe('https://performance-fuel-manager.vercel.app/dashboard?whoop=connected');
    expect(returnUrl('native', 'error')).toBe('com.sparnutrition.app://whoop?status=error');
  });
});

describe('localDate', () => {
  it('uses the record’s own time zone', () => {
    expect(localDate('2026-11-07T03:30:00.000Z', '-04:00')).toBe('2026-11-06');
    expect(localDate('2026-11-07T03:30:00.000Z', '+00:00')).toBe('2026-11-07');
    expect(localDate('2026-11-07T03:30:00.000Z', '-04:00', 6)).toBe('2026-11-07');
  });
});

describe('toDailyRows', () => {
  const sleep = {
    id: 'sleep-1', nap: false, score_state: 'SCORED', start: '2026-11-07T03:00:00.000Z', end: '2026-11-07T11:00:00.000Z', timezone_offset: '-05:00',
    score: {
      sleep_performance_percentage: 88.4, respiratory_rate: 15.2,
      stage_summary: { total_light_sleep_time_milli: 4 * 3.6e6, total_slow_wave_sleep_time_milli: 1.5 * 3.6e6, total_rem_sleep_time_milli: 1.5 * 3.6e6, total_awake_time_milli: 30 * 60000 },
    },
  };
  const nap = { ...sleep, id: 'nap-1', nap: true, end: '2026-11-07T20:00:00.000Z' };
  const recovery = { cycle_id: 42, sleep_id: 'sleep-1', score_state: 'SCORED', score: { recovery_score: 67, hrv_rmssd_milli: 82.36, resting_heart_rate: 51, spo2_percentage: 96.4, user_calibrating: false } };
  const cycle = { id: 42, score_state: 'SCORED', start: '2026-11-07T03:00:00.000Z', timezone_offset: '-05:00', score: { strain: 14.7, average_heart_rate: 74, max_heart_rate: 181, kilojoule: 10460 } };

  it('puts sleep, recovery and strain on the morning they belong to', () => {
    const [row] = toDailyRows([recovery], [sleep, nap], [cycle]);
    expect(row).toMatchObject({
      date: '2026-11-07',
      sleep_hours: 7, sleep_score: 88, sleep_light_minutes: 240, sleep_deep_minutes: 90, sleep_rem_minutes: 90, sleep_awake_minutes: 30,
      respiratory_rate: 15.2,
      recovery_score: 67, hrv: 82.4, hrv_rmssd: 82.4, resting_heart_rate: 51, spo2: 96.4,
      strain_score: 70, avg_hr: 74, peak_hr: 181, active_energy: 2500,
    });
  });

  it('skips naps, unscored and calibrating records', () => {
    const rows = toDailyRows(
      [{ ...recovery, score: { ...recovery.score, user_calibrating: true } }],
      [nap, { ...sleep, score_state: 'PENDING_SCORE' }],
      [{ ...cycle, score_state: 'UNSCORABLE' }],
    );
    expect(rows).toEqual([]);
  });
});
