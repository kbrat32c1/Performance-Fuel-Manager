/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyUser, allowRequest, requireUserWithinLimit } from '../_auth';

const okUser = (id: string) => vi.fn(async () => new Response(JSON.stringify({ id }), { status: 200 }));
const rejected = () => vi.fn(async () => new Response('{"msg":"bad jwt"}', { status: 401 }));

function mockRes() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('verifyUser', () => {
  it('asks Supabase who the token belongs to', async () => {
    const f = okUser('athlete-1');
    expect(await verifyUser('Bearer tok', f as any)).toBe('athlete-1');
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('https://example.supabase.co/auth/v1/user');
    expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer tok' });
  });

  it('rejects a missing, malformed or invalid token', async () => {
    expect(await verifyUser(undefined, okUser('x') as any)).toBeNull();
    expect(await verifyUser('tok', okUser('x') as any)).toBeNull();
    expect(await verifyUser('Bearer bad', rejected() as any)).toBeNull();
  });

  it('fails closed when Supabase is not configured or unreachable', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(await verifyUser('Bearer tok', okUser('x') as any)).toBeNull();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    expect(await verifyUser('Bearer tok', vi.fn(async () => { throw new Error('down'); }) as any)).toBeNull();
  });
});

describe('allowRequest', () => {
  it('allows up to the limit within the window, then refuses until it passes', () => {
    const t = 1_000_000;
    expect(allowRequest('k1', 2, 60_000, t)).toBe(true);
    expect(allowRequest('k1', 2, 60_000, t + 1)).toBe(true);
    expect(allowRequest('k1', 2, 60_000, t + 2)).toBe(false);
    expect(allowRequest('k1', 2, 60_000, t + 60_001)).toBe(true);
  });

  it('counts each athlete separately', () => {
    expect(allowRequest('a', 1, 60_000, 5)).toBe(true);
    expect(allowRequest('b', 1, 60_000, 5)).toBe(true);
  });
});

describe('requireUserWithinLimit', () => {
  it('answers 401 without a valid sign-in', async () => {
    vi.stubGlobal('fetch', rejected());
    const res = mockRes();
    expect(await requireUserWithinLimit({ headers: {} } as any, res, 'coach-t1', { perMinute: 5, perDay: 50 })).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('answers 429 once an athlete passes the per-minute limit', async () => {
    vi.stubGlobal('fetch', okUser('athlete-limit'));
    const req = { headers: { authorization: 'Bearer tok' } } as any;
    expect(await requireUserWithinLimit(req, mockRes(), 'coach-t2', { perMinute: 1, perDay: 50 })).toBe('athlete-limit');
    const res = mockRes();
    expect(await requireUserWithinLimit(req, res, 'coach-t2', { perMinute: 1, perDay: 50 })).toBeNull();
    expect(res.statusCode).toBe(429);
  });
});
