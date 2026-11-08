/**
 * TodayPlanView — draws a built Today's plan. No store access, so it can be
 * previewed with fixed data. The store wiring is in today-plan-card.tsx.
 *
 * Layout (Kevin's pick: mockup 2 + colored weigh-in slots), top to bottom:
 *  1. Headline: morning weight left, orange days to weigh-in right.
 *  2. AM / PRE / POST / BED slots.
 *  3. One honest status line (+ automatic reference), then the one named button.
 *  4. Morning weights trend card.
 *  5. Recovery and Sleep tiles.
 *  6. Fuel card.
 * Status colors appear only as dots next to words; blue only for fluids.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanLine, PlanStatus, TodayPlan } from "@/lib/today-plan";
import type { WeightTrend } from "@/lib/today-trend";
import type { RecoveryTone } from "@/lib/recovery-zone";

const STATUS_DOT: Record<PlanStatus, string> = {
  'on-track': 'bg-chart-5',
  'no-target': 'border-2 border-muted-foreground bg-transparent',
  'data-check': 'bg-chart-3',
  'coach': 'bg-chart-4',
};

const RECOVERY_DOT: Record<RecoveryTone, string> = {
  good: 'bg-chart-5',
  watch: 'bg-chart-3',
  low: 'bg-chart-4',
};

export interface HealthTiles {
  recovery: { score: number; word: string; tone: RecoveryTone } | null;
  sleepHours: number | null;
  /** "WHOOP", "Band", "Apple Health", "Manual". */
  source: string;
}

interface TodayPlanViewProps {
  plan: TodayPlan;
  onAction: () => void;
  trend?: WeightTrend;
  /** Null when there's no recovery or sleep data today. */
  health?: HealthTiles | null;
  onHealthTap?: (metric: 'recovery' | 'sleep') => void;
  /** Shown when there's no data: opens Settings → Health to connect WHOOP. */
  onConnectHealth?: () => void;
  /** Opens the full food log; the Fuel rows here are the summary. */
  onOpenFood?: () => void;
  /** The weigh-in slots (AM/PRE/POST/BED). */
  slots?: React.ReactNode;
}

export function TodayPlanView({ plan, onAction, trend, health, onHealthTap, onConnectHealth, onOpenFood, slots }: TodayPlanViewProps) {
  const [showConfidence, setShowConfidence] = useState(false);
  const hasAction = plan.next.kind !== 'none';
  const cd = plan.countdown;

  return (
    <div className="mb-3 space-y-3" data-testid="today-plan">
      <Card className="overflow-hidden" aria-labelledby="today-plan-title">
        <CardContent className="p-0">
          {/* 1. Headline: weight left, days to weigh-in right */}
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="today-plan-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Today</h2>
              {plan.demo && (
                <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-background" data-testid="today-plan-demo">
                  Demo
                </span>
              )}
            </div>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1" data-testid="today-plan-weight">
                {plan.hero ? (
                  <>
                    <div className="font-heading text-5xl font-bold leading-none tabular-nums">{plan.hero.weight.toFixed(1)}</div>
                    <div className="mt-1 text-sm text-muted-foreground">lbs · {plan.hero.timing.toLowerCase()}</div>
                  </>
                ) : (
                  <>
                    <div className="font-heading text-3xl font-bold leading-none">No morning weight</div>
                    <div className="mt-1 text-sm text-muted-foreground">Log it to compare</div>
                  </>
                )}
                {plan.latest && (
                  <div className="whitespace-nowrap text-[15px] text-muted-foreground tabular-nums" data-testid="today-plan-latest">
                    Latest {plan.latest.weight.toFixed(1)} · {plan.latest.timing}
                  </div>
                )}
              </div>
              {cd && (
                <div className="shrink-0 text-right" data-testid="today-plan-countdown">
                  {cd.days === null ? (
                    <>
                      <div className="font-heading text-3xl font-bold leading-none text-muted-foreground">—</div>
                      <div className="mt-1 text-xs text-muted-foreground">No weigh-in set</div>
                    </>
                  ) : cd.days === 0 ? (
                    <>
                      <div className="font-heading text-5xl font-bold uppercase leading-none text-primary">Today</div>
                      <div className="mt-1 text-xs leading-tight text-muted-foreground">official weigh-in<br />{cd.weightClass} lbs class</div>
                    </>
                  ) : (
                    <>
                      <div className="font-heading text-5xl font-bold leading-none tabular-nums text-primary">{cd.days}</div>
                      <div className="mt-1 text-xs leading-tight text-muted-foreground">{cd.days === 1 ? 'day' : 'days'} to weigh-in<br />{cd.weightClass} lbs class</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 2. Weigh-in slots */}
          {slots && <div className="px-2 pt-3">{slots}</div>}

          {/* 3. One status line, the automatic reference, then the one named button */}
          <div className="px-4 pt-2 pb-3">
            <p className="text-sm leading-snug" data-testid="today-plan-status">
              <span className="mr-1.5 inline-flex items-center gap-1.5 font-bold">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_DOT[plan.status])} aria-hidden="true" />
                {plan.headline}.
              </span>
              <span className="text-muted-foreground">{plan.reason}</span>
            </p>
            {plan.reference && (
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums" data-testid="today-plan-reference">{plan.reference}</p>
            )}
            {hasAction ? (
              <>
                <Button onClick={onAction} className="mt-3 h-11 w-full text-sm font-bold" data-testid="today-plan-action">
                  {plan.next.title}
                </Button>
                <p className="mt-1 text-center text-xs text-muted-foreground">{plan.next.when}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground"><span className="font-bold text-foreground">{plan.next.title}.</span> {plan.next.when}</p>
            )}
          </div>

          {/* How sure is this */}
          <div className="border-t border-muted">
            <button
              type="button"
              onClick={() => setShowConfidence(v => !v)}
              aria-expanded={showConfidence}
              aria-controls="today-plan-confidence"
              className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left"
            >
              {showConfidence ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">How sure is this?</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {plan.measured.length} measured · {plan.estimated.length} estimated · {plan.missing.length} missing
                </span>
              </span>
            </button>
            {showConfidence && (
              <div id="today-plan-confidence" className="grid grid-cols-1 gap-3 px-4 pb-3 sm:grid-cols-3">
                <ConfidenceList title="Measured" items={plan.measured} empty="Nothing measured yet today" />
                <ConfidenceList title="Estimated" items={plan.estimated} empty="Nothing estimated" />
                <ConfidenceList title="Missing" items={plan.missing} empty="Nothing missing" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4. Trend */}
      {trend && <TrendCard trend={trend} />}

      {/* 5. Recovery and Sleep */}
      {health ? (
        <div className="grid grid-cols-2 gap-3" data-testid="today-plan-health">
          <HealthTile
            title="Recovery"
            onTap={health.recovery ? () => onHealthTap?.('recovery') : undefined}
            value={health.recovery ? `${health.recovery.score}%` : '—'}
            detail={health.recovery ? (
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", RECOVERY_DOT[health.recovery.tone])} aria-hidden="true" />
                <span className="font-semibold text-foreground">{health.recovery.word}</span>
              </span>
            ) : 'No score today'}
            source={health.source}
          />
          <HealthTile
            title="Sleep"
            onTap={health.sleepHours != null ? () => onHealthTap?.('sleep') : undefined}
            value={health.sleepHours != null ? health.sleepHours.toFixed(1) : '—'}
            unit={health.sleepHours != null ? 'h' : undefined}
            detail={health.sleepHours != null ? 'Last night' : 'No sleep today'}
            source={health.source}
          />
        </div>
      ) : onConnectHealth ? (
        <button
          type="button"
          onClick={onConnectHealth}
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-dashed border-muted-foreground px-4 py-3 text-left"
          data-testid="today-plan-connect"
        >
          <span className="text-sm">
            <span className="font-bold">Recovery and sleep</span>
            <span className="text-muted-foreground"> · Connect WHOOP or Apple Health</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : null}

      {/* 6. Fuel */}
      <Card>
        <CardContent className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fuel today</span>
            {onOpenFood && (
              <button type="button" onClick={onOpenFood} className="-my-3 inline-flex min-h-11 items-center gap-0.5 text-xs font-bold text-foreground underline-offset-2 hover:underline">
                Food log <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          {plan.foodWarning && (
            <p role="alert" className="mb-2 rounded-lg border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-xs font-semibold">
              {plan.foodWarning}
            </p>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {plan.food.map(l => <FuelBar key={l.key} line={l} />)}
            {plan.fluid && <FuelBar line={plan.fluid} fluid />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Recovery / Sleep tile ────────────────────────────────────────────────────

function HealthTile({ title, value, unit, detail, source, onTap }: {
  title: string; value: string; unit?: string; detail: React.ReactNode; source: string; onTap?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</span>
        {onTap && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-heading text-3xl font-bold leading-none tabular-nums">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      <div className="text-xs text-muted-foreground">{source}</div>
    </>
  );
  const cls = "rounded-lg border bg-card px-3 py-3 text-left";
  return onTap
    ? <button type="button" onClick={onTap} className={cn(cls, "min-h-11 w-full")} aria-label={`${title}: ${value}${unit ?? ''}. Show factors`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

// ── Morning weights: chart from 3 days, a short list before that ─────────────

function TrendCard({ trend }: { trend: WeightTrend }) {
  const label = (p: { day: number }) => trend.days[p.day].isToday ? 'Today' : trend.days[p.day].label;
  return (
    <Card data-testid="today-plan-trend">
      <CardContent className="px-4 py-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Morning weights · lbs</span>
          {trend.approvedTarget == null && <span className="text-xs text-muted-foreground">No target set</span>}
        </div>
        {trend.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">No morning weights in the last 7 days.</p>
        ) : !trend.enoughForChart ? (
          <div data-testid="today-plan-trend-list">
            <p className="text-sm tabular-nums">
              {trend.points.map((p, i) => (
                <span key={p.day}>
                  {i > 0 && <span className="text-muted-foreground"> · </span>}
                  <span className="text-muted-foreground">{label(p)}</span> <span className="font-bold">{p.weight.toFixed(1)}</span>
                  {p.timing === 'weigh-in' && <span className="text-muted-foreground"> (official)</span>}
                </span>
              ))}
            </p>
            <p className="text-xs text-muted-foreground">The 7-day chart starts after 3 days of morning weights.</p>
          </div>
        ) : (
          <TrendChart trend={trend} />
        )}
      </CardContent>
    </Card>
  );
}

function TrendChart({ trend }: { trend: WeightTrend }) {
  const W = 320, H = 110, padX = 14, padTop = 8, padBottom = 8;
  const x = (day: number) => padX + (day * (W - padX * 2)) / 6;
  const y = (w: number) => padTop + ((trend.max - w) / (trend.max - trend.min || 1)) * (H - padTop - padBottom);
  const path = trend.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const hasOfficial = trend.points.some(p => p.timing === 'weigh-in');

  return (
    <>
      <div className="flex gap-2">
        <div className="flex w-10 shrink-0 flex-col justify-between py-1 text-right text-xs tabular-nums text-muted-foreground" aria-hidden="true">
          <span>{trend.max.toFixed(1)}</span>
          <span>{trend.min.toFixed(1)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[110px] w-full" role="img"
            aria-label={`Morning weights: ${trend.points.map(p => `${trend.days[p.day].label} ${p.weight.toFixed(1)} lbs`).join(', ')}`}>
            {trend.days.map((d, i) => (
              <line key={d.key} x1={x(i)} x2={x(i)} y1={padTop} y2={H - padBottom}
                stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray={d.isToday ? undefined : '2 4'} />
            ))}
            {trend.approvedTarget != null && (
              <line x1={padX} x2={W - padX} y1={y(trend.approvedTarget)} y2={y(trend.approvedTarget)}
                stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 4" />
            )}
            <path d={path} fill="none" stroke="hsl(var(--foreground))" strokeWidth={2} />
            {trend.points.map(p => p.timing === 'weigh-in'
              ? <rect key={p.day} x={x(p.day) - 4} y={y(p.weight) - 4} width={8} height={8} fill="hsl(var(--foreground))" />
              : <circle key={p.day} cx={x(p.day)} cy={y(p.weight)} r={4} fill="hsl(var(--foreground))" />)}
          </svg>
          <div className="flex justify-between px-1 text-xs text-muted-foreground" aria-hidden="true">
            {trend.days.map(d => <span key={d.key} className={cn(d.isToday && "font-bold text-foreground")}>{d.label}</span>)}
          </div>
        </div>
      </div>
      {hasOfficial && <p className="mt-1 text-xs text-muted-foreground">Square: official weigh-in</p>}
    </>
  );
}

// ── Fuel bars ────────────────────────────────────────────────────────────────

function FuelBar({ line, fluid = false }: { line: PlanLine; fluid?: boolean }) {
  const m = /^([\d.]+) of ([\d.]+)/.exec(line.progress);
  const pct = m ? Math.min(100, (Number(m[1]) / Math.max(Number(m[2]), 1e-9)) * 100) : 0;
  const blocked = line.progress === 'None today';
  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{line.label}</span>
        <span className="flex-1 text-xs text-muted-foreground tabular-nums">{line.progress}</span>
        <span className={cn("text-xs font-bold tabular-nums", line.done ? "text-muted-foreground" : "text-foreground")}>{line.remaining}</span>
      </div>
      {!blocked && m && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full", fluid ? "bg-chart-2" : "bg-primary")} style={{ width: `${Math.max(pct, 0)}%` }} />
        </div>
      )}
    </div>
  );
}

function ConfidenceList({ title, items, empty }: { title: string; items: { label: string; detail: string }[]; empty: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map(i => (
            <li key={i.label} className="text-xs leading-snug">
              <span className="font-semibold text-foreground">{i.label}:</span>{' '}
              <span className="text-muted-foreground">{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
