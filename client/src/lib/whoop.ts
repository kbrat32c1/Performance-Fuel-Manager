import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { apiUrl } from './api';
import { authHeaders } from './auth-headers';

export interface WhoopStatus {
  connected: boolean;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const NOT_CONNECTED: WhoopStatus = { connected: false, connectedAt: null, lastSyncedAt: null, lastError: null };
/** Re-sync at most this often when the dashboard opens. */
export const WHOOP_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;

/** Status only — tokens never leave the server. 'unavailable' before the database update. */
export async function getWhoopStatus(): Promise<WhoopStatus | 'unavailable'> {
  const { data, error } = await supabase.rpc('whoop_status');
  if (error) return /whoop_status|PGRST202|42883/.test(`${error.code} ${error.message}`) ? 'unavailable' : NOT_CONNECTED;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NOT_CONNECTED;
  return { connected: true, connectedAt: row.connected_at ?? null, lastSyncedAt: row.last_synced_at ?? null, lastError: row.last_error ?? null };
}

async function post(path: string, body: unknown = {}): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Opens WHOOP's approval page. On the web the page navigates away; in the app it opens a browser sheet. */
export async function connectWhoop(): Promise<string | null> {
  const native = Capacitor.isNativePlatform();
  const { ok, data } = await post('/api/whoop/connect', { platform: native ? 'native' : 'web' });
  if (!ok || typeof data.url !== 'string') return data.error || "Couldn't start the WHOOP connection.";
  if (native) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url });
  } else {
    window.location.href = data.url;
  }
  return null;
}

export async function syncWhoop(): Promise<string | null> {
  const { ok, data } = await post('/api/whoop/sync');
  return ok ? null : data.error || 'WHOOP sync failed.';
}

export async function disconnectWhoop(): Promise<string | null> {
  const { ok, data } = await post('/api/whoop/disconnect');
  return ok ? null : data.error || "Couldn't disconnect WHOOP.";
}

export function whoopSyncDue(status: WhoopStatus, now = Date.now()): boolean {
  if (!status.connected) return false;
  return !status.lastSyncedAt || now - Date.parse(status.lastSyncedAt) > WHOOP_SYNC_INTERVAL_MS;
}
