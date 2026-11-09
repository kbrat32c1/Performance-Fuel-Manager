/**
 * Pure computation for weekly descent data.
 * Extracted from store.tsx for testability and maintainability.
 *
 * This is the largest single computation in the app (~900 lines).
 * It computes overnight drift, practice losses, projections,
 * Monte Carlo make-weight probability, and more.
 */
import { differenceInDays, startOfDay, endOfDay, format } from 'date-fns';
import type { AthleteProfile, WeightLog, DailyTracking, StoreContextType } from './types';
import { waterLoadingActive } from "@/lib/constants";

// Re-export the return type for convenience
export type WeekDescentData = ReturnType<StoreContextType['getWeekDescentData']>;

/**
 * EMA (Exponential Moving Average) — gives more weight to recent values.
 * Alpha=0.4: most recent value gets ~40%, next ~24%, next ~14%.
 * Expects values in newest-first order.
 */
const EMA_ALPHA = 0.4;
export function computeEMA(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  let ema = values[values.length - 1];
  for (let i = values.length - 2; i >= 0; i--) {
    ema = EMA_ALPHA * values[i] + (1 - EMA_ALPHA) * ema;
  }
  return ema;
}

/** Plausibility limits for one weigh-in pair (lbs). Outside these it's almost certainly a typo or wrong log type. */
export const DRIFT_LOSS_LIMIT = 6;
export const DRIFT_GAIN_LIMIT = 4;
export const PRACTICE_LOSS_LIMIT = 10;
export const PRACTICE_GAIN_LIMIT = 4;
/** Pairs of each kind needed before projections drive recommendations. */
export const MIN_RELIABLE_SAMPLES = 3;

export interface WeekDescentInput {
  profile: AthleteProfile;
  logs: WeightLog[];
  daysUntilWeighIn: number;
  /** calculateTarget() result for pace calculation */
  calculateTarget: () => number;
  /** getDailyTracking(date) getter */
  getDailyTracking: (date: string) => DailyTracking;
}

export function computeWeekDescentData(input: WeekDescentInput): WeekDescentData {
  const { profile, daysUntilWeighIn } = input;
  const today = startOfDay(profile.simulatedDate || new Date());
  // Viewing a past day must not see weigh-ins logged after it.
  const viewEnd = endOfDay(today).getTime();
  const logs = input.logs.filter(l => new Date(l.date).getTime() <= viewEnd);
  const targetWeight = profile.targetWeightClass;
  const daysRemaining = Math.max(0, differenceInDays(startOfDay(profile.weighInDate), today));

  const morningWeights: Array<{ day: string; weight: number; date: Date }> = [];

  // ═══ CYCLE START — anchored to weigh-in date, not day of week ═══
  const todayHasWeighIn = logs.some(l => {
    const ld = new Date(l.date);
    return l.type === 'weigh-in' &&
      ld.getFullYear() === today.getFullYear() &&
      ld.getMonth() === today.getMonth() &&
      ld.getDate() === today.getDate();
  });
  const effectiveWeighInDate = todayHasWeighIn ? new Date(today) : new Date(profile.weighInDate);

  let cycleStart: Date;
  const lastCompWeighIn = [...logs]
    .filter(l => l.type === 'weigh-in' && startOfDay(new Date(l.date)).getTime() < today.getTime())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (lastCompWeighIn) {
    cycleStart = new Date(startOfDay(new Date(lastCompWeighIn.date)));
    cycleStart.setDate(cycleStart.getDate() + 1);
    cycleStart.setHours(0, 0, 0, 0);
  } else {
    const wiMinus6 = new Date(startOfDay(effectiveWeighInDate));
    wiMinus6.setDate(wiMinus6.getDate() - 6);
    const todayMinus6 = new Date(today);
    todayMinus6.setDate(today.getDate() - 6);
    cycleStart = new Date(Math.max(wiMinus6.getTime(), todayMinus6.getTime()));
    cycleStart.setHours(0, 0, 0, 0);
  }

  // Clamp: never look back more than 13 days
  const maxLookback = new Date(today);
  maxLookback.setDate(today.getDate() - 13);
  maxLookback.setHours(0, 0, 0, 0);
  if (cycleStart.getTime() < maxLookback.getTime()) {
    cycleStart = maxLookback;
  }
  if (cycleStart.getTime() > today.getTime()) {
    cycleStart = new Date(today);
  }

  // Collect morning weights from cycle start through today
  const cycleDays = differenceInDays(today, cycleStart) + 1;
  const weighInDateStart = startOfDay(effectiveWeighInDate);
  for (let i = 0; i < cycleDays; i++) {
    const checkDate = new Date(cycleStart);
    checkDate.setDate(cycleStart.getDate() + i);
    if (checkDate > today) break;

    const morningLog = logs.find(log => {
      const logDate = new Date(log.date);
      return (log.type === 'morning' || log.type === 'weigh-in') &&
        logDate.getFullYear() === checkDate.getFullYear() &&
        logDate.getMonth() === checkDate.getMonth() &&
        logDate.getDate() === checkDate.getDate();
    });

    if (morningLog) {
      const daysOut = differenceInDays(weighInDateStart, checkDate);
      morningWeights.push({
        day: daysOut > 0 ? `${daysOut}d` : daysOut === 0 ? 'WI' : 'R',
        weight: morningLog.weight,
        date: new Date(checkDate)
      });
    }
  }

  const startWeight = morningWeights.length > 0 ? morningWeights[0].weight : null;
  const latestMorningWeight = morningWeights.length > 0 ? morningWeights[morningWeights.length - 1].weight : null;

  // For projections, use the most recent weigh-in of ANY type
  const todayStr = format(today, 'yyyy-MM-dd');
  const allTodayLogs = logs.filter(l => {
    const logDate = new Date(l.date);
    return format(startOfDay(logDate), 'yyyy-MM-dd') === todayStr;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const officialWeighInLog = allTodayLogs.find(l => l.type === 'weigh-in');
  const isCompDay = daysRemaining === 0 || !!officialWeighInLog;
  // With water loading on, water stays high through 2 days out, so that day projects like a loading day.
  const lastLoadingDay = waterLoadingActive(profile) ? 2 : 3;

  const mostRecentWeighIn = allTodayLogs.length > 0 ? allTodayLogs[0].weight : latestMorningWeight;
  const todayMorningLog = allTodayLogs.find(l => l.type === 'morning');
  const todayMorningWeight = todayMorningLog?.weight ?? null;
  const isTrainingPhaseForWeight = daysRemaining > 5;
  const currentWeight = (isCompDay && officialWeighInLog)
    ? officialWeighInLog.weight
    : (isTrainingPhaseForWeight && todayMorningWeight !== null)
      ? todayMorningWeight
      : mostRecentWeighIn;

  const totalLost = startWeight && currentWeight ? startWeight - currentWeight : null;

  let dailyAvgLoss: number | null = null;
  if (morningWeights.length >= 2 && startWeight && latestMorningWeight) {
    const firstDate = morningWeights[0].date;
    const lastDate = morningWeights[morningWeights.length - 1].date;
    const actualDaysBetween = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
    dailyAvgLoss = (startWeight - latestMorningWeight) / actualDaysBetween;
  }

  // Only use THIS cycle's data
  const sortedLogs = [...logs]
    .filter(l => l.date.getTime() >= cycleStart.getTime())
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Phase-aware overnight drift with EMA
  let excludedPairs = 0;
  const loadingDrifts: number[] = [];
  const cutDrifts: number[] = [];
  const allDrifts: number[] = [];
  const driftRates: number[] = [];

  // Overnight pairs belong to the morning they end on, so the first morning of the cycle
  // still pairs with the bed weight logged the night before cycleStart.
  const driftLookbackStart = cycleStart.getTime() - 16 * 60 * 60 * 1000;
  const driftLogs = [...logs]
    .filter(l => l.date.getTime() >= driftLookbackStart)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  for (let i = 0; i < driftLogs.length - 1; i++) {
    const current = driftLogs[i];
    const prev = driftLogs[i + 1];
    if (current.date.getTime() < cycleStart.getTime()) break;
    if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
      const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
      if (hoursDiff > 4 && hoursDiff < 16) {
        const drift = prev.weight - current.weight;
        if (drift < -DRIFT_GAIN_LIMIT || drift > DRIFT_LOSS_LIMIT) { excludedPairs++; continue; }
        allDrifts.push(drift);

        if (drift > 0 && prev.type === 'before-bed') {
          if (hoursDiff > 0) {
            driftRates.push(drift / hoursDiff);
          }
        }

        const prevDate = startOfDay(new Date(prev.date));
        const daysOut = differenceInDays(startOfDay(profile.weighInDate), prevDate);
        if (daysOut >= lastLoadingDay) {
          loadingDrifts.push(drift);
        } else if (daysOut >= 1) {
          cutDrifts.push(drift);
        }
      }
    }
  }

  // Practice losses with EMA
  const practiceLosses: number[] = [];
  const practiceSweatRates: number[] = [];
  for (let i = 0; i < sortedLogs.length - 1; i++) {
    const post = sortedLogs[i];
    const pre = sortedLogs[i + 1];
    if (post.type === 'post-practice' && pre.type === 'pre-practice') {
      const hoursDiff = (post.date.getTime() - pre.date.getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 6) {
        const loss = pre.weight - post.weight;
        if (loss < -PRACTICE_GAIN_LIMIT || loss > PRACTICE_LOSS_LIMIT) { excludedPairs++; continue; }
        practiceLosses.push(loss);
        if (loss > 0) {
          const practiceHrs = post.duration && post.duration > 0
            ? post.duration / 60
            : (hoursDiff >= 0.25 ? hoursDiff : null);
          if (practiceHrs !== null && practiceHrs > 0) {
            const ozPerHr = loss / practiceHrs;
            if (ozPerHr <= 6) {
              practiceSweatRates.push(ozPerHr);
            }
          }
        }
      }
    }
  }

  const avgOvernightDrift = computeEMA(allDrifts);
  const avgLoadingDrift = computeEMA(loadingDrifts);
  const avgCutDrift = computeEMA(cutDrifts);
  const avgPracticeLoss = computeEMA(practiceLosses);
  const avgSweatRateOzPerHr = computeEMA(practiceSweatRates);
  const avgDriftRateOzPerHr = computeEMA(driftRates);

  // EMA averages for sleep & practice hours
  const sleepHoursData: number[] = [];
  for (const log of sortedLogs) {
    if (log.type === 'morning' && log.sleepHours && log.sleepHours > 0) {
      sleepHoursData.push(log.sleepHours);
      if (sleepHoursData.length >= 5) break;
    }
  }
  const emaSleepHours = sleepHoursData.length > 0 ? (computeEMA(sleepHoursData) || 8) : 8;

  const practiceDurations: number[] = [];
  for (const log of sortedLogs) {
    if (log.type === 'post-practice' && log.duration && log.duration > 0) {
      practiceDurations.push(log.duration / 60);
      if (practiceDurations.length >= 5) break;
    }
  }
  const emaPracticeHours = practiceDurations.length > 0 ? (computeEMA(practiceDurations) || 2) : 2;

  // Daytime BMR drift for cut days
  let daytimeBmrDrift = 0;
  if (avgDriftRateOzPerHr !== null && avgDriftRateOzPerHr > 0) {
    const todayMorningSleep = allTodayLogs.find(l => l.type === 'morning' && l.sleepHours && l.sleepHours > 0);
    const todaySleepHours = todayMorningSleep ? todayMorningSleep.sleepHours! : emaSleepHours;
    const todayPracticeLog = allTodayLogs.find(l => l.type === 'post-practice' && l.duration && l.duration > 0);
    const todayPracticeHours = todayPracticeLog ? todayPracticeLog.duration! / 60 : emaPracticeHours;
    const todayExtraMinutes = allTodayLogs
      .filter(l => l.type === 'extra-after' && l.duration && l.duration > 0)
      .reduce((sum, l) => sum + (l.duration || 0), 0);
    const todayExtraHours = todayExtraMinutes / 60;
    const todayAwakeHours = Math.max(0, 24 - todaySleepHours - todayPracticeHours - todayExtraHours);
    daytimeBmrDrift = todayAwakeHours * avgDriftRateOzPerHr;
  }

  // Gross daily loss capacity
  let grossDailyLoss: number | null = null;
  if (avgOvernightDrift !== null) {
    // A net gain (negative) means no loss capacity — never flip it into a loss.
    grossDailyLoss = Math.max(0, avgOvernightDrift) + Math.max(0, avgPracticeLoss || 0);
  }
  const loadingDrift = avgLoadingDrift !== null ? Math.max(0, avgLoadingDrift) : (avgOvernightDrift !== null ? Math.max(0, avgOvernightDrift) : 0);
  const cutDrift = avgCutDrift !== null ? Math.max(0, avgCutDrift) : (avgOvernightDrift !== null ? Math.max(0, avgOvernightDrift) * 0.6 : 0);
  const practice = avgPracticeLoss !== null ? Math.max(0, avgPracticeLoss) : 0;

  // Hybrid projection
  let projectedSaturday: number | null = null;
  let todayRemainingComponents: { sleep: number; practice: number } | null = null;

  if (daysRemaining > 0) {
    const hasDriftData = avgOvernightDrift !== null && avgOvernightDrift > 0;
    const hasNetData = dailyAvgLoss !== null && dailyAvgLoss > 0;
    const hasGrossData = grossDailyLoss !== null && grossDailyLoss > 0;
    const isLoadingToday = daysRemaining >= lastLoadingDay;
    const todayDrift = isLoadingToday ? loadingDrift : cutDrift;

    if (hasDriftData || hasNetData) {
      let projected: number;

      if (isLoadingToday && latestMorningWeight) {
        projected = latestMorningWeight;
        const todayLoss = hasNetData ? dailyAvgLoss! : (hasGrossData ? grossDailyLoss! * 0.2 : 0);
        projected -= todayLoss;
      } else if (currentWeight) {
        projected = currentWeight;
        const lastLogType = allTodayLogs.length > 0 ? allTodayLogs[0].type : null;
        let todayRemainingLoss = 0;
        let remainingSleep = 0;
        let remainingPractice = 0;

        if (lastLogType) {
          if (lastLogType === 'morning' || lastLogType === 'weigh-in' || lastLogType === 'pre-practice') {
            remainingSleep = todayDrift;
            remainingPractice = practice;
            todayRemainingLoss = practice + todayDrift;
          } else if (lastLogType === 'post-practice' || lastLogType === 'before-bed') {
            remainingSleep = todayDrift;
            remainingPractice = 0;
            todayRemainingLoss = todayDrift;
          } else if (lastLogType === 'extra-after') {
            const hasPracticeLog = allTodayLogs.some(l => l.type === 'post-practice');
            remainingSleep = todayDrift;
            remainingPractice = hasPracticeLog ? 0 : practice;
            todayRemainingLoss = hasPracticeLog ? todayDrift : (practice + todayDrift);
          } else if (lastLogType === 'check-in' || lastLogType === 'extra-before') {
            const hasPracticeLog = allTodayLogs.some(l => l.type === 'post-practice');
            remainingSleep = todayDrift;
            remainingPractice = hasPracticeLog ? 0 : practice;
            todayRemainingLoss = hasPracticeLog ? todayDrift : (practice + todayDrift);
          }
        } else {
          remainingSleep = todayDrift;
          remainingPractice = practice;
          todayRemainingLoss = practice + todayDrift;
        }
        todayRemainingComponents = { sleep: remainingSleep, practice: remainingPractice };
        projected -= todayRemainingLoss;
      } else if (latestMorningWeight) {
        projected = latestMorningWeight;
      } else {
        projected = 0;
      }

      if (projected > 0) {
        for (let d = daysRemaining - 1; d > 0; d--) {
          if (d >= lastLoadingDay) {
            const loadingLoss = hasNetData ? dailyAvgLoss! : (hasGrossData ? grossDailyLoss! * 0.2 : 0);
            projected -= loadingLoss;
          } else {
            const cutDayGross = cutDrift + practice;
            if (cutDayGross > 0) {
              projected -= cutDayGross;
            } else if (hasGrossData) {
              projected -= grossDailyLoss!;
            } else if (hasNetData) {
              projected -= dailyAvgLoss! * 2.5;
            }
          }
        }
        projectedSaturday = projected;
      }
    } else if (latestMorningWeight) {
      projectedSaturday = latestMorningWeight;
    } else if (currentWeight) {
      projectedSaturday = currentWeight;
    }
  }

  // Pace calculation
  let pace: 'ahead' | 'on-track' | 'behind' | null = null;
  if (currentWeight && targetWeight) {
    const isTraining = daysUntilWeighIn > 5;

    if (isTraining) {
      const walkAround = profile.targetWeightClass * 1.07;
      const walkDiff = currentWeight - walkAround;
      if (walkDiff <= 0) pace = 'ahead';
      else if (walkDiff <= 3) pace = 'on-track';
      else pace = 'behind';
    } else {
      const effectiveTarget = input.calculateTarget();
      const diff = currentWeight - effectiveTarget;
      const tolerance = 1.5;
      if (diff <= -1) pace = 'ahead';
      else if (diff <= tolerance) pace = 'on-track';
      else pace = 'behind';
    }
  }

  // Trend arrows
  const computeTrend = (arr: number[]): 'up' | 'down' | 'stable' => {
    if (arr.length < 3) return 'stable';
    const recent = (arr[0] + arr[1]) / 2;
    const prev = arr.length >= 4 ? (arr[2] + arr[3]) / 2 : arr[2];
    const pctChange = (recent - prev) / Math.max(Math.abs(prev), 0.01);
    if (pctChange > 0.08) return 'up';
    if (pctChange < -0.08) return 'down';
    return 'stable';
  };
  const trends = {
    drift: computeTrend(allDrifts),
    practice: computeTrend(practiceLosses),
    driftRate: computeTrend(driftRates),
    sweatRate: computeTrend(practiceSweatRates),
  };

  // Confidence
  const driftSamples = allDrifts.length;
  const practiceSamples = practiceLosses.length;
  const minSamples = Math.min(driftSamples, practiceSamples);
  const confidenceLevel: 'high' | 'medium' | 'low' | 'none' =
    minSamples >= 5 ? 'high' : minSamples >= 3 ? 'medium' : minSamples >= 1 ? 'low' : 'none';
  // Projections and extra-work suggestions need several real pairs; one odd pair can't drive them.
  const reliable = driftSamples >= MIN_RELIABLE_SAMPLES && practiceSamples >= MIN_RELIABLE_SAMPLES;
  const confidence = { driftSamples, practiceSamples, level: confidenceLevel, excludedPairs, reliable };

  // Monte Carlo make-weight probability
  let makeWeightProb: { probability: number; worstCase: number; median: number; includesExtraWork: boolean } | null = null;
  if (projectedSaturday !== null && currentWeight && daysRemaining > 0 && allDrifts.length >= 1) {
    const emaStdDev = (arr: number[], emaMean: number): number => {
      if (arr.length < 2) return 0;
      const alpha = 0.4;
      let weightedSum = 0;
      let totalWeight = 0;
      for (let i = 0; i < arr.length; i++) {
        const w = Math.pow(1 - alpha, i);
        weightedSum += w * (arr[i] - emaMean) ** 2;
        totalWeight += w;
      }
      return Math.sqrt(weightedSum / totalWeight);
    };
    const cappedStd = (rawStd: number, mean: number, maxFrac = 0.25): number => {
      const cap = Math.abs(mean) * maxFrac;
      return Math.min(rawStd, Math.max(cap, 0.05));
    };
    let seed = Math.round(
      (currentWeight || 0) * 1000 +
      (targetWeight || 0) * 100 +
      daysRemaining * 10 +
      allDrifts.length +
      practiceLosses.length
    );
    const seededRandom = (): number => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const randn = (): number => {
      let u = 0, v = 0;
      while (u === 0) u = seededRandom();
      while (v === 0) v = seededRandom();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    const cutDriftMean = cutDrift;
    const cutDriftStd = cappedStd(
      cutDrifts.length >= 2 ? emaStdDev(cutDrifts, cutDriftMean) : cutDriftMean * 0.2,
      cutDriftMean
    );
    const loadDriftMean = loadingDrift;
    const loadDriftStd = cappedStd(
      loadingDrifts.length >= 2 ? emaStdDev(loadingDrifts, loadDriftMean) : loadDriftMean * 0.2,
      loadDriftMean
    );
    const practiceMean = practice;
    const practiceStd = cappedStd(
      practiceLosses.length >= 2 ? emaStdDev(practiceLosses, practiceMean) : 0,
      practiceMean
    );
    const netDailyMean = dailyAvgLoss || 0;

    const simLoss = (mean: number, std: number): number => {
      const draw = mean + randn() * std;
      return Math.max(0, draw);
    };

    const SIMS = 2000;
    const results: number[] = [];
    const isLoadingToday = daysRemaining >= lastLoadingDay;

    const sweatRate = avgSweatRateOzPerHr;
    let extraWorkoutMean = 0;
    let extraWorkoutStd = 0;
    if (reliable && projectedSaturday > targetWeight && sweatRate && sweatRate > 0) {
      const gap = projectedSaturday - targetWeight;
      const minutesNeeded = Math.round((gap / sweatRate) * 60);
      const cappedMinutes = Math.min(minutesNeeded, 60);
      extraWorkoutMean = sweatRate * (cappedMinutes / 60);
      extraWorkoutStd = cappedStd(extraWorkoutMean * 0.15, extraWorkoutMean);
    }

    for (let s = 0; s < SIMS; s++) {
      let w: number;

      if (isLoadingToday && latestMorningWeight) {
        w = latestMorningWeight;
        w -= netDailyMean > 0 ? simLoss(netDailyMean, loadDriftStd) : 0;
      } else if (currentWeight && todayRemainingComponents) {
        w = currentWeight;
        if (todayRemainingComponents.sleep > 0) {
          w -= simLoss(todayRemainingComponents.sleep, cutDriftStd);
        }
        if (todayRemainingComponents.practice > 0) {
          w -= simLoss(todayRemainingComponents.practice, practiceStd);
        }
      } else if (currentWeight) {
        w = currentWeight;
      } else {
        w = latestMorningWeight || 0;
      }

      if (extraWorkoutMean > 0) {
        w -= simLoss(extraWorkoutMean, extraWorkoutStd);
      }

      for (let d = daysRemaining - 1; d > 0; d--) {
        if (d >= lastLoadingDay) {
          w -= netDailyMean > 0
            ? simLoss(netDailyMean, loadDriftStd)
            : simLoss(loadDriftMean * 0.2, loadDriftStd * 0.3);
        } else {
          w -= simLoss(cutDriftMean, cutDriftStd);
          w -= simLoss(practiceMean, practiceStd);
        }
      }
      results.push(w);
    }

    results.sort((a, b) => a - b);
    const madeWeight = results.filter(r => r <= targetWeight).length;
    const rawProb = Math.round((madeWeight / SIMS) * 100);

    makeWeightProb = {
      probability: rawProb,
      worstCase: results[Math.floor(SIMS * 0.90)],
      median: results[Math.floor(SIMS * 0.5)],
      includesExtraWork: extraWorkoutMean > 0,
    };
  }

  // Today's progress
  let todayProgress: { lostSoFar: number; expectedTotal: number; pctComplete: number } | null = null;
  if (allTodayLogs.length > 0 && latestMorningWeight) {
    const morningLog = allTodayLogs.find(l => l.type === 'morning' || l.type === 'weigh-in');
    const morningW = morningLog?.weight || latestMorningWeight;
    const latestW = allTodayLogs[0].weight;
    const lostSoFar = Math.max(0, morningW - latestW);
    const isLoadingToday = daysRemaining >= lastLoadingDay;
    const expectedTotal = isLoadingToday
      ? (dailyAvgLoss || 0)
      : (Math.max(0, avgOvernightDrift || 0) + Math.max(0, avgPracticeLoss || 0));
    const pctComplete = expectedTotal > 0 ? Math.min(100, Math.round((lostSoFar / expectedTotal) * 100)) : 0;
    todayProgress = { lostSoFar, expectedTotal, pctComplete };
  }

  // Logging streak
  let loggingStreak = 0;
  {
    const todayDate = startOfDay(profile.simulatedDate || new Date());
    for (let d = 0; d < 60; d++) {
      const checkDate = new Date(todayDate);
      checkDate.setDate(todayDate.getDate() - d);
      const hasLog = logs.some(l => {
        const ld = startOfDay(new Date(l.date));
        return ld.getTime() === checkDate.getTime();
      });
      if (hasLog) loggingStreak++;
      else break;
    }
  }
  const isCompetitionDayForCore = daysRemaining === 0 || !!officialWeighInLog;
  const todayTrack = input.getDailyTracking(todayStr);
  const isRestDay = todayTrack.noPractice ?? false;
  const isSpar = profile.protocol === '5' || profile.protocol === '6';
  const hasPracticeLogs = allTodayLogs.some(l => l.type === 'pre-practice' || l.type === 'post-practice');
  const shouldCountPractice = isSpar
    ? (profile.trackPracticeWeighIns && !isRestDay) || hasPracticeLogs
    : (!isRestDay || hasPracticeLogs);
  const todayCoreTypes = isCompetitionDayForCore
    ? ['morning', 'weigh-in', 'before-bed']
    : shouldCountPractice
      ? ['morning', 'pre-practice', 'post-practice', 'before-bed']
      : ['morning', 'before-bed'];
  const todayCoreLogged = todayCoreTypes
    .filter(t => allTodayLogs.some(l => l.type === t || (t === 'morning' && l.type === 'weigh-in'))).length;
  const todayCoreTotal = todayCoreTypes.length;

  // Week-over-week comparison
  let weekOverWeek: { thisWeekAvgDrift: number | null; lastWeekAvgDrift: number | null; thisWeekAvgPractice: number | null; lastWeekAvgPractice: number | null } | null = null;
  {
    const todayDate = startOfDay(profile.simulatedDate || new Date());
    const dayOfWeek = todayDate.getDay();
    const thisWeekStart = new Date(todayDate);
    thisWeekStart.setDate(todayDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);

    const isInRange = (date: Date, start: Date, end: Date) => {
      const d = startOfDay(new Date(date));
      return d >= start && d < end;
    };

    const thisWeekDrifts: number[] = [];
    const lastWeekDrifts: number[] = [];
    const thisWeekPractice: number[] = [];
    const lastWeekPractice: number[] = [];

    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const current = sortedLogs[i];
      const prev = sortedLogs[i + 1];
      if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
        const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 4 && hoursDiff < 16) {
          const drift = prev.weight - current.weight;
          if (isInRange(current.date, thisWeekStart, new Date(todayDate.getTime() + 86400000))) {
            thisWeekDrifts.push(drift);
          } else if (isInRange(current.date, lastWeekStart, lastWeekEnd)) {
            lastWeekDrifts.push(drift);
          }
        }
      }
      if (current.type === 'post-practice' && prev.type === 'pre-practice') {
        const hoursDiff = (current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff < 6) {
          const loss = prev.weight - current.weight;
          if (isInRange(current.date, thisWeekStart, new Date(todayDate.getTime() + 86400000))) {
            thisWeekPractice.push(loss);
          } else if (isInRange(current.date, lastWeekStart, lastWeekEnd)) {
            lastWeekPractice.push(loss);
          }
        }
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    weekOverWeek = {
      thisWeekAvgDrift: avg(thisWeekDrifts),
      lastWeekAvgDrift: avg(lastWeekDrifts),
      thisWeekAvgPractice: avg(thisWeekPractice),
      lastWeekAvgPractice: avg(lastWeekPractice),
    };
  }

  // Cycle weigh-ins for velocity sparkline
  const weekWeighIns: Array<{ day: string; weight: number; type: string }> = [];
  {
    for (let i = 0; i < cycleDays; i++) {
      const checkDate = new Date(cycleStart);
      checkDate.setDate(cycleStart.getDate() + i);
      if (checkDate > today) break;

      const dayLogs = logs.filter(l => {
        const ld = startOfDay(new Date(l.date));
        return ld.getTime() === checkDate.getTime();
      }).sort((a, b) => {
        const typePriority = (t: string) => t === 'weigh-in' ? 0 : t === 'morning' ? 0 : t === 'pre-practice' ? 1 : 2;
        const pa = typePriority(a.type), pb = typePriority(b.type);
        return pa !== pb ? pa - pb : new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      if (dayLogs.length > 0) {
        const daysOut = differenceInDays(weighInDateStart, checkDate);
        weekWeighIns.push({
          day: daysOut > 0 ? `${daysOut}d` : daysOut === 0 ? 'WI' : 'R',
          weight: dayLogs[0].weight,
          type: dayLogs[0].type,
        });
      }
    }
  }

  // Personal records
  const personalRecords = {
    bestDrift: allDrifts.length > 0 ? Math.max(...allDrifts) : null,
    bestPracticeLoss: practiceLosses.length > 0 ? Math.max(...practiceLosses) : null,
    bestDriftRate: driftRates.length > 0 ? Math.max(...driftRates) : null,
    bestSweatRate: practiceSweatRates.length > 0 ? Math.max(...practiceSweatRates) : null,
    totalLostThisWeek: weekWeighIns.length >= 2
      ? weekWeighIns[0].weight - weekWeighIns[weekWeighIns.length - 1].weight
      : null,
  };

  // Time-to-target countdown
  let timeToTarget: { etaHours: number | null; etaTime: string | null; lbsRemaining: number; ratePerHour: number | null } | null = null;
  if (currentWeight && currentWeight > targetWeight) {
    const lbsRemaining = currentWeight - targetWeight;
    const driftRatePerHr = avgDriftRateOzPerHr;
    const remainingComp = todayRemainingComponents;

    if (driftRatePerHr && driftRatePerHr > 0) {
      const practiceRemaining = remainingComp ? remainingComp.practice : 0;
      const afterPractice = lbsRemaining - practiceRemaining;

      if (afterPractice <= 0) {
        timeToTarget = { etaHours: 0, etaTime: 'After practice', lbsRemaining, ratePerHour: driftRatePerHr };
      } else {
        const hoursNeeded = afterPractice / driftRatePerHr;
        const now = profile.simulatedDate || new Date();
        const etaDate = new Date(now.getTime() + hoursNeeded * 3600000);
        const hours = etaDate.getHours();
        const minutes = etaDate.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        const etaTime = `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;

        timeToTarget = { etaHours: hoursNeeded, etaTime, lbsRemaining, ratePerHour: driftRatePerHr };
      }
    } else {
      timeToTarget = { etaHours: null, etaTime: null, lbsRemaining, ratePerHour: null };
    }
  }

  // Historical fallback
  const cycleHasOwnDriftData = allDrifts.length > 0;
  const cycleHasOwnPracticeData = practiceLosses.length > 0;

  let historicalDrift: number | null = null;
  let historicalDriftRate: number | null = null;
  let historicalPracticeLoss: number | null = null;
  let historicalSweatRate: number | null = null;
  let historicalRecentDrifts: number[] = [];
  let historicalRecentPracticeLosses: number[] = [];
  let historicalRecentSweatRates: number[] = [];
  let historicalRecentDriftRates: number[] = [];
  let historicalRecentSleepHours: number[] = [];

  if (!cycleHasOwnDriftData || !cycleHasOwnPracticeData) {
    const allSortedLogs = [...logs].sort((a, b) => b.date.getTime() - a.date.getTime());
    const histDrifts: number[] = [];
    const histDriftRates: number[] = [];
    const histPracticeLosses: number[] = [];
    const histSweatRates: number[] = [];
    const histSleepHours: number[] = [];

    for (let i = 0; i < allSortedLogs.length - 1; i++) {
      const morning = allSortedLogs[i];
      const prev = allSortedLogs[i + 1];
      if ((morning.type === 'morning' || morning.type === 'weigh-in') &&
          (prev.type === 'before-bed' || prev.type === 'post-practice')) {
        // Same rules as this cycle's pairs: same time window and typo limits, gains count,
        // and the rate is per hour from the bed weight to the morning weight.
        const hoursDiff = (morning.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 4 && hoursDiff < 16) {
          const drift = prev.weight - morning.weight;
          if (drift >= -DRIFT_GAIN_LIMIT && drift <= DRIFT_LOSS_LIMIT) {
            histDrifts.push(drift);
            if (drift > 0 && prev.type === 'before-bed') {
              histDriftRates.push(drift / hoursDiff);
            }
          }
        }
      }
      if (histDrifts.length >= 10) break;
    }

    for (let i = 0; i < allSortedLogs.length - 1; i++) {
      const post = allSortedLogs[i];
      const pre = allSortedLogs[i + 1];
      if (post.type === 'post-practice' && pre.type === 'pre-practice') {
        const hoursDiff = (post.date.getTime() - pre.date.getTime()) / (1000 * 60 * 60);
        if (hoursDiff < 6) {
          const loss = pre.weight - post.weight;
          if (loss < -PRACTICE_GAIN_LIMIT || loss > PRACTICE_LOSS_LIMIT) continue;
          histPracticeLosses.push(loss);
          if (loss > 0) {
            const hrs = post.duration && post.duration > 0 ? post.duration / 60 : (hoursDiff >= 0.25 ? hoursDiff : null);
            if (hrs !== null && hrs > 0) {
              const rate = loss / hrs;
              if (rate <= 6) histSweatRates.push(rate);
            }
          }
        }
      }
      if (histPracticeLosses.length >= 10) break;
    }

    for (const log of allSortedLogs) {
      if (log.type === 'morning' && log.sleepHours && log.sleepHours > 0) {
        histSleepHours.push(log.sleepHours);
        if (histSleepHours.length >= 5) break;
      }
    }

    if (!cycleHasOwnDriftData && histDrifts.length > 0) {
      historicalDrift = computeEMA(histDrifts);
      historicalDriftRate = computeEMA(histDriftRates);
      historicalRecentDrifts = histDrifts.slice(0, 5);
      historicalRecentDriftRates = histDriftRates.slice(0, 5);
      historicalRecentSleepHours = histSleepHours;
    }
    if (!cycleHasOwnPracticeData && histPracticeLosses.length > 0) {
      historicalPracticeLoss = computeEMA(histPracticeLosses);
      historicalSweatRate = computeEMA(histSweatRates);
      historicalRecentPracticeLosses = histPracticeLosses.slice(0, 5);
      historicalRecentSweatRates = histSweatRates.slice(0, 5);
    }
  }

  return {
    startWeight,
    currentWeight,
    targetWeight,
    daysRemaining,
    totalLost,
    dailyAvgLoss,
    grossDailyLoss,
    avgOvernightDrift,
    avgDriftRateOzPerHr,
    avgLoadingDrift,
    avgCutDrift,
    avgPracticeLoss,
    avgSweatRateOzPerHr,
    daytimeBmrDrift,
    emaSleepHours,
    emaPracticeHours,
    todayRemainingComponents,
    projectedSaturday,
    pace,
    morningWeights,
    recentDrifts: allDrifts.length > 0 ? allDrifts.slice(0, 5) : historicalRecentDrifts,
    recentDriftRates: driftRates.length > 0 ? driftRates.slice(0, 5) : historicalRecentDriftRates,
    recentSleepHours: sleepHoursData.length > 0 ? sleepHoursData.slice(0, 5) : historicalRecentSleepHours,
    recentPracticeLosses: practiceLosses.length > 0 ? practiceLosses.slice(0, 5) : historicalRecentPracticeLosses,
    recentPracticeSweatRates: practiceSweatRates.length > 0 ? practiceSweatRates.slice(0, 5) : historicalRecentSweatRates,
    recentPracticeDurations: practiceDurations.slice(0, 5),
    trends,
    confidence,
    makeWeightProb,
    todayProgress,
    loggingStreak,
    todayCoreLogged,
    todayCoreTotal,
    weekOverWeek,
    weekWeighIns,
    personalRecords,
    timeToTarget,
    historicalDrift,
    historicalDriftRate,
    historicalPracticeLoss,
    historicalSweatRate,
    cycleHasOwnDriftData,
    cycleHasOwnPracticeData,
  };
}
