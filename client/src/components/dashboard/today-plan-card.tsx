/**
 * TodayPlanCard — the summary at the top of the Today screen.
 * Next action, today's food and fluid plan, status and how sure the app is.
 * The cards below it (Cut Lab, recovery, Fuel) are the detail behind it.
 * All logic lives in lib/today-plan.ts; this file only reads the store and draws.
 */

import { useLocation } from "wouter";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { buildTodayPlan } from "@/lib/today-plan";
import { TodayPlanView } from "./today-plan-view";

interface TodayPlanCardProps {
  todayLogs: { morning?: any; prePractice?: any; postPractice?: any; beforeBed?: any; weighIn?: any };
  isRestDay: boolean;
  hasRecoveryData: boolean;
  /** Override "now" for previews and tests. */
  hour?: number;
}

export function TodayPlanCard({ todayLogs, isRestDay, hasRecoveryData, hour }: TodayPlanCardProps) {
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

  return <TodayPlanView plan={plan} onAction={runAction} />;
}
