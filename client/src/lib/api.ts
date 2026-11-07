import { Capacitor } from '@capacitor/core';

const PRODUCTION_ORIGIN = 'https://performance-fuel-manager.vercel.app';

/**
 * Origin for `/api/*` requests. On the web the API is same-origin, so paths stay
 * relative. The native app is served from capacitor://localhost, which has no API,
 * so requests go to the deployed server (override with VITE_API_ORIGIN).
 */
export function getApiOrigin(isNative: boolean = Capacitor.isNativePlatform()): string {
  if (!isNative) return '';
  const configured = import.meta.env.VITE_API_ORIGIN as string | undefined;
  return (configured || PRODUCTION_ORIGIN).replace(/\/+$/, '');
}

/** Absolute URL for an API path such as `/api/foods/search?q=rice`. */
export function apiUrl(path: string, isNative?: boolean): string {
  return `${getApiOrigin(isNative)}${path}`;
}
