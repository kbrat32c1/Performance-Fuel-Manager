import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Check, Clock, Droplets, Utensils, Zap, RotateCcw, Play, Pause,
  FastForward, Bell, BellOff, ChevronDown, ChevronRight, Scale,
  Flame, Brain, Wind, Swords, Trophy, X, AlertTriangle, Timer,
  ChevronUp, Dumbbell, Target
} from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";


// ─── Types ───────────────────────────────────────────────────────────────────

type CompMode = 'idle' | 'weigh-in' | 'between-matches';

interface PhaseInfo {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  priority: string;
  startSec: number;
  endSec: number;
  items: { id: string; text: string }[];
  fuelWindow?: string; // key to filter tournament foods
}

// ─── Phase Definitions ───────────────────────────────────────────────────────

const WEIGH_IN_PHASES: PhaseInfo[] = [
  {
    id: 'wi-1', title: '0–15 min', subtitle: 'Immediate Hydration',
    icon: <Droplets className="w-4 h-4" />, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500',
    priority: 'Fluids first', startSec: 0, endSec: 900,
    items: [
      { id: 'wi-c1', text: 'Sip 16–24 oz water + electrolytes' },
      { id: 'wi-c2', text: 'No gulping — avoid bloating' },
      { id: 'wi-c3', text: 'Check weight drift baseline' },
    ],
    fuelWindow: '0-5',
  },
  {
    id: 'wi-2', title: '15–30 min', subtitle: 'Gut Activation',
    icon: <Flame className="w-4 h-4" />, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary',
    priority: 'Eat now', startSec: 900, endSec: 1800,
    items: [
      { id: 'wi-c4', text: 'Simple carbs — fruit, honey, gel' },
      { id: 'wi-c5', text: 'Easy to digest foods only' },
      { id: 'wi-c6', text: 'Avoid fat & fiber right now' },
    ],
    fuelWindow: '10-15',
  },
  {
    id: 'wi-3', title: '30–60 min', subtitle: 'Refuel & Stabilize',
    icon: <Utensils className="w-4 h-4" />, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500',
    priority: 'Full meal', startSec: 1800, endSec: 3600,
    items: [
      { id: 'wi-c7', text: 'Complex meal — carbs + protein' },
      { id: 'wi-c8', text: 'Continue sipping fluids' },
      { id: 'wi-c9', text: 'Sodium intake — salty foods OK' },
    ],
    fuelWindow: '20-30',
  },
  {
    id: 'wi-4', title: '60–120 min', subtitle: 'Performance Prep',
    icon: <Brain className="w-4 h-4" />, color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500',
    priority: 'Rest & focus', startSec: 3600, endSec: 7200,
    items: [
      { id: 'wi-c10', text: 'Rest / nap if possible' },
      { id: 'wi-c11', text: 'Visualization & mental prep' },
    ],
    fuelWindow: '40-50',
  },
];

const MATCH_PHASES: PhaseInfo[] = [
  {
    id: 'bm-1', title: '0–5 min', subtitle: 'Immediate Recovery',
    icon: <Wind className="w-4 h-4" />, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500',
    priority: 'Fluids first', startSec: 0, endSec: 300,
    items: [
      { id: 'bm-c1', text: 'Sip fluids + electrolytes' },
      { id: 'bm-c2', text: 'Cool down, catch breath' },
    ],
    fuelWindow: '0-5',
  },
  {
    id: 'bm-2', title: '5–15 min', subtitle: 'Refuel Window',
    icon: <Flame className="w-4 h-4" />, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary',
    priority: 'Eat NOW', startSec: 300, endSec: 900,
    items: [
      { id: 'bm-c3', text: '30–50 g fast carbs' },
      { id: 'bm-c4', text: 'Continue sipping electrolytes' },
    ],
    fuelWindow: '10-15',
  },
  {
    id: 'bm-3', title: '15–30 min', subtitle: 'Rest & Digest',
    icon: <Brain className="w-4 h-4" />, color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500',
    priority: 'Stay warm', startSec: 900, endSec: 1800,
    items: [
      { id: 'bm-c5', text: 'Stay warm, stay off feet' },
      { id: 'bm-c6', text: 'Mental reset & visualization' },
    ],
    fuelWindow: '20-30',
  },
  {
    id: 'bm-4', title: '30+ min', subtitle: 'Ready Zone',
    icon: <Swords className="w-4 h-4" />, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500',
    priority: 'Stay loose', startSec: 1800, endSec: Infinity,
    items: [
      { id: 'bm-c7', text: 'Light movement to stay loose' },
      { id: 'bm-c8', text: 'Top off with 20–30 g carbs if hungry' },
    ],
    fuelWindow: '40-50',
  },
];

const MATCH_PREP_ITEMS = [
  { id: 'mp-rehydrate', text: 'Rehydrate — small sips only', icon: <Droplets className="w-3.5 h-3.5" /> },
  { id: 'mp-sugar', text: 'Simple sugar 20 min before match', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'mp-warm', text: 'Keep body warm / sweat lightly', icon: <Flame className="w-3.5 h-3.5" /> },
  { id: 'mp-mental', text: 'Mental reset & visualization', icon: <Brain className="w-3.5 h-3.5" /> },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(sec: number) {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatCountdown(sec: number) {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getCurrentPhaseIndex(phases: PhaseInfo[], elapsedSec: number): number {
  for (let i = phases.length - 1; i >= 0; i--) {
    if (elapsedSec >= phases[i].startSec) return i;
  }
  return 0;
}

// ─── Confirmation Dialog ─────────────────────────────────────────────────────

function ConfirmDialog({
  open, title, description, confirmLabel, confirmClass, onConfirm, onCancel
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="space-y-2">
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className={cn("flex-1 h-11 font-bold", confirmClass)}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Recovery() {
  // ─ State (all persisted to localStorage) ─
  const [mode, setMode] = useState<CompMode>(() => {
    return (localStorage.getItem('pwm-comp-mode') as CompMode) || 'idle';
  });

  const [elapsed, setElapsed] = useState(() => {
    const startTime = localStorage.getItem('pwm-comp-start');
    const isActive = localStorage.getItem('pwm-comp-active') === 'true';
    if (isActive && startTime) {
      return Math.floor((Date.now() - parseInt(startTime)) / 1000);
    }
    const saved = localStorage.getItem('pwm-comp-elapsed');
    return saved ? parseInt(saved) : 0;
  });

  const [active, setActive] = useState(() => {
    return localStorage.getItem('pwm-comp-active') === 'true';
  });

  const [matchNumber, setMatchNumber] = useState(() => {
    const saved = localStorage.getItem('pwm-comp-match');
    return saved ? parseInt(saved) : 0;
  });

  const [weighInWeight, setWeighInWeight] = useState(() => {
    const saved = localStorage.getItem('pwm-recovery-weighin');
    if (saved) return saved;
    return '';
  });

  // Time to first match (minutes) — used to scale recovery phases
  const [timeToMatch, setTimeToMatch] = useState(() => {
    const saved = localStorage.getItem('pwm-comp-time-to-match');
    return saved ? parseInt(saved) : 120; // default 2 hours
  });

  // Time between matches (minutes) — used to scale between-match recovery phases
  const [timeBetweenMatches, setTimeBetweenMatches] = useState(() => {
    const saved = localStorage.getItem('pwm-comp-time-between');
    return saved ? parseInt(saved) : 60; // default 1 hour
  });

  // Whether we've already used the post weigh-in recovery for this competition
  const [weighInRecoveryUsed, setWeighInRecoveryUsed] = useState(() => {
    return localStorage.getItem('pwm-comp-wi-recovery-used') === 'true';
  });

  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('pwm-comp-checklist');
    return saved ? JSON.parse(saved) : {};
  });

  const [matchPrepChecklist, setMatchPrepChecklist] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('pwm-match-prep-checklist');
    return saved ? JSON.parse(saved) : {};
  });

  const [showAllFuel, setShowAllFuel] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [phaseTransitionBanner, setPhaseTransitionBanner] = useState<string | null>(null);
  const prevPhaseIdx = useRef<number>(0);

  // Confirmation dialogs
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmMatchOpen, setConfirmMatchOpen] = useState(false);

  // Alerts (sound/vibration toggle)
  const [alertsEnabled, setAlertsEnabled] = useState(() => {
    return localStorage.getItem('pwm-recovery-alerts') !== 'false'; // default ON
  });

  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('pwm-recovery-notifications') === 'true';
  });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const lastPhaseNotified = useRef<number>(-1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentPhaseRef = useRef<HTMLDivElement>(null);

  // Store
  const { profile, getRehydrationPlan, getFoodLists, logs } = useStore();

  // Auto-populate weigh-in weight from target weight class on first load
  useEffect(() => {
    if (!weighInWeight && profile?.targetWeightClass) {
      const defaultWeight = profile.targetWeightClass.toString();
      setWeighInWeight(defaultWeight);
    }
  }, [profile?.targetWeightClass]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use most recent morning weight as the "before" weight for rehydration calculation
  // Falls back to currentWeight if no morning logs exist
  const walkAroundWeight = useMemo(() => {
    const morningLogs = logs.filter(l => l.type === 'morning');
    if (morningLogs.length > 0) {
      const sorted = [...morningLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return sorted[0].weight;
    }
    return profile.currentWeight;
  }, [logs, profile.currentWeight]);
  const lostWeight = weighInWeight ? walkAroundWeight - parseFloat(weighInWeight) : 0;
  const plan = getRehydrationPlan(Math.max(0, lostWeight));
  const tournamentFoods = getFoodLists().tournament;

  // Current phases — adapt weigh-in protocol based on actual time available
  const scaledWeighInPhases = useMemo((): PhaseInfo[] => {
    const totalMin = timeToMatch;

    // Under 45 min: Compressed 2-phase protocol (hydrate + quick fuel)
    if (totalMin <= 45) {
      const halfSec = Math.round(totalMin * 60 / 2);
      return [
        {
          id: 'wi-1', title: `0–${Math.round(totalMin / 2)} min`, subtitle: 'Hydrate & Fuel Fast',
          icon: <Droplets className="w-4 h-4" />, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500',
          priority: 'Fluids + simple carbs NOW', startSec: 0, endSec: halfSec,
          items: [
            { id: 'wi-c1', text: 'Sip 16–24 oz water + electrolytes immediately' },
            { id: 'wi-c2', text: 'Simple carbs NOW — fruit, honey, gel, sports drink' },
            { id: 'wi-c3', text: 'No gulping — small sips to avoid bloating' },
          ],
          fuelWindow: '0-5',
        },
        {
          id: 'wi-2', title: `${Math.round(totalMin / 2)}–${totalMin} min`, subtitle: 'Prep & Warm Up',
          icon: <Swords className="w-4 h-4" />, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500',
          priority: 'Get ready', startSec: halfSec, endSec: totalMin * 60,
          items: [
            { id: 'wi-c4', text: 'Continue sipping fluids' },
            { id: 'wi-c5', text: 'Light movement to stay warm' },
            { id: 'wi-c6', text: 'Mental prep & visualization' },
          ],
          fuelWindow: '10-15',
        },
      ];
    }

    // 45–90 min: 3-phase protocol (hydrate, fuel, prep)
    if (totalMin <= 90) {
      const p1End = 15 * 60;
      const p2End = Math.round(totalMin * 0.6) * 60;
      const p3End = totalMin * 60;
      return [
        {
          id: 'wi-1', title: '0–15 min', subtitle: 'Immediate Hydration',
          icon: <Droplets className="w-4 h-4" />, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500',
          priority: 'Fluids first', startSec: 0, endSec: p1End,
          items: [
            { id: 'wi-c1', text: 'Sip 16–24 oz water + electrolytes' },
            { id: 'wi-c2', text: 'No gulping — avoid bloating' },
            { id: 'wi-c3', text: 'Check weight drift baseline' },
          ],
          fuelWindow: '0-5',
        },
        {
          id: 'wi-2', title: `15–${Math.round(totalMin * 0.6)} min`, subtitle: 'Fuel & Eat',
          icon: <Flame className="w-4 h-4" />, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary',
          priority: 'Eat now', startSec: p1End, endSec: p2End,
          items: [
            { id: 'wi-c4', text: 'Simple carbs — fruit, honey, rice, bread' },
            { id: 'wi-c5', text: 'Small amount of protein if tolerated' },
            { id: 'wi-c6', text: 'Continue sipping fluids' },
          ],
          fuelWindow: '10-15',
        },
        {
          id: 'wi-3', title: `${Math.round(totalMin * 0.6)}–${totalMin} min`, subtitle: 'Rest & Prep',
          icon: <Brain className="w-4 h-4" />, color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500',
          priority: 'Rest & focus', startSec: p2End, endSec: p3End,
          items: [
            { id: 'wi-c7', text: 'Rest / stay off feet' },
            { id: 'wi-c8', text: 'Light warm-up when ready' },
            { id: 'wi-c9', text: 'Mental reset & visualization' },
          ],
          fuelWindow: '20-30',
        },
      ];
    }

    // 90+ min: Full 4-phase protocol (original)
    const totalSec = totalMin * 60;
    // Phase 1: always 0-15 min. Phase 2: 15-30 min. Phase 3: 30 to 60% mark. Phase 4: rest.
    const p3End = Math.round(totalMin * 0.6) * 60;
    return [
      {
        ...WEIGH_IN_PHASES[0],
        // Always 0-15 min
      },
      {
        ...WEIGH_IN_PHASES[1],
        // Always 15-30 min
      },
      {
        ...WEIGH_IN_PHASES[2],
        startSec: 1800, endSec: p3End,
        title: `30–${Math.round(p3End / 60)} min`,
      },
      {
        ...WEIGH_IN_PHASES[3],
        startSec: p3End, endSec: totalSec,
        title: `${Math.round(p3End / 60)}–${totalMin} min`,
      },
    ];
  }, [timeToMatch]);

  // Adapt between-match phases based on actual time available
  const scaledMatchPhases = useMemo((): PhaseInfo[] => {
    const totalMin = timeBetweenMatches;

    // Under 30 min: Compressed 2-phase (rehydrate + ready)
    if (totalMin < 30) {
      const halfSec = Math.round(totalMin * 60 / 2);
      return [
        {
          id: 'bm-1', title: `0–${Math.round(totalMin / 2)} min`, subtitle: 'Fluids & Fuel',
          icon: <Wind className="w-4 h-4" />, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500',
          priority: 'Fluids + carbs NOW', startSec: 0, endSec: halfSec,
          items: [
            { id: 'bm-c1', text: 'Sip fluids + electrolytes immediately' },
            { id: 'bm-c2', text: '20–30 g fast carbs — gel, sports drink, banana' },
          ],
          fuelWindow: '0-5',
        },
        {
          id: 'bm-2', title: `${Math.round(totalMin / 2)}+ min`, subtitle: 'Stay Ready',
          icon: <Swords className="w-4 h-4" />, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500',
          priority: 'Stay warm', startSec: halfSec, endSec: Infinity,
          items: [
            { id: 'bm-c3', text: 'Stay warm, light movement' },
            { id: 'bm-c4', text: 'Mental reset & visualization' },
          ],
          fuelWindow: '10-15',
        },
      ];
    }

    // 30–60 min: 3-phase (recover, fuel, ready)
    if (totalMin <= 60) {
      return [
        {
          ...MATCH_PHASES[0], // 0-5 min immediate recovery
        },
        {
          ...MATCH_PHASES[1], // 5-15 min refuel
        },
        {
          id: 'bm-3', title: '15+ min', subtitle: 'Rest & Stay Ready',
          icon: <Brain className="w-4 h-4" />, color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500',
          priority: 'Stay warm & loose', startSec: 900, endSec: Infinity,
          items: [
            { id: 'bm-c5', text: 'Stay warm, stay off feet' },
            { id: 'bm-c6', text: 'Mental reset & visualization' },
            { id: 'bm-c7', text: 'Top off with carbs if hungry' },
          ],
          fuelWindow: '20-30',
        },
      ];
    }

    // 60+ min: Full 4-phase (original)
    return [...MATCH_PHASES];
  }, [timeBetweenMatches]);

  const phases = mode === 'between-matches' ? scaledMatchPhases : scaledWeighInPhases;
  const currentPhaseIdx = getCurrentPhaseIndex(phases, elapsed);
  const currentPhase = phases[currentPhaseIdx];

  // Time remaining in current phase
  const timeToNextPhase = currentPhase.endSec === Infinity
    ? null
    : Math.max(0, currentPhase.endSec - elapsed);

  // Filter fuel items by current timing window
  const relevantFoods = useMemo(() => {
    if (!currentPhase.fuelWindow) return [];
    return tournamentFoods.filter(f => f.timing?.includes(currentPhase.fuelWindow!) || f.timing === 'Continuous');
  }, [currentPhase.fuelWindow, tournamentFoods]);

  // ─ Persistence ─
  useEffect(() => {
    localStorage.setItem('pwm-comp-mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('pwm-comp-active', active.toString());
    if (active) {
      const existingStart = localStorage.getItem('pwm-comp-start');
      if (!existingStart) {
        localStorage.setItem('pwm-comp-start', (Date.now() - elapsed * 1000).toString());
      }
    } else {
      localStorage.removeItem('pwm-comp-start');
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('pwm-comp-match', matchNumber.toString());
  }, [matchNumber]);

  useEffect(() => {
    localStorage.setItem('pwm-comp-time-to-match', timeToMatch.toString());
  }, [timeToMatch]);

  useEffect(() => {
    localStorage.setItem('pwm-comp-time-between', timeBetweenMatches.toString());
  }, [timeBetweenMatches]);

  useEffect(() => {
    localStorage.setItem('pwm-comp-wi-recovery-used', weighInRecoveryUsed.toString());
  }, [weighInRecoveryUsed]);

  useEffect(() => {
    localStorage.setItem('pwm-recovery-weighin', weighInWeight);
  }, [weighInWeight]);

  useEffect(() => {
    localStorage.setItem('pwm-comp-checklist', JSON.stringify(checklist));
  }, [checklist]);

  useEffect(() => {
    localStorage.setItem('pwm-match-prep-checklist', JSON.stringify(matchPrepChecklist));
  }, [matchPrepChecklist]);

  // Timer tick — compute from start time to avoid drift when tab is backgrounded
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (active) {
      const startTime = localStorage.getItem('pwm-comp-start');
      const startMs = startTime ? parseInt(startTime) : Date.now();
      interval = setInterval(() => {
        const newVal = Math.floor((Date.now() - startMs) / 1000);
        setElapsed(newVal);
        if (newVal % 5 === 0) {
          localStorage.setItem('pwm-comp-elapsed', newVal.toString());
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [active]);

  // Persist on unmount
  useEffect(() => {
    return () => {
      if (elapsed > 0) localStorage.setItem('pwm-comp-elapsed', elapsed.toString());
    };
  }, [elapsed]);

  // Play alert sound using Web Audio API
  const playAlertSound = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(523, now, 0.15);        // C5
      playTone(659, now + 0.15, 0.15); // E5
      playTone(784, now + 0.3, 0.25);  // G5
    } catch (e) {
      // Audio not supported
    }
  };

  // Trigger vibration
  const triggerVibration = () => {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 300]);
      }
    } catch (e) {
      // Vibration not supported
    }
  };

  // Phase change — notification + on-screen banner + sound + vibration
  useEffect(() => {
    if (!active) return;
    if (currentPhaseIdx !== prevPhaseIdx.current && prevPhaseIdx.current !== -1) {
      const phase = phases[currentPhaseIdx];

      // On-screen banner
      setPhaseTransitionBanner(`${phase.priority}: ${phase.subtitle}`);
      const timeout = setTimeout(() => setPhaseTransitionBanner(null), 6000);

      // Sound + vibration (only if alerts enabled)
      if (alertsEnabled) {
        playAlertSound();
        triggerVibration();
      }

      // Auto-scroll to current phase card
      setTimeout(() => {
        currentPhaseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);

      // Browser notification (if enabled)
      if (notificationsEnabled && notificationPermission === 'granted' && typeof Notification !== 'undefined') {
        new Notification(phase.subtitle, {
          body: `${phase.priority} — ${phase.items[0]?.text || ''}`,
          icon: '/android-chrome-192x192.png',
          tag: 'recovery-phase',
        });
      }

      return () => clearTimeout(timeout);
    }
    prevPhaseIdx.current = currentPhaseIdx;
  }, [currentPhaseIdx, active, alertsEnabled, notificationsEnabled, notificationPermission, phases]);

  // ─ Actions ─
  const startCompDay = () => {
    setMode('weigh-in');
    setElapsed(0);
    setActive(true);
    setMatchNumber(0);
    setChecklist({});
    setMatchPrepChecklist({});
    setWeighInRecoveryUsed(false);
    localStorage.setItem('pwm-comp-start', Date.now().toString());
    localStorage.setItem('pwm-comp-elapsed', '0');
  };

  const startMatch = () => {
    setMode('between-matches');
    setMatchNumber(m => m + 1);
    setElapsed(0);
    setActive(true);
    setChecklist({});
    setMatchPrepChecklist({});
    localStorage.setItem('pwm-comp-start', Date.now().toString());
    localStorage.setItem('pwm-comp-elapsed', '0');
    setConfirmMatchOpen(false);
  };

  const endTournament = () => {
    setMode('idle');
    setActive(false);
    setElapsed(0);
    setMatchNumber(0);
    setChecklist({});
    setMatchPrepChecklist({});
    setWeighInRecoveryUsed(false);
    localStorage.removeItem('pwm-comp-start');
    localStorage.removeItem('pwm-comp-elapsed');
    setConfirmEndOpen(false);
  };

  const togglePause = () => setActive(!active);

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        setNotificationsEnabled(true);
        localStorage.setItem('pwm-recovery-notifications', 'true');
      }
    } else if (Notification.permission === 'granted') {
      const next = !notificationsEnabled;
      setNotificationsEnabled(next);
      localStorage.setItem('pwm-recovery-notifications', next.toString());
    }
  };

  const toggleCheckItem = (id: string) => setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleMatchPrep = (id: string) => setMatchPrepChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleExpandPhase = (id: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── IDLE STATE ────────────────────────────────────────────────────────────
  if (mode === 'idle') {
    return (
      <MobileLayout>
        <div className="flex flex-col min-h-[70vh] px-4">
          {/* Hero */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl scale-150" />
              <div className="relative bg-primary/10 border-2 border-primary/30 rounded-full p-5">
                <Trophy className="w-10 h-10 text-primary" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-2xl font-heading font-black italic uppercase text-primary">
                Competition Day
              </h1>
              <p className="text-muted-foreground text-sm max-w-[280px] mx-auto leading-relaxed">
                Your post weigh-in recovery protocol. Guides you from weigh-in through every match.
              </p>
            </div>

            {/* Steps preview */}
            <div className="w-full max-w-xs space-y-2">
              {[
                { icon: <Scale className="w-3.5 h-3.5" />, text: 'Weigh in & start recovery', color: 'text-cyan-500' },
                { icon: <Utensils className="w-3.5 h-3.5" />, text: 'Guided fueling & hydration', color: 'text-primary' },
                { icon: <Swords className="w-3.5 h-3.5" />, text: 'Match prep & between-match recovery', color: 'text-orange-500' },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 bg-muted/20 rounded-lg px-3 py-2">
                  <span className={step.color}>{step.icon}</span>
                  <span className="text-xs text-muted-foreground">{step.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-4 pb-6 pt-6">
            {/* Weigh-in weight input */}
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase font-bold text-muted-foreground block text-center tracking-wider">
                Weigh-in Weight (lbs)
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weighInWeight}
                onChange={(e) => setWeighInWeight(e.target.value)}
                placeholder="Weight"
                className="font-mono text-center text-lg h-12 rounded-xl"
              />
            </div>

            {/* Time pickers */}
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase font-bold text-muted-foreground block text-center tracking-wider">
                Time to 1st Match
              </label>
              <div className="relative max-w-[200px] mx-auto">
                <select
                  value={timeToMatch}
                  onChange={(e) => setTimeToMatch(parseInt(e.target.value))}
                  className="w-full font-mono text-center text-lg h-12 rounded-xl bg-background border border-input appearance-none cursor-pointer px-3"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hr</option>
                  <option value={120}>2 hours</option>
                  <option value={150}>2.5 hr</option>
                  <option value={180}>3 hours</option>
                  <option value={240}>4 hours</option>
                </select>
                <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            {weighInWeight && lostWeight > 0 && (
              <p className="text-center text-xs text-cyan-500 font-mono font-medium -mt-1">
                {lostWeight.toFixed(1)} lbs to recover · {plan.fluidRange} fluids recommended
              </p>
            )}

            <Button
              onClick={startCompDay}
              className="w-full h-14 text-base font-bold uppercase bg-primary text-white rounded-xl shadow-lg shadow-primary/20"
            >
              <Play className="w-5 h-5 mr-2" /> Start Competition Day
            </Button>

            {/* Notification / Alerts UI — compact */}
            <div className="flex justify-center">
              {typeof Notification === 'undefined' ? (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Bell className="w-3 h-3 text-cyan-500" />
                  <span>Sound & on-screen alerts active</span>
                </div>
              ) : notificationPermission === 'denied' ? (
                <div className="flex items-center gap-1.5 text-[10px] text-yellow-500">
                  <BellOff className="w-3 h-3" />
                  <span>Push blocked — sound & on-screen alerts active</span>
                </div>
              ) : notificationPermission === 'granted' && notificationsEnabled ? (
                <div className="flex items-center gap-1.5 text-[10px] text-primary">
                  <Bell className="w-3 h-3" />
                  <span>All alerts enabled</span>
                </div>
              ) : (
                <button
                  onClick={requestNotificationPermission}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Bell className="w-3 h-3" />
                  <span className="underline underline-offset-2">Enable push notifications</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // ─── ACTIVE STATE (weigh-in or between-matches) ────────────────────────────

  // Overall checklist progress
  const totalItems = phases.reduce((sum, p) => sum + p.items.length, 0);
  const checkedItems = Object.values(checklist).filter(Boolean).length;

  return (
    <MobileLayout>
      <div className="space-y-3">
        {/* ─ Sticky Header ─ */}
        <div className="bg-background/95 backdrop-blur-sm -mx-4 px-4 pt-2 pb-3 sticky top-0 z-20 border-b border-border/50">
          {/* Top row: mode label + controls */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              {mode === 'weigh-in' ? (
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider truncate">
                  Post Weigh-In Recovery
                </span>
              ) : (
                <span className="text-[10px] uppercase font-bold tracking-wider truncate">
                  <span className="text-orange-500">Match #{matchNumber}</span>
                  <span className="text-muted-foreground"> Recovery</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => {
                  const next = !alertsEnabled;
                  setAlertsEnabled(next);
                  localStorage.setItem('pwm-recovery-alerts', next.toString());
                  if (next) {
                    // Play a quick test sound so user knows it's on
                    playAlertSound();
                    triggerVibration();
                  }
                }}
                className={cn(
                  "p-1.5 rounded-lg transition-colors active:scale-95",
                  alertsEnabled
                    ? "bg-primary/15 text-primary"
                    : "bg-muted/30 text-muted-foreground"
                )}
                title={alertsEnabled ? "Alerts on — tap to mute" : "Alerts muted — tap to enable"}
              >
                {alertsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={togglePause}
                className={cn(
                  "p-1.5 rounded-lg transition-colors active:scale-95",
                  active ? "bg-yellow-500/15 text-yellow-500" : "bg-primary/15 text-primary"
                )}
              >
                {active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Timer + phase info */}
          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-mono font-bold tracking-tight tabular-nums">
                {formatTime(elapsed)}
              </span>
              {/* Countdown to next phase */}
              {timeToNextPhase !== null && active && (
                <span className="text-xs font-mono text-muted-foreground tabular-nums">
                  Next in {formatCountdown(timeToNextPhase)}
                </span>
              )}
            </div>
            {/* Phase badge */}
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0",
              currentPhase.bgColor, currentPhase.color
            )}>
              {currentPhase.icon}
              <span className="hidden xs:inline">{currentPhase.priority}</span>
            </div>
          </div>

          {/* Phase timeline bar */}
          <div className="flex gap-1 mt-2.5">
            {phases.map((phase, i) => {
              const isCompleted = i < currentPhaseIdx;
              const isCurrent = i === currentPhaseIdx;
              // Calculate progress within current phase
              let progress = 0;
              if (isCompleted) progress = 100;
              else if (isCurrent && phase.endSec !== Infinity) {
                progress = Math.min(100, ((elapsed - phase.startSec) / (phase.endSec - phase.startSec)) * 100);
              } else if (isCurrent) {
                progress = Math.min(100, Math.min(elapsed - phase.startSec, 1800) / 1800 * 100);
              }

              return (
                <div key={phase.id} className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      isCompleted ? "bg-green-500" :
                      isCurrent ? phase.color.replace('text-', 'bg-') :
                      "bg-transparent"
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* ─ Phase Transition Banner ─ */}
        {phaseTransitionBanner && (
          <div className="animate-in slide-in-from-top fade-in duration-300 relative">
            <div className="bg-primary text-white font-bold text-center py-3 px-4 pr-10 rounded-xl text-sm uppercase tracking-wide shadow-[0_0_20px_rgba(232,80,30,0.3)]">
              {phaseTransitionBanner}
            </div>
            <button
              onClick={() => setPhaseTransitionBanner(null)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-black/10 transition-colors"
            >
              <X className="w-4 h-4 text-black/60" />
            </button>
          </div>
        )}

        {/* ─ Rehydration Summary (weigh-in mode only) ─ */}
        {mode === 'weigh-in' && weighInWeight && lostWeight > 0 && (
          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-cyan-500 flex items-center gap-1.5 tracking-wider">
                <Droplets className="w-3.5 h-3.5" /> Rehydration
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {lostWeight.toFixed(1)} lbs lost
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-cyan-500/5 rounded-lg p-2 text-center">
                <span className="text-[9px] uppercase text-muted-foreground block mb-0.5">Fluids</span>
                <span className="text-sm font-mono font-bold text-cyan-500">{plan.fluidRange}</span>
              </div>
              <div className="bg-muted/20 rounded-lg p-2 text-center">
                <span className="text-[9px] uppercase text-muted-foreground block mb-0.5">Sodium</span>
                <span className="text-sm font-mono font-bold text-foreground">{plan.sodiumRange}</span>
              </div>
              <div className="bg-primary/5 rounded-lg p-2 text-center">
                <span className="text-[9px] uppercase text-muted-foreground block mb-0.5">Glycogen</span>
                <span className="text-sm font-mono font-bold text-primary">{plan.glycogen}</span>
              </div>
            </div>
          </div>
        )}

        {/* ─ Current Phase (always expanded) ─ */}
        <div ref={currentPhaseRef}>
          <PhaseCard
            phase={currentPhase}
            isActive={true}
            isCurrent={true}
            checklist={checklist}
            onToggle={toggleCheckItem}
            expanded={true}
            onToggleExpand={() => {}}
            foods={relevantFoods}
            showFoods={true}
          />
        </div>

        {/* ─ Other Phases ─ */}
        {phases.map((phase, i) => {
          if (i === currentPhaseIdx) return null;
          const isCompleted = i < currentPhaseIdx;
          const completedCount = phase.items.filter(item => checklist[item.id]).length;
          const isExpanded = expandedPhases.has(phase.id);

          return (
            <PhaseCard
              key={phase.id}
              phase={phase}
              isActive={false}
              isCurrent={false}
              isCompleted={isCompleted}
              checklist={checklist}
              onToggle={toggleCheckItem}
              expanded={isExpanded}
              onToggleExpand={() => toggleExpandPhase(phase.id)}
              completedCount={completedCount}
            />
          );
        })}

        {/* ─ Quick Fuel (collapsible full list) ─ */}
        <div className="border border-primary/20 bg-primary/5 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAllFuel(!showAllFuel)}
            className="w-full flex items-center justify-between p-3 active:bg-primary/10 transition-colors"
          >
            <span className="text-[10px] uppercase font-bold text-primary flex items-center gap-1.5 tracking-wider">
              <Utensils className="w-3.5 h-3.5" /> All Fueling Options
            </span>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", showAllFuel && "rotate-180")} />
          </button>
          {showAllFuel && (
            <div className="px-3 pb-3 space-y-1.5 animate-in slide-in-from-top-2 duration-200">
              {tournamentFoods.map((food, i) => (
                <div key={i} className="flex items-center justify-between bg-background/50 rounded-lg px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{food.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">({food.serving})</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                    <span className="font-mono text-primary font-bold">{food.carbs}g</span>
                    <span className="text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">{food.timing}</span>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground pt-2 border-t border-muted">
                Target: 30–50 g carbs/hr · 16–24 oz electrolyte drink/hr
              </p>
            </div>
          )}
        </div>

        {/* ─ Match Prep Checklist (between-matches mode) ─ */}
        {mode === 'between-matches' && (
          <div className="border border-orange-500/20 bg-orange-500/5 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-3 pb-2">
              <span className="text-[10px] uppercase font-bold text-orange-500 flex items-center gap-1.5 tracking-wider">
                <Swords className="w-3.5 h-3.5" /> Match Prep
              </span>
              {Object.values(matchPrepChecklist).filter(Boolean).length > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {Object.values(matchPrepChecklist).filter(Boolean).length}/{MATCH_PREP_ITEMS.length}
                </span>
              )}
            </div>
            <div className="px-3 pb-3 space-y-1">
              {MATCH_PREP_ITEMS.map(item => (
                <button
                  key={item.id}
                  onClick={() => toggleMatchPrep(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all text-left active:scale-[0.98]",
                    matchPrepChecklist[item.id]
                      ? "bg-orange-500/10 opacity-60"
                      : "bg-background/50 hover:bg-background/80"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
                    matchPrepChecklist[item.id]
                      ? "bg-orange-500 border-orange-500"
                      : "border-orange-500/40"
                  )}>
                    {matchPrepChecklist[item.id] && <Check className="w-3 h-3 text-black" />}
                  </div>
                  <span className={cn(
                    "text-sm font-medium transition-all",
                    matchPrepChecklist[item.id] && "line-through text-muted-foreground"
                  )}>
                    {item.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─ Match Warning ─ */}
        {mode === 'between-matches' && active && elapsed < 1800 && (
          <div className="flex items-center gap-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-yellow-500 font-medium">
                Min 30 min rest recommended
              </span>
              <span className="text-[10px] text-muted-foreground ml-1.5">
                ({formatCountdown(1800 - elapsed)} remaining)
              </span>
            </div>
          </div>
        )}

        {/* ─ Action Buttons ─ */}
        <div className="space-y-2 pb-6 pt-1">
          {mode === 'weigh-in' && (
            <Button
              onClick={() => setConfirmMatchOpen(true)}
              className="w-full h-12 text-base font-bold uppercase bg-orange-500 hover:bg-orange-600 text-black rounded-xl shadow-lg shadow-orange-500/20"
            >
              <Swords className="w-5 h-5 mr-2" /> Match #{matchNumber + 1} Done
            </Button>
          )}

          {mode === 'between-matches' && (
            <div className={cn("grid gap-2", !weighInRecoveryUsed ? "grid-cols-2" : "grid-cols-1")}>
              <Button
                onClick={() => setConfirmMatchOpen(true)}
                className="h-12 text-sm font-bold uppercase bg-orange-500 hover:bg-orange-600 text-black rounded-xl"
              >
                <FastForward className="w-4 h-4 mr-1.5" /> Match Done
              </Button>
              {!weighInRecoveryUsed && (
                <Button
                  onClick={() => {
                    setMode('weigh-in');
                    setElapsed(0);
                    setActive(true);
                    setChecklist({});
                    setWeighInRecoveryUsed(true);
                    localStorage.setItem('pwm-comp-start', Date.now().toString());
                    localStorage.setItem('pwm-comp-elapsed', '0');
                  }}
                  variant="outline"
                  className="h-12 text-sm font-bold uppercase border-primary/50 text-primary rounded-xl"
                >
                  <Droplets className="w-4 h-4 mr-1.5" /> Recovery
                </Button>
              )}
            </div>
          )}

          <Button
            onClick={() => setConfirmEndOpen(true)}
            variant="ghost"
            className="w-full h-10 text-xs text-muted-foreground hover:text-destructive rounded-xl"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> End Competition Day
          </Button>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmEndOpen}
        title="End Competition Day?"
        description="This will reset all timers, checklists, and match data. You'll need to start fresh next time."
        confirmLabel="End Day"
        confirmClass="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        onConfirm={endTournament}
        onCancel={() => setConfirmEndOpen(false)}
      />
      {/* Match Start Dialog with time-between picker */}
      {confirmMatchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="space-y-2">
              <h3 className="text-lg font-bold">
                {mode === 'weigh-in' ? `Match #${matchNumber + 1} Done?` : `Match #${matchNumber + 1} Done?`}
              </h3>
              <p className="text-sm text-muted-foreground">
                {mode === 'weigh-in'
                  ? "This will start between-match recovery mode. Your post weigh-in timer will stop."
                  : `Starting recovery after Match #${matchNumber + 1}. How long until your next match?`}
              </p>
            </div>

            {/* Time between matches picker */}
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">
                Expected time until next match
              </label>
              <div className="relative">
                <select
                  value={timeBetweenMatches}
                  onChange={(e) => setTimeBetweenMatches(parseInt(e.target.value))}
                  className="w-full font-mono text-center text-base h-11 rounded-xl bg-background border border-input appearance-none cursor-pointer px-3"
                >
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hr</option>
                  <option value={120}>2 hours</option>
                  <option value={150}>2.5 hr</option>
                  <option value={180}>3 hours</option>
                </select>
                <Timer className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setConfirmMatchOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 font-bold bg-orange-500 hover:bg-orange-600 text-black"
                onClick={startMatch}
              >
                {mode === 'weigh-in' ? "Start Recovery" : "Start Recovery"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </MobileLayout>
  );
}

// ─── Phase Card Component ────────────────────────────────────────────────────

function PhaseCard({
  phase, isActive, isCurrent, isCompleted, checklist, onToggle,
  expanded, onToggleExpand, completedCount, foods, showFoods,
}: {
  phase: PhaseInfo;
  isActive: boolean;
  isCurrent: boolean;
  isCompleted?: boolean;
  checklist: Record<string, boolean>;
  onToggle: (id: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  completedCount?: number;
  foods?: Array<{ name: string; serving: string; carbs: number; timing?: string; ratio?: string; note?: string }>;
  showFoods?: boolean;
}) {
  const done = phase.items.filter(i => checklist[i.id]).length;
  const total = phase.items.length;
  const allDone = done === total;

  if (!expanded && !isCurrent) {
    // Collapsed view
    return (
      <button
        onClick={onToggleExpand}
        className={cn(
          "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left active:scale-[0.98]",
          isCompleted
            ? "bg-muted/15 border-muted/50"
            : "bg-card border-border/50"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isCompleted && allDone ? (
            <div className="w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 text-green-500" />
            </div>
          ) : isCompleted ? (
            <div className="w-6 h-6 rounded-full bg-muted/30 flex items-center justify-center shrink-0">
              <span className={cn("opacity-50", phase.color)}>{phase.icon}</span>
            </div>
          ) : (
            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", phase.bgColor)}>
              <span className={cn("opacity-70", phase.color)}>{phase.icon}</span>
            </div>
          )}
          <div className="min-w-0">
            <span className={cn(
              "text-sm font-bold block truncate",
              isCompleted && "text-muted-foreground"
            )}>
              {phase.title}
            </span>
            <span className={cn(
              "text-[10px] block truncate",
              isCompleted ? "text-muted-foreground/60" : "text-muted-foreground"
            )}>
              {phase.subtitle}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {allDone ? (
            <span className="text-[10px] font-bold text-green-500">Done</span>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground">{done}/{total}</span>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        </div>
      </button>
    );
  }

  // Expanded / Current view
  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-300",
        isCurrent
          ? `${phase.bgColor} border-l-4 ${phase.borderColor} border-r-transparent border-t-transparent border-b-transparent shadow-lg`
          : "bg-card border-border border-l-4 border-l-muted"
      )}
    >
      {/* Header */}
      <div
        className={cn("flex items-center justify-between p-3", !isCurrent && "cursor-pointer active:bg-muted/20")}
        onClick={!isCurrent ? onToggleExpand : undefined}
      >
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center",
            isCurrent ? phase.bgColor : "bg-muted/20"
          )}>
            <span className={phase.color}>{phase.icon}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-bold", isCurrent && phase.color)}>{phase.title}</span>
              {isCurrent && (
                <span className={cn(
                  "text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md animate-pulse",
                  phase.bgColor, phase.color
                )}>
                  NOW
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">{phase.subtitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allDone ? (
            <div className="w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-500" />
            </div>
          ) : (
            <span className="text-xs font-mono text-muted-foreground">{done}/{total}</span>
          )}
          {!isCurrent && <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3">
        <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allDone ? "bg-green-500" :
              isCurrent ? phase.color.replace('text-', 'bg-') :
              "bg-muted-foreground/30"
            )}
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="p-3 space-y-1">
        {phase.items.map(item => (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-all text-left active:scale-[0.98]",
              checklist[item.id] ? "opacity-50" : "hover:bg-background/30"
            )}
          >
            <div className={cn(
              "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
              checklist[item.id]
                ? "bg-green-500 border-green-500"
                : isCurrent
                  ? `border-current ${phase.color}`
                  : "border-muted-foreground/30"
            )}>
              {checklist[item.id] && <Check className="w-3 h-3 text-black" />}
            </div>
            <span className={cn(
              "text-sm font-medium leading-tight transition-all",
              checklist[item.id] ? "text-muted-foreground line-through" : "text-foreground"
            )}>
              {item.text}
            </span>
          </button>
        ))}
      </div>

      {/* Relevant foods for this phase */}
      {showFoods && foods && foods.length > 0 && (
        <div className="px-3 pb-3">
          <div className="bg-background/40 rounded-lg p-2.5 space-y-1.5">
            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Quick fuel for now</span>
            {foods.map((food, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-medium">{food.name} <span className="text-muted-foreground">({food.serving})</span></span>
                <span className="font-mono text-primary font-bold">{food.carbs}g</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
