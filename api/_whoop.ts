import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * WHOOP v2 integration shared by api/whoop/*. Tokens live only in whoop_connections
 * (service role, no client policies). Each athlete's WHOOP data becomes one health_data
 * row per day with source 'whoop'.
 */
export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API = "https://api.prod.whoop.com/developer";
export const WHOOP_SCOPES = "read:recovery read:cycles read:sleep read:profile offline";
const DEFAULT_REDIRECT = "https://performance-fuel-manager.vercel.app/api/whoop/callback";
const APP_ORIGIN = "https://performance-fuel-manager.vercel.app";
// WHOOP's Cloudflare front end rejects some default user agents.
const USER_AGENT = "spar-nutrition/1.0";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export interface WhoopConfig { clientId: string; clientSecret: string; redirectUri: string }

export function whoopConfig(): WhoopConfig | null {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: process.env.WHOOP_REDIRECT_URI || DEFAULT_REDIRECT };
}

export function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

// ─── OAuth state: who is connecting, and where to send them back. Signed, short-lived. ───

export type Platform = "web" | "native";

export function signState(userId: string, platform: Platform, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ u: userId, p: platform, t: now })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, secret: string, now = Date.now()): { userId: string; platform: Platform } | null {
  const [body, sig] = (state || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { u, p, t } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof u !== "string" || typeof t !== "number" || now - t > STATE_MAX_AGE_MS || t > now + 60_000) return null;
    return { userId: u, platform: p === "native" ? "native" : "web" };
  } catch {
    return null;
  }
}

export function authorizeUrl(cfg: WhoopConfig, state: string): string {
  const q = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: WHOOP_SCOPES, state,
  });
  return `${WHOOP_AUTH_URL}?${q}`;
}

/** Where the athlete lands after connecting (or failing to). */
export function returnUrl(platform: Platform, status: "connected" | "error"): string {
  return platform === "native"
    ? `com.sparnutrition.app://whoop?status=${status}`
    : `${APP_ORIGIN}/dashboard?whoop=${status}`;
}

// ─── Tokens ───

export interface WhoopTokens { access_token: string; refresh_token: string; expires_in: number; scope?: string }

async function tokenRequest(form: Record<string, string>, fetchImpl: typeof fetch): Promise<WhoopTokens> {
  const res = await fetchImpl(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": USER_AGENT },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) throw new Error(`WHOOP token request failed (${res.status})`);
  const json = (await res.json()) as WhoopTokens;
  if (!json.access_token || !json.refresh_token) throw new Error("WHOOP did not return tokens (was 'offline' approved?)");
  return json;
}

export function exchangeCode(cfg: WhoopConfig, code: string, fetchImpl: typeof fetch = fetch) {
  return tokenRequest({
    grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret,
  }, fetchImpl);
}

export function refreshTokens(cfg: WhoopConfig, refreshToken: string, fetchImpl: typeof fetch = fetch) {
  return tokenRequest({
    grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: "offline",
  }, fetchImpl);
}

export async function whoopGet<T = any>(path: string, token: string, params: Record<string, string> = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetchImpl(`${WHOOP_API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`WHOOP ${path} failed (${res.status})`);
  return (await res.json()) as T;
}

/** All records since `start` (ISO), following next_token pages (WHOOP caps limit at 25). */
export async function whoopCollection(path: string, token: string, start: string, fetchImpl: typeof fetch = fetch): Promise<any[]> {
  const records: any[] = [];
  let next: string | undefined;
  for (let page = 0; page < 20; page++) {
    const data = await whoopGet<{ records?: any[]; next_token?: string }>(path, token, { limit: "25", start, ...(next ? { nextToken: next } : {}) }, fetchImpl);
    records.push(...(data.records ?? []));
    next = data.next_token || undefined;
    if (!next) break;
  }
  return records;
}

// ─── WHOOP records → SPAR daily health rows ───

/** Local calendar date (yyyy-MM-dd) of an ISO instant, using WHOOP's "-04:00"-style offset. */
export function localDate(iso: string, offset = "+00:00", shiftHours = 0): string {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset || "+00:00");
  const offMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(Date.parse(iso) + (offMin + shiftHours * 60) * 60_000).toISOString().slice(0, 10);
}

export interface WhoopDayRow {
  date: string;
  recovery_score?: number | null;
  hrv_rmssd?: number | null;
  /** The dashboard's HRV field; for WHOOP days it's the same RMSSD value WHOOP shows. */
  hrv?: number | null;
  resting_heart_rate?: number | null;
  spo2?: number | null;
  sleep_hours?: number | null;
  sleep_score?: number | null;
  sleep_light_minutes?: number | null;
  sleep_deep_minutes?: number | null;
  sleep_rem_minutes?: number | null;
  sleep_awake_minutes?: number | null;
  respiratory_rate?: number | null;
  strain_score?: number | null;
  avg_hr?: number | null;
  peak_hr?: number | null;
  active_energy?: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const minutes = (ms: unknown) => (typeof ms === "number" ? Math.round(ms / 60000) : null);

/**
 * One row per day. Sleep and recovery belong to the morning they end on; a cycle's strain
 * belongs to the day it covers (its start shifted 6h, so a 11pm sleep onset counts as tomorrow).
 * Naps are ignored; unscored records are skipped.
 */
export function toDailyRows(recoveries: any[], sleeps: any[], cycles: any[]): WhoopDayRow[] {
  const days = new Map<string, WhoopDayRow>();
  const day = (date: string) => days.get(date) ?? (days.set(date, { date }), days.get(date)!);
  const sleepById = new Map<string, any>();

  for (const s of sleeps) {
    if (s.nap || s.score_state !== "SCORED" || !s.end) continue;
    sleepById.set(String(s.id), s);
    const sc = s.score ?? {};
    const st = sc.stage_summary ?? {};
    const light = minutes(st.total_light_sleep_time_milli);
    const deep = minutes(st.total_slow_wave_sleep_time_milli);
    const rem = minutes(st.total_rem_sleep_time_milli);
    const row = day(localDate(s.end, s.timezone_offset));
    const asleepMin = (light ?? 0) + (deep ?? 0) + (rem ?? 0);
    Object.assign(row, {
      sleep_hours: asleepMin > 0 ? round1(clamp(asleepMin / 60, 0, 24)) : null,
      sleep_score: typeof sc.sleep_performance_percentage === "number" ? clamp(Math.round(sc.sleep_performance_percentage), 0, 100) : null,
      sleep_light_minutes: light, sleep_deep_minutes: deep, sleep_rem_minutes: rem,
      sleep_awake_minutes: minutes(st.total_awake_time_milli),
      respiratory_rate: typeof sc.respiratory_rate === "number" && sc.respiratory_rate >= 4 && sc.respiratory_rate <= 60 ? round1(sc.respiratory_rate) : null,
    });
  }

  const cycleById = new Map<string, any>();
  for (const c of cycles) cycleById.set(String(c.id), c);

  for (const r of recoveries) {
    if (r.score_state !== "SCORED" || r.score?.user_calibrating) continue;
    const sc = r.score ?? {};
    const sleep = sleepById.get(String(r.sleep_id));
    const cycle = cycleById.get(String(r.cycle_id));
    const date = sleep ? localDate(sleep.end, sleep.timezone_offset) : cycle ? localDate(cycle.start, cycle.timezone_offset, 6) : null;
    if (!date) continue;
    const hrv = typeof sc.hrv_rmssd_milli === "number" ? round1(clamp(sc.hrv_rmssd_milli, 0, 300)) : null;
    Object.assign(day(date), {
      recovery_score: typeof sc.recovery_score === "number" ? clamp(Math.round(sc.recovery_score), 0, 100) : null,
      hrv_rmssd: hrv,
      hrv,
      resting_heart_rate: typeof sc.resting_heart_rate === "number" && sc.resting_heart_rate >= 20 ? Math.round(sc.resting_heart_rate) : null,
      spo2: typeof sc.spo2_percentage === "number" ? round1(clamp(sc.spo2_percentage, 0, 100)) : null,
    });
  }

  for (const c of cycles) {
    if (c.score_state !== "SCORED" || typeof c.score?.strain !== "number") continue;
    const sc = c.score;
    Object.assign(day(localDate(c.start, c.timezone_offset, 6)), {
      // WHOOP strain is 0-21; health_data.strain_score is 0-100 (same conversion as the V5 band's TRIMP strain).
      strain_score: clamp(Math.round((sc.strain / 21) * 100), 0, 100),
      avg_hr: typeof sc.average_heart_rate === "number" ? Math.round(sc.average_heart_rate) : null,
      peak_hr: typeof sc.max_heart_rate === "number" ? Math.round(sc.max_heart_rate) : null,
      active_energy: typeof sc.kilojoule === "number" ? Math.round(sc.kilojoule / 4.184) : null,
    });
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Sync ───

interface ConnectionRow { user_id: string; access_token: string; refresh_token: string; expires_at: string }

/** A valid access token, refreshing (and saving the rotated refresh token first) when needed. */
export async function freshAccessToken(db: SupabaseClient, cfg: WhoopConfig, conn: ConnectionRow, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (Date.parse(conn.expires_at) - Date.now() > 120_000) return conn.access_token;
  const t = await refreshTokens(cfg, conn.refresh_token, fetchImpl);
  const { error } = await db.from("whoop_connections").update({
    access_token: t.access_token, refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  }).eq("user_id", conn.user_id);
  if (error) throw new Error("Could not save refreshed WHOOP tokens");
  return t.access_token;
}

/** Pull the last `days` days from WHOOP into health_data. Never overwrites V5 band rows. */
export async function syncWhoop(db: SupabaseClient, cfg: WhoopConfig, userId: string, days = 7, fetchImpl: typeof fetch = fetch): Promise<number> {
  const { data: conn, error } = await db.from("whoop_connections")
    .select("user_id, access_token, refresh_token, expires_at").eq("user_id", userId).maybeSingle();
  if (error || !conn) throw new Error("WHOOP is not connected");
  try {
    const token = await freshAccessToken(db, cfg, conn as ConnectionRow, fetchImpl);
    const start = new Date(Date.now() - (days + 1) * 86_400_000).toISOString();
    const [recoveries, sleeps, cycles] = await Promise.all([
      whoopCollection("/v2/recovery", token, start, fetchImpl),
      whoopCollection("/v2/activity/sleep", token, start, fetchImpl),
      whoopCollection("/v2/cycle", token, start, fetchImpl),
    ]);
    const rows = toDailyRows(recoveries, sleeps, cycles);
    let written = 0;
    if (rows.length) {
      const { data: existing } = await db.from("health_data").select("date, source")
        .eq("user_id", userId).in("date", rows.map(r => r.date));
      const v5Days = new Set((existing ?? []).filter(e => e.source === "v5-direct").map(e => e.date));
      const now = new Date().toISOString();
      const payload = rows.filter(r => !v5Days.has(r.date))
        .map(r => ({ ...r, user_id: userId, source: "whoop", synced_at: now, updated_at: now }));
      if (payload.length) {
        const { error: upErr } = await db.from("health_data").upsert(payload, { onConflict: "user_id,date" });
        if (upErr) throw new Error("Could not save WHOOP data");
        written = payload.length;
      }
    }
    await db.from("whoop_connections").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", userId);
    return written;
  } catch (e) {
    await db.from("whoop_connections").update({ last_error: e instanceof Error ? e.message.slice(0, 200) : "Sync failed" }).eq("user_id", userId);
    throw e;
  }
}
