import { WEIGHT_TARGET_BY_DAYS_OUT } from "@/lib/constants";

/** Plain wording for the plan and timing line above the Today card. */
const PLAN_EXPLANATIONS: Record<string, string> = {
  '1': "A preseason fat-loss block for athletes over 12% body fat, only with your coach's OK. Your food follows the Sugar System.",
  '2': "For athletes 7% or more over class in season. Your food follows the Sugar System, and water loading is optional.",
  '3': "You're at walk-around weight and holding there. Your food still follows the Sugar System, and you still make weight each week.",
  '4': "For the off-season or moving up a class. Higher carbs and protein to build strength.",
  '6': "Simple as Pie portions while you make a weight. Targets adjust as weigh-in gets closer, and water loading is optional.",
};

export function planExplanation(protocol: string): string | null {
  return PLAN_EXPLANATIONS[protocol] ?? null;
}

/** The stage of the week. */
export function planStage(stage?: string): string | null {
  if (!stage) return null;
  return stage.charAt(0) + stage.slice(1).toLowerCase();
}

export interface StageContext {
  protocol: string;
  weightClass: number;
  currentWeight: number;
  /** Today's water from the plan, e.g. "1.75 gal" */
  waterAmount: string;
}

/** The app rates up to 2 lbs over walk-around as holding. */
const WALK_AROUND_HOLDING_LBS = 2;

/** What a stage means, in Kevin's approved wording (2026-11-09). */
export function stageExplanation(stage: string | null, ctx: StageContext): string | null {
  switch (stage) {
    case 'Training': {
      if (ctx.protocol === '4') return null; // Gain isn't holding walk-around weight
      const walkAround = Math.round(ctx.weightClass * WEIGHT_TARGET_BY_DAYS_OUT[5]);
      if (ctx.currentWeight > walkAround + WALK_AROUND_HOLDING_LBS) {
        return `Weigh-in is more than 5 days away. You're above your walk-around weight, so work back down to about ${walkAround} before weigh-in week.`;
      }
      return `Weigh-in is more than 5 days away. Train and stay near your walk-around weight, about ${walkAround} for ${ctx.weightClass}. Weigh-in prep starts 5 days out.`;
    }
    case 'Water load':
      return `You're drinking extra water on purpose before weigh-in. Today: ${ctx.waterAmount}. This is optional, and you can turn it off in Settings.`;
    case 'High water':
      return `Another high-water day. Today: ${ctx.waterAmount}.`;
    case 'Water cut':
      return `The day before weigh-in. Stick to today's water amount: ${ctx.waterAmount}.`;
    case 'Comp week':
      return 'Weigh-in week with no water loading. Keep your water normal.';
    case 'Final prep':
      if (ctx.protocol === '4') return null; // Gain isn't cutting portions
      return 'Final days before weigh-in. Lighter portions, normal water.';
    case 'Competition day':
      return 'Weigh-in day. Follow your weigh-in and refueling plan.';
    case 'Recovery':
      return 'Weigh-in is done. Refuel and recover before the next training week.';
    default:
      return null;
  }
}

export interface StageIntro { stage: string; firstDay: string }

/** Whether to show a stage's sentence on its own: only on the first day of that stage. */
export function stageIntroFor(stored: StageIntro | null, stage: string, today: string): { show: boolean; stored: StageIntro } {
  if (!stored || stored.stage !== stage) return { show: true, stored: { stage, firstDay: today } };
  return { show: stored.firstDay === today, stored };
}
