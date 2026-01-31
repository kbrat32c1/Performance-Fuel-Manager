import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Scale, Sun, Moon, CheckCircle2, Plus, ArrowDownToLine, ArrowUpFromLine, Dumbbell, ChevronDown, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const DURATION_PRESETS = [30, 45, 60, 90, 120] as const;
const SLEEP_PRESETS = [5, 6, 7, 8, 9] as const;

function getCurrentTimeStr(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function formatTimeDisplay(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

type LogTypeOption = 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'extra-workout' | 'check-in';

const CORE_TYPES: LogTypeOption[] = ['morning', 'pre-practice', 'post-practice', 'before-bed'];

const LOG_TYPE_OPTIONS: { value: LogTypeOption; label: string; icon: React.ReactNode; color: string; selectedBg: string }[] = [
  { value: 'morning', label: 'Morning', icon: <Sun className="w-5 h-5" />, color: 'text-yellow-500', selectedBg: 'border-yellow-500 bg-yellow-500/15 ring-1 ring-yellow-500/30' },
  { value: 'pre-practice', label: 'Pre-Practice', icon: <ArrowDownToLine className="w-5 h-5" />, color: 'text-blue-500', selectedBg: 'border-blue-500 bg-blue-500/15 ring-1 ring-blue-500/30' },
  { value: 'post-practice', label: 'Post-Practice', icon: <ArrowUpFromLine className="w-5 h-5" />, color: 'text-green-500', selectedBg: 'border-green-500 bg-green-500/15 ring-1 ring-green-500/30' },
  { value: 'before-bed', label: 'Before Bed', icon: <Moon className="w-5 h-5" />, color: 'text-purple-500', selectedBg: 'border-purple-500 bg-purple-500/15 ring-1 ring-purple-500/30' },
  { value: 'extra-workout', label: 'Extra Workout', icon: <Dumbbell className="w-5 h-5" />, color: 'text-orange-500', selectedBg: 'border-orange-500 bg-orange-500/15 ring-1 ring-orange-500/30' },
  { value: 'check-in', label: 'Check-in', icon: <Scale className="w-5 h-5" />, color: 'text-cyan-500', selectedBg: 'border-cyan-500 bg-cyan-500/15 ring-1 ring-cyan-500/30' },
];

function getDefaultType(loggedTypes?: Set<string>): LogTypeOption {
  if (loggedTypes) {
    for (const t of CORE_TYPES) {
      if (!loggedTypes.has(t)) return t;
    }
  }
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return 'morning';
  if (hour >= 9 && hour < 14) return 'pre-practice';
  if (hour >= 14 && hour < 17) return 'post-practice';
  return 'before-bed';
}

function getTypeInfo(type: LogTypeOption) {
  return LOG_TYPE_OPTIONS.find(o => o.value === type) || LOG_TYPE_OPTIONS[0];
}

export function QuickLogFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<LogTypeOption>(getDefaultType());
  const [weight, setWeight] = useState('');
  const [beforeWeight, setBeforeWeight] = useState('');
  const [afterWeight, setAfterWeight] = useState('');
  const [duration, setDuration] = useState('');
  const [customDuration, setCustomDuration] = useState(false);
  const [sleepHours, setSleepHours] = useState('');
  const [customSleep, setCustomSleep] = useState(false);
  const [logTime, setLogTime] = useState(getCurrentTimeStr());
  const [directMode, setDirectMode] = useState(false);
  const [showTypeGrid, setShowTypeGrid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLInputElement>(null);

  const { profile, logs, addLog, calculateTarget } = useStore();

  const today = profile?.simulatedDate ? new Date(profile.simulatedDate) : new Date();
  const isHistorical = !!profile?.simulatedDate;
  const targetWeight = calculateTarget();

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

  const suggestedWeight = useMemo(() => {
    if (logs.length === 0) return '';
    const sorted = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0].weight.toString();
  }, [logs]);

  const handleOpenFull = useCallback(() => {
    setSelectedType(getDefaultType(loggedTypes));
    setWeight(suggestedWeight);
    setBeforeWeight(suggestedWeight);
    setAfterWeight('');
    setDuration('');
    setCustomDuration(false);
    setSleepHours('');
    setCustomSleep(false);
    setLogTime(getCurrentTimeStr());
    setDirectMode(false);
    setShowTypeGrid(true);
    setIsOpen(true);
  }, [loggedTypes, suggestedWeight]);

  const handleOpenDirect = useCallback((type: LogTypeOption) => {
    setSelectedType(type);
    setWeight(suggestedWeight);
    setBeforeWeight(suggestedWeight);
    setAfterWeight('');
    setDuration('');
    setCustomDuration(false);
    setSleepHours('');
    setCustomSleep(false);
    setLogTime(getCurrentTimeStr());
    setDirectMode(true);
    setShowTypeGrid(false);
    setIsOpen(true);
  }, [suggestedWeight]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type) {
        handleOpenDirect(detail.type as LogTypeOption);
      } else {
        handleOpenFull();
      }
    };
    window.addEventListener('open-quick-log', handler);
    return () => window.removeEventListener('open-quick-log', handler);
  }, [handleOpenDirect, handleOpenFull]);

  const handleTypeSelect = useCallback((type: LogTypeOption) => {
    setSelectedType(type);
  }, []);

  const parsedDuration = duration ? parseInt(duration, 10) : undefined;
  const parsedSleepHours = sleepHours ? parseFloat(sleepHours) : undefined;
  const needsDuration = selectedType === 'extra-workout' || selectedType === 'post-practice';
  const needsSleep = selectedType === 'morning';

  const [inputError, setInputError] = useState(false);
  const flashError = () => { setInputError(true); setTimeout(() => setInputError(false), 1500); };

  const handleSubmit = () => {
    const typeLabel = LOG_TYPE_OPTIONS.find(o => o.value === selectedType)?.label || selectedType;

    if (selectedType === 'extra-workout') {
      if (!beforeWeight || !afterWeight) {
        toast({ title: "Both weights required", description: "Enter before and after workout weights" });
        flashError();
        return;
      }
      if (!duration || parseInt(duration, 10) <= 0) {
        toast({ title: "Enter workout duration", description: "Needed to calculate sweat rate per hour" });
        flashError();
        return;
      }
      const parsedBefore = parseFloat(beforeWeight);
      const parsedAfter = parseFloat(afterWeight);
      if (isNaN(parsedBefore) || isNaN(parsedAfter)) {
        toast({ title: "Invalid number", description: "Please enter valid weights" });
        flashError();
        return;
      }

      const baseDate = new Date(today);
      const [extraH, extraM] = logTime.split(':').map(Number);
      baseDate.setHours(extraH, extraM, 0, 0);

      addLog({ weight: parsedBefore, date: baseDate, type: 'extra-before' });
      addLog({ weight: parsedAfter, date: new Date(baseDate.getTime() + 1000), type: 'extra-after', duration: parsedDuration });

      const loss = parsedBefore - parsedAfter;
      toast({ title: `Extra workout logged`, description: `${loss > 0 ? '-' : '+'}${Math.abs(loss).toFixed(1)} lbs` });
    } else {
      if (!weight) {
        toast({ title: "Enter a weight", description: "Weight field cannot be empty" });
        flashError();
        return;
      }
      const parsedWeight = parseFloat(weight);
      if (isNaN(parsedWeight)) {
        toast({ title: "Invalid number", description: "Please enter a valid weight" });
        flashError();
        return;
      }
      if (parsedWeight < 80 || parsedWeight > 350) {
        toast({ title: "Weight out of range", description: "Enter a weight between 80 and 350 lbs" });
        flashError();
        return;
      }
      if (needsDuration && (!duration || parseInt(duration, 10) <= 0)) {
        toast({ title: "Enter workout duration", description: "Needed to calculate loss per hour" });
        flashError();
        return;
      }
      if (needsSleep && (!sleepHours || parseFloat(sleepHours) <= 0)) {
        toast({ title: "Enter hours of sleep", description: "Needed to track overnight drift per hour" });
        flashError();
        return;
      }

      const logDate = new Date(today);
      const [logH, logM] = logTime.split(':').map(Number);
      logDate.setHours(logH, logM, 0, 0);

      addLog({
        weight: parsedWeight,
        date: logDate,
        type: selectedType,
        ...(selectedType === 'post-practice' && parsedDuration ? { duration: parsedDuration } : {}),
        ...(selectedType === 'morning' && parsedSleepHours ? { sleepHours: parsedSleepHours } : {}),
      });

      toast({ title: `${parsedWeight.toFixed(1)} lbs logged`, description: `${typeLabel} weigh-in saved` });
    }

    setWeight('');
    setBeforeWeight('');
    setAfterWeight('');
    setDuration('');
    setCustomDuration(false);
    setSleepHours('');
    setCustomSleep(false);
    setLogTime(getCurrentTimeStr());
    setIsOpen(false);
  };

  const currentWeight = selectedType === 'extra-workout'
    ? (afterWeight ? parseFloat(afterWeight) : null)
    : (weight ? parseFloat(weight) : null);
  const diff = currentWeight && targetWeight ? currentWeight - targetWeight : null;

  const typeInfo = getTypeInfo(selectedType);

  if (isHistorical) return null;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleOpenFull}
        className="fixed bottom-[7.5rem] right-5 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-[0_4px_20px_rgba(132,204,22,0.4)] flex items-center justify-center active:scale-90 transition-transform"
        aria-label="Log Weight"
      >
        <Scale className="w-5 h-5" />
      </button>

      {/* Full-screen overlay modal instead of Vaul drawer — no jumping on mobile */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel — fixed to bottom, doesn't shift with keyboard */}
          <div className="relative mt-auto w-full max-w-md mx-auto bg-background border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-300">
            {/* Drag handle visual */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-muted" />
            </div>

            <div className="px-5 pb-6 pt-1">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                {directMode && !showTypeGrid ? (
                  <div className="flex items-center gap-2.5">
                    <span className={typeInfo.color}>{typeInfo.icon}</span>
                    <span className={cn("text-xl font-bold", typeInfo.color)}>
                      {typeInfo.label}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-primary" />
                    <span className="text-xl font-bold">Log Weight</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {directMode && !showTypeGrid && (
                    <button
                      onClick={() => setShowTypeGrid(true)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg border border-muted"
                    >
                      Change <ChevronDown className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Type Selector Grid */}
              {showTypeGrid && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {LOG_TYPE_OPTIONS.map((opt) => {
                    const isSelected = selectedType === opt.value;
                    const isCoreType = CORE_TYPES.includes(opt.value);
                    const isLogged = isCoreType && loggedTypes.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          handleTypeSelect(opt.value);
                          if (directMode) setShowTypeGrid(false);
                        }}
                        className={cn(
                          "relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-all",
                          isSelected
                            ? `${opt.color} ${opt.selectedBg}`
                            : "border-border text-muted-foreground active:scale-95"
                        )}
                      >
                        {isLogged && !isSelected && (
                          <CheckCircle2 className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-green-500" />
                        )}
                        {opt.icon}
                        <span className="leading-tight text-center text-[11px]">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Check-in note */}
              {selectedType === 'check-in' && (
                <p className="text-xs text-muted-foreground text-center mb-2">
                  Doesn't count toward daily 4
                </p>
              )}

              {/* Weight Input */}
              {selectedType === 'extra-workout' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Before</Label>
                      <Input
                        ref={beforeRef}
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={beforeWeight}
                        onChange={(e) => setBeforeWeight(e.target.value)}
                        placeholder="e.g. 146"
                        className="font-mono text-center text-xl h-14 text-foreground"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">After</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={afterWeight}
                        onChange={(e) => setAfterWeight(e.target.value)}
                        placeholder="e.g. 145"
                        className="font-mono text-center text-xl h-14 text-foreground"
                      />
                    </div>
                  </div>
                  {/* Always reserve space for loss display */}
                  <p className={cn(
                    "text-center text-sm font-mono font-bold h-5",
                    beforeWeight && afterWeight
                      ? (parseFloat(beforeWeight) - parseFloat(afterWeight) > 0 ? "text-primary" : "text-muted-foreground")
                      : "text-transparent"
                  )}>
                    {beforeWeight && afterWeight
                      ? (() => {
                          const loss = parseFloat(beforeWeight) - parseFloat(afterWeight);
                          const lossStr = `${loss > 0 ? '-' : '+'}${Math.abs(loss).toFixed(1)} lbs`;
                          if (parsedDuration && parsedDuration > 0 && loss > 0) {
                            const lbsPerHr = loss / (parsedDuration / 60);
                            return `${lossStr}  •  ${lbsPerHr.toFixed(2)} lbs/hr`;
                          }
                          return lossStr;
                        })()
                      : '\u00A0'
                    }
                  </p>
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
                    className={cn("font-mono text-center text-3xl h-16 text-foreground transition-colors", inputError && "border-destructive ring-1 ring-destructive/50")}
                  />
                  {/* Always reserve space — prevents layout jump */}
                  <p className={cn(
                    "text-center text-sm font-mono h-5",
                    diff !== null && !isNaN(diff)
                      ? (diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : "text-destructive")
                      : "text-transparent"
                  )}>
                    {diff !== null && !isNaN(diff)
                      ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} lbs vs target (${targetWeight} lbs)`
                      : '\u00A0'
                    }
                  </p>
                </div>
              )}

              {/* Time Picker — always shown */}
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">Time</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLogTime(getCurrentTimeStr())}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                        logTime === getCurrentTimeStr()
                          ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "border-border text-muted-foreground active:scale-95"
                      )}
                    >
                      Now
                    </button>
                    <input
                      type="time"
                      value={logTime}
                      onChange={(e) => setLogTime(e.target.value)}
                      className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs font-mono text-foreground h-8 w-[100px]"
                    />
                  </div>
                </div>
              </div>

              {/* Duration Picker — shown for extra-workout and post-practice */}
              {needsDuration && (
                <div className="mt-3 p-2.5 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    <Label className="text-xs font-bold text-orange-500">Workout Duration *</Label>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">Required — used to calculate your sweat rate (lbs/hr)</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {DURATION_PRESETS.map((mins) => (
                      <button
                        key={mins}
                        onClick={() => { setDuration(mins.toString()); setCustomDuration(false); }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                          duration === mins.toString() && !customDuration
                            ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                            : "border-border text-muted-foreground active:scale-95"
                        )}
                      >
                        {mins >= 60 ? `${(mins / 60).toFixed(mins % 60 === 0 ? 0 : 1)}hr` : `${mins}m`}
                      </button>
                    ))}
                    <button
                      onClick={() => { setCustomDuration(true); setDuration(''); }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        customDuration
                          ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "border-border text-muted-foreground active:scale-95"
                      )}
                    >
                      Custom
                    </button>
                  </div>
                  {customDuration && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        placeholder="Minutes"
                        className="font-mono text-center h-10 w-24 text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  )}
                </div>
              )}

              {/* Sleep Hours Picker — shown for morning weigh-in */}
              {needsSleep && (
                <div className="mt-3 p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Moon className="w-3.5 h-3.5 text-purple-500" />
                    <Label className="text-xs font-bold text-purple-500">Hours of Sleep *</Label>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">Required — used to track overnight drift per hour</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {SLEEP_PRESETS.map((hrs) => (
                      <button
                        key={hrs}
                        onClick={() => { setSleepHours(hrs.toString()); setCustomSleep(false); }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                          sleepHours === hrs.toString() && !customSleep
                            ? "border-purple-500 bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30"
                            : "border-border text-muted-foreground active:scale-95"
                        )}
                      >
                        {hrs}hr
                      </button>
                    ))}
                    <button
                      onClick={() => { setCustomSleep(true); setSleepHours(''); }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        customSleep
                          ? "border-purple-500 bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30"
                          : "border-border text-muted-foreground active:scale-95"
                      )}
                    >
                      Custom
                    </button>
                  </div>
                  {customSleep && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={sleepHours}
                        onChange={(e) => setSleepHours(e.target.value)}
                        placeholder="Hours"
                        className="font-mono text-center h-10 w-24 text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">hrs</span>
                    </div>
                  )}
                </div>
              )}

              {/* Save Button — large touch target */}
              <Button
                onClick={handleSubmit}
                className="w-full mt-4 h-13 text-lg font-bold rounded-xl"
                style={{ minHeight: '52px' }}
                disabled={
                  selectedType === 'extra-workout'
                    ? !beforeWeight || !afterWeight || !duration || parseInt(duration, 10) <= 0
                    : !weight || (needsDuration && (!duration || parseInt(duration, 10) <= 0)) || (needsSleep && (!sleepHours || parseFloat(sleepHours) <= 0))
                }
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
