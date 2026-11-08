/**
 * TodayPlanView — draws a built Today's plan. No store access, so it can be
 * previewed with fixed data. The store wiring is in today-plan-card.tsx.
 *
 * Order: morning weight + class + days → one status line (+ reference) → next log →
 * weigh-in slots → 7-day morning weights → fuel → recovery → how sure is this.
 * Color: orange only on the primary button; status colors only as dots next to words;
 * blue only for fluids. Big numbers in Barlow Condensed.
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

export interface RecoveryLine {
  score: number;
  label: string;
  source: string;
  tone: RecoveryTone;
}

interface TodayPlanViewProps {
  plan: TodayPlan;
  onAction: () => void;
  trend?: WeightTrend;
  recovery?: RecoveryLine | null;
  onRecoveryTap?: () => void;
  /** Opens the full food log; the Fuel rows here are the summary. */
  onOpenFood?: () => void;
  /** The weigh-in slots (AM/PRE/POST/BED), drawn under the next log. */
  slots?: React.ReactNode;
}

export function TodayPlanView({ plan, onAction, trend, recovery, onRecoveryTap, onOpenFood, slots }: TodayPlanViewProps) {
  const [showConfidence, setShowConfidence] = useState(false);
  const hasAction = plan.next.kind !== 'none';

  return (
    <Card className="mb-3 overflow-hidden" data-testid="today-plan" aria-labelledby="today-plan-title">
      <CardContent className="p-0">
        {/* 1. Morning weight, class, days to weigh-in */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="today-plan-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Today</h2>
            {plan.demo && (
              <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-background" data-testid="today-plan-demo">
                Demo
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2" data-testid="today-plan-weight">
            {plan.hero ? (
              <>
                <span className="font-heading text-5xl font-bold leading-none tabular-nums">{plan.hero.weight.toFixed(1)}</span>
                <span className="text-sm font-semibold text-muted-foreground">lbs</span>
                <span className="text-sm text-muted-foreground">{plan.hero.timing}</span>
              </>
            ) : (
              <span className="font-heading text-3xl font-bold leading-none">No morning weight yet</span>
            )}
          </div>
          {plan.latest && (
            <p className="text-[15px] text-muted-foreground tabular-nums" data-testid="today-plan-latest">
              Latest {plan.latest.weight.toFixed(1)} · {plan.latest.timing}
            </p>
          )}
          {plan.facts.length > 0 && (
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5" data-testid="today-plan-facts">
              {plan.facts.map(f => (
                <div key={f.label} className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="text-sm font-bold tabular-nums">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* 2. One status line, then the automatic reference (never judged against) */}
          <p className="mt-2 text-sm leading-snug" data-testid="today-plan-status">
            <span className="mr-1.5 inline-flex items-center gap-1.5 font-bold">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_DOT[plan.status])} aria-hidden="true" />
              {plan.headline}.
            </span>
            <span className="text-muted-foreground">{plan.reason}</span>
          </p>
          {plan.reference && (
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums" data-testid="today-plan-reference">{plan.reference}</p>
          )}
        </div>

        {/* 3. Next log, named */}
        <div className="px-4 pt-3 pb-3">
          {hasAction ? (
            <>
              <Button onClick={onAction} className="h-11 w-full text-sm font-bold" data-testid="today-plan-action">
                {plan.next.title}
              </Button>
              <p className="mt-1 text-center text-xs text-muted-foreground">{plan.next.when}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground"><span className="font-bold text-foreground">{plan.next.title}.</span> {plan.next.when}</p>
          )}
        </div>

        {/* Weigh-in slots */}
        {slots && <div className="border-t border-muted px-2 py-2">{slots}</div>}

        {/* 4. Morning weights */}
        {trend && <TrendSection trend={trend} />}

        {/* 5. Fuel summary; full detail is the food log */}
        <div className="border-t border-muted px-4 py-3">
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
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {plan.food.map(l => <FuelBar key={l.key} line={l} />)}
            {plan.fluid && <FuelBar line={plan.fluid} fluid />}
          </div>
        </div>

        {/* 6. Recovery as context: colored dot, plain text */}
        {recovery && (
          <button
            type="button"
            onClick={onRecoveryTap}
            className="flex min-h-11 w-full items-center gap-2 border-t border-muted px-4 py-2 text-left"
            aria-label={`Recovery ${recovery.score}%, ${recovery.label}, ${recovery.source}. Show factors`}
            data-testid="today-plan-recovery"
          >
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", RECOVERY_DOT[recovery.tone])} aria-hidden="true" />
            <span className="text-sm">
              <span className="font-bold tabular-nums">{recovery.score}%</span>
              <span className="text-muted-foreground"> · {recovery.label} · {recovery.source}</span>
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        )}

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
  );
}

// ── Morning weights: chart from 3 days, a short list before that ─────────────

function TrendSection({ trend }: { trend: WeightTrend }) {
  const label = (p: { day: number }) => trend.days[p.day].isToday ? 'Today' : trend.days[p.day].label;
  return (
    <div className="border-t border-muted px-4 py-3" data-testid="today-plan-trend">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Morning weights · lbs</span>
        {trend.approvedTarget == null && trend.enoughForChart && <span className="text-xs text-muted-foreground">No target set</span>}
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
    </div>
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
        <div className="flex w-9 shrink-0 flex-col justify-between py-1 text-right text-xs tabular-nums text-muted-foreground" aria-hidden="true">
          <span>{trend.max.toFixed(0)}</span>
          <span>{trend.min.toFixed(0)}</span>
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
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full", fluid ? "bg-chart-2" : "bg-foreground")} style={{ width: `${pct}%` }} />
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
