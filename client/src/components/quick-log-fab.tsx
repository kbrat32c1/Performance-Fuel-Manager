import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Scale, Sun, Moon, CheckCircle2, Check, Plus, ArrowDownToLine, ArrowUpFromLine, Dumbbell, ChevronDown, X, Clock, Trash2, Utensils, Droplets } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { hapticSuccess, hapticError, hapticTap } from '@/lib/haptics';
import { QuickLogWaterTab } from './quick-log-water-tab';

type FabTab = 'weight' | 'food' | 'water';

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

type LogTypeOption = 'morning' | 'pre-practice' | 'post-practice' | 'before-bed' | 'extra-workout' | 'check-in' | 'weigh-in';

const CORE_TYPES: LogTypeOption[] = ['morning', 'pre-practice', 'post-practice', 'before-bed'];

const LOG_TYPE_OPTIONS: { value: LogTypeOption; label: string; hint: string; icon: React.ReactNode; color: string; selectedBg: string }[] = [
  { value: 'morning', label: 'Morning', hint: 'First thing after waking', icon: <Sun className="w-5 h-5" />, color: 'text-yellow-500', selectedBg: 'border-yellow-500 bg-yellow-500/15 ring-1 ring-yellow-500/30' },
  { value: 'pre-practice', label: 'Pre-Practice', hint: 'Before workout', icon: <ArrowDownToLine className="w-5 h-5" />, color: 'text-blue-500', selectedBg: 'border-blue-500 bg-blue-500/15 ring-1 ring-blue-500/30' },
  { value: 'post-practice', label: 'Post-Practice', hint: 'After workout, before rehydrating', icon: <ArrowUpFromLine className="w-5 h-5" />, color: 'text-green-500', selectedBg: 'border-green-500 bg-green-500/15 ring-1 ring-green-500/30' },
  { value: 'before-bed', label: 'Before Bed', hint: 'Last weigh-in of the day', icon: <Moon className="w-5 h-5" />, color: 'text-purple-500', selectedBg: 'border-purple-500 bg-purple-500/15 ring-1 ring-purple-500/30' },
  { value: 'extra-workout', label: 'Extra Workout', hint: 'Track additional sessions', icon: <Dumbbell className="w-5 h-5" />, color: 'text-orange-500', selectedBg: 'border-orange-500 bg-orange-500/15 ring-1 ring-orange-500/30' },
  { value: 'check-in', label: 'Weight Check', hint: 'Quick check, not counted', icon: <Scale className="w-5 h-5" />, color: 'text-cyan-500', selectedBg: 'border-cyan-500 bg-cyan-500/15 ring-1 ring-cyan-500/30' },
  { value: 'weigh-in', label: 'Official Weigh-In', hint: 'Competition day weigh-in', icon: <Scale className="w-5 h-5" />, color: 'text-yellow-600', selectedBg: 'border-yellow-600 bg-yellow-600/15 ring-1 ring-yellow-600/30' },
];

const EXTRA_TYPES: LogTypeOption[] = ['extra-workout', 'check-in'];

const LAST_WEIGHT_TYPE_KEY = 'pfm-last-weight-type';
const LAST_WEIGHT_TYPE_DATE_KEY = 'pfm-last-weight-type-date';

function getTimeBasedType(): LogTypeOption {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 14) return 'morning';     // 5am–2pm: morning weigh-in
  if (hour >= 14 && hour < 16) return 'pre-practice'; // 2pm–4pm: heading to practice
  if (hour >= 16 && hour < 19) return 'post-practice'; // 4pm–7pm: practice wrapping up
  return 'before-bed';                                  // 7pm+: wind down
}

function getDefaultType(loggedTypes?: Set<string>): LogTypeOption {
  // First check if user has a stored preference from today
  try {
    const storedType = localStorage.getItem(LAST_WEIGHT_TYPE_KEY) as LogTypeOption | null;
    const storedDate = localStorage.getItem(LAST_WEIGHT_TYPE_DATE_KEY);
    const today = new Date().toDateString();

    // If user overrode the suggestion today, use their preference
    if (storedType && storedDate === today && CORE_TYPES.includes(storedType)) {
      // But only if they haven't already logged this type today
      if (!loggedTypes?.has(storedType)) {
        return storedType;
      }
    }
  } catch {
    // localStorage not available, fall through to time-based
  }

  // Check for next unlogged type in order
  if (loggedTypes) {
    const timeBased = getTimeBasedType();
    const hasExtraWorkout = loggedTypes.has('extra-workout');

    for (const t of CORE_TYPES) {
      if (loggedTypes.has(t)) continue;

      // If user logged an extra workout but skipped regular practice,
      // don't suggest pre/post-practice if it's already past that time window.
      // They clearly chose an extra workout instead of regular practice today.
      if (hasExtraWorkout && !loggedTypes.has('pre-practice') && !loggedTypes.has('post-practice')) {
        if (t === 'pre-practice' && (timeBased === 'post-practice' || timeBased === 'before-bed')) continue;
        if (t === 'post-practice' && timeBased === 'before-bed') continue;
      }

      return t;
    }
  }

  // Fall back to time-based default
  return getTimeBasedType();
}

function saveTypePreference(type: LogTypeOption) {
  try {
    localStorage.setItem(LAST_WEIGHT_TYPE_KEY, type);
    localStorage.setItem(LAST_WEIGHT_TYPE_DATE_KEY, new Date().toDateString());
  } catch {
    // localStorage not available
  }
}

function getTypeInfo(type: LogTypeOption) {
  return LOG_TYPE_OPTIONS.find(o => o.value === type) || LOG_TYPE_OPTIONS[0];
}

/* ── Scrollable Time Wheel Picker ── */
function TimeScrollColumn({ items, selected, onSelect }: { items: string[]; selected: string; onSelect: (v: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemH = 36;
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Scroll to selected on mount and when selected changes externally
  useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0 && containerRef.current && !isScrollingRef.current) {
      containerRef.current.scrollTop = idx * itemH;
    }
  }, [selected, items]);

  const handleScroll = useCallback(() => {
    isScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const idx = Math.round(containerRef.current.scrollTop / itemH);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      containerRef.current.scrollTo({ top: clamped * itemH, behavior: 'smooth' });
      onSelect(items[clamped]);
      setTimeout(() => { isScrollingRef.current = false; }, 100);
    }, 80);
  }, [items, onSelect]);

  return (
    <div className="relative h-[108px] w-16 overflow-hidden">
      {/* Fade overlays */}
      <div className="absolute top-0 left-0 right-0 h-[36px] bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-[36px] bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />
      {/* Selection highlight */}
      <div className="absolute top-[36px] left-0 right-0 h-[36px] border-y border-primary/30 bg-primary/5 z-0 pointer-events-none rounded-sm" />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        style={{ scrollSnapType: 'y mandatory', paddingTop: itemH, paddingBottom: itemH }}
      >
        {items.map((item) => (
          <div
            key={item}
            className={cn(
              "h-[36px] flex items-center justify-center snap-center cursor-pointer transition-all select-none",
              item === selected
                ? "text-foreground font-bold text-lg"
                : "text-muted-foreground/50 text-sm"
            )}
            onClick={() => {
              const idx = items.indexOf(item);
              containerRef.current?.scrollTo({ top: idx * itemH, behavior: 'smooth' });
              onSelect(item);
            }}
          >
            <span className="font-mono">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM = ['AM', 'PM'];

function TimeScrollPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // value is 24h "HH:mm"
  const [h24, m] = value.split(':').map(Number);
  const isPM = h24 >= 12;
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;

  const selectedHour = String(h12).padStart(2, '0');
  const selectedMin = String(m).padStart(2, '0');
  const selectedAmPm = isPM ? 'PM' : 'AM';

  const update = useCallback((hour12: string, min: string, ampm: string) => {
    let h = parseInt(hour12, 10);
    if (ampm === 'AM') {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    onChange(`${String(h).padStart(2, '0')}:${min}`);
  }, [onChange]);

  return (
    <div className="flex items-center justify-center gap-0 bg-card border border-muted rounded-lg py-1 px-2">
      <TimeScrollColumn
        items={HOURS_12}
        selected={selectedHour}
        onSelect={(h) => update(h, selectedMin, selectedAmPm)}
      />
      <span className="text-xl font-bold text-muted-foreground mx-0.5">:</span>
      <TimeScrollColumn
        items={MINUTES}
        selected={selectedMin}
        onSelect={(min) => update(selectedHour, min, selectedAmPm)}
      />
      <TimeScrollColumn
        items={AMPM}
        selected={selectedAmPm}
        onSelect={(ap) => update(selectedHour, selectedMin, ap)}
      />
    </div>
  );
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
  const [showExtraTypes, setShowExtraTypes] = useState(false);
  const [fabSuccess, setFabSuccess] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  // Edit mode state
  const [editLogId, setEditLogId] = useState<string | null>(null);
  const [editExtraIds, setEditExtraIds] = useState<{ beforeId: string; afterId: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmWildcard, setConfirmWildcard] = useState(false);
  // Missing before-bed prompt: when morning log is submitted without last night's before-bed
  const [missingBeforeBed, setMissingBeforeBed] = useState<'prompt' | 'confirm-avg' | null>(null);
  // When true, the next before-bed save should be backdated to yesterday 10pm
  const [backdateBeforeBed, setBackdateBeforeBed] = useState(false);
  // Saved morning form data — restored after logging a backdated before-bed
  const [savedMorningData, setSavedMorningData] = useState<{ weight: string; time: string; sleepHours: string } | null>(null);
  // Original weight for comparison in edit mode
  const [originalWeight, setOriginalWeight] = useState<number | null>(null);
  const [originalBeforeWeight, setOriginalBeforeWeight] = useState<number | null>(null);
  const [originalAfterWeight, setOriginalAfterWeight] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<FabTab>('weight');
  // macroHint removed — food tab now opens AddFoodFlow directly
  const inputRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLInputElement>(null);

  const { profile, logs, addLog, updateLog, deleteLog, calculateTarget, getDaysUntilWeighIn } = useStore();

  const today = profile?.simulatedDate ? new Date(profile.simulatedDate) : new Date();
  const isHistorical = !!profile?.simulatedDate;
  const targetWeight = calculateTarget();
  const isSparProtocol = profile?.protocol === '5' || profile?.protocol === '6';

  // Onboarding tooltip logic - show if no logs ever, or no logs in 7+ days
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const TOOLTIP_DISMISSED_KEY = 'pfm-fab-tooltip-dismissed';
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    // Check if tooltip was dismissed recently
    try {
      const dismissedAt = localStorage.getItem(TOOLTIP_DISMISSED_KEY);
      if (dismissedAt) {
        const dismissedTime = parseInt(dismissedAt, 10);
        if (Date.now() - dismissedTime < SEVEN_DAYS_MS) {
          return; // Dismissed within last 7 days
        }
      }
    } catch {
      // localStorage not available
    }

    // Show tooltip if no logs, or most recent log is 7+ days old
    if (logs.length === 0) {
      setShowTooltip(true);
    } else {
      const sorted = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastLogTime = new Date(sorted[0].date).getTime();
      if (Date.now() - lastLogTime > SEVEN_DAYS_MS) {
        setShowTooltip(true);
      }
    }
  }, [logs]);

  const dismissTooltip = useCallback(() => {
    setShowTooltip(false);
    try {
      localStorage.setItem('pfm-fab-tooltip-dismissed', Date.now().toString());
    } catch {
      // localStorage not available
    }
  }, []);

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

  const isEditMode = !!editLogId || !!editExtraIds;

  const resetForm = useCallback(() => {
    setWeight('');
    setBeforeWeight('');
    setAfterWeight('');
    setDuration('');
    setCustomDuration(false);
    setSleepHours('');
    setConfirmWildcard(false);
    setInputErrorMsg(null);
    setShowMoreOptions(false);
    setCustomSleep(false);
    setLogTime(getCurrentTimeStr());
    setEditLogId(null);
    setEditExtraIds(null);
    setConfirmDelete(false);
    setMissingBeforeBed(null);
    setBackdateBeforeBed(false);
    setOriginalWeight(null);
    setOriginalBeforeWeight(null);
    setOriginalAfterWeight(null);
    setShowExtraTypes(false);
    setActiveTab('weight');
  }, []);

  const handleOpenFull = useCallback(() => {
    resetForm();
    setSelectedType(getDefaultType(loggedTypes));
    setWeight(suggestedWeight);
    setBeforeWeight(suggestedWeight);
    setDirectMode(false);
    setShowTypeGrid(true);
    setIsOpen(true);
  }, [loggedTypes, suggestedWeight, resetForm]);

  const handleOpenDirect = useCallback((type: LogTypeOption) => {
    resetForm();
    setSelectedType(type);
    setWeight(suggestedWeight);
    setBeforeWeight(suggestedWeight);
    setDirectMode(true);
    setShowTypeGrid(false);
    setIsOpen(true);
  }, [suggestedWeight, resetForm]);

  const handleOpenEdit = useCallback((logId: string, type: LogTypeOption, logWeight: number, logDate: Date, logDuration?: number, logSleepHours?: number) => {
    resetForm();
    setEditLogId(logId);
    setSelectedType(type);
    setWeight(logWeight.toString());
    setOriginalWeight(logWeight); // Store original for comparison
    const d = new Date(logDate);
    setLogTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    if (logDuration) {
      setDuration(logDuration.toString());
      if (!DURATION_PRESETS.includes(logDuration as any)) setCustomDuration(true);
    }
    if (logSleepHours) {
      setSleepHours(logSleepHours.toString());
      if (!SLEEP_PRESETS.includes(logSleepHours as any)) setCustomSleep(true);
    }
    setShowMoreOptions(true); // Always show time picker in edit mode
    setDirectMode(true);
    setShowTypeGrid(false);
    setIsOpen(true);
  }, [resetForm]);

  const handleOpenEditExtra = useCallback((beforeLog: any, afterLog: any | null) => {
    resetForm();
    setShowMoreOptions(true); // Always show time picker in edit mode
    setSelectedType('extra-workout');
    setBeforeWeight(beforeLog.weight.toString());
    setOriginalBeforeWeight(beforeLog.weight); // Store original for comparison
    setAfterWeight(afterLog ? afterLog.weight.toString() : '');
    setOriginalAfterWeight(afterLog ? afterLog.weight : null); // Store original for comparison
    setEditExtraIds({ beforeId: beforeLog.id, afterId: afterLog?.id || null });
    const d = new Date(beforeLog.date);
    setLogTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    if (afterLog?.duration) {
      setDuration(afterLog.duration.toString());
      if (!DURATION_PRESETS.includes(afterLog.duration as any)) setCustomDuration(true);
    }
    setDirectMode(true);
    setShowTypeGrid(false);
    setIsOpen(true);
  }, [resetForm]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.editExtraWorkout) {
        // Edit extra workout: pre-fill before/after
        const { before, after } = detail.editExtraWorkout;
        handleOpenEditExtra(before, after);
      } else if (detail?.editLog) {
        // Edit mode: pre-fill from existing log
        const log = detail.editLog;
        handleOpenEdit(log.id, log.type as LogTypeOption, log.weight, new Date(log.date), log.duration, log.sleepHours);
      } else if (detail?.openTab === 'food') {
        // Food tab → open AddFoodFlow sheet instead of FAB
        window.dispatchEvent(new CustomEvent('open-add-food', { detail: {} }));
      } else if (detail?.openTab) {
        // Other tabs (water) — open in FAB as normal
        setActiveTab(detail.openTab as FabTab);
        setIsOpen(true);
      } else if (detail?.type) {
        handleOpenDirect(detail.type as LogTypeOption);
      } else {
        handleOpenFull();
      }
    };
    window.addEventListener('open-quick-log', handler);
    return () => window.removeEventListener('open-quick-log', handler);
  }, [handleOpenDirect, handleOpenFull, handleOpenEdit, handleOpenEditExtra]);

  // Handle PWA shortcut: ?action=log-weight opens the FAB immediately
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'log-weight') {
      handleOpenFull();
      // Clean up the URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [handleOpenFull]);

  const handleTypeSelect = useCallback((type: LogTypeOption) => {
    setSelectedType(type);
    // Save preference if user selects a different type than time-based suggestion
    if (type !== getTimeBasedType() && CORE_TYPES.includes(type)) {
      saveTypePreference(type);
    }
  }, []);

  const parsedDuration = duration ? parseInt(duration, 10) : undefined;
  const parsedSleepHours = sleepHours ? parseFloat(sleepHours) : undefined;
  const needsDuration = selectedType === 'extra-workout' || selectedType === 'post-practice';
  const needsSleep = selectedType === 'morning';

  const [inputError, setInputError] = useState(false);
  const [inputErrorMsg, setInputErrorMsg] = useState<string | null>(null);
  const flashError = (msg?: string) => { setInputError(true); setInputErrorMsg(msg || null); hapticError(); setTimeout(() => setInputError(false), 1500); };

  const handleSubmit = () => {
    const typeLabel = LOG_TYPE_OPTIONS.find(o => o.value === selectedType)?.label || selectedType;

    if (selectedType === 'extra-workout') {
      if (!beforeWeight || !afterWeight) {
        toast({ title: "Both weights required", description: "Enter before and after workout weights" });
        flashError("Enter both before and after weights");
        return;
      }
      if (!duration || parseInt(duration, 10) <= 0) {
        toast({ title: "Enter workout duration", description: "Needed to calculate sweat rate per hour" });
        flashError("Duration is required");
        return;
      }
      const parsedBefore = parseFloat(beforeWeight);
      const parsedAfter = parseFloat(afterWeight);
      if (isNaN(parsedBefore) || isNaN(parsedAfter)) {
        toast({ title: "Invalid number", description: "Please enter valid weights" });
        flashError("Enter valid numbers");
        return;
      }

      const baseDate = new Date(today);
      const [extraH, extraM] = logTime.split(':').map(Number);
      baseDate.setHours(extraH, extraM, 0, 0);

      // If editing, delete old logs first
      if (editExtraIds) {
        deleteLog(editExtraIds.beforeId);
        if (editExtraIds.afterId) deleteLog(editExtraIds.afterId);
      }

      addLog({ weight: parsedBefore, date: baseDate, type: 'extra-before' });
      addLog({ weight: parsedAfter, date: new Date(baseDate.getTime() + 1000), type: 'extra-after', duration: parsedDuration });

      const loss = parsedBefore - parsedAfter;
      hapticSuccess();
      toast({ title: editExtraIds ? 'Extra workout updated' : 'Extra workout logged', description: `${loss > 0 ? '-' : '+'}${Math.abs(loss).toFixed(1)} lbs` });

      // Trigger FAB success animation
      setFabSuccess(true);
      setTimeout(() => setFabSuccess(false), 1500);

      // Dispatch event for AI coach to refresh
      window.dispatchEvent(new CustomEvent('weight-logged'));
    } else {
      if (!weight) {
        toast({ title: "Enter a weight", description: "Weight field cannot be empty" });
        flashError("Weight is required");
        return;
      }
      const parsedWeight = parseFloat(weight);
      if (isNaN(parsedWeight)) {
        toast({ title: "Invalid number", description: "Please enter a valid weight" });
        flashError("Enter a valid number");
        return;
      }
      if (parsedWeight < 80 || parsedWeight > 350) {
        toast({ title: "Weight out of range", description: "Enter a weight between 80 and 350 lbs" });
        flashError("Weight must be 80–350 lbs");
        return;
      }
      // Wildcard weight warning: confirm if 10+ lbs different from most recent log
      if (!confirmWildcard && !isEditMode && logs.length > 0) {
        const recentWeight = parseFloat(suggestedWeight);
        if (!isNaN(recentWeight) && Math.abs(parsedWeight - recentWeight) >= 10) {
          setConfirmWildcard(true);
          toast({
            title: `${Math.abs(parsedWeight - recentWeight).toFixed(1)} lbs ${parsedWeight > recentWeight ? 'higher' : 'lower'} than last log`,
            description: "Tap Save again to confirm, or fix the weight",
          });
          return;
        }
      }
      if (needsDuration && (!duration || parseInt(duration, 10) <= 0)) {
        toast({ title: "Enter workout duration", description: "Needed to calculate loss per hour" });
        flashError("Duration is required");
        return;
      }
      if (needsSleep && (!sleepHours || parseFloat(sleepHours) <= 0)) {
        toast({ title: "Enter hours of sleep", description: "Needed to track overnight drift per hour" });
        flashError("Sleep hours required");
        return;
      }

      // Check for missing before-bed log when submitting a morning weigh-in
      if (selectedType === 'morning' && !isEditMode && !missingBeforeBed) {
        // Look for a before-bed log from yesterday evening (or late last night)
        const yesterdayStart = new Date(today);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        yesterdayStart.setHours(0, 0, 0, 0);
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        const hasBeforeBed = logs.some(l => {
          const logDate = new Date(l.date);
          // before-bed from yesterday (anytime) or today before 4am (late night)
          return l.type === 'before-bed' && (
            (logDate >= yesterdayStart && logDate < todayStart) ||
            (logDate >= todayStart && logDate.getHours() < 4)
          );
        });

        if (!hasBeforeBed) {
          setMissingBeforeBed('prompt');
          return;
        }
      }

      // If user confirmed "use average" for missing before-bed, auto-create the log
      if (selectedType === 'morning' && missingBeforeBed === 'confirm-avg') {
        // Calculate average before-bed weight from recent logs (EMA-like, last 5)
        const recentBedWeights = logs
          .filter(l => l.type === 'before-bed')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5)
          .map(l => l.weight);

        if (recentBedWeights.length > 0) {
          const avgBedWeight = recentBedWeights.reduce((a, b) => a + b, 0) / recentBedWeights.length;
          // Create a before-bed log for last night at 10pm
          const bedDate = new Date(today);
          bedDate.setDate(bedDate.getDate() - 1);
          bedDate.setHours(22, 0, 0, 0);
          addLog({
            weight: parseFloat(avgBedWeight.toFixed(1)),
            date: bedDate,
            type: 'before-bed',
          });
          toast({
            title: `Before-bed log added: ${avgBedWeight.toFixed(1)} lbs`,
            description: "Used your recent average. Edit in log history if needed."
          });
        }
        setMissingBeforeBed(null);
      }

      let logDate = new Date(today);
      const [logH, logM] = logTime.split(':').map(Number);
      logDate.setHours(logH, logM, 0, 0);

      // If this is a backdated before-bed entry (from missing prompt), set to yesterday 10pm
      const isBackdatedBeforeBed = backdateBeforeBed && selectedType === 'before-bed';
      if (isBackdatedBeforeBed) {
        logDate = new Date(today);
        logDate.setDate(logDate.getDate() - 1);
        logDate.setHours(22, 0, 0, 0);
        setBackdateBeforeBed(false);
      }

      if (isEditMode && editLogId) {
        // Update existing log
        const updates: any = { weight: parsedWeight, date: logDate };
        if (selectedType === 'post-practice' && parsedDuration) updates.duration = parsedDuration;
        if (selectedType === 'morning' && parsedSleepHours) updates.sleepHours = parsedSleepHours;
        updateLog(editLogId, updates);
        hapticSuccess();
        toast({ title: `Updated to ${parsedWeight.toFixed(1)} lbs`, description: `${typeLabel} weigh-in updated` });
      } else {
        // Add new log
        addLog({
          weight: parsedWeight,
          date: logDate,
          type: selectedType,
          ...(selectedType === 'post-practice' && parsedDuration ? { duration: parsedDuration } : {}),
          ...(selectedType === 'morning' && parsedSleepHours ? { sleepHours: parsedSleepHours } : {}),
        });
        hapticSuccess();

        // If we just saved a backdated before-bed, restore the morning form instead of closing
        if (isBackdatedBeforeBed && savedMorningData) {
          toast({ title: `${parsedWeight.toFixed(1)} lbs saved to last night`, description: "Now save your morning weight" });
          setSelectedType('morning');
          setWeight(savedMorningData.weight);
          setLogTime(savedMorningData.time);
          setSleepHours(savedMorningData.sleepHours);
          setSavedMorningData(null);
          setMissingBeforeBed(null);
          // Dispatch event for AI coach to refresh
          window.dispatchEvent(new CustomEvent('weight-logged'));
          return; // Don't close the modal — let user save the morning weight
        }

        // Show toast with weight vs GOAL weight comparison (not daily checkpoint)
        // Skip toast on competition day when making weight — CelebrationBanner handles it
        const goalWeight = profile.targetWeightClass;
        const weightDiff = parsedWeight - goalWeight;
        const isCompDay = getDaysUntilWeighIn() === 0;
        const willCelebrate = isCompDay && (selectedType === 'weigh-in' || selectedType === 'morning') && parsedWeight <= goalWeight;
        if (!willCelebrate) {
          // Weight checks just confirm the log — no target comparison
          const isInfoOnly = selectedType === 'check-in';
          const targetComparison = isSparProtocol || isInfoOnly
            ? `${typeLabel} logged`
            : weightDiff <= 0
              ? `${typeLabel} — ${Math.abs(weightDiff).toFixed(1)} lbs under goal`
              : `${typeLabel} — ${weightDiff.toFixed(1)} lbs over goal (${goalWeight})`;
          toast({ title: `${parsedWeight.toFixed(1)} lbs logged`, description: targetComparison });
        }

        // Trigger FAB success animation
        setFabSuccess(true);
        setTimeout(() => setFabSuccess(false), 1500);

        // Dispatch event for AI coach to refresh
        window.dispatchEvent(new CustomEvent('weight-logged'));
      }
    }

    resetForm();
    setIsOpen(false);
  };

  const handleDelete = () => {
    if (!editLogId && !editExtraIds) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editExtraIds) {
      deleteLog(editExtraIds.beforeId);
      if (editExtraIds.afterId) deleteLog(editExtraIds.afterId);
      toast({ title: "Deleted", description: "Extra workout removed" });
    } else if (editLogId) {
      const typeLabel = LOG_TYPE_OPTIONS.find(o => o.value === selectedType)?.label || selectedType;
      deleteLog(editLogId);
      toast({ title: "Deleted", description: `${typeLabel} weigh-in removed` });
    }
    resetForm();
    setIsOpen(false);
  };

  const currentWeight = selectedType === 'extra-workout'
    ? (afterWeight ? parseFloat(afterWeight) : null)
    : (weight ? parseFloat(weight) : null);
  // Compare against walk-around weight during training phase, target during comp week
  const daysOut = getDaysUntilWeighIn();
  const isTrainingPhase = daysOut > 5;
  const goalWeightForDiff = isTrainingPhase
    ? Math.round(profile.targetWeightClass * 1.07 * 10) / 10
    : profile.targetWeightClass;
  const diff = currentWeight && goalWeightForDiff ? currentWeight - goalWeightForDiff : null;

  const typeInfo = getTypeInfo(selectedType);

  return (
    <>
      {/* Onboarding tooltip — portaled to body so it's not clipped by nav */}
      {showTooltip && !isOpen && createPortal(
        <div className="fixed bottom-[5.5rem] left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="relative bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-lg max-w-[180px]">
            <button
              onClick={dismissTooltip}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-background text-foreground flex items-center justify-center text-xs shadow-md"
              aria-label="Dismiss tooltip"
            >
              <X className="w-3 h-3" />
            </button>
            <p className="text-xs font-medium leading-tight text-center">
              {logs.length === 0 ? "Tap here to log your first weight!" : "Welcome back! Tap here to log your weight"}
            </p>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-primary" />
          </div>
        </div>,
        document.body
      )}

      {/* Center nav button — inline in the nav bar */}
      <button
        onClick={() => { hapticTap(); handleOpenFull(); dismissTooltip(); }}
        className="flex flex-col items-center active:scale-90 transition-transform pb-1"
        aria-label="Log Weight"
      >
        <div className={cn(
          "w-[52px] h-[52px] rounded-2xl flex items-center justify-center transition-all duration-300 border-[3px] border-background",
          fabSuccess
            ? "bg-green-500 text-white shadow-[0_2px_12px_rgba(34,197,94,0.4)]"
            : "bg-primary text-primary-foreground shadow-[0_2px_12px_rgba(232,80,30,0.35)]"
        )}>
          {fabSuccess ? (
            <Check className="w-6 h-6 animate-check-bounce" />
          ) : (
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          )}
        </div>
        <span className={cn(
          "text-[10px] font-medium uppercase tracking-wider mt-0.5 transition-colors duration-300",
          fabSuccess ? "text-green-500" : "text-primary"
        )}>
          {fabSuccess ? "Saved!" : "Log"}
        </span>
      </button>

      {/* Full-screen overlay modal — portaled to body so it's not clipped by nav */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-labelledby="quick-log-title">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 animate-in fade-in duration-200"
            onClick={() => { setIsOpen(false); resetForm(); }}
            aria-hidden="true"
          />

          {/* Panel — fixed to bottom, doesn't shift with keyboard */}
          <div className="relative mt-auto w-full max-w-md mx-auto bg-background border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-300 max-h-[80vh] flex flex-col" role="document">
            {/* Drag handle — tappable to close */}
            <div
              className="flex justify-center pt-3 pb-1 shrink-0 cursor-pointer"
              onClick={() => { setIsOpen(false); resetForm(); }}
            >
              <div className="w-12 h-1.5 rounded-full bg-muted" />
            </div>

            {/* Tab bar — hidden in edit mode */}
            {!isEditMode && (
              <div className="flex items-center gap-1 px-3 pt-1 pb-2 shrink-0 border-b border-muted/30">
                {([
                  { key: 'weight' as FabTab, label: 'Weight', Icon: Scale },
                  { key: 'food' as FabTab, label: 'Food', Icon: Utensils },
                  { key: 'water' as FabTab, label: 'Water', Icon: Droplets },
                ]).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === 'food') {
                        // Food tab → close FAB and open AddFoodFlow
                        setIsOpen(false);
                        resetForm();
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('open-add-food', { detail: {} }));
                        }, 100);
                      } else {
                        setActiveTab(key);
                      }
                      hapticTap();
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-all active:scale-95",
                      activeTab === key
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
                {/* Close button — always visible in tab bar */}
                <button
                  onClick={() => { setIsOpen(false); resetForm(); }}
                  className="ml-1 p-2 min-w-[40px] min-h-[40px] rounded-lg hover:bg-muted text-muted-foreground active:scale-95 transition-all flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* ── Weight Tab ── */}
            {activeTab === 'weight' && (
            <div className="px-5 pb-6 pt-1 overflow-y-auto flex-1">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                {directMode && !showTypeGrid ? (
                  <div className="flex items-center gap-2.5">
                    <span className={typeInfo.color} aria-hidden="true">{typeInfo.icon}</span>
                    <h2 id="quick-log-title" className={cn("text-xl font-bold", typeInfo.color)}>
                      {isEditMode ? `Edit ${typeInfo.label}` : typeInfo.label}
                    </h2>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-primary" aria-hidden="true" />
                    <h2 id="quick-log-title" className="text-xl font-bold">Log Weight</h2>
                  </div>
                )}
                {directMode && !showTypeGrid && !isEditMode && (
                  <button
                    onClick={() => setShowTypeGrid(true)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 min-h-[40px] rounded-lg border border-muted active:scale-95 transition-transform"
                  >
                    Change <ChevronDown className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Type Selector Grid — hidden in edit mode */}
              {showTypeGrid && !isEditMode && (
                <div className="mb-4">
                  {/* Core types - 2x2 grid with hints */}
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Select weigh-in type">
                    {LOG_TYPE_OPTIONS.filter(opt => CORE_TYPES.includes(opt.value)).map((opt) => {
                      const isSelected = selectedType === opt.value;
                      const isLogged = loggedTypes.has(opt.value);
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            handleTypeSelect(opt.value);
                            if (directMode) setShowTypeGrid(false);
                          }}
                          className={cn(
                            "relative flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-xs font-medium transition-all min-h-[80px]",
                            isSelected
                              ? `${opt.color} ${opt.selectedBg}`
                              : "border-border text-muted-foreground active:scale-95"
                          )}
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={`${opt.label}${isLogged ? ', already logged today' : ''}`}
                        >
                          {isLogged && !isSelected && (
                            <CheckCircle2 className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-green-500" aria-hidden="true" />
                          )}
                          <span aria-hidden="true">{opt.icon}</span>
                          <span className="leading-tight text-center text-[11px] font-bold">{opt.label}</span>
                          <span className="leading-tight text-center text-[9px] text-muted-foreground">{opt.hint}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* More options toggle */}
                  <button
                    onClick={() => setShowExtraTypes(!showExtraTypes)}
                    className="w-full mt-2 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
                  >
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showExtraTypes && "rotate-180")} />
                    {showExtraTypes ? 'Hide options' : 'More options'}
                  </button>

                  {/* Extra types - shown when expanded */}
                  {showExtraTypes && (
                    <div className="grid grid-cols-2 gap-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                      {LOG_TYPE_OPTIONS.filter(opt => EXTRA_TYPES.includes(opt.value)).map((opt) => {
                        const isSelected = selectedType === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => {
                              handleTypeSelect(opt.value);
                              if (directMode) setShowTypeGrid(false);
                            }}
                            className={cn(
                              "relative flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-xs font-medium transition-all min-h-[80px]",
                              isSelected
                                ? `${opt.color} ${opt.selectedBg}`
                                : "border-border text-muted-foreground active:scale-95"
                            )}
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={opt.label}
                          >
                            <span aria-hidden="true">{opt.icon}</span>
                            <span className="leading-tight text-center text-[11px] font-bold">{opt.label}</span>
                            <span className="leading-tight text-center text-[9px] text-muted-foreground">{opt.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                  {/* Original values banner for extra workout edit mode */}
                  {isEditMode && editExtraIds && (originalBeforeWeight !== null || originalAfterWeight !== null) && (
                    <div className="bg-muted/30 border border-muted rounded-lg px-3 py-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Original</p>
                      <p className="text-sm font-mono text-muted-foreground">
                        {originalBeforeWeight?.toFixed(1)} → {originalAfterWeight?.toFixed(1)} lbs
                      </p>
                    </div>
                  )}
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
                  {/* Original value banner for edit mode */}
                  {isEditMode && originalWeight !== null && (
                    <div className="bg-muted/30 border border-muted rounded-lg px-3 py-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Original</p>
                      <p className="text-sm font-mono text-muted-foreground">{originalWeight.toFixed(1)} lbs</p>
                    </div>
                  )}
                  <Input
                    ref={inputRef}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={weight}
                    onChange={(e) => { setWeight(e.target.value); setConfirmWildcard(false); setInputErrorMsg(null); }}
                    placeholder="Enter weight"
                    aria-invalid={!!inputErrorMsg}
                    className={cn("font-mono text-center text-3xl h-16 text-foreground transition-colors", inputError && "border-destructive ring-1 ring-destructive/50 animate-shake")}
                  />
                  {inputErrorMsg && (
                    <p className="text-center text-xs text-destructive font-medium animate-in fade-in duration-200">{inputErrorMsg}</p>
                  )}
                  {/* Show change from original in edit mode, or diff from target in new log mode */}
                  {isEditMode && originalWeight !== null ? (
                    <p className={cn(
                      "text-center text-sm font-mono h-5",
                      weight && !isNaN(parseFloat(weight))
                        ? (() => {
                            const change = parseFloat(weight) - originalWeight;
                            return change === 0 ? "text-muted-foreground" : change < 0 ? "text-green-500" : "text-yellow-500";
                          })()
                        : "text-transparent"
                    )}>
                      {weight && !isNaN(parseFloat(weight))
                        ? (() => {
                            const change = parseFloat(weight) - originalWeight;
                            if (change === 0) return "No change";
                            return `Change: ${change > 0 ? '+' : ''}${change.toFixed(1)} lbs`;
                          })()
                        : '\u00A0'
                      }
                    </p>
                  ) : (
                    <p className={cn(
                      "text-center text-sm font-mono h-5",
                      // SPAR users don't have a weight class target - just show weight logged
                      isSparProtocol
                        ? "text-muted-foreground"
                        : diff !== null && !isNaN(diff)
                          ? (diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : isTrainingPhase ? "text-yellow-500" : "text-destructive")
                          : "text-transparent"
                    )}>
                      {isSparProtocol
                        ? (currentWeight ? `${currentWeight.toFixed(1)} lbs logged` : '\u00A0')
                        : (diff !== null && !isNaN(diff)
                            ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} lbs vs ${isTrainingPhase ? 'walk-around' : 'goal'} (${goalWeightForDiff} lbs)`
                            : '\u00A0'
                          )
                      }
                    </p>
                  )}
                </div>
              )}

              {/* More Options toggle — collapses time picker for simple logs */}
              {!showMoreOptions && !needsDuration && !needsSleep && (
                <button
                  onClick={() => setShowMoreOptions(true)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Change time ({formatTimeDisplay(logTime)})</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Time Picker — scrollable wheels */}
              {(showMoreOptions || needsDuration || needsSleep) && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <Label className="text-xs text-muted-foreground">Time</Label>
                    </div>
                    <button
                      onClick={() => setLogTime(getCurrentTimeStr())}
                      className={cn(
                        "px-4 py-2 min-h-[40px] rounded-lg text-sm font-medium border transition-all",
                        logTime === getCurrentTimeStr()
                          ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "border-border text-muted-foreground active:scale-95"
                      )}
                    >
                      Now
                    </button>
                  </div>
                  <TimeScrollPicker value={logTime} onChange={setLogTime} />
                </div>
              )}

              {/* Duration Picker — shown for extra-workout and post-practice */}
              {needsDuration && (
                <div className="mt-3 p-2.5 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    <Label className="text-xs font-bold text-orange-500">Workout Duration *</Label>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">Required — used to calculate your sweat rate (lbs/hr)</p>
                  <div className="flex gap-2 flex-wrap">
                    {DURATION_PRESETS.map((mins) => (
                      <button
                        key={mins}
                        onClick={() => { setDuration(mins.toString()); setCustomDuration(false); }}
                        className={cn(
                          "px-4 py-2.5 min-h-[48px] rounded-lg text-sm font-medium border transition-all",
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
                        "px-4 py-2.5 min-h-[48px] rounded-lg text-sm font-medium border transition-all",
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
                        className="font-mono text-center h-12 w-24 text-foreground"
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
                  <div className="flex gap-2 flex-wrap">
                    {SLEEP_PRESETS.map((hrs) => (
                      <button
                        key={hrs}
                        onClick={() => { setSleepHours(hrs.toString()); setCustomSleep(false); }}
                        className={cn(
                          "px-4 py-2.5 min-h-[48px] rounded-lg text-sm font-medium border transition-all",
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
                        "px-4 py-2.5 min-h-[48px] rounded-lg text-sm font-medium border transition-all",
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
                        className="font-mono text-center h-12 w-24 text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">hrs</span>
                    </div>
                  )}
                </div>
              )}

              {/* Missing Before-Bed Prompt */}
              {missingBeforeBed === 'prompt' && (
                <div className="mt-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Moon className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-bold text-amber-500">Missing Before-Bed Weight</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    No before-bed weigh-in found for last night. This is needed to calculate your overnight drift rate accurately.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-11 text-xs border-amber-500/30 text-amber-500"
                      onClick={() => {
                        // Save the morning form data so we can restore it after
                        setSavedMorningData({ weight, time: logTime, sleepHours });
                        setMissingBeforeBed(null);
                        setBackdateBeforeBed(true);
                        setSelectedType('before-bed');
                        setWeight('');
                        toast({ title: "Log your before-bed weight", description: "Enter last night's weight — it will be saved to yesterday" });
                      }}
                    >
                      Log it now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-11 text-xs border-muted-foreground/30"
                      onClick={() => {
                        // Check if we have any historical before-bed data
                        const bedLogs = logs.filter(l => l.type === 'before-bed');
                        if (bedLogs.length === 0) {
                          toast({ title: "No before-bed history", description: "You need at least one before-bed log to use an average. Please log it manually." });
                          return;
                        }
                        const avgWeight = bedLogs
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 5)
                          .reduce((sum, l) => sum + l.weight, 0) / Math.min(bedLogs.length, 5);
                        setMissingBeforeBed('confirm-avg');
                        toast({
                          title: `Average: ${avgWeight.toFixed(1)} lbs`,
                          description: "Tap Save to use this as last night's before-bed weight"
                        });
                      }}
                    >
                      Use average
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 text-xs text-muted-foreground/60 px-2"
                      onClick={() => setMissingBeforeBed(null)}
                    >
                      Skip
                    </Button>
                  </div>
                </div>
              )}

              {missingBeforeBed === 'confirm-avg' && (
                <div className="mt-3 p-2.5 rounded-lg border border-green-500/30 bg-green-500/5">
                  <p className="text-[11px] text-green-500 font-medium">
                    ✓ Will auto-create before-bed log using your recent average. Tap Save to continue.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4">
                {isEditMode && (
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    className="h-13 px-4 rounded-xl"
                    style={{ minHeight: '52px' }}
                  >
                    <Trash2 className="w-5 h-5" />
                    {confirmDelete && <span className="ml-1 text-sm">Confirm?</span>}
                  </Button>
                )}
                <Button
                  onClick={handleSubmit}
                  className={cn(
                    "flex-1 h-13 text-lg font-bold rounded-xl",
                    confirmWildcard && "bg-yellow-500 hover:bg-yellow-600 text-black"
                  )}
                  style={{ minHeight: '52px' }}
                  disabled={
                    selectedType === 'extra-workout'
                      ? !beforeWeight || !afterWeight || !duration || parseInt(duration, 10) <= 0
                      : !weight || (needsDuration && (!duration || parseInt(duration, 10) <= 0)) || (needsSleep && (!sleepHours || parseFloat(sleepHours) <= 0))
                  }
                >
                  {confirmWildcard ? 'Confirm Save?' : isEditMode ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
            )}

            {/* ── Water Tab ── */}
            {activeTab === 'water' && (
              <div className="px-3 pb-6 pt-2 overflow-y-auto flex-1">
                <QuickLogWaterTab />
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
