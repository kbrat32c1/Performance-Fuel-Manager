/**
 * Pure computation functions for analytics/insights.
 * Extracted from store.tsx for maintainability and testability.
 */
import { differenceInDays, startOfDay, format, subDays } from 'date-fns';
import type { AthleteProfile, WeightLog, DailyTracking } from './types';
import { computeEMA } from './week-descent-calculator';

// ═══════════════════════════════════════════════════════════════════════════════
// Drift Metrics — overnight weight drift and session-level weight loss
// ═══════════════════════════════════════════════════════════════════════════════

export function computeDriftMetrics(logs: WeightLog[]): {
  overnight: number | null;
  session: number | null;
} {
  const sorted = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let overnightSum = 0;
  let overnightCount = 0;
  let sessionSum = 0;
  let sessionCount = 0;

  const morningLogs = sorted.filter(l => l.type === 'morning');
  const postPracticeLogs = sorted.filter(l => l.type === 'post-practice');
  const prePracticeLogs = sorted.filter(l => l.type === 'pre-practice');

  // Overnight drift: morning weight vs previous day's post-practice
  for (const morning of morningLogs) {
    const morningTime = new Date(morning.date).getTime();
    const match = postPracticeLogs.find(pp => {
      const ppTime = new Date(pp.date).getTime();
      const diffHours = (morningTime - ppTime) / (1000 * 60 * 60);
      return diffHours > 6 && diffHours < 16;
    });
    if (match) {
      overnightSum += (match.weight - morning.weight);
      overnightCount++;
    }
  }

  // Session loss: pre-practice vs post-practice (same session, within 4 hours)
  const usedPostIds = new Set<string>();
  for (const pre of prePracticeLogs) {
    const preTime = new Date(pre.date).getTime();
    const match = postPracticeLogs.find(pp => {
      if (usedPostIds.has(pp.id)) return false;
      const ppTime = new Date(pp.date).getTime();
      const diffHours = (ppTime - preTime) / (1000 * 60 * 60);
      return diffHours > 0 && diffHours < 4;
    });
    if (match) {
      usedPostIds.add(match.id);
      sessionSum += (pre.weight - match.weight);
      sessionCount++;
    }
  }

  return {
    overnight: overnightCount > 0 ? (overnightSum / overnightCount) : null,
    session: sessionCount > 0 ? (sessionSum / sessionCount) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Extra Workout Stats — from extra-before/extra-after log pairs
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtraWorkoutStats {
  avgLoss: number | null;
  avgSweatRateOzPerHr: number | null;
  totalWorkouts: number;
  todayWorkouts: number;
  todayLoss: number;
}

export function computeExtraWorkoutStats(
  profile: AthleteProfile,
  logs: WeightLog[],
): ExtraWorkoutStats {
  const today = startOfDay(profile.simulatedDate || new Date());
  const todayStr = format(today, 'yyyy-MM-dd');

  const extraBeforeLogs = logs.filter(l => l.type === 'extra-before')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const extraAfterLogs = logs.filter(l => l.type === 'extra-after')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const workoutLosses: number[] = [];
  const sweatRates: number[] = [];
  let todayWorkouts = 0;
  let todayLoss = 0;
  const usedAfterIds = new Set<string>();

  for (const before of extraBeforeLogs) {
    const beforeTime = new Date(before.date).getTime();
    const beforeDay = format(startOfDay(new Date(before.date)), 'yyyy-MM-dd');

    let bestAfter: typeof extraAfterLogs[0] | null = null;
    let bestTimeDiff = Infinity;

    for (const a of extraAfterLogs) {
      if (usedAfterIds.has(a.id)) continue;
      const afterTime = new Date(a.date).getTime();
      const afterDay = format(startOfDay(new Date(a.date)), 'yyyy-MM-dd');
      if (afterDay !== beforeDay) continue;
      const timeDiff = afterTime - beforeTime;
      if (timeDiff >= 0 && timeDiff < 3 * 60 * 60 * 1000 && timeDiff < bestTimeDiff) {
        bestAfter = a;
        bestTimeDiff = timeDiff;
      }
    }

    if (bestAfter) {
      usedAfterIds.add(bestAfter.id);
      const loss = before.weight - bestAfter.weight;
      if (loss > 0) {
        workoutLosses.push(loss);
        if (bestAfter.duration && bestAfter.duration > 0) {
          const ozPerHr = loss / (bestAfter.duration / 60);
          sweatRates.push(ozPerHr);
        }
        if (beforeDay === todayStr) {
          todayWorkouts++;
          todayLoss += loss;
        }
      }
    }
  }

  workoutLosses.reverse();
  sweatRates.reverse();

  return {
    avgLoss: computeEMA(workoutLosses),
    avgSweatRateOzPerHr: computeEMA(sweatRates),
    totalWorkouts: workoutLosses.length,
    todayWorkouts,
    todayLoss,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// History Insights — overnight drifts, sweat rates, projections, trends
// ═══════════════════════════════════════════════════════════════════════════════

export interface HistoryInsightsInput {
  profile: AthleteProfile;
  logs: WeightLog[];
  daysUntilWeighIn: number;
}

export function computeHistoryInsights(input: HistoryInsightsInput) {
  const { profile, logs, daysUntilWeighIn } = input;
  const now = profile.simulatedDate || new Date();
  const weighInDate = startOfDay(profile.weighInDate);

  const sortedLogs = [...logs].sort((a, b) => b.date.getTime() - a.date.getTime());
  const morningLogs = sortedLogs.filter(l => l.type === 'morning' || l.type === 'weigh-in');

  // Calculate overnight drift
  const overnightDrifts: number[] = [];
  const historyDriftRates: number[] = [];
  for (let i = 0; i < sortedLogs.length - 1; i++) {
    const current = sortedLogs[i];
    const prev = sortedLogs[i + 1];

    if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
      const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
      if (hoursDiff > 4 && hoursDiff < 16) {
        const drift = prev.weight - current.weight;
        overnightDrifts.push(drift);
        if (drift > 0 && prev.type === 'before-bed') {
          if (hoursDiff > 0) {
            const lbsPerHr = drift / hoursDiff;
            historyDriftRates.push(lbsPerHr);
          }
        }
      }
    }
  }

  // Calculate practice weight loss and sweat rate
  const practiceLosses: number[] = [];
  const historySweatRates: number[] = [];
  for (let i = 0; i < sortedLogs.length - 1; i++) {
    const post = sortedLogs[i];
    const pre = sortedLogs[i + 1];

    if (post.type === 'post-practice' && pre.type === 'pre-practice') {
      const hoursDiff = (post.date.getTime() - pre.date.getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 6) {
        const loss = pre.weight - post.weight;
        practiceLosses.push(loss);
        if (loss > 0) {
          const practiceHrs = post.duration && post.duration > 0
            ? post.duration / 60
            : (hoursDiff >= 0.25 ? hoursDiff : null);
          if (practiceHrs !== null && practiceHrs > 0) {
            const ozPerHr = loss / practiceHrs;
            if (ozPerHr <= 6) {
              historySweatRates.push(ozPerHr);
            }
          }
        }
      }
    }
  }

  // Get weights from 1 day before weigh-in
  const dayBeforeWeighInWeights = morningLogs.filter(l => {
    const logDate = startOfDay(l.date);
    const daysBeforeWeighIn = differenceInDays(weighInDate, logDate);
    return daysBeforeWeighIn === 1;
  }).slice(0, 4);

  // Get competition day weights
  const competitionDayWeights = morningLogs.filter(l => {
    const logDate = startOfDay(l.date);
    const daysBeforeWeighIn = differenceInDays(weighInDate, logDate);
    return daysBeforeWeighIn === 0;
  }).slice(0, 4);

  // Calculate final cut success
  const finalCuts: number[] = [];
  for (const dayBefore of dayBeforeWeighInWeights) {
    const twoDaysBeforeLog = morningLogs.find(l => {
      const daysDiff = (dayBefore.date.getTime() - l.date.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff > 0 && daysDiff < 2;
    });
    if (twoDaysBeforeLog) {
      finalCuts.push(twoDaysBeforeLog.weight - dayBefore.weight);
    }
  }

  // Week-over-week trend
  const weekAgoLogs = morningLogs.filter(l => {
    const daysDiff = differenceInDays(now, l.date);
    return daysDiff >= 6 && daysDiff <= 8;
  });
  const weeklyTrend = weekAgoLogs.length > 0 && morningLogs.length > 0
    ? weekAgoLogs[0].weight - morningLogs[0].weight
    : null;

  // Real-time phase-aware projection
  const latestMorningWeight = morningLogs.length > 0 ? morningLogs[0].weight : null;

  // Net daily loss from morning weights
  let netDailyLoss: number | null = null;
  if (morningLogs.length >= 2) {
    const oldestMorning = morningLogs[morningLogs.length - 1];
    const newestMorning = morningLogs[0];
    const daysBetween = Math.max(1, Math.round(
      (newestMorning.date.getTime() - oldestMorning.date.getTime()) / (1000 * 60 * 60 * 24)
    ));
    netDailyLoss = (oldestMorning.weight - newestMorning.weight) / daysBetween;
    if (netDailyLoss <= 0) netDailyLoss = null;
  }

  // EMA-weighted gross capacity components
  const avgOvernightLoss = computeEMA(overnightDrifts);
  const avgPracticeLossVal = computeEMA(practiceLosses);
  const grossCapacity = avgOvernightLoss !== null
    ? Math.abs(avgOvernightLoss) + Math.abs(avgPracticeLossVal || 0)
    : null;
  const hasDriftData = avgOvernightLoss !== null && Math.abs(avgOvernightLoss) > 0;
  const hasPracticeData = avgPracticeLossVal !== null && Math.abs(avgPracticeLossVal) > 0;
  const hasGrossData = grossCapacity !== null && grossCapacity > 0;
  const hasNetData = netDailyLoss !== null;

  // Daytime BMR drift for cut days
  const avgHistoryDriftRate = computeEMA(historyDriftRates);
  let historyDaytimeBmr = 0;
  if (avgHistoryDriftRate !== null && avgHistoryDriftRate > 0) {
    const sleepData: number[] = [];
    for (const log of sortedLogs) {
      if (log.type === 'morning' && log.sleepHours && log.sleepHours > 0) {
        sleepData.push(log.sleepHours);
        if (sleepData.length >= 5) break;
      }
    }
    const avgSleep = sleepData.length > 0 ? (computeEMA(sleepData) || 8) : 8;
    const pracDurations: number[] = [];
    for (const log of sortedLogs) {
      if (log.type === 'post-practice' && log.duration && log.duration > 0) {
        pracDurations.push(log.duration / 60);
        if (pracDurations.length >= 5) break;
      }
    }
    const avgPracHrs = pracDurations.length > 0 ? (computeEMA(pracDurations) || 2) : 2;
    const awakeNonActive = Math.max(0, 24 - avgSleep - avgPracHrs);
    historyDaytimeBmr = awakeNonActive * avgHistoryDriftRate;
  }

  // Hybrid projection
  const today = startOfDay(profile.simulatedDate || new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const allTodayLogs = logs.filter(l => {
    const logDate = new Date(l.date);
    return format(startOfDay(logDate), 'yyyy-MM-dd') === todayStr;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const mostRecentWeight = allTodayLogs.length > 0 ? allTodayLogs[0].weight : latestMorningWeight;
  const isLoadingToday = daysUntilWeighIn >= 3;

  let projectedSaturday: number | null = null;
  if (daysUntilWeighIn > 0 && (hasDriftData || hasNetData)) {
    const drift = hasDriftData ? Math.abs(avgOvernightLoss!) : 0;
    const practice = hasPracticeData ? Math.abs(avgPracticeLossVal!) : 0;
    let projected: number;

    if (isLoadingToday && latestMorningWeight) {
      projected = latestMorningWeight;
      const todayLoss = hasNetData ? netDailyLoss! : (hasGrossData ? grossCapacity! * 0.2 : 0);
      projected -= todayLoss;
    } else if (mostRecentWeight) {
      projected = mostRecentWeight;
      const lastLogType = allTodayLogs.length > 0 ? allTodayLogs[0].type : null;
      let todayRemainingLoss = 0;

      if (lastLogType) {
        if (lastLogType === 'morning' || lastLogType === 'weigh-in' || lastLogType === 'pre-practice') {
          todayRemainingLoss = practice + drift;
        } else if (lastLogType === 'post-practice' || lastLogType === 'before-bed') {
          todayRemainingLoss = drift;
        } else if (lastLogType === 'extra-after') {
          todayRemainingLoss = practice + drift;
        } else if (lastLogType === 'check-in' || lastLogType === 'extra-before') {
          const hasPracticeLog = allTodayLogs.some(l => l.type === 'post-practice');
          todayRemainingLoss = hasPracticeLog ? drift : (practice + drift);
        }
      } else {
        todayRemainingLoss = practice + drift;
      }
      projected -= todayRemainingLoss;
    } else if (latestMorningWeight) {
      projected = latestMorningWeight;
    } else {
      projected = 0;
    }

    if (projected > 0) {
      for (let d = daysUntilWeighIn - 1; d > 0; d--) {
        if (d >= 3) {
          const loadingLoss = hasNetData ? netDailyLoss! : (hasGrossData ? grossCapacity! * 0.2 : 0);
          projected -= loadingLoss;
        } else {
          if (hasGrossData) {
            projected -= grossCapacity!;
          } else if (hasNetData) {
            projected -= netDailyLoss! * 2.5;
          }
        }
      }
    }

    if (projected > 0) {
      projectedSaturday = projected;
    }
  }

  return {
    avgOvernightDrift: computeEMA(overnightDrifts),
    avgDriftRateOzPerHr: computeEMA(historyDriftRates),
    avgPracticeLoss: computeEMA(practiceLosses),
    avgSweatRateOzPerHr: computeEMA(historySweatRates),
    avgFridayCut: finalCuts.length > 0
      ? finalCuts.reduce((a, b) => a + b, 0) / finalCuts.length
      : null,
    weeklyTrend,
    projectedSaturday,
    daysUntilSat: daysUntilWeighIn,
    totalLogsThisWeek: sortedLogs.filter(l => {
      const daysDiff = (now.getTime() - l.date.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7;
    }).length,
    hasEnoughData: overnightDrifts.length >= 2 || practiceLosses.length >= 2,
    lastFridayWeight: dayBeforeWeighInWeights.length > 0 ? dayBeforeWeighInWeights[0].weight : null,
    lastSaturdayWeight: competitionDayWeights.length > 0 ? competitionDayWeights[0].weight : null,
    madeWeightLastWeek: competitionDayWeights.length > 0 && competitionDayWeights[0].weight <= profile.targetWeightClass,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adaptive Macro Adjustment — detects plateaus and suggests calorie changes
// ═══════════════════════════════════════════════════════════════════════════════

export interface AdaptiveAdjustmentInput {
  profile: AthleteProfile;
  logs: WeightLog[];
  getSliceTargets: () => { calorieAdjustment?: number; [key: string]: any };
}

export function computeAdaptiveAdjustment(input: AdaptiveAdjustmentInput) {
  const { profile, logs } = input;
  const now = profile.simulatedDate || new Date();

  const morningLogs = logs
    .filter(l => l.type === 'morning' || l.type === 'weigh-in')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const recentWeights = morningLogs.map(l => ({
    date: format(new Date(l.date), 'yyyy-MM-dd'),
    weight: l.weight,
  }));

  if (morningLogs.length < 3) {
    return {
      isPlateaued: false,
      plateauDays: 0,
      suggestedAdjustment: 0,
      reason: 'Need at least 3 days of weight data',
      recentWeights,
      variance: 0,
      expectedLoss: 0,
      actualLoss: 0,
    };
  }

  const weights = morningLogs.map(l => l.weight);
  const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
  const squaredDiffs = weights.map(w => Math.pow(w - mean, 2));
  const variance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / weights.length);

  const oldestWeight = morningLogs[morningLogs.length - 1].weight;
  const newestWeight = morningLogs[0].weight;
  const daysBetween = Math.max(1, differenceInDays(
    new Date(morningLogs[0].date),
    new Date(morningLogs[morningLogs.length - 1].date)
  ));
  const actualLoss = oldestWeight - newestWeight;
  const actualDailyLoss = actualLoss / daysBetween;

  const sliceTargets = input.getSliceTargets();
  const calorieAdjustment = sliceTargets.calorieAdjustment || 0;
  const expectedDailyLoss = Math.abs(calorieAdjustment) / 3500;
  const expectedLoss = expectedDailyLoss * daysBetween;

  const isPlateaued = variance < 0.35 && daysBetween >= 3 && (
    (calorieAdjustment < 0 && actualLoss < expectedLoss * 0.3) ||
    (calorieAdjustment > 0 && actualLoss > -expectedLoss * 0.3)
  );

  let plateauDays = 0;
  if (isPlateaued) {
    for (let i = 0; i < weights.length - 1; i++) {
      if (Math.abs(weights[i] - weights[i + 1]) < 0.3) {
        plateauDays++;
      } else {
        break;
      }
    }
    plateauDays = Math.max(plateauDays, daysBetween);
  }

  let suggestedAdjustment = 0;
  let reason = '';

  if (isPlateaued) {
    if (calorieAdjustment < 0) {
      suggestedAdjustment = -100;
      reason = `Weight stalled at ~${mean.toFixed(1)} lbs for ${plateauDays}+ days. Consider reducing calories by 100.`;
    } else if (calorieAdjustment > 0) {
      suggestedAdjustment = -50;
      reason = `Gaining faster than expected. Consider reducing surplus by 50 cal to stay lean.`;
    } else {
      if (actualLoss < -0.5) {
        suggestedAdjustment = 100;
        reason = `Unintentional weight gain detected. Consider reducing by 100 cal.`;
      } else if (actualLoss > 0.5) {
        suggestedAdjustment = 100;
        reason = `Unintentional weight loss detected. Consider adding 100 cal.`;
      }
    }
  } else if (calorieAdjustment < 0 && actualDailyLoss > expectedDailyLoss * 1.5) {
    suggestedAdjustment = 50;
    reason = `Losing faster than expected (${(actualDailyLoss * 7).toFixed(1)} lbs/week). Consider adding 50 cal to preserve muscle.`;
  }

  return {
    isPlateaued,
    plateauDays,
    suggestedAdjustment,
    reason,
    recentWeights,
    variance: Math.round(variance * 100) / 100,
    expectedLoss: Math.round(expectedLoss * 100) / 100,
    actualLoss: Math.round(actualLoss * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Weekly Compliance — tracks how well user hits macro targets
// ═══════════════════════════════════════════════════════════════════════════════

export interface WeeklyComplianceInput {
  profile: AthleteProfile;
  getSliceTargets: () => { protein: number; carb: number; veg: number; fruit: number; fat: number; [key: string]: any };
  getDailyTracking: (date: string) => DailyTracking;
}

export function computeWeeklyCompliance(input: WeeklyComplianceInput) {
  const { profile } = input;
  const now = profile.simulatedDate || new Date();
  const targets = input.getSliceTargets();

  const weekData: Array<{
    date: string;
    protein: { consumed: number; target: number };
    carb: { consumed: number; target: number };
    veg: { consumed: number; target: number };
    fruit: { consumed: number; target: number };
    fat: { consumed: number; target: number };
  }> = [];

  for (let i = 0; i < 7; i++) {
    const date = subDays(now, i);
    const dateKey = format(date, 'yyyy-MM-dd');
    const tracking = input.getDailyTracking(dateKey);

    const hasData = tracking.proteinSlices > 0 || tracking.carbSlices > 0 ||
                    tracking.vegSlices > 0 || (tracking.fruitSlices || 0) > 0 ||
                    (tracking.fatSlices || 0) > 0;

    if (hasData) {
      weekData.push({
        date: dateKey,
        protein: { consumed: tracking.proteinSlices, target: targets.protein },
        carb: { consumed: tracking.carbSlices, target: targets.carb },
        veg: { consumed: tracking.vegSlices, target: targets.veg },
        fruit: { consumed: tracking.fruitSlices || 0, target: targets.fruit },
        fat: { consumed: tracking.fatSlices || 0, target: targets.fat },
      });
    }
  }

  const daysTracked = weekData.length;

  const calcCompliance = (category: 'protein' | 'carb' | 'veg' | 'fruit' | 'fat') => {
    if (daysTracked === 0) return { percentage: 0, avgConsumed: 0, avgTarget: 0 };

    const totalConsumed = weekData.reduce((sum, d) => sum + d[category].consumed, 0);
    const totalTarget = weekData.reduce((sum, d) => sum + d[category].target, 0);
    const avgConsumed = totalConsumed / daysTracked;
    const avgTarget = totalTarget / daysTracked;

    const percentage = totalTarget > 0
      ? Math.min(100, Math.round((totalConsumed / totalTarget) * 100))
      : 0;

    return {
      percentage,
      avgConsumed: Math.round(avgConsumed * 10) / 10,
      avgTarget: Math.round(avgTarget * 10) / 10,
    };
  };

  const compliance = {
    protein: calcCompliance('protein'),
    carb: calcCompliance('carb'),
    veg: calcCompliance('veg'),
    fruit: calcCompliance('fruit'),
    fat: calcCompliance('fat'),
  };

  const categories = ['protein', 'carb', 'veg', 'fruit', 'fat'] as const;
  const validCategories = categories.filter(c => compliance[c].avgTarget > 0);

  let bestCategory = 'protein';
  let worstCategory = 'protein';
  let bestPct = 0;
  let worstPct = 100;

  for (const cat of validCategories) {
    if (compliance[cat].percentage > bestPct) {
      bestPct = compliance[cat].percentage;
      bestCategory = cat;
    }
    if (compliance[cat].percentage < worstPct) {
      worstPct = compliance[cat].percentage;
      worstCategory = cat;
    }
  }

  let insight = '';
  if (daysTracked === 0) {
    insight = 'Start tracking to see your weekly compliance stats!';
  } else if (daysTracked < 3) {
    insight = `Only ${daysTracked} day${daysTracked === 1 ? '' : 's'} tracked. Log more for accurate insights.`;
  } else if (worstPct < 70) {
    const catLabel = worstCategory === 'protein' ? 'protein' :
                     worstCategory === 'carb' ? 'carbs' :
                     worstCategory === 'veg' ? 'veggies' :
                     worstCategory === 'fruit' ? 'fruit' : 'fats';
    insight = `You're under-hitting ${catLabel} (${worstPct}%). Try adding 1 extra serving at dinner.`;
  } else if (bestPct > 100) {
    const catLabel = bestCategory === 'protein' ? 'protein' :
                     bestCategory === 'carb' ? 'carbs' :
                     bestCategory === 'veg' ? 'veggies' :
                     bestCategory === 'fruit' ? 'fruit' : 'fats';
    insight = `Great ${catLabel} intake! Make sure other macros are balanced too.`;
  } else if (worstPct >= 85) {
    insight = 'Excellent compliance across all categories! Keep it up.';
  } else {
    insight = `Focus on ${worstCategory} — currently at ${worstPct}% of target.`;
  }

  return {
    ...compliance,
    daysTracked,
    bestCategory,
    worstCategory,
    insight,
  };
}
