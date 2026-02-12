import { useCallback } from 'react';
import { useStore } from './store';

type TrackerType = 'spar' | 'macro';

function makeKey(tracker: TrackerType, name: string): string {
  return `${tracker}:${name}`;
}

/**
 * Shared favorites hook for food trackers.
 * Uses composite keys like "spar:Chicken Breast" or "macro:Apple juice".
 * Backed by store (Supabase + localStorage fallback) — syncs across devices.
 */
export function useFavorites(tracker: TrackerType) {
  const { userFoods, updateUserFoods } = useStore();
  const favorites = userFoods.favorites;

  const isFavorite = useCallback((name: string): boolean => {
    return favorites.includes(makeKey(tracker, name));
  }, [favorites, tracker]);

  const toggleFavorite = useCallback((name: string): boolean => {
    const key = makeKey(tracker, name);
    let next: string[];
    let nowFavorited: boolean;

    if (favorites.includes(key)) {
      next = favorites.filter(k => k !== key);
      nowFavorited = false;
    } else {
      next = [...favorites, key];
      nowFavorited = true;
    }

    updateUserFoods({ favorites: next });
    return nowFavorited;
  }, [favorites, tracker, updateUserFoods]);

  const getFavoriteNames = useCallback((): string[] => {
    const prefix = `${tracker}:`;
    return favorites
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length));
  }, [favorites, tracker]);

  return { isFavorite, toggleFavorite, getFavoriteNames };
}
