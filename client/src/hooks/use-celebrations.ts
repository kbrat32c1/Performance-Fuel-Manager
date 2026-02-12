import { useEffect, useRef, useCallback, useState } from "react";
import { useStore } from "@/lib/store";
import { startOfDay, format, subDays } from "date-fns";

export interface Celebration {
  type: 'made-weight' | 'new-low' | 'streak' | 'first-log' | 'all-logged' | 'big-drop';
  emoji: string;
  title: string;
  subtitle?: string;
  confetti: boolean;
}

// Session-level tracking to avoid repeating celebrations
const celebrated = new Set<string>();

export function useCelebrations() {
  const { logs, profile, calculateTarget, getDaysUntilWeighIn, getDailyTracking } = useStore();
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const prevLogCountRef = useRef(logs.length);
  const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dismiss = useCallback(() => {
    setCelebration(null);
  }, []);

  const trigger = useCallback((c: Celebration) => {
    const key = `${c.type}-${format(new Date(), 'yyyy-MM-dd')}`;
    if (celebrated.has(key)) return;
    celebrated.add(key);

    // Clear any pending celebration
    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
    }

    // Small delay so the UI updates first
    celebrationTimeoutRef.current = setTimeout(() => {
      setCelebration(c);
    }, 400);
  }, []);

  useEffect(() => {
    // Only trigger on NEW logs being added (not on initial load or deletions)
    const prevCount = prevLogCountRef.current;
    prevLogCountRef.current = logs.length;

    if (logs.length <= prevCount || prevCount === 0) return;

    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const target = calculateTarget();
    const targetWeightClass = profile.targetWeightClass;
    const daysUntil = getDaysUntilWeighIn();

    // Get today's logs sorted newest first
    const todayLogs = logs.filter(l => {
      const logDate = new Date(l.date);
      return format(startOfDay(logDate), 'yyyy-MM-dd') === todayStr;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const newestLog = todayLogs[0];
    if (!newestLog) return;

    // Get today's morning log
    const morningLog = todayLogs.find(l => l.type === 'morning');

    // 1. MADE WEIGHT — official weigh-in on competition day ≤ target weight class
    if (daysUntil === 0 && (newestLog.type === 'weigh-in' || newestLog.type === 'morning') && newestLog.weight <= targetWeightClass) {
      trigger({
        type: 'made-weight',
        emoji: '🏆',
        title: 'YOU MADE WEIGHT!',
        subtitle: `${newestLog.weight.toFixed(1)} lbs — under ${targetWeightClass} lb class. Go compete!`,
        confetti: true,
      });
      return;
    }

    // 2. NEW WEEKLY LOW — morning weight is lowest of the week
    if (newestLog.type === 'morning' || newestLog.type === 'weigh-in') {
      const weekAgo = subDays(today, 7);
      const weekMornings = logs.filter(l => {
        if (l.type !== 'morning' && l.type !== 'weigh-in') return false;
        const logDate = new Date(l.date);
        return logDate >= weekAgo && format(startOfDay(logDate), 'yyyy-MM-dd') !== todayStr;
      });

      if (weekMornings.length >= 2) {
        const weekMin = Math.min(...weekMornings.map(l => l.weight));
        if (newestLog.weight < weekMin) {
          const diff = weekMin - newestLog.weight;
          trigger({
            type: 'new-low',
            emoji: '📉',
            title: 'New weekly low!',
            subtitle: `${newestLog.weight.toFixed(1)} lbs — ${diff.toFixed(1)} lbs below previous low`,
            confetti: false,
          });
          return;
        }
      }
    }

    // 3. BIG DROP — morning weight dropped 1.5+ lbs from yesterday morning
    if (newestLog.type === 'morning' || newestLog.type === 'weigh-in') {
      const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');
      const yesterdayMorning = logs.find(l =>
        (l.type === 'morning' || l.type === 'weigh-in') && format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === yesterdayStr
      );
      if (yesterdayMorning) {
        const drop = yesterdayMorning.weight - newestLog.weight;
        if (drop >= 1.5) {
          trigger({
            type: 'big-drop',
            emoji: '🔥',
            title: `Down ${drop.toFixed(1)} lbs overnight!`,
            subtitle: `${yesterdayMorning.weight.toFixed(1)} → ${newestLog.weight.toFixed(1)} lbs. The process is working.`,
            confetti: false,
          });
          return;
        }
      }
    }

    // 4. LOGGING STREAK milestones — only on morning/weigh-in
    if (newestLog.type === 'morning' || newestLog.type === 'weigh-in') {
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const checkDate = subDays(today, i);
        const checkStr = format(checkDate, 'yyyy-MM-dd');
        const hasMorning = logs.some(l =>
          (l.type === 'morning' || l.type === 'weigh-in') && format(startOfDay(new Date(l.date)), 'yyyy-MM-dd') === checkStr
        );
        if (hasMorning) {
          streak++;
        } else if (i === 0) {
          continue;
        } else {
          break;
        }
      }

      const milestones = [3, 5, 7, 14, 21, 30];
      if (milestones.includes(streak)) {
        trigger({
          type: 'streak',
          emoji: streak >= 14 ? '🔥' : streak >= 7 ? '⚡' : '💪',
          title: `${streak} day streak!`,
          subtitle: streak >= 7
            ? 'Consistency is what separates champions. Keep going!'
            : 'Building the habit. Every day counts!',
          confetti: streak >= 7,
        });
        return;
      }
    }

    // 5. FIRST LOG EVER
    if (logs.length === 1) {
      trigger({
        type: 'first-log',
        emoji: '🎯',
        title: 'First weigh-in logged!',
        subtitle: 'Your weight management journey starts now.',
        confetti: false,
      });
      return;
    }

    // 6. ALL LOGGED TODAY — noPractice-aware (2 on rest days, 4 on practice days)
    const todayTracking = getDailyTracking(todayStr);
    const isRestDay = todayTracking.noPractice ?? false;
    const requiredTypes = isRestDay
      ? ['morning', 'before-bed']
      : ['morning', 'pre-practice', 'post-practice', 'before-bed'];
    const loggedTypes = new Set(todayLogs.map(l => l.type));
    // weigh-in counts as morning for completion check
    if (loggedTypes.has('weigh-in' as any)) loggedTypes.add('morning' as any);
    const allLogged = requiredTypes.every(t => loggedTypes.has(t as any));
    if (allLogged) {
      trigger({
        type: 'all-logged',
        emoji: '✅',
        title: 'Perfect tracking day!',
        subtitle: isRestDay
          ? 'Both rest day weigh-ins logged. Recovery matters too!'
          : 'All 4 weigh-ins logged. Your data game is elite.',
        confetti: true,
      });
      return;
    }

  }, [logs, profile, calculateTarget, getDaysUntilWeighIn, getDailyTracking, trigger]);

  return { celebration, dismiss };
}
