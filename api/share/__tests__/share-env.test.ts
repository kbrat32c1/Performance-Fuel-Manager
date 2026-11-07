import { describe, it, expect, vi, afterEach } from 'vitest';

const created = vi.hoisted(() => ({ url: '' as string | undefined }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string) => {
    created.url = url;
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
    };
    return { from: () => chain };
  },
}));

function mockRes() {
  const res: any = { statusCode: 0, body: undefined, headers: {} };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.end = () => res;
  return res;
}

const TOKEN = '3f2b6c1e-8a4d-4c2b-9e1f-7a6b5c4d3e2f';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  created.url = '';
});

async function callShare() {
  const { default: handler } = await import('../[token]');
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { token: TOKEN } } as any, res);
  return res;
}

describe('share endpoint configuration', () => {
  it('works when production only defines VITE_SUPABASE_URL', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');

    const res = await callShare();

    expect(created.url).toBe('https://example.supabase.co');
    expect(res.statusCode).toBe(404); // reached the database lookup instead of a 500
  });

  it('still reports a configuration error without a service key', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callShare();

    expect(res.statusCode).toBe(500);
  });
});
