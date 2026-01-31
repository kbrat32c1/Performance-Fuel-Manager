import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Timer, Droplets, Flame, Utensils, Brain, Wind, Swords, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type CompMode = 'idle' | 'weigh-in' | 'between-matches';

// Duplicate phase info for banner (simplified — just need title/color/startSec/endSec)
interface BannerPhase {
  title: string;
  color: string;
  bgColor: string;
  startSec: number;
  endSec: number;
  priority: string;
}

const WEIGH_IN_PHASES: BannerPhase[] = [
  { title: '0–15 Min', color: 'text-cyan-500', bgColor: 'bg-cyan-500', startSec: 0, endSec: 900, priority: 'Sip fluids' },
  { title: '15–30 Min', color: 'text-primary', bgColor: 'bg-primary', startSec: 900, endSec: 1800, priority: 'Eat now' },
  { title: '30–60 Min', color: 'text-yellow-500', bgColor: 'bg-yellow-500', startSec: 1800, endSec: 3600, priority: 'Full meal' },
  { title: '60–120 Min', color: 'text-purple-500', bgColor: 'bg-purple-500', startSec: 3600, endSec: 7200, priority: 'Rest & focus' },
];

const MATCH_PHASES: BannerPhase[] = [
  { title: '0–5 Min', color: 'text-cyan-500', bgColor: 'bg-cyan-500', startSec: 0, endSec: 300, priority: 'Sip fluids' },
  { title: '5–15 Min', color: 'text-primary', bgColor: 'bg-primary', startSec: 300, endSec: 900, priority: 'Eat NOW' },
  { title: '15–30 Min', color: 'text-purple-500', bgColor: 'bg-purple-500', startSec: 900, endSec: 1800, priority: 'Rest & digest' },
  { title: '30+ Min', color: 'text-yellow-500', bgColor: 'bg-yellow-500', startSec: 1800, endSec: Infinity, priority: 'Stay loose' },
];

function formatTime(sec: number) {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Reads competition state from localStorage and returns mode, elapsed, matchNumber.
 */
export function getCompetitionState(): { mode: CompMode; active: boolean; elapsed: number; matchNumber: number } {
  if (typeof window === 'undefined') return { mode: 'idle', active: false, elapsed: 0, matchNumber: 1 };

  const mode = (localStorage.getItem('pwm-comp-mode') as CompMode) || 'idle';
  const active = localStorage.getItem('pwm-comp-active') === 'true';
  const matchNumber = parseInt(localStorage.getItem('pwm-comp-match') || '1');

  let elapsed = 0;
  if (active) {
    const startTime = localStorage.getItem('pwm-comp-start');
    if (startTime) {
      elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
    }
  } else {
    const saved = localStorage.getItem('pwm-comp-elapsed');
    if (saved) elapsed = parseInt(saved);
  }

  return { mode, active, elapsed, matchNumber };
}

/**
 * Get current phase info based on mode and elapsed time.
 */
export function getCurrentPhase(mode: CompMode, elapsed: number): BannerPhase | null {
  const phases = mode === 'between-matches' ? MATCH_PHASES : WEIGH_IN_PHASES;
  for (let i = phases.length - 1; i >= 0; i--) {
    if (elapsed >= phases[i].startSec) return phases[i];
  }
  return phases[0];
}

/**
 * Slim sticky banner shown on all tabs when competition timer is active.
 * Tapping it navigates to the Recovery tab.
 */
export function CompetitionBanner() {
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [state, setState] = useState(getCompetitionState);

  // Tick every second
  useEffect(() => {
    const tick = () => setState(getCompetitionState());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Don't show if idle or not active, or already on recovery
  if (state.mode === 'idle' || !state.active) return null;
  if (location === '/recovery') return null;

  const phase = getCurrentPhase(state.mode, state.elapsed);
  if (!phase) return null;

  const modeLabel = state.mode === 'weigh-in' ? 'Post Weigh-In' : `Match ${state.matchNumber} Recovery`;

  return (
    <button
      onClick={() => setLocation('/recovery')}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 transition-all",
        "bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5",
        "border-b border-primary/20",
        "active:bg-primary/20"
      )}
    >
      {/* Pulsing timer dot */}
      <div className="relative shrink-0">
        <Timer className="w-4 h-4 text-primary" />
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      </div>

      {/* Timer + Mode */}
      <span className="font-mono text-sm font-bold text-foreground tabular-nums">
        {formatTime(state.elapsed)}
      </span>

      {/* Phase badge */}
      <span className={cn(
        "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0",
        phase.bgColor + '/20',
        phase.color
      )}>
        {phase.priority}
      </span>

      {/* Mode label */}
      <span className="text-[10px] text-muted-foreground truncate flex-1 text-left">
        {modeLabel}
      </span>

      {/* Nav arrow */}
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}

/**
 * Hook for nav badge — returns whether competition is active.
 */
export function useCompetitionActive(): { active: boolean; elapsed: number } {
  const [state, setState] = useState({ active: false, elapsed: 0 });

  useEffect(() => {
    const tick = () => {
      const s = getCompetitionState();
      setState({ active: s.active && s.mode !== 'idle', elapsed: s.elapsed });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return state;
}
