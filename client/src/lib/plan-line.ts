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

/** "6 days out", "3 days out · water load", or the stage alone on and after competition day. */
export function planTiming(daysUntil: number, stage?: string): string | null {
  if (stage === 'Competition Day') return 'Competition day';
  if (stage === 'Recovery') return 'Recovery';
  if (daysUntil < 0) return null;
  const out = daysUntil === 1 ? '1 day out' : `${daysUntil} days out`;
  return stage && stage !== 'Training' ? `${out} · ${stage.toLowerCase()}` : out;
}
