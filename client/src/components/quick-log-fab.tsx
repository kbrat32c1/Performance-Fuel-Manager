import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Scale, Sun, Dumbbell, Moon, CheckCircle2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

type LogTypeOption = 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'extra-workout' | 'check-in';

const CORE_TYPES: LogTypeOption[] = ['morning', 'pre-practice', 'post-practice', 'before-bed'];

const LOG_TYPE_OPTIONS: { value: LogTypeOption; label: string; icon: React.ReactNode; color: string; selectedBg: string }[] = [
  { value: 'morning', label: 'Morning', icon: <Sun className="w-4 h-4" />, color: 'text-yellow-500', selectedBg: 'border-yellow-500 bg-yellow-500/15 ring-1 ring-yellow-500/30' },
  { value: 'pre-practice', label: 'Pre-Practice', icon: <Dumbbell className="w-4 h-4" />, color: 'text-blue-500', selectedBg: 'border-blue-500 bg-blue-500/15 ring-1 ring-blue-500/30' },
  { value: 'post-practice', label: 'Post-Practice', icon: <Dumbbell className="w-4 h-4" />, color: 'text-green-500', selectedBg: 'border-green-500 bg-green-500/15 ring-1 ring-green-500/30' },
  { value: 'before-bed', label: 'Before Bed', icon: <Moon className="w-4 h-4" />, color: 'text-purple-500', selectedBg: 'border-purple-500 bg-purple-500/15 ring-1 ring-purple-500/30' },
  { value: 'extra-workout', label: 'Extra Workout', icon: <Dumbbell className="w-4 h-4" />, color: 'text-orange-500', selectedBg: 'border-orange-500 bg-orange-500/15 ring-1 ring-orange-500/30' },
  { value: 'check-in', label: 'Check-in', icon: <Scale className="w-4 h-4" />, color: 'text-cyan-500', selectedBg: 'border-cyan-500 bg-cyan-500/15 ring-1 ring-cyan-500/30' },
];

function getDefaultType(loggedTypes?: Set<string>): LogTypeOption {
  // If we know what's already logged, pick the next unlogged core type
  if (loggedTypes) {
    for (const t of CORE_TYPES) {
      if (!loggedTypes.has(t)) return t;
    }
  }
  // Fallback: time-based
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return 'morning';
  if (hour >= 9 && hour < 14) return 'pre-practice';
  if (hour >= 14 && hour < 17) return 'post-practice';
  return 'before-bed';
}

export function QuickLogFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<LogTypeOption>(getDefaultType());
  const [weight, setWeight] = useState('');
  const [beforeWeight, setBeforeWeight] = useState('');
  const [afterWeight, setAfterWeight] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLInputElement>(null);

  const { profile, logs, addLog, calculateTarget } = useStore();

  const today = profile?.simulatedDate ? new Date(profile.simulatedDate) : new Date();
  const isHistorical = !!profile?.simulatedDate;

  // Target weight for vs-target display
  const targetWeight = calculateTarget();

  // Check which core types are already logged today
  const loggedTypes = useMemo(() => {
    const todayLogs = logs.filter(log => {
      const logDate = new Date(log.date);
      return logDate.getFullYear() === today.getFullYear() &&
        logDate.getMonth() === today.getMonth() &&
        logDate.getDate() === today.getDate();
    });
    const types = new Set<string>();
    todayLogs.forEach(l => types.add(l.type));
    return types;
  }, [logs, today]);

  // Suggested weight from most recent log
  const suggestedWeight = useMemo(() => {
    if (logs.length === 0) return '';
    const sorted = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0].weight.toString();
  }, [logs]);

  const handleOpen = useCallback((type?: LogTypeOption) => {
    setSelectedType(type || getDefaultType(loggedTypes));
    setWeight(suggestedWeight);
    setBeforeWeight(suggestedWeight);
    setAfterWeight('');
    setIsOpen(true);
    // Focus input after drawer animation settles (no autoFocus to prevent mobile jump)
    setTimeout(() => {
      if (type === 'extra-workout') {
        beforeRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 350);
  }, [loggedTypes, suggestedWeight]);

  // Listen for external open requests (from TodayTimeline etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleOpen(detail?.type as LogTypeOption | undefined);
    };
    window.addEventListener('open-quick-log', handler);
    return () => window.removeEventListener('open-quick-log', handler);
  }, [handleOpen]);

  const handleTypeSelect = useCallback((type: LogTypeOption) => {
    setSelectedType(type);
    // Refocus the appropriate input after type switch
    setTimeout(() => {
      if (type === 'extra-workout') {
        beforeRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 50);
  }, []);

  const handleSubmit = () => {
    if (selectedType === 'extra-workout') {
      if (!beforeWeight || !afterWeight) return;
      const parsedBefore = parseFloat(beforeWeight);
      const parsedAfter = parseFloat(afterWeight);
      if (isNaN(parsedBefore) || isNaN(parsedAfter)) return;

      const baseDate = new Date(today);
      const realNow = new Date();
      baseDate.setHours(realNow.getHours(), realNow.getMinutes(), realNow.getSeconds(), 0);

      addLog({ weight: parsedBefore, date: baseDate, type: 'extra-before' });
      addLog({ weight: parsedAfter, date: new Date(baseDate.getTime() + 1000), type: 'extra-after' });
    } else {
      if (!weight) return;
      const parsedWeight = parseFloat(weight);
      if (isNaN(parsedWeight) || parsedWeight < 80 || parsedWeight > 350) return;

      const logDate = new Date(today);
      if (selectedType === 'morning') logDate.setHours(7, 0, 0, 0);
      else if (selectedType === 'pre-practice') logDate.setHours(15, 0, 0, 0);
      else if (selectedType === 'post-practice') logDate.setHours(17, 0, 0, 0);
      else if (selectedType === 'before-bed') logDate.setHours(22, 0, 0, 0);
      else if (selectedType === 'check-in') {
        const realNow = new Date();
        logDate.setHours(realNow.getHours(), realNow.getMinutes(), 0, 0);
      }

      addLog({ weight: parsedWeight, date: logDate, type: selectedType });
    }

    setWeight('');
    setBeforeWeight('');
    setAfterWeight('');
    setIsOpen(false);
  };

  // Compute diff vs target
  const currentWeight = selectedType === 'extra-workout'
    ? (afterWeight ? parseFloat(afterWeight) : null)
    : (weight ? parseFloat(weight) : null);
  const diff = currentWeight && targetWeight ? currentWeight - targetWeight : null;

  // Don't show FAB in historical/read-only mode
  if (isHistorical) return null;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => handleOpen()}
        className="fixed bottom-[5.5rem] right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-[0_4px_20px_rgba(132,204,22,0.4)] flex items-center justify-center active:scale-90 transition-transform"
        aria-label="Log Weight"
      >
        <Scale className="w-6 h-6" />
      </button>

      {/* Bottom Sheet Drawer */}
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="max-h-[85vh]">
          <div className="px-5 pb-safe-bottom pt-2 max-w-md mx-auto w-full">
            <DrawerHeader className="p-0 mb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-primary" />
                <DrawerTitle className="text-lg font-bold">Log Weight</DrawerTitle>
              </div>
              <DrawerDescription className="text-xs text-muted-foreground">
                Select type and enter weight
              </DrawerDescription>
            </DrawerHeader>

            {/* Type Selector Grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {LOG_TYPE_OPTIONS.map((opt) => {
                const isSelected = selectedType === opt.value;
                const isCoreType = CORE_TYPES.includes(opt.value);
                const isLogged = isCoreType && loggedTypes.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleTypeSelect(opt.value)}
                    className={cn(
                      "relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-all min-h-[60px]",
                      isSelected
                        ? `${opt.color} ${opt.selectedBg}`
                        : "border-border text-muted-foreground active:scale-95"
                    )}
                  >
                    {/* Logged checkmark - only for core 4 types */}
                    {isLogged && !isSelected && (
                      <CheckCircle2 className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-green-500" />
                    )}
                    {opt.icon}
                    <span className="leading-tight text-center text-[11px]">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Fixed-height input area to prevent drawer resizing */}
            <div className="min-h-[130px] flex flex-col justify-start">
              {/* Check-in note */}
              {selectedType === 'check-in' && (
                <p className="text-[10px] text-muted-foreground text-center mb-2">
                  Doesn't count toward daily 1/4
                </p>
              )}

              {/* Weight Input */}
              {selectedType === 'extra-workout' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Before</Label>
                      <Input
                        ref={beforeRef}
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={beforeWeight}
                        onChange={(e) => setBeforeWeight(e.target.value)}
                        placeholder="e.g. 146"
                        className="font-mono text-center text-lg h-12"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">After</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={afterWeight}
                        onChange={(e) => setAfterWeight(e.target.value)}
                        placeholder="e.g. 145"
                        className="font-mono text-center text-lg h-12"
                      />
                    </div>
                  </div>
                  <div className="h-5">
                    {beforeWeight && afterWeight && (
                      <p className={cn(
                        "text-center text-sm font-mono font-bold",
                        parseFloat(beforeWeight) - parseFloat(afterWeight) > 0 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {(parseFloat(beforeWeight) - parseFloat(afterWeight)) > 0 ? '-' : '+'}
                        {Math.abs(parseFloat(beforeWeight) - parseFloat(afterWeight)).toFixed(1)} lbs
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    ref={inputRef}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="Enter weight"
                    className="font-mono text-center text-2xl h-14"
                  />
                  {/* vs Target - reserve space to prevent jumping */}
                  <div className="h-5">
                    {diff !== null && !isNaN(diff) && (
                      <p className={cn(
                        "text-center text-sm font-mono",
                        diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : "text-destructive"
                      )}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)} lbs vs target ({targetWeight} lbs)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Save Button */}
            <Button
              onClick={handleSubmit}
              className="w-full mt-2 mb-4 h-12 text-base font-bold"
              disabled={
                selectedType === 'extra-workout'
                  ? !beforeWeight || !afterWeight
                  : !weight
              }
            >
              Save
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
