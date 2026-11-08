import { describe, it, expect } from "vitest";
import { buildTodayPlan, type TodayPlanInput } from "../today-plan";

const base = (over: Partial<TodayPlanInput> = {}): TodayPlanInput => ({
  hour: 9,
  protocol: "3",
  isGeneralNutrition: false,
  weighInCleared: false,
  daysUntilWeighIn: 4,
  weighInTime: "07:00",
  weightClass: 141,
  profileWeight: 146,
  todayTarget: 146,
  weightLevel: "on-track",
  isRestDay: false,
  trackPracticeWeighIns: false,
  logs: { morning: 145.4 },
  nutritionMode: "spar",
  macros: { carbs: { min: 150, max: 200 }, protein: { min: 100, max: 120 } },
  slices: { protein: 5, carb: 6, veg: 4, fruit: 2, fat: 3 },
  hydration: { targetOz: 128, type: "Regular" },
  tracking: {
    waterConsumed: 40, carbsConsumed: 0, proteinConsumed: 0,
    proteinSlices: 2, carbSlices: 3, vegSlices: 1, fruitSlices: 0, fatSlices: 1, foodLogCount: 4,
  },
  hasRecoveryData: false,
  ...over,
});

const labels = (items: { label: string }[]) => items.map(i => i.label);

describe("Today's plan: status", () => {
  it("says stick with the plan when the morning weight is at today's target", () => {
    const p = buildTodayPlan(base());
    expect(p.status).toBe("on-track");
    expect(p.headline).toBe("Stick with your plan");
    expect(p.reason).toContain("Nothing needs changing");
    expect(p.reason).toContain("145.4 lbs");
  });

  it("stays on track a little over target, and says by how much", () => {
    const p = buildTodayPlan(base({ logs: { morning: 147.2 }, weightLevel: "borderline" }));
    expect(p.status).toBe("on-track");
    expect(p.reason).toContain("1.2 lbs above today's target of 146.0 lbs");
  });

  it("asks for a data check when the morning weight is missing", () => {
    const p = buildTodayPlan(base({ logs: {} }));
    expect(p.status).toBe("data-check");
    expect(p.headline).toBe("No morning weight yet");
  });

  it("asks for a data check when no official weigh-in is set", () => {
    const p = buildTodayPlan(base({ weighInCleared: true, daysUntilWeighIn: 999 }));
    expect(p.status).toBe("data-check");
    expect(p.headline).toBe("No official weigh-in set");
    expect(p.next.kind).toBe("set-weigh-in");
  });

  it("asks for a data check when the last weigh-in has passed", () => {
    const p = buildTodayPlan(base({ daysUntilWeighIn: -1 }));
    expect(p.status).toBe("data-check");
    expect(p.next.kind).toBe("set-weigh-in");
  });

  it("sends the athlete to the coach when the measured weight is far over", () => {
    const p = buildTodayPlan(base({ logs: { morning: 150.5 }, weightLevel: "risk" }));
    expect(p.status).toBe("coach");
    expect(p.reason).toContain("4.5 lbs above today's target");
  });

  it("sends the athlete to the coach when food was cut for weight, and keeps the store's warning word for word", () => {
    const warning = "12.0 lbs over with 1 day left. Do not eat — any food adds weight. Focus entirely on extra workouts and water cut.";
    const p = buildTodayPlan(base({
      daysUntilWeighIn: 1,
      macros: { carbs: { min: 0, max: 0 }, protein: { min: 0, max: 0 }, weightWarning: warning },
    }));
    expect(p.status).toBe("coach");
    expect(p.foodWarning).toBe(warning);
    // Food lines show "None today", never a new number.
    expect(p.food.every(l => l.progress === "None today" || l.key === "fruit" || l.key === "fat")).toBe(true);
  });

  it("never uses the projection: a borderline level with weight on target is still on track", () => {
    const p = buildTodayPlan(base({ weightLevel: "borderline" }));
    expect(p.status).toBe("on-track");
  });

  it("general nutrition with a morning weight is on track, with no weigh-in talk", () => {
    const p = buildTodayPlan(base({ protocol: "5", isGeneralNutrition: true, weighInCleared: true }));
    expect(p.status).toBe("on-track");
    expect(labels(p.missing)).not.toContain("Official weigh-in date");
    expect(labels(p.estimated)).not.toContain("Cut Lab projections");
  });
});

describe("Today's plan: Meet Day", () => {
  const meet = (over: Partial<TodayPlanInput> = {}) => base({ daysUntilWeighIn: 0, logs: {}, ...over });

  it("asks for the official weigh-in first, with the weigh-in time", () => {
    const p = buildTodayPlan(meet());
    expect(p.next.kind).toBe("log-official");
    expect(p.next.when).toContain("7:00 AM");
    expect(p.status).toBe("data-check");
    expect(labels(p.missing)).toContain("Official weigh-in");
    expect(labels(p.missing)).toContain("Morning weight");
  });

  it("made weight: on track and points to recovery", () => {
    const p = buildTodayPlan(meet({ logs: { officialWeighIn: 140.8 } }));
    expect(p.status).toBe("on-track");
    expect(p.headline).toBe("Made weight");
    expect(p.next.kind).toBe("recovery");
    expect(labels(p.measured)).toContain("Official weigh-in");
    expect(labels(p.missing)).not.toContain("Morning weight");
  });

  it("over the class at the official weigh-in: talk to your coach", () => {
    const p = buildTodayPlan(meet({ logs: { officialWeighIn: 141.6 } }));
    expect(p.status).toBe("coach");
    expect(p.reason).toContain("0.6 lbs over 141");
  });
});

describe("Today's plan: next action", () => {
  it("morning weight first", () => {
    expect(buildTodayPlan(base({ logs: {} })).next).toMatchObject({ kind: "log-morning", logType: "morning" });
  });

  it("then pre- and post-practice on a practice day", () => {
    expect(buildTodayPlan(base()).next.kind).toBe("log-pre-practice");
    expect(buildTodayPlan(base({ logs: { morning: 145, prePractice: 146 } })).next.kind).toBe("log-post-practice");
  });

  it("skips practice weigh-ins on a rest day", () => {
    expect(buildTodayPlan(base({ isRestDay: true })).next.kind).toBe("log-before-bed");
  });

  it("asks for food when nothing is logged during the day", () => {
    const p = buildTodayPlan(base({ isRestDay: true, tracking: { ...base().tracking, foodLogCount: 0 } }));
    expect(p.next.kind).toBe("log-food");
  });

  it("does not ask for food when the plan allows none", () => {
    const p = buildTodayPlan(base({
      isRestDay: true,
      macros: { carbs: { min: 0, max: 0 }, protein: { min: 0, max: 0 }, weightWarning: "Do not eat." },
      tracking: { ...base().tracking, foodLogCount: 0 },
    }));
    expect(p.next.kind).toBe("log-before-bed");
  });

  it("in the evening goes straight to the before-bed weigh-in", () => {
    expect(buildTodayPlan(base({ hour: 21 })).next.kind).toBe("log-before-bed");
  });

  it("says all weigh-ins are in when they are", () => {
    const p = buildTodayPlan(base({ logs: { morning: 145, prePractice: 146, postPractice: 143.5, beforeBed: 145.8 } }));
    expect(p.next.kind).toBe("none");
  });
});

describe("Today's plan: targets and confidence", () => {
  it("shows what remains in slices and fluids", () => {
    const p = buildTodayPlan(base());
    const protein = p.food.find(l => l.key === "protein")!;
    expect(protein.progress).toBe("2 of 5 palms");
    expect(protein.remaining).toBe("3 left");
    expect(p.fluid).toMatchObject({ progress: "40 of 128 oz", remaining: "88 left", done: false });
  });

  it("shows grams in sugar mode", () => {
    const p = buildTodayPlan(base({ nutritionMode: "sugar", tracking: { ...base().tracking, carbsConsumed: 80, proteinConsumed: 120 } }));
    expect(p.food.map(l => l.key)).toEqual(["carb", "protein"]);
    expect(p.food[0].progress).toBe("80 of 200 g");
    expect(p.food[1].remaining).toBe("Done");
  });

  it("notes sips only", () => {
    const p = buildTodayPlan(base({ hydration: { targetOz: 16, type: "Sip Only" }, tracking: { ...base().tracking, waterConsumed: 4 } }));
    expect(p.fluid!.remaining).toBe("12 left, sips only");
  });

  it("splits measured, estimated and missing", () => {
    const p = buildTodayPlan(base({ tracking: { ...base().tracking, waterConsumed: 0 } }));
    expect(labels(p.measured)).toEqual(["Morning weight", "Food"]);
    expect(labels(p.estimated)).toEqual(["Food and fluid targets", "Today's target weight", "Cut Lab projections"]);
    expect(labels(p.missing)).toEqual(["Fluids", "Recovery"]);
  });

  it("counts recovery as measured when synced", () => {
    const p = buildTodayPlan(base({ hasRecoveryData: true }));
    expect(labels(p.measured)).toContain("Recovery");
    expect(labels(p.missing)).not.toContain("Recovery");
  });

  it("lists the weigh-in date as missing when none is set", () => {
    const p = buildTodayPlan(base({ weighInCleared: true, daysUntilWeighIn: 999 }));
    expect(labels(p.missing)).toContain("Official weigh-in date");
    expect(labels(p.estimated)).not.toContain("Today's target weight");
  });
});
