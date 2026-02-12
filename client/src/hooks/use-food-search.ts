/**
 * useFoodSearch — Shared food search hook.
 * Handles FatSecret + Open Food Facts parallel search, barcode lookup,
 * and local food filtering. Extracted from MacroTracker + SparTracker.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Shared types ───

export interface FatSecretServing {
  id: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  metricAmount: number | null;
  metricUnit: string;
  isDefault: boolean;
}

export interface FatSecretFood {
  id: string;
  name: string;
  brand: string;
  type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: number | null;
  servingSizeUnit: string;
  servingSizeLabel: string;
  sparCategory: string | null;
  servings: FatSecretServing[];
}

export interface OFFFood {
  barcode: string;
  name: string;
  brand: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: number | null;
  servingSizeLabel: string;
  imageUrl: string | null;
  dataQuality: 'complete' | 'partial' | 'poor';
}

export interface RecentFood {
  food: FatSecretFood;
  serving: FatSecretServing;
  lastUsed: number;
}

interface UseFoodSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  // FatSecret results
  fsResults: FatSecretFood[];
  fsLoading: boolean;
  fsSearched: boolean;
  fsError: boolean;
  // OFF results
  offResults: OFFFood[];
  offLoading: boolean;
  offSearched: boolean;
  // Barcode
  barcodeLoading: boolean;
  barcodeLookup: (barcode: string) => Promise<OFFFood | null>;
  // Selection state
  selectedFS: FatSecretFood | null;
  setSelectedFS: (food: FatSecretFood | null) => void;
  selectedFSServing: FatSecretServing | null;
  setSelectedFSServing: (serving: FatSecretServing | null) => void;
  selectedOFF: OFFFood | null;
  setSelectedOFF: (food: OFFFood | null) => void;
  offServingGrams: string;
  setOffServingGrams: (grams: string) => void;
  // Recent foods
  recentFoods: RecentFood[];
  addToRecents: (food: FatSecretFood, serving: FatSecretServing) => void;
  // Clear
  clearResults: () => void;
}

export function useFoodSearch(): UseFoodSearchReturn {
  const [query, setQuery] = useState('');

  // FatSecret state
  const [fsResults, setFsResults] = useState<FatSecretFood[]>([]);
  const [fsLoading, setFsLoading] = useState(false);
  const [fsSearched, setFsSearched] = useState(false);
  const [fsError, setFsError] = useState(false);
  const [selectedFS, setSelectedFS] = useState<FatSecretFood | null>(null);
  const [selectedFSServing, setSelectedFSServing] = useState<FatSecretServing | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // OFF state
  const [offResults, setOffResults] = useState<OFFFood[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [offSearched, setOffSearched] = useState(false);
  const [selectedOFF, setSelectedOFF] = useState<OFFFood | null>(null);
  const [offServingGrams, setOffServingGrams] = useState('100');

  // Barcode
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  // Recent foods (localStorage-backed)
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('pwm-macro-recent-foods');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // ─── Debounced food search ───
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.trim().length < 3) {
      setFsResults([]);
      setFsSearched(false);
      setFsError(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const q = encodeURIComponent(query.trim());

      setFsLoading(true);
      setFsSearched(true);
      setFsError(false);

      await fetch(`/api/foods/fatsecret-search?q=${q}`)
        .then(r => { if (!r.ok) throw new Error('search failed'); return r.json(); })
        .then(data => { setFsResults(data.foods || []); setFsError(false); })
        .catch(() => { setFsResults([]); setFsError(true); })
        .finally(() => setFsLoading(false));
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ─── Barcode lookup ───
  const barcodeLookup = useCallback(async (barcode: string): Promise<OFFFood | null> => {
    setBarcodeLoading(true);
    try {
      const res = await fetch(`/api/foods/off-barcode?code=${encodeURIComponent(barcode)}`);
      if (!res.ok) throw new Error('Barcode lookup failed');
      const data = await res.json();
      if (data.found && data.food) {
        setSelectedOFF(data.food);
        setOffResults([data.food]);
        setOffSearched(true);
        setOffServingGrams(data.food.servingSize ? String(Math.round(data.food.servingSize)) : '100');
        setQuery('');
        return data.food;
      }
      return null;
    } catch {
      return null;
    } finally {
      setBarcodeLoading(false);
    }
  }, []);

  // ─── Recent foods ───
  const addToRecents = useCallback((food: FatSecretFood, serving: FatSecretServing) => {
    setRecentFoods(prev => {
      const filtered = prev.filter(r => r.food.id !== food.id);
      const next = [{ food, serving, lastUsed: Date.now() }, ...filtered].slice(0, 15);
      if (typeof window !== 'undefined') localStorage.setItem('pwm-macro-recent-foods', JSON.stringify(next));
      return next;
    });
  }, []);

  // ─── Clear all results ───
  const clearResults = useCallback(() => {
    setQuery('');
    setFsResults([]);
    setFsSearched(false);
    setFsLoading(false);
    setFsError(false);
    setOffResults([]);
    setOffSearched(false);
    setOffLoading(false);
    setSelectedFS(null);
    setSelectedFSServing(null);
    setSelectedOFF(null);
    setOffServingGrams('100');
  }, []);
  // Note: OFF state kept for barcode lookup which still uses Open Food Facts

  return {
    query, setQuery,
    fsResults, fsLoading, fsSearched, fsError,
    offResults, offLoading, offSearched,
    barcodeLoading, barcodeLookup,
    selectedFS, setSelectedFS,
    selectedFSServing, setSelectedFSServing,
    selectedOFF, setSelectedOFF,
    offServingGrams, setOffServingGrams,
    recentFoods, addToRecents,
    clearResults,
  };
}
