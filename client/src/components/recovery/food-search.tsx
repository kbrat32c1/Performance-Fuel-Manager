import { useState, useRef, useEffect } from "react";
import { Search, X, Apple, Loader2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface USDAFood {
  fdcId: number;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: number | null;
  servingSizeUnit: string;
}

interface FoodSearchProps {
  onSelectFood?: (food: USDAFood) => void;
}

export function FoodSearch({ onSelectFood }: FoodSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<USDAFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedFood, setExpandedFood] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.foods || []);
      } catch (err) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Format food name to title case
  const formatName = (name: string) => {
    return name
      .toLowerCase()
      .split(",")[0] // Take just the first part before commas
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim();
  };

  return (
    <div className="border border-cyan-500/20 bg-cyan-500/5 rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
        className="w-full flex items-center justify-between p-3 active:bg-cyan-500/10 transition-colors"
      >
        <span className="text-[10px] uppercase font-bold text-cyan-500 flex items-center gap-1.5 tracking-wider">
          <Search className="w-3.5 h-3.5" /> Food Lookup
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search any food (e.g. banana, rice)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-8 h-10 text-sm rounded-lg bg-background/60"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setSearched(false);
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/50"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Searching USDA database...</span>
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              <p className="text-[9px] uppercase text-muted-foreground tracking-wider px-1">
                {results.length} results · per 100g · USDA FoodData Central
              </p>
              {results.map((food) => (
                <div key={food.fdcId} className="rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedFood(expandedFood === food.fdcId ? null : food.fdcId)}
                    className="w-full flex items-center justify-between bg-background/50 hover:bg-background/80 rounded-lg px-3 py-2.5 text-left transition-colors active:scale-[0.99]"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">
                        {formatName(food.name)}
                      </span>
                      {food.category && (
                        <span className="text-[10px] text-muted-foreground block truncate">
                          {food.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                      <div className="text-right">
                        <span className="font-mono text-primary font-bold block">{food.carbs}g</span>
                        <span className="text-[9px] text-muted-foreground">carbs</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-foreground font-bold block">{food.protein}g</span>
                        <span className="text-[9px] text-muted-foreground">protein</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expandedFood === food.fdcId && (
                    <div className="bg-background/30 px-3 py-2 space-y-2 animate-in slide-in-from-top-1 duration-150">
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center p-1.5 bg-muted/20 rounded-lg">
                          <span className="text-xs font-mono font-bold text-foreground block">{food.calories}</span>
                          <span className="text-[9px] text-muted-foreground">cal</span>
                        </div>
                        <div className="text-center p-1.5 bg-primary/10 rounded-lg">
                          <span className="text-xs font-mono font-bold text-primary block">{food.carbs}g</span>
                          <span className="text-[9px] text-muted-foreground">carbs</span>
                        </div>
                        <div className="text-center p-1.5 bg-cyan-500/10 rounded-lg">
                          <span className="text-xs font-mono font-bold text-cyan-500 block">{food.protein}g</span>
                          <span className="text-[9px] text-muted-foreground">protein</span>
                        </div>
                        <div className="text-center p-1.5 bg-yellow-500/10 rounded-lg">
                          <span className="text-xs font-mono font-bold text-yellow-500 block">{food.fat}g</span>
                          <span className="text-[9px] text-muted-foreground">fat</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                        <span>Fiber: {food.fiber}g · Sugar: {food.sugar}g · Sodium: {food.sodium}mg</span>
                        <span className="text-[9px] opacity-60">per 100g</span>
                      </div>
                      {/* Wrestling-specific tip */}
                      {food.fiber > 3 && (
                        <p className="text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
                          ⚠ High fiber — may cause bloating during competition
                        </p>
                      )}
                      {food.fat > 10 && (
                        <p className="text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
                          ⚠ High fat — slow digestion, not ideal pre-match
                        </p>
                      )}
                      {food.carbs > 50 && food.fiber < 2 && food.fat < 3 && (
                        <p className="text-[10px] text-green-500 bg-green-500/10 px-2 py-1 rounded">
                          ✓ Fast carbs, low fiber — great for competition recovery
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* No results */}
          {!loading && searched && results.length === 0 && query.length >= 2 && (
            <div className="text-center py-4 text-xs text-muted-foreground">
              No foods found for "{query}"
            </div>
          )}

          {/* Helper text */}
          {!searched && !loading && (
            <p className="text-[10px] text-muted-foreground text-center py-2">
              Search the USDA database for nutrition info on any food
            </p>
          )}
        </div>
      )}
    </div>
  );
}
