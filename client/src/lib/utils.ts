import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safe localStorage wrapper that catches quota/access errors.
 * Falls back gracefully when localStorage is unavailable (SSR, private browsing, full storage).
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      console.warn(`Failed to read localStorage key "${key}"`);
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn(`Failed to write localStorage key "${key}"`, e);
    }
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      console.warn(`Failed to remove localStorage key "${key}"`);
    }
  },
  getJSON<T>(key: string, fallback: T): T {
    const raw = safeStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  setJSON(key: string, value: unknown): void {
    safeStorage.setItem(key, JSON.stringify(value));
  },
};
