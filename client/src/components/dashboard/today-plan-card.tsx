/**
 * TodayPlanCard — the summary at the top of the Today screen.
 * Next action, today's food and fluid plan, status and how sure the app is.
 * The cards below it (Cut Lab, recovery, Fuel) are the detail behind it.
 * All logic lives in lib/today-plan.ts; this file only reads the store and draws.
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { buildTodayPlan } from "@/lib/today-plan";
import { buildWeightTrend } from "@/lib/today-trend";
import { displayRecoveryScore, withDisplayRecovery } from "@/lib/recovery-display";
import { recoveryZone, recoveryWord, recoverySourceShort } from "@/lib/recovery-zone";
import type { DbHealthData } from "@/lib/supabase";
import { TodayPlanView, type HealthTiles } from "./today-plan-view";
import { MetricDetailSheet } from "./metric-detail-sheet";

interface TodayPlanCardProps {
  todayLogs: { morning?: any; prePractice?: any; postPractice?: any; beforeBed?: any; weighIn?: any };
  isRestDay: boolean;
  /** Health rows (newest first) and the WHOOP-style day they're keyed by. */
  healthData: DbHealthData[];
  healthDayStr: string;
  /** The AM/PRE/POST/BED weigh-in slots, drawn inside the card under the next log. */
  slots?: React.ReactNode;
  /** Override "now" for previews and tests. */
  hour?: number;
}

export function TodayPlanCard({ todayLogs, isRestDay, healthData, healthDayStr, slots, hour }: TodayPlanCardProps) {
  const store = useStore();
  const { profile } = store;
  const [, setLocation] = useLocation();

  const dateKey = format(profile.simulatedDate || new Date(), 'yyyy-MM-dd');
  const tracking = store.getDailyTracking(dateKey);
  const macros = store.getMacroTargets();
  const hydration = store.getHydrationTarget();
  const nutritionMode = store.getNutritionMode();
  const slices = nutritionMode === 'spar' ? store.getSliceTargets() : null;
  const statusInfo = store.getStatus();
  const todayTarget = store.calculateTarget();
  const daysUntilWeighIn = store.getDaysUntilWeighIn();
  const descent = store.getWeekDescentData();
  const demo = !!profile.simulatedDate;
  const endDate = profile.simulatedDate ? new Date(profile.simulatedDate) : new Date();

  // Latest weigh-in today, any timing, shown under the morning weight.
  const latestToday = [todayLogs.weighIn, todayLogs.beforeBed, todayLogs.postPractice, todayLogs.prePractice, todayLogs.morning]
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] as any;

  // Morning weights only. No approved target exists in the app yet, so none is drawn.
  const trend = buildWeightTrend({ logs: store.logs, end: endDate });
  const endKey = format(endDate, 'yyyy-MM-dd');

  // Recovery as context: today's row, band data first, like Cut Lab.
  const dayKey = profile.simulatedDate ? endKey : healthDayStr;
  const todayHealth = healthData.find(h => h.date === dayKey && h.source === 'v5-direct') ?? healthData.find(h => h.date === dayKey);
  const recoveryScore = todayHealth ? displayRecoveryScore(todayHealth, healthData) : null;
  const health: HealthTiles | null = todayHealth && (recoveryScore != null || todayHealth.sleep_hours != null)
    ? {
        recovery: recoveryScore != null ? { score: recoveryScore, word: recoveryWord(recoveryScore), tone: recoveryZone(recoveryScore).tone } : null,
        sleepHours: todayHealth.sleep_hours,
        source: recoverySourceShort(todayHealth),
      }
    : null;
  const hasRecoveryData = !!todayHealth && (todayHealth.sleep_hours != null || todayHealth.hrv != null || todayHealth.resting_heart_rate != null || recoveryScore != null);
  const [sheet, setSheet] = useState<'recovery' | 'sleep' | null>(null);
  const scoredHistory = useMemo(() => withDisplayRecovery(healthData), [healthData]);

  // Cheap, and the store returns fresh objects each render, so no memo.
  const plan = buildTodayPlan({
    hour: hour ?? new Date().getHours(),
    protocol: profile.protocol,
    isGeneralNutrition: profile.protocol === '5',
    weighInCleared: !!profile.weighInCleared,
    daysUntilWeighIn,
    weighInTime: profile.weighInTime,
    weightClass: profile.targetWeightClass,
    profileWeight: profile.currentWeight || 0,
    todayTarget,
    weightLevel: statusInfo.status,
    isRestDay,
    trackPracticeWeighIns: !!profile.trackPracticeWeighIns,
    logs: {
      morning: todayLogs.morning?.weight ?? null,
      prePractice: todayLogs.prePractice?.weight ?? null,
      postPractice: todayLogs.postPractice?.weight ?? null,
      beforeBed: todayLogs.beforeBed?.weight ?? null,
      officialWeighIn: todayLogs.weighIn?.weight ?? null,
    },
    nutritionMode,
    macros,
    slices: slices ? { protein: slices.protein, carb: slices.carb, veg: slices.veg, fruit: slices.fruit || 0, fat: slices.fat || 0 } : null,
    hydration: { targetOz: hydration.targetOz, type: hydration.type },
    tracking: {
      waterConsumed: tracking.waterConsumed || 0,
      carbsConsumed: tracking.carbsConsumed || 0,
      proteinConsumed: tracking.proteinConsumed || 0,
      proteinSlices: tracking.proteinSlices || 0,
      carbSlices: tracking.carbSlices || 0,
      vegSlices: tracking.vegSlices || 0,
      fruitSlices: tracking.fruitSlices || 0,
      fatSlices: tracking.fatSlices || 0,
      foodLogCount: tracking.foodLog?.length ?? 0,
    },
    hasRecoveryData,
    latest: latestToday ? { weight: latestToday.weight, timing: latestToday.type } : null,
    demo,
    projection: {
      reliable: descent.confidence.reliable,
      driftSamples: descent.confidence.driftSamples,
      practiceSamples: descent.confidence.practiceSamples,
    },
  });

  const runAction = () => {
    const { kind, logType } = plan.next;
    if (logType) {
      window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type: logType } }));
    } else if (kind === 'set-weigh-in') {
      window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'schedule' } }));
    } else if (kind === 'recovery') {
      setLocation('/recovery');
    } else if (kind === 'log-food') {
      setLocation('/food');
    }
  };

  return (
    <>
      <TodayPlanView
        plan={plan}
        onAction={runAction}
        trend={trend}
        health={health}
        onHealthTap={setSheet}
        onConnectHealth={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'health' } }))}
        onOpenFood={() => setLocation('/food')}
        slots={slots}
      />
      {todayHealth && (
        <MetricDetailSheet
          metric={sheet}
          healthHistory={scoredHistory}
          latestHealth={todayHealth}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
